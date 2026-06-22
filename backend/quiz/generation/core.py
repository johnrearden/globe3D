"""Core question generators: name-country, identify-flag, capital.

Each generator takes (rng, pool) and returns a question dict:
    {type, prompt, payload, answer, points}
`payload` is client-safe (no answer); `answer` is the server-side grading key.
"""

from .base import (
    capital_is_self_evident,
    country_option,
    map_block,
    nearest_countries,
)

OPTION_COUNT = 4


def _single_choice_payload(qtype, prompt, options, *, map_=None, flag=None, display='name'):
    payload = {
        'type': qtype,
        'prompt': prompt,
        'grid': {
            'options': options,
            'cols': 2,
            'multiSelect': False,
            'display': display,
        },
        'answer': {'method': 'grid-single'},
    }
    if map_ is not None:
        payload['map'] = map_
    if flag is not None:
        payload['flag'] = flag
    return payload


def gen_name_country(rng, pool):
    """Highlight a country on the globe; pick its name from four options."""
    target = rng.choice(pool)
    distractors = nearest_countries(target, pool, OPTION_COUNT - 1)
    options = [country_option(c) for c in [target, *distractors]]
    rng.shuffle(options)
    payload = _single_choice_payload(
        'name-country',
        'Which country is highlighted?',
        options,
        map_=map_block(target, highlight=[target.display_name], lock=True),
    )
    return {
        'type': 'name-country',
        'prompt': payload['prompt'],
        'payload': payload,
        'answer': {'correct': [target.display_name]},
        'points': 1,
    }


def gen_identify_flag(rng, pool):
    """Show a country's flag; pick the matching country from four options."""
    flaggable = [c for c in pool if c.flag_iso]
    target = rng.choice(flaggable)
    # Distractors here are random (a flag gives no geographic hint), but keep them
    # plausible by drawing from the same region when possible.
    same_region = [c for c in flaggable if c.region == target.region and c.pk != target.pk]
    others = same_region if len(same_region) >= OPTION_COUNT - 1 else [c for c in flaggable if c.pk != target.pk]
    distractors = rng.sample(others, OPTION_COUNT - 1)
    # No flags on the answer buttons — the question already shows the flag.
    options = [country_option(c, with_flag=False) for c in [target, *distractors]]
    rng.shuffle(options)
    payload = _single_choice_payload(
        'identify-flag',
        'Which country does this flag belong to?',
        options,
        flag=target.flag_iso,
    )
    return {
        'type': 'identify-flag',
        'prompt': payload['prompt'],
        'payload': payload,
        'answer': {'correct': [target.display_name]},
        'points': 1,
    }


def gen_capital(rng, pool):
    """Bidirectional capital question.

    forward:  "What is the capital of {country}?"  options = capital names
    reverse:  "{capital} is the capital of which country?"  options = country names
    """
    # Drop pairs where the capital gives the country away (Mexico/Mexico City,
    # Tunisia/Tunis, the city-states, …) so the answer isn't self-evident.
    have_capital = [
        c for c in pool
        if c.capital and not capital_is_self_evident(c.display_name, c.capital)
    ]
    target = rng.choice(have_capital)
    distractors = nearest_countries(target, have_capital, OPTION_COUNT - 1)
    direction = rng.choice(['forward', 'reverse'])

    if direction == 'forward':
        options = [{'value': c.capital, 'label': c.capital} for c in [target, *distractors]]
        rng.shuffle(options)
        payload = _single_choice_payload(
            'capital',
            f'What is the capital of {target.display_name}?',
            options,
        )
        answer = {'correct': [target.capital]}
    else:
        options = [country_option(c) for c in [target, *distractors]]
        rng.shuffle(options)
        payload = _single_choice_payload(
            'capital',
            f'{target.capital} is the capital of which country?',
            options,
        )
        answer = {'correct': [target.display_name]}

    return {
        'type': 'capital',
        'prompt': payload['prompt'],
        'payload': payload,
        'answer': answer,
        'points': 1,
    }
