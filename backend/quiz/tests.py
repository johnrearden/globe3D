import datetime

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from players.models import Player
from quiz import services
from quiz.models import Attempt, DailyQuiz, Question


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

    def test_region_click_target_in_clicktargets(self):
        from quiz.generation.bespoke import gen_region_click
        spec = gen_region_click(self._rng(4), self._pool())
        self.assertEqual(spec['type'], 'region-click')
        targets = set(spec['payload']['map']['clickTargets'])
        correct = spec['answer']['correct'][0]
        self.assertIn(correct, targets)
        self.assertEqual(spec['payload']['answer']['method'], 'map-click-single')

    def test_bespoke_types_registered(self):
        from quiz.generation import REGISTRY
        for key in ('bordering', 'landlocked', 'region-click'):
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
