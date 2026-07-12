/**
 * Country land-area lookup (km²), sourced from the `world-countries` npm package
 * (mledoze — the canonical offline restcountries mirror). Used at build time to
 * bake an `area` field into each `assets/country-meta.json` row so the runtime
 * (e.g. the "Find the country" quiz) can filter out tiny islands without shipping
 * the whole dataset to the browser.
 *
 * `areaForCountry(name, iso)` matches by ISO code first (dependencies carry one),
 * then by common/official name and altSpellings. Returns the area in km², or
 * `null` when no match is found (three large countries whose baked names differ
 * from world-countries are handled by NAME_OVERRIDES; anything else unmatched is
 * left null, which callers treat as "keep / large").
 */
const wc = require('world-countries');

// Baked meta names that don't match any world-countries name/altSpelling.
// All three are far larger than any island threshold; mapped by cca2.
const NAME_OVERRIDES = {
    'Democratic Congo': 'CD',
    'Guinea Bissau': 'GW',
    'Turkey': 'TR',
};

// Guadeloupe's land area (km²) — the size floor the quiz uses ("nothing smaller
// than Guadeloupe"). Exported so callers don't hard-code the magic number.
const GUADELOUPE_AREA_KM2 = 1628;

const byCode = new Map();
const byName = new Map();
for (const c of wc) {
    // world-countries uses -1 (and occasionally 0) as an "unknown area" sentinel
    // (e.g. Svalbard). Skip those so they surface as null → treated as large, not
    // wrongly excluded as tiny.
    if (!(c.area > 0)) continue;
    const area = c.area;
    if (c.cca2) byCode.set(c.cca2.toLowerCase(), area);
    if (c.cca3) byCode.set(c.cca3.toLowerCase(), area);
    const names = [c.name && c.name.common, c.name && c.name.official, ...(c.altSpellings || [])];
    for (const n of names) if (n) byName.set(n.toLowerCase(), area);
}

/**
 * @param {string} name - the country's baked name (country-meta.json `name`)
 * @param {string|null} [iso] - the entity's ISO 3166 code, if it carries one
 * @returns {number|null} land area in km², or null when unknown
 */
function areaForCountry(name, iso) {
    if (iso) {
        const a = byCode.get(String(iso).toLowerCase());
        if (a !== undefined) return a;
    }
    if (name) {
        const a = byName.get(name.toLowerCase());
        if (a !== undefined) return a;
        const overrideCode = NAME_OVERRIDES[name];
        if (overrideCode) {
            const oa = byCode.get(overrideCode.toLowerCase());
            if (oa !== undefined) return oa;
        }
    }
    return null;
}

/**
 * One-time migration: rewrite assets/country-meta.json in place, adding an
 * `area` (km²) field to every country row via areaForCountry(). Run with:
 *   node -e "require('./area-data').backfillMeta()"
 * (build-textures.js bakes the same field on a full rebuild, so this only exists
 * to update the committed meta without regenerating the 30 MB mesh.)
 */
function backfillMeta() {
    const fs = require('fs');
    const path = require('path');
    const metaPath = path.join(__dirname, 'assets', 'country-meta.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    let filled = 0, missing = [];
    for (const c of (meta.countries || [])) {
        const area = areaForCountry(c.name, c.iso);
        if (area != null) { c.area = area; filled++; }
        else { delete c.area; missing.push(c.name); }
    }
    // Match build-textures.js's serialization (2-space pretty-print) so the
    // committed file stays diff-friendly.
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    console.log(`backfillMeta: set area on ${filled}/${(meta.countries || []).length} rows`);
    if (missing.length) console.log(`  no area (kept as large): ${missing.join(', ')}`);
}

module.exports = { areaForCountry, backfillMeta, GUADELOUPE_AREA_KM2 };
