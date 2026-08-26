/**
 * Theme helpers — the bridge between the CSS design tokens (`:root` custom
 * properties in styles.css) and the few surfaces that live outside CSS
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
    // --font-body is the design-token name; --font-ui is the legacy stylesheet's
    // name for the same family. Reading the new one first means canvas text
    // follows the token system wherever it is live, and still follows the old
    // stylesheet until that is retired. cssToken returns '' for a name that does
    // not exist, so the chain degrades quietly rather than erroring.
    const family = cssToken('--font-body')
        // token-check: legacy-vocabulary — the old stylesheet's name for the same
        // family. Remove with styles.css.
        || cssToken('--font-ui', 'system-ui, sans-serif');
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
