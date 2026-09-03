/**
 * The shipped theme's deviation from the defaults, as a committed file.
 *
 * `tokens.js` defines the *system* — which knobs exist, what the fixed scales
 * are, how everything else derives. `theme.json` is the much smaller question
 * of what this particular product looks like: a partial map of knob → value
 * that the build layers over `defaultTheme()`.
 *
 * Splitting them that way is what makes a theme editable by something other
 * than a person typing into a JS module. `resolveTheme`, `toCss` and
 * `toNativeTheme` have always taken an `overrides` argument for exactly this;
 * until now nothing passed one.
 *
 * ## Node only — deliberately not re-exported from `src/index.js`
 *
 * That barrel is loaded in the browser (index.html's importmap) and by
 * `apps/web`, so a `node:fs` import reaching it would break both. The two
 * consumers here — `bin/build-tokens.mjs` and the dev-server middleware in
 * `apps/web/astro.config.mjs` — are Node, and import this module directly.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pickKnobs } from './tokens.js';

/** The committed override map. `{}` means "ship the defaults". */
export const THEME_FILE = join(
    dirname(dirname(fileURLToPath(import.meta.url))), 'theme.json');

/**
 * The stored knob overrides, filtered to names the system still recognises.
 *
 * A missing or unreadable file is not an error: the defaults in `tokens.js` are
 * a complete theme on their own, and a build that fell back to them silently is
 * far better than one that fails because a dev tool left a partial write.
 *
 * @param {string} [path]
 * @returns {Object<string,string>}
 */
export function readTheme(path = THEME_FILE) {
    try {
        return pickKnobs(JSON.parse(readFileSync(path, 'utf8')));
    } catch {
        return {};
    }
}

/**
 * Persist a knob map, dropping anything that is not a current knob.
 *
 * The filtering is `pickKnobs`, the same guard `resolveTheme` applies to a
 * stored theme — so a value that cannot survive being read back is never
 * written in the first place. Sorted and newline-terminated so an edit shows as
 * a one-line diff rather than a reordering.
 *
 * @param {Object<string,string>} knobs
 * @param {string} [path]
 * @returns {Object<string,string>} what was actually written
 */
export function writeTheme(knobs, path = THEME_FILE) {
    const kept = pickKnobs(knobs);
    const sorted = Object.fromEntries(Object.entries(kept).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(path, JSON.stringify(sorted, null, 4) + '\n');
    return sorted;
}
