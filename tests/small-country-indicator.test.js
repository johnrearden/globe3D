/**
 * SmallCountryIndicator lifecycle — verifies isShowing() tracks the marker mesh,
 * that update() only shows for countries in the small-country set (and clears any
 * previous marker first), and that remove() tears it down.
 *
 * The module reads `window.THREE` at import time and builds a small mesh graph, so
 * we install a minimal chainable THREE stub before importing. The stub does no real
 * geometry — the values don't affect isShowing(); we only need the calls not to throw.
 */
import { describe, it, expect, beforeEach } from 'vitest';

class V3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    clone() { return new V3(this.x, this.y, this.z); }
    normalize() { return this; }
    multiplyScalar() { return this; }
    add() { return this; }
    sub() { return this; }
    copy() { return this; }
}
class Quaternion { setFromUnitVectors() { return this; } copy() { return this; } }
class Object3D {
    constructor() { this.children = []; this.position = new V3(); this.quaternion = new Quaternion(); this.renderOrder = 0; }
    add(c) { this.children.push(c); }
    lookAt() {}
    traverse(cb) { cb(this); for (const c of this.children) (c.traverse ? c.traverse(cb) : cb(c)); }
}
class Mesh extends Object3D { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } }

globalThis.window = {
    THREE: {
        Group: Object3D,
        Mesh,
        Vector3: V3,
        Quaternion,
        CircleGeometry: class { dispose() {} },
        ConeGeometry: class { dispose() {} },
        BoxGeometry: class { dispose() {} },
        MeshBasicMaterial: class { constructor() {} dispose() {} },
        DoubleSide: 2,
    },
};

const { SmallCountryIndicator } = await import('../js/features/small-country-indicator.js');

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
                name === 'Tuvalu' ? { name, centroid: new V3(0, 1, 0) } : null,
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
