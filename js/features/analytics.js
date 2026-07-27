/**
 * Google Analytics 4 (gtag.js) with Consent Mode v2.
 *
 * Design:
 *  - Prod-gated (isProdHost). The gtag.js load also requires GA_MEASUREMENT_ID;
 *    the consent defaults (initConsentDefaults) are prod-gated only, since they
 *    govern AdSense / the CMP too. Inert in local dev either way.
 *  - Deferred behind the intro splash (afterIntro) so the ~heavy gtag.js never
 *    competes with first paint / LCP.
 *  - Consent Mode v2 defaults are emitted EARLY (initConsentDefaults, before the
 *    intro / any tag) and REGION-SCOPED: denied for the EEA/UK/Switzerland,
 *    granted elsewhere. Google's certified CMP (js/features/consent-cmp.js,
 *    "Privacy & messaging") flips the EEA set to granted via `consent update`;
 *    outside those regions analytics runs with no banner. Google matches the
 *    visitor's region by IP — we never detect it ourselves.
 *  - `track()` is exported for the few events that aren't derivable from state;
 *    the rest (quiz_start, country_select) are auto-wired here via the existing
 *    state subscription system so other modules stay untouched.
 */

import { state } from '../data/state.js';
import { GA_MEASUREMENT_ID, isProdHost } from '../data/site-config.js';
import { afterIntro } from '../utils/after-intro.js';

let started = false;
let defaultsSet = false;

// EU-27 + Iceland/Liechtenstein/Norway (EEA) + United Kingdom + Switzerland —
// the regions where consent is required before storage. Consent Mode `region`
// codes; KEEP IN SYNC with the GDPR message's geo-targeting in the AdSense
// "Privacy & messaging" dashboard (a country denied here but shown no banner
// would be stuck denied with no way to grant → silent analytics loss there).
const EEA_UK_CH = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
    'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
    'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH',
];

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

/**
 * Emit Consent Mode v2 defaults as early as possible — before the intro and any
 * tag. Region-scoped: DENIED for the EEA/UK/Switzerland (the CMP grants per
 * user), GRANTED everywhere else so analytics flows without a banner. Google
 * applies the most-specific default by the visitor's IP; we never detect region
 * ourselves. Prod-gated only (governs GA *and* AdSense/CMP) and idempotent.
 */
export function initConsentDefaults() {
    if (!isProdHost() || defaultsSet) return;
    window.dataLayer = window.dataLayer || [];

    // EEA/UK/CH: deny until the CMP grants. wait_for_update lets gtag briefly
    // hold hits for the CMP's `consent update` before falling back to the default.
    gtag('consent', 'default', {
        ad_storage: 'denied',
        analytics_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        region: EEA_UK_CH,
        wait_for_update: 500,
    });
    // Rest of world: granted by default (no region, no wait_for_update).
    gtag('consent', 'default', {
        ad_storage: 'granted',
        analytics_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
    });

    defaultsSet = true;
}

function loadGtag() {
    // Consent defaults must precede gtag('config'); ensure they exist even if
    // the early top-level initConsentDefaults() call was somehow missed (no-op
    // if already set).
    initConsentDefaults();

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
