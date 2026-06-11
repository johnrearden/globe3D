"""Bespoke question generators: bordering, landlocked, region-click.

These need data the frontend globe doesn't have (neighbours, landlocked flag,
region membership) — all sourced from geo.Country. They register themselves into
the generation REGISTRY on import (see __init__).
"""

from . import register
from .base import (
    DEFAULT_FOCAL_ANCHOR,
    cca3_index,
    country_option,
    frame_distance,
    nearest_countries,
    on_globe,
)

BORDER_GRID_SIZE = 12          # total options shown for a "bordering" question
LANDLOCKED_GRID_SIZE = 9       # 3x3 grid for "click the landlocked countries"

# Push the focus higher up the screen for grid-heavy questions (room below).
GRID_MAP_ANCHOR = {'x': 0.5, 'y': 0.30}


def _resolve_neighbours(target, by_cca3):
    """Target's neighbours that exist on the globe (clickable)."""
    out = []
    for code in target.borders:
        c = by_cca3.get(code)
        if c and c.mesh_name:
            out.append(c)
    return out


def gen_bordering(rng, pool):
    """Map centered on a country + a grid of ~12; click all its neighbours.

    Picks a target with a fair number (3..8) of on-globe neighbours so the answer
    is neither trivial nor exhausting, then fills the grid with the geographically
    nearest non-neighbours as distractors.
    """
    globe = on_globe()
    by_cca3 = cca3_index(globe)

    candidates = list(pool)
    rng.shuffle(candidates)
    target = None
    neighbours = []
    for c in candidates:
        n = _resolve_neighbours(c, by_cca3)
        if 3 <= len(n) <= 8:
            target, neighbours = c, n
            break
    if target is None:
        # Fallback: any target with >=2 neighbours.
        for c in candidates:
            n = _resolve_neighbours(c, by_cca3)
            if len(n) >= 2:
                target, neighbours = c, n
                break
    if target is None:
        # Extremely unlikely; degrade to a name-country-style single pick.
        from .core import gen_name_country
        return gen_name_country(rng, pool)

    neighbour_names = {n.mesh_name for n in neighbours}
    # Distractors: nearest countries that are neither the target nor neighbours.
    exclude = neighbour_names | {target.mesh_name}
    distractor_pool = [c for c in globe if c.mesh_name not in exclude]
    needed = max(0, BORDER_GRID_SIZE - len(neighbours))
    distractors = nearest_countries(target, distractor_pool, needed)

    options = [country_option(c) for c in [*neighbours, *distractors]]
    rng.shuffle(options)

    payload = {
        'type': 'bordering',
        'prompt': f'Click all the countries that border {target.display_name}.',
        'map': {
            'center': {'lat': target.lat, 'lng': target.lng},
            'focusCountry': target.display_name,
            # Frame the target + its neighbours (the frontend can't compute this
            # itself without knowing the hidden answer set).
            'zoom': frame_distance(target.lat, target.lng, [target, *neighbours]),
            'focalAnchor': GRID_MAP_ANCHOR,
            'lockRotation': True,
            'highlight': [target.display_name],
            'clickTargets': None,
        },
        'grid': {
            'options': options,
            'cols': 3,
            'multiSelect': True,
            'display': 'name',
        },
        'answer': {'method': 'grid-multi'},
    }
    return {
        'type': 'bordering',
        'prompt': payload['prompt'],
        'payload': payload,
        'answer': {'correct': sorted(neighbour_names)},
        'points': 1,
    }


def gen_landlocked(rng, pool):
    """Text prompt + grid mixing landlocked & coastal; click the landlocked ones."""
    landlocked = [c for c in pool if c.landlocked]
    coastal = [c for c in pool if not c.landlocked]

    n_correct = rng.randint(2, 4)
    n_correct = min(n_correct, len(landlocked), LANDLOCKED_GRID_SIZE - 2)
    chosen_landlocked = rng.sample(landlocked, n_correct)
    n_coastal = LANDLOCKED_GRID_SIZE - n_correct
    chosen_coastal = rng.sample(coastal, min(n_coastal, len(coastal)))

    grid = [*chosen_landlocked, *chosen_coastal]
    options = [country_option(c) for c in grid]
    rng.shuffle(options)

    payload = {
        'type': 'landlocked',
        'prompt': 'Click all the landlocked countries (no coastline).',
        'grid': {
            'options': options,
            'cols': 3,
            'multiSelect': True,
            'display': 'name',
        },
        'answer': {'method': 'grid-multi'},
    }
    return {
        'type': 'landlocked',
        'prompt': payload['prompt'],
        'payload': payload,
        'answer': {'correct': sorted(c.mesh_name for c in chosen_landlocked)},
        'points': 1,
    }


def _region_centroid(countries):
    lats = [c.lat for c in countries if c.lat is not None]
    lngs = [c.lng for c in countries if c.lng is not None]
    return (sum(lats) / len(lats), sum(lngs) / len(lngs))


def gen_region_click(rng, pool):
    """Zoomed-out map of a subregion; 'Click {country}' — pick it on the map.

    No grid: the whole subregion is clickable (clickTargets). Camera framing is
    left to the frontend (zoom=None) which derives it from the click targets'
    local bboxes; we just supply the region centroid as the center.
    """
    globe = on_globe()
    # Group on-globe countries by subregion.
    by_sub = {}
    for c in globe:
        if c.subregion and c.lat is not None:
            by_sub.setdefault(c.subregion, []).append(c)
    regions = [(sub, members) for sub, members in by_sub.items() if len(members) >= 4]
    if not regions:
        from .core import gen_name_country
        return gen_name_country(rng, pool)

    # Prefer a subregion that has at least one independent country to ask for.
    rng.shuffle(regions)
    subregion, members = None, None
    for sub, mem in regions:
        if any(m.independent for m in mem):
            subregion, members = sub, mem
            break
    if members is None:
        subregion, members = regions[0]

    # Ask for an independent country (recognizable); keep all members clickable.
    askable = [m for m in members if m.independent] or members
    target = rng.choice(askable)
    center_lat, center_lng = _region_centroid(members)

    payload = {
        'type': 'region-click',
        'prompt': f'Click {target.display_name}.',
        'map': {
            'center': {'lat': center_lat, 'lng': center_lng},
            'focusCountry': None,
            'zoom': frame_distance(center_lat, center_lng, members),
            'focalAnchor': DEFAULT_FOCAL_ANCHOR,
            'lockRotation': True,
            'highlight': [],
            'clickTargets': sorted(c.mesh_name for c in members),
        },
        'answer': {'method': 'map-click-single'},
    }
    return {
        'type': 'region-click',
        'prompt': payload['prompt'],
        'payload': payload,
        'answer': {'correct': [target.display_name]},
        'points': 1,
    }


register('bordering', gen_bordering)
register('landlocked', gen_landlocked)
register('region-click', gen_region_click)
