# Rich Content Possibilities — Globe App

Companion to [`country-indices.md`](./country-indices.md). That file catalogues **comparative indices**
— one number per country, bindable to a colour scale. This one catalogues **narrative content**: the
per-country material that gives a country page or a click-panel something worth reading, and that a
geography learner remembers long after a rank is forgotten.

The distinction matters for the build:

- **Indices** are a data pipeline problem — fetch, normalise, colour, cite.
- **Narrative content** is an *editorial* problem — write, verify, publish. It lands in
  `content/countries.json` as new `sections` entries (baked from Django by
  `manage.py export_country_content`) and renders through the existing `CountryArticle`, which needs
  no new machinery: a section is `{id, heading, paragraphs}`.

That second point is the reason these three ideas are cheap. Each is a new section id, not a new
subsystem — and each adds substantive prose to the initial HTML response, which is precisely the
deficiency that got the site rejected by AdSense.

## Verification is not optional

`build-landing-facts.mjs` refuses a superlative the baked geometry contradicts. Narrative content
deserves the same instinct even where it cannot be machine-checked: every claim carries a source, and
where sources disagree the copy says so rather than picking a side. Legends and national heroes are
exactly the topics where uncritical copy reads as propaganda — see the per-idea caveats below.

---

## 1. Myths and legends

**What it is:** One or two paragraphs on the stories a country tells about itself — founding myths,
folk monsters, legendary figures. Romulus and Remus for Italy, the Táin and the Salmon of Knowledge
for Ireland, Yggdrasil and the huldufólk for Iceland, the Bunyip for Australia, Anansi across West
Africa and the Caribbean diaspora.

**Why it's interesting:** It is the most *shareable* content on this list. A rank tells you where a
country sits; a legend tells you what it is frightened of and what it is proud of. It also travels
well as a quiz mode ("which country's folklore features…?") and as a landing-panel teaser.

**Coverage:** Universal in principle — every country has folklore — but *unevenly documented in
English*. Expect strong material for Europe, Japan, and the settler-colonial anglosphere, and much
thinner pickings for small states and dependencies. Plan for a section that is present on maybe
120–150 countries rather than all of them, and make its absence graceful.

**Sources:** No single publisher. Realistically a mix of national folklore archives (Ireland's
Dúchas / National Folklore Collection is a model of the genre), UNESCO's Intangible Cultural Heritage
lists, university folklore departments, and Britannica/encyclopaedic entries for the well-trodden ones.

- UNESCO Intangible Cultural Heritage: https://ich.unesco.org/en/lists
- Dúchas (Irish National Folklore Collection): https://www.duchas.ie

**Caveats:**

- **Living traditions are not curiosities.** Indigenous and First Nations stories in particular are
  often sacred, restricted, or not the publisher's to retell. Prefer material a community has itself
  put forward (UNESCO ICH listings are a good filter for this) and describe rather than retell.
- **Folklore is not national.** Most of it predates the borders on the globe and crosses several of
  them. The copy should say "told across the Andes" where that is true, rather than assigning a story
  to whichever modern state the app happens to be colouring in.
- Licensing on archive images and recordings is separate from licensing on the text — check both if
  we ever illustrate this section.

## 2. Great historical figures

**What it is:** Three to five people per country, each with a sentence on what they did and why it
mattered. Not a leaderboard — a spread: a scientist, a writer, a political figure, an athlete, someone
unexpected.

**Why it's interesting:** It is the strongest hook for the learner audience, because names are how
most people already index countries. It also feeds quiz modes directly ("which country was Ada
Lovelace from?") and gives the country page a section that reads like a magazine rather than a
database dump.

**Coverage:** Universal, and unlike folklore the sourcing is even — every country has documented
notable people. The risk is the opposite one: too many candidates, and no principled way to pick.

**Sources:**

- Wikidata is the practical backbone — queryable by `country of citizenship` + `place of birth`, with
  stable identifiers. CC0, so no licensing friction on the data itself.
  https://query.wikidata.org
- Pantheon (MIT Media Lab) ranks historical figures by cross-language Wikipedia presence, which is a
  defensible objective proxy for "notable" and comes with a downloadable dataset.
  https://pantheon.world
- Britannica / national biographical dictionaries (e.g. the Dictionary of Irish Biography, the ODNB)
  for the prose itself.

**Caveats:**

- **Any automated notability metric encodes the biases of its corpus** — Pantheon and Wikipedia both
  skew heavily European, male, and modern. Used raw, this section would produce five white men for
  most countries and Wikipedia's colonial gaze for the rest. Treat the ranking as a *candidate pool*
  and curate deliberately for period, field, and gender.
- **Citizenship is anachronistic** for most of history. Ask "born in the territory that is now X" and
  say so in the copy where it is contentious; several figures will legitimately appear under more than
  one country, and that is more honest than forcing a single assignment.
- Contested figures (colonial administrators, wartime leaders) need copy that states what they are
  known for including the harm, not a hagiography. This is the section most likely to draw complaints.

## 3. Natural resources

**What it is:** What a country has under the ground and in its waters, and what that has meant for it —
Chile and copper, the DRC and cobalt, Norway and oil (and the sovereign wealth fund it built from it),
Bolivia and lithium, Iceland and geothermal.

**Why it's interesting:** It is the section that *explains* the other content. Resource endowment sits
behind a large share of the borders, conflicts, migrations and wealth gaps on the globe, and it gives
the app a genuine causal story rather than a set of unconnected facts. It is also the one idea here
that is **both** narrative and index — production and reserve figures are hard numbers, so this could
run as a country-page section now and a colour layer later.

**Coverage:** Near-universal for production data; excellent for the top producers, thin for small
island states (whose resource story is usually fisheries and EEZ area, which is itself interesting).

**Sources:**

- **USGS Mineral Commodity Summaries** — annual, per-commodity production and reserves by country,
  US federal government work and therefore public domain. The single best starting point.
  https://www.usgs.gov/centers/national-minerals-information-center
- **EIA International Energy Statistics** — oil, gas, coal, renewables by country. Also US federal.
  https://www.eia.gov/international/data/world
- **World Bank natural-resource rents (% of GDP)** — one clean number per country, CC BY 4.0, and the
  obvious candidate if we want this as a globe colour layer.
  https://data.worldbank.org/indicator/NY.GDP.TOTL.RT.ZS
- **FAO** for fisheries and forestry. https://www.fao.org/fishery/en/statistics

**Caveats:**

- **Reserves are estimates and they move.** Any figure needs a year attached, and the copy should
  prefer durable framings ("one of the world's largest lithium reserves") over a number that goes
  stale between builds.
- **Resource extraction is contested ground** — cobalt in the DRC and lithium in the Andes both carry
  serious labour and environmental stories. A section that lists tonnage and stops there is a worse
  piece of writing than one that spends a sentence on who benefits.
- Licensing is unusually friendly here: USGS and EIA are public domain, the World Bank is CC BY. Of
  the three ideas in this document, this is the only one where we could reproduce the underlying data
  outright rather than linking out.

---

## Build notes

**Shape.** All three are `sections` entries in `content/countries.json` (`{id, heading, paragraphs}`),
rendered by `CountryArticle` — no `client:` directive, passed to `PanelSheet` as a slot, so they stay
static crawlable markup. Proposed ids: `myths`, `figures`, `resources`.

**Graceful absence.** Coverage is uneven for at least two of the three, so a country lacking a section
must render as if the section never existed — no empty heading, no "data not available". The article
already iterates `sections`, so this is free provided the export omits rather than emits-empty.

**Ordering.** These slot after the existing `geography` / `history` sections. `resources` reads best
adjacent to `geography`; `myths` and `figures` after `history`.

**Suggested sequencing.** Natural resources first — best-licensed sources, hardest data, doubles as a
future colour layer. Historical figures second, because the Wikidata/Pantheon pool makes drafting fast
once the curation rules are written down. Myths last: it is the most editorially demanding and the
least automatable, and it is the one where getting it wrong is a reputational problem rather than a
correction.

**Open question.** Same as the indices doc: link out, or pull in. For resources the licensing makes
pulling in genuinely viable; for the other two the content is prose we write, and the sources are
citations rather than feeds.
