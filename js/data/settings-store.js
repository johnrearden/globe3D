/**
 * Settings store — small localStorage-backed persistence for user preferences
 * surfaced in the settings panel: color scheme, borders, lighting, auto-rotate,
 * and 2D-map feature toggle defaults.
 *
 * Kept deliberately separate from the in-memory `state` store (which holds
 * transient runtime state); this is the only thing that survives a reload.
 */

const STORAGE_KEY = 'globe3d-settings';

const DEFAULTS = {
    scheme: 'browns',
    showCountries: true,
    borders: true,
    borderOpacity: 0.1,
    // lighting is null until the user touches a slider, so we don't override the
    // build-time fade-in targets unless they've been deliberately changed.
    lighting: null, // { ambient, diffuse, specStrength, shininess, oceanSpecBoost }
    autoRotate: { enabled: true, delayMs: 120000, speed: 1.0 },
    mapToggles: { labels: true, roads: true, water: true, land: true, boundaries: true }
};

function read() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULTS };
        const parsed = JSON.parse(raw);
        return {
            ...DEFAULTS,
            ...parsed,
            autoRotate: { ...DEFAULTS.autoRotate, ...(parsed.autoRotate || {}) },
            mapToggles: { ...DEFAULTS.mapToggles, ...(parsed.mapToggles || {}) }
        };
    } catch (_) {
        return { ...DEFAULTS };
    }
}

class SettingsStore {
    constructor() {
        this._data = read();
    }

    /** Full settings object (a live reference — treat as read-only). */
    get() {
        return this._data;
    }

    /**
     * Shallow-merge a patch and persist. Nested `autoRotate` / `mapToggles` /
     * `lighting` patches are merged one level deep.
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
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
        } catch (_) {
            /* storage full / unavailable — preferences just won't persist */
        }
        return d;
    }

    /** Default checked-state for the 2D-map feature toggles. */
    getMapToggleDefaults() {
        return { ...DEFAULTS.mapToggles, ...(this._data.mapToggles || {}) };
    }
}

export const settingsStore = new SettingsStore();
