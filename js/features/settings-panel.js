/**
 * Settings panel — a single gear (⚙) that houses every globe preference:
 * color scheme, country borders, lighting, auto-rotation, the 2D-map feature
 * toggles, and the (absorbed) developer/editing tools.
 *
 * Builds its own DOM at runtime (per CLAUDE.md) and replaces the old
 * `#dev-edit-toggle` reveal + the debug-only inline lighting panel. Preferences
 * persist via settings-store.js.
 */

import { settingsStore } from '../data/settings-store.js';
import { SCHEMES, applyScheme } from './color-schemes.js';

// Post-fade lighting targets (the values the globe settles on after load).
const LIGHT_DEFAULTS = { ambient: 0.7, diffuse: 0.8, specStrength: 0.18, shininess: 12, oceanSpecBoost: 1.7 };

// Selection-tint presets offered in the Appearance section.
const HIGHLIGHT_SWATCHES = [
    { label: 'White', hex: 0xffffff },
    { label: 'Amber', hex: 0xffc107 },
    { label: 'Red', hex: 0xff5252 },
    { label: 'Cyan', hex: 0x4dd0e1 }
];

// 2D-map feature toggles surfaced as global defaults (mirror country-map's TOGGLE_GROUPS).
const MAP_TOGGLES = [
    { key: 'labels', label: 'Place labels' },
    { key: 'roads', label: 'Roads' },
    { key: 'water', label: 'Water' },
    { key: 'land', label: 'Land use' },
    { key: 'boundaries', label: 'Boundaries' }
];

// Dev/editing buttons (existing markup) relocated into the Developer section.
const DEV_BUTTON_IDS = [
    'edit-mode-btn', 'save-config-btn', 'fine-tune-btn',
    'edit-colors-btn', 'save-colors-btn',
    'edit-zoom-btn', 'save-zoom-btn',
    'bounce-btn', 'shatter-btn', 'pinball-btn'
];

export class SettingsPanel {
    constructor({ globeManager, cameraController } = {}) {
        this.globeManager = globeManager;
        this.cameraController = cameraController;
        this.panel = null;
        this.gear = null;
        this._schemeButtons = new Map();
    }

    /** Build the gear + panel, wire controls, and apply persisted preferences. */
    init() {
        const host = document.getElementById('container') || document.body;

        this.gear = document.createElement('button');
        this.gear.id = 'settings-toggle';
        this.gear.title = 'Settings';
        this.gear.textContent = '⚙';
        this.gear.addEventListener('click', () => this.toggle());
        host.appendChild(this.gear);

        this.panel = document.createElement('div');
        this.panel.id = 'settings-panel';
        this.panel.classList.add('hidden');
        host.appendChild(this.panel);

        this._buildHeader();
        this._buildAppearance();
        this._buildLighting();
        this._buildRotation();
        this._buildMapToggles();
        this._buildDeveloper();

        this._applyPersisted();
    }

    // ---- section scaffolding ------------------------------------------------

    _section(title) {
        const sec = document.createElement('div');
        sec.className = 'settings-section';
        const h = document.createElement('h3');
        h.textContent = title;
        sec.appendChild(h);
        this.panel.appendChild(sec);
        return sec;
    }

    _row(parent, labelText) {
        const row = document.createElement('div');
        row.className = 'settings-row';
        if (labelText) {
            const lab = document.createElement('span');
            lab.className = 'settings-label';
            lab.textContent = labelText;
            row.appendChild(lab);
        }
        parent.appendChild(row);
        return row;
    }

    _slider(parent, labelText, { min, max, step, value }, onInput) {
        const row = this._row(parent, labelText);
        const input = document.createElement('input');
        input.type = 'range';
        input.min = min; input.max = max; input.step = step; input.value = value;
        const val = document.createElement('span');
        val.className = 'settings-value';
        const render = () => { val.textContent = Number(input.value).toFixed(2); };
        render();
        input.addEventListener('input', () => { onInput(parseFloat(input.value)); render(); });
        row.appendChild(input);
        row.appendChild(val);
        return input;
    }

    _checkbox(parent, labelText, checked, onChange) {
        const row = this._row(parent, null);
        const lab = document.createElement('label');
        lab.className = 'settings-check';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        input.addEventListener('change', () => onChange(input.checked));
        lab.appendChild(input);
        lab.appendChild(document.createTextNode(' ' + labelText));
        row.appendChild(lab);
        return input;
    }

    // ---- sections -----------------------------------------------------------

    _buildHeader() {
        const header = document.createElement('div');
        header.className = 'settings-header';
        const title = document.createElement('span');
        title.textContent = 'Settings';
        const close = document.createElement('button');
        close.className = 'settings-close';
        close.textContent = '✕';
        close.title = 'Close';
        close.addEventListener('click', () => this.close());
        header.appendChild(title);
        header.appendChild(close);
        this.panel.appendChild(header);
    }

    _buildAppearance() {
        const sec = this._section('Appearance');
        const saved = settingsStore.get();

        // Color scheme picker.
        const schemeRow = this._row(sec, 'Color scheme');
        const group = document.createElement('div');
        group.className = 'settings-segmented';
        for (const s of SCHEMES) {
            const btn = document.createElement('button');
            btn.className = 'settings-seg-btn';
            btn.textContent = s.label;
            btn.addEventListener('click', () => this._selectScheme(s.key));
            group.appendChild(btn);
            this._schemeButtons.set(s.key, btn);
        }
        schemeRow.appendChild(group);

        // Borders toggle (independent of scheme). Drawn as a shader edge effect
        // from the baked border distance field (globeManager.setBorder*).
        this._checkbox(sec, 'Country borders', !!saved.borders, (checked) => {
            if (this.globeManager) this.globeManager.setBorderVisible(checked);
            settingsStore.save({ borders: checked });
        });

        // Border opacity — blends the border ink over the fill (0.1–1.0).
        this._slider(sec, 'Border opacity', { min: 0.1, max: 1.0, step: 0.05, value: saved.borderOpacity },
            v => {
                if (this.globeManager) this.globeManager.setBorderOpacity(v);
                settingsStore.save({ borderOpacity: v });
            });

        // Highlight color presets.
        const hlRow = this._row(sec, 'Highlight');
        for (const sw of HIGHLIGHT_SWATCHES) {
            const dot = document.createElement('button');
            dot.className = 'settings-swatch';
            dot.title = sw.label;
            dot.style.background = '#' + sw.hex.toString(16).padStart(6, '0');
            dot.addEventListener('click', () => {
                if (this.globeManager) this.globeManager.setHighlightColor(sw.hex);
            });
            hlRow.appendChild(dot);
        }
    }

    _selectScheme(key) {
        if (this.globeManager) applyScheme(this.globeManager, key);
        settingsStore.save({ scheme: key });
        for (const [k, btn] of this._schemeButtons) {
            btn.classList.toggle('active', k === key);
        }
    }

    /**
     * Re-apply the persisted color scheme over the current palette. Used after
     * country-colors.json overrides load: those rewrite individual entries with
     * their build-time vibrant RGB, which would leave a non-vibrant scheme half
     * reverted. Re-deriving from paletteOriginal restores a consistent scheme.
     */
    reapplyPersistedScheme() {
        this._selectScheme(settingsStore.get().scheme || 'vibrant');
    }

    _buildLighting() {
        const sec = this._section('Lighting');
        const U = this.globeManager && this.globeManager.material && this.globeManager.material.uniforms;
        if (!U) return;
        const saved = settingsStore.get().lighting || LIGHT_DEFAULTS;

        const persist = () => settingsStore.save({
            lighting: {
                ambient: U.uAmbient.value.r,
                diffuse: U.uDiffuse.value,
                specStrength: U.uSpecStrength.value,
                shininess: U.uShininess.value,
                oceanSpecBoost: U.uOceanSpecBoost.value
            }
        });

        this._lightInputs = {};
        this._lightInputs.ambient = this._slider(sec, 'Ambient', { min: 0, max: 1.5, step: 0.05, value: saved.ambient },
            v => { U.uAmbient.value.setScalar(v); persist(); });
        this._lightInputs.diffuse = this._slider(sec, 'Diffuse', { min: 0, max: 1.5, step: 0.05, value: saved.diffuse },
            v => { U.uDiffuse.value = v; persist(); });
        this._lightInputs.specStrength = this._slider(sec, 'Specular', { min: 0, max: 1.0, step: 0.02, value: saved.specStrength },
            v => { U.uSpecStrength.value = v; persist(); });
        this._lightInputs.shininess = this._slider(sec, 'Shininess', { min: 2, max: 120, step: 1, value: saved.shininess },
            v => { U.uShininess.value = v; persist(); });
        this._lightInputs.oceanSpecBoost = this._slider(sec, 'Ocean glint', { min: 0, max: 3.0, step: 0.1, value: saved.oceanSpecBoost },
            v => { U.uOceanSpecBoost.value = v; persist(); });

        const resetRow = this._row(sec, null);
        const reset = document.createElement('button');
        reset.className = 'settings-btn';
        reset.textContent = 'Reset lighting';
        reset.addEventListener('click', () => {
            U.uAmbient.value.setScalar(LIGHT_DEFAULTS.ambient);
            U.uDiffuse.value = LIGHT_DEFAULTS.diffuse;
            U.uSpecStrength.value = LIGHT_DEFAULTS.specStrength;
            U.uShininess.value = LIGHT_DEFAULTS.shininess;
            U.uOceanSpecBoost.value = LIGHT_DEFAULTS.oceanSpecBoost;
            this._lightInputs.ambient.value = LIGHT_DEFAULTS.ambient;
            this._lightInputs.diffuse.value = LIGHT_DEFAULTS.diffuse;
            this._lightInputs.specStrength.value = LIGHT_DEFAULTS.specStrength;
            this._lightInputs.shininess.value = LIGHT_DEFAULTS.shininess;
            this._lightInputs.oceanSpecBoost.value = LIGHT_DEFAULTS.oceanSpecBoost;
            this._lightInputs.ambient.dispatchEvent(new Event('input'));
            settingsStore.save({ lighting: { ...LIGHT_DEFAULTS } });
        });
        resetRow.appendChild(reset);
    }

    _buildRotation() {
        const sec = this._section('Rotation');
        const cc = this.cameraController;
        const saved = settingsStore.get().autoRotate;

        this._checkbox(sec, 'Auto-rotate when idle', !!saved.enabled, (checked) => {
            if (cc) cc.setAutoRotateAllowed(checked);
            settingsStore.save({ autoRotate: { enabled: checked } });
        });

        this._slider(sec, 'Idle delay (s)', { min: 5, max: 300, step: 5, value: saved.delayMs / 1000 },
            v => {
                if (cc) cc.IDLE_DELAY = v * 1000;
                settingsStore.save({ autoRotate: { delayMs: v * 1000 } });
            });

        this._slider(sec, 'Speed', { min: 0.2, max: 3.0, step: 0.1, value: saved.speed },
            v => {
                if (cc && cc.controls) cc.controls.autoRotateSpeed = v;
                settingsStore.save({ autoRotate: { speed: v } });
            });
    }

    _buildMapToggles() {
        const sec = this._section('2D map features');
        const note = document.createElement('p');
        note.className = 'settings-note';
        note.textContent = 'Defaults applied when opening a country in the 2D map.';
        sec.appendChild(note);
        const defaults = settingsStore.getMapToggleDefaults();
        for (const t of MAP_TOGGLES) {
            this._checkbox(sec, t.label, defaults[t.key] !== false, (checked) => {
                settingsStore.save({ mapToggles: { [t.key]: checked } });
            });
        }
    }

    _buildDeveloper() {
        const sec = this._section('Developer / Editing');
        const tools = document.createElement('div');
        tools.className = 'settings-dev-tools';
        sec.appendChild(tools);
        // Relocate the existing dev/editing buttons into the panel. Reparenting
        // preserves their IDs, cached lookups, and already-attached listeners, so
        // the label/color/zoom editors and animations keep working unchanged.
        for (const id of DEV_BUTTON_IDS) {
            const el = document.getElementById(id);
            if (el) tools.appendChild(el);
        }
    }

    // ---- persisted state ----------------------------------------------------

    _applyPersisted() {
        const saved = settingsStore.get();

        // Color scheme + highlight (paletteOriginal exists by now).
        this._selectScheme(saved.scheme || 'vibrant');

        // Borders (opacity set first so enabling uses the saved strength).
        if (this.globeManager) {
            this.globeManager.setBorderOpacity(saved.borderOpacity);
            this.globeManager.setBorderVisible(!!saved.borders);
        }

        // Auto-rotate prefs. Set the delay/speed directly and, when enabled, just
        // flip the master flag so the intro idle-spin already running is preserved
        // (setAutoRotateAllowed(true) would reset the idle timer and stop it).
        const cc = this.cameraController;
        if (cc) {
            if (cc.controls) cc.controls.autoRotateSpeed = saved.autoRotate.speed;
            cc.IDLE_DELAY = saved.autoRotate.delayMs;
            if (saved.autoRotate.enabled) cc.autoRotateAllowed = true;
            else cc.setAutoRotateAllowed(false);
        }

        // Lighting — apply only if the user has previously set it, and after the
        // load fade-in (globeManager.fadeInLighting) finishes ramping the uniforms.
        if (saved.lighting) {
            const U = this.globeManager && this.globeManager.material && this.globeManager.material.uniforms;
            if (U) {
                setTimeout(() => {
                    U.uAmbient.value.setScalar(saved.lighting.ambient);
                    U.uDiffuse.value = saved.lighting.diffuse;
                    U.uSpecStrength.value = saved.lighting.specStrength;
                    U.uShininess.value = saved.lighting.shininess;
                    U.uOceanSpecBoost.value = saved.lighting.oceanSpecBoost;
                }, 1700);
            }
        }
    }

    // ---- open/close ---------------------------------------------------------

    toggle() {
        this.panel.classList.contains('hidden') ? this.open() : this.close();
    }

    open() {
        this.panel.classList.remove('hidden');
        this.gear.classList.add('active');
    }

    close() {
        this.panel.classList.add('hidden');
        this.gear.classList.remove('active');
    }
}
