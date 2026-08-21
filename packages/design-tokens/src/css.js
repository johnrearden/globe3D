/**
 * Web artefact: resolved tokens → CSS custom properties.
 *
 * Every value emitted here is concrete — no `var()` chains and no `color-mix()`.
 * That is deliberate: derivations happen in JS (see tokens.js) so the same
 * numbers reach React Native, and a browser-only fallback can never silently
 * diverge from what native renders.
 */

import { resolveTheme } from './tokens.js';

/**
 * @param {Object<string,string>} [overrides] partial knob map
 * @param {{selector?: string, indent?: string}} [opts]
 * @returns {string} a CSS rule block
 */
export function toCss(overrides = {}, { selector = ':root', indent = '  ' } = {}) {
    const tokens = resolveTheme(overrides);
    const lines = Object.entries(tokens).map(([k, v]) => `${indent}--${k}: ${v};`);
    return `${selector} {\n${lines.join('\n')}\n}\n`;
}

/**
 * Just the overridden knobs, for applying a theme at runtime without restating
 * the whole set — what the theme switcher writes to a style attribute.
 *
 * @param {Object<string,string>} overrides
 * @returns {Object<string,string>} CSS-property-name → value
 */
export function toCssVariables(overrides = {}) {
    const tokens = resolveTheme(overrides);
    return Object.fromEntries(Object.entries(tokens).map(([k, v]) => [`--${k}`, v]));
}

/**
 * Apply a resolved theme to a DOM element (default `<html>`). The one function
 * in this package that touches the DOM, kept here rather than in a js/ binding
 * because it is three lines and every web consumer needs exactly it.
 *
 * @param {Object<string,string>} overrides
 * @param {HTMLElement} [el]
 */
export function applyCssVariables(overrides = {}, el = globalThis.document?.documentElement) {
    if (!el) return;
    for (const [prop, value] of Object.entries(toCssVariables(overrides))) {
        el.style.setProperty(prop, value);
    }
}
