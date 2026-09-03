/**
 * The web GlobeAppearance must satisfy the contract, and must get the two
 * orderings right that a settings panel cannot see going wrong.
 *
 * Both are "the setting was ignored" bugs from the user's side, and neither
 * throws: applying border visibility before opacity draws borders at the wrong
 * strength, and calling setAutoRotateAllowed(true) at boot resets the idle timer
 * and stops the intro spin that was already running.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    GLOBE_APPEARANCE_METHODS,
    LIGHTING_DEFAULTS,
    missingAppearanceMembers,
} from '../packages/globe-bridge/src/index.js';
import { createWebGlobeAppearance } from '../js/data/globe-appearance.js';

/** A GlobeManager/CameraController stand-in that records the calls it receives. */
function stubEngine() {
    const calls = [];
    const log = name => (...args) => calls.push({ name, args });
    // THREE.Color's shape, reduced to the one method setThemeColors uses.
    const scene = { background: { value: null, set(v) { this.value = v; } } };
    const uniforms = {
        uAmbient: { value: { setScalar(v) { uniforms.uAmbient.value.scalar = v; }, scalar: null } },
        uDiffuse: { value: null },
        uSpecStrength: { value: null },
        uShininess: { value: null },
        uOceanSpecBoost: { value: null },
    };
    return {
        calls,
        uniforms,
        scene,
        globeManager: {
            material: { uniforms },
            // applyScheme bails without this, which is correct but would make
            // every scheme assertion vacuous.
            paletteOriginal: new Uint8Array(256 * 4).fill(120),
            applyBaseColors: log('applyBaseColors'),
            setHighlightColor: log('setHighlightColor'),
            setShowCountries: log('setShowCountries'),
            setBorderVisible: log('setBorderVisible'),
            setBorderOpacity: log('setBorderOpacity'),
            setSelectionGradient: log('setSelectionGradient'),
            setBorderColor: log('setBorderColor'),
            setOceanColor: log('setOceanColor'),
        },
        cameraController: {
            controls: { autoRotateSpeed: null },
            IDLE_DELAY: null,
            autoRotateAllowed: false,
            setAutoRotateAllowed: log('setAutoRotateAllowed'),
        },
        labelManager: { setLabelsVisible: log('setLabelsVisible') },
        sceneManager: { getScene: () => scene },
    };
}

const order = (calls, name) => calls.findIndex(c => c.name === name);

describe('createWebGlobeAppearance', () => {
    it('satisfies the interface', () => {
        const e = stubEngine();
        expect(missingAppearanceMembers(createWebGlobeAppearance(e))).toEqual([]);
    });

    it('offers the renderer’s schemes as {key,label} data, not colours', () => {
        const a = createWebGlobeAppearance(stubEngine());
        const schemes = a.schemes();
        expect(schemes.length).toBeGreaterThan(1);
        for (const s of schemes) {
            expect(Object.keys(s).sort()).toEqual(['key', 'label']);
        }
        expect(schemes.map(s => s.key)).toContain('greys');
    });

    it('sets border opacity BEFORE making borders visible', () => {
        const e = stubEngine();
        createWebGlobeAppearance(e).applyAll({ borders: true, borderOpacity: 0.9 });
        expect(order(e.calls, 'setBorderOpacity')).toBeLessThan(order(e.calls, 'setBorderVisible'));
        expect(e.calls.find(c => c.name === 'setBorderOpacity').args).toEqual([0.9]);
    });

    it('enables auto-rotate without resetting the idle timer', () => {
        const e = stubEngine();
        createWebGlobeAppearance(e).setAutoRotate({ enabled: true, delayMs: 5000, speed: 2 });
        // The flag, not the setter — the setter would stop the intro spin.
        expect(e.cameraController.autoRotateAllowed).toBe(true);
        expect(e.calls.some(c => c.name === 'setAutoRotateAllowed')).toBe(false);
        expect(e.cameraController.IDLE_DELAY).toBe(5000);
        expect(e.cameraController.controls.autoRotateSpeed).toBe(2);
    });

    it('goes through the setter to turn auto-rotate off', () => {
        const e = stubEngine();
        createWebGlobeAppearance(e).setAutoRotate({ enabled: false });
        expect(e.calls.find(c => c.name === 'setAutoRotateAllowed').args).toEqual([false]);
    });

    it('leaves auto-rotate alone when the patch does not mention it', () => {
        const e = stubEngine();
        createWebGlobeAppearance(e).setAutoRotate({ speed: 1.5 });
        expect(e.cameraController.autoRotateAllowed).toBe(false);
        expect(e.calls.some(c => c.name === 'setAutoRotateAllowed')).toBe(false);
    });

    it('treats a missing boolean as its default-on value', () => {
        const e = stubEngine();
        createWebGlobeAppearance(e).applyAll({});
        expect(e.calls.find(c => c.name === 'setShowCountries').args).toEqual([true]);
        expect(e.calls.find(c => c.name === 'setLabelsVisible').args).toEqual([true]);
    });

    it('defers persisted lighting past the load fade-in', () => {
        vi.useFakeTimers();
        const e = stubEngine();
        const lighting = { ambient: 0.1, diffuse: 0.2, specStrength: 0.3, shininess: 4, oceanSpecBoost: 0.5 };
        createWebGlobeAppearance(e).applyAll({ lighting });
        // Applied immediately it would be overwritten by fadeInLighting's ramp,
        // and the user's setting would silently revert on every load.
        expect(e.uniforms.uDiffuse.value).toBeNull();
        vi.advanceTimersByTime(2000);
        expect(e.uniforms.uDiffuse.value).toBe(0.2);
        expect(e.uniforms.uAmbient.value.scalar).toBe(0.1);
        vi.useRealTimers();
    });

    it('does not touch lighting at all when none is persisted', () => {
        vi.useFakeTimers();
        const e = stubEngine();
        // null means "leave the build-time fade-in targets alone", NOT "reset".
        createWebGlobeAppearance(e).applyAll({ lighting: null });
        vi.advanceTimersByTime(5000);
        expect(e.uniforms.uDiffuse.value).toBeNull();
        vi.useRealTimers();
    });

    it('restores the shared defaults on setLighting(null)', () => {
        const e = stubEngine();
        createWebGlobeAppearance(e).setLighting(null);
        expect(e.uniforms.uDiffuse.value).toBe(LIGHTING_DEFAULTS.diffuse);
        expect(e.uniforms.uShininess.value).toBe(LIGHTING_DEFAULTS.shininess);
    });

    it('works on a globe with no labels', () => {
        const e = stubEngine();
        const a = createWebGlobeAppearance({ ...e, labelManager: undefined });
        expect(() => a.applyAll({ showLabels: false })).not.toThrow();
    });

    it('applies all three themed globe colours', () => {
        const e = stubEngine();
        createWebGlobeAppearance(e).setThemeColors({
            space: '#050d16', border: 'rgba(238, 242, 246, 0.28)', ocean: '#061a33',
        });
        expect(e.scene.background.value).toBe('#050d16');
        expect(e.calls.find(c => c.name === 'setBorderColor').args)
            .toEqual(['rgba(238, 242, 246, 0.28)']);
        expect(e.calls.find(c => c.name === 'setOceanColor').args).toEqual(['#061a33']);
    });

    it('leaves an omitted colour alone rather than blanking it', () => {
        // A caller that only knows the ocean must not reset the backdrop --
        // readThemeColors returns undefined for a token the cascade lacks.
        const e = stubEngine();
        createWebGlobeAppearance(e).setThemeColors({ ocean: '#08324f' });
        expect(e.scene.background.value).toBeNull();
        expect(e.calls.some(c => c.name === 'setBorderColor')).toBe(false);
        expect(e.calls.find(c => c.name === 'setOceanColor').args).toEqual(['#08324f']);
    });

    it('is a no-op with no argument, and on a globe with no scene', () => {
        const e = stubEngine();
        expect(() => createWebGlobeAppearance(e).setThemeColors()).not.toThrow();
        expect(e.calls).toEqual([]);
        // sceneManager is optional: only setThemeColors needs it.
        const noScene = createWebGlobeAppearance({ ...e, sceneManager: undefined });
        expect(() => noScene.setThemeColors({ space: '#000', ocean: '#123' })).not.toThrow();
        expect(e.calls.find(c => c.name === 'setOceanColor').args).toEqual(['#123']);
    });

    it('exposes every declared method and no more', () => {
        const a = createWebGlobeAppearance(stubEngine());
        expect(Object.keys(a).sort()).toEqual([...GLOBE_APPEARANCE_METHODS].sort());
    });
});
