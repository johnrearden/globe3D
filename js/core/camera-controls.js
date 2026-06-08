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
        this.IDLE_DELAY = 60000; // 1 minute
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
