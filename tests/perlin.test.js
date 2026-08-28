/**
 * The extracted Perlin module must behave exactly like the inline one it
 * replaced.
 *
 * `js/utils/perlin.js` was transcribed out of a minified `window.noise` blob in
 * index.html, and a transcription error would not throw — the flag wave would
 * just ripple differently, which nobody would notice or be able to bisect. The
 * equivalence was checked sample-for-sample against the original blob at
 * extraction time; these pin the properties that would break if the permutation
 * table or the fade curve were ever disturbed again.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { perlin2, seed } from '../js/utils/perlin.js';

// The module seeds itself with 0 at import; restore that for other tests.
afterEach(() => seed(0));

describe('perlin2', () => {
    it('is exactly zero at integer lattice points', () => {
        // The defining property: gradients are dotted with a zero offset there.
        // A wrong permutation table still satisfies this, but a broken fade or
        // lerp does not.
        for (const [x, y] of [[0, 0], [1, 0], [0, 1], [7, -3], [-12, 25]]) {
            expect(perlin2(x, y), `(${x},${y})`).toBe(0);
        }
    });

    it('stays inside the theoretical range', () => {
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < 5000; i++) {
            const v = perlin2((i % 71) * 0.31 - 11, Math.floor(i / 71) * 0.47 - 7);
            min = Math.min(min, v);
            max = Math.max(max, v);
        }
        // ±1, not the ±√2/2 quoted for normalized-gradient Perlin: this variant
        // dots the 3D gradient set in 2D, so a gradient like (1,1,0) has length
        // √2 and the product can reach unity. The flag wave scales by 30/25 and
        // adds 1, so anything outside this would push vertices somewhere visible.
        expect(min).toBeGreaterThan(-1 - 1e-9);
        expect(max).toBeLessThan(1 + 1e-9);
        // And it really does approach those bounds, so this is a live check
        // rather than a range so loose nothing could fail it.
        expect(Math.max(-min, max)).toBeGreaterThan(0.8);
        // And it is genuinely varying, not a constant field.
        expect(max - min).toBeGreaterThan(0.5);
    });

    it('is deterministic for a seed', () => {
        seed(42);
        const first = Array.from({ length: 50 }, (_, i) => perlin2(i * 0.13, i * 0.29));
        seed(42);
        const again = Array.from({ length: 50 }, (_, i) => perlin2(i * 0.13, i * 0.29));
        expect(again).toEqual(first);
    });

    it('gives a different field for a different seed', () => {
        seed(1);
        const a = perlin2(3.3, 4.7);
        seed(2);
        expect(perlin2(3.3, 4.7)).not.toBe(a);
    });

    it('wraps at 256 in both axes', () => {
        // X &= 255 in the lookup, so the field is periodic. Relied on implicitly
        // by the wave, whose `time` term grows without bound.
        expect(perlin2(0.5, 0.5)).toBeCloseTo(perlin2(256.5, 256.5), 12);
    });
});
