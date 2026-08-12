/**
 * Eligibility filters for quiz targets.
 *
 * These predicates were previously inlined in each mode's generateQuestion(),
 * where they were easy to apply inconsistently. Collected here as named,
 * composable functions over a plain country table.
 *
 * @typedef {import('./geo.js').CountryRecord} CountryRecord
 */

import { capitalIsSelfEvident } from './self-evident-capital.js';

/**
 * Smallest land area (km²) accepted as a click-quiz target — Guadeloupe.
 * Anything smaller is too hard to find and tap on the globe.
 */
export const MIN_CLICK_AREA_KM2 = 1628;

/**
 * The one region exempt from the area filter: it is mostly islands, so
 * filtering small territories out would leave too few targets and defeat the
 * region's purpose (see click-quiz.js:86-88).
 */
export const AREA_FILTER_EXEMPT_REGION = 'N. America & Caribbean';

/** Countries in the given scope. `'globe'` (or a falsy scope) means all. */
export function inScope(countries, scope) {
    if (!scope || scope === 'globe') return countries;
    return countries.filter(c => c.region === scope);
}

/**
 * Drop overseas territories and dependencies (Greenland, Pitcairn, …). They
 * stay clickable on the globe but are too obscure and too numerous to be fair
 * as either answers or distractors.
 */
export function excludeDependencies(countries) {
    return countries.filter(c => !c.isDependency);
}

/** Drop countries already used as an answer in this session. */
export function excludeUsed(countries, used) {
    if (!used || !used.size) return countries;
    return countries.filter(c => !used.has(c.name));
}

/** Keep only countries with a flag available (needs an ISO 3166-1 alpha-2 code). */
export function withFlag(countries) {
    return countries.filter(c => !!c.iso);
}

/** Keep only countries with a known capital city. */
export function withCapital(countries) {
    return countries.filter(c => c.capital && c.capital.name);
}

/**
 * Drop countries whose capital gives the answer away (Mexico/Mexico City,
 * Tunisia/Tunis, Monaco/Monaco).
 */
export function excludeSelfEvidentCapital(countries) {
    return countries.filter(c =>
        c.capital && c.capital.name && !capitalIsSelfEvident(c.name, c.capital.name)
    );
}

/**
 * Keep only countries large enough to be a fair click target.
 *
 * Two deliberate carry-overs from click-quiz.js:88-95 that look like bugs but
 * are not: an unknown (null) area is KEPT rather than dropped, and the
 * Caribbean region skips the filter entirely.
 *
 * @param {CountryRecord[]} countries
 * @param {string} scope
 */
export function clickable(countries, scope) {
    if (scope === AREA_FILTER_EXEMPT_REGION) return countries;
    return countries.filter(c => c.area == null || c.area >= MIN_CLICK_AREA_KM2);
}
