/**
 * Run a callback once the intro splash has been dismissed — the
 * `globe3d:intro-dismissed` event fired by js/features/loading.js. Deferring
 * heavy third-party scripts (GA4, AdSense) to this point keeps them off the
 * critical path so they never tax first paint / LCP.
 *
 * A fallback timeout guarantees the callback still runs if the event already
 * fired before we subscribed, or never fires at all (e.g. the globe hit its
 * load-error path). The callback runs at most once.
 */
export function afterIntro(callback, fallbackMs = 6000) {
    let done = false;
    const run = () => {
        if (done) return;
        done = true;
        try { callback(); } catch (e) { /* never break the app for deferred work */ }
    };
    document.addEventListener('globe3d:intro-dismissed', run, { once: true });
    setTimeout(run, fallbackMs);
}
