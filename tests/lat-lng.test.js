import { describe, it, expect } from 'vitest';
import { latLngToXYZ, xyzToLatLng } from '../js/utils/coordinates.js';

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
