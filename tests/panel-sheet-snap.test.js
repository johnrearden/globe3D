import { describe, it, expect } from 'vitest';
import { decideSnap } from '../js/features/daily-quiz/panel-sheet.js';

const MAX = 300;

describe('decideSnap', () => {
    it('stays expanded for a small drag with no fling', () => {
        expect(decideSnap(40, MAX, 0)).toBe('expanded');     // ~13% of travel
    });

    it('collapses when dragged past the threshold', () => {
        expect(decideSnap(160, MAX, 0)).toBe('collapsed');   // >33% of travel
    });

    it('collapses on a downward fling regardless of position', () => {
        expect(decideSnap(10, MAX, 0.8)).toBe('collapsed');
    });

    it('expands on an upward fling regardless of position', () => {
        expect(decideSnap(290, MAX, -0.8)).toBe('expanded');
    });

    it('is always expanded when there is no travel', () => {
        expect(decideSnap(0, 0, 0)).toBe('expanded');
    });
});
