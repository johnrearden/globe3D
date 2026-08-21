/**
 * The web GlobeBridge — GlobeManager + CameraController behind the shared
 * interface.
 *
 * This is the whole platform-specific half of @terragotcha/globe-bridge. The
 * Expo app will have a file of about this size implementing the same methods
 * against its expo-gl engine; everything above the bridge is already shared.
 *
 * Two conversions happen here on purpose, because they are exactly what must
 * NOT leak into a mode (see the interface docs):
 *
 *   - `{lat, lng}` → `THREE.Vector3`, so the capital-cities mode can aim the
 *     camera at a capital without naming a THREE type.
 *   - country name → centroid record, so no mode has to fetch a record purely
 *     to pass it back to the camera.
 */

/**
 * @param {object} deps
 * @param {object} deps.globeManager
 * @param {object} deps.cameraController
 * @returns {import('@terragotcha/globe-bridge').GlobeBridge}
 */
export function createWebGlobeBridge({ globeManager, cameraController }) {
    const pickListeners = new Set();

    return {
        // ---- appearance -------------------------------------------------------
        highlight(name) { globeManager.setSelectedCountry(name); },
        clearSelection() {
            globeManager.clearSelection();
            // rotateToCountry raises the tiny-country disc/arrow when it lands, so
            // clearing the selection has to clear that too or it lingers into the
            // next question. pointer-controls already pairs these two.
            cameraController.clearSmallCountryIndicator();
        },
        flash(name, color, durationMs) { globeManager.flashCountry(name, color, durationMs); },
        showOnly(names) { globeManager.showOnly(names); },
        showAll() { globeManager.showAll(); },

        // ---- camera -----------------------------------------------------------
        focusCountry(name, { quizFraming = false, aim = null } = {}) {
            // rotateToCountry takes a name or a record, but the aim point has to
            // be a Vector3 — the conversion the interface exists to contain.
            const aimPoint = aim
                ? globeManager.latLngToVector3(aim.lat, aim.lng, 1.0, 0)
                : null;
            cameraController.rotateToCountry(name, quizFraming, aimPoint);
        },

        frameGlobe(opts = {}) { cameraController.frameWholeGlobe(opts); },

        frameView(opts) { cameraController.frameView(opts); },

        framingDistanceFor(name, fraction) {
            return cameraController.framingDistanceFor(name, fraction);
        },

        resetView() {
            cameraController.clearViewOffset();
            cameraController.zoomOut();
        },

        // ---- interaction ------------------------------------------------------
        setInteractive(enabled) {
            const controls = cameraController.getControls();
            if (controls) controls.enableRotate = enabled;
        },

        setAutoRotateAllowed(allowed) {
            cameraController.setAutoRotateAllowed(allowed);
            // setAutoRotateAllowed only governs whether idle rotation may RESUME;
            // a quiz starting mid-spin also has to stop the current one.
            const controls = cameraController.getControls();
            if (controls && !allowed) controls.autoRotate = false;
        },

        // ---- picking ----------------------------------------------------------
        // pointer-controls still calls clickQuiz.handleAnswer() directly; this is
        // the hook that inverts it, wired by `deliverPick` below so the two can
        // coexist until that refactor lands.
        onPick(cb) {
            pickListeners.add(cb);
            return () => pickListeners.delete(cb);
        },

        /** Called by pointer-controls when a country is tapped. Not part of the interface. */
        deliverPick(name) {
            for (const cb of pickListeners) {
                try { cb(name); } catch (err) { console.error('globe-bridge pick listener failed:', err); }
            }
        },

        // ---- markers ----------------------------------------------------------
        markers: {
            place(lat, lng) { globeManager.markers.place(lat, lng); },
            setLabel(text) { globeManager.markers.setLabel(text); },
            showLabel() { globeManager.markers.showLabel(); },
            clear() { globeManager.markers.clear(); },
        },
    };
}
