import { describe, it, expect } from 'vitest';
import { mulberry32, randomInt, pick, sample, shuffle } from '../src/index.js';

describe('mulberry32', () => {
    it('is reproducible for a seed and differs between seeds', () => {
        const a = Array.from({ length: 5 }, mulberry32(7));
        const b = Array.from({ length: 5 }, mulberry32(7));
        const c = Array.from({ length: 5 }, mulberry32(8));
        expect(a).toEqual(b);
        expect(a).not.toEqual(c);
    });

    it('stays within [0, 1)', () => {
        const rng = mulberry32(3);
        for (let i = 0; i < 1000; i++) {
            const v = rng();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });
});

describe('shuffle', () => {
    it('preserves the multiset and does not mutate the input', () => {
        const input = [1, 2, 3, 4, 5];
        const out = shuffle(mulberry32(1), input);
        expect(out.slice().sort()).toEqual(input);
        expect(input).toEqual([1, 2, 3, 4, 5]);
    });

    /**
     * Regression guard for the biased `sort(() => Math.random() - 0.5)` idiom
     * this replaced (name-flag-quiz.js:216). That comparator is inconsistent,
     * so V8's sort leaves elements near their original index far more often
     * than chance — meaning the correct answer favoured certain option slots.
     *
     * Over 24k Fisher-Yates shuffles of 6 items, every element should land in
     * every slot ~1/6 of the time. A 3-percentage-point tolerance is loose
     * enough to never flake on a fair shuffle and tight enough that the old
     * comparator (which lands >30% on the diagonal) fails it.
     */
    it('distributes each element across all positions roughly uniformly', () => {
        const n = 6;
        const trials = 24000;
        const rng = mulberry32(99);
        const counts = Array.from({ length: n }, () => new Array(n).fill(0));

        for (let t = 0; t < trials; t++) {
            const out = shuffle(rng, [0, 1, 2, 3, 4, 5]);
            out.forEach((value, slot) => { counts[value][slot]++; });
        }

        const expected = 1 / n;
        for (let value = 0; value < n; value++) {
            for (let slot = 0; slot < n; slot++) {
                expect(Math.abs(counts[value][slot] / trials - expected)).toBeLessThan(0.03);
            }
        }
    });
});

describe('sample', () => {
    it('returns distinct elements', () => {
        const out = sample(mulberry32(4), [1, 2, 3, 4, 5, 6, 7, 8], 4);
        expect(out).toHaveLength(4);
        expect(new Set(out).size).toBe(4);
    });

    it('caps at the pool size rather than padding or throwing', () => {
        expect(sample(mulberry32(4), [1, 2], 10)).toHaveLength(2);
    });
});

describe('pick / randomInt', () => {
    it('pick returns undefined for an empty array', () => {
        expect(pick(mulberry32(1), [])).toBeUndefined();
    });

    it('randomInt stays in range', () => {
        const rng = mulberry32(5);
        for (let i = 0; i < 500; i++) {
            const v = randomInt(rng, 4);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(4);
        }
    });
});
