import datetime

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from players.models import Player
from quiz import regeneration, services
from quiz.audit_auth import mint_token
from quiz.models import AnswerRecord, Attempt, DailyQuiz, Question, QuestionFlag


class GenerationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_countries')

    def test_generation_is_deterministic_for_a_date(self):
        d = datetime.date(2026, 6, 10)
        q1 = services.get_or_create_quiz(d)
        sig1 = [(q.type, q.payload, q.answer) for q in q1.questions.all()]
        # Re-generate a fresh quiz with the same seed.
        DailyQuiz.objects.all().delete()
        q2 = services.get_or_create_quiz(d)
        sig2 = [(q.type, q.payload, q.answer) for q in q2.questions.all()]
        self.assertEqual(sig1, sig2)

    def test_get_or_create_is_idempotent(self):
        d = datetime.date(2026, 6, 11)
        q = services.get_or_create_quiz(d)
        count = Question.objects.filter(quiz=q).count()
        q2 = services.get_or_create_quiz(d)
        self.assertEqual(q.id, q2.id)
        self.assertEqual(Question.objects.filter(quiz=q2).count(), count)

    def test_question_payload_has_no_answer(self):
        q = services.get_or_create_quiz(datetime.date(2026, 6, 12))
        for question in q.questions.all():
            # The correct set must never appear in the client-facing payload.
            self.assertNotIn('correct', str(question.payload))

    def test_no_country_is_the_subject_of_two_questions(self):
        # Regression: a daily quiz once asked "Name the Country" for Ivory Coast
        # twice. Each generator now excludes already-used subjects, so the subject
        # (the single-answer correct country) must be unique across a quiz.
        SINGLE_SUBJECT = {'name-country', 'identify-flag', 'capital', 'region-click'}
        for day in range(1, 13):
            d = datetime.date(2026, 7, day)
            DailyQuiz.objects.all().delete()
            quiz = services.get_or_create_quiz(d)
            subjects = []
            for q in quiz.questions.all():
                if q.type in SINGLE_SUBJECT:
                    correct = q.answer.get('correct', [])
                    self.assertEqual(len(correct), 1, q.type)
                    subjects.append(correct[0])
            self.assertEqual(
                len(subjects), len(set(subjects)),
                f'duplicate subject on {d}: {subjects}',
            )

    def test_type_sequence_honours_caps(self):
        import random

        from quiz.generation import _type_sequence
        # Many seeds so a careless draw would blow a cap on at least one.
        for seed in range(50):
            seq = _type_sequence(random.Random(seed), 10)
            self.assertLessEqual(seq.count('capital'), 1)
            self.assertLessEqual(seq.count('bordering'), 2)
            self.assertLessEqual(seq.count('landlocked'), 1)
            self.assertLessEqual(seq.count('coastline'), 1)


class BespokeGeneratorTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_countries')

    def _rng(self, seed=42):
        import random
        return random.Random(seed)

    def _pool(self):
        from quiz.generation.base import eligible_targets
        return eligible_targets()

    def test_bordering_answer_is_subset_of_grid(self):
        from quiz.generation.bespoke import gen_bordering
        spec = gen_bordering(self._rng(1), self._pool())
        self.assertEqual(spec['type'], 'bordering')
        grid_values = {o['value'] for o in spec['payload']['grid']['options']}
        correct = set(spec['answer']['correct'])
        self.assertTrue(correct, 'bordering question should have at least one answer')
        self.assertTrue(correct <= grid_values, 'all answers must appear in the grid')
        self.assertTrue(spec['payload']['grid']['multiSelect'])
        self.assertIn('map', spec['payload'])

    def test_bordering_chad_neighbours(self):
        # Force Chad as the only candidate to assert real adjacency data flows through.
        from quiz.generation.bespoke import gen_bordering
        from geo.models import Country
        chad = Country.objects.get(cca2='td')
        spec = gen_bordering(self._rng(2), [chad])
        correct = set(spec['answer']['correct'])
        # Chad borders Niger, Nigeria, Cameroon, CAR, Sudan, Libya.
        self.assertIn('Niger', correct)
        self.assertIn('Cameroon', correct)

    def test_bordering_options_exclude_islands(self):
        # Distractors are drawn from the nearest non-neighbours, but islands
        # (borders == []) can never be a correct "border" answer and must be
        # filtered out of the grid.
        from quiz.generation.bespoke import gen_bordering
        from geo.models import Country
        chad = Country.objects.get(cca2='td')
        spec = gen_bordering(self._rng(2), [chad])
        by_display = {c.display_name: c for c in Country.objects.all()}
        for opt in spec['payload']['grid']['options']:
            country = by_display[opt['value']]
            self.assertTrue(
                country.borders,
                f"island {opt['value']} should not appear as a border option",
            )

    def test_landlocked_answers_are_all_landlocked(self):
        from quiz.generation.bespoke import gen_landlocked
        from geo.models import Country
        spec = gen_landlocked(self._rng(3), self._pool())
        self.assertEqual(spec['type'], 'landlocked')
        self.assertNotIn('map', spec['payload'])  # text-only
        for name in spec['answer']['correct']:
            self.assertTrue(Country.objects.get(mesh_name=name).landlocked)
        # Grid must also contain non-answers (coastal countries).
        grid = {o['value'] for o in spec['payload']['grid']['options']}
        self.assertTrue(len(grid) > len(spec['answer']['correct']))

    def test_coastline_answers_are_all_coastal(self):
        from quiz.generation.bespoke import gen_coastline
        from geo.models import Country
        spec = gen_coastline(self._rng(7), self._pool())
        self.assertEqual(spec['type'], 'coastline')
        self.assertNotIn('map', spec['payload'])  # text-only
        for name in spec['answer']['correct']:
            self.assertFalse(Country.objects.get(mesh_name=name).landlocked)
        # Grid must also contain non-answers (landlocked distractors).
        grid = {o['value'] for o in spec['payload']['grid']['options']}
        self.assertTrue(len(grid) > len(spec['answer']['correct']))

    def test_region_click_target_in_clicktargets(self):
        from quiz.generation.bespoke import gen_region_click
        spec = gen_region_click(self._rng(4), self._pool())
        self.assertEqual(spec['type'], 'region-click')
        targets = set(spec['payload']['map']['clickTargets'])
        correct = spec['answer']['correct'][0]
        self.assertIn(correct, targets)
        self.assertEqual(spec['payload']['answer']['method'], 'map-click-single')

    def test_capital_self_evident_rule(self):
        from quiz.generation.base import capital_is_self_evident as se
        # Containment / equality (excluded).
        self.assertTrue(se('Mexico', 'Mexico City'))
        self.assertTrue(se('Tunisia', 'Tunis'))
        self.assertTrue(se('Monaco', 'Monaco'))
        self.assertTrue(se('São Tomé and Príncipe', 'São Tomé'))
        self.assertTrue(se('Guinea-Bissau', 'Bissau'))
        # Shared-root-but-not-containment pairs are NOT caught (documented limit).
        self.assertFalse(se('Brazil', 'Brasília'))
        self.assertFalse(se('Algeria', 'Algiers'))
        # Ordinary unrelated pairs.
        self.assertFalse(se('France', 'Paris'))

    def test_capital_target_is_never_self_evident(self):
        from quiz.generation.base import capital_is_self_evident
        from quiz.generation.core import gen_capital
        for seed in range(40):
            spec = gen_capital(self._rng(seed), self._pool())
            # The target is the country whose capital is the answer (forward) or
            # whose name is the answer (reverse); recover it from the prompt.
            self.assertEqual(spec['type'], 'capital')
            # Reconstruct (country, capital) from the graded answer + prompt.
            prompt = spec['prompt']
            if prompt.startswith('What is the capital of '):
                country = prompt[len('What is the capital of '):-1]
                capital = spec['answer']['correct'][0]
            else:  # "{capital} is the capital of which country?"
                capital = prompt.split(' is the capital of')[0]
                country = spec['answer']['correct'][0]
            self.assertFalse(
                capital_is_self_evident(country, capital),
                f'self-evident target leaked: {country} / {capital}',
            )

    def test_bespoke_types_registered(self):
        from quiz.generation import REGISTRY
        for key in ('bordering', 'landlocked', 'coastline', 'region-click'):
            self.assertIn(key, REGISTRY)


class GradingTests(TestCase):
    def _question(self, correct):
        quiz = DailyQuiz.objects.create(date=datetime.date(2026, 1, 1), seed=1)
        return Question.objects.create(
            quiz=quiz, index=0, type='landlocked',
            payload={'prompt': 'x'}, answer={'correct': correct},
        )

    def test_single_exact_match(self):
        q = self._question(['France'])
        ok, reveal = services.grade(q, 'France')
        self.assertTrue(ok)
        self.assertEqual(reveal['rightPicks'], ['France'])
        self.assertEqual(reveal['wrongPicks'], [])

    def test_single_wrong(self):
        q = self._question(['France'])
        ok, reveal = services.grade(q, 'Spain')
        self.assertFalse(ok)
        self.assertEqual(reveal['wrongPicks'], ['Spain'])
        self.assertEqual(reveal['missed'], ['France'])

    def test_multi_exact_match_required(self):
        q = self._question(['Chad', 'Mali', 'Niger'])
        ok, _ = services.grade(q, ['Chad', 'Mali', 'Niger'])
        self.assertTrue(ok)

    def test_multi_partial_is_incorrect(self):
        q = self._question(['Chad', 'Mali', 'Niger'])
        ok, reveal = services.grade(q, ['Chad', 'Mali'])
        self.assertFalse(ok)
        self.assertEqual(reveal['missed'], ['Niger'])
        self.assertEqual(reveal['rightPicks'], ['Chad', 'Mali'])

    def test_multi_extra_pick_is_incorrect(self):
        q = self._question(['Chad', 'Mali'])
        ok, reveal = services.grade(q, ['Chad', 'Mali', 'Libya'])
        self.assertFalse(ok)
        self.assertEqual(reveal['wrongPicks'], ['Libya'])


class TimingTests(TestCase):
    def test_clamp_band(self):
        self.assertEqual(services.clamp_ms(10), 250)          # below min
        self.assertEqual(services.clamp_ms(5000), 5000)       # within band
        self.assertEqual(services.clamp_ms(10 ** 9), 120000)  # above max


class ApiFlowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_countries')

    def setUp(self):
        self.client = APIClient()
        self.token = 'devtoken-abc'
        self.client.post('/api/players', {
            'deviceToken': self.token, 'nickname': 'Tester', 'country': 'gb',
        }, format='json')

    def _auth(self):
        return {'HTTP_X_DEVICE_TOKEN': self.token}

    def test_full_flow_and_one_attempt_per_day(self):
        start = self.client.post('/api/daily/today/start', **self._auth())
        self.assertEqual(start.status_code, 200)
        body = start.json()
        attempt_id = body['attemptId']
        count = body['questionCount']
        self.assertIn('question', body)
        self.assertNotIn('correct', str(body['question']))

        for i in range(count):
            resp = self.client.post('/api/daily/today/answer', {
                'attemptId': attempt_id, 'index': i, 'answer': [], 'elapsedMs': 3000,
            }, format='json', **self._auth())
            self.assertEqual(resp.status_code, 200, resp.content)
            data = resp.json()
            self.assertIn('reveal', data)
            self.assertIn('correctOptions', data['reveal'])
            if i < count - 1:
                self.assertIn('next', data)
            else:
                self.assertTrue(data.get('done'))

        again = self.client.post('/api/daily/today/start', **self._auth())
        self.assertEqual(again.status_code, 409)

    def test_out_of_order_answer_rejected(self):
        start = self.client.post('/api/daily/today/start', **self._auth()).json()
        resp = self.client.post('/api/daily/today/answer', {
            'attemptId': start['attemptId'], 'index': 5, 'answer': [], 'elapsedMs': 1000,
        }, format='json', **self._auth())
        self.assertEqual(resp.status_code, 400)

    def test_missing_token_unauthenticated(self):
        # DRF returns 403 for NotAuthenticated when no auth scheme is configured
        # (401 requires a WWW-Authenticate challenge); either is an auth rejection.
        resp = self.client.post('/api/daily/today/start')
        self.assertIn(resp.status_code, (401, 403))


class LeaderboardTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_countries')
        cls.quiz = services.get_or_create_quiz(datetime.date(2026, 3, 3))

    def _attempt(self, nick, score, time_ms):
        p = Player.objects.create(device_token=f'tok-{nick}', nickname=nick)
        return Attempt.objects.create(
            player=p, quiz=self.quiz, score=score, total_time_ms=time_ms, completed=True,
            finished=datetime.datetime(2026, 3, 3, tzinfo=datetime.timezone.utc),
        )

    def test_ordering_score_then_time(self):
        self._attempt('low', 5, 1000)
        self._attempt('fast', 8, 2000)
        self._attempt('slow', 8, 9000)
        board = services.leaderboard(self.quiz)
        nicks = [a.player.nickname for a in board]
        self.assertEqual(nicks, ['fast', 'slow', 'low'])

    def test_rank_of(self):
        a_fast = self._attempt('fast', 8, 2000)
        self._attempt('slow', 8, 9000)
        self._attempt('low', 5, 1000)
        self.assertEqual(services.rank_of(a_fast), 1)


class SubjectRecoveryTests(TestCase):
    """The audit tool must be able to tell which countries a question consumed
    (its "subjects") both for new quizzes (answer['subjects']) and for quizzes
    generated before that key existed (per-type recovery from payload/answer)."""

    @classmethod
    def setUpTestData(cls):
        call_command('seed_countries')

    def test_generated_questions_carry_subjects(self):
        quiz = services.get_or_create_quiz(datetime.date(2026, 9, 1))
        for q in quiz.questions.all():
            self.assertIn('subjects', q.answer, q.type)
            self.assertTrue(q.answer['subjects'], q.type)
            # Subjects must never leak into the client-facing payload.
            self.assertNotIn('subjects', str(q.payload))

    def test_fallback_recovery_matches_stored_subjects(self):
        # Several dates so every question type appears at least once.
        seen_types = set()
        for day in range(1, 10):
            DailyQuiz.objects.all().delete()
            quiz = services.get_or_create_quiz(datetime.date(2026, 9, day))
            for q in quiz.questions.all():
                stored = set(q.answer['subjects'])
                q.answer = {k: v for k, v in q.answer.items() if k != 'subjects'}
                self.assertEqual(
                    regeneration.subject_pks_for_question(q), stored,
                    f'{q.type} on {quiz.date} (index {q.index})',
                )
                seen_types.add(q.type)
        self.assertLessEqual(
            {'name-country', 'identify-flag', 'capital', 'region-click', 'bordering'},
            seen_types,
        )


class RegenerationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_countries')

    def setUp(self):
        self.quiz = services.get_or_create_quiz(datetime.date(2026, 9, 15))

    def test_replacement_preserves_slot_and_type(self):
        q = self.quiz.questions.get(index=3)
        old_pk, old_type, old_correct = q.pk, q.type, set(q.answer['correct'])
        regeneration.regenerate_question(q, flag_count=0)
        q.refresh_from_db()
        self.assertEqual(q.pk, old_pk)
        self.assertEqual(q.type, old_type)
        self.assertEqual(q.payload['index'], 3)
        self.assertNotEqual(set(q.answer['correct']), old_correct)

    def test_replacement_subjects_disjoint_from_rest_of_quiz(self):
        for index in range(self.quiz.questions.count()):
            q = self.quiz.questions.get(index=index)
            regeneration.regenerate_question(q, flag_count=0)
            q.refresh_from_db()
            others = set()
            for other in self.quiz.questions.exclude(pk=q.pk):
                others |= regeneration.subject_pks_for_question(other)
            self.assertFalse(
                set(q.answer['subjects']) & others,
                f'index {index} ({q.type}) collided with another subject',
            )

    def test_regeneration_is_deterministic_per_flag_count(self):
        q = self.quiz.questions.get(index=5)
        original = (q.type, q.payload, q.answer, q.points)

        regeneration.regenerate_question(q, flag_count=0)
        q.refresh_from_db()
        first = (q.payload, q.answer)

        # Restore the original row and regenerate again with the same count.
        q.type, q.payload, q.answer, q.points = original
        q.save()
        regeneration.regenerate_question(q, flag_count=0)
        q.refresh_from_db()
        self.assertEqual((q.payload, q.answer), first)

        # A later flag on the same slot must produce a different replacement.
        q.type, q.payload, q.answer, q.points = original
        q.save()
        regeneration.regenerate_question(q, flag_count=1)
        q.refresh_from_db()
        self.assertNotEqual((q.payload, q.answer), first)


class AuditApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_countries')
        User = get_user_model()
        cls.superuser = User.objects.create_superuser('boss', 'boss@example.com', 'pw')
        cls.mortal = User.objects.create_user('pleb', 'pleb@example.com', 'pw')

    def setUp(self):
        self.client = APIClient()

    def _headers(self, user=None):
        return {'HTTP_X_AUDIT_TOKEN': mint_token(user or self.superuser)}

    def test_requires_valid_superuser_token(self):
        url = '/api/audit/daily/2026-10-01'
        self.assertIn(self.client.get(url).status_code, (401, 403))
        self.assertIn(
            self.client.get(url, HTTP_X_AUDIT_TOKEN='garbage').status_code,
            (401, 403),
        )
        self.assertIn(
            self.client.get(url, **self._headers(self.mortal)).status_code,
            (401, 403),
        )
        with self.settings(AUDIT_TOKEN_MAX_AGE=-1):  # every token already expired
            self.assertIn(
                self.client.get(url, **self._headers()).status_code, (401, 403),
            )

    def test_audit_daily_returns_answers_for_any_date(self):
        for date in ('2020-01-15', '2030-12-31'):
            resp = self.client.get(f'/api/audit/daily/{date}', **self._headers())
            self.assertEqual(resp.status_code, 200, resp.content)
            body = resp.json()
            self.assertEqual(body['quizDate'], date)
            self.assertEqual(len(body['questions']), body['questionCount'])
            for q in body['questions']:
                self.assertIn('correct', q['answer'])
                self.assertTrue(q['answer']['correct'])

    def test_flag_regenerates_and_snapshots(self):
        date = '2026-10-05'
        quiz_body = self.client.get(f'/api/audit/daily/{date}', **self._headers()).json()
        old = quiz_body['questions'][2]

        resp = self.client.post(
            f'/api/audit/daily/{date}/flag',
            {'index': 2, 'reason': 'bad borders data'},
            format='json', **self._headers(),
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertTrue(body['flag']['regenerated'])
        self.assertEqual(body['question']['type'], old['type'])
        self.assertNotEqual(body['question']['answer']['correct'],
                            old['answer']['correct'])

        flag = QuestionFlag.objects.get()
        self.assertEqual(flag.reason, 'bad borders data')
        self.assertEqual(flag.flagged_by, 'boss')
        self.assertEqual(flag.old_payload, old['payload'])
        self.assertEqual(flag.old_answer, old['answer'])

        # Auditing must never create player state.
        self.assertEqual(Attempt.objects.count(), 0)
        self.assertEqual(AnswerRecord.objects.count(), 0)

    def test_flag_without_regenerate_keeps_question(self):
        date = '2026-10-06'
        old = self.client.get(f'/api/audit/daily/{date}', **self._headers()).json()['questions'][0]
        resp = self.client.post(
            f'/api/audit/daily/{date}/flag',
            {'index': 0, 'reason': 'just noting', 'regenerate': False},
            format='json', **self._headers(),
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertFalse(body['flag']['regenerated'])
        self.assertEqual(body['question']['payload'], old['payload'])

    def test_flag_on_played_quiz_requires_force(self):
        date = '2026-10-07'
        quiz = services.get_or_create_quiz(datetime.date(2026, 10, 7))
        player = Player.objects.create(device_token='tok-x', nickname='X')
        Attempt.objects.create(player=player, quiz=quiz)

        resp = self.client.post(
            f'/api/audit/daily/{date}/flag', {'index': 1},
            format='json', **self._headers(),
        )
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(resp.json()['attemptCount'], 1)
        self.assertEqual(QuestionFlag.objects.count(), 0)

        resp = self.client.post(
            f'/api/audit/daily/{date}/flag', {'index': 1, 'force': True},
            format='json', **self._headers(),
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertTrue(resp.json()['flag']['regenerated'])
        # The attempt itself is untouched.
        self.assertEqual(Attempt.objects.count(), 1)

    def test_second_flag_gives_a_different_replacement(self):
        date = '2026-10-08'
        headers = self._headers()
        first = self.client.post(f'/api/audit/daily/{date}/flag', {'index': 4},
                                 format='json', **headers).json()
        second = self.client.post(f'/api/audit/daily/{date}/flag', {'index': 4},
                                  format='json', **headers).json()
        self.assertNotEqual(first['question']['answer']['correct'],
                            second['question']['answer']['correct'])
        self.assertEqual(QuestionFlag.objects.filter(index=4).count(), 2)

    def test_launch_page_superuser_only(self):
        web = self.client
        resp = web.get('/audit/launch')
        self.assertEqual(resp.status_code, 302)  # anonymous -> admin login

        web.force_login(self.mortal)
        self.assertEqual(web.get('/audit/launch').status_code, 302)

        web.force_login(self.superuser)
        resp = web.get('/audit/launch')
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, '?audit=')
