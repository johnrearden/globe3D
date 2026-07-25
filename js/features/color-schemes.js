/**
 * Color schemes — recolor every country at once for a calmer, "spartan" look.
 *
 * The vibrant build palette stays the default. Greens/Browns map each country
 * onto a shade within one hue family, derived from that country's *original*
 * color luminance so neighbours land on different shades (borders reinforce the
 * separation). Uniform paints all land a single muted color.
 *
 * The derivation (deriveShade) is a pure function so it can be unit-tested.
 */

const PALETTE_W = 256;

// Picker options, in display order. `vibrant` restores the exact build palette.
// Keys mirror COUNTRY_SCHEMES in backend/themes/tokens.py (themes can pin one).
export const SCHEMES = [
    { key: 'vibrant', label: 'Vibrant' },
    { key: 'greens', label: 'Greens' },
    { key: 'browns', label: 'Browns' },
    { key: 'uniform', label: 'Uniform' },
    { key: 'blues', label: 'Blues' },
    { key: 'purples', label: 'Purples' },
    { key: 'greys', label: 'Greys' }
];

// Hue family (degrees) + base saturation for each derived scheme. Kept low for
// a muted, washed-out look. Any key here is handled generically by applyScheme.
const FAMILIES = {
    greens: { hue: 120, sat: 0.24 },
    browns: { hue: 30, sat: 0.28 },
    blues: { hue: 210, sat: 0.26 },
    purples: { hue: 275, sat: 0.24 },
    greys: { hue: 0, sat: 0 } // near-desaturated; tiny per-id jitter keeps neighbours distinct
};

// The single land color used by the Uniform scheme (muted khaki/sand).
const UNIFORM_RGB = [194, 178, 128];

// Per-scheme tint for the selected country. The selection mechanism is
// unchanged; only the color differs so it reads well on each background.
const HIGHLIGHT = {
    vibrant: 0xffffff,
    greens: 0xffc107, // amber pops on green
    browns: 0xfff2cc, // warm cream pops on brown
    uniform: 0xff5722, // deep orange pops on khaki
    blues: 0xffb300, // amber pops on blue
    purples: 0xffd54f, // gold pops on purple
    greys: 0x9e9e9e // mid-gray highlight (contrasts the grey scheme; gradient headroom)
};

/** Deterministic small jitter from a country id, in [-1, 1]. */
function idJitter(id) {
    // cheap hash → fractional → centered
    const x = Math.sin(id * 12.9898) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1;
}

/** HSL (h in [0,360], s/l in [0,1]) → [r,g,b] 0–255. */
function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Map an original country color onto a shade within `family` ('greens' |
 * 'browns'). Pure — exported for tests. Returns [r,g,b] 0–255.
 */
export function deriveShade(family, r, g, b, id) {
    const fam = FAMILIES[family];
    if (!fam) return [r, g, b];
    // Perceptual luminance of the original color, 0–1.
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    // Darker, low band so countries stay distinct but muted and earthy.
    const lightness = 0.20 + lum * 0.26;            // 0.20 … 0.46
    // Floor at 0 (not 0.08) so a sat-0 family like `greys` reads as true grey;
    // the saturated families sit well above the floor anyway.
    const sat = Math.max(0, Math.min(0.38, fam.sat + idJitter(id) * 0.06));
    const hue = fam.hue + idJitter(id + 97) * 8;    // ±8° hue wander within family
    return hslToRgb(hue, sat, lightness);
}

/**
 * Apply a color scheme to the globe. Recolors all countries via
 * globeManager.applyBaseColors and sets the matching highlight tint.
 */
export function applyScheme(globeManager, key) {
    if (!globeManager || !globeManager.paletteOriginal) return;
    const orig = globeManager.paletteOriginal;
    const rgbById = new Array(PALETTE_W);

    for (let id = 1; id < PALETTE_W; id++) {
        const off = id * 4;
        const r = orig[off], g = orig[off + 1], b = orig[off + 2];
        if (FAMILIES[key]) {
            rgbById[id] = deriveShade(key, r, g, b, id);
        } else if (key === 'uniform') {
            rgbById[id] = UNIFORM_RGB;
        } else {
            rgbById[id] = [r, g, b]; // vibrant — exact restore
        }
    }

    globeManager.applyBaseColors(rgbById);
    globeManager.setHighlightColor(HIGHLIGHT[key] ?? HIGHLIGHT.vibrant);
}
