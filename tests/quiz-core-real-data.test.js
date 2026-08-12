/**
 * Real-data smoke tests for @terragotcha/quiz-core.
 *
 * packages/quiz-core/tests/generators.test.js proves each eligibility rule
 * against synthetic fixtures. This file proves the rules survive contact with
 * the 237 real countries in assets/country-meta.json — the failure mode the
 * fixtures cannot catch is a filter that is individually correct but empties
 * the pool for some region once combined with the others.
 *
 * It builds the same plain table js/data/country-table.js assembles at runtime,
 * without needing a globe or a browser.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    MODES,
    QUESTIONS_PER_SESSION,
    generateCapital,
    generateClickCountrySession,
    generateIdentifyFlag,
    generateNameCountry,
    mulberry32
} from '@terragotcha/quiz-core';
import { COUNTRY_REGIONS, REGIONS } from '../js/data/country-regions.js';
import { countryToISO } from '../js/data/country-data.js';

const read = rel => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));

const meta = read('../assets/country-meta.json');
const capitals = read('../assets/capitals.json');

// Mirrors createCountryTable(): a dependency is any record the assets tagged
// with its own ISO code (js/core/globe.js getDependencyData).
const TABLE = meta.countries.map(c => {
    const capital = capitals[c.name] || null;
    return {
        name: c.name,
        centroid: c.centroid,
        area: c.area != null ? c.area : null,
        iso: countryToISO[c.name] || null,
        region: COUNTRY_REGIONS[c.name] || null,
        capital: capital ? { name: capital.name, lat: capital.lat, lng: capital.lng } : null,
        isDependency: !!c.iso
    };
});

/** Play a full session of one mode, returning the questions produced. */
function playSession(generate, scope, seed, extra = {}) {
    const rng = mulberry32(seed);
    const used = new Set();
    const out = [];
    for (let i = 0; i < QUESTIONS_PER_SESSION; i++) {
        const q = generate({ countries: TABLE, scope, used, rng, ...extra });
        if (!q) break;
        used.add(q.meta.country);
        out.push(q);
    }
    return out;
}

const ALL_SCOPES = ['globe', ...REGIONS];

describe('country table built from real assets', () => {
    it('covers every country in the mesh', () => {
        expect(TABLE).toHaveLength(237);
    });

    it('assigns a quiz region to every country', () => {
        // country-regions.js currently covers all 237 mesh countries. Asserting
        // the exact invariant (rather than a loose bound) means a country added
        // to the assets without a region entry fails here instead of silently
        // becoming unreachable in every region-scoped quiz.
        const unassigned = TABLE.filter(c => !c.region).map(c => c.name);
        expect(unassigned).toEqual([]);
    });
});

describe.each(ALL_SCOPES)('scope: %s', scope => {
    it('name-country fills a full 10-question session', () => {
        const session = playSession(generateNameCountry, scope, 11);
        expect(session).toHaveLength(QUESTIONS_PER_SESSION);
        expect(new Set(session.map(q => q.meta.country)).size).toBe(QUESTIONS_PER_SESSION);
        for (const q of session) {
            expect(q.payload.grid.options).toHaveLength(6);
            expect(q.payload.grid.options.map(o => o.value)).toContain(q.answer.correct[0]);
        }
    });

    it('capital fills a full 10-question session with real capitals', () => {
        const session = playSession(generateCapital, scope, 23);
        expect(session).toHaveLength(QUESTIONS_PER_SESSION);
        for (const q of session) {
            expect(q.payload.grid.options).toHaveLength(4);
            expect(q.payload.grid.options.map(o => o.value)).toContain(q.answer.correct[0]);
            expect(q.payload.map.marker).toBeTruthy();
        }
    });

    it('identify-flag fills a session and every answer has flag art', () => {
        const session = playSession(generateIdentifyFlag, scope, 37, { direction: 'forward' });
        expect(session).toHaveLength(QUESTIONS_PER_SESSION);
        for (const q of session) {
            const answer = TABLE.find(c => c.name === q.answer.correct[0]);
            expect(answer.iso).toBeTruthy();
        }
    });

    it('click-country yields targets, all large enough to tap', () => {
        const session = generateClickCountrySession({
            countries: TABLE, scope, rng: mulberry32(41)
        });
        expect(session.length).toBeGreaterThan(0);
        expect(session[0].meta.mode).toBe(MODES.CLICK_COUNTRY);
        if (scope !== 'N. America & Caribbean') {
            for (const q of session) {
                const rec = TABLE.find(c => c.name === q.meta.country);
                expect(rec.area == null || rec.area >= 1628).toBe(true);
            }
        }
    });
});

describe('reverse identify-flag on real data', () => {
    it.each(ALL_SCOPES)('scope %s: reverse questions have six flaggable options', scope => {
        const session = playSession(generateIdentifyFlag, scope, 53, { direction: 'reverse' });
        expect(session.length).toBeGreaterThan(0);
        for (const q of session) {
            if (q.meta.direction !== 'reverse') continue;
            for (const opt of q.payload.grid.options) {
                expect(opt.iso).toBeTruthy();
            }
        }
    });
});

describe('capital self-evidence filter on real data', () => {
    it('never asks a country whose capital gives it away', () => {
        const asked = new Set();
        for (let seed = 0; seed < 40; seed++) {
            for (const q of playSession(generateCapital, 'globe', seed)) asked.add(q.meta.country);
        }
        // Spot-check the canonical offenders named in the filter's docstring.
        for (const giveaway of ['Mexico', 'Tunisia', 'Monaco', 'Singapore', 'Djibouti']) {
            expect(asked).not.toContain(giveaway);
        }
        expect(asked.size).toBeGreaterThan(50);
    });
});
