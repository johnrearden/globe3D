/**
 * Apex landing panel — the reading view on terragotcha.com/.
 *
 * The panel's MARKUP is static and generated (build-landing-facts.mjs writes it
 * into index.html); this module owns only its behaviour, so everything a crawler
 * needs is in the document before any of this runs.
 *
 * Two states, both classes on <body>:
 *
 *   landing-active — the reading view. The panel covers ~2/3 of the viewport and
 *                    the globe is pushed into the free third by a CAMERA VIEW
 *                    OFFSET. The canvas is deliberately left at full viewport
 *                    size: PointerControls maps pointer→NDC against
 *                    window.innerWidth/innerHeight, so shrinking the canvas
 *                    would make every pick resolve to the wrong country with no
 *                    error to notice. setViewOffset moves only the projection.
 *
 *   globe-focus    — a tap on the globe re-centres it and fades the panel out.
 *                    Reversible: without a way back, one stray tap would cost the
 *                    reader the content for the rest of the session.
 *
 * There is no splash overlay here. The panel paints on the first frame and the
 * globe slides in when it is ready (globe3d:intro-dismissed), which is the same
 * order the /country/* pages use.
 */

const RESTORE_ICON = `<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M224 128a8 8 0 0 1-8 8H59.3l58.4 58.3a8 8 0 0 1-11.4 11.4l-72-72a8 8 0 0 1 0-11.4l72-72a8 8 0 0 1 11.4 11.4L59.3 120H216a8 8 0 0 1 8 8Z"/></svg>`;

// A pointer that moves further/longer than this is a globe drag, not a tap, so
// rotating the globe must not dismiss what the reader is reading.
const TAP_PX = 8;
const TAP_MS = 500;

// How much of the free region's short side the globe should span. Well below 1.0
// so the limb never crowds the panel edge — at 1.0 the globe would touch it.
const GLOBE_FILL = 0.62;

const TRANSITION_MS = 620;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class LandingPanel {
    /**
     * @param {Object} deps
     * @param {Object} deps.cameraController CameraController (setFocalAnchor/refreshViewOffset)
     * @param {Object} deps.sceneManager     SceneManager (onResize, getInitialCameraDistance)
     * @param {Object} deps.camera           THREE.PerspectiveCamera
     * @param {Object} deps.controls         OrbitControls
     */
    constructor({ cameraController, sceneManager, camera, controls }) {
        this.cameraController = cameraController;
        this.sceneManager = sceneManager;
        this.camera = camera;
        this.controls = controls;

        this.panel = null;
        this.restoreBtn = null;
        this.active = false;
        this._anim = null;
        this._pointer = null;
    }

    /**
     * @returns {boolean} whether the landing view is present on this page. False
     *   on any host without the generated panel (the country pages, embeds), so
     *   the caller can skip the rest of the wiring.
     */
    init() {
        this.panel = document.getElementById('landing-panel');
        if (!this.panel) return false;

        // landing-boot is permanent for the life of the page: it marks "this page
        // has a landing panel", which is what the globe-reveal CSS keys off. It
        // is NOT the reading-view flag — that is landing-active, which comes and
        // goes as the reader moves between the panel and the globe.
        document.body.classList.add('landing-boot');
        this._buildRestoreButton();

        // A reader following "Explore France on the globe" from a country
        // article asked for the globe, not for more prose. Start focused, with
        // the panel one click away — otherwise the deep link's camera move would
        // frame the country in the third of the screen the panel doesn't cover.
        if (new URLSearchParams(location.search).get('country')) {
            document.body.classList.add('globe-focus');
            this.active = false;
        } else {
            document.body.classList.add('landing-active');
            this._applyLayout({ moveCamera: true });
            this.active = true;
        }

        // The globe arrives late and off-centre; reveal it only once it is lit,
        // so it slides in rather than appearing mid-render.
        document.addEventListener(
            'globe3d:intro-dismissed',
            () => document.body.classList.add('globe-ready'),
            { once: true },
        );

        // setViewOffset bakes in the viewport it was given, so a resize needs
        // both the anchor and the distance recomputed.
        this.sceneManager.onResize(() => {
            if (this.active) this._applyLayout({ moveCamera: true });
        });

        this._watchCanvasTaps();
        return true;
    }

    /** Reading view → globe view. */
    focusGlobe() {
        if (!this.active) return;
        this.active = false;
        document.body.classList.remove('landing-active');
        document.body.classList.add('globe-focus');
        this._animateTo({ x: 0.5, y: 0.5 }, this.sceneManager.getInitialCameraDistance());
        if (this.restoreBtn) this.restoreBtn.focus({ preventScroll: true });
    }

    /** Globe view → reading view. */
    showPanel() {
        if (this.active) return;
        this.active = true;
        document.body.classList.remove('globe-focus');
        document.body.classList.add('landing-active');
        const { anchor, distance } = this._layout();
        this._animateTo(anchor, distance);
        this.panel.scrollTop = 0;
    }

    // --- layout ------------------------------------------------------------

    /**
     * Where the globe should sit, and how big, given where the panel actually
     * is. Measured from the live rect rather than duplicating the CSS
     * breakpoint, so the two cannot disagree.
     */
    _layout() {
        const rect = this.panel.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Side-by-side when the panel leaves a usable column beside it;
        // stacked (mobile) otherwise.
        const horizontal = rect.left > vw * 0.12;
        const freeW = horizontal ? rect.left : vw;
        const freeH = horizontal ? vh : rect.top;

        const anchor = horizontal
            ? { x: (freeW * 0.5) / vw, y: 0.5 }
            : { x: 0.5, y: (freeH * 0.5) / vh };

        // Distance that makes the globe span GLOBE_FILL of the free region's
        // short side. Perspective scale is uniform, so one world unit maps to
        // the same pixel count horizontally and vertically: a sphere of radius 1
        // at distance d spans vh / (d * tan(fov/2)) pixels either way. Inverting
        // that is exact for both the side-by-side and stacked layouts, and it is
        // the same relation SceneManager uses to pick its own distance — so the
        // two cannot disagree about how big "full size" is.
        const halfFov = Math.tan((this.camera.fov * Math.PI) / 180 / 2);
        const diameter = Math.max(GLOBE_FILL * Math.min(freeW, freeH), 1);
        const distance = clamp(
            vh / (diameter * halfFov),
            this.controls.minDistance,
            this.controls.maxDistance,
        );

        return { anchor, distance };
    }

    _applyLayout({ moveCamera }) {
        const { anchor, distance } = this._layout();
        this.cameraController.setFocalAnchor(anchor);
        if (moveCamera) this._setDistance(distance);
    }

    _setDistance(distance) {
        this.camera.position.setLength(distance);
        this.camera.lookAt(0, 0, 0);
        this.controls.update();
    }

    /** Ease the anchor and the camera distance together over one transition. */
    _animateTo(toAnchor, toDistance) {
        if (this._anim) cancelAnimationFrame(this._anim);

        const from = this._layout().anchor;
        const start = this.cameraController._focalAnchor || from;
        const fromDistance = this.camera.position.length();
        const t0 = performance.now();

        const step = (now) => {
            const p = Math.min((now - t0) / TRANSITION_MS, 1);
            const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
            this.cameraController.setFocalAnchor({
                x: start.x + (toAnchor.x - start.x) * e,
                y: start.y + (toAnchor.y - start.y) * e,
            });
            this._setDistance(fromDistance + (toDistance - fromDistance) * e);
            if (p < 1) {
                this._anim = requestAnimationFrame(step);
            } else {
                this._anim = null;
                // Land on a clean projection rather than an anchor of
                // {0.5,0.5}, which is a no-op offset the camera would still carry.
                if (toAnchor.x === 0.5 && toAnchor.y === 0.5) {
                    this.cameraController.clearViewOffset();
                }
            }
        };
        this._anim = requestAnimationFrame(step);
    }

    // --- input -------------------------------------------------------------

    /**
     * A tap on the globe enters the focus view; a drag does not. Bound on the
     * canvas rather than the document so a click inside the panel — following a
     * country link, scrolling — is untouched.
     */
    _watchCanvasTaps() {
        const canvas = document.getElementById('globe-canvas');
        if (!canvas) return;

        canvas.addEventListener('pointerdown', (e) => {
            this._pointer = { x: e.clientX, y: e.clientY, t: performance.now() };
        });

        canvas.addEventListener('pointerup', (e) => {
            const down = this._pointer;
            this._pointer = null;
            if (!down || !this.active) return;
            const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
            if (moved <= TAP_PX && performance.now() - down.t <= TAP_MS) {
                this.focusGlobe();
            }
        });
    }

    _buildRestoreButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lf-restore';
        btn.innerHTML = `${RESTORE_ICON}<span>Back to the guide</span>`;
        btn.addEventListener('click', () => this.showPanel());
        document.body.appendChild(btn);
        this.restoreBtn = btn;
    }
}
