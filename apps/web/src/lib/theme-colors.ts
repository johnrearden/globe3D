/**
 * The globe's themed colours, read from the live cascade.
 *
 * ## Why not `resolveTheme()`
 *
 * The obvious move is to compute these in JS from the knob map. It would be
 * wrong. `packages/design-tokens/theme.json` is layered in at **build time**, so
 * a JS `resolveTheme()` call returns the system's unoverridden defaults and
 * would quietly disagree with the stylesheet the page is actually wearing.
 *
 * The cascade is the one place that has already had every override applied —
 * the generated artefact, the theme file, and any inline properties the dev
 * theme lab has written on `<html>`. Reading it means live preview and ordinary
 * boot go through the same code path, so neither can drift from the other.
 *
 * `check-tokens.mjs` validates these three names against the emitted set, so a
 * typo fails the build rather than resolving to an empty string.
 */
import { cssToken } from '../../../../js/utils/theme.js';
import type { ThemeColors } from './globe-types';

/**
 * An absent token yields `undefined` rather than a hard-coded fallback:
 * `setThemeColors` leaves an omitted field alone, which is the right answer for
 * "the cascade does not say". The engine's own boot-time fallbacks
 * (`scene.js`, `globe.js`) still cover that case.
 */
const token = (name: string): string | undefined => cssToken(name) || undefined;

/** @returns the current values of `--globe-space`, `--globe-border`, `--ocean`. */
export function readThemeColors(): ThemeColors {
    return {
        space: token('--globe-space'),
        border: token('--globe-border'),
        ocean: token('--ocean'),
    };
}
