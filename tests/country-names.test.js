/**
 * Name → palette id (Stage 5, item 1).
 *
 * The lookup the globe uses for override files and for showOnly/fadeOthers/
 * hideCountry used to fall back to a symmetric substring match in iteration
 * order. Against the real metadata that meant `nigeria` resolved to Niger and
 * `romania` to Oman — the wrong country recoloured or hidden, with no warning.
 * These run the replacement against the real `country-meta.json`, so a future
 * name in the data that breaks a rule fails here rather than on the globe.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lookupCountryId, normalizeCountryName } from '../js/core/country-names.js';

const meta = JSON.parse(readFileSync(fileURLToPath(new URL('../assets/country-meta.json', import.meta.url)), 'utf8'));
const { nameToId, idToName } = meta;
const colors = JSON.parse(readFileSync(fileURLToPath(new URL('../country-colors.json', import.meta.url)), 'utf8'));
const resolve = (name) => idToName[lookupCountryId(nameToId, name)];

/** The algorithm this replaced, kept here only to pin what it got wrong. */
function oldLookup(name) {
    if (nameToId[name] !== undefined) return nameToId[name];
    const target = name.toLowerCase().replace(/\s+/g, '');
    for (const canonical in nameToId) {
        const c = canonical.toLowerCase().replace(/\s+/g, '');
        if (c === target || c.includes(target) || target.includes(c)) return nameToId[canonical];
    }
    return undefined;
}

describe('normalizeCountryName', () => {
    it('folds case, whitespace, punctuation and diacritics', () => {
        expect(normalizeCountryName("Côte d'Ivoire")).toBe('cotedivoire');
        expect(normalizeCountryName('  Democratic   Congo ')).toBe('democraticcongo');
        expect(normalizeCountryName('S. Georgia & S. Sandwich Is.')).toBe('sgeorgiassandwichis');
    });
});

describe('lookupCountryId against the real metadata', () => {
    it('resolves every canonical name to itself, exactly and in any case', () => {
        for (const name of Object.keys(nameToId)) {
            expect(lookupCountryId(nameToId, name), name).toBe(nameToId[name]);
            expect(lookupCountryId(nameToId, name.toLowerCase()), name.toLowerCase()).toBe(nameToId[name]);
            expect(lookupCountryId(nameToId, name.toUpperCase()), name.toUpperCase()).toBe(nameToId[name]);
        }
    });

    it('never lets a name that is a substring of another reach the longer one', () => {
        // Every canonical name contained in some other canonical name.
        const nested = Object.keys(nameToId).filter((a) =>
            Object.keys(nameToId).some((b) => b !== a && b.toLowerCase().includes(a.toLowerCase())));
        expect(nested).toEqual(expect.arrayContaining(['Niger', 'Guinea', 'Sudan', 'Dominica', 'Congo']));
        for (const name of nested) {
            expect(resolve(name), name).toBe(name);
            expect(resolve(name.toLowerCase()), name.toLowerCase()).toBe(name);
        }
    });

    it('keeps Niger and Nigeria apart in both directions', () => {
        expect(resolve('Niger')).toBe('Niger');
        expect(resolve('niger')).toBe('Niger');
        expect(resolve('Nigeria')).toBe('Nigeria');
        expect(resolve('nigeria')).toBe('Nigeria');
    });

    it('accepts a prefix only when it names exactly one country', () => {
        expect(resolve('Liecht')).toBe('Liechtenstein');
        expect(resolve('Guin')).toBeUndefined();      // Guinea, Guinea Bissau, …
        expect(resolve('Domin')).toBeUndefined();     // Dominica, Dominican Republic
        expect(resolve('')).toBeUndefined();
        expect(lookupCountryId(nameToId, null)).toBeUndefined();
    });

    it('resolves every key in the committed country-colors.json as before', () => {
        for (const key of Object.keys(colors)) {
            expect(lookupCountryId(nameToId, key), key).toBe(oldLookup(key));
            expect(lookupCountryId(nameToId, key), key).toBeDefined();
        }
        expect(resolve('Usa')).toBe('USA');
    });

    it('does not reproduce the old algorithm\'s wrong answers', () => {
        // Pinned from a run against the metadata at the time of the fix.
        const wrong = {
            nigeria: 'Niger', romania: 'Oman', somalia: 'Mali', sudan: 'South Sudan',
            guinea: 'Equatorial Guinea', 'democratic congo': 'Congo', 'american samoa': 'Samoa',
        };
        for (const [input, wasResolvedTo] of Object.entries(wrong)) {
            expect(idToName[oldLookup(input)], `old: ${input}`).toBe(wasResolvedTo);
            expect(resolve(input), `new: ${input}`).not.toBe(wasResolvedTo);
        }
    });
});
