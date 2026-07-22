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
import { getAvailableThemes, getSelection, applyTheme, onThemesChanged } from './theme-switcher.js';
import { resolveActiveScheme } from './scene-appearance.js';
import { onThemeChange } from '../utils/theme.js';
import { AUDIT_TOKEN_KEY } from '../data/api-client.js';

// Post-fade lighting targets (the values the globe settles on after load).
const LIGHT_DEFAULTS = { ambient: 0.7, diffuse: 0.8, specStrength: 0.18, shininess: 12, oceanSpecBoost: 1.7 };

// Selection-tint presets offered in the Appearance section.
const HIGHLIGHT_SWATCHES = [
    { label: 'White', hex: 0xffffff },
    { label: 'Amber', hex: 0xffc107 },
    { label: 'Red', hex: 0xff5252 },
    { label: 'Cyan', hex: 0x4dd0e1 }
];

// Dev/editing buttons (existing markup) relocated into the Developer section.
const DEV_BUTTON_IDS = [
    'edit-mode-btn', 'save-config-btn', 'fine-tune-btn',
    'edit-colors-btn', 'save-colors-btn',
    'edit-zoom-btn', 'save-zoom-btn',
    'bounce-btn', 'shatter-btn', 'pinball-btn'
];

export class SettingsPanel {
    constructor({ globeManager, cameraController, labelManager, flagRenderer } = {}) {
        this.globeManager = globeManager;
        this.cameraController = cameraController;
        this.labelManager = labelManager;
        this.flagRenderer = flagRenderer;
        this.panel = null;
        this.gear = null;
        this._schemeButtons = new Map();
        this._themeButtons = new Map();
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
        this._relocateSearch();
        this._buildAppearance();
        this._buildLighting();
        this._buildRotation();
        this._buildDeveloper();
        this._buildFooter();

        this._applyPersisted();
    }

    // ---- section scaffolding ------------------------------------------------

    /** True when a superuser arrived via /audit/launch (signed audit token in sessionStorage). */
    _hasAuditToken() {
        try { return !!sessionStorage.getItem(AUDIT_TOKEN_KEY); } catch (_) { return false; }
    }

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

    /**
     * Move the existing #search-container (markup in index.html, with its
     * SearchManager listeners already attached by element ID) to the top of the
     * panel, just under the header. Reparenting preserves the IDs + listeners;
     * its standalone fixed-overlay framing is normalized by the panel CSS.
     */
    _relocateSearch() {
        const search = document.getElementById('search-container');
        if (search) this.panel.appendChild(search);
    }

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

        // UI theme picker — swaps the whole design-token set (fonts, radii,
        // colours) live. Built-in presets flip <html data-theme>; admin-authored
        // remote themes (fetched from the backend) apply inline token overrides.
        // See theme-switcher.js + the :root[data-theme] blocks in styles.css.
        const themeRow = this._row(sec, 'UI theme');
        this._themeGroupEl = document.createElement('div');
        this._themeGroupEl.className = 'settings-segmented';
        themeRow.appendChild(this._themeGroupEl);
        this._renderThemeButtons();
        // Remote themes load async — rebuild the control when they arrive/change.
        onThemesChanged(() => this._renderThemeButtons());

        // Admin-only: open the live theme editor. Gated on the audit token being
        // present (mirrors how audit mode is gated); test users never see it.
        this._maybeAddThemeEditorButton(sec);

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
        // When a theme change re-pins the effective scheme, reflect it here.
        onThemeChange((e) => {
            if (e && e.detail && e.detail.preview) return;
            this._highlightScheme(resolveActiveScheme());
        });

        // Show / hide the country fills (vs the bare ocean sphere). Drives the
        // uShowCountries shader uniform (globeManager.setShowCountries).
        this._checkbox(sec, 'Show countries', saved.showCountries !== false, (checked) => {
            if (this.globeManager) this.globeManager.setShowCountries(checked);
            settingsStore.save({ showCountries: checked });
        });

        // Show / hide the country name labels. Master switch honoured every frame
        // by LabelManager.updateVisibility — used to capture clean screenshots.
        this._checkbox(sec, 'Country names', saved.showLabels !== false, (checked) => {
            if (this.labelManager) this.labelManager.setLabelsVisible(checked);
            settingsStore.save({ showLabels: checked });
        });

        // Show / hide the country info panel (flag + population/area/etc.) that
        // appears on selecting a country. Off = clean screenshots.
        this._checkbox(sec, 'Country info panel', saved.showInfoPanel !== false, (checked) => {
            if (this.flagRenderer) this.flagRenderer.setInfoPanelEnabled(checked);
            settingsStore.save({ showInfoPanel: checked });
        });

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

    /** Highlight the active scheme button (no globe/persist side effects). */
    _highlightScheme(key) {
        for (const [k, btn] of this._schemeButtons) {
            btn.classList.toggle('active', k === key);
        }
    }

    /** Manual user pick — applies + persists as the user's scheme choice. */
    _selectScheme(key) {
        if (this.globeManager) applyScheme(this.globeManager, key);
        settingsStore.save({ scheme: key });
        this._highlightScheme(key);
    }

    /**
     * Apply the *effective* scheme without persisting: a theme-pinned
     * countryScheme wins, else the user's stored pick. Used on load and on theme
     * change so a pinned scheme never clobbers the user's saved preference.
     */
    _applyActiveScheme() {
        const key = resolveActiveScheme();
        if (this.globeManager) applyScheme(this.globeManager, key);
        this._highlightScheme(key);
    }

    /** (Re)build the theme segmented control from built-ins + remote themes. */
    _renderThemeButtons() {
        const group = this._themeGroupEl;
        if (!group) return;
        group.innerHTML = '';
        this._themeButtons.clear();
        const current = getSelection();
        for (const t of getAvailableThemes()) {
            const btn = document.createElement('button');
            btn.className = 'settings-seg-btn';
            btn.textContent = t.label;
            if (t.sel === current) btn.classList.add('active');
            btn.addEventListener('click', () => this._selectTheme(t.sel));
            group.appendChild(btn);
            this._themeButtons.set(t.sel, btn);
        }
    }

    _selectTheme(sel) {
        applyTheme(sel);
        for (const [k, btn] of this._themeButtons) {
            btn.classList.toggle('active', k === sel);
        }
    }

    /** Admin-only "Edit themes…" launcher (lazy-loads the editor module). */
    _maybeAddThemeEditorButton(sec) {
        if (!this._hasAuditToken()) return;

        const row = this._row(sec, null);
        const btn = document.createElement('button');
        btn.className = 'settings-btn';
        btn.textContent = 'Edit themes…';
        btn.addEventListener('click', async () => {
            const { openThemeEditor } = await import('./theme-editor.js');
            openThemeEditor({ onSaved: () => this._renderThemeButtons() });
        });
        row.appendChild(btn);
    }

    /**
     * Re-apply the persisted color scheme over the current palette. Used after
     * country-colors.json overrides load: those rewrite individual entries with
     * their build-time vibrant RGB, which would leave a non-vibrant scheme half
     * reverted. Re-deriving from paletteOriginal restores a consistent scheme.
     */
    reapplyPersistedScheme() {
        this._applyActiveScheme();
    }

    _buildLighting() {
        // Superuser-only (arrived via /audit/launch). Persisted lighting is still
        // applied by _applyPersisted, so hiding the controls doesn't change the globe.
        if (!this._hasAuditToken()) return;
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

    _buildDeveloper() {
        // Superuser-only (arrived via /audit/launch). Skipping the reparent leaves the
        // dev buttons in #container, where they stay display:none by default (styles.css)
        // — only the #settings-panel #… rule reveals them, and only once reparented.
        if (!this._hasAuditToken()) return;
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

    /** Footer with the privacy-policy link (required disclosure for ads/analytics). */
    _buildFooter() {
        const footer = document.createElement('div');
        footer.className = 'settings-footer';
        const link = document.createElement('a');
        link.href = '/privacy/';
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'Privacy Policy';
        footer.appendChild(link);
        this.panel.appendChild(footer);
    }

    // ---- persisted state ----------------------------------------------------

    _applyPersisted() {
        const saved = settingsStore.get();

        // UI theme — reflect the persisted choice in the segmented control only.
        // The attribute itself is applied earlier (initTheme, before first paint),
        // so we must not re-dispatch/re-persist here.
        const themeSel = getSelection();
        for (const [k, btn] of this._themeButtons) btn.classList.toggle('active', k === themeSel);

        // Color scheme (paletteOriginal exists by now). A theme-pinned scheme
        // wins over the stored pick; applied without persisting so it can't
        // clobber the user's saved scheme. See scene-appearance.js.
        this._applyActiveScheme();

        // Country fills + borders (opacity set first so enabling uses the saved strength).
        if (this.globeManager) {
            this.globeManager.setShowCountries(saved.showCountries !== false);
            this.globeManager.setBorderOpacity(saved.borderOpacity);
            this.globeManager.setBorderVisible(!!saved.borders);
        }

        // Country name labels + info panel master switches.
        if (this.labelManager) this.labelManager.setLabelsVisible(saved.showLabels !== false);
        if (this.flagRenderer) this.flagRenderer.setInfoPanelEnabled(saved.showInfoPanel !== false);

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
