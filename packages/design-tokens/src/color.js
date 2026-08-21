/**
 * Minimal CSS-color parse/format, plus the two derivation helpers the token
 * system needs. Handles the forms design tokens actually use: #rgb / #rgba /
 * #rrggbb / #rrggbbaa and rgb()/rgba(). Returns/accepts {r,g,b,a}, a in 0..1.
 *
 * `mix` and `alpha` exist here rather than as CSS `color-mix()` because React
 * Native has no such function — and a design system whose derived values only
 * resolve in a browser cannot be the shared source of truth. Deriving in JS
 * emits concrete values both platforms can use.
 */

/** Parse a CSS color string to {r,g,b,a}, or null if unrecognised. */
export function parseColor(str) {
    if (!str) return null;
    str = String(str).trim();

    let m = /^#([0-9a-f]{3,8})$/i.exec(str);
    if (m) {
        let h = m[1];
        if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
        if (h.length !== 6 && h.length !== 8) return null;
        return {
            r: parseInt(h.slice(0, 2), 16),
            g: parseInt(h.slice(2, 4), 16),
            b: parseInt(h.slice(4, 6), 16),
            a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
        };
    }

    m = /^rgba?\(([^)]+)\)$/i.exec(str);
    if (m) {
        const p = m[1].split(',').map(s => s.trim());
        if (p.length >= 3) {
            return {
                r: parseFloat(p[0]), g: parseFloat(p[1]), b: parseFloat(p[2]),
                a: p[3] !== undefined ? parseFloat(p[3]) : 1,
            };
        }
    }
    return null;
}

const clamp255 = x => Math.max(0, Math.min(255, Math.round(x)));

/** {r,g,b} → #rrggbb (used to drive the native <input type=color> swatch). */
export function toHex({ r, g, b }) {
    const h = x => clamp255(x).toString(16).padStart(2, '0');
    return '#' + h(r) + h(g) + h(b);
}

/** {r,g,b,a} → CSS string: #rrggbb when opaque, else rgba(...). */
export function formatColor({ r, g, b, a }) {
    if (a >= 1) return toHex({ r, g, b });
    return `rgba(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)}, ${+Number(a).toFixed(3)})`;
}

/**
 * Blend `amount` (0..1) of `overlay` into `base`, returning a CSS string.
 * The JS stand-in for `color-mix(in srgb, …)`.
 *
 * @param {string} base
 * @param {string} overlay
 * @param {number} amount  0 = all base, 1 = all overlay
 * @returns {string}
 */
export function mix(base, overlay, amount) {
    const a = parseColor(base);
    const b = parseColor(overlay);
    if (!a || !b) throw new Error(`mix(): unparseable color (${base} / ${overlay})`);
    const t = Math.max(0, Math.min(1, amount));
    return formatColor({
        r: a.r + (b.r - a.r) * t,
        g: a.g + (b.g - a.g) * t,
        b: a.b + (b.b - a.b) * t,
        // Alpha blends too, so mixing into a translucent surface doesn't
        // silently become opaque.
        a: a.a + (b.a - a.a) * t,
    });
}

/**
 * Re-alpha a color, keeping its RGB. Replaces the alpha rather than scaling it,
 * so `alpha(x, 0.5)` means the same thing whatever `x` started at.
 *
 * @param {string} color
 * @param {number} a  0..1
 * @returns {string}
 */
export function alpha(color, a) {
    const c = parseColor(color);
    if (!c) throw new Error(`alpha(): unparseable color (${color})`);
    return formatColor({ ...c, a: Math.max(0, Math.min(1, a)) });
}

/**
 * Relative luminance (WCAG 2.x), 0..1. Used to decide whether a surface reads
 * as light or dark — e.g. picking a legible ink for an author-chosen fill.
 * @param {string} color
 * @returns {number}
 */
export function luminance(color) {
    const c = parseColor(color);
    if (!c) throw new Error(`luminance(): unparseable color (${color})`);
    const ch = v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

/**
 * WCAG contrast ratio between two colors, 1..21. Not enforced anywhere — it
 * powers a warning in the theme editor, because an author picking a pale
 * primary should be told before they ship an unreadable CTA.
 * @returns {number}
 */
export function contrastRatio(fg, bg) {
    const l1 = luminance(fg);
    const l2 = luminance(bg);
    const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
}

/** Convert a CSS color to the 0xRRGGBB int form Three.js takes. */
export function toThreeHex(color) {
    const c = parseColor(color);
    if (!c) throw new Error(`toThreeHex(): unparseable color (${color})`);
    return (clamp255(c.r) << 16) | (clamp255(c.g) << 8) | clamp255(c.b);
}
