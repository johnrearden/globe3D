/**
 * Site-wide third-party integration config (Google Analytics 4 + AdSense).
 *
 * These IDs are public, client-side identifiers by nature, so committing them
 * here is fine. Leave a value empty ('') to disable that integration entirely —
 * every consumer (js/features/analytics.js, js/features/ads/*) treats an empty
 * ID as "not configured" and no-ops, so the app runs unchanged until the
 * accounts exist. Fill these in once the GA4 property and AdSense account are
 * created (see the plan / DEPLOYMENT_GUIDE.md).
 */

import { isLocalDevHost } from './api-client.js';

// GA4 Measurement ID, e.g. 'G-XXXXXXXXXX'. Empty → analytics disabled.
export const GA_MEASUREMENT_ID = 'G-1WMGGVNMC7';

// GlitchTip (Sentry-compatible) DSN for the FRONTEND project, e.g.
// 'https://<publicKey>@glitchtip.example.com/<projectId>'. Browser DSNs are
// public, client-side identifiers by design, so committing it is fine. Empty →
// frontend error reporting disabled (js/features/error-reporter.js no-ops). This
// is a DIFFERENT project/DSN from the Django backend's GLITCHTIP_DSN (in .env).
export const GLITCHTIP_DSN = 'https://f811995f24554362b951806c94e6df4e@glitchtip.intricatech.com/5';

// AdSense publisher/client ID, e.g. 'ca-pub-1234567890123456'. Empty → ads disabled.
export const ADSENSE_CLIENT_ID = '';

// Ad-unit slot id (data-ad-slot) for the desktop side rail. Create a display
// ad unit in AdSense and paste its slot id here. Empty → the rail mounts but
// serves nothing (harmless).
export const ADSENSE_RAIL_SLOT = '';

// Ad-unit slot id for the in-content unit on the /borders/<slug> landing pages
// (read at build time by build-landing.mjs). Empty → no ad unit is emitted.
export const ADSENSE_LANDING_SLOT = '';

/**
 * True only on a genuine deployed (production/preview) host — never on
 * localhost / LAN dev. Mirrors the API/asset prod gate (isLocalDevHost, and the
 * inline host block in index.html) so analytics/ad hits are never sent from
 * local development. `?ads=1` in the URL forces prod behaviour on any host, so
 * the integration can be smoke-tested locally without shipping test traffic
 * from ordinary dev.
 */
export function isProdHost() {
    if (typeof window === 'undefined') return false;
    try {
        if (new URLSearchParams(window.location.search).has('ads')) return true;
    } catch (e) { /* no URL API — fall through to the host check */ }
    return !isLocalDevHost(window.location.hostname);
}
