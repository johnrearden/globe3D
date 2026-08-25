/**
 * Loading handling + the "globe is ready" signal.
 *
 * There is NO LONGER a splash overlay on the apex: the landing panel paints first
 * and the globe slides in behind it, so nothing covers the viewport while assets
 * load (see js/features/landing-panel.js). #seo-content is gone from index.html.
 *
 * What survives is the signal. hideSeoContent() — called once the globe has
 * rendered and its lighting fade-in has run — fires `globe3d:intro-dismissed`,
 * which several features wait on (the Daily Challenge invite, ads, the landing
 * panel's globe reveal). The element lookup is kept and stays null-safe so an
 * embedder that still ships an overlay keeps working. The one-shot guard keeps
 * dismissal idempotent.
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
