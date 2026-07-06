"""Export static "bordering countries" landing-page data.

Bakes one entry per curated country into ``landing/borders-data.json`` (at the
repo root), consumed by ``build-landing.mjs`` to generate the static
``/borders/<slug>`` quiz pages. No globe/API is involved at runtime — the pages
are fully static.

    python manage.py export_border_quizzes

Requires a seeded Country table (run ``python manage.py seed_countries`` first).

Option grids are built from the same helpers the daily-quiz "bordering" generator
uses (``_resolve_neighbours``, ``nearest_countries``, ``country_option``), but
grid sizing is handled here rather than via ``gen_bordering`` so it copes with
the curated list's full spread of land-border counts (the USA has 2, Russia 14)
without the daily generator's 3..8 sweet-spot assumptions.
"""

import json
import random
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from geo.models import Country
from quiz.generation.base import (
    cca3_index,
    country_option,
    nearest_countries,
    on_globe,
)
from quiz.generation.bespoke import _resolve_neighbours

# quiz/data/border_quiz_targets.json  (this file: quiz/management/commands/…).
DATA_DIR = Path(__file__).resolve().parent.parent.parent / 'data'
TARGETS = DATA_DIR / 'border_quiz_targets.json'
# Repo root holds the frontend landing/ dir (backend/ is one level under it).
# parents: [0]=commands [1]=management [2]=quiz [3]=backend [4]=repo root.
REPO_ROOT = Path(__file__).resolve().parents[4]
OUT = REPO_ROOT / 'landing' / 'borders-data.json'

MIN_NEIGHBOURS = 2      # sanity floor — flags an island/data error, not a real border quiz
GRID_TARGET = 12        # aim for ~12 options when neighbour count is small
MIN_DISTRACTORS = 6     # …but always enough wrong options that the quiz isn't trivial


def _seed_for(cca3):
    """Stable per-country seed so option ordering is deterministic across runs."""
    return sum(ord(ch) for ch in cca3)


class Command(BaseCommand):
    help = 'Export landing/borders-data.json from the curated border-quiz targets.'

    def handle(self, *args, **options):
        targets = json.loads(TARGETS.read_text())
        cca3_to_slug = {t['cca3']: t['slug'] for t in targets}

        globe = on_globe()
        by_cca3 = cca3_index(globe)
        # display name -> cca3 for the whole globe, to resolve neighbours back to
        # a slug for the related-page internal links.
        name_to_cca3 = {c.display_name: c.cca3 for c in globe}

        out = []
        for t in targets:
            country = by_cca3.get(t['cca3'])
            if country is None:
                raise CommandError(
                    f"No on-globe Country with cca3={t['cca3']} (slug {t['slug']}). "
                    f"Run seed_countries first?"
                )

            neighbours = _resolve_neighbours(country, by_cca3)
            if len(neighbours) < MIN_NEIGHBOURS:
                raise CommandError(
                    f"{t['slug']}: only {len(neighbours)} on-globe neighbour(s) "
                    f"(<{MIN_NEIGHBOURS}); not a usable border quiz."
                )

            rng = random.Random(_seed_for(t['cca3']))
            neighbour_names = sorted(n.display_name for n in neighbours)

            # Distractors: geographically nearest non-neighbour, non-island
            # countries. Always add enough that even a 2-border country is a real
            # multi-select quiz.
            exclude = {country.display_name, *neighbour_names}
            distractor_pool = [c for c in globe if c.display_name not in exclude and c.borders]
            n_distractors = max(GRID_TARGET - len(neighbours), MIN_DISTRACTORS)
            distractors = nearest_countries(country, distractor_pool, n_distractors)

            options = [country_option(c) for c in [*neighbours, *distractors]]
            rng.shuffle(options)

            # Related-page links: this country's neighbours that are themselves
            # curated targets (so the link resolves to a page we build).
            related = []
            for nb in neighbour_names:
                nb_cca3 = name_to_cca3.get(nb)
                if nb_cca3 and nb_cca3 in cca3_to_slug and nb_cca3 != t['cca3']:
                    related.append({'slug': cca3_to_slug[nb_cca3], 'name': nb})
                if len(related) >= 3:
                    break

            out.append({
                'slug': t['slug'],
                'name': country.display_name,
                'region': country.region,
                'borderCount': len(neighbour_names),
                'areaKm2': country.area,
                'flag': country.flag_iso,
                'neighbours': neighbour_names,
                'options': options,
                'answer': neighbour_names,
                'related': related,
                'imageAlt': t.get('imageAlt'),
                'blurb': t.get('blurb'),
            })

        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
        self.stdout.write(self.style.SUCCESS(f'Wrote {len(out)} entries to {OUT}.'))
