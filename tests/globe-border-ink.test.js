/**
 * Country outlines and the graticule are one ink.
 *
 * `addLatLongLines` says so in a comment — the graticule is `--globe-border`
 * carried at a lower opacity, a derivation rather than two more tokens. But its
 * two materials were locals, so `setBorderColor` moved the outlines and left the
 * graticule at whatever colour it was built with. Nothing threw; the globe just
 * quietly wore two different inks after a theme change.
 *
 * This calls the method against a hand-built receiver rather than a real
 * GlobeManager: the constructor reads `--globe-border` through `cssToken`, which
 * needs `getComputedStyle(document.documentElement)`, and this suite has no DOM
 * by design. That the two materials are actually *retained* is the browser's to
 * confirm, and it is asserted in the theme-lab run.
 */
import { describe, it, expect } from 'vitest';
import { GlobeManager } from '../js/core/globe.js';

/** Just the fields setBorderColor touches, each recording what it was set to. */
function inkReceiver({ graticule = 2 } = {}) {
    const swatch = () => ({ set(v) { this.value = v; }, value: null });
    return {
        borderMaterial: { uniforms: { uColor: { value: swatch() } } },
        graticuleMaterials: Array.from({ length: graticule }, () => ({ color: swatch() })),
    };
}

const setBorderColor = (ctx, hex) => GlobeManager.prototype.setBorderColor.call(ctx, hex);

describe('setBorderColor', () => {
    it('recolours the graticule along with the outlines', () => {
        const ctx = inkReceiver();
        setBorderColor(ctx, '#abcdef');
        expect(ctx.borderMaterial.uniforms.uColor.value.value).toBe('#abcdef');
        expect(ctx.graticuleMaterials.map(m => m.color.value)).toEqual(['#abcdef', '#abcdef']);
    });

    it('records the colour so a later border rebuild uses it', () => {
        const ctx = inkReceiver();
        setBorderColor(ctx, '#123456');
        expect(ctx._borderColor).toBe('#123456');
    });

    it('survives being called before either line exists', () => {
        // Both assets are fail-soft: the border line is skipped if
        // world-border-lines.bin is missing, and the graticule is built during
        // loadGlobe. A settings restore can land before either.
        const bare = {};
        expect(() => setBorderColor(bare, '#abcdef')).not.toThrow();
        expect(bare._borderColor).toBe('#abcdef');
    });
});
