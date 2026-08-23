"""Export the published country pages to ``content/countries.json``.

Consumed by the Astro build's ``getStaticPaths()`` to generate one static
``/country/<slug>`` page per entry. Mirrors ``export_border_quizzes``: Django is
the source of truth, the JSON is a build-time snapshot, and nothing here is
fetched at runtime.

    python manage.py export_country_content

Requires a seeded Country table (``python manage.py seed_countries``).

Only PUBLISHED, complete content is exported, and that is the point rather than a
convenience: the site was rejected by AdSense for "low quality content", so a
half-filled page actively harms the thing this pipeline exists to fix. A country
with no reviewed content simply has no page — its globe entry still works.

Each entry carries a ``related`` block of neighbouring and same-region countries.
That is not decoration: a WebGL canvas is not crawlable, so without real
``<a href>`` links between them the pages are sitemap orphans with no internal
link graph. It is emitted here because the neighbour data lives in the database.
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from geo.models import Country, CountryContent

# backend/geo/management/commands/ → repo root is four levels up.
REPO_ROOT = Path(__file__).resolve().parents[4]
OUT = REPO_ROOT / 'content' / 'countries.json'

# How many related links each page carries. Enough to build a connected graph
# without turning the page footer into a link farm, which is its own quality
# signal problem.
MAX_RELATED = 8


def display_path(path):
    """Repo-relative when possible, absolute otherwise.

    `--out` can legitimately point outside the repo (tests use a temp dir), and
    Path.relative_to raises rather than returning None in that case.
    """
    try:
        return path.relative_to(REPO_ROOT)
    except ValueError:
        return path


def paragraphs(text):
    """Split authored prose into paragraphs on blank lines.

    Done here rather than in the renderer so the JSON is already the shape the
    page needs, and so no consumer has to guess whether the field is prose or
    markup. It is prose: storing HTML would let a database field inject markup
    into a statically generated page.
    """
    return [p.strip() for p in text.split('\n\n') if p.strip()]


class Command(BaseCommand):
    help = 'Export published country page content to content/countries.json'

    def add_arguments(self, parser):
        parser.add_argument(
            '--out', type=Path, default=OUT,
            help=f'Output path (default: {OUT.relative_to(REPO_ROOT)})',
        )
        parser.add_argument(
            '--allow-empty', action='store_true',
            help='Write the file even when nothing is published (for a first build).',
        )

    def handle(self, *args, **options):
        out = options['out']

        published = (
            CountryContent.objects
            .filter(status=CountryContent.Status.PUBLISHED)
            .select_related('country')
            .order_by('country__name')
        )

        # Refuse to publish an entry that lost a section after being approved —
        # editing a published page back into an incomplete one is the likeliest
        # way for a thin page to reach production.
        incomplete = [c.country.display_name for c in published if not c.is_complete]
        if incomplete:
            raise CommandError(
                'Published but incomplete (fill or unpublish before exporting): '
                + ', '.join(incomplete)
            )

        entries = [self._entry(c) for c in published]

        if not entries and not options['allow_empty']:
            raise CommandError(
                'Nothing is published yet, so every generated page would be empty — '
                'which is the problem this pipeline exists to fix. Publish at least '
                'one country in the admin, or pass --allow-empty to write a stub.'
            )

        # Related links are resolved after the fact: a link may only point at a
        # page that exists, or the build emits a 404 and the crawler follows it.
        buildable = {e['slug'] for e in entries}
        by_cca3 = {c.country.cca3: c.country for c in published if c.country.cca3}
        for entry, content in zip(entries, published):
            entry['related'] = self._related(content.country, by_cca3, buildable)

        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({
            'version': 1,
            'countries': entries,
        }, indent=2, ensure_ascii=False) + '\n')

        total = Country.objects.exclude(mesh_name='').count()
        orphans = sum(1 for e in entries if not e['related'])
        self.stdout.write(self.style.SUCCESS(
            f'Wrote {display_path(out)}: {len(entries)} of {total} '
            f'globe countries have published pages.'
        ))
        if orphans:
            self.stdout.write(self.style.WARNING(
                f'{orphans} page(s) have no related links yet — they will be sitemap '
                f'orphans until neighbouring countries are published too.'
            ))

    def _entry(self, content):
        country = content.country
        return {
            'slug': country.slug,
            'name': country.display_name,
            'cca2': country.cca2,
            'cca3': country.cca3,
            'flagIso': (country.flag_iso or country.cca2).lower(),
            'region': country.region,
            'subregion': country.subregion,
            'capital': country.capital,
            'areaKm2': country.area,
            'summary': content.summary.strip(),
            'sections': [
                {'id': 'geography', 'heading': 'Geography', 'paragraphs': paragraphs(content.geography)},
                {'id': 'history', 'heading': 'History', 'paragraphs': paragraphs(content.history)},
                {'id': 'literature', 'heading': 'Literary heritage', 'paragraphs': paragraphs(content.literature)},
            ],
            'reviewedAt': content.reviewed_at.isoformat() if content.reviewed_at else None,
        }

    def _related(self, country, by_cca3, buildable):
        """Neighbours first, then same-region countries to fill the quota.

        Neighbours lead because a land border is the strongest reason a reader
        would follow the link, and because it makes the graph geographic rather
        than alphabetical.
        """
        related, seen = [], {country.slug}

        for cca3 in country.borders or []:
            neighbour = by_cca3.get(cca3)
            if neighbour and neighbour.slug in buildable and neighbour.slug not in seen:
                related.append({'slug': neighbour.slug, 'name': neighbour.display_name,
                                'relation': 'borders'})
                seen.add(neighbour.slug)

        if len(related) < MAX_RELATED and country.region:
            same_region = (
                Country.objects
                .filter(region=country.region, slug__in=buildable)
                .exclude(slug__in=seen)
                .order_by('name')
            )
            for other in same_region[:MAX_RELATED - len(related)]:
                related.append({'slug': other.slug, 'name': other.display_name,
                                'relation': 'region'})
                seen.add(other.slug)

        return related[:MAX_RELATED]
