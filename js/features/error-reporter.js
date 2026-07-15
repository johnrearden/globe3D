/**
 * Frontend console-error reporting → GlitchTip (Sentry-compatible).
 *
 * Design (mirrors js/features/analytics.js):
 *  - Prod-gated (isProdHost) and disabled unless GLITCHTIP_DSN is set, so it is
 *    completely inert in local dev and until the GlitchTip project exists. When
 *    disabled the SDK is never even fetched (the import is inside the gate).
 *  - The Sentry browser SDK is pulled as an ESM module from a CDN at runtime (per
 *    the project's "CDN ESM import, no new <script>/<link> tags" rule) — so this
 *    adds nothing to index.html beyond one import + one call.
 *  - Initialised EARLY (not deferred behind the intro splash like analytics), so
 *    it captures errors thrown during app start-up, not just post-intro. Once
 *    init'd, the SDK installs global window.onerror + unhandledrejection handlers.
 *  - The app ships unminified native ES modules, so captured stack traces are
 *    already readable — no source maps needed.
 *  - Never throws: error reporting must not be able to break the app.
 */

import { GLITCHTIP_DSN, isProdHost } from '../data/site-config.js';

// Pin a stable major of the Sentry browser SDK (GlitchTip ingests Sentry
// envelopes). jsDelivr's `+esm` serves it as one self-contained ESM bundle in a
// single request — the same CDN the app already uses for confetti/OrbitControls.
const SENTRY_SDK_URL = 'https://cdn.jsdelivr.net/npm/@sentry/browser@8/+esm';

let started = false;

/**
 * Initialise frontend error reporting. Safe to call unconditionally from the app
 * shell; it self-gates on prod + a configured DSN and loads the SDK lazily. Fire
 * it as early as possible (before constructing the app) for the widest coverage.
 */
export async function initErrorReporter() {
    if (typeof window === 'undefined') return;
    if (started) return;
    if (!isProdHost() || !GLITCHTIP_DSN) return;
    started = true;
    try {
        const Sentry = await import(/* @vite-ignore */ SENTRY_SDK_URL);
        Sentry.init({
            dsn: GLITCHTIP_DSN,
            environment: 'production',
            // Optional deploy stamp — set window.GLOBE3D_RELEASE (e.g. a git SHA)
            // in index.html at build time to group issues by release.
            release: window.GLOBE3D_RELEASE || undefined,
            // GlitchTip performance/replay support is basic; capture errors only.
            tracesSampleRate: 0,
        });
    } catch (e) {
        // Swallow — a blocked CDN / ad-blocked GlitchTip domain must not surface
        // to the user or break start-up. Reset so a later call could retry.
        started = false;
    }
}
