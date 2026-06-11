"""Reconciliation aliases: frontend mesh display name -> ISO-2 (cca2).

`geo/data/mesh_iso.json` already resolves 189 of the globe's 237 country names
(derived from the frontend's own `js/data/country-data.js`). The remaining names
differ between world-geojson (what the globe renders) and restcountries (the seed
source) — sovereign-name variants plus many dependencies/territories. This table
closes that gap so every mesh name links to a `Country` row by cca2.

Quiz *targets* are filtered to independent UN members elsewhere, so mapping the
territories here is only about completeness of reconciliation (and lets their
flags/data resolve if ever shown), not about putting them in quizzes.
"""

# Sovereign states whose mesh name differs from the resolved set.
SOVEREIGN_ALIASES = {
    'Bahamas': 'bs',
    'Democratic Congo': 'cd',
    'East Timor': 'tl',
    'El Salvador': 'sv',
    'Eswatini': 'sz',
    'North Macedonia': 'mk',
    'South Sudan': 'ss',
    'Vatican': 'va',
    'Palestine': 'ps',
    'Western Sahara': 'eh',
}

# Dependencies / territories (excluded from quiz targets by the generators).
TERRITORY_ALIASES = {
    'Norfolk Island': 'nf',
    'Cook Islands': 'ck',
    'Greenland': 'gl',
    'Faroe Islands': 'fo',
    'Åland Islands': 'ax',
    'Guadeloupe': 'gp',
    'Martinique': 'mq',
    'Réunion': 're',
    'Mayotte': 'yt',
    'New Caledonia': 'nc',
    'French Polynesia': 'pf',
    'Saint Pierre and Miquelon': 'pm',
    'Wallis and Futuna': 'wf',
    'Saint Barthélemy': 'bl',
    'French Southern Territories': 'tf',
    'Aruba': 'aw',
    'Curaçao': 'cw',
    'Tokelau': 'tk',
    'Niue': 'nu',
    'Svalbard': 'sj',
    'Falkland Islands': 'fk',
    'S. Georgia & S. Sandwich Is.': 'gs',
    'Turks and Caicos Islands': 'tc',
    'British Virgin Islands': 'vg',
    'Anguilla': 'ai',
    'Montserrat': 'ms',
    'Cayman Islands': 'ky',
    'Bermuda': 'bm',
    'Jersey': 'je',
    'Guernsey': 'gg',
    'Isle of Man': 'im',
    'Gibraltar': 'gi',
    'Saint Helena': 'sh',
    'Pitcairn Islands': 'pn',
    'United States Virgin Islands': 'vi',
    'Guam': 'gu',
    'Northern Mariana Islands': 'mp',
    'American Samoa': 'as',
}

# Combined mesh-name -> cca2 alias map.
MESH_NAME_ALIASES = {**SOVEREIGN_ALIASES, **TERRITORY_ALIASES}
