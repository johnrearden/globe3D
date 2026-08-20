/**
 * Settings store — persisted user preferences surfaced in the settings panel:
 * colour scheme, borders, lighting, auto-rotate, and 2D-map toggle defaults.
 *
 * Kept deliberately separate from the in-memory `state` store (which holds
 * transient runtime state); this is the only thing that survives a reload.
 *
 * Ported from js/data/settings-store.js. The only change is that the adapter is
 * injected instead of reaching for `localStorage` directly, so React Native can
 * bind MMKV and tests can bind memory. The defaults, the merge semantics and the
 * live-reference `get()` are unchanged, because settings-panel.js and
 * scene-appearance.js depend on all three.
 */

import { readJson, writeJson } from './adapter.js';

export const SETTINGS_KEY = 'globe3d-settings';

export const SETTINGS_DEFAULTS = {
    theme: 'default',
    // Cached {base, tokens} of the selected *remote* theme, so it can be applied
    // before first paint on reload (no default-look flash). null for built-ins.
    themeInline: null,
    // Cached {sceneBg, oceanColor, countryScheme} of the selected remote theme,
    // applied by scene-appearance.js before the async theme fetch resolves (no
    // scene flash). null for built-ins. See js/features/scene-appearance.js.
    themeScene: null,
    scheme: 'greys',
    showCountries: true,
    showLabels: true,
    showInfoPanel: true,
    borders: true,
    borderOpacity: 0.2,
    selGradient: true,    // radial tonal gradient on the selected country's fill (on by default)
    // lighting is null until the user touches a slider, so we don't override the
    // build-time fade-in targets unless they've been deliberately changed.
    lighting: null, // { ambient, diffuse, specStrength, shininess, oceanSpecBoost }
    autoRotate: { enabled: true, delayMs: 120000, speed: 1.0 }
};

class SettingsStore {
    /** @param {import('./adapter.js').StorageAdapter} storage */
    constructor(storage) {
        this._storage = storage;
        const parsed = readJson(storage, SETTINGS_KEY, null) || {};
        this._data = {
            ...SETTINGS_DEFAULTS,
            ...parsed,
            autoRotate: { ...SETTINGS_DEFAULTS.autoRotate, ...(parsed.autoRotate || {}) }
        };
    }

    /** Full settings object (a live reference — treat as read-only). */
    get() {
        return this._data;
    }

    /**
     * Shallow-merge a patch and persist. Nested `autoRotate` / `lighting`
     * patches are merged one level deep.
     */
    save(patch = {}) {
        const d = this._data;
        for (const key of Object.keys(patch)) {
            const val = patch[key];
            if (val && typeof val === 'object' && !Array.isArray(val) && d[key] && typeof d[key] === 'object') {
                d[key] = { ...d[key], ...val };
            } else {
                d[key] = val;
            }
        }
        writeJson(this._storage, SETTINGS_KEY, d);
        return d;
    }
}

/**
 * @param {import('./adapter.js').StorageAdapter} storage
 * @returns {SettingsStore}
 */
export function createSettingsStore(storage) {
    return new SettingsStore(storage);
}
