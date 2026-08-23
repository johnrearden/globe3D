# Globe3D Quiz Backend

Django + DRF API powering the **Daily Challenge**: a once-per-day timed quiz with
server-side grading, cumulative scoring, and a global leaderboard. Self-hosted;
the static frontend (Cloudflare) calls it cross-origin.

There is **no public web UI** here — only the JSON API (`/api/…`), the Django
admin (`/admin/`), and staff-only stat pages (`/stats/…`).

## Apps

| App       | Responsibility |
|-----------|----------------|
| `geo`     | `Country` reference data (borders, landlocked, capitals, region) seeded from a vendored restcountries snapshot, reconciled to globe names by ISO-2. |
| `players` | Anonymous `Player` (device token + nickname + country); `email`/`ads_removed`/Stripe fields reserved for a later milestone. |
| `quiz`    | `DailyQuiz`/`Question`/`Attempt`/`AnswerRecord`, deterministic generation, grading, scoring, leaderboard. |
| `stats`   | Staff-only templated dashboards. |

## Setup

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

cp .env.example .env            # then edit secrets / CORS origins

.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_countries        # populate geo.Country
.venv/bin/python manage.py createsuperuser        # for admin + /stats
.venv/bin/python manage.py runserver
```

## Run locally with the frontend

The globe is a static site; run it and the API as two local servers (no deployment, no
`rojosample.net` needed). Keep the **API on Django's default port 8000** and serve the static
frontend on **any other port** (8001 below). On localhost the frontend auto-targets `:8000/api`, and
in DEBUG the backend accepts any localhost origin — so the frontend's port doesn't matter and no
`window.GLOBE3D_API_BASE` is needed.

```bash
# Terminal A — the API (from backend/, after the Setup steps above)
.venv/bin/python manage.py runserver          # -> http://127.0.0.1:8000

# Terminal B — the static frontend (from the repo root)
python3 -m http.server 8001
```

Open <http://localhost:8001> (use `localhost` or `127.0.0.1`, not `0.0.0.0`) and click
**★ Daily Challenge**. The frontend's calls go to `http://localhost:8000/api/*`. Set
`window.GLOBE3D_API_BASE` only for the **deployed** frontend, to point it at the self-hosted API.

> Serving over `file://` won't work — ES modules and the large `.bin` asset fetches need HTTP.

## Commands

| Command | Purpose |
|---------|---------|
| `manage.py seed_countries` | Seed/refresh `Country` from the vendored snapshot (idempotent). |
| `manage.py generate_daily [YYYY-MM-DD]` | Pre-build a daily quiz (otherwise generated lazily on first request). Wire to cron if you want it pre-warmed. |
| `manage.py export_border_quizzes` | Bake `landing/borders-data.json` for the static `/borders/<slug>` pages. |
| `manage.py export_country_content` | Bake `content/countries.json` for the static `/country/<slug>` pages. |
| `manage.py test` | Run the test suite. |

## Country page content

The static `/country/<slug>` pages exist because AdSense rejected the site for "low
quality content": the client-rendered shell has no substantive text in its initial
HTML response. `geo.CountryContent` holds the editorial answer — a summary plus
geography, history and literary-heritage prose per country — authored in Django admin.

It is a **separate table from `Country` on purpose.** `Country` is *seeded*: wiped and
rewritten by `seed_countries` from a vendored snapshot. `CountryContent` is *written*,
slowly, by a person. Editorial work must not be destroyable by a reseed.

Workflow: draft in admin → fill every section → the **Publish** action stamps the
reviewer and timestamp, and refuses anything with an empty section. Then:

```bash
.venv/bin/python manage.py export_country_content
```

Only PUBLISHED, complete content is exported, and that is the point rather than a
convenience — a half-filled page is exactly what the reviewer is looking for. A country
without reviewed content simply has no page; its globe entry still works.

Each entry carries a `related` block of bordering and same-region countries, resolved
to slugs that are guaranteed to exist. That is load-bearing: a WebGL canvas is not
crawlable, so without real `<a href>` links between them the pages are sitemap orphans.
The command warns when a page has none yet.

## Regenerating the vendored country data

The seed reads two committed, offline files so it needs no network:

- `geo/data/countries.json` — slim restcountries records (from npm `world-countries`).
- `geo/data/mesh_iso.json` — globe name → ISO-2 (from the frontend's `country-data.js`).

Regenerate both (from the **repo root**, after `npm install`):

```bash
npm run build:geo-data
```

Names that don't reconcile automatically are mapped in `geo/aliases.py`. The test
`geo.tests.SeedReconciliationTests` fails if any globe country is left unlinked.

## API

All endpoints take/return JSON. Player-scoped endpoints require an
`X-Device-Token` header (opaque, client-generated, stored in localStorage).

| Method & path | Purpose |
|---------------|---------|
| `POST /api/players` | Register/update a player by device token. |
| `GET  /api/daily/today` | Today's quiz metadata + your standing. |
| `POST /api/daily/today/start` | Begin/resume today's attempt (409 if already completed). |
| `POST /api/daily/today/answer` | Grade one answer; returns `reveal` (correct-answer feedback) + running score + next question. |
| `GET  /api/daily/today/leaderboard` | Ranked board (score desc, time asc) + your rank. |
| `GET  /api/daily/<YYYY-MM-DD>/leaderboard` | Leaderboard for a past day. |

### Scoring & anti-cheat

- Correct answers are graded server-side; the running score is returned with each
  response. Multi-select requires an **exact set match** to score.
- The **correct answer is never in the question payload** — it is returned only in
  the `reveal` of the answer response (this is a learning quiz).
- Per-question time is **client-reported** (`elapsedMs`), clamped per question and
  floored at a fraction of the real server-observed wall-clock on finish. This is a
  deliberate, accepted tradeoff (client time is spoofable) — see the plan.

## Deployment notes

- Set `DJANGO_DEBUG=false`, a real `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`,
  and `CORS_ALLOWED_ORIGINS` to the Cloudflare frontend origin.
- SQLite is fine for low traffic; switch `DATABASES` to Postgres for scale.
- Run behind a real WSGI server (gunicorn/uwsgi) + reverse proxy.
