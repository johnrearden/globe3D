/**
 * SmallCountryIndicator lifecycle — verifies isShowing() tracks the marker mesh,
 * that update() only shows for countries in the small-country set (and clears any
 * previous marker first), and that remove() tears it down.
 *
 * The module builds a small mesh graph (geometries, materials, a Group), which real
 * three does happily in Node — none of it needs a WebGL context, since nothing is
 * rendered. So this runs against the actual library rather than a hand-written stub,
 * and would catch an API break on a three upgrade.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Vector3 } from 'three';
import { SmallCountryIndicator } from '../js/features/small-country-indicator.js';

function makeGlobe() {
    const children = [];
    return {
        children,
        add: (c) => children.push(c),
        remove: (c) => { const i = children.indexOf(c); if (i >= 0) children.splice(i, 1); },
    };
}

describe('SmallCountryIndicator', () => {
    let globe, indicator;
    beforeEach(() => {
        globe = makeGlobe();
        const globeManager = {
            getGlobe: () => globe,
            getCountryByName: (name) =>
                name === 'Tuvalu' ? { name, centroid: new Vector3(0, 1, 0) } : null,
        };
        indicator = new SmallCountryIndicator({ globeManager, smallCountries: new Set(['Tuvalu', 'Nauru']) });
    });

    it('starts hidden', () => {
        expect(indicator.isShowing()).toBe(false);
        expect(globe.children).toHaveLength(0);
    });

    it('shows the marker for a small country', () => {
        indicator.update('Tuvalu');
        expect(indicator.isShowing()).toBe(true);
        expect(globe.children).toHaveLength(1);
    });

    it('does not show (and clears any existing marker) for a non-small country', () => {
        indicator.update('Tuvalu');
        expect(indicator.isShowing()).toBe(true);
        indicator.update('France');                 // not in the small set
        expect(indicator.isShowing()).toBe(false);
        expect(globe.children).toHaveLength(0);
    });

    it('does not show for a small country with no centroid record', () => {
        // 'Nauru' is in the set but the mock has no record for it.
        indicator.update('Nauru');
        expect(indicator.isShowing()).toBe(false);
        expect(globe.children).toHaveLength(0);
    });

    it('replaces (not stacks) the marker on repeated update', () => {
        indicator.update('Tuvalu');
        indicator.update('Tuvalu');
        expect(indicator.isShowing()).toBe(true);
        expect(globe.children).toHaveLength(1);
    });

    it('remove() hides the marker and reports isShowing() false', () => {
        indicator.update('Tuvalu');
        indicator.remove();
        expect(indicator.isShowing()).toBe(false);
        expect(globe.children).toHaveLength(0);
    });
});
