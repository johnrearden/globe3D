import { describe, it, expect } from 'vitest';
import { latLngToXYZ, xyzToLatLng, framingDirection } from '../js/utils/coordinates.js';

describe('lat/lng <-> xyz round-trip', () => {
    it('recovers 500 random points within 1e-6 degrees', () => {
        // Deterministic LCG so failures are reproducible (no Math.random()).
        let seed = 123456789;
        const rand = () => {
            seed = (1103515245 * seed + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
        };

        for (let i = 0; i < 500; i++) {
            const lat = rand() * 178 - 89;   // (-89, 89)
            const lng = rand() * 358 - 179;  // (-179, 179)
            const { x, y, z } = latLngToXYZ(lat, lng);
            const back = xyzToLatLng(x, y, z);
            expect(back.lat).toBeCloseTo(lat, 6);
            expect(back.lng).toBeCloseTo(lng, 6);
        }
    });

    it('honors radius and height', () => {
        const p = latLngToXYZ(0, -180, 2, 0.5); // phi=90, theta=0 -> +x axis
        const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
        expect(r).toBeCloseTo(2.5, 9);
    });
});

describe('framingDirection', () => {
    it('uses the named point when there is one', () => {
        const d = framingDirection({ lat: 0, lng: 0, current: { x: 9, y: 9, z: 9 } });
        const expected = latLngToXYZ(0, 0, 1, 0);
        expect(d.x).toBeCloseTo(expected.x, 10);
        expect(d.y).toBeCloseTo(expected.y, 10);
        expect(d.z).toBeCloseTo(expected.z, 10);
    });

    it('keeps the current heading when no point is named', () => {
        // frameGlobe() asks to frame the whole globe and names no point. This is
        // the case that used to produce NaN — see below.
        const d = framingDirection({ current: { x: 0, y: 0, z: 4 } });
        expect(d).toEqual({ x: 0, y: 0, z: 1 });
    });

    it('NEVER returns a non-finite vector', () => {
        // The bug this exists to prevent: latLngToXYZ(undefined, undefined)
        // returns NaN, frameView copied it into camera.position, and a NaN camera
        // renders an entirely blank canvas — with no error, no warning, and the
        // ready flag still set. It cost a session because every check still
        // passed: a canvas existed and data-globe said "ready".
        const inputs = [
            {},
            { lat: undefined, lng: undefined },
            { lat: NaN, lng: NaN, current: { x: NaN, y: NaN, z: NaN } },
            { lat: 10, lng: undefined },
            { current: { x: 0, y: 0, z: 0 } },
            { current: null },
            { current: { x: Infinity, y: 0, z: 0 } },
        ];
        for (const input of inputs) {
            const d = framingDirection(input);
            const len = Math.hypot(d.x, d.y, d.z);
            expect(Number.isFinite(len), JSON.stringify(input)).toBe(true);
            expect(len, JSON.stringify(input)).toBeCloseTo(1, 10);
        }
    });

    it('always returns a unit vector', () => {
        for (const [lat, lng] of [[0, 0], [51.5, -0.12], [-90, 180], [90, -180]]) {
            const d = framingDirection({ lat, lng });
            expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 10);
        }
    });
});
