/**
 * Color editor — pick a swatch, then click countries to recolor them, and
 * save the result to country-colors.json.
 *
 * Owns its own edit-mode flag, the working color config, and the active swatch
 * index. Mutually exclusive with the other edit modes; the host passes an
 * `onEnter` callback to switch the others off when color-edit is enabled.
 */

import { elements, show, hide, addClass, removeClass, setText } from '../utils/dom.js';

// Swatch palette (RGB 0..1).
const COLOR_PALETTE = [
    [0.50, 0.10, 0.15], // Crimson
    [0.55, 0.25, 0.10], // Rust
    [0.50, 0.35, 0.08], // Bronze
    [0.45, 0.42, 0.10], // Olive Gold
    [0.28, 0.42, 0.12], // Moss
    [0.10, 0.42, 0.20], // Forest
    [0.08, 0.40, 0.32], // Pine
    [0.10, 0.35, 0.48], // Lagoon
    [0.12, 0.22, 0.50], // Sapphire
    [0.25, 0.15, 0.50], // Indigo
    [0.40, 0.15, 0.50], // Violet
    [0.48, 0.12, 0.42], // Plum
    [0.52, 0.10, 0.28], // Berry
    [0.42, 0.18, 0.15], // Mahogany
    [0.32, 0.22, 0.15], // Coffee
    [0.22, 0.30, 0.38]  // Slate
];

export class ColorEditor {
    constructor({ globeManager, onEnter } = {}) {
        this.globeManager = globeManager;
        // Called when color-edit is being enabled, so the host can disable the
        // other mutually-exclusive edit modes (e.g. label edit).
        this.onEnter = onEnter || (() => {});
        this.active = false;
        this.config = {};          // custom country colors, keyed by name
        this.activeColorIndex = 0; // index into COLOR_PALETTE
    }

    isActive() {
        return this.active;
    }

    /**
     * Fetch country-colors.json (if present) and apply it. Returns a promise
     * that resolves once the fetch settles (success or absent), so callers can
     * sequence work that must run after the overrides land — e.g. re-applying
     * the active color scheme so it isn't partially clobbered back to vibrant.
     */
    loadConfig() {
        // Cache-buster (see label-editor.js): always fetch the latest config.
        return fetch('country-colors.json?v=' + Date.now())
            .then(response => {
                if (!response.ok) throw new Error('No saved color config found');
                return response.json();
            })
            .then(config => {
                this.config = config;
                console.log('Loaded color configuration for', Object.keys(this.config).length, 'countries');
                this.applyConfig();
            })
            .catch(() => {
                console.log('No color config file found, using default colors');
            });
    }

    applyConfig() {
        if (this.globeManager) {
            this.globeManager.applyColorOverrides(this.config);
        }
    }

    /** Build the swatch panel from COLOR_PALETTE. Each swatch sets activeColorIndex. */
    buildSwatchPanel() {
        const panel = elements.get('swatch-panel');
        if (!panel) return;
        panel.innerHTML = '';
        COLOR_PALETTE.forEach((rgb, i) => {
            const btn = document.createElement('button');
            btn.className = 'swatch' + (i === this.activeColorIndex ? ' active' : '');
            btn.style.backgroundColor = `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;
            btn.dataset.colorIndex = i;
            btn.addEventListener('click', () => {
                this.activeColorIndex = i;
                panel.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
                btn.classList.add('active');
            });
            panel.appendChild(btn);
        });
    }

    toggle() {
        this.active = !this.active;

        const editBtn = elements.get('edit-colors-btn');
        const saveBtn = elements.get('save-colors-btn');
        const swatchPanel = elements.get('swatch-panel');

        if (this.active) {
            console.log('Color edit mode ENABLED - Pick a swatch, then click countries');
            addClass(editBtn, 'active');
            setText(editBtn, 'Exit Color Edit');
            show(saveBtn);
            if (swatchPanel) swatchPanel.style.display = 'grid';
            this.onEnter(); // disable other edit modes
        } else {
            console.log('Color edit mode DISABLED');
            removeClass(editBtn, 'active');
            setText(editBtn, 'Edit Colors');
            hide(saveBtn);
            if (swatchPanel) swatchPanel.style.display = 'none';
        }
    }

    /** Recolor a country to the currently-selected swatch. */
    changeCountryColor(countryName) {
        if (!countryName || !this.active) return;

        const color = COLOR_PALETTE[this.activeColorIndex];
        this.globeManager.setCountryColor(countryName, color);
        this.config[countryName] = color;

        console.log(`${countryName} color changed to [${color.join(', ')}]`);

        if (navigator.vibrate) {
            navigator.vibrate(30);
        }
    }

    /** Download the working config as country-colors.json. */
    saveConfig() {
        const dataStr = JSON.stringify(this.config, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'country-colors.json';
        link.click();

        URL.revokeObjectURL(url);
        console.log('Color configuration saved! Countries configured:', Object.keys(this.config).length);
    }
}
