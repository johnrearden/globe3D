/**
 * Back-button guard
 *
 * Makes the browser Back button (and its equivalents — Android hardware back,
 * iOS/Chrome edge-swipe) exit an open overlay "screen" back to the bare globe,
 * instead of leaving the page. Pressing Back from the bare globe still does
 * normal history navigation.
 *
 * Model — a single "guard" history entry:
 *   While any overlay is open we keep exactly one extra entry pushed on the
 *   history stack (marked `history.state.g3dGuard`). It sits *above* the app's
 *   own entry, so the first Back pops the guard (never the real page). We catch
 *   that `popstate`, close the overlay, and land on the globe. From the globe
 *   there is no guard, so Back navigates away as the user expects.
 *
 * Lazy reconciliation:
 *   We push the guard when an overlay opens, but we do NOT eagerly remove it
 *   when the overlay is closed in-app (via ×/cancel). That leaves a harmless,
 *   invisible "stale" guard (the globe looks identical) which the next real Back
 *   self-consumes — `_onPop` sees no overlay open and simply continues going
 *   back. This avoids a programmatic-`history.back()`-plus-suppress-flag dance
 *   and the Back-mashing race it invites.
 *
 * The guard reads overlay state from signals the rest of the app already
 * maintains (see BackButtonGuard construction in index.html), so no quiz module
 * needs to know this exists. A MutationObserver on those class-bearing elements
 * drives reconciliation; its microtask batching means the synchronous
 * quiz→results and results→play-again class swaps are seen only in their final
 * state, so the guard never flickers across them.
 *
 * Self-contained: an import + one instantiation in index.html, no new DOM/CSS.
 */

export class BackButtonGuard {
    /**
     * @param {Object}   opts
     * @param {() => boolean} opts.isOverlayOpen - true while any Back-closable overlay is open
     * @param {() => void}    opts.returnToGlobe - close whatever overlay is open, returning to the globe
     * @param {Element[]}    [opts.watchTargets] - extra elements whose `class` changes should
     *   trigger reconciliation (e.g. overlays that toggle their own class, not a body class).
     *   `document.body` is always observed.
     */
    constructor({ isOverlayOpen, returnToGlobe, watchTargets = [] }) {
        this._isOverlayOpen = isOverlayOpen;
        this._returnToGlobe = returnToGlobe;
        this._guardActive = false;

        // Any class change on the body (quiz-active / dq-active / celebration-active)
        // or a watched overlay container re-checks whether a guard is needed.
        this._observer = new MutationObserver(() => this._reconcile());
        this._observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        for (const el of watchTargets) {
            if (el) this._observer.observe(el, { attributes: true, attributeFilter: ['class'] });
        }

        window.addEventListener('popstate', this._onPop);
        // Reload / bfcache restore can leave a guard entry on the stack while the
        // app boots to the bare globe — re-sync so the first Back still behaves.
        window.addEventListener('pageshow', (e) => { if (e.persisted) this._initFromHistory(); });

        this._initFromHistory();
    }

    _initFromHistory() {
        this._guardActive = !!(history.state && history.state.g3dGuard);
        this._reconcile();
    }

    _reconcile() {
        if (this._isOverlayOpen() && !this._guardActive) {
            history.pushState({ g3dGuard: true }, '');   // same URL, no navigation
            this._guardActive = true;
        }
        // Overlay closed in-app: leave the (invisible) stale guard for the next Back.
    }

    _onPop = () => {
        if (!this._guardActive) return;                 // no guard on top → real navigation
        this._guardActive = false;
        if (this._isOverlayOpen()) {
            this._returnToGlobe();                      // Back while an overlay is open → globe
        } else {
            history.back();                             // stale guard → continue leaving the page
        }
    };
}
