/**
 * Framing the globe around the panel.
 *
 * The bug this follows: the globe was framed against the whole viewport while a
 * panel covered two thirds of it, so it rendered centred behind the panel and
 * looked like it had failed to load.
 */
import { describe, it, expect } from 'vitest';
import { framingFor } from '../apps/web/src/lib/globe-framing.ts';

const vp = { width: 1440, height: 900 };

describe('side by side (desktop)', () => {
    const panel = { left: 893, top: 0, width: 547, height: 900 };

    it('puts the globe in the middle of the free column, not the viewport', () => {
        const { focalAnchor } = framingFor(panel, vp);
        expect(focalAnchor.x).toBeCloseTo(893 / 2 / 1440, 6);
        expect(focalAnchor.y).toBe(0.5);
        // The whole point: left of centre.
        expect(focalAnchor.x).toBeLessThan(0.5);
    });

    it('sizes it to the free column, not the viewport', () => {
        const { widthFraction } = framingFor(panel, vp);
        expect(widthFraction * 1440).toBeCloseTo(0.62 * Math.min(893, 900), 6);
    });
});

describe('stacked (mobile bottom sheet)', () => {
    const small = { width: 390, height: 844 };
    const panel = { left: 0, top: 354, width: 390, height: 490 };

    it('puts the globe in the strip above the sheet', () => {
        const { focalAnchor } = framingFor(panel, small);
        expect(focalAnchor.x).toBe(0.5);
        expect(focalAnchor.y).toBeCloseTo(354 / 2 / 844, 6);
        expect(focalAnchor.y).toBeLessThan(0.5);
    });
});

describe('degenerate inputs never produce a broken camera', () => {
    it('centres when nothing covers the globe', () => {
        expect(framingFor(null, vp).focalAnchor).toEqual({ x: 0.5, y: 0.5 });
    });

    it('centres when the panel leaves no free region', () => {
        // A full-bleed or collapsed-to-nothing sheet: must not divide by zero.
        for (const panel of [
            { left: 0, top: 0, width: 1440, height: 900 },
            { left: 0, top: 0, width: 0, height: 0 },
        ]) {
            const f = framingFor(panel, vp);
            expect(f.focalAnchor).toEqual({ x: 0.5, y: 0.5 });
            expect(Number.isFinite(f.widthFraction)).toBe(true);
            expect(f.widthFraction).toBeGreaterThan(0);
        }
    });

    it('always returns finite, positive framing', () => {
        for (const v of [{ width: 0, height: 0 }, { width: 1, height: 10000 }]) {
            const f = framingFor({ left: 5, top: 5, width: 5, height: 5 }, v);
            expect(Number.isFinite(f.focalAnchor.x)).toBe(true);
            expect(Number.isFinite(f.focalAnchor.y)).toBe(true);
            expect(f.widthFraction).toBeGreaterThan(0);
        }
    });
});
