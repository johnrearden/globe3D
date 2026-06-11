#!/usr/bin/env node
/**
 * Regenerate the vendored, offline country dataset for the geo app.
 *
 * Source: the `world-countries` npm package (mledoze) — the canonical offline
 * mirror of restcountries. We slim it to just the fields the quiz needs and
 * commit the result so seeding never needs network access.
 *
 * Run from the repo root:  node backend/data_build/build_countries_json.mjs
 * (requires `npm install` to have pulled world-countries — it's a devDependency)
 */
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const wc = require('world-countries');
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'geo', 'data');

const slim = wc
  .map((c) => ({
    cca2: c.cca2,
    cca3: c.cca3,
    name: (c.name && c.name.common) || c.cca3,
    official: (c.name && c.name.official) || '',
    altSpellings: c.altSpellings || [],
    latlng: c.latlng || [],
    capital: (c.capital && c.capital[0]) || '',
    landlocked: !!c.landlocked,
    independent: !!c.independent,
    unMember: !!c.unMember,
    region: c.region || '',
    subregion: c.subregion || '',
    borders: c.borders || [],
    area: c.area || 0,
  }))
  .sort((a, b) => (a.cca2 < b.cca2 ? -1 : 1));

writeFileSync(join(outDir, 'countries.json'), JSON.stringify(slim, null, 1));
console.log(`wrote geo/data/countries.json (${slim.length} records)`);
