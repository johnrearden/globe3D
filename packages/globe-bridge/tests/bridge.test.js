/**
 * The interface contract and its test double.
 *
 * `missingBridgeMembers` is the shared shape check: the web binding is asserted
 * against it in tests/web-globe-bridge.test.js, and the native implementation
 * will be too, so neither platform re-derives the list.
 */
import { describe, it, expect } from 'vitest';
import {
    GLOBE_BRIDGE_METHODS, GLOBE_MARKER_METHODS,
    missingBridgeMembers, createFakeGlobeBridge, callNames,
} from '../src/index.js';

describe('the interface', () => {
    it('accepts a complete implementation', () => {
        expect(missingBridgeMembers(createFakeGlobeBridge())).toEqual([]);
    });

    it('names every missing member, not just the first', () => {
        const missing = missingBridgeMembers({});
        expect(missing).toEqual([...GLOBE_BRIDGE_METHODS, 'markers']);
    });

    it('reports missing marker methods by their qualified name', () => {
        const partial = createFakeGlobeBridge();
        delete partial.markers.showLabel;
        expect(missingBridgeMembers(partial)).toEqual(['markers.showLabel']);
    });

    it('rejects a non-object', () => {
        expect(missingBridgeMembers(null)).toEqual(['(not an object)']);
        expect(missingBridgeMembers(undefined)).toEqual(['(not an object)']);
    });

    it('rejects a member that is present but not callable', () => {
        const bad = createFakeGlobeBridge();
        bad.highlight = 'not a function';
        expect(missingBridgeMembers(bad)).toEqual(['highlight']);
    });

    it('keeps the method lists frozen so an implementation cannot widen them', () => {
        expect(Object.isFrozen(GLOBE_BRIDGE_METHODS)).toBe(true);
        expect(Object.isFrozen(GLOBE_MARKER_METHODS)).toBe(true);
    });
});

describe('the fake', () => {
    it('tracks selection state', () => {
        const globe = createFakeGlobeBridge();
        globe.highlight('France');
        expect(globe.selected).toBe('France');
        globe.clearSelection();
        expect(globe.selected).toBe(null);
    });

    it('clears a flash along with the selection', () => {
        const globe = createFakeGlobeBridge();
        globe.flash('Chad', 0x33dd66, 1600);
        expect(globe.flashed).toEqual({ name: 'Chad', color: 0x33dd66, durationMs: 1600 });
        globe.clearSelection();
        expect(globe.flashed).toBe(null);
    });

    it('records call order, not just end state', () => {
        const globe = createFakeGlobeBridge();
        globe.markers.clear();
        globe.markers.place(48.85, 2.35);
        expect(callNames(globe)).toEqual(['markers.clear', 'markers.place']);
    });

    it('returns a stubbed framing distance', () => {
        const globe = createFakeGlobeBridge({ framingDistance: () => 2.4 });
        expect(globe.framingDistanceFor('Peru', 0.2)).toBe(2.4);
    });

    it('delivers picks to subscribers and stops on unsubscribe', () => {
        const globe = createFakeGlobeBridge();
        const seen = [];
        const off = globe.onPick(name => seen.push(name));
        globe.emitPick('Peru');
        off();
        globe.emitPick('Chad');
        expect(seen).toEqual(['Peru']);
    });

    it('reset() clears the log and the state but keeps subscribers', () => {
        const globe = createFakeGlobeBridge();
        const seen = [];
        globe.onPick(n => seen.push(n));
        globe.highlight('France');
        globe.reset();
        expect(globe.calls).toEqual([]);
        expect(globe.selected).toBe(null);
        globe.emitPick('Peru');
        expect(seen).toEqual(['Peru']);
    });
});
