/**
 * Theme helpers — the bridge between the CSS design tokens (`:root` custom
 * properties in the token artefact) and the few surfaces that live outside CSS
 * (canvas-rendered globe labels/markers). The theme switcher flips
 * `<html data-theme>` and dispatches THEME_EVENT; listeners re-read tokens.
 */

export const THEME_EVENT = 'globe3d:theme-changed';

/**
 * Read a CSS custom property off :root.
 * @param {string} name  Token name including the leading `--`.
 * @param {string} [fallback]
 * @returns {string}
 */
export function cssToken(name, fallback = '') {
    // No document (a Node test constructing engine objects) reads as "the
    // cascade does not say", which is what the fallback is for.
    if (typeof document === 'undefined') return fallback;
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
}

/**
 * Canvas 2D font string built from the themed UI font. Canvas accepts the same
 * comma-separated family list as the CSS `font` shorthand.
 * @param {number} px
 * @returns {string}
 */
export function canvasFont(px) {
    // --font-body is the design-token name, and since B12 every document that
    // renders canvas text — the app and the dev page alike — loads the token
    // artefact, so there is no second name to fall back to. (Until then the
    // legacy stylesheet's --font-ui stood behind it, counted by check-tokens
    // as the last legacy-vocabulary fallback.) The system stack is only for a
    // document with no tokens at all.
    const family = cssToken('--font-body', 'system-ui, sans-serif');
    return `${px}px ${family}`;
}

/**
 * Subscribe to theme changes. Returns an unsubscribe function.
 * @param {() => void} cb
 */
export function onThemeChange(cb) {
    document.addEventListener(THEME_EVENT, cb);
    return () => document.removeEventListener(THEME_EVENT, cb);
}
