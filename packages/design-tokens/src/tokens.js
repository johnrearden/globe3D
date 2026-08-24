/**
 * The design system's single source of truth.
 *
 * One JS object generates three artefacts — CSS custom properties for web, a
 * plain theme object for React Native, and the validation allow-list for
 * `backend/themes/tokens.py`. That is necessary rather than tidy-minded: CSS
 * custom properties, `color-mix()` and `[data-theme]` do not exist in React
 * Native, so a CSS-first definition could never be shared. It also collapses
 * today's three-way hand-mirroring (styles.css `:root` → js/data/theme-tokens.js
 * → backend/themes/tokens.py), where each copy could drift from the others and
 * only a test noticed.
 *
 * The system has three tiers, and which tier a value belongs in is the design
 * decision:
 *
 *   KNOBS    13 values a theme author may set. Deliberately few — the previous
 *            system had 24 and still could not express a coherent theme,
 *            because the knobs were named after CSS variables rather than after
 *            intentions.
 *   FIXED    Scales and semantics an author must NOT break: the type and
 *            spacing ramps, elevation, the two fixed radii, and the
 *            correct/incorrect pair.
 *   DERIVED  Everything computable from a knob. Adding a knob is a cost; a
 *            derivation is free. When in doubt, derive.
 */

import { mix, alpha, luminance } from './color.js';

// ---------------------------------------------------------------------------
// KNOBS — the 13 authorable values
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Knob
 * @property {string} name      token id, also the CSS custom-property name minus `--`
 * @property {string} label     shown in the theme editor
 * @property {'color'|'font'|'length'} type  selects the editor widget
 * @property {string} value     the default (the shipped theme)
 * @property {string} [note]    why this is a knob rather than a derivation
 */

/** @type {ReadonlyArray<{title: string, knobs: Knob[]}>} */
export const KNOB_GROUPS = Object.freeze([
    {
        title: 'Type',
        knobs: [
            { name: 'font-heading', label: 'Heading font', type: 'font',
              value: "'Fredoka', system-ui, sans-serif" },
            { name: 'font-body', label: 'Body font', type: 'font',
              value: "'Archivo', system-ui, sans-serif" },
        ],
    },
    {
        title: 'Surfaces',
        knobs: [
            { name: 'bg-app', label: 'App background', type: 'color', value: '#0a1c30',
              note: 'Also the Three.js scene background — the page and the space behind the globe are one surface, so they are one knob.' },
            { name: 'bg-panel', label: 'Panel background', type: 'color', value: '#0e1726' },
            { name: 'surface-raised', label: 'Surface · raised', type: 'color', value: '#162a42',
              note: 'Modals, results cards — things that sit above a panel.' },
            { name: 'surface-inset', label: 'Surface · inset', type: 'color', value: '#08131f',
              note: 'Inputs and wells — things that sit below it. Raised and inset are separate knobs because a single "elevated" colour cannot express both directions.' },
        ],
    },
    {
        title: 'Brand',
        knobs: [
            { name: 'primary', label: 'Primary', type: 'color', value: '#f59e4b' },
            { name: 'on-primary', label: 'On primary', type: 'color', value: '#321a06',
              note: 'A knob, not a derivation: there is no shipped color-contrast(), and an author picking a pale primary would otherwise ship an unreadable CTA.' },
        ],
    },
    {
        title: 'Text',
        knobs: [
            { name: 'text-primary', label: 'Text · primary', type: 'color', value: '#eef2f6' },
            { name: 'text-secondary', label: 'Text · secondary', type: 'color', value: '#9fb2c6' },
        ],
    },
    {
        title: 'Globe',
        knobs: [
            { name: 'ocean', label: 'Ocean', type: 'color', value: '#061a33',
              note: 'Cannot derive from bg-app: a dark backdrop with a derived-dark ocean makes the globe vanish into the page.' },
        ],
    },
    {
        title: 'Shape',
        knobs: [
            { name: 'radius-btn', label: 'Button roundness', type: 'length', value: '10px' },
            { name: 'radius-panel', label: 'Panel roundness', type: 'length', value: '14px' },
        ],
    },
]);

/** Flat list of the 13 knob descriptors. @type {ReadonlyArray<Knob>} */
export const KNOBS = Object.freeze(KNOB_GROUPS.flatMap(g => g.knobs));

/** Knob ids, for allow-list generation and validation. @type {ReadonlyArray<string>} */
export const KNOB_NAMES = Object.freeze(KNOBS.map(k => k.name));

/** The shipped theme: every knob at its default. @returns {Object<string,string>} */
export function defaultTheme() {
    return Object.fromEntries(KNOBS.map(k => [k.name, k.value]));
}

// ---------------------------------------------------------------------------
// FIXED — scales and semantics a theme may not override
// ---------------------------------------------------------------------------

/**
 * Status colours are fixed on purpose. Red/green is the most common colour-vision
 * deficiency, so these are always paired with a ✓/✕ glyph in the UI — and a theme
 * that could recolour them could break comprehension outright.
 */
export const STATUS = Object.freeze({
    'status-correct': '#4CAF50',
    'status-incorrect': '#f44336',
});

/** Type scale. Five sizes is enough for this app and stops ad-hoc font sizes creeping in. */
export const TYPE_SCALE = Object.freeze({
    'text-xs': '12px',
    'text-sm': '14px',
    'text-md': '16px',
    'text-lg': '20px',
    'text-xl': '28px',
});

export const WEIGHTS = Object.freeze({
    'weight-normal': '400',
    'weight-medium': '500',
    'weight-bold': '700',
});

/**
 * Spacing scale. Its absence is the single biggest reason padding sprawled in
 * the old stylesheet — with no ramp to reach for, every component invented its
 * own values.
 */
export const SPACING = Object.freeze({
    'space-1': '4px',
    'space-2': '8px',
    'space-3': '12px',
    'space-4': '16px',
    'space-5': '24px',
    'space-6': '32px',
});

/** Fixed shapes, distinct from the two roundness knobs. */
export const FIXED_RADII = Object.freeze({
    'radius-pill': '999px',
    'radius-circle': '50%',
});

// ---------------------------------------------------------------------------
// DERIVED — computed from the knobs, emitted as concrete values
// ---------------------------------------------------------------------------

/**
 * Everything the UI needs that is NOT a knob. Each entry says, in code, what it
 * is made of — which is the documentation that kept going stale when these were
 * `color-mix()` calls scattered through a 5,000-line stylesheet.
 *
 * @param {Object<string,string>} t  a full knob map (see defaultTheme)
 * @returns {Object<string,string>}
 */
export function derive(t) {
    const ink = shadowInk(t);
    return {
        // Hairlines and dividers: primary ink at low opacity, so they track the
        // text colour rather than being a separate colour to keep in step.
        'border-subtle': alpha(t['text-primary'], 0.12),
        'border-strong': alpha(t['text-primary'], 0.24),

        // Modal dim. Derived from bg-app so a light theme dims toward its own
        // backdrop instead of always going black.
        scrim: alpha(t['bg-app'], 0.72),

        // Interaction tints on the primary.
        'primary-soft': alpha(t.primary, 0.2),
        'primary-hover': mix(t.primary, t['text-primary'], 0.12),

        // A disabled/eliminated answer option: the inset surface, faded.
        'surface-disabled': alpha(t['surface-inset'], 0.6),
        'text-disabled': alpha(t['text-secondary'], 0.45),

        // Globe ink. Country labels are canvas-rendered and border lines are a
        // GL uniform, so both need a concrete value — neither can read a CSS var.
        'globe-label': t['text-primary'],
        'globe-border': alpha(t['text-primary'], 0.28),

        // Selection highlight. Deliberately a MID-tone of the primary, not the
        // primary itself: the radial selection gradient brightens the centre and
        // darkens the edge, so it needs headroom in both directions. A saturated
        // fill can only darken, which is why the old system used a mid-grey.
        'globe-selection': mix(t.primary, t['bg-app'], 0.35),

        // Elevation, cast in whichever knob is DARKER — see shadowInk. Built from
        // a knob either way, so the scale still adapts per theme with no
        // per-theme redefinition.
        'shadow-low': `0 1px 3px ${alpha(ink, 0.4)}`,
        'shadow-mid': `0 4px 12px ${alpha(ink, 0.5)}`,
        'shadow-high': `0 12px 32px ${alpha(ink, 0.6)}`,
        // Bottom-docked sheets cast upward.
        'shadow-dock': `0 -6px 24px ${alpha(ink, 0.5)}`,
    };
}

/**
 * Which tokens are colours. Declared, not inferred: a first attempt classified
 * by name prefix and silently dropped `text-secondary` (it collides with
 * `text-sm` under any prefix rule), which is exactly the kind of quiet gap a
 * generated artefact should not be able to develop.
 * @type {ReadonlyArray<string>}
 */
export const COLOR_TOKENS = Object.freeze([
    ...KNOBS.filter(k => k.type === 'color').map(k => k.name),
    ...Object.keys(STATUS),
    // Derived colours. Kept explicit for the same reason as above.
    'border-subtle', 'border-strong', 'scrim',
    'primary-soft', 'primary-hover',
    'surface-disabled', 'text-disabled',
    'globe-label', 'globe-border', 'globe-selection',
]);

/**
 * Knobs + fixed + derived: the complete resolved token set.
 *
 * @param {Object<string,string>} [overrides]  partial knob map from a stored theme
 * @returns {Object<string,string>}
 */
export function resolveTheme(overrides = {}) {
    const knobs = { ...defaultTheme(), ...pickKnobs(overrides) };
    return {
        ...knobs,
        ...STATUS,
        ...TYPE_SCALE,
        ...WEIGHTS,
        ...SPACING,
        ...FIXED_RADII,
        ...derive(knobs),
    };
}

/**
 * The colour a shadow is cast in: whichever of `bg-app` and `text-primary` is
 * darker.
 *
 * Deriving elevation from `bg-app` alone was wrong, and only a light theme
 * revealed it: on a dark backdrop a dark shadow reads as depth, but on a light
 * one it casts a light shadow onto a light surface and disappears. Shadows are
 * absence of light, so they have to be dark regardless of which way the theme
 * runs — while still coming from a knob, so the scale adapts without any
 * per-theme redefinition.
 *
 * @param {Object<string,string>} t  a full knob map
 * @returns {string}
 */
function shadowInk(t) {
    return luminance(t['bg-app']) <= luminance(t['text-primary'])
        ? t['bg-app']
        : t['text-primary'];
}

/**
 * Keep only recognised knobs from an untrusted map. The backend validates too;
 * this is the client-side half, so a stale stored theme naming a token that no
 * longer exists degrades to the default rather than injecting a dead property.
 *
 * @param {Object<string,string>} map
 * @returns {Object<string,string>}
 */
export function pickKnobs(map = {}) {
    const out = {};
    for (const name of KNOB_NAMES) {
        if (typeof map[name] === 'string' && map[name].trim()) out[name] = map[name].trim();
    }
    return out;
}
