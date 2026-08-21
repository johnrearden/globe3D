/**
 * An in-memory GlobeBridge that records what it was asked to do.
 *
 * Quiz logic could not be tested headlessly before this: every mode reached
 * straight for GlobeManager, which needs WebGL and a 30 MB mesh. With the
 * interface in place, a test can assert "the reveal highlighted the right
 * country and flashed it green" against plain data.
 *
 * It keeps both current state (`selected`, `interactive`) and an ordered `calls`
 * log, because some assertions are about the end state and others are about
 * sequence — clearing a marker *before* placing the next one is a real bug this
 * catches and a state-only double would not.
 */

/**
 * @param {object} [opts]
 * @param {(name: string, fraction: number) => number} [opts.framingDistance]
 *   Stub for the one bridge method with a return value.
 * @returns {import('./interface.js').GlobeBridge & {calls: object[], reset: () => void}}
 */
export function createFakeGlobeBridge({ framingDistance = () => 1.5 } = {}) {
    const calls = [];
    const record = (method, args) => { calls.push({ method, args }); };
    const pickListeners = new Set();

    const fake = {
        // ---- observable state -------------------------------------------------
        calls,
        selected: null,
        flashed: null,
        visibleOnly: null,
        interactive: true,
        autoRotateAllowed: true,
        view: null,
        markerState: { lat: null, lng: null, label: null, labelShown: false },

        reset() {
            calls.length = 0;
            fake.selected = null;
            fake.flashed = null;
            fake.visibleOnly = null;
            fake.view = null;
            fake.markerState = { lat: null, lng: null, label: null, labelShown: false };
        },

        /** Deliver a tap to every onPick subscriber, as the real globe would. */
        emitPick(name) {
            for (const cb of pickListeners) cb(name);
        },

        // ---- the interface ----------------------------------------------------
        highlight(name) { record('highlight', [name]); fake.selected = name; },
        clearSelection() { record('clearSelection', []); fake.selected = null; fake.flashed = null; },
        flash(name, color, durationMs) {
            record('flash', [name, color, durationMs]);
            fake.flashed = { name, color, durationMs };
        },
        showOnly(names) { record('showOnly', [names]); fake.visibleOnly = names.slice(); },
        showAll() { record('showAll', []); fake.visibleOnly = null; },

        focusCountry(name, opts = {}) {
            record('focusCountry', [name, opts]);
            fake.view = { kind: 'country', name, ...opts };
        },
        frameGlobe(opts = {}) { record('frameGlobe', [opts]); fake.view = { kind: 'globe', ...opts }; },
        frameView(opts) { record('frameView', [opts]); fake.view = { kind: 'view', ...opts }; },
        framingDistanceFor(name, fraction) {
            record('framingDistanceFor', [name, fraction]);
            return framingDistance(name, fraction);
        },
        resetView() { record('resetView', []); fake.view = null; },

        setInteractive(enabled) { record('setInteractive', [enabled]); fake.interactive = enabled; },
        setAutoRotateAllowed(allowed) {
            record('setAutoRotateAllowed', [allowed]);
            fake.autoRotateAllowed = allowed;
        },

        onPick(cb) {
            record('onPick', []);
            pickListeners.add(cb);
            return () => pickListeners.delete(cb);
        },

        markers: {
            place(lat, lng) {
                record('markers.place', [lat, lng]);
                fake.markerState.lat = lat;
                fake.markerState.lng = lng;
            },
            setLabel(text) { record('markers.setLabel', [text]); fake.markerState.label = text; },
            showLabel() { record('markers.showLabel', []); fake.markerState.labelShown = true; },
            clear() {
                record('markers.clear', []);
                fake.markerState = { lat: null, lng: null, label: null, labelShown: false };
            },
        },
    };

    return fake;
}

/** Method names from a `calls` log, for order assertions. */
export function callNames(bridge) {
    return bridge.calls.map(c => c.method);
}
