/**
 * Loading / splash-overlay handling.
 *
 * The Terragotcha splash (#seo-content) is opaque on first paint and covers the
 * whole viewport while the globe loads. hideLoading() — called once the globe has
 * rendered (and its lighting fade-in has run) — fades the splash out to reveal the
 * globe, then fires `globe3d:intro-dismissed` so other features (e.g. the Daily
 * Challenge invite) can react. The one-shot guard keeps dismissal idempotent.
 */

import { elements, hide, addClass } from '../utils/dom.js';

// One-shot guard so dismissing the splash is idempotent.
let seoContentHidden = false;

export function hideSeoContent() {
    if (seoContentHidden) return;
    seoContentHidden = true;
    const seoContent = elements.get('seo-content');
    if (seoContent) {
        addClass(seoContent, 'hidden');
        // Remove after the fade-out transition completes (matches CSS 1s).
        setTimeout(() => hide(seoContent), 1000);
    }
    // Once the splash has faded, let features react (e.g. the Daily Challenge
    // invite appears under the globe). Fires whether or not the overlay existed.
    setTimeout(
        () => document.dispatchEvent(new CustomEvent('globe3d:intro-dismissed')),
        1000,
    );
}

export function hideLoading() {
    hide(elements.get('loading'));
    // The globe is ready — auto-dismiss the splash (fade out + intro event).
    hideSeoContent();
}
