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
import { REGIONS } from '../js/data/country-regions.js';
import { countryToISO } from '../js/data/country-data.js';
import { createCountryTable } from '../js/data/country-table.js';

const read = rel => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));

const meta = read('../assets/country-meta.json');
const capitals = read('../assets/capitals.json');

/**
 * The real `createCountryTable`, over a GlobeManager reduced to the four
 * accessors it uses, each reproducing that method's actual logic on the real
 * assets. Previously this file hand-mirrored the table's construction — which
 * meant the mirror could drift from the thing it was standing in for, and the
 * suite would keep passing. Driving the real builder closes that gap: an
 * `isDependency` or `area` that doesn't survive the pipeline now fails here.
 */
const globeManagerStub = {
    getCentroids: () => meta.countries.map(c => ({
        name: c.name,
        // The runtime hands out a THREE.Vector3; the table only reads x/y/z.
        centroid: { x: c.centroid[0], y: c.centroid[1], z: c.centroid[2] },
    })),
    getCapitalsData: () => capitals,
    getCountryByName: name => meta.countries.find(c => c.name === name) || null,
    // js/core/globe.js getDependencyData(): every record carrying its own ISO
    // code. Only the curated dependency rows get one (build-textures.js:784).
    getDependencyData: () => Object.fromEntries(
        meta.countries.filter(c => c.iso).map(c => [c.name, { iso: c.iso, parent: c.parent || null }])
    ),
};

const TABLE = createCountryTable({ globeManager: globeManagerStub, countryToISO }).all;

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

describe('dependency eligibility on real data', () => {
    const NAME_COUNTRY_SEEDS = 400;

    /** Every distinct name-country answer across many seeded globe sessions. */
    const answers = (() => {
        const seen = new Set();
        for (let seed = 0; seed < NAME_COUNTRY_SEEDS; seed++) {
            for (const q of playSession(generateNameCountry, 'globe', seed)) {
                seen.add(q.meta.country);
            }
        }
        return seen;
    })();

    it('asks Greenland — the case this rule was changed for', () => {
        expect(answers).toContain('Greenland');
    });

    it('asks the other substantial territories too', () => {
        // Not an exhaustive list; these are the ones large enough that a player
        // would reasonably expect to be asked about them.
        for (const name of ['French Guiana', 'New Caledonia', 'Falkland Islands', 'Puerto Rico']) {
            expect(answers, `expected ${name} to be askable`).toContain(name);
        }
    });

    it('never asks about a speck', () => {
        // These are real dependencies under the threshold; highlighting one on
        // the globe and asking "which country is this?" is not a fair question.
        for (const name of ['Gibraltar', 'Tokelau', 'Pitcairn Islands', 'Bermuda', 'Norfolk Island']) {
            expect(answers, `${name} should be excluded`).not.toContain(name);
        }
    });

    it('still asks small sovereign states, which are NOT size-filtered', () => {
        // The rule gates dependencies only. Removing these would be a
        // regression, not a side effect.
        for (const name of ['Singapore', 'Malta', 'Barbados', 'Bahrain', 'Maldives']) {
            expect(answers, `expected ${name} to remain askable`).toContain(name);
        }
    });

    it('never asks for a dependency\'s capital, whatever its size', () => {
        // Ruled separately from the name-country change: Nuuk is a far more
        // obscure fact than a sovereign capital, so being large does not make a
        // territory fair game here.
        const capitalAnswers = new Set();
        for (let seed = 0; seed < 200; seed++) {
            for (const q of playSession(generateCapital, 'globe', seed)) {
                capitalAnswers.add(q.meta.country);
            }
        }
        expect(capitalAnswers).not.toContain('Greenland');
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
