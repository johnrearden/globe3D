/**
 * Question generators — pure functions over a plain country table.
 *
 * Ported from the four in-class generateQuestion() methods:
 *   name-flag-quiz.js:170-223 · capital-cities-quiz.js:179-250
 *   identify-flag-quiz.js:460-520 · click-quiz.js:88-100
 *
 * Behaviour is preserved exactly, including two asymmetries that look like
 * oversights and are deliberately NOT fixed here (changing them would alter
 * gameplay under cover of a refactor). Both are exposed as options so they are
 * at least visible:
 *
 *   1. name-flag and capital exclude dependencies; identify-flag and
 *      click-country do not, so Greenland can be a flag answer but never a
 *      "name the country" answer.
 *   2. Distractors are drawn from the full in-scope pool including countries
 *      already used as answers, so a country can appear as a distractor after
 *      it has been the answer.
 *
 * Every generator returns `{payload, answer, meta}` or null when the pool is
 * too small. `payload` is client-safe; `answer` is kept separate so the same
 * shape works when the server owns grading.
 *
 * @typedef {import('./geo.js').CountryRecord} CountryRecord
 */

import { nearestCountries } from './geo.js';
import { pick, sample, shuffle } from './rng.js';
import {
    clickable,
    excludeDependencies,
    excludeSelfEvidentCapital,
    excludeUsed,
    inScope,
    withCapital,
    withFlag
} from './filters.js';
import { capitalOption, countryOption, mapBlock, mapClickPayload, singleChoicePayload } from './payload.js';

/**
 * Mode ids. These match the values already written into quiz-history-store's
 * session records and MODE_LABELS — changing them would orphan every player's
 * existing history, so they are fixed.
 */
export const MODES = {
    NAME_FLAG: 'name-flag',
    IDENTIFY_FLAG: 'identify-flag',
    CLICK_COUNTRY: 'click-country',
    CAPITAL: 'capital'
};

/** Questions per session, for the modes that generate one at a time. */
export const QUESTIONS_PER_SESSION = 10;

/**
 * "Name the country" — a country is highlighted on the globe; pick its name
 * from six options, five of which are its nearest neighbours.
 *
 * @param {object} spec
 * @param {CountryRecord[]} spec.countries  full country table
 * @param {string} [spec.scope]             'globe' or a region name
 * @param {Set<string>} [spec.used]         answers already used this session
 * @param {() => number} spec.rng
 * @param {number} [spec.optionCount]
 * @returns {{payload: object, answer: {correct: string[]}, meta: object}|null}
 */
export function generateNameCountry({ countries, scope = 'globe', used = new Set(), rng, optionCount = 6 }) {
    const pool = excludeDependencies(inScope(countries, scope));
    const available = excludeUsed(pool, used);
    if (!available.length || pool.length < optionCount) return null;

    const target = pick(rng, available);
    const distractors = nearestCountries(target, pool, optionCount - 1);
    const options = shuffle(rng, [target, ...distractors].map(countryOption));

    return {
        payload: singleChoicePayload({
            type: 'name-country',
            prompt: 'Which country is highlighted?',
            options,
            display: 'name',
            map: mapBlock({ highlight: [target.name], focus: target.name, lock: true })
        }),
        answer: { correct: [target.name] },
        meta: { mode: MODES.NAME_FLAG, country: target.name }
    };
}

/**
 * "Identify the flag" — two directions:
 *   forward: show one flag, pick the country name from six names
 *   reverse: name a country, pick its flag from six flag tiles
 *
 * The correct answer must have an ISO code or there is no flag art. Reverse
 * additionally needs every distractor to be flaggable, and falls back to
 * forward when a small region can't supply enough.
 *
 * Distractors here are random rather than nearest-neighbour — flags carry no
 * geographic cue, so proximity would not make the question fairer.
 *
 * @param {object} spec
 * @param {CountryRecord[]} spec.countries
 * @param {string} [spec.scope]
 * @param {Set<string>} [spec.used]
 * @param {() => number} spec.rng
 * @param {'forward'|'reverse'} [spec.direction]
 * @param {number} [spec.optionCount]
 * @returns {{payload: object, answer: {correct: string[]}, meta: object}|null}
 */
export function generateIdentifyFlag({
    countries, scope = 'globe', used = new Set(), rng, direction = 'forward', optionCount = 6
}) {
    // Dependencies are intentionally NOT excluded here — see the file header.
    const pool = inScope(countries, scope);
    const available = excludeUsed(pool, used);
    if (available.length < optionCount) return null;

    const flaggable = withFlag(available);
    if (!flaggable.length) return null;

    const target = pick(rng, flaggable);

    let resolved = direction;
    let distractorPool = pool.filter(c => c.name !== target.name);
    if (resolved === 'reverse') {
        const flaggablePool = withFlag(distractorPool);
        if (flaggablePool.length < optionCount - 1) {
            resolved = 'forward';
        } else {
            distractorPool = flaggablePool;
        }
    }

    const distractors = sample(rng, distractorPool, optionCount - 1);
    const options = shuffle(rng, [target, ...distractors].map(countryOption));

    return {
        payload: singleChoicePayload({
            type: 'identify-flag',
            prompt: resolved === 'forward' ? 'Which country flies this flag?' : `Which flag is ${target.name}'s?`,
            options,
            display: resolved === 'forward' ? 'name' : 'flag',
            flag: resolved === 'forward' ? { iso: target.iso } : null
        }),
        answer: { correct: [target.name] },
        meta: { mode: MODES.IDENTIFY_FLAG, country: target.name, direction: resolved }
    };
}

/**
 * "Capital cities" — two directions, chosen per question:
 *   forward: "What is the capital of X?"      options are capital names
 *   reverse: "Y is the capital of which country?"  options are country names
 *
 * Pairs where the capital gives the country away are excluded outright.
 *
 * @param {object} spec
 * @param {CountryRecord[]} spec.countries
 * @param {string} [spec.scope]
 * @param {Set<string>} [spec.used]
 * @param {() => number} spec.rng
 * @param {'forward'|'reverse'} [spec.direction]  omit to coin-flip
 * @param {number} [spec.optionCount]
 * @returns {{payload: object, answer: {correct: string[]}, meta: object}|null}
 */
export function generateCapital({
    countries, scope = 'globe', used = new Set(), rng, direction = null, optionCount = 4
}) {
    const pool = excludeSelfEvidentCapital(withCapital(excludeDependencies(inScope(countries, scope))));
    const available = excludeUsed(pool, used);
    if (available.length < optionCount) return null;

    const target = pick(rng, available);
    const distractors = nearestCountries(target, pool, optionCount - 1);
    const group = [target, ...distractors];

    const resolved = direction || (rng() < 0.5 ? 'forward' : 'reverse');
    const forward = resolved === 'forward';
    const options = shuffle(rng, group.map(forward ? capitalOption : countryOption));

    return {
        payload: singleChoicePayload({
            type: 'capital',
            prompt: forward
                ? `What is the capital of ${target.name}?`
                : `${target.capital.name} is the capital of which country?`,
            options,
            display: 'name',
            map: mapBlock({
                highlight: forward ? [target.name] : [],
                focus: forward ? target.name : null,
                marker: { lat: target.capital.lat, lng: target.capital.lng }
            })
        }),
        answer: { correct: [forward ? target.capital.name : target.name] },
        meta: { mode: MODES.CAPITAL, country: target.name, direction: resolved }
    };
}

/**
 * "Find the country" — the player is named a country and taps it on the globe.
 *
 * Unlike the other modes this picks the whole session's targets up front, since
 * there are no per-question options to generate. A small region may yield fewer
 * than `count` targets after the area filter; callers must use the returned
 * length rather than assuming 10 (click-quiz.js:98-100).
 *
 * @param {object} spec
 * @param {CountryRecord[]} spec.countries
 * @param {string} [spec.scope]
 * @param {() => number} spec.rng
 * @param {number} [spec.count]
 * @returns {Array<{payload: object, answer: {correct: string[]}, meta: object}>}
 */
export function generateClickCountrySession({ countries, scope = 'globe', rng, count = QUESTIONS_PER_SESSION }) {
    // Dependencies are intentionally NOT excluded here — see the file header.
    const pool = clickable(inScope(countries, scope), scope);
    return sample(rng, pool, count).map(target => ({
        payload: mapClickPayload({
            type: 'click-country',
            prompt: target.name,
            map: mapBlock({ lock: false })
        }),
        answer: { correct: [target.name] },
        meta: { mode: MODES.CLICK_COUNTRY, country: target.name }
    }));
}

/**
 * Build the balanced forward/reverse schedule the identify-flag mode consumes
 * by index — five of each, shuffled (identify-flag-quiz.js:350-352).
 *
 * @param {() => number} rng
 * @param {number} [total]
 * @returns {Array<'forward'|'reverse'>}
 */
export function buildFlagDirectionSchedule(rng, total = QUESTIONS_PER_SESSION) {
    const half = Math.floor(total / 2);
    const schedule = [
        ...Array(half).fill('forward'),
        ...Array(total - half).fill('reverse')
    ];
    return shuffle(rng, schedule);
}
