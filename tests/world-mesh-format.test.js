import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Layout (see js/core/globe.js _buildCountryMesh):
//   [u32 vertexCount][u32 indexCount]
//   [f32 positions x 3*vertexCount]
//   [u8 ids x vertexCount, padded up to 4-byte alignment]
//   [u32 indices x indexCount]
const buf = readFileSync(fileURLToPath(new URL('../assets/world-mesh.bin', import.meta.url)));
const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

describe('world-mesh.bin format invariants', () => {
    const vertexCount = view.getUint32(0, true);
    const indexCount = view.getUint32(4, true);
    const idsPadded = (vertexCount + 3) & ~3;
    const posOffset = 8;
    const idsOffset = posOffset + vertexCount * 12;
    const idxOffset = idsOffset + idsPadded;

    it('has a sane header', () => {
        expect(vertexCount).toBeGreaterThan(0);
        expect(indexCount).toBeGreaterThan(0);
        expect(indexCount % 3).toBe(0); // whole triangles
    });

    it('total length matches the declared counts exactly', () => {
        const expected = idxOffset + indexCount * 4;
        expect(buf.byteLength).toBe(expected);
    });

    it('every index references a valid vertex', () => {
        const indices = new Uint32Array(buf.buffer, buf.byteOffset + idxOffset, indexCount);
        let max = 0;
        for (let i = 0; i < indices.length; i++) {
            if (indices[i] > max) max = indices[i];
        }
        expect(max).toBeLessThan(vertexCount);
    });

    it('every packed country id is a byte (< 256) and non-ocean ids exist', () => {
        const ids = new Uint8Array(buf.buffer, buf.byteOffset + idsOffset, vertexCount);
        let nonZero = 0;
        for (let i = 0; i < ids.length; i++) {
            // Uint8Array already guarantees < 256; assert real country ids are present.
            if (ids[i] !== 0) nonZero++;
        }
        expect(nonZero).toBeGreaterThan(0);
    });
});
