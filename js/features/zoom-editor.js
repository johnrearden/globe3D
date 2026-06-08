/**
 * Focus-zoom editor — pick a level (A–H), then click countries to assign the
 * camera framing distance used by click/search/quiz focus, and save the result
 * to country-zoom.json.
 *
 * Owns its edit-mode flag, working config, and selected level. The shared
 * FocusZoomRegistry and LabelManager are injected (they're used elsewhere too),
 * as is rotateGlobeToCountry for the live preview. onEnter switches off the
 * other mutually-exclusive edit modes.
 */

import { LEVELS, LEVEL_DISTANCES } from '../core/focus-zoom.js';
import { elements, show, hide, addClass, removeClass, setText } from '../utils/dom.js';

export class ZoomEditor {
    constructor({ labelManager = null, focusRegistry = null, rotateGlobeToCountry, onEnter } = {}) {
        this.labelManager = labelManager;
        this.focusRegistry = focusRegistry;
        this.rotateGlobeToCountry = rotateGlobeToCountry || (() => {});
        this.onEnter = onEnter || (() => {});
        this.active = false;
        this.config = {};          // { countryName: level }
        this.activeLevel = 'C';    // selected level in the Edit Zoom panel
    }

    isActive() {
        return this.active;
    }

    /** Fetch country-zoom.json (if present) and apply the overrides. */
    loadConfig() {
        fetch('country-zoom.json')
            .then(response => {
                if (!response.ok) throw new Error('No saved zoom config found');
                return response.json();
            })
            .then(config => {
                this.config = config;
                console.log('Loaded zoom configuration for', Object.keys(this.config).length, 'countries');
                if (this.focusRegistry) {
                    this.focusRegistry.applyOverrides(this.config);
                    if (this.labelManager) this.labelManager.applyFocusZoom(this.focusRegistry);
                }
            })
            .catch(() => {
                console.log('No zoom config file found, using default levels');
            });
    }

    /** Build the A–H level panel. Each button sets activeLevel. */
    buildLevelPanel() {
        const panel = elements.get('level-panel');
        if (!panel) return;
        panel.innerHTML = '';
        LEVELS.forEach(lvl => {
            const btn = document.createElement('button');
            btn.className = 'level-btn' + (lvl === this.activeLevel ? ' active' : '');
            btn.textContent = `${lvl} · ${LEVEL_DISTANCES[lvl].toFixed(2)}`;
            btn.dataset.level = lvl;
            btn.addEventListener('click', () => {
                this.activeLevel = lvl;
                panel.querySelectorAll('.level-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            panel.appendChild(btn);
        });
    }

    toggle() {
        this.active = !this.active;

        const editBtn = elements.get('edit-zoom-btn');
        const saveBtn = elements.get('save-zoom-btn');
        const levelPanel = elements.get('level-panel');

        if (this.active) {
            console.log('Zoom edit mode ENABLED - Pick a level, then click countries');
            addClass(editBtn, 'active');
            setText(editBtn, 'Exit Zoom Edit');
            show(saveBtn);
            if (levelPanel) levelPanel.style.display = 'grid';
            this.onEnter(); // disable other edit modes
        } else {
            console.log('Zoom edit mode DISABLED');
            removeClass(editBtn, 'active');
            setText(editBtn, 'Edit Zoom');
            hide(saveBtn);
            if (levelPanel) levelPanel.style.display = 'none';
        }
    }

    /** Assign the selected level to a country, then preview the framing. */
    setCountryFocusLevel(countryName) {
        if (!countryName || !this.active || !this.focusRegistry) return;

        this.focusRegistry.setLevel(countryName, this.activeLevel);
        this.config[countryName] = this.activeLevel;
        if (this.labelManager) this.labelManager.applyFocusZoom(this.focusRegistry);

        console.log(`${countryName} focus level set to ${this.activeLevel} (${LEVEL_DISTANCES[this.activeLevel]})`);

        // Preview the new framing immediately.
        this.rotateGlobeToCountry(countryName);

        if (navigator.vibrate) {
            navigator.vibrate(30);
        }
    }

    /** Download the focus-zoom overrides as country-zoom.json. */
    saveConfig() {
        const overrides = this.focusRegistry ? this.focusRegistry.getOverrides() : this.config;
        const dataStr = JSON.stringify(overrides, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'country-zoom.json';
        link.click();

        URL.revokeObjectURL(url);
        console.log('Zoom configuration saved! Countries configured:', Object.keys(overrides).length);
    }
}
