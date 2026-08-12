/**
 * Question payload builders.
 *
 * The shape mirrors the backend's daily-challenge payload
 * (backend/quiz/generation/core.py:19-35) so that a single renderer per
 * platform can present both locally-generated practice questions and
 * server-generated daily questions. Before this, the two were entirely
 * separate code paths with different question objects.
 *
 * A payload is client-safe: it never carries the correct answer. Generators
 * return `{payload, answer}` and the caller decides what to hand the UI —
 * matching how the backend keeps `Question.payload` and `Question.answer`
 * apart (backend/quiz/models.py).
 *
 * @typedef {import('./geo.js').CountryRecord} CountryRecord
 */

/**
 * @typedef {object} GridOption
 * @property {string} value  the answer key, compared on grading
 * @property {string} label  display text
 * @property {string|null} [iso] ISO alpha-2, for flag options
 */

/**
 * Build a grid option from a country. Matches the backend's `country_option()`
 * so options are interchangeable between local and server questions.
 *
 * The vanilla modes used bare name strings here; standardising on the object
 * form is what lets one renderer handle both sources.
 *
 * @param {CountryRecord} country
 * @returns {GridOption}
 */
export function countryOption(country) {
    return { value: country.name, label: country.name, iso: country.iso || null };
}

/**
 * Build a capital-city grid option.
 *
 * @param {CountryRecord} country
 * @returns {GridOption}
 */
export function capitalOption(country) {
    return { value: country.capital.name, label: country.capital.name, iso: null };
}

/**
 * Assemble a single-choice question payload.
 *
 * @param {object} spec
 * @param {string} spec.type      question type id (see QUESTION_TYPES)
 * @param {string} spec.prompt    human-readable question text
 * @param {GridOption[]} spec.options
 * @param {number} [spec.cols]    grid columns; 2 matches the backend default
 * @param {'name'|'flag'} [spec.display] how the grid renders each option
 * @param {object} [spec.map]     globe framing/highlight directives
 * @param {object} [spec.flag]    flag to show in the prompt area
 * @returns {object}
 */
export function singleChoicePayload({ type, prompt, options, cols = 2, display = 'name', map = null, flag = null }) {
    const payload = {
        type,
        prompt,
        grid: { options, cols, multiSelect: false, display },
        answer: { method: 'grid-single' }
    };
    if (map) payload.map = map;
    if (flag) payload.flag = flag;
    return payload;
}

/**
 * Assemble a map-click question payload — the answer is captured by picking a
 * country on the globe rather than from a grid, so there are no options.
 *
 * @param {object} spec
 * @param {string} spec.type
 * @param {string} spec.prompt
 * @param {object} [spec.map]
 * @returns {object}
 */
export function mapClickPayload({ type, prompt, map = null }) {
    const payload = { type, prompt, answer: { method: 'map-click-single' } };
    if (map) payload.map = map;
    return payload;
}

/**
 * Globe framing directives attached to a payload.
 *
 * @param {object} spec
 * @param {string[]} [spec.highlight] country names to highlight
 * @param {string} [spec.focus]       country name to frame the camera on
 * @param {boolean} [spec.lock]       disable rotation while answering
 * @param {{lat: number, lng: number, label?: string}} [spec.marker]
 * @returns {object}
 */
export function mapBlock({ highlight = [], focus = null, lock = false, marker = null } = {}) {
    const block = { highlight, lock };
    if (focus) block.focus = focus;
    if (marker) block.marker = marker;
    return block;
}
