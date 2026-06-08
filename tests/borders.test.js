import { describe, it, expect } from 'vitest';
import { BorderLayer } from '../js/features/borders.js';

// Minimal stand-in for GlobeManager.latLngToVector3 (same projection formula).
const gm = {
    latLngToVector3(lat, lng, radius = 1, height = 0) {
        const phi = (90 - lat) * Math.PI / 180;
        const theta = -(lng + 180) * Math.PI / 180;
        const r = radius + height;
        return {
            x: r * Math.sin(phi) * Math.cos(theta),
            y: r * Math.cos(phi),
            z: r * Math.sin(phi) * Math.sin(theta)
        };
    }
};

const radiusOf = (p) => Math.hypot(p.x, p.y, p.z);
// Country mesh sits at 1.002; borders must stay above it to avoid occlusion.
const COUNTRY_MESH_R = 1.002;

function buildPositions(ring) {
    const bl = new BorderLayer({ globeManager: gm });
    const positions = [];
    bl._addRing(ring, gm, positions);
    return positions;
}

// Walk the emitted vertex pairs; return the lowest midpoint radius of any drawn
// chord (the point most at risk of dipping below the country mesh).
function minChordMidRadius(positions) {
    let min = Infinity;
    for (let i = 0; i < positions.length; i += 6) {
        const a = { x: positions[i], y: positions[i + 1], z: positions[i + 2] };
        const b = { x: positions[i + 3], y: positions[i + 4], z: positions[i + 5] };
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
        min = Math.min(min, radiusOf(mid));
    }
    return min;
}

describe('border segment subdivision', () => {
    it('keeps a long straight border (US–Canada 49th parallel) on the surface', () => {
        // Two far-apart vertices at constant latitude, as stored in the GeoJSON.
        const ring = [[-123, 49], [-95, 49]];
        const positions = buildPositions(ring);

        // Subdivided into many segments rather than one buried chord.
        expect(positions.length / 6).toBeGreaterThan(10);

        // Every drawn chord's midpoint stays above the country mesh (not occluded).
        expect(minChordMidRadius(positions)).toBeGreaterThan(COUNTRY_MESH_R);

        // The single-chord version (averaging the two endpoint vectors) would
        // have sunk far below the surface and been occluded.
        const A = gm.latLngToVector3(49, -123, 1.0, 0.0035);
        const B = gm.latLngToVector3(49, -95, 1.0, 0.0035);
        const oneChordMid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, z: (A.z + B.z) / 2 };
        expect(radiusOf(oneChordMid)).toBeLessThan(COUNTRY_MESH_R);
    });

    it('leaves short segments as a single chord', () => {
        const ring = [[-100, 49], [-99, 49.5]]; // ~1° span → 1 segment
        const positions = buildPositions(ring);
        expect(positions.length / 6).toBe(1);
    });

    it('skips antimeridian-spanning segments', () => {
        const ring = [[179, 10], [-179, 10]]; // |Δlng| > 180
        expect(buildPositions(ring).length).toBe(0);
    });
});
