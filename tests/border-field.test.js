import { describe, it, expect } from 'vitest';
import { buildBorderField } from '../build-textures.js';

// Pack a 2D array of country ids ([H][W]) into the RG byte layout the ID buffer
// uses: two bytes per pixel, big-endian 16-bit id (idHi, idLo).
function makeIdBuf(rows) {
    const h = rows.length, w = rows[0].length;
    const buf = new Uint8Array(w * h * 2);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const id = rows[y][x];
            const i = (y * w + x) * 2;
            buf[i] = (id >> 8) & 0xff;
            buf[i + 1] = id & 0xff;
        }
    }
    return { buf, w, h };
}

// A uniform row repeated to fill `h` rows (no left/right id change → no X-wrap
// borders, so a horizontal seam is the only border).
const rowOf = (w, id) => new Array(w).fill(id);

describe('buildBorderField', () => {
    it('marks a country↔country seam as on-border (byte 0)', () => {
        // 4 wide, 20 tall: rows 0–9 = country 1, rows 10–19 = country 2.
        const W = 4, H = 20;
        const rows = [];
        for (let y = 0; y < H; y++) rows.push(rowOf(W, y < 10 ? 1 : 2));
        const { buf } = makeIdBuf(rows);

        const field = buildBorderField(buf, W, H, 8);

        // Both rows adjacent to the seam are border pixels → 0.
        for (let x = 0; x < W; x++) {
            expect(field[9 * W + x]).toBe(0);
            expect(field[10 * W + x]).toBe(0);
        }
    });

    it('treats a coastline (country↔ocean id 0) as a border', () => {
        const W = 4, H = 6;
        const rows = [];
        for (let y = 0; y < H; y++) rows.push(rowOf(W, y < 3 ? 1 : 0)); // land over ocean
        const { buf } = makeIdBuf(rows);

        const field = buildBorderField(buf, W, H, 8);

        for (let x = 0; x < W; x++) {
            expect(field[2 * W + x]).toBe(0); // last land row
            expect(field[3 * W + x]).toBe(0); // first ocean row
        }
    });

    it('saturates interior pixels (no seam within clamp) to 255', () => {
        // Single country everywhere → no borders anywhere → all clamped max.
        const W = 20, H = 20;
        const rows = [];
        for (let y = 0; y < H; y++) rows.push(rowOf(W, 7));
        const { buf } = makeIdBuf(rows);

        const field = buildBorderField(buf, W, H, 8);

        expect(field[10 * W + 10]).toBe(255);
        expect(field.every(v => v === 255)).toBe(true);
    });

    it('produces a monotonic ramp walking away from a seam', () => {
        const W = 4, H = 20;
        const rows = [];
        for (let y = 0; y < H; y++) rows.push(rowOf(W, y < 10 ? 1 : 2));
        const { buf } = makeIdBuf(rows);

        const field = buildBorderField(buf, W, H, 8);

        // Column 0, walking up from the seam (row 9 = 0) to the top: non-decreasing.
        let prev = -1;
        for (let y = 9; y >= 0; y--) {
            const v = field[y * W];
            expect(v).toBeGreaterThanOrEqual(prev);
            prev = v;
        }
        expect(field[0]).toBe(255); // 9 texels from the seam, beyond clamp 8
    });

    it('wraps in X so the antimeridian seam is a border (not a far interior)', () => {
        // Columns 0–4 = country 1, column 5 = country 2. Column 0 is 4 texels from
        // the in-row seam, but borders country 2 across the wrap → must be byte 0.
        const W = 6, H = 2;
        const rows = [rowOf(W, 1), rowOf(W, 1)];
        for (let y = 0; y < H; y++) rows[y][5] = 2;
        const { buf } = makeIdBuf(rows);

        const field = buildBorderField(buf, W, H, 8);

        expect(field[0]).toBe(0);     // wrap neighbour (col 5) differs → on border
        expect(field[5]).toBe(0);     // the seam column itself
    });
});
