"""Country content model + export pipeline.

The export is the seam between Django (source of truth) and the Astro build, so
these lean on the rules that keep a bad page off the site rather than on happy-path
serialisation.
"""

import json
import tempfile
from pathlib import Path

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone

from geo.models import Country, CountryContent


def make_country(name, cca2, cca3, **kwargs):
    return Country.objects.create(
        name=name, mesh_name=name, cca2=cca2, cca3=cca3, **kwargs
    )


def publish(country, **overrides):
    fields = {
        'summary': 'A summary sentence that stands on its own.',
        'geography': 'Geo para one.\n\nGeo para two.',
        'history': 'History prose.',
        'literature': 'Literary prose.',
        'status': CountryContent.Status.PUBLISHED,
        'reviewed_by': 'editor',
        'reviewed_at': timezone.now(),
    }
    fields.update(overrides)
    return CountryContent.objects.create(country=country, **fields)


class SlugTests(TestCase):
    def test_slug_is_derived_from_the_display_name(self):
        c = make_country('Bosnia And Herzegovina', 'BA', 'BIH')
        self.assertEqual(c.slug, 'bosnia-and-herzegovina')

    def test_slug_prefers_mesh_name_so_the_url_matches_what_the_globe_calls_it(self):
        c = Country.objects.create(name='Czechia', mesh_name='Czech Republic', cca2='CZ', cca3='CZE')
        self.assertEqual(c.slug, 'czech-republic')

    def test_slug_is_not_regenerated_when_the_name_changes(self):
        # A slug is a permanent public URL; rewriting it on rename would break
        # every inbound link and every internal <a href>.
        c = make_country('Swaziland', 'SZ', 'SWZ')
        c.name = c.mesh_name = 'Eswatini'
        c.save()
        self.assertEqual(c.slug, 'swaziland')

    def test_an_explicit_slug_is_respected(self):
        c = Country.objects.create(name='Ivory Coast', cca2='CI', cca3='CIV', slug='cote-divoire')
        self.assertEqual(c.slug, 'cote-divoire')


class CompletenessTests(TestCase):
    def test_is_complete_requires_every_section(self):
        c = make_country('Testland', 'T1', 'TS1')
        content = publish(c, literature='')
        self.assertFalse(content.is_complete)
        content.literature = 'Now filled.'
        self.assertTrue(content.is_complete)

    def test_whitespace_does_not_count_as_content(self):
        c = make_country('Testland', 'T1', 'TS1')
        self.assertFalse(publish(c, history='   \n  ').is_complete)

    def test_word_count_spans_all_sections(self):
        c = make_country('Testland', 'T1', 'TS1')
        content = publish(c, summary='one two', geography='three', history='four', literature='five six')
        self.assertEqual(content.word_count, 6)


class ExportTests(TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp()) / 'countries.json'

    def run_export(self, **kwargs):
        call_command('export_country_content', out=self.tmp, **kwargs)
        return json.loads(self.tmp.read_text())

    def test_refuses_to_write_when_nothing_is_published(self):
        # Generating ~200 empty pages is the failure this pipeline exists to
        # prevent, so it must be an error rather than an empty success.
        make_country('Testland', 'T1', 'TS1')
        with self.assertRaisesMessage(CommandError, 'Nothing is published yet'):
            call_command('export_country_content', out=self.tmp)

    def test_allow_empty_writes_a_stub_for_a_first_build(self):
        data = self.run_export(allow_empty=True)
        self.assertEqual(data['countries'], [])

    def test_exports_only_published_content(self):
        published = make_country('Alpha', 'A1', 'AL1')
        drafted = make_country('Bravo', 'B1', 'BR1')
        publish(published)
        publish(drafted, status=CountryContent.Status.DRAFT)
        slugs = [c['slug'] for c in self.run_export()['countries']]
        self.assertEqual(slugs, ['alpha'])

    def test_refuses_a_published_entry_that_lost_a_section(self):
        # Editing an approved page back into an incomplete one is the likeliest
        # route for a thin page to reach production.
        c = make_country('Alpha', 'A1', 'AL1')
        publish(c, history='')
        with self.assertRaisesMessage(CommandError, 'Published but incomplete'):
            call_command('export_country_content', out=self.tmp)

    def test_prose_is_split_into_paragraphs(self):
        c = make_country('Alpha', 'A1', 'AL1')
        publish(c)
        entry = self.run_export()['countries'][0]
        geography = next(s for s in entry['sections'] if s['id'] == 'geography')
        self.assertEqual(geography['paragraphs'], ['Geo para one.', 'Geo para two.'])

    def test_entry_carries_what_the_page_head_needs(self):
        c = make_country('Alpha', 'A1', 'AL1', region='Europe', capital='Alphaville', flag_iso='A1')
        publish(c)
        entry = self.run_export()['countries'][0]
        self.assertEqual(entry['name'], 'Alpha')
        self.assertEqual(entry['region'], 'Europe')
        self.assertEqual(entry['capital'], 'Alphaville')
        self.assertEqual(entry['flagIso'], 'a1')
        self.assertTrue(entry['summary'])
        self.assertIsNotNone(entry['reviewedAt'])

    def test_related_links_lead_with_land_borders(self):
        a = make_country('Alpha', 'A1', 'AL1', region='Europe', borders=['BR1'])
        b = make_country('Bravo', 'B1', 'BR1', region='Europe', borders=['AL1'])
        make_country('Charlie', 'C1', 'CH1', region='Europe')
        for c in (a, b, Country.objects.get(cca3='CH1')):
            publish(c)
        entry = next(e for e in self.run_export()['countries'] if e['slug'] == 'alpha')
        self.assertEqual(entry['related'][0], {'slug': 'bravo', 'name': 'Bravo', 'relation': 'borders'})
        self.assertIn('charlie', [r['slug'] for r in entry['related']])

    def test_related_never_links_to_a_page_that_will_not_exist(self):
        # A link to an unpublished country would 404, and the crawler follows it.
        a = make_country('Alpha', 'A1', 'AL1', region='Europe', borders=['BR1'])
        make_country('Bravo', 'B1', 'BR1', region='Europe', borders=['AL1'])
        publish(a)   # Bravo deliberately left unpublished
        entry = self.run_export()['countries'][0]
        self.assertEqual(entry['related'], [])

    def test_a_country_never_links_to_itself(self):
        a = make_country('Alpha', 'A1', 'AL1', region='Europe', borders=['AL1'])
        publish(a)
        self.assertEqual(self.run_export()['countries'][0]['related'], [])

    def test_related_is_capped(self):
        target = make_country('Alpha', 'A1', 'AL1', region='Europe')
        publish(target)
        for i in range(12):
            other = make_country(f'Other{i}', f'X{i}', f'XX{i}', region='Europe')
            publish(other)
        entry = next(e for e in self.run_export()['countries'] if e['slug'] == 'alpha')
        self.assertEqual(len(entry['related']), 8)
