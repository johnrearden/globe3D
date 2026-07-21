/**
 * The editable design-token "knobs" a theme can override — the frontend mirror of
 * backend/themes/tokens.py EDITABLE_TOKENS. Drives the theme editor's rows and the
 * theme switcher's inline-override clearing. Keep in sync with the styles.css :root
 * semantic tokens and the backend allow-list.
 *
 * `type` selects the editor widget: 'font' (dropdown of bundled + device fonts,
 * see FONT_OPTIONS in theme-editor.js), 'weight' (select), 'length' (range/number),
 * 'color' (swatch + alpha + text).
 */

export const TOKEN_GROUPS = [
    {
        title: 'Typography',
        tokens: [
            { name: '--font-display', label: 'Display font', type: 'font' },
            { name: '--font-ui', label: 'UI / body font', type: 'font' },
            { name: '--weight-normal', label: 'Weight · normal', type: 'weight' },
            { name: '--weight-medium', label: 'Weight · medium', type: 'weight' },
            { name: '--weight-semibold', label: 'Weight · semibold', type: 'weight' },
            { name: '--weight-bold', label: 'Weight · bold', type: 'weight' },
        ],
    },
    {
        title: 'Radii',
        // Two editable roundness knobs. --radius-pill (999px) and --radius-circle
        // (50%) are fixed shapes, deliberately not exposed here.
        tokens: [
            { name: '--radius-btn', label: 'Button roundness', type: 'length' },
            { name: '--radius-panel', label: 'Panel roundness', type: 'length' },
        ],
    },
    {
        title: 'Colors',
        tokens: [
            { name: '--accent', label: 'Accent', type: 'color' },
            { name: '--on-accent', label: 'On accent (text)', type: 'color' },
            { name: '--bg-app', label: 'Background · app', type: 'color' },
            { name: '--bg-panel', label: 'Background · panel', type: 'color' },
            { name: '--bg-elevated', label: 'Background · elevated', type: 'color' },
            { name: '--scrim', label: 'Modal scrim', type: 'color' },
            { name: '--border-subtle', label: 'Border (subtle)', type: 'color' },
            { name: '--text-heading', label: 'Text · heading', type: 'color' },
            { name: '--text-mid', label: 'Text · mid', type: 'color' },
            { name: '--text-low', label: 'Text · low', type: 'color' },
            { name: '--text-soft', label: 'Text · soft', type: 'color' },
            { name: '--white', label: 'White', type: 'color' },
            { name: '--black', label: 'Black', type: 'color' },
            { name: '--ok', label: 'Success', type: 'color' },
            { name: '--bad', label: 'Danger', type: 'color' },
        ],
    },
];

/** Flat list of every editable token descriptor. */
export const EDITABLE_TOKENS = TOKEN_GROUPS.flatMap(g => g.tokens);

/** Flat list of editable token names. */
export const EDITABLE_TOKEN_NAMES = EDITABLE_TOKENS.map(t => t.name);

/** Font token names — changing these needs a canvas re-bake (THEME_EVENT). */
export const FONT_TOKEN_NAMES = new Set(
    EDITABLE_TOKENS.filter(t => t.type === 'font').map(t => t.name),
);
