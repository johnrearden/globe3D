#!/usr/bin/env node
/**
 * Regenerate geo/data/mesh_iso.json — the frontend mesh display name -> ISO-2
 * reconciliation map, derived from the frontend's own country data so it stays
 * in sync with whatever the globe actually renders.
 *
 * Sources (frontend, repo root):
 *   js/data/country-data.js   (countryData + countryToISO)
 *   assets/country-meta.json  (the 237 names the globe renders)
 *
 * Names that DON'T resolve here are handled by backend/geo/aliases.py.
 *
 * Run from the repo root:  node backend/data_build/build_mesh_iso.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { countryData, countryToISO } from '../../js/data/country-data.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const meta = JSON.parse(readFileSync(join(root, 'assets', 'country-meta.json'), 'utf8'));

const nameToIso = {};
for (const [n, v] of Object.entries(countryToISO)) nameToIso[n] = v.toLowerCase();
for (const [n, v] of Object.entries(countryData)) if (v.iso) nameToIso[n] = v.iso.toLowerCase();

const out = {};
for (const c of meta.countries) if (nameToIso[c.name]) out[c.name] = nameToIso[c.name];

const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'geo', 'data', 'mesh_iso.json');
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`wrote geo/data/mesh_iso.json (${Object.keys(out).length} resolved of ${meta.countries.length})`);
