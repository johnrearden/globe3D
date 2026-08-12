/**
 * capitalIsSelfEvident — mirror of the backend's quiz/generation/base.py rule.
 *
 * True when a capital gives its country away (or vice versa): normalized names
 * equal, or one contains the other — e.g. Mexico/Mexico City, Tunisia/Tunis,
 * São Tomé and Príncipe/São Tomé, Monaco/Monaco. Comparison is diacritic- and
 * punctuation-insensitive.
 *
 * Catches containment/equality only; pairs that merely share a root spelling
 * (Brazil/Brasília, Algeria/Algiers, Niger/Niamey) are NOT caught.
 *
 * Pure (no THREE/DOM) so it's unit-testable in Node.
 */

// Combining diacritical marks (U+0300–U+036F), left over after NFKD decomposition.
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

function normName(s) {
    return (s || '')
        .normalize('NFKD')
        .replace(COMBINING_MARKS, '')      // strip accents (é → e)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');        // drop spaces/punctuation
}

/**
 * @param {string} country
 * @param {string} city
 * @returns {boolean}
 */
export function capitalIsSelfEvident(country, city) {
    const c = normName(country);
    const p = normName(city);
    if (!c || !p) return false;
    return c === p || c.includes(p) || p.includes(c);
}
