import { describe, it, expect } from 'vitest';
import {
    MODES,
    buildFlagDirectionSchedule,
    generateCapital,
    generateClickCountrySession,
    generateIdentifyFlag,
    generateNameCountry,
    mulberry32
} from '../src/index.js';
import {
    BASE, DEPENDENCY, FULL, NO_CAPITAL, NO_FLAG, OTHER_REGION,
    SELF_EVIDENT, TINY, UNKNOWN_AREA, capitalOf, optionValues
} from './fixtures.js';

const seeded = (n = 1) => mulberry32(n);

describe('generateNameCountry', () => {
    it('returns six options, one of which is the answer', () => {
        const r = generateNameCountry({ countries: BASE, rng: seeded() });
        expect(r.payload.grid.options).toHaveLength(6);
        expect(optionValues(r)).toContain(r.answer.correct[0]);
        expect(new Set(optionValues(r)).size).toBe(6);
    });

    it('picks the five nearest countries as distractors', () => {
        // Force Alpha (0°) as the answer by leaving only it unused.
        const used = new Set(BASE.slice(1).map(c => c.name));
        const r = generateNameCountry({ countries: BASE, used, rng: seeded() });
        expect(r.answer.correct).toEqual(['Alpha']);
        // Nearest five to Alpha are the next five by angle.
        expect(optionValues(r).sort()).toEqual(
            ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'].sort()
        );
    });

    it('never answers with a dependency', () => {
        for (let s = 0; s < 50; s++) {
            const r = generateNameCountry({ countries: FULL, scope: 'Testland', rng: seeded(s) });
            expect(r.answer.correct[0]).not.toBe(DEPENDENCY.name);
            expect(optionValues(r)).not.toContain(DEPENDENCY.name);
        }
    });

    it('honours region scope', () => {
        const r = generateNameCountry({ countries: FULL, scope: 'Otherland', rng: seeded() });
        // Otherland has a single country, so a 6-option question is impossible.
        expect(r).toBeNull();
    });

    it('returns null once every country has been used', () => {
        const used = new Set(BASE.map(c => c.name));
        expect(generateNameCountry({ countries: BASE, used, rng: seeded() })).toBeNull();
    });

    it('is deterministic for a given seed', () => {
        const a = generateNameCountry({ countries: BASE, rng: seeded(42) });
        const b = generateNameCountry({ countries: BASE, rng: seeded(42) });
        expect(a).toEqual(b);
    });

    it('emits the backend payload shape', () => {
        const r = generateNameCountry({ countries: BASE, rng: seeded() });
        expect(r.payload).toMatchObject({
            type: 'name-country',
            grid: { cols: 2, multiSelect: false, display: 'name' },
            answer: { method: 'grid-single' }
        });
        expect(r.payload.map.highlight).toEqual([r.answer.correct[0]]);
        // The payload must never carry the answer.
        expect(JSON.stringify(r.payload)).not.toContain('correct');
    });
});

describe('generateIdentifyFlag', () => {
    it('never answers with a country lacking an ISO code', () => {
        for (let s = 0; s < 50; s++) {
            const r = generateIdentifyFlag({ countries: FULL, scope: 'Testland', rng: seeded(s) });
            expect(r.answer.correct[0]).not.toBe(NO_FLAG.name);
        }
    });

    it('allows dependencies, unlike name-country', () => {
        const names = new Set();
        for (let s = 0; s < 200; s++) {
            const r = generateIdentifyFlag({ countries: FULL, scope: 'Testland', rng: seeded(s) });
            names.add(r.answer.correct[0]);
        }
        expect(names).toContain(DEPENDENCY.name);
    });

    it('reverse direction excludes flagless distractors', () => {
        for (let s = 0; s < 50; s++) {
            const r = generateIdentifyFlag({
                countries: FULL, scope: 'Testland', direction: 'reverse', rng: seeded(s)
            });
            if (r.meta.direction !== 'reverse') continue;
            expect(optionValues(r)).not.toContain(NO_FLAG.name);
            expect(r.payload.grid.display).toBe('flag');
        }
    });

    it('falls back to forward when a region cannot supply five flaggable distractors', () => {
        // Six countries but only two carry an ISO code.
        const sparse = BASE.slice(0, 6).map((c, i) => (i < 2 ? c : { ...c, iso: null }));
        const r = generateIdentifyFlag({ countries: sparse, direction: 'reverse', rng: seeded() });
        expect(r.meta.direction).toBe('forward');
        expect(r.payload.grid.display).toBe('name');
        expect(r.payload.flag).toEqual({ iso: r.payload.flag.iso });
    });

    it('attaches the answer flag only in the forward direction', () => {
        const fwd = generateIdentifyFlag({ countries: BASE, direction: 'forward', rng: seeded() });
        expect(fwd.payload.flag.iso).toBeTruthy();
        const rev = generateIdentifyFlag({ countries: BASE, direction: 'reverse', rng: seeded() });
        expect(rev.payload.flag).toBeUndefined();
    });
});

describe('generateCapital', () => {
    it('returns four options', () => {
        const r = generateCapital({ countries: BASE, rng: seeded() });
        expect(r.payload.grid.options).toHaveLength(4);
        expect(optionValues(r)).toContain(r.answer.correct[0]);
    });

    it('excludes countries without a capital, with a self-evident capital, and dependencies', () => {
        for (let s = 0; s < 80; s++) {
            const r = generateCapital({ countries: FULL, scope: 'Testland', rng: seeded(s) });
            for (const banned of [NO_CAPITAL.name, SELF_EVIDENT.name, DEPENDENCY.name]) {
                expect(r.meta.country).not.toBe(banned);
                expect(optionValues(r)).not.toContain(banned);
            }
        }
    });

    it('forward asks the capital and answers with a city', () => {
        const r = generateCapital({ countries: BASE, direction: 'forward', rng: seeded() });
        const countryNames = new Set(BASE.map(c => c.name));
        expect(r.payload.prompt).toBe(`What is the capital of ${r.meta.country}?`);
        expect(r.answer.correct[0]).toBe(capitalOf(r.meta.country));
        // Every option is a city, none is a country name.
        expect(optionValues(r).some(v => countryNames.has(v))).toBe(false);
    });

    it('reverse asks the country and answers with a country', () => {
        const r = generateCapital({ countries: BASE, direction: 'reverse', rng: seeded() });
        const countryNames = new Set(BASE.map(c => c.name));
        expect(r.payload.prompt).toBe(
            `${capitalOf(r.meta.country)} is the capital of which country?`
        );
        expect(r.answer.correct[0]).toBe(r.meta.country);
        expect(optionValues(r).every(v => countryNames.has(v))).toBe(true);
    });

    it('drops a capital marker on the globe', () => {
        const r = generateCapital({ countries: BASE, direction: 'forward', rng: seeded() });
        expect(r.payload.map.marker).toEqual({ lat: 0, lng: expect.any(Number) });
    });
});

describe('generateClickCountrySession', () => {
    it('produces ten map-click questions', () => {
        const many = Array.from({ length: 30 }, (_, i) => ({ ...BASE[i % BASE.length], name: `C${i}` }));
        const session = generateClickCountrySession({ countries: many, rng: seeded() });
        expect(session).toHaveLength(10);
        expect(session[0].payload.answer.method).toBe('map-click-single');
        expect(session[0].payload.grid).toBeUndefined();
        expect(session[0].meta.mode).toBe(MODES.CLICK_COUNTRY);
    });

    it('excludes countries below the area threshold but keeps unknown areas', () => {
        const session = generateClickCountrySession({
            countries: FULL, scope: 'Testland', rng: seeded(), count: 99
        });
        const names = session.map(q => q.meta.country);
        expect(names).not.toContain(TINY.name);
        expect(names).toContain(UNKNOWN_AREA.name);
    });

    it('skips the area filter for the Caribbean region', () => {
        const caribbean = [{ ...TINY, region: 'N. America & Caribbean' }];
        const session = generateClickCountrySession({
            countries: caribbean, scope: 'N. America & Caribbean', rng: seeded()
        });
        expect(session.map(q => q.meta.country)).toEqual([TINY.name]);
    });

    it('yields fewer than ten when a small region cannot supply more', () => {
        const session = generateClickCountrySession({
            countries: FULL, scope: 'Otherland', rng: seeded()
        });
        expect(session).toHaveLength(1);
        expect(session[0].meta.country).toBe(OTHER_REGION.name);
    });

    it('never repeats a country within a session', () => {
        const session = generateClickCountrySession({ countries: FULL, scope: 'Testland', rng: seeded() });
        expect(new Set(session.map(q => q.meta.country)).size).toBe(session.length);
    });
});

describe('buildFlagDirectionSchedule', () => {
    it('balances five forward and five reverse', () => {
        const s = buildFlagDirectionSchedule(seeded());
        expect(s).toHaveLength(10);
        expect(s.filter(d => d === 'forward')).toHaveLength(5);
        expect(s.filter(d => d === 'reverse')).toHaveLength(5);
    });

    it('varies the order between seeds', () => {
        const a = buildFlagDirectionSchedule(seeded(1)).join();
        const b = buildFlagDirectionSchedule(seeded(7)).join();
        expect(a).not.toBe(b);
    });
});
