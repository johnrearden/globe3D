/**
 * @terragotcha/quiz-core — pure quiz domain logic.
 *
 * No DOM, no Three.js, no React. Runs unchanged in Node (vitest), the browser
 * (via index.html's import map), Astro/Vite, and React Native via Metro.
 */

export { mulberry32, systemRng, randomInt, pick, sample, shuffle } from './rng.js';
export { greatCircleDistance, nearestCountries } from './geo.js';
export { capitalIsSelfEvident } from './self-evident-capital.js';
export {
    MIN_CLICK_AREA_KM2,
    AREA_FILTER_EXEMPT_REGION,
    inScope,
    excludeDependencies,
    excludeUsed,
    withFlag,
    withCapital,
    excludeSelfEvidentCapital,
    clickable
} from './filters.js';
export {
    countryOption,
    capitalOption,
    singleChoicePayload,
    mapClickPayload,
    mapBlock
} from './payload.js';
export {
    MODES,
    QUESTIONS_PER_SESSION,
    generateNameCountry,
    generateIdentifyFlag,
    generateCapital,
    generateClickCountrySession,
    buildFlagDirectionSchedule
} from './generators.js';
