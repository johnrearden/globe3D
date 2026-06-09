import { describe, it, expect } from 'vitest';
import { extractBorderEdges } from '../build-textures.js';

// Normalize an edge index pair to a "min-max" key for set comparison.
const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

function edgeSet(arr) {
    const s = new Set();
    for (let i = 0; i < arr.length; i += 2) s.add(key(arr[i], arr[i + 1]));
    return s;
}

describe('extractBorderEdges', () => {
    it('returns the outline of a quad and drops the shared interior diagonal', () => {
        // Two triangles sharing diagonal 0-2 form a quad 0-1-2-3.
        //   3 --- 2
        //   |  /  |
        //   0 --- 1
        const indices = [0, 1, 2, 0, 2, 3];
        const edges = extractBorderEdges(indices, 4);

        const s = edgeSet(edges);
        // Outline edges appear in exactly one triangle → kept.
        expect(s.has(key(0, 1))).toBe(true);
        expect(s.has(key(1, 2))).toBe(true);
        expect(s.has(key(2, 3))).toBe(true);
        expect(s.has(key(3, 0))).toBe(true);
        // Shared diagonal appears in both triangles → dropped.
        expect(s.has(key(0, 2))).toBe(false);
        expect(s.size).toBe(4);
        expect(edges).toBeInstanceOf(Uint32Array);
    });

    it('keeps every edge of a lone triangle (all used once)', () => {
        const edges = extractBorderEdges([5, 6, 7], 8);
        expect(edgeSet(edges)).toEqual(new Set([key(5, 6), key(6, 7), key(7, 5)]));
    });

    it('treats two disjoint countries (no shared vertices) as two full outlines', () => {
        // Country A = triangle 0-1-2, country B = triangle 3-4-5. Per-country
        // triangulation means borders never share indices, so all 6 edges remain.
        const edges = extractBorderEdges([0, 1, 2, 3, 4, 5], 6);
        expect(edges.length / 2).toBe(6);
    });

    it('encodes high vertex indices without collision (key = min*V + max)', () => {
        // Indices near a large V must decode back to the same pair.
        const V = 1000000;
        const a = 999998, b = 999999, c = 123456;
        const edges = extractBorderEdges([a, b, c], V);
        expect(edgeSet(edges)).toEqual(new Set([key(a, b), key(b, c), key(c, a)]));
    });
});
