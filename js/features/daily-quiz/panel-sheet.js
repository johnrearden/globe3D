/**
 * PanelSheet — turn the Daily Challenge bottom sheet into a draggable, two-state
 * "peek" panel. The user drags (or taps) the grab handle / top bar to slide the
 * panel down until just its top bar shows, revealing the globe behind it — then
 * slides/taps it back up. Works for both the mobile bottom sheet (bottom:0) and
 * the desktop floating card (bottom:16px) without special-casing.
 *
 * Self-contained: it only needs the panel element + the handle element(s) to
 * attach the gesture to; it manages a `transform: translateY()` on the panel and
 * an `.dq-dragging` class (which the CSS uses to drop the snap transition during
 * a live drag). The globe's OrbitControls are untouched — the gesture lives
 * entirely on the handle, and `touch-action: none` keeps a touch-drag from
 * scrolling the panel body instead.
 */

// Collapse if the panel was dragged past this fraction of its travel.
const SNAP_FRACTION = 0.33;
// A release faster than this (px/ms) snaps in the fling direction regardless of position.
const FLING_VELOCITY = 0.35;

/**
 * Pure snap decision — exported for unit tests.
 * @param {number} translateY    current downward offset (px, 0 = fully expanded)
 * @param {number} maxTranslate  offset at the collapsed/peek position (px)
 * @param {number} velocityY     release velocity (px/ms; + = downward)
 * @returns {'expanded'|'collapsed'}
 */
export function decideSnap(translateY, maxTranslate, velocityY) {
    if (maxTranslate <= 0) return 'expanded';
    if (velocityY > FLING_VELOCITY) return 'collapsed';
    if (velocityY < -FLING_VELOCITY) return 'expanded';
    return translateY > maxTranslate * SNAP_FRACTION ? 'collapsed' : 'expanded';
}

export class PanelSheet {
    /**
     * @param {HTMLElement} panel     the #dq-panel element
     * @param {Object} opts
     * @param {HTMLElement[]} opts.handles  elements that start a drag (grab + top bar)
     * @param {(state:'expanded'|'collapsed')=>void} [opts.onToggle]
     */
    constructor(panel, { handles = [], onToggle = null } = {}) {
        this.panel = panel;
        this.handles = handles;
        this.onToggle = onToggle;

        this.state = 'expanded';
        this._translate = 0;        // current applied offset (px)
        this._dragging = false;
        this._startY = 0;
        this._startTranslate = 0;
        this._lastY = 0;
        this._lastT = 0;
        this._velocity = 0;
        this._moved = false;        // distinguishes a tap from a drag

        this._onDown = this._onDown.bind(this);
        this._onMove = this._onMove.bind(this);
        this._onUp = this._onUp.bind(this);
        this._onResize = this._onResize.bind(this);
        this._onKey = this._onKey.bind(this);

        for (const h of this.handles) {
            h.addEventListener('pointerdown', this._onDown);
            h.addEventListener('keydown', this._onKey);
        }
        window.addEventListener('resize', this._onResize);
    }

    /**
     * Peek height when collapsed: leave only the grab tab visible (the header bar
     * and everything below it slide off the bottom). The tab's bottom edge is
     * exactly where the header bar begins, so `.dq-bar`'s offsetTop is the peek.
     */
    _peekHeight() {
        const bar = this.panel.querySelector('.dq-bar');
        if (bar) return bar.offsetTop;
        const grab = this.panel.querySelector('.dq-grab');
        return grab ? grab.offsetTop + grab.offsetHeight : 40;
    }

    /**
     * Collapsed offset. The panel is anchored at the bottom of the (layout)
     * viewport, so sliding it down by `panelHeight - peek` leaves exactly the
     * grab tab showing at the bottom — above a bottom-docked address bar on
     * mobile. Deliberately uses the panel's own height, NOT window.innerHeight:
     * the mobile address bar showing/hiding mid-drag changes innerHeight (and
     * fires `resize`), which previously made the panel snap back on release.
     */
    _maxTranslate() {
        return Math.max(0, this.panel.offsetHeight - this._peekHeight());
    }

    _apply(t) {
        this._translate = t;
        this.panel.style.transform = t > 0 ? `translateY(${t}px)` : '';
    }

    _setState(state) {
        this.state = state;
        this._apply(state === 'collapsed' ? this._maxTranslate() : 0);
        if (this.onToggle) this.onToggle(state);
    }

    expand() { this._setState('expanded'); }
    collapse() { this._setState('collapsed'); }
    toggle() { this._setState(this.state === 'expanded' ? 'collapsed' : 'expanded'); }

    _onDown(e) {
        // Let the close (×) button and any other interactive control behave normally.
        if (e.target.closest('.dq-close')) return;
        this._dragging = true;
        this._moved = false;
        this._startY = this._lastY = e.clientY;
        this._lastT = e.timeStamp;
        this._velocity = 0;
        this._startTranslate = this._translate;
        this._dragMax = this._maxTranslate();   // cache: avoid reflow thrash per move
        this.panel.classList.add('dq-dragging');
        try { e.target.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        window.addEventListener('pointermove', this._onMove);
        window.addEventListener('pointerup', this._onUp);
        window.addEventListener('pointercancel', this._onUp);
    }

    _onMove(e) {
        if (!this._dragging) return;
        const dy = e.clientY - this._startY;
        if (Math.abs(dy) > 4) this._moved = true;
        const t = Math.max(0, Math.min(this._dragMax, this._startTranslate + dy));
        // Instantaneous velocity for fling detection (px/ms).
        const dt = e.timeStamp - this._lastT;
        if (dt > 0) this._velocity = (e.clientY - this._lastY) / dt;
        this._lastY = e.clientY;
        this._lastT = e.timeStamp;
        this._apply(t);
    }

    _onUp() {
        if (!this._dragging) return;
        this._dragging = false;
        this.panel.classList.remove('dq-dragging');
        window.removeEventListener('pointermove', this._onMove);
        window.removeEventListener('pointerup', this._onUp);
        window.removeEventListener('pointercancel', this._onUp);

        if (!this._moved) {
            // A tap on the handle toggles.
            this.toggle();
            return;
        }
        this._setState(decideSnap(this._translate, this._dragMax, this._velocity));
    }

    _onKey(e) {
        // Keyboard-operate the grab handle (role="button").
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            this.toggle();
        }
    }

    _onResize() {
        // Don't fight an in-progress drag (the mobile address bar showing/hiding
        // fires resize mid-gesture). Otherwise re-pin to the current state.
        if (this._dragging) return;
        if (this.state === 'collapsed') this._apply(this._maxTranslate());
        else this._apply(0);
    }

    destroy() {
        for (const h of this.handles) {
            h.removeEventListener('pointerdown', this._onDown);
            h.removeEventListener('keydown', this._onKey);
        }
        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('pointermove', this._onMove);
        window.removeEventListener('pointerup', this._onUp);
        window.removeEventListener('pointercancel', this._onUp);
    }
}
