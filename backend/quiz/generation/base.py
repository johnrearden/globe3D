"""Shared helpers for deterministic question generation.

All randomness flows through a single seeded `random.Random` passed in by the
daily generator, so a given date always produces the same quiz.
"""

import math

from geo.models import Country

# Default focal anchor for map questions: push the focus toward the upper area so
# the options grid has room below on a mobile (portrait) screen.
DEFAULT_FOCAL_ANCHOR = {'x': 0.5, 'y': 0.40}


def eligible_targets():
    """Countries usable as quiz *targets*: independent, on the globe, geolocated.

    Returns a list (materialized) so the caller can sample without re-querying.
    """
    qs = (
        Country.objects.filter(independent=True)
        .exclude(mesh_name='')
        .exclude(lat__isnull=True)
        .exclude(lng__isnull=True)
    )
    return list(qs)


def on_globe():
    """All countries the globe can render (have a reconciled mesh name)."""
    return list(Country.objects.exclude(mesh_name=''))


def cca3_index(countries):
    """Map cca3 -> Country for the given list."""
    return {c.cca3: c for c in countries if c.cca3}


def great_circle_ll(lat1, lng1, lat2, lng2):
    """Angular distance (degrees) between two lat/lng points."""
    rlat1, rlng1 = math.radians(lat1), math.radians(lng1)
    rlat2, rlng2 = math.radians(lat2), math.radians(lng2)
    d = (
        math.sin(rlat1) * math.sin(rlat2)
        + math.cos(rlat1) * math.cos(rlat2) * math.cos(rlng1 - rlng2)
    )
    d = max(-1.0, min(1.0, d))
    return math.degrees(math.acos(d))


def great_circle_deg(a, b):
    """Angular distance (degrees) between two countries by their lat/lng."""
    return great_circle_ll(a.lat, a.lng, b.lat, b.lng)


def frame_distance(center_lat, center_lng, countries):
    """A camera distance (in globe radii) that frames `countries` around a center.

    Heuristic: take the angular radius (max great-circle degrees from the center
    to any country) and map it onto the same ballpark as the focus-zoom levels
    (~1.14 closest .. 2.43 for Russia). The frontend still clamps to its own
    min/max distance, so out-of-range values are safe.
    """
    if not countries:
        return None
    radius = max(great_circle_ll(center_lat, center_lng, c.lat, c.lng) for c in countries)
    dist = 1.2 + (radius / 90.0) * 3.2
    return round(max(1.3, min(dist, 6.0)), 3)


def nearest_countries(target, pool, count):
    """The `count` countries in `pool` geographically closest to `target`."""
    others = [c for c in pool if c.pk != target.pk]
    others.sort(key=lambda c: great_circle_deg(target, c))
    return others[:count]


def country_option(country):
    """A grid option object the client renders (value is the mesh name it speaks)."""
    return {'value': country.display_name, 'label': country.display_name, 'flag': country.flag_iso}


def map_block(center_country, highlight=None, lock=True, anchor=None,
              zoom=None, click_targets=None, focus_country=None):
    """Build the sanitized `map` presentation block.

    `center` is the focus country's lat/lng; `zoom` left null lets the frontend
    derive the camera distance from its local bboxes (focus-zoom). `highlight`
    and `click_targets` are mesh names.
    """
    return {
        'center': {'lat': center_country.lat, 'lng': center_country.lng},
        'focusCountry': focus_country if focus_country is not None else center_country.display_name,
        'zoom': zoom,
        'focalAnchor': anchor or DEFAULT_FOCAL_ANCHOR,
        'lockRotation': lock,
        'highlight': highlight or [],
        'clickTargets': click_targets,
    }
