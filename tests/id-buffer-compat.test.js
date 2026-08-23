/**
 * world-id.bin layout compatibility.
 *
 * The asset went from 2 bytes/pixel to 1. Cloudflare's `max-age` means a
 * returning visitor can hold the OLD asset in their browser cache while getting
 * fresh JS from Pages — and purging the CDN cannot clear a browser cache. So the
 * loader has to accept both layouts for the length of that window, or every such
 * visitor gets a dead app.
 *
 * This tests the fold in isolation: GlobeManager needs WebGL, but the layout
 * logic is a pure function of the buffer and the dimensions, so it is reproduced
 * here against the real shape it guards. Keep in step with the block in
 * js/core/globe.js loadGlobe().
 */
import { describe, it, expect } from 'vitest';

/** The loader's layout normalisation, extracted for test. */
function normaliseIdBytes(buffer, idW, idH) {
    let idBytes = new Uint8Array(buffer);
    const pixels = idW * idH;
    if (idBytes.length === pixels * 2) {
        const packed = new Uint8Array(pixels);
        for (let i = 0; i < pixels; i++) packed[i] = idBytes[i * 2 + 1];
        idBytes = packed;
    } else if (idBytes.length !== pixels) {
        throw new Error(
            `world-id.bin size mismatch: got ${idBytes.length}, ` +
            `expected ${pixels} (1 byte/px) or ${pixels * 2} (legacy 2 byte/px)`);
    }
    return idBytes;
}

const W = 4, H = 2, PIXELS = W * H;
const IDS = [0, 1, 42, 237, 255, 7, 0, 199];

describe('world-id.bin layout', () => {
    it('accepts the current one-byte layout unchanged', () => {
        const buf = Uint8Array.from(IDS).buffer;
        expect([...normaliseIdBytes(buf, W, H)]).toEqual(IDS);
    });

    it('folds the legacy two-byte layout to the same ids', () => {
        // [hi, lo] per pixel, hi always 0 — which is what made the change safe.
        const two = new Uint8Array(PIXELS * 2);
        IDS.forEach((id, i) => { two[i * 2] = 0; two[i * 2 + 1] = id; });
        expect([...normaliseIdBytes(two.buffer, W, H)]).toEqual(IDS);
    });

    it('produces identical ids from either layout', () => {
        const one = Uint8Array.from(IDS);
        const two = new Uint8Array(PIXELS * 2);
        IDS.forEach((id, i) => { two[i * 2 + 1] = id; });
        expect([...normaliseIdBytes(one.buffer, W, H)])
            .toEqual([...normaliseIdBytes(two.buffer, W, H)]);
    });

    it('rejects a length that is neither layout', () => {
        expect(() => normaliseIdBytes(new Uint8Array(PIXELS + 1).buffer, W, H))
            .toThrow(/size mismatch/);
    });

    it('names both accepted lengths in the error, so the cause is diagnosable', () => {
        expect(() => normaliseIdBytes(new Uint8Array(3).buffer, W, H))
            .toThrow(/expected 8 \(1 byte\/px\) or 16 \(legacy 2 byte\/px\)/);
    });

    it('matches the real asset dimensions', async () => {
        // Guards against the fold being right but the dimensions drifting.
        const { readFileSync } = await import('node:fs');
        const meta = JSON.parse(readFileSync(new URL('../assets/country-meta.json', import.meta.url), 'utf8'));
        const stat = readFileSync(new URL('../assets/world-id.bin', import.meta.url));
        expect(stat.length).toBe(meta.idWidth * meta.idHeight);
    });
});
