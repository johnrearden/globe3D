"""Replacement generation for flagged daily-quiz questions.

A flagged question is regenerated in place: same quiz, same index, same type
(so the daily composition invariants — exactly one capital, TYPE_CAPS — keep
holding), but with a fresh subject drawn from a derived seed. The subjects of
every other question in the quiz, plus the flagged question's own subject, are
passed to the generator as its `used` set, so the replacement can't collide
with the rest of the day's quiz or reproduce the flagged content.
"""

import random

from django.db import transaction

from geo.models import Country

from .generation import REGISTRY
from .generation.base import eligible_targets

MAX_RETRIES = 8

CAPITAL_FORWARD_PREFIX = 'What is the capital of '


class RegenerationError(Exception):
    """No acceptable replacement could be generated."""


def _pk_by_display(name):
    """display_name -> Country pk (display_name is mesh_name or name)."""
    if not name:
        return None
    c = (
        Country.objects.filter(mesh_name=name).first()
        or Country.objects.filter(name=name).first()
    )
    return c.pk if c else None


def _recover_subject_pks(qtype, payload, answer):
    """Map a question's stored payload/answer back to its subject Country pks."""
    correct = answer.get('correct', [])
    pks = set()
    if qtype in ('name-country', 'identify-flag', 'region-click'):
        # answer.correct = [target display_name]
        if correct:
            pks = {_pk_by_display(correct[0])}
    elif qtype == 'capital':
        # forward: prompt "What is the capital of {country}?", correct=[capital]
        # reverse: prompt "{capital} is the capital of which country?", correct=[country]
        prompt = payload.get('prompt', '')
        if prompt.startswith(CAPITAL_FORWARD_PREFIX):
            pks = {_pk_by_display(prompt[len(CAPITAL_FORWARD_PREFIX):].rstrip('?'))}
        elif correct:
            pks = {_pk_by_display(correct[0])}
    elif qtype == 'bordering':
        # The subject is the focus country; the correct list is its neighbours.
        focus = (payload.get('map') or {}).get('focusCountry')
        pks = {_pk_by_display(focus)}
    elif qtype in ('landlocked', 'coastline'):
        # Every correct answer was drawn from the unused pool (all are subjects).
        pks = {_pk_by_display(n) for n in correct}
    return {pk for pk in pks if pk is not None}


def subject_pks_for_question(q):
    """Country pks a question consumed from the generator's shared `used` set.

    Questions generated since the audit feature carry the exact set in
    `answer['subjects']`; older rows fall back to per-type recovery from the
    stored payload/answer.
    """
    if 'subjects' in q.answer:
        return set(q.answer['subjects'])
    return _recover_subject_pks(q.type, q.payload, q.answer)


def derive_seed(quiz_seed, index, flag_count, retry):
    """Deterministic replacement seed: same (quiz, slot, nth-flag) -> same
    replacement, while each retry and each subsequent flag shifts it."""
    return (quiz_seed * 1_000_003 + index * 10_007 + flag_count * 101 + retry) % (2 ** 63)


@transaction.atomic
def regenerate_question(question, flag_count=0):
    """Regenerate `question` in place with the same type. Returns the row.

    `flag_count` is how many times this slot was flagged before now, so a
    second flag on the same slot yields a different replacement. Raises
    RegenerationError when no distinct same-type replacement can be produced.
    """
    quiz = question.quiz
    banned = subject_pks_for_question(question)
    for other in quiz.questions.exclude(pk=question.pk):
        banned |= subject_pks_for_question(other)

    pool = eligible_targets()
    generator = REGISTRY[question.type]
    old_correct = set(question.answer.get('correct', []))

    for retry in range(MAX_RETRIES):
        rng = random.Random(derive_seed(quiz.seed, question.index, flag_count, retry))
        trial_used = set(banned)
        spec = generator(rng, pool, trial_used)
        if spec['type'] != question.type:
            continue  # generator degraded (e.g. bordering -> name-country fallback)
        new_subjects = trial_used - banned
        # When their candidate pool is exhausted the generators fall back to
        # reusing "used" countries (choose_unused / the answer_pool fallbacks),
        # so verify none of the trial's actual subjects are banned.
        trial_subjects = _recover_subject_pks(spec['type'], spec['payload'], spec['answer'])
        if not new_subjects or (trial_subjects & banned):
            continue
        if set(spec['answer'].get('correct', [])) == old_correct:
            continue  # identical replacement — retry

        payload = dict(spec['payload'])
        payload['index'] = question.index
        question.payload = payload
        question.answer = dict(spec['answer'], subjects=sorted(new_subjects))
        question.points = spec.get('points', 1)
        question.save(update_fields=['payload', 'answer', 'points'])
        return question

    raise RegenerationError(
        f'Could not generate a distinct {question.type} replacement '
        f'after {MAX_RETRIES} tries.'
    )
