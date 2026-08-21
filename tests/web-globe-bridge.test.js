/**
 * The web GlobeBridge: does it satisfy the interface, and does it translate
 * correctly onto GlobeManager / CameraController?
 *
 * Runs in Node against stubs of those two — the point of the bridge is that its
 * own logic (the lat/lng → Vector3 conversion, resetView's two-step, the
 * auto-rotate pair) no longer needs WebGL to exercise.
 */
import { describe, it, expect, vi } from 'vitest';
import { missingBridgeMembers } from '@terragotcha/globe-bridge';
import { createWebGlobeBridge } from '../js/data/globe-bridge.js';

function stubs() {
    const controls = { enableRotate: true, autoRotate: true };
    const globeManager = {
        setSelectedCountry: vi.fn(),
        clearSelection: vi.fn(),
        flashCountry: vi.fn(),
        showOnly: vi.fn(),
        showAll: vi.fn(),
        latLngToVector3: vi.fn((lat, lng) => ({ x: lat, y: lng, z: 0, _isVector3: true })),
        markers: { place: vi.fn(), setLabel: vi.fn(), showLabel: vi.fn(), clear: vi.fn() },
    };
    const cameraController = {
        rotateToCountry: vi.fn(),
        frameWholeGlobe: vi.fn(),
        frameView: vi.fn(),
        framingDistanceFor: vi.fn(() => 1.75),
        clearViewOffset: vi.fn(),
        zoomOut: vi.fn(),
        setAutoRotateAllowed: vi.fn(),
        clearSmallCountryIndicator: vi.fn(),
        getControls: () => controls,
    };
    return { globeManager, cameraController, controls,
             bridge: createWebGlobeBridge({ globeManager, cameraController }) };
}

describe('web globe bridge', () => {
    it('satisfies the shared interface', () => {
        expect(missingBridgeMembers(stubs().bridge)).toEqual([]);
    });

    it('maps appearance calls onto GlobeManager', () => {
        const { bridge, globeManager } = stubs();
        bridge.highlight('France');
        bridge.flash('Chad', 0x33dd66, 1600);
        bridge.showOnly(['Peru']);
        bridge.showAll();
        expect(globeManager.setSelectedCountry).toHaveBeenCalledWith('France');
        expect(globeManager.flashCountry).toHaveBeenCalledWith('Chad', 0x33dd66, 1600);
        expect(globeManager.showOnly).toHaveBeenCalledWith(['Peru']);
        expect(globeManager.showAll).toHaveBeenCalled();
    });

    it('clears the tiny-country reveal marker along with the selection', () => {
        // Without this the disc/arrow raised by focusCountry survives into the
        // next question — the bug the pairing exists to prevent.
        const { bridge, globeManager, cameraController } = stubs();
        bridge.clearSelection();
        expect(globeManager.clearSelection).toHaveBeenCalled();
        expect(cameraController.clearSmallCountryIndicator).toHaveBeenCalled();
    });

    it('focuses a country by name, with no aim point by default', () => {
        const { bridge, cameraController, globeManager } = stubs();
        bridge.focusCountry('Peru');
        expect(cameraController.rotateToCountry).toHaveBeenCalledWith('Peru', false, null);
        expect(globeManager.latLngToVector3).not.toHaveBeenCalled();
    });

    it('converts an aim coordinate to an engine vector so callers never see THREE', () => {
        const { bridge, cameraController, globeManager } = stubs();
        bridge.focusCountry('France', { quizFraming: true, aim: { lat: 48.85, lng: 2.35 } });
        expect(globeManager.latLngToVector3).toHaveBeenCalledWith(48.85, 2.35, 1.0, 0);
        const [name, framing, aimPoint] = cameraController.rotateToCountry.mock.calls[0];
        expect([name, framing]).toEqual(['France', true]);
        expect(aimPoint._isVector3).toBe(true);
    });

    it('resetView clears the view offset before zooming out', () => {
        // Order matters: zooming out with a stale offset leaves the globe
        // parked off-centre.
        const calls = [];
        const { bridge, cameraController } = stubs();
        cameraController.clearViewOffset.mockImplementation(() => calls.push('clearViewOffset'));
        cameraController.zoomOut.mockImplementation(() => calls.push('zoomOut'));
        bridge.resetView();
        expect(calls).toEqual(['clearViewOffset', 'zoomOut']);
    });

    it('setInteractive toggles rotation without touching auto-rotate', () => {
        const { bridge, controls } = stubs();
        bridge.setInteractive(false);
        expect(controls.enableRotate).toBe(false);
        expect(controls.autoRotate).toBe(true);
        bridge.setInteractive(true);
        expect(controls.enableRotate).toBe(true);
    });

    it('disallowing auto-rotate also stops a spin already in progress', () => {
        // setAutoRotateAllowed only governs whether idle rotation may RESUME, so
        // a quiz starting mid-spin would otherwise keep spinning.
        const { bridge, controls, cameraController } = stubs();
        bridge.setAutoRotateAllowed(false);
        expect(cameraController.setAutoRotateAllowed).toHaveBeenCalledWith(false);
        expect(controls.autoRotate).toBe(false);
    });

    it('re-allowing auto-rotate does not force it back on', () => {
        // Resuming is the idle timer's job; the bridge only lifts the ban.
        const { bridge, controls, cameraController } = stubs();
        controls.autoRotate = false;
        bridge.setAutoRotateAllowed(true);
        expect(cameraController.setAutoRotateAllowed).toHaveBeenCalledWith(true);
        expect(controls.autoRotate).toBe(false);
    });

    it('passes framing options straight through', () => {
        const { bridge, cameraController } = stubs();
        bridge.frameGlobe({ lat: 1, lng: 2, widthFraction: 0.25 });
        bridge.frameView({ lat: 3, lng: 4, distance: 2 });
        expect(cameraController.frameWholeGlobe).toHaveBeenCalledWith({ lat: 1, lng: 2, widthFraction: 0.25 });
        expect(cameraController.frameView).toHaveBeenCalledWith({ lat: 3, lng: 4, distance: 2 });
        expect(bridge.framingDistanceFor('Peru', 0.2)).toBe(1.75);
    });

    it('fans a delivered pick out to subscribers, and unsubscribes cleanly', () => {
        const { bridge } = stubs();
        const seen = [];
        const off = bridge.onPick(n => seen.push(n));
        bridge.deliverPick('Peru');
        off();
        bridge.deliverPick('Chad');
        expect(seen).toEqual(['Peru']);
    });

    it('keeps delivering to other listeners when one throws', () => {
        const { bridge } = stubs();
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const seen = [];
        bridge.onPick(() => { throw new Error('listener blew up'); });
        bridge.onPick(n => seen.push(n));
        expect(() => bridge.deliverPick('Peru')).not.toThrow();
        expect(seen).toEqual(['Peru']);
        err.mockRestore();
    });

    it('maps marker calls onto the globe marker layer', () => {
        const { bridge, globeManager } = stubs();
        bridge.markers.place(48.85, 2.35);
        bridge.markers.setLabel('Paris');
        bridge.markers.showLabel();
        bridge.markers.clear();
        expect(globeManager.markers.place).toHaveBeenCalledWith(48.85, 2.35);
        expect(globeManager.markers.setLabel).toHaveBeenCalledWith('Paris');
        expect(globeManager.markers.showLabel).toHaveBeenCalled();
        expect(globeManager.markers.clear).toHaveBeenCalled();
    });
});
