/**
 * `GlobeAppearance` — how the globe LOOKS, as opposed to where it is pointing.
 *
 * ## Why this is not part of `GlobeBridge`
 *
 * `GlobeBridge` is the quiz boundary: it exists so that nothing under
 * `js/features/quiz/` holds a reference to `globeManager` or
 * `cameraController`, and its fake is what lets quiz logic be tested with no
 * WebGL. Every method on it is something a *question* does — highlight this,
 * frame that, tell me when the player taps.
 *
 * Settings are a different consumer with a different lifetime. A question aims
 * the camera for a few seconds; a preference sets display state for the session
 * and is restored on the next one. Folding "set border opacity" into the quiz's
 * contract would grow the fake every quiz test constructs with methods no quiz
 * calls, and would blur what the bridge is *for*.
 *
 * So: two interfaces, one rule. **Nothing platform-specific crosses either** —
 * no `THREE.Color`, no shader uniform, no DOM node; only names and plain values.
 * That is what lets a React Native implementation be a swap rather than a
 * rewrite, and it is why the country palette crosses as a *scheme key* and never
 * as 256 colours (the same decision `COUNTRY_SCHEMES` encodes on the backend).
 *
 * ## The one thing to be careful about
 *
 * `setBorderOpacity` must be applied BEFORE `setBordersVisible(true)`, or
 * enabling borders draws them at whatever strength the renderer last had rather
 * than the saved one. `applyAll` does this in the right order, which is the main
 * reason it exists rather than leaving callers to sequence eight calls.
 *
 * @typedef {object} GlobeAppearance
 *
 * @property {(settings: object) => void} applyAll
 *   Apply a whole persisted settings object at once — the boot call. Takes the
 *   shape of `SETTINGS_DEFAULTS` from `@terragotcha/storage`; unknown keys are
 *   ignored, so a settings object that has grown a field this globe does not
 *   understand is not an error.
 *
 * @property {() => Array<{key: string, label: string}>} schemes
 *   The country colour schemes this globe can render, in display order. Data
 *   rather than a hard-coded list in the UI, because the set is a property of
 *   the renderer's palette — a native implementation may offer different ones.
 * @property {(key: string) => void} setCountryScheme
 *   Recolour every country. A scheme KEY, never colours.
 *
 * @property {(visible: boolean) => void} setCountriesVisible
 *   Show the country fills, or just the bare ocean sphere.
 * @property {(visible: boolean) => void} setLabelsVisible
 *   Master switch for country name labels.
 * @property {(visible: boolean) => void} setBordersVisible
 * @property {(opacity: number) => void} setBorderOpacity
 *   0–1. Set this before enabling borders; see above.
 * @property {(enabled: boolean) => void} setSelectionGradient
 *   The tonal ramp across the selected country's fill.
 *
 * @property {(opts: {enabled?: boolean, delayMs?: number, speed?: number}) => void} setAutoRotate
 *   Idle auto-rotation. Distinct from `GlobeBridge.setAutoRotateAllowed`, which
 *   is the quiz suppressing drift for the duration of a question: this is the
 *   user's standing preference, and the quiz's suppression must not overwrite
 *   it.
 *
 * @property {(lighting: object|null) => void} setLighting
 *   `{ambient, diffuse, specStrength, shininess, oceanSpecBoost}`, or null to
 *   restore the defaults. Plain numbers, so they cross cleanly — but this is
 *   optics rather than palette, which is why it is a superuser control and not
 *   a theme knob: a value here can make the globe unreadable.
 * @property {() => object} lightingDefaults
 *   The values `setLighting(null)` restores, so a UI can seed its sliders
 *   without restating them.
 */

/**
 * Method names every implementation must provide.
 * @type {readonly string[]}
 */
export const GLOBE_APPEARANCE_METHODS = Object.freeze([
    'applyAll',
    'schemes',
    'setCountryScheme',
    'setCountriesVisible',
    'setLabelsVisible',
    'setBordersVisible',
    'setBorderOpacity',
    'setSelectionGradient',
    'setAutoRotate',
    'setLighting',
    'lightingDefaults',
]);

/**
 * The lighting values `setLighting(null)` restores.
 *
 * Here rather than in the web implementation because they are the *contract's*
 * defaults: a native implementation lighting the same globe should look the
 * same, and a UI seeding sliders needs them before any globe exists.
 */
export const LIGHTING_DEFAULTS = Object.freeze({
    ambient: 0.7,
    diffuse: 0.8,
    specStrength: 0.18,
    shininess: 12,
    oceanSpecBoost: 1.7,
});

/**
 * Check an object satisfies the interface.
 *
 * @param {object} appearance
 * @returns {string[]} the missing member names, so a caller can assert on `[]`
 *   and get a useful failure message
 */
export function missingAppearanceMembers(appearance) {
    if (!appearance) return [...GLOBE_APPEARANCE_METHODS];
    return GLOBE_APPEARANCE_METHODS.filter(m => typeof appearance[m] !== 'function');
}
