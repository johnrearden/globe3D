"""Deterministic daily-quiz generation.

`generate_for_quiz(quiz)` populates a DailyQuiz with Question rows using a RNG
seeded from `quiz.seed`, so the same date always yields the same quiz.

The bespoke generators (bordering/landlocked/region-click) register themselves
here too; until they are imported the daily mix just draws from whatever types
are registered.
"""

import random

from django.conf import settings

from .core import gen_capital, gen_identify_flag, gen_name_country

# key -> generator callable(rng, pool) -> question dict
REGISTRY = {
    'name-country': gen_name_country,
    'identify-flag': gen_identify_flag,
    'capital': gen_capital,
}

# Relative weights for how often each type appears in a daily quiz. Unregistered
# keys are ignored, so listing bespoke types here is safe before they exist.
COMPOSITION_WEIGHTS = {
    'name-country': 3,
    'identify-flag': 3,
    'capital': 3,
    'bordering': 2,
    'landlocked': 2,
    'region-click': 2,
}


def register(key, fn):
    """Register a generator (used by the bespoke module on import)."""
    REGISTRY[key] = fn


# Import for side effect: bespoke generators self-register via register(). Done
# after register() is defined to avoid a circular import.
from . import bespoke  # noqa: E402,F401


def _type_sequence(rng, count):
    """A deterministic, weighted, shuffled sequence of `count` registered types."""
    bag = []
    for key, weight in COMPOSITION_WEIGHTS.items():
        if key in REGISTRY:
            bag.extend([key] * weight)
    if not bag:
        raise RuntimeError('No question generators registered.')
    seq = [rng.choice(bag) for _ in range(count)]
    rng.shuffle(seq)
    return seq


def generate_for_quiz(quiz):
    """Create and persist Question rows for `quiz`. Returns the created list."""
    from quiz.models import Question
    from .base import eligible_targets

    rng = random.Random(quiz.seed)
    pool = eligible_targets()
    count = settings.DAILY_QUIZ_QUESTION_COUNT
    sequence = _type_sequence(rng, count)

    created = []
    for index, qtype in enumerate(sequence):
        spec = REGISTRY[qtype](rng, pool)
        payload = dict(spec['payload'])
        payload['index'] = index
        question = Question.objects.create(
            quiz=quiz,
            index=index,
            type=spec['type'],
            payload=payload,
            answer=spec['answer'],
            points=spec.get('points', 1),
        )
        created.append(question)
    return created
