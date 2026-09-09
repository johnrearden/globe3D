/**
 * The web `GlobeAppearance` — the display half of the globe boundary.
 *
 * Sibling of `js/data/globe-bridge.js`, and the same job: this is the only file
 * that knows both the platform-neutral names on one side and `globeManager`,
 * `cameraController`, `labelManager` and raw shader uniforms on the other.
 * Settings UI takes this object and never sees an engine object, which is what
 * makes the panel portable to React Native.
 *
 * Contract, ordering rule and the reason it is separate from `GlobeBridge`:
 * `packages/globe-bridge/src/appearance.js`.
 */

import { LIGHTING_DEFAULTS } from '@terragotcha/globe-bridge';
import { SCHEMES, applyScheme } from './color-schemes.js';

/**
 * How long to wait before applying persisted lighting at boot.
 *
 * `globeManager.fadeInLighting()` ramps the same uniforms over the first second
 * or so of the session. Writing the saved values underneath it would be
 * overwritten mid-ramp and land on the fade's targets instead, so the user's
 * lighting would silently revert on every load. Carried over from
 * settings-panel.js, where the same delay guards the same race.
 */
const LIGHTING_FADE_MS = 1700;

/**
 * @param {object} deps
 * @param {object} deps.globeManager   loaded GlobeManager
 * @param {object} deps.cameraController
 * @param {object} [deps.labelManager] absent on a globe with no labels
 * @param {object} [deps.sceneManager] needed only by setThemeColors, which owns
 *   the backdrop the globe sits in
 * @returns {import('@terragotcha/globe-bridge').GlobeAppearance}
 */
export function createWebGlobeAppearance({
    globeManager, cameraController, labelManager, sceneManager,
}) {
    /** The live shader uniforms, or null before the mesh has loaded. */
    const uniforms = () => globeManager?.material?.uniforms || null;

    const appearance = {
        schemes: () => SCHEMES.map(s => ({ key: s.key, label: s.label })),

        setCountryScheme(key) {
            // A no-op until `paletteOriginal` exists, which is deliberate in
            // applyScheme: the palette is what a scheme is derived FROM.
            applyScheme(globeManager, key);
        },

        setCountriesVisible(visible) {
            globeManager.setShowCountries(visible);
        },

        setLabelsVisible(visible) {
            // Optional: a globe built without labels still takes the setting, it
            // just has nothing to hide.
            labelManager?.setLabelsVisible(visible);
        },

        setBordersVisible(visible) {
            globeManager.setBorderVisible(visible);
        },

        setBorderOpacity(opacity) {
            globeManager.setBorderOpacity(opacity);
        },

        setSelectionGradient(enabled) {
            globeManager.setSelectionGradient(enabled);
        },

        setAutoRotate({ enabled, delayMs, speed } = {}) {
            if (Number.isFinite(speed) && cameraController.controls) {
                cameraController.controls.autoRotateSpeed = speed;
            }
            if (Number.isFinite(delayMs)) cameraController.IDLE_DELAY = delayMs;
            if (enabled === undefined) return;
            if (enabled) {
                // Set the flag directly rather than calling setAutoRotateAllowed:
                // that resets the idle timer, which STOPS an intro spin already
                // running. Turning something on must not visibly turn it off
                // first.
                cameraController.autoRotateAllowed = true;
            } else {
                cameraController.setAutoRotateAllowed(false);
            }
        },

        setThemeColors({ space, border, ocean } = {}) {
            // Each field is optional and applied independently: a caller that
            // only knows the ocean must not blank the backdrop.
            const scene = sceneManager?.getScene?.();
            if (space && scene?.background) scene.background.set(space);
            if (border) globeManager.setBorderColor(border);
            if (ocean) globeManager.setOceanColor(ocean);
        },

        setLighting(lighting) {
            const U = uniforms();
            if (!U) return;
            const l = lighting || LIGHTING_DEFAULTS;
            U.uAmbient.value.setScalar(l.ambient);
            U.uDiffuse.value = l.diffuse;
            U.uSpecStrength.value = l.specStrength;
            U.uShininess.value = l.shininess;
            U.uOceanSpecBoost.value = l.oceanSpecBoost;
        },

        lightingDefaults: () => ({ ...LIGHTING_DEFAULTS }),

        applyAll(settings = {}) {
            if (settings.scheme) appearance.setCountryScheme(settings.scheme);

            appearance.setCountriesVisible(settings.showCountries !== false);
            appearance.setLabelsVisible(settings.showLabels !== false);

            // Opacity BEFORE visibility: enabling borders otherwise draws them
            // at whatever strength the renderer last had rather than the saved
            // one, which reads as the slider having been ignored.
            appearance.setBorderOpacity(settings.borderOpacity);
            appearance.setBordersVisible(!!settings.borders);

            appearance.setSelectionGradient(!!settings.selGradient);
            appearance.setAutoRotate(settings.autoRotate || {});

            // Only when the user has actually set lighting: `null` means "leave
            // the build-time fade-in targets alone", not "reset to defaults".
            if (settings.lighting) {
                setTimeout(() => appearance.setLighting(settings.lighting), LIGHTING_FADE_MS);
            }
        },
    };

    return appearance;
}
