/**
 * @terragotcha/globe-bridge — the contract between quiz UI and a globe engine.
 *
 * Interface + validator + test double. No rendering code: the web
 * implementation is js/data/globe-bridge.js, and the native one will live in
 * apps/native.
 */

export {
    GLOBE_BRIDGE_METHODS,
    GLOBE_MARKER_METHODS,
    missingBridgeMembers,
} from './interface.js';

export {
    GLOBE_APPEARANCE_METHODS,
    LIGHTING_DEFAULTS,
    missingAppearanceMembers,
} from './appearance.js';

export {
    createFakeGlobeBridge,
    createFakeGlobeAppearance,
    callNames,
} from './fake.js';
