"""Seed the Country table from the vendored restcountries snapshot.

Idempotent: safe to run repeatedly. Reads two committed, offline data files so
the seed is reproducible without any network access:

  geo/data/countries.json  - slim restcountries records (from npm world-countries)
  geo/data/mesh_iso.json   - frontend mesh name -> ISO-2 (from country-data.js)

plus geo/aliases.py for the mesh names that differ between the two datasets.

Regenerate countries.json with:  npm run build:geo-data   (see package.json)
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand

from geo.aliases import MESH_NAME_ALIASES
from geo.models import Country

DATA_DIR = Path(__file__).resolve().parent.parent.parent / 'data'

# restcountries `region` -> continent, with Americas split by subregion.
REGION_TO_CONTINENT = {
    'Africa': 'Africa',
    'Europe': 'Europe',
    'Asia': 'Asia',
    'Oceania': 'Oceania',
    'Antarctic': 'Antarctica',
}


def continents_for(region, subregion):
    if region == 'Americas':
        if subregion == 'South America':
            return ['South America']
        return ['North America']  # Northern/Central America + Caribbean
    c = REGION_TO_CONTINENT.get(region)
    return [c] if c else []


def build_iso_to_mesh():
    """iso2 -> frontend mesh display name (resolved set + aliases)."""
    mesh_iso = json.loads((DATA_DIR / 'mesh_iso.json').read_text())
    iso_to_mesh = {}
    for mesh_name, iso in mesh_iso.items():
        iso_to_mesh[iso.lower()] = mesh_name
    for mesh_name, iso in MESH_NAME_ALIASES.items():
        iso_to_mesh.setdefault(iso.lower(), mesh_name)
    return iso_to_mesh


class Command(BaseCommand):
    help = 'Seed/refresh the Country table from the vendored restcountries snapshot.'

    def handle(self, *args, **options):
        records = json.loads((DATA_DIR / 'countries.json').read_text())
        iso_to_mesh = build_iso_to_mesh()

        created = updated = 0
        for r in records:
            cca2 = (r.get('cca2') or '').lower()
            if not cca2:
                continue
            latlng = r.get('latlng') or []
            defaults = {
                'cca3': r.get('cca3', ''),
                'name': r.get('name', ''),
                'mesh_name': iso_to_mesh.get(cca2, ''),
                'lat': latlng[0] if len(latlng) >= 2 else None,
                'lng': latlng[1] if len(latlng) >= 2 else None,
                'area': r.get('area'),
                'capital': r.get('capital', ''),
                'landlocked': bool(r.get('landlocked')),
                'independent': bool(r.get('independent')),
                'region': r.get('region', ''),
                'subregion': r.get('subregion', ''),
                'continents': continents_for(r.get('region', ''), r.get('subregion', '')),
                'borders': [b.upper() for b in (r.get('borders') or [])],
                'flag_iso': cca2,
            }
            _, was_created = Country.objects.update_or_create(cca2=cca2, defaults=defaults)
            created += int(was_created)
            updated += int(not was_created)

        linked = Country.objects.exclude(mesh_name='').count()
        self.stdout.write(self.style.SUCCESS(
            f'Seeded countries: {created} created, {updated} updated, '
            f'{linked} linked to a globe mesh name.'
        ))
