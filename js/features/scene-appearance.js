/**
 * Scene appearance applier — the 3D counterpart of the CSS theme system.
 *
 * The theme switcher can only reach CSS custom properties, but an admin theme
 * also carries a look for the Three.js scene: the space background
 * (scene.background), the ocean/water color (uOceanColor uniform), and the
 * country color scheme (color-schemes.js). Those live outside CSS, so this
 * module applies them imperatively and re-applies whenever the active theme
 * changes (THEME_EVENT). Built-in themes carry no scene block, so it falls back
 * to the app defaults captured at init.
 *
 * The live theme editor previews scene edits by calling applySceneAppearance()
 * directly; preview THEME_EVENTs (CSS-token tweaks / font re-bakes) are ignored
 * here so they don't stomp the editor's live scene preview.
 */

import { settingsStore } from '../data/settings-store.js';
import { onThemeChange } from '../utils/theme.js';
import { applyScheme } from './color-schemes.js';
import { getActiveSceneAppearance } from './theme-switcher.js';

let _sceneManager = null;
let _globeManager = null;
let _defaultBg = null;      // THREE.Color captured before any override (for reset)
let _defaultOcean = null;   // THREE.Color captured before any override (for reset)

/**
 * The country color scheme the active theme dictates, else the user's persisted
 * pick. A theme-pinned scheme wins; the settings-gear picker is a live override.
 * Shared with settings-panel.js so both writers resolve identically.
 * @returns {string}
 */
export function resolveActiveScheme() {
    return getActiveSceneAppearance().countryScheme
        || settingsStore.get().scheme || 'vibrant';
}

/**
 * Imperatively apply a scene-appearance block. Missing fields fall back to the
 * app defaults captured at init; a missing `countryScheme` falls back to the
 * user's persisted scheme, so a theme that doesn't pin one shows the player's
 * own choice.
 * @param {{sceneBg?:string, oceanColor?:string, countryScheme?:string}} [a]
 */
export function applySceneAppearance(a = {}) {
    if (!_sceneManager || !_globeManager) return;
    if (_defaultBg) _sceneManager.setBackground(a.sceneBg || _defaultBg);
    _globeManager.setOceanColor(a.oceanColor || _defaultOcean);
    applyScheme(_globeManager, a.countryScheme || settingsStore.get().scheme || 'vibrant');
}

/**
 * Capture the app-default scene look, apply the cached active block (so there's
 * no flash before remote themes finish loading), and re-apply on every
 * non-preview theme change. Call once, after the scene + globe exist.
 * @param {{sceneManager: object, globeManager: object}} deps
 */
export function initSceneAppearance({ sceneManager, globeManager }) {
    _sceneManager = sceneManager;
    _globeManager = globeManager;

    // Capture defaults BEFORE applying anything so an empty theme field resets to
    // the built-in look rather than to whatever a previous theme left behind.
    const bg = sceneManager.scene && sceneManager.scene.background;
    _defaultBg = bg && bg.isColor ? bg.clone() : null;
    _defaultOcean = globeManager.material.uniforms.uOceanColor.value.clone();

    // Apply the cached block first (the live remote theme lands via THEME_EVENT
    // once initRemoteThemes resolves — same values → no visible change).
    applySceneAppearance(settingsStore.get().themeScene || {});

    onThemeChange((e) => {
        if (e && e.detail && e.detail.preview) return; // editor CSS previews
        applySceneAppearance(getActiveSceneAppearance());
    });
}
