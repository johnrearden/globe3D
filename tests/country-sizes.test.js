/**
 * Every curated label-tier name must be a country the globe actually has.
 *
 * A name that matches nothing does not fail — the country just falls through to
 * the medium tier — so a typo here is invisible in the app and invisible in
 * review. Three of them (`United States`, `Democratic Republic Of The Congo`,
 * `Vatican City`) sat in the list doing nothing until the lists were extracted
 * out of index.html; the mesh calls those `USA`, `Democratic Congo` and
 * `Vatican`.
 *
 * `country-meta.json` is the authority because it is what the globe loads:
 * `nameToId` is exactly the set of names `GlobeManager` will answer to.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LARGE_COUNTRIES, SMALL_COUNTRIES } from '../js/data/country-sizes.js';

const meta = JSON.parse(readFileSync(
    fileURLToPath(new URL('../assets/country-meta.json', import.meta.url)), 'utf8'));
const known = new Set(Object.keys(meta.nameToId));

describe('country size tiers', () => {
    it('names only countries the globe has', () => {
        const unknown = [...LARGE_COUNTRIES, ...SMALL_COUNTRIES].filter(n => !known.has(n));
        expect(unknown, 'these tier assignments silently do nothing').toEqual([]);
    });

    it('puts no country in both tiers', () => {
        const both = [...LARGE_COUNTRIES].filter(n => SMALL_COUNTRIES.has(n));
        expect(both).toEqual([]);
    });

    it('still covers the countries the tiers exist for', () => {
        // A guard against the lists being emptied or truncated by an edit: the
        // counts are not meaningful in themselves, only their not collapsing.
        expect(LARGE_COUNTRIES.size).toBeGreaterThan(50);
        expect(SMALL_COUNTRIES.size).toBeGreaterThan(25);
    });
});
