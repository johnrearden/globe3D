/**
 * WebGL Startup Fallback
 *
 * When the browser refuses to create a WebGL context, the globe can't render at all.
 * `createWebGLRenderer` (js/utils/webgl-diagnostics.js) logs the reason to the console
 * and re-throws; that throw escapes the app's init() (index.html) — the FIRST failure is
 * the hover-flag renderer, before the globe assets even load — and would otherwise leave
 * the opaque #seo-content splash frozen on screen forever ("LOADING THE WORLD").
 *
 * This module is the user-facing recovery for that dead end: it dismisses the stuck splash
 * and shows a fatal-error panel with a Reload action. It complements
 * js/core/context-recovery.js (which handles context *loss after* a successful start).
 *
 * Console diagnostics still fire underneath — this only adds the visible fallback.
 */

import { elements, hide } from '../utils/dom.js';

// Phosphor `warning` glyph (inline SVG per CLAUDE.md — no icon font). viewBox 0 0 256 256,
// filled with currentColor so CSS colour drives it.
const WARNING_ICON = '<svg class="webgl-fallback-icon" viewBox="0 0 256 256" width="44" height="44" fill="currentColor" aria-hidden="true"><path d="M236.8,188.09,149.35,36.22a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM120,104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm8,88a12,12,0,1,1,12-12A12,12,0,0,1,128,192Z"/></svg>';

const TITLE = "3D graphics couldn't start";
const BODY = 'Your browser couldn’t start the 3D graphics this page needs. Try reloading' +
    ' — and if that doesn’t help, fully quit and reopen your browser, or check' +
    ' that hardware acceleration is on.';

// One-shot guard: both renderer sites could throw, and callers may retry.
let shown = false;

/**
 * Dismiss the stuck loading splash and show the fatal WebGL fallback panel.
 * @param {Error} [error] - the startup error (logged; not shown to the user).
 */
export function showWebGLFallback(error) {
    if (shown) return;
    shown = true;

    console.error('[webgl-fallback] startup failed — showing fallback panel', error);

    // Dismiss the frozen splash directly. NOT via hideLoading()/hideSeoContent(): those fire
    // `globe3d:intro-dismissed` on a timer, which would wake deferred features (Daily invite,
    // ads) on an app that never initialised.
    hide(elements.get('seo-content'));
    hide(elements.get('loading'));

    const overlay = document.createElement('div');
    overlay.className = 'webgl-fallback';

    const card = document.createElement('div');
    card.className = 'webgl-fallback-card';
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-labelledby', 'webgl-fallback-title');
    card.setAttribute('aria-describedby', 'webgl-fallback-body');
    card.innerHTML = WARNING_ICON; // icon first; text + button appended below

    const title = document.createElement('h2');
    title.className = 'webgl-fallback-title';
    title.id = 'webgl-fallback-title';
    title.textContent = TITLE;

    const body = document.createElement('p');
    body.className = 'webgl-fallback-body';
    body.id = 'webgl-fallback-body';
    body.textContent = BODY;

    const reload = document.createElement('button');
    reload.type = 'button';
    reload.className = 'webgl-fallback-reload';
    reload.textContent = 'Reload';
    reload.addEventListener('click', () => window.location.reload());

    card.appendChild(title);
    card.appendChild(body);
    card.appendChild(reload);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Fade in on the next frame (same idiom as the recovery toast's is-visible class).
    requestAnimationFrame(() => overlay.classList.add('is-visible'));

    reload.focus();
}
