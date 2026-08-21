/**
 * GlobeBridge — everything the quiz UI is allowed to ask of a globe.
 *
 * This package deliberately contains **no rendering code**. It is the contract
 * plus a test double: the web implementation wraps GlobeManager and
 * CameraController (js/data/globe-bridge.js), and the Expo app will implement
 * the same methods against its own expo-gl engine. What makes Phase B and Phase
 * C a swap rather than a rewrite is that everything above this line is already
 * shared.
 *
 * ## The rule that gives the interface its shape
 *
 * **Nothing platform-specific may cross it.** No THREE.Vector3, no DOM node, no
 * engine object — only names, plain numbers and plain objects. Two call sites
 * violated that before this existed and are the reason the rule is stated first:
 *
 *   - `capital-cities-quiz` built a `THREE.Vector3` via
 *     `globeManager.latLngToVector3(...)` purely to hand it back as
 *     `rotateToCountry`'s aim point. The bridge takes `{lat, lng}` instead and
 *     converts inside the implementation, so the mode never names a THREE type.
 *   - `name-flag-quiz` looked up a centroid record with `getCountryByName()`
 *     only to pass it straight back to the camera. `focusCountry(name)` does
 *     the lookup on the far side.
 *
 * ## What is NOT here, and why
 *
 * - **Country data** (`getCountryByName`, `getCapital`, centroids). That is
 *   `createCountryTable()` in quiz-core's world, not the renderer's. A globe
 *   that happens to hold a capitals map is an accident of the current
 *   implementation, and asking the *renderer* for data would carry that
 *   accident onto native.
 * - **Picking.** `onPick` is here, but the vanilla app still routes globe taps
 *   through `pointer-controls` → `clickQuiz.handleAnswer()`. Inverting that is
 *   a pointer-controls change, not a bridge change, so it stays for A6 and the
 *   hook is defined ready for it.
 * - **Anything with one caller and no native analogue**, e.g. the small-country
 *   reveal indicator. Those stay on the concrete objects until a second caller
 *   or the native app justifies promoting them.
 *
 * @typedef {object} GlobeBridge
 *
 * @property {(name: string) => void} highlight
 *   Tint one country as the selection. Replaces the previous highlight.
 * @property {() => void} clearSelection
 *   Drop the highlight, any flash, and any reveal decoration raised by
 *   `focusCountry` (on web, the disc-and-arrow marker that points out a country
 *   too small to see). Clearing those together is existing behaviour, not a new
 *   rule — `pointer-controls` already removes the marker and the selection as a
 *   pair.
 * @property {(name: string, color: number, durationMs: number) => void} flash
 *   Briefly overlay a colour on one country — the quiz reveal.
 * @property {(names: string[]) => void} showOnly
 *   Show only these countries; everything else reads as ocean.
 * @property {() => void} showAll
 *   Undo `showOnly`.
 *
 * @property {(name: string, opts?: {quizFraming?: boolean, aim?: {lat: number, lng: number}}) => void} focusCountry
 *   Move the camera to frame a country. `quizFraming` frames it smaller so
 *   neighbours give context without giving the answer away. `aim` points at a
 *   specific coordinate (a capital) rather than the country's centroid.
 * @property {(opts?: {lat?: number, lng?: number, widthFraction?: number}) => void} frameGlobe
 *   Frame the whole globe, optionally rotating a coordinate into view. Used
 *   when showing the target must not reveal which country it is.
 * @property {(opts: {lat: number, lng: number, distance?: number, focalAnchor?: object, lockRotation?: boolean}) => void} frameView
 *   Explicit framing from a server-supplied map block (Daily Challenge).
 * @property {(name: string, fraction: number) => number} framingDistanceFor
 *   Camera distance at which `name` fills `fraction` of the screen.
 * @property {() => void} resetView
 *   Back to the neutral overview: zoom out and clear any view offset.
 *
 * @property {(enabled: boolean) => void} setInteractive
 *   Whether the user may rotate the globe.
 * @property {(allowed: boolean) => void} setAutoRotateAllowed
 *   Whether idle auto-rotation may resume. Distinct from `setInteractive`:
 *   during a click-to-answer quiz the player must be able to rotate (`true`)
 *   while the globe must not drift on its own (`false`).
 *
 * @property {(cb: (name: string) => void) => (() => void)} onPick
 *   Subscribe to country taps. Returns an unsubscribe function.
 *
 * @property {GlobeMarkers} markers
 *   Point markers — currently the capital-city dot.
 *
 * @typedef {object} GlobeMarkers
 * @property {(lat: number, lng: number) => void} place
 * @property {(text: string) => void} setLabel
 * @property {() => void} showLabel
 * @property {() => void} clear
 */

/**
 * Method names every implementation must provide. Exported so both the web
 * binding and the (future) native one can be asserted against one list rather
 * than a test per platform re-deriving it.
 * @type {readonly string[]}
 */
export const GLOBE_BRIDGE_METHODS = Object.freeze([
    'highlight',
    'clearSelection',
    'flash',
    'showOnly',
    'showAll',
    'focusCountry',
    'frameGlobe',
    'frameView',
    'framingDistanceFor',
    'resetView',
    'setInteractive',
    'setAutoRotateAllowed',
    'onPick',
]);

/** Methods required on `bridge.markers`. @type {readonly string[]} */
export const GLOBE_MARKER_METHODS = Object.freeze([
    'place', 'setLabel', 'showLabel', 'clear',
]);

/**
 * Check an object satisfies the interface. Returns the missing member names, so
 * a caller can assert on `[]` and get a useful failure message.
 *
 * @param {object} bridge
 * @returns {string[]}
 */
export function missingBridgeMembers(bridge) {
    const missing = [];
    if (!bridge || typeof bridge !== 'object') return ['(not an object)'];
    for (const m of GLOBE_BRIDGE_METHODS) {
        if (typeof bridge[m] !== 'function') missing.push(m);
    }
    if (!bridge.markers || typeof bridge.markers !== 'object') {
        missing.push('markers');
    } else {
        for (const m of GLOBE_MARKER_METHODS) {
            if (typeof bridge.markers[m] !== 'function') missing.push(`markers.${m}`);
        }
    }
    return missing;
}
