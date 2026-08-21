/**
 * React Native artefact: resolved tokens → a plain theme object.
 *
 * RN has no CSS custom properties, so tokens arrive as a nested object indexed
 * by intention (`theme.color.primary`, `theme.space[3]`) rather than as a flat
 * bag of `--`-prefixed strings. Numeric values are emitted as **numbers**,
 * because RN style props take unitless numbers and a '10px' string throws.
 */

import { resolveTheme, KNOB_NAMES, COLOR_TOKENS } from './tokens.js';

/** '10px' → 10; leaves '50%' and '999px'-as-pill alone where a number is wrong. */
function px(value) {
    const m = /^(-?[\d.]+)px$/.exec(String(value).trim());
    return m ? Number(m[1]) : value;
}

/**
 * @param {Object<string,string>} [overrides]
 * @returns {object} nested theme object
 */
export function toNativeTheme(overrides = {}) {
    const t = resolveTheme(overrides);

    return {
        color: Object.fromEntries(COLOR_TOKENS.map(k => [k, t[k]])),
        font: { heading: t['font-heading'], body: t['font-body'] },
        fontSize: {
            xs: px(t['text-xs']), sm: px(t['text-sm']), md: px(t['text-md']),
            lg: px(t['text-lg']), xl: px(t['text-xl']),
        },
        fontWeight: {
            normal: t['weight-normal'], medium: t['weight-medium'], bold: t['weight-bold'],
        },
        // Indexed 1..6 so `theme.space[3]` reads like the scale it is.
        space: {
            1: px(t['space-1']), 2: px(t['space-2']), 3: px(t['space-3']),
            4: px(t['space-4']), 5: px(t['space-5']), 6: px(t['space-6']),
        },
        radius: {
            btn: px(t['radius-btn']),
            panel: px(t['radius-panel']),
            // RN has no '999px' idiom; a large number rounds fully on any real size.
            pill: 999,
            circle: '50%',
        },
        // Shadows are CSS box-shadow strings on web; RN wants elevation +
        // shadowColor/Offset/Opacity/Radius, which cannot be derived from the
        // string. Emitted structurally instead, off the same bg-app knob.
        elevation: {
            low: { elevation: 2, shadowColor: t['bg-app'], shadowOpacity: 0.4, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
            mid: { elevation: 6, shadowColor: t['bg-app'], shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
            high: { elevation: 12, shadowColor: t['bg-app'], shadowOpacity: 0.6, shadowRadius: 32, shadowOffset: { width: 0, height: 12 } },
            dock: { elevation: 8, shadowColor: t['bg-app'], shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: -6 } },
        },
        /** The knob values this theme resolved from, for the in-app editor. */
        knobs: Object.fromEntries(KNOB_NAMES.map(k => [k, t[k]])),
    };
}
