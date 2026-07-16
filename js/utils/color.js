/**
 * Minimal CSS-color parse/format for the theme editor's color rows. Handles the
 * forms the design tokens actually use: #rgb / #rgba / #rrggbb / #rrggbbaa and
 * rgb()/rgba(). Returns/accepts {r,g,b,a} with a in 0..1.
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
