/**
 * Camera Controls Module
 * Handles camera setup, orbital controls, and camera animations
 */

import { state } from '../data/state.js';
import { latLngToXYZ } from '../utils/coordinates.js';
import { viewOffsetFor } from '../utils/view-offset.js';
import {
    framingDistance,
    CLICK_SCREEN_FRACTION,
    QUIZ_SUBJECT_SCREEN_FRACTION,
} from './focus-zoom.js';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class CameraController {
    constructor(camera, renderer, scene) {
        this.camera = camera;
        this.renderer = renderer;
        this.scene = scene;
        this.controls = null;
        this.autoRotateEnabled = false;
        // User preference (settings panel): when false, the globe never auto-rotates
        // — the idle timer won't schedule a resume and resumeAutoRotation() bails.
        this.autoRotateAllowed = true;
        this.idleTimeout = null;
        this.lastInteractionTime = Date.now();
        this.IDLE_DELAY = 120000; // 2 minutes of inactivity before auto-rotation resumes

        // Release-momentum ("flick") state. OrbitControls' own damping barely
        // coasts on a mouse release; this adds a decaying spin from the pointer
        // velocity at release so desktop matches the touch flick feel.
        this._flickActive = false;
        this._thetaVel = 0;   // rad/ms (azimuthal)
        this._phiVel = 0;     // rad/ms (polar)
        this._flickLast = 0;  // timestamp of last applied flick frame
        this.FLICK_HALF_LIFE_MS = 120; // smaller = shorter glide
    }

    /**
     * Inject the collaborators created after the globe loads (globeManager,
     * labelManager, etc.) so the camera animations / idle logic can use them.
     */
    configure({ globeManager, labelManager, smallCountryIndicator, flagRenderer, searchManager, focusRegistry, initialCameraDistance } = {}) {
        this.globeManager = globeManager;
        this.labelManager = labelManager;
        this.smallCountryIndicator = smallCountryIndicator;
        this.flagRenderer = flagRenderer;
        this.searchManager = searchManager;
        this.focusRegistry = focusRegistry;
        this.initialCameraDistance = initialCameraDistance;
    }

    /**
     * Setup Three.js OrbitControls
     */
    setupControls() {
        // Create OrbitControls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);

        // Enable damping for smooth movement. Lower dampingFactor → longer
        // inertia after the user releases the pointer; at 0.02 the angular
        // velocity decays to ~37% over ~0.83s at 60fps (vs ~0.33s at the
        // OrbitControls default of 0.05).
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.02;

        // Keep earth centered - no panning
        this.controls.enablePan = false;

        // Set zoom limits (distance from center)
        this.controls.minDistance = 1.14;  // Closest zoom (optimal close view)
        this.controls.maxDistance = 10;   // Farthest zoom

        // Enable rotation
        this.controls.enableRotate = true;
        this.controls.rotateSpeed = 1.0;

        // Auto-rotate disabled initially
        this.controls.autoRotate = false;
        this.controls.autoRotateSpeed = 1.0;

        // Set target to center of scene (earth's center)
        this.controls.target.set(0, 0, 0);
        this.controls.update();

        // Sync to state
        state.set('scene.controls', this.controls, false);

        console.log('CameraController initialized');
    }

    /**
     * Rotate/zoom the camera to frame a country.
     * @param {string|{name, centroid}} arg - country name or record
     * @param {boolean} isQuizMode
     * @param {THREE.Vector3|null} aimPoint - exact point to aim at (else centroid)
     */
    rotateToCountry(arg, isQuizMode = false, aimPoint = null) {
        this.cancelFlick(); // a programmatic move overrides any coasting spin
        let record = null;
        if (typeof arg === 'string') {
            record = this.globeManager.getCountryByName(arg);
        } else if (arg && arg.centroid) {
            record = arg;
        }
        if (!record || !record.centroid) return;

        const countryName = record.name;
        // Aim at the clicked point when given (keeps focus on far-flung landmasses),
        // otherwise the country centroid.
        const worldPos = (aimPoint || record.centroid).clone().normalize();
        const phi = Math.acos(worldPos.y);
        const theta = Math.atan2(worldPos.z, worldPos.x);

        // Frame so the country fills no more than a target fraction of the screen,
        // giving local context: 40% on a plain click/search, 20% when it's a quiz
        // *subject* (so neighbours show without revealing the answer).
        const fraction = isQuizMode ? QUIZ_SUBJECT_SCREEN_FRACTION : CLICK_SCREEN_FRACTION;
        const targetDistance = this.framingDistanceFor(countryName, fraction);

        const targetCameraPos = new THREE.Vector3(
            targetDistance * Math.sin(phi) * Math.cos(theta),
            targetDistance * Math.cos(phi),
            targetDistance * Math.sin(phi) * Math.sin(theta)
        );

        const startPos = this.camera.position.clone();
        const startDist = startPos.length();
        const duration = 1000;
        const startTime = Date.now();

        const animateRotation = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = progress < 0.5
                ? 4 * progress * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;

            const newPos = new THREE.Vector3().lerpVectors(startPos, targetCameraPos, easeProgress);
            const newDist = startDist + (targetDistance - startDist) * easeProgress;
            newPos.setLength(newDist);

            this.camera.position.copy(newPos);
            this.camera.lookAt(0, 0, 0);
            this.controls.update();

            if (progress < 1) {
                requestAnimationFrame(animateRotation);
            } else {
                // Reveal the target country (disc + arrow) for tiny countries.
                this.smallCountryIndicator.update(countryName);
            }
        };
        animateRotation();
    }

    /**
     * Camera distance that frames `name` so it occupies at most `fraction` of the
     * screen's limiting axis (see focus-zoom.framingDistance). Uses the live camera
     * FOV + aspect so portrait phones zoom out further. Clamped to the zoom limits;
     * falls back to the country's A–H focus distance when its width is unknown.
     */
    framingDistanceFor(name, fraction) {
        const reg = this.focusRegistry;
        const fallback = reg ? reg.distanceOf(name) : 1.55;
        if (!reg) return fallback;

        const vHalf = (this.camera.fov || 75) * Math.PI / 360;   // half vertical FOV (rad)
        const aspect = this.camera.aspect || (window.innerWidth / window.innerHeight);
        const hHalf = Math.atan(Math.tan(vHalf) * aspect);       // half horizontal FOV (rad)
        const halfFov = Math.min(vHalf, hHalf);

        const d = framingDistance(reg.widthOf(name), fraction, halfFov);
        if (!(d > 0)) return fallback;
        return Math.max(this.controls.minDistance, Math.min(this.controls.maxDistance, d));
    }

    /**
     * Zoom out so the whole globe (diameter 2) fills `widthFraction` of the
     * viewport WIDTH, centred on a lat/lng. Used by the capitals quiz "which
     * country?" direction to show the marker on a small, far-away globe.
     * @param {Object} opts
     * @param {number} opts.lat
     * @param {number} opts.lng
     * @param {number} [opts.widthFraction=0.25] target fraction of screen width
     * @param {number} [opts.duration=800]
     */
    frameWholeGlobe({ lat, lng, widthFraction = 0.25, duration = 800 } = {}) {
        const vHalf = (this.camera.fov || 75) * Math.PI / 360;   // half vertical FOV (rad)
        const aspect = this.camera.aspect || (window.innerWidth / window.innerHeight);
        const hHalf = Math.atan(Math.tan(vHalf) * aspect);       // half horizontal FOV (rad)

        // Globe diameter = 2; frame it against the horizontal axis specifically.
        const distance = framingDistance(2, widthFraction, hHalf) || this.controls.maxDistance;
        this.frameView({ lat, lng, distance, duration });
    }

    /** Remove the small-country reveal overlay (white disc + arrow), if shown. */
    clearSmallCountryIndicator() {
        if (this.smallCountryIndicator) this.smallCountryIndicator.remove();
    }

    /** Animate the camera back to the initial full-globe distance. */
    zoomOut() {
        this.cancelFlick();
        this.smallCountryIndicator.remove();

        const targetDistance = this.initialCameraDistance;
        const currentPos = this.camera.position.clone();
        const startDist = currentPos.length();
        const duration = 1000;
        const startTime = Date.now();

        const animateZoom = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            const newDistance = startDist + (targetDistance - startDist) * easeProgress;

            const newPos = currentPos.clone().normalize().multiplyScalar(newDistance);
            this.camera.position.copy(newPos);
            this.camera.lookAt(0, 0, 0);
            this.controls.update();

            if (progress < 1) {
                requestAnimationFrame(animateZoom);
            }
        };
        animateZoom();
    }

    /**
     * Frame an arbitrary lat/lng at a given distance, optionally offsetting the
     * focal point on screen (mobile-first: push the globe up so an options panel
     * fits below). Presentation-only — used by the Daily Challenge to set up map
     * questions. Orbit/lookAt math stays centered; `setViewOffset` shifts only
     * the projection.
     *
     * @param {Object} opts
     * @param {number} opts.lat
     * @param {number} opts.lng
     * @param {number} [opts.distance]      camera distance (clamped to zoom limits)
     * @param {{x:number,y:number}} [opts.focalAnchor]  normalized screen pos for
     *        the focus point (0.5,0.5 = center; y<0.5 = higher up). Default center.
     * @param {boolean} [opts.lockRotation] disable user rotation while framed
     * @param {number} [opts.duration]      animation ms (default 800)
     */
    frameView({ lat, lng, distance, focalAnchor = null, lockRotation = false, duration = 800 } = {}) {
        this.cancelFlick();
        this.disableAutoRotation();
        this.smallCountryIndicator.remove();

        const minD = this.controls.minDistance;
        const maxD = this.controls.maxDistance;
        const targetDistance = Math.max(minD, Math.min(maxD, distance || this.initialCameraDistance));

        const dir = latLngToXYZ(lat, lng, 1, 0);
        const target = new THREE.Vector3(dir.x, dir.y, dir.z).normalize().multiplyScalar(targetDistance);

        this._applyViewOffset(focalAnchor);

        const startPos = this.camera.position.clone();
        const startTime = Date.now();
        const animate = () => {
            const progress = Math.min((Date.now() - startTime) / duration, 1);
            const ease = progress < 0.5
                ? 4 * progress * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            const pos = new THREE.Vector3().lerpVectors(startPos, target, ease);
            pos.setLength(startPos.length() + (targetDistance - startPos.length()) * ease);
            this.camera.position.copy(pos);
            this.camera.lookAt(0, 0, 0);
            this.controls.update();
            if (progress < 1) requestAnimationFrame(animate);
        };
        animate();

        this.controls.enableRotate = !lockRotation;
    }

    /** Shift the projection so the globe center lands at `focalAnchor` on screen. */
    _applyViewOffset(focalAnchor) {
        const el = this.renderer.domElement;
        const w = el.clientWidth || window.innerWidth;
        const h = el.clientHeight || window.innerHeight;
        if (!focalAnchor) {
            this.clearViewOffset();
            return;
        }
        const { x, y } = viewOffsetFor(w, h, focalAnchor);
        this.camera.setViewOffset(w, h, x, y, w, h);
        this.camera.updateProjectionMatrix();
        this._viewOffsetActive = true;
    }

    /** Remove any view offset and re-enable user rotation. */
    clearViewOffset() {
        if (this._viewOffsetActive || this.camera.view) {
            this.camera.clearViewOffset();
            this.camera.updateProjectionMatrix();
            this._viewOffsetActive = false;
        }
    }

    /**
     * Called on every interaction: stop auto-rotation immediately and restart
     * the idle countdown, so rotation only resumes after IDLE_DELAY of no input.
     */
    resetIdleTimer() {
        this.lastInteractionTime = Date.now();

        if (this.autoRotateEnabled) {
            this.autoRotateEnabled = false;
            this.controls.autoRotate = false;
        }

        if (this.idleTimeout) clearTimeout(this.idleTimeout);
        if (this.autoRotateAllowed) {
            this.idleTimeout = setTimeout(() => this.resumeAutoRotation(), this.IDLE_DELAY);
        }
    }

    /**
     * Master on/off for idle auto-rotation (settings panel). When disabled, stops
     * any current spin and prevents the idle timer from resuming it; when enabled,
     * restarts the idle countdown so it resumes after IDLE_DELAY of inactivity.
     */
    setAutoRotateAllowed(allowed) {
        this.autoRotateAllowed = !!allowed;
        if (!allowed) {
            this.disableAutoRotation();
        } else {
            this.resetIdleTimer();
        }
    }

    /** Start idle auto-rotation (just the flags — e.g. the intro spin). */
    enableAutoRotation() {
        this.autoRotateEnabled = true;
        this.controls.autoRotate = true;
    }

    /** Stop auto-rotation and cancel any pending idle resume. */
    disableAutoRotation() {
        if (this.idleTimeout) clearTimeout(this.idleTimeout);
        this.autoRotateEnabled = false;
        this.controls.autoRotate = false;
    }

    /**
     * Start release momentum from the pointer velocity at release.
     * @param {number} velX - horizontal pointer velocity in px/ms
     * @param {number} velY - vertical pointer velocity in px/ms
     */
    flick(velX, velY) {
        if (!this.controls) return;

        // Match OrbitControls' rotate mapping: angle ≈ 2π · rotateSpeed / clientHeight
        // per pixel. Continue at the release velocity, then decay.
        const h = this.renderer.domElement.clientHeight || window.innerHeight;
        const k = 2 * Math.PI * this.controls.rotateSpeed / h; // rad per px
        this._thetaVel = -k * velX; // rad/ms
        this._phiVel = -k * velY;

        // Ignore negligible releases (a slow let-go shouldn't drift).
        if (Math.hypot(this._thetaVel, this._phiVel) < 0.0002) {
            this._flickActive = false;
            return;
        }
        this._flickActive = true;
        this._flickLast = 0; // first update() frame seeds the clock
    }

    /** Cancel any in-progress release momentum (e.g. on a new pointer grab). */
    cancelFlick() {
        this._flickActive = false;
    }

    /** Apply one frame of flick momentum, advancing the camera around the globe. */
    _stepFlick(now) {
        if (!this._flickLast) { this._flickLast = now; return; }
        const dt = Math.min(now - this._flickLast, 50); // clamp to avoid jumps after a stall
        this._flickLast = now;

        // Advance the camera in spherical coords (THREE/OrbitControls convention).
        const offset = this.camera.position;
        const radius = offset.length();
        if (radius === 0) { this._flickActive = false; return; }
        let theta = Math.atan2(offset.x, offset.z) + this._thetaVel * dt;
        let phi = Math.acos(Math.max(-1, Math.min(1, offset.y / radius))) + this._phiVel * dt;
        phi = Math.max(0.000001, Math.min(Math.PI - 0.000001, phi));
        const sinPhiR = Math.sin(phi) * radius;
        offset.set(sinPhiR * Math.sin(theta), Math.cos(phi) * radius, sinPhiR * Math.cos(theta));
        this.camera.lookAt(0, 0, 0);

        // Exponential decay by half-life.
        const decay = Math.pow(0.5, dt / this.FLICK_HALF_LIFE_MS);
        this._thetaVel *= decay;
        this._phiVel *= decay;
        if (Math.hypot(this._thetaVel, this._phiVel) < 0.000005) {
            this._flickActive = false;
        }
    }

    /** Resume auto-rotation after the idle delay (unless a quiz is active). */
    resumeAutoRotation() {
        if (!this.autoRotateAllowed) return;
        if (state.get('quiz.active')) return;

        this.autoRotateEnabled = true;
        this.controls.autoRotate = true;

        if (this.searchManager) this.searchManager.clear();
        this.globeManager.clearSelection();
        if (this.labelManager) this.labelManager.setHighlight(null);
        this.smallCountryIndicator.remove();
        if (this.flagRenderer) this.flagRenderer.hide();
    }

    /**
     * Update controls (call in render loop).
     *
     * Also retunes `controls.zoomSpeed` and `controls.rotateSpeed` to
     * the current zoom level so a wheel tick or pointer drag reads as
     * a roughly consistent visible change at every distance.
     *
     * - zoomSpeed: OrbitControls multiplies distance by `0.95^zoomSpeed`
     *   per tick (~5% at zoomSpeed=1). At close zoom the gap to the
     *   globe surface is tiny so we drop it sharply. Ramp 0.25 → 1.5.
     * - rotateSpeed: angular change per pixel of drag is constant in
     *   OrbitControls, but at close zoom the surface fills the screen
     *   so the same angle reads as a much larger on-screen motion.
     *   Anchored at (dist=1.13 → 0.25) and (dist=3.17 → 0.63) — 50%
     *   faster than the previous mapping at the typical settle
     *   distance — with the line extrapolated to ~1.90 at maxDistance.
     */
    update() {
        if (!this.controls) return;

        const dist = this.camera.position.length();
        const minDist = this.controls.minDistance;
        const maxDist = this.controls.maxDistance;
        const t = Math.max(0, Math.min(1, (dist - minDist) / (maxDist - minDist)));
        this.controls.zoomSpeed = 0.25 + t * 1.25;
        this.controls.rotateSpeed = 0.25 + t * 1.65;

        if (this._flickActive) {
            this._stepFlick(performance.now());
        }

        this.controls.update();
    }

    /**
     * Get controls instance
     * @returns {OrbitControls}
     */
    getControls() {
        return this.controls;
    }

    /**
     * Get camera instance
     * @returns {THREE.PerspectiveCamera}
     */
    getCamera() {
        return this.camera;
    }
}
