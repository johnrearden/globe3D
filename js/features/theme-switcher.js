/**
 * UI theme switcher.
 *
 * Two kinds of themes share one selector:
 *  - Built-in presets (Default/Soft/Sharp/Mono) — activated by flipping
 *    `<html data-theme>` so the `:root[data-theme]` blocks in styles.css win.
 *  - Remote themes authored by an admin and stored on the backend — a
 *    `{ base, tokens }` pair: the base preset's attribute plus inline
 *    `--token` overrides set on :root (inline beats any stylesheet rule).
 *
 * Every element that reads a token re-themes instantly. The choice persists via
 * settings-store.js; canvas surfaces (globe labels/markers, which can't read CSS)
 * are notified via THEME_EVENT so they re-bake with the new font.
 *
 * Selection string: a built-in key ('default'|'soft'|'sharp'|'mono') or
 * `remote:<id>`. Adding a built-in = one THEMES entry + a :root[data-theme] block.
 */

import { settingsStore } from '../data/settings-store.js';
import { THEME_EVENT } from '../utils/theme.js';
import { EDITABLE_TOKEN_NAMES } from '../data/theme-tokens.js';

export const THEMES = [
    { key: 'default', label: 'Default' },
    { key: 'soft', label: 'Soft' },
    { key: 'sharp', label: 'Sharp' },
    { key: 'mono', label: 'Mono' },
];

const BUILTIN_KEYS = new Set(THEMES.map(t => t.key));

let _remoteThemes = [];        // [{ id, name, base, tokens, isPublished }]
let _api = null;
const _listeners = new Set();  // notified when the available-theme list changes

// ---- selection helpers -----------------------------------------------------

/** The persisted selection ('default'|'soft'|... or 'remote:<id>'). */
export function getSelection() {
    return settingsStore.get().theme || 'default';
}

function remoteById(id) {
    return _remoteThemes.find(t => String(t.id) === String(id)) || null;
}

/** Built-in keys + fetched remote themes as selector entries. */
export function getAvailableThemes() {
    return [
        ...THEMES.map(t => ({ sel: t.key, label: t.label, kind: 'builtin' })),
        ..._remoteThemes.map(t => ({ sel: `remote:${t.id}`, label: t.name, kind: 'remote' })),
    ];
}

export function getRemoteThemes() { return _remoteThemes.slice(); }
export function getApi() { return _api; }

export function onThemesChanged(cb) {
    _listeners.add(cb);
    return () => _listeners.delete(cb);
}
function notifyThemesChanged() {
    _listeners.forEach(cb => { try { cb(); } catch (_) { /* no-op */ } });
}

// ---- low-level token application (also used by the editor) -----------------

/** Remove every editable token override from the inline :root style. */
export function clearInlineTokens() {
    const style = document.documentElement.style;
    for (const name of EDITABLE_TOKEN_NAMES) style.removeProperty(name);
}

/** Set inline :root overrides for the editable tokens present in `tokens`. */
export function applyTokenMap(tokens) {
    const style = document.documentElement.style;
    for (const [name, value] of Object.entries(tokens || {})) {
        if (EDITABLE_TOKEN_NAMES.includes(name)) style.setProperty(name, value);
    }
}

/** Set a single inline token override (used by the editor for live tweaks). */
export function setToken(name, value) {
    document.documentElement.style.setProperty(name, value);
}

function setBaseAttr(base) {
    const root = document.documentElement;
    base = BUILTIN_KEYS.has(base) ? base : 'default';
    if (base === 'default') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', base);
    return base;
}

// ---- apply / persist -------------------------------------------------------

/**
 * Apply a selection live and persist it: built-in (data-theme attr) or remote
 * (base attr + inline token overrides). Notifies canvas surfaces.
 * @param {string} sel
 */
export function applyTheme(sel) {
    clearInlineTokens();

    if (sel && sel.startsWith('remote:')) {
        const theme = remoteById(sel.slice(7));
        if (theme) {
            const base = setBaseAttr(theme.base);
            applyTokenMap(theme.tokens);
            settingsStore.save({ theme: sel, themeInline: { base, tokens: theme.tokens } });
            document.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme: sel } }));
            return;
        }
        sel = 'default'; // remote theme unknown (deleted/unpublished) → fall back
    }

    if (!BUILTIN_KEYS.has(sel)) sel = 'default';
    setBaseAttr(sel);
    settingsStore.save({ theme: sel, themeInline: null });
    document.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme: sel } }));
}

/**
 * Apply the persisted selection before first paint. Built-ins set the attribute;
 * remote themes apply the cached { base, tokens } (so there's no flash before the
 * async fetch resolves). Does not dispatch THEME_EVENT (nothing has rendered yet).
 */
export function initTheme() {
    const saved = settingsStore.get();
    const sel = saved.theme || 'default';
    if (sel.startsWith('remote:')) {
        const cached = saved.themeInline;
        setBaseAttr(cached && cached.base);
        if (cached && cached.tokens) applyTokenMap(cached.tokens);
        return;
    }
    if (BUILTIN_KEYS.has(sel) && sel !== 'default') {
        document.documentElement.setAttribute('data-theme', sel);
    }
}

// ---- editor-preview helpers (do NOT persist) -------------------------------

/** Preview a base+tokens combo live without persisting (editor use). */
export function previewTheme(base, tokens) {
    clearInlineTokens();
    setBaseAttr(base);
    applyTokenMap(tokens);
    document.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { preview: true } }));
}

/** Re-apply the persisted selection — ends an editor preview. */
export function restoreSelection() {
    applyTheme(getSelection());
}

// ---- remote-theme fetch ----------------------------------------------------

/** Wire the API client and load published themes (called once at boot). */
export async function initRemoteThemes(apiClient) {
    _api = apiClient;
    await refreshRemoteThemes();
}

/**
 * Reload published themes from the backend and refresh the registry + selector.
 * If the active selection is a remote theme, re-apply the latest tokens (or fall
 * back if it was deleted/unpublished). Silently keeps built-ins on network error.
 */
export async function refreshRemoteThemes() {
    if (!_api) return;
    let themes;
    try {
        themes = await _api.listThemes();
    } catch (_) {
        return; // offline / backend down → built-ins still work
    }
    _remoteThemes = Array.isArray(themes) ? themes : [];

    const sel = getSelection();
    if (sel.startsWith('remote:')) {
        if (remoteById(sel.slice(7))) applyTheme(sel);   // re-apply latest + re-cache
        else applyTheme('default');                      // it vanished
    }
    notifyThemesChanged();
}
