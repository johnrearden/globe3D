/**
 * The token system: the knob set, the derivations, and the three generators.
 *
 * Replaces tests/theme-tokens.test.js, which guarded a three-way hand-mirroring
 * (styles.css → js/data/theme-tokens.js → backend/themes/tokens.py) by asserting
 * the middle copy's shape. There is one copy now, so these test what it
 * produces instead of that it matches something else.
 */
import { describe, it, expect } from 'vitest';
import {
    KNOB_GROUPS, KNOBS, KNOB_NAMES, COLOR_TOKENS,
    STATUS, TYPE_SCALE, SPACING, FIXED_RADII,
    defaultTheme, derive, resolveTheme, pickKnobs,
    toCss, toCssVariables, toNativeTheme,
    toPythonAllowList, spliceGeneratedBlock, GENERATED_BEGIN, GENERATED_END,
    parseColor,
} from '../src/index.js';

describe('the knob set', () => {
    it('is exactly 13 knobs', () => {
        // The number is the design decision: the previous system had 24 and
        // still could not express a coherent theme.
        expect(KNOB_NAMES).toHaveLength(13);
    });

    it('covers the six intended groups', () => {
        expect(KNOB_GROUPS.map(g => g.title))
            .toEqual(['Type', 'Surfaces', 'Brand', 'Text', 'Globe', 'Shape']);
    });

    it('has both a raised and an inset surface', () => {
        // One "elevated" colour cannot express both directions off a panel.
        expect(KNOB_NAMES).toContain('surface-raised');
        expect(KNOB_NAMES).toContain('surface-inset');
    });

    it('has one primary and no secondary accent', () => {
        const brand = KNOB_NAMES.filter(n => n === 'primary' || n.startsWith('primary-'));
        expect(brand).toEqual(['primary']);
        expect(KNOB_NAMES).not.toContain('accent-secondary');
    });

    it('exposes ocean as its own knob', () => {
        // It cannot derive from bg-app: a dark backdrop with a derived-dark
        // ocean makes the globe vanish into the page.
        expect(KNOB_NAMES).toContain('ocean');
    });

    it('exposes exactly two font and two radius knobs', () => {
        expect(KNOBS.filter(k => k.type === 'font').map(k => k.name))
            .toEqual(['font-heading', 'font-body']);
        expect(KNOBS.filter(k => k.type === 'length').map(k => k.name))
            .toEqual(['radius-btn', 'radius-panel']);
    });

    it('names are unique and CSS-safe', () => {
        expect(new Set(KNOB_NAMES).size).toBe(KNOB_NAMES.length);
        for (const n of KNOB_NAMES) expect(n).toMatch(/^[a-z][a-z0-9-]*$/);
    });

    it('every knob has a label, a known type and a parseable default', () => {
        for (const k of KNOBS) {
            expect(typeof k.label).toBe('string');
            expect(['color', 'font', 'length']).toContain(k.type);
            expect(k.value.trim()).not.toBe('');
            if (k.type === 'color') expect(parseColor(k.value)).not.toBe(null);
            if (k.type === 'length') expect(k.value).toMatch(/^[\d.]+(px|rem|%)$/);
        }
    });

    it('the groups are frozen so a consumer cannot widen the set at runtime', () => {
        expect(Object.isFrozen(KNOB_GROUPS)).toBe(true);
        expect(Object.isFrozen(KNOBS)).toBe(true);
    });
});

describe('what is deliberately NOT authorable', () => {
    it('keeps status colours out of the knobs', () => {
        // Red/green is the most common colour-vision deficiency; these are
        // always icon-paired, and a theme must not be able to break that.
        expect(KNOB_NAMES).not.toContain('status-correct');
        expect(KNOB_NAMES).not.toContain('status-incorrect');
        expect(Object.keys(STATUS)).toEqual(['status-correct', 'status-incorrect']);
    });

    it('keeps the type and spacing scales fixed', () => {
        expect(Object.keys(TYPE_SCALE)).toHaveLength(5);
        expect(Object.keys(SPACING)).toHaveLength(6);
        for (const n of [...Object.keys(TYPE_SCALE), ...Object.keys(SPACING)]) {
            expect(KNOB_NAMES).not.toContain(n);
        }
    });

    it('keeps pill and circle radii fixed while the two roundness knobs stay editable', () => {
        expect(Object.keys(FIXED_RADII)).toEqual(['radius-pill', 'radius-circle']);
        expect(KNOB_NAMES).toContain('radius-btn');
        expect(KNOB_NAMES).toContain('radius-panel');
    });
});

describe('derivation', () => {
    const t = defaultTheme();

    it('derives every non-knob colour from a knob, not a literal', () => {
        // Shift every knob any derivation reads, then require the whole derived
        // set to move. Anything that does not is a hardcoded value hiding in the
        // derivation table.
        const base = derive(t);
        const shifted = derive({
            ...t,
            'text-primary': '#ff0000',
            'text-secondary': '#00aa00',
            'bg-app': '#00ff00',
            'surface-inset': '#123456',
            primary: '#0000ff',
        });
        for (const key of Object.keys(base)) {
            expect(shifted[key], `${key} did not track its source knob`).not.toBe(base[key]);
        }
    });

    it('emits concrete values — no var() or color-mix() reaches an artefact', () => {
        // React Native resolves neither, so a browser-only fallback here would
        // silently diverge from what native renders.
        for (const v of Object.values(resolveTheme())) {
            expect(String(v)).not.toMatch(/var\(|color-mix\(/);
        }
    });

    it('makes the globe selection a mid-tone with headroom in both directions', () => {
        // The radial selection gradient brightens the centre AND darkens the
        // edge; a saturated fill can only darken.
        const sel = parseColor(derive(t)['globe-selection']);
        const primary = parseColor(t.primary);
        expect(sel.r).toBeLessThan(primary.r);
        expect(sel.r).toBeGreaterThan(parseColor(t['bg-app']).r);
    });

    it('derives the scrim from bg-app so a light theme does not dim to black', () => {
        const light = derive({ ...t, 'bg-app': '#ffffff' });
        expect(light.scrim).toMatch(/^rgba\(255, 255, 255/);
    });

    it('builds the whole elevation scale off one knob', () => {
        const d = derive(t);
        for (const k of ['shadow-low', 'shadow-mid', 'shadow-high', 'shadow-dock']) {
            expect(d[k]).toContain('rgba(10, 28, 48');
        }
        // The dock shadow casts upward.
        expect(d['shadow-dock']).toContain('-6px');
    });
});

describe('resolveTheme', () => {
    it('merges overrides over the defaults', () => {
        expect(resolveTheme({ primary: '#ff0000' }).primary).toBe('#ff0000');
        expect(resolveTheme({ primary: '#ff0000' })['bg-app']).toBe(defaultTheme()['bg-app']);
    });

    it('ignores unknown or empty overrides rather than emitting dead properties', () => {
        const r = resolveTheme({ '--legacy-accent': '#123456', primary: '   ' });
        expect(r['--legacy-accent']).toBeUndefined();
        expect(r.primary).toBe(defaultTheme().primary);
    });

    it('recomputes derived values from the overridden knob', () => {
        expect(resolveTheme({ 'text-primary': '#ff0000' })['border-subtle'])
            .toBe('rgba(255, 0, 0, 0.12)');
    });

    it('every declared colour token resolves to a parseable colour', () => {
        const r = resolveTheme();
        for (const k of COLOR_TOKENS) {
            expect(parseColor(r[k]), `${k} = ${r[k]}`).not.toBe(null);
        }
    });
});

describe('pickKnobs', () => {
    it('keeps only recognised, non-empty string knobs', () => {
        expect(pickKnobs({ primary: '#fff', bogus: '#000', ocean: '', 'bg-app': 42 }))
            .toEqual({ primary: '#fff' });
    });

    it('trims values', () => {
        expect(pickKnobs({ primary: '  #fff  ' })).toEqual({ primary: '#fff' });
    });

    it('tolerates a missing argument', () => {
        expect(pickKnobs()).toEqual({});
    });
});

describe('the CSS artefact', () => {
    it('emits a :root block of custom properties', () => {
        const css = toCss();
        expect(css.startsWith(':root {')).toBe(true);
        expect(css).toContain('--primary: #f59e4b;');
        expect(css).toContain('--status-correct:');
    });

    it('takes a custom selector', () => {
        expect(toCss({}, { selector: '[data-theme="x"]' })).toMatch(/^\[data-theme="x"\] \{/);
    });

    it('prefixes every variable name', () => {
        for (const name of Object.keys(toCssVariables())) expect(name.startsWith('--')).toBe(true);
    });
});

describe('the native artefact', () => {
    const theme = toNativeTheme();

    it('exposes colours by intention, including every knob colour', () => {
        for (const k of KNOBS.filter(k => k.type === 'color')) {
            expect(theme.color[k.name], `color.${k.name} missing`).toBeTruthy();
        }
    });

    it('emits sizes, spacing and radii as numbers, since RN rejects px strings', () => {
        expect(theme.fontSize.lg).toBe(20);
        expect(theme.space[4]).toBe(16);
        expect(theme.radius.btn).toBe(10);
        for (const v of Object.values(theme.space)) expect(typeof v).toBe('number');
    });

    it('emits elevation structurally rather than as a box-shadow string', () => {
        // RN wants shadowColor/Offset/Opacity/Radius; the CSS string cannot be
        // parsed back into those.
        expect(theme.elevation.mid).toMatchObject({ shadowRadius: 12, shadowOpacity: 0.5 });
        expect(theme.elevation.dock.shadowOffset.height).toBe(-6);
    });

    it('carries the knob values through for the in-app editor', () => {
        expect(Object.keys(theme.knobs).sort()).toEqual([...KNOB_NAMES].sort());
    });

    it('tracks an override', () => {
        expect(toNativeTheme({ primary: '#ff0000' }).color.primary).toBe('#ff0000');
    });
});

describe('the backend artefact', () => {
    const py = toPythonAllowList();

    it('lists every knob with the wire-form -- prefix', () => {
        for (const n of KNOB_NAMES) expect(py).toContain(`'--${n}'`);
    });

    it('does not leak fixed or derived tokens into the allow-list', () => {
        for (const n of [...Object.keys(STATUS), ...Object.keys(SPACING), 'border-subtle', 'scrim']) {
            expect(py).not.toContain(`'--${n}'`);
        }
    });

    it('says how to regenerate it', () => {
        expect(py).toContain('npm run build:tokens');
        expect(py).toContain('packages/design-tokens/src/tokens.js');
    });

    it('splices into a marked file, replacing the previous block', () => {
        const file = `"""Docstring."""\nimport re\n\n${GENERATED_BEGIN}\nOLD = ()\n${GENERATED_END}\n\ndef validate():\n    pass\n`;
        const out = spliceGeneratedBlock(file);
        expect(out).toContain('"""Docstring."""');
        expect(out).toContain('def validate():');
        expect(out).not.toContain('OLD = ()');
        expect(out).toContain("'--primary'");
    });

    it('is idempotent — splicing twice changes nothing', () => {
        const file = `head\n${GENERATED_BEGIN}\nOLD\n${GENERATED_END}\ntail\n`;
        expect(spliceGeneratedBlock(spliceGeneratedBlock(file))).toBe(spliceGeneratedBlock(file));
    });

    it('refuses a file without markers rather than appending a shadow list', () => {
        // Two allow-lists in one module, the second silently winning, is a
        // worse outcome than a failed build.
        expect(() => spliceGeneratedBlock('no markers here')).toThrow(/missing the generated-block markers/);
    });

    it('refuses markers in the wrong order', () => {
        expect(() => spliceGeneratedBlock(`${GENERATED_END}\nx\n${GENERATED_BEGIN}`))
            .toThrow(/out of order/);
    });
});
