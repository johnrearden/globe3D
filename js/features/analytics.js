/**
 * Google Analytics 4 (gtag.js) with Consent Mode v2.
 *
 * Design:
 *  - Prod-gated (isProdHost) and disabled unless GA_MEASUREMENT_ID is set, so it
 *    is completely inert in local dev and until the property is created.
 *  - Deferred behind the intro splash (afterIntro) so the ~heavy gtag.js never
 *    competes with first paint / LCP.
 *  - Consent Mode v2 defaults are set to DENIED before the tag loads; Google's
 *    CMP ("Privacy & messaging", enabled in the AdSense/GA dashboards) flips them
 *    to granted via `consent update` once the user chooses. GA and AdSense both
 *    honour this automatically.
 *  - `track()` is exported for the few events that aren't derivable from state;
 *    the rest (quiz_start, country_select) are auto-wired here via the existing
 *    state subscription system so other modules stay untouched.
 */

import { state } from '../data/state.js';
import { GA_MEASUREMENT_ID, isProdHost } from '../data/site-config.js';
import { afterIntro } from '../utils/after-intro.js';

let started = false;

// gtag pushes its verbatim `arguments` onto dataLayer; defined up-front so
// consent defaults and any early events survive until gtag.js finishes loading.
function gtag() { window.dataLayer.push(arguments); }

/**
 * Send a GA4 custom event. No-op until analytics has actually started (not
 * configured, not a prod host, or pre-intro), and never throws — analytics must
 * not be able to break the app.
 * @param {string} name   - GA4 event name (snake_case), e.g. 'quiz_complete'
 * @param {Object} [params] - event parameters
 */
export function track(name, params = {}) {
    if (!started) return;
    try { gtag('event', name, params); } catch (e) { /* swallow */ }
}

function loadGtag() {
    window.dataLayer = window.dataLayer || [];

    // Consent Mode v2 — deny all storage/signals by default; the CMP grants.
    gtag('consent', 'default', {
        ad_storage: 'denied',
        analytics_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        wait_for_update: 500,
    });

    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID, { send_page_view: true });

    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
    document.head.appendChild(s);

    started = true;
    wireAutoEvents();
}

/**
 * Auto-wire the events that are already observable in central state — no edits
 * to the quiz/globe modules needed. Events that aren't in state (quiz_complete
 * with a score, share, daily_complete) are tracked from their own call-sites.
 */
function wireAutoEvents() {
    // A quiz becoming active (mode is set alongside in each mode's start()).
    state.subscribe('quiz.active', (active) => {
        if (active) track('quiz_start', { mode: state.get('quiz.mode') || 'unknown' });
    });
}

/**
 * Initialise analytics. Safe to call unconditionally from the app shell; it
 * self-gates on prod + configured ID and defers the actual load behind the intro.
 */
export function initAnalytics() {
    if (!isProdHost() || !GA_MEASUREMENT_ID) return;
    afterIntro(loadGtag);
}
