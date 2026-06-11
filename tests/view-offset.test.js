import { describe, it, expect } from 'vitest';
import { viewOffsetFor } from '../js/utils/view-offset.js';

describe('viewOffsetFor (camera focal-anchor math)', () => {
    it('returns no shift for a centered anchor', () => {
        expect(viewOffsetFor(1000, 800, { x: 0.5, y: 0.5 })).toEqual({ x: 0, y: 0 });
    });

    it('pushes content up when the anchor is above center', () => {
        // anchor y=0.3 (higher up) -> positive y offset so the globe center
        // appears at 0.3*h, leaving the lower 70% for the options grid.
        const { x, y } = viewOffsetFor(1000, 800, { x: 0.5, y: 0.3 });
        expect(x).toBe(0);
        expect(y).toBeCloseTo(800 * 0.2); // h*(0.5-0.3)
        // The globe center then renders at h/2 - y = 0.3*h.
        expect(800 / 2 - y).toBeCloseTo(0.3 * 800);
    });

    it('shifts horizontally for an off-center x anchor', () => {
        const { x } = viewOffsetFor(1200, 600, { x: 0.25, y: 0.5 });
        expect(x).toBeCloseTo(1200 * 0.25); // w*(0.5-0.25)
    });
});
