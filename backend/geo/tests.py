import json
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.test import TestCase

from geo.models import Country

# assets/country-meta.json lives in the frontend repo root (one level above backend/).
META_PATH = settings.BASE_DIR.parent / 'assets' / 'country-meta.json'


class SeedReconciliationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed_countries')

    def test_every_mesh_country_resolves(self):
        """Every country the globe renders must map to a Country row by mesh_name.

        This is the guard the plan calls for: no orphan globe names. If the globe
        gains a country whose name doesn't reconcile, this fails loudly so an alias
        gets added.
        """
        meta = json.loads(Path(META_PATH).read_text())
        mesh_names = {c['name'] for c in meta['countries']}
        linked = set(Country.objects.exclude(mesh_name='').values_list('mesh_name', flat=True))
        orphans = sorted(mesh_names - linked)
        self.assertEqual(orphans, [], f'Unreconciled globe names: {orphans}')

    def test_seed_is_idempotent(self):
        before = Country.objects.count()
        call_command('seed_countries')
        self.assertEqual(Country.objects.count(), before)

    def test_chad_has_neighbours_and_is_landlocked(self):
        chad = Country.objects.get(cca2='td')
        self.assertTrue(chad.landlocked)
        self.assertIn('NER', chad.borders)  # Niger borders Chad
        self.assertIn('Africa', chad.continents)
