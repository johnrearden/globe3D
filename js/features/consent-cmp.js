/**
 * Google's certified consent management platform (CMP) — Funding Choices /
 * "Privacy & messaging".
 *
 * Loads Google's GDPR consent message for visitors Google geolocates into the
 * regions the message targets (configured in AdSense → Privacy & messaging). The
 * CMP writes `consent update` to the SAME dataLayer that js/features/analytics.js
 * owns — this module never touches gtag/dataLayer itself — flipping the
 * region-scoped denied defaults (analytics.js initConsentDefaults) to granted for
 * users who accept. GA + AdSense both honour it automatically.
 *
 * Region targeting is entirely Google's job: it geolocates the visitor by IP and
 * only shows the banner where the message is configured to appear. We never
 * detect region here (keep the message's targeting in sync with the EEA_UK_CH
 * `region` list in analytics.js).
 *
 * Design mirrors analytics.js / adsense.js:
 *  - Prod-gated (isProdHost) and disabled unless CMP_PUBLISHER_ID is set → fully
 *    inert in local dev and until the publisher id is configured.
 *  - Deferred behind the intro splash (afterIntro) so the loader never competes
 *    with first paint / LCP.
 *  - Google ships the loader as two inline <script>s; CLAUDE.md forbids new
 *    inline <script> in index.html, so the loader tag and the `googlefcPresent`
 *    detection iframe are created here in JS instead.
 */

import { CMP_PUBLISHER_ID, isProdHost } from '../data/site-config.js';
import { afterIntro } from '../utils/after-intro.js';

let loaderAppended = false;

/**
 * The `googlefcPresent` named iframe is how the messaging library detects that
 * the publisher tag is on the page. Ported from Google's inline snippet (0×0,
 * off-screen, not displayed); retries once the body exists.
 */
function signalGooglefcPresent() {
    if (window.frames['googlefcPresent']) return;
    if (!document.body) { setTimeout(signalGooglefcPresent, 0); return; }
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:0;height:0;border:none;z-index:-1000;left:-1000px;top:-1000px;';
    iframe.style.display = 'none';
    iframe.name = 'googlefcPresent';
    document.body.appendChild(iframe);
}

/** Inject the Funding Choices loader tag + the presence iframe. Idempotent. */
function injectFundingChoices() {
    if (loaderAppended) return;
    loaderAppended = true;
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://fundingchoicesmessages.google.com/i/${encodeURIComponent(CMP_PUBLISHER_ID)}?ers=1`;
    document.head.appendChild(s);
    signalGooglefcPresent();
}

/**
 * Initialise the CMP. Safe to call unconditionally from the app shell; it
 * self-gates on prod + a configured publisher id and defers the loader behind
 * the intro splash.
 */
export function initConsentCmp() {
    if (!isProdHost() || !CMP_PUBLISHER_ID) return;
    afterIntro(injectFundingChoices);
}

/**
 * Re-open Google's consent message so a user can change their choice — wired to
 * the "Manage consent choices" link in the settings panel. Best-effort: only
 * works once the loader has run AND a revocation message exists in the Privacy &
 * messaging dashboard. Never throws (consent UI must not break the app).
 *
 * NOTE: the exact `googlefc` re-consent API should be re-verified against current
 * Funding Choices docs — the callbackQueue entry shape has changed across
 * versions; the object form below is the currently documented one.
 */
export function manageConsent() {
    if (!CMP_PUBLISHER_ID) return;
    try {
        window.googlefc = window.googlefc || {};
        window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
        window.googlefc.callbackQueue.push({
            CONSENT_DATA_READY: () => {
                if (typeof window.googlefc.showRevocationMessage === 'function') {
                    window.googlefc.showRevocationMessage();
                }
            },
        });
    } catch (e) { /* swallow */ }
}
