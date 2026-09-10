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

describe('a strip the camera cannot frame into', () => {
    const phone = { width: 390, height: 844 };

    it('is treated as no free region: the globe centres behind the sheet', () => {
        // An 88vh sheet on a phone leaves ~100px. At the camera's farthest zoom
        // the globe is ~0.13·vh across (75° FOV, distance 10), so framing it
        // into 62% of 100px is impossible and the engine clamps it larger than
        // the strip — clipped above by the screen edge and below by the sheet.
        const tall = { left: 0, top: 101, width: 390, height: 743 };
        const f = framingFor(tall, phone);
        expect(f.focalAnchor).toEqual({ x: 0.5, y: 0.5 });
        expect(f.visibleFraction).toBe(1);
    });

    it('but a strip the apex now leaves is framed into as before', () => {
        // 58vh sheet → 354px free: the globe (0.62 · 354 ≈ 220px) fits at a
        // distance well inside the camera's range.
        const apex = { left: 0, top: 354, width: 390, height: 490 };
        const f = framingFor(apex, phone);
        expect(f.focalAnchor.y).toBeCloseTo(354 / 2 / 844, 6);
        expect(f.visibleFraction).toBeCloseTo(354 / 390, 6);
    });

    it('draws the line at 21% of the viewport height', () => {
        const just = (top) => framingFor({ left: 0, top, width: 390, height: 844 - top }, phone).visibleFraction;
        expect(just(Math.ceil(0.21 * 844) + 1)).toBeLessThan(1);
        expect(just(Math.floor(0.21 * 844) - 1)).toBe(1);
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

describe('visibleFraction', () => {
    it('reports how much of the short side is actually visible', () => {
        // Framing does not shrink with the viewport when a panel covers it —
        // setViewOffset moves the projection without rescaling — so a country
        // framed to 40% of the viewport spills behind the panel. This is the
        // factor that corrects it.
        const panel = { left: 893, top: 0, width: 547, height: 900 };
        const { visibleFraction } = framingFor(panel, { width: 1440, height: 900 });
        expect(visibleFraction).toBeCloseTo(Math.min(893, 900) / Math.min(1440, 900), 6);
        expect(visibleFraction).toBeLessThan(1);
    });

    it('is 1 when nothing covers the globe', () => {
        expect(framingFor(null, { width: 1440, height: 900 }).visibleFraction).toBe(1);
    });

    it('is always finite and positive', () => {
        for (const [panel, v] of [
            [null, { width: 1440, height: 900 }],
            [{ left: 0, top: 0, width: 1440, height: 900 }, { width: 1440, height: 900 }],
            [{ left: 5, top: 5, width: 5, height: 5 }, { width: 0, height: 0 }],
        ]) {
            const f = framingFor(panel, v);
            expect(Number.isFinite(f.visibleFraction)).toBe(true);
            expect(f.visibleFraction).toBeGreaterThan(0);
        }
    });
});
