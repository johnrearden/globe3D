/**
 * Country search matching.
 *
 * Two of these are regressions against the vanilla implementation rather than
 * new rules: it matched on the raw string (so accented names were unreachable
 * from an ASCII keyboard) and ranked purely alphabetically (so the first result
 * — which Enter takes — was often not the obvious one). Both are the kind of
 * thing that reads fine in code and only shows up when you type.
 *
 * Run against the real country list, not a hand-written sample: the names are
 * the mesh's, and a fixture would not have told us about `Curaçao`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    fold, buildIndex, rank, resolveEnter, MAX_RESULTS,
} from '../apps/web/src/lib/search.ts';

const meta = JSON.parse(readFileSync(
    fileURLToPath(new URL('../assets/country-meta.json', import.meta.url)), 'utf8'));
const names = Object.keys(meta.nameToId);
const index = buildIndex(names);

describe('fold', () => {
    it('strips the diacritics the mesh actually uses', () => {
        expect(fold('Curaçao')).toBe('curacao');
        expect(fold('Åland')).toBe('aland');
        expect(fold('São Tomé and Principe')).toBe('sao tome and principe');
        expect(fold("Côte d'Ivoire")).toBe("cote d'ivoire");
    });
});

describe('rank', () => {
    it('finds every accented name in the data typed without its accents', () => {
        // Derived from the mesh rather than hand-listed, so a rebuild that
        // renames or adds one is covered without anyone remembering to. Today
        // it is Åland Islands, Réunion, Saint Barthélemy and Curaçao — an
        // ASCII keyboard could reach none of them before.
        const accented = names.filter(n => fold(n) !== n.toLowerCase());
        expect(accented.length).toBeGreaterThan(0);
        for (const name of accented) {
            expect(rank(index, fold(name)), `${name} is unreachable`).toContain(name);
        }
    });

    it('ranks an accented prefix above an unaccented substring', () => {
        // "aland" is also inside "New Zealand"; the prefix match still wins.
        expect(rank(index, 'aland')[0]).toBe('Åland Islands');
    });

    it('puts a prefix match above a substring one', () => {
        // Alphabetical order put British Indian Ocean Territory first, and
        // Enter takes the first result — so this decided what Enter did.
        const r = rank(index, 'ind');
        expect(r[0]).toBe('India');
        expect(r.indexOf('India')).toBeLessThan(r.indexOf('Indonesia'));
    });

    it('still finds a country by a word in the middle of its name', () => {
        expect(rank(index, 'guinea')).toContain('Papua New Guinea');
    });

    it('is case-insensitive and ignores surrounding space', () => {
        expect(rank(index, '  FRANCE ')).toEqual(rank(index, 'france'));
    });

    it('returns nothing for an empty query rather than everything', () => {
        // The dropdown is driven off this array's length, so "no query" and
        // "no matches" must not look the same as "all 237 countries".
        expect(rank(index, '')).toEqual([]);
        expect(rank(index, '   ')).toEqual([]);
    });

    it('caps the list', () => {
        // "a" matches most of the world; an uncapped dropdown was a scroll pit.
        expect(rank(index, 'a').length).toBeLessThanOrEqual(MAX_RESULTS);
    });

    it('alphabetises within each tier, not across them', () => {
        const r = rank(buildIndex(['Anguilla', 'Angola', 'Bangladesh']), 'ang');
        expect(r).toEqual(['Angola', 'Anguilla', 'Bangladesh']);
    });
});

describe('resolveEnter', () => {
    const results = ['Chad', 'Chadwick Islands'];

    it('prefers a fully typed name over wherever the cursor is', () => {
        expect(resolveEnter(results, 'Chad', 1)).toBe('Chad');
        expect(resolveEnter(results, 'chad', 1)).toBe('Chad');
    });

    it('takes the cursor when the query is a partial', () => {
        expect(resolveEnter(results, 'cha', 1)).toBe('Chadwick Islands');
    });

    it('falls back to the first result with no cursor', () => {
        expect(resolveEnter(results, 'cha', -1)).toBe('Chad');
    });

    it('is null with nothing to choose, so Enter does nothing', () => {
        expect(resolveEnter([], 'zzz', -1)).toBe(null);
    });
});
