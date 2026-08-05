/**
 * Ad-unit placement for Google AdSense.
 *
 * The adsbygoogle.js LOADER is not owned by this module — it is a static
 * <script> in index.html's <head> (and emitted into each /borders/<slug> page
 * by build-landing.mjs). It has to live in the raw HTML so AdSense's reviewer
 * and ad crawler find it without executing the app; injecting it from here put
 * it behind init()'s WebGL try/catch and a 6s afterIntro deferral, which meant
 * a non-executing or WebGL-less crawler saw no ad code at all. This module owns
 * the ad *units*, which stay in JS and stay deferred.
 *
 * Policy-shaped design (this is a thin-content WebGL SPA):
 *  - Prod-gated (isProdHost) and disabled unless ADSENSE_CLIENT_ID is set.
 *  - Units are deferred behind the intro splash (afterIntro) so no ad exists on
 *    the splash screen (AdSense prohibits ads on non-content screens). The
 *    loader tag alone renders nothing, so hoisting it costs no policy ground.
 *  - Never mount a unit without a real slot id — a blank "Advertisement" box is
 *    itself a policy problem. Both mountAd() and AdRail.init() enforce this.
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

const LOADER_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

let loaderAppended = false;

/**
 * Fallback loader. index.html ships the tag statically, so this normally finds
 * it already present and does nothing — appending a second copy would make
 * AdSense double-count the page. It only actually injects on a host that
 * serves this module without that tag.
 */
function loadAdsenseScript() {
    if (loaderAppended) return;
    loaderAppended = true;
    window.adsbygoogle = window.adsbygoogle || [];
    if (document.querySelector(`script[src^="${LOADER_SRC}"]`)) return;
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `${LOADER_SRC}?client=${encodeURIComponent(ADSENSE_CLIENT_ID)}`;
    document.head.appendChild(s);
}

/**
 * Build an <ins class="adsbygoogle"> inside `el` and request one ad. `el` should
 * reserve its own size in CSS so the slot causes no layout shift (CLS). Pushed
 * once — do NOT call again for the same element on a state change.
 * @param {HTMLElement} el
 * @param {Object} [opts]
 * @param {string} [opts.slot]       - AdSense ad-unit slot id (data-ad-slot);
 *                                     required — no slot, no unit
 * @param {string} [opts.format]     - data-ad-format (default 'auto')
 * @param {boolean} [opts.responsive]- data-full-width-responsive (default true)
 */
export function mountAd(el, { slot = '', format = 'auto', responsive = true } = {}) {
    // A slot-less <ins> renders as blank reserved space, so require a real unit
    // id here as well as at each call site.
    if (!ADSENSE_CLIENT_ID || !slot || !el) return;
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', ADSENSE_CLIENT_ID);
    ins.setAttribute('data-ad-slot', slot);
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
