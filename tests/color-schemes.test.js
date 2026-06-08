import { describe, it, expect } from 'vitest';
import { deriveShade, SCHEMES } from '../js/features/color-schemes.js';

// A spread of original country colors (0–255) to derive from.
const SAMPLES = [
    [200, 40, 40], [40, 120, 200], [230, 210, 60], [90, 90, 90],
    [10, 200, 120], [180, 60, 200], [250, 250, 250], [25, 25, 25]
];

describe('color schemes', () => {
    it('offers vibrant + three spartan schemes', () => {
        const keys = SCHEMES.map(s => s.key);
        expect(keys).toEqual(['vibrant', 'greens', 'browns', 'uniform']);
    });

    it('derivation is deterministic', () => {
        for (let id = 1; id < 60; id++) {
            const [r, g, b] = SAMPLES[id % SAMPLES.length];
            const a = deriveShade('greens', r, g, b, id);
            const c = deriveShade('greens', r, g, b, id);
            expect(a).toEqual(c);
        }
    });

    it('greens stay in the green family (green is the dominant channel)', () => {
        for (let id = 1; id < 60; id++) {
            const [r, g, b] = SAMPLES[id % SAMPLES.length];
            const [or, og, ob] = deriveShade('greens', r, g, b, id);
            expect(og).toBeGreaterThanOrEqual(or);
            expect(og).toBeGreaterThanOrEqual(ob);
            for (const ch of [or, og, ob]) {
                expect(ch).toBeGreaterThanOrEqual(0);
                expect(ch).toBeLessThanOrEqual(255);
            }
        }
    });

    it('browns stay warm (red is the dominant channel, blue the weakest)', () => {
        for (let id = 1; id < 60; id++) {
            const [r, g, b] = SAMPLES[id % SAMPLES.length];
            const [or, og, ob] = deriveShade('browns', r, g, b, id);
            expect(or).toBeGreaterThanOrEqual(og);
            expect(og).toBeGreaterThanOrEqual(ob);
        }
    });

    it('brighter originals map to lighter shades', () => {
        const dark = deriveShade('greens', 20, 20, 20, 5);
        const light = deriveShade('greens', 240, 240, 240, 5); // same id → same hue/sat jitter
        const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
        expect(lum(light)).toBeGreaterThan(lum(dark));
    });
});
