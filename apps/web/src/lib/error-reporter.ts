/**
 * Frontend error reporting → GlitchTip (Sentry-compatible).
 *
 * Runs from a hoisted `<script>` in `SiteHead.astro`, so it starts before any
 * island is hydrated and catches start-up errors, not just later ones. The SDK
 * is fetched from a CDN only when it will be used: production build, a
 * configured DSN, and not a local host — so it costs a reader nothing until
 * then and nothing at all in dev. Never throws: a blocked CDN must not surface.
 */
import { GLITCHTIP_DSN, isProdHost } from '../../../../js/data/site-config.js';

// Pinned major; jsDelivr's `+esm` serves it as one self-contained module.
const SENTRY_SDK_URL = 'https://cdn.jsdelivr.net/npm/@sentry/browser@8/+esm';

let started = false;

export async function initErrorReporter(): Promise<void> {
    if (started || !import.meta.env.PROD || !GLITCHTIP_DSN || !isProdHost()) return;
    started = true;
    try {
        const Sentry = await import(/* @vite-ignore */ SENTRY_SDK_URL);
        Sentry.init({ dsn: GLITCHTIP_DSN, environment: 'production', tracesSampleRate: 0 });
    } catch {
        started = false;
    }
}
