/**
 * Loading / intro-overlay handling.
 *
 * Owns the one-shot `seoContentHidden` guard. hideLoading() reveals the globe
 * and wires a click on the SEO intro overlay to dismiss it via hideSeoContent().
 */

import { elements, show, hide, addClass } from '../utils/dom.js';

// One-shot guard so dismissing the intro overlay is idempotent.
let seoContentHidden = false;

export function hideSeoContent() {
    if (seoContentHidden) return;
    seoContentHidden = true;
    const seoContent = elements.get('seo-content');
    if (seoContent) {
        addClass(seoContent, 'hidden');
        // Remove after the fade-out animation completes.
        setTimeout(() => hide(seoContent), 500);
    }
}

export function hideLoading() {
    hide(elements.get('loading'));

    // Swap the progress bar for the "tap anywhere" hint, and let a tap/click
    // anywhere on the intro dismiss it now that the globe is loaded.
    const progressBar = elements.get('loading-progress-bar');
    const startHint = elements.get('start-hint');
    const seoContent = elements.get('seo-content');

    if (progressBar) hide(progressBar);
    if (startHint) show(startHint);
    if (seoContent) {
        seoContent.addEventListener('click', hideSeoContent, { once: true });
    }
}
