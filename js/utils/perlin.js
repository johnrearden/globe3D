/**
 * 2D Perlin noise — the classic improved-noise permutation table.
 *
 * Extracted verbatim (algorithm and constants unchanged) from the minified blob
 * that lived as an inline `<script>` in `index.html`, where it set a
 * `window.noise` global. Two reasons it had to move:
 *
 *   - `flag-wave.js` read that global, so the flag wave could only run in a
 *     document that happened to have index.html's inline script. The Astro app
 *     has no such script, and the quiz that needs the wave runs there.
 *   - The project rule is that new logic is a module under `js/`, and inline
 *     script in `index.html` is what the refactor exists to remove.
 *
 * Formatted rather than reformulated: the permutation table and the gradient
 * set are the standard ones, and `tests/perlin.test.js` pins the properties a
 * transcription error would break — zero at lattice points, symmetry, range,
 * and determinism per seed.
 */

/** Gradient vector. Only `dot2` is used by 2D noise. */
class Grad {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    dot2(x, y) {
        return this.x * x + this.y * y;
    }
}

/** The 12 gradient directions of improved Perlin noise. */
const GRAD3 = [
    new Grad(1, 1, 0), new Grad(-1, 1, 0), new Grad(1, -1, 0), new Grad(-1, -1, 0),
    new Grad(1, 0, 1), new Grad(-1, 0, 1), new Grad(1, 0, -1), new Grad(-1, 0, -1),
    new Grad(0, 1, 1), new Grad(0, -1, 1), new Grad(0, 1, -1), new Grad(0, -1, -1),
];

/** Ken Perlin's permutation table. */
const P = [
    151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36,
    103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0,
    26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56,
    87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166, 77,
    146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220, 105, 92, 41, 55, 46,
    245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187,
    208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173,
    186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85,
    212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119,
    248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39,
    253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228,
    251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249,
    14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121,
    50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141,
    128, 195, 78, 66, 215, 61, 156, 180,
];

// Doubled to 512 so the lookups below can index `X + perm[Y + 1]` without
// wrapping by hand.
const perm = new Array(512);
const gradP = new Array(512);

/**
 * Reseed the permutation. Deterministic: the same seed always gives the same
 * field, which is what makes the wave reproducible.
 * @param {number} seed
 */
export function seed(value) {
    let s = value;
    if (s > 0 && s < 1) s *= 65536;
    s = Math.floor(s);
    if (s < 256) s |= s << 8;

    for (let i = 0; i < 256; i++) {
        const v = (i & 1) ? (P[i] ^ (s & 255)) : (P[i] ^ ((s >> 8) & 255));
        perm[i] = perm[i + 256] = v;
        gradP[i] = gradP[i + 256] = GRAD3[v % 12];
    }
}

seed(0);

/** Perlin's 6t⁵−15t⁴+10t³ ease, which makes the field C² continuous. */
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

const lerp = (a, b, t) => (1 - t) * a + t * b;

/**
 * 2D Perlin noise.
 * @returns {number} roughly in [-1, 1], and exactly 0 at integer lattice points
 */
export function perlin2(x, y) {
    let X = Math.floor(x);
    let Y = Math.floor(y);
    const fx = x - X;
    const fy = y - Y;
    X &= 255;
    Y &= 255;

    const n00 = gradP[X + perm[Y]].dot2(fx, fy);
    const n01 = gradP[X + perm[Y + 1]].dot2(fx, fy - 1);
    const n10 = gradP[X + 1 + perm[Y]].dot2(fx - 1, fy);
    const n11 = gradP[X + 1 + perm[Y + 1]].dot2(fx - 1, fy - 1);

    const u = fade(fx);
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), fade(fy));
}
