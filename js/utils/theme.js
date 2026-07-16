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
    return `${px}px ${cssToken('--font-base', 'Arial, sans-serif')}`;
}

/**
 * Subscribe to theme changes. Returns an unsubscribe function.
 * @param {() => void} cb
 */
export function onThemeChange(cb) {
    document.addEventListener(THEME_EVENT, cb);
    return () => document.removeEventListener(THEME_EVENT, cb);
}
