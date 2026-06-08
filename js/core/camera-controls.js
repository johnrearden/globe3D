/**
 * Camera Controls Module
 * Handles camera setup, orbital controls, and camera animations
 */

import { state } from '../data/state.js';

// Access global THREE.js library
const THREE = window.THREE;

export class CameraController {
    constructor(camera, renderer, scene) {
        this.camera = camera;
        this.renderer = renderer;
        this.scene = scene;
        this.controls = null;
        this.autoRotateEnabled = false;
        this.idleTimeout = null;
        this.lastInteractionTime = Date.now();
        this.IDLE_DELAY = 120000; // 2 minutes of inactivity before auto-rotation resumes
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
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);

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

        // Universal focus distance: the country's A–H level (by bbox width),
        // identical for click, search, and quiz; also the label appearance threshold.
        const targetDistance = this.focusRegistry
            ? this.focusRegistry.distanceOf(countryName)
            : 1.55;

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

    /** Animate the camera back to the initial full-globe distance. */
    zoomOut() {
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
        this.idleTimeout = setTimeout(() => this.resumeAutoRotation(), this.IDLE_DELAY);
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

    /** Resume auto-rotation after the idle delay (unless a quiz is active). */
    resumeAutoRotation() {
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

        this.controls.update();
    }

    /**
     * Get controls instance
     * @returns {THREE.OrbitControls}
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
