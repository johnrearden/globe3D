/**
 * Google AdSense loader + a minimal manual ad-slot helper.
 *
 * Policy-shaped design (this is a thin-content WebGL SPA):
 *  - Prod-gated (isProdHost) and disabled unless ADSENSE_CLIENT_ID is set.
 *  - Deferred behind the intro splash (afterIntro) so adsbygoogle.js never
 *    competes with first paint / LCP, and so no ad exists on the splash screen
 *    (AdSense prohibits ads on non-content screens).
 *  - Manual placement only: a desktop side rail in the empty margin (ad-rail.js).
 *    The mobile bottom anchor is served by Auto Ads set to Anchor-only in the
 *    AdSense dashboard — Google-managed, dismissible, never over the canvas.
 *    All other Auto-Ads formats must stay OFF so nothing overlays the globe.
 *  - Each slot is pushed exactly once; ads are never re-requested on SPA state
 *    changes (AdSense bans ad "refresh" without a real page load).
 */

import { ADSENSE_CLIENT_ID, isProdHost } from '../../data/site-config.js';
import { afterIntro } from '../../utils/after-intro.js';
import { AdRail } from './ad-rail.js';

let loaderAppended = false;

function loadAdsenseScript() {
    if (loaderAppended) return;
    loaderAppended = true;
    window.adsbygoogle = window.adsbygoogle || [];
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT_ID)}`;
    document.head.appendChild(s);
}

/**
 * Build an <ins class="adsbygoogle"> inside `el` and request one ad. `el` should
 * reserve its own size in CSS so the slot causes no layout shift (CLS). Pushed
 * once — do NOT call again for the same element on a state change.
 * @param {HTMLElement} el
 * @param {Object} [opts]
 * @param {string} [opts.slot]       - AdSense ad-unit slot id (data-ad-slot)
 * @param {string} [opts.format]     - data-ad-format (default 'auto')
 * @param {boolean} [opts.responsive]- data-full-width-responsive (default true)
 */
export function mountAd(el, { slot = '', format = 'auto', responsive = true } = {}) {
    if (!ADSENSE_CLIENT_ID || !el) return;
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', ADSENSE_CLIENT_ID);
    if (slot) ins.setAttribute('data-ad-slot', slot);
    ins.setAttribute('data-ad-format', format);
    if (responsive) ins.setAttribute('data-full-width-responsive', 'true');
    el.appendChild(ins);
    try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) { /* loader not ready or blocked — leave the reserved slot empty */ }
}

/**
 * Initialise ads. Safe to call unconditionally from the app shell; self-gates on
 * prod + configured client id and defers behind the intro.
 */
export function initAds() {
    if (!isProdHost() || !ADSENSE_CLIENT_ID) return;
    afterIntro(() => {
        loadAdsenseScript();
        new AdRail().init();
    });
}
