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

        // Enable damping for smooth movement
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        // Keep earth centered - no panning
        this.controls.enablePan = false;

        // Set zoom limits (distance from center)
        this.controls.minDistance = 1.13;  // Closest zoom (optimal close view)
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
     * Rotate globe to show a specific country.
     * @param {{centroid: THREE.Vector3, bbox: {minLat, maxLat, minLng, maxLng}}} countryRecord
     *   Country record from globeManager.getCountryByName().
     * @param {boolean} isQuizMode - Whether in quiz mode (affects zoom)
     */
    rotateToCountry(countryRecord, isQuizMode = false) {
        if (!countryRecord || !countryRecord.centroid) return;

        const centroid = countryRecord.centroid;
        const bboxLatLng = countryRecord.bbox;

        // Approximate the 3D bounding box from the four lat/lng bbox corners
        // projected onto the unit sphere. Sufficient for the zoom heuristic.
        const corners = [
            this._latLngToVec3(bboxLatLng.minLat, bboxLatLng.minLng),
            this._latLngToVec3(bboxLatLng.minLat, bboxLatLng.maxLng),
            this._latLngToVec3(bboxLatLng.maxLat, bboxLatLng.minLng),
            this._latLngToVec3(bboxLatLng.maxLat, bboxLatLng.maxLng)
        ];
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        for (const v of corners) {
            if (v.x < minX) minX = v.x;
            if (v.x > maxX) maxX = v.x;
            if (v.y < minY) minY = v.y;
            if (v.y > maxY) maxY = v.y;
            if (v.z < minZ) minZ = v.z;
            if (v.z > maxZ) maxZ = v.z;
        }
        const bbox = new THREE.Vector3(maxX - minX, maxY - minY, maxZ - minZ);
        const bboxSize = bbox.length();

        const worldPos = centroid.clone().normalize();

        // Calculate the spherical angles to this position
        let phi = Math.acos(worldPos.y); // Polar angle
        const theta = Math.atan2(worldPos.z, worldPos.x); // Azimuthal angle

        // Adjust phi to position camera lower during quiz mode only
        if (isQuizMode) {
            phi = phi + 0.4; // Move camera down by ~23 degrees
        }

        // Calculate target camera distance
        let targetDistance;

        if (isQuizMode) {
            // Quiz mode: Use fixed distances to keep zoomed out
            if (bboxSize < 0.15) {
                targetDistance = 2.0;
            } else if (bboxSize < 0.25) {
                targetDistance = 2.5;
            } else if (bboxSize < 0.4) {
                targetDistance = 3.0;
            } else {
                targetDistance = Math.max(this.camera.position.length(), 3.5);
            }
        } else {
            // Normal mode: Calculate distance for country to occupy 40% of screen width
            const fov = 75 * Math.PI / 180; // Camera FOV in radians
            const maxHorizontalDimension = Math.max(bbox.x, bbox.z); // Use horizontal dimensions
            const targetScreenPercentage = 0.4; // Country should occupy 40% of screen width

            // Calculate distance needed
            let calculatedDistance = maxHorizontalDimension / (2 * Math.tan(fov / 2) * targetScreenPercentage);

            // Apply multiplier to account for sphere curvature
            calculatedDistance = calculatedDistance * 7.5;

            // Clamp to camera zoom limits
            targetDistance = Math.max(1.13, Math.min(calculatedDistance, 2));
        }

        // Calculate target camera position
        const targetCameraPos = new THREE.Vector3(
            targetDistance * Math.sin(phi) * Math.cos(theta),
            targetDistance * Math.cos(phi),
            targetDistance * Math.sin(phi) * Math.sin(theta)
        );

        // Animate camera to new position
        const startPos = this.camera.position.clone();
        const duration = 1000; // ms
        const startTime = Date.now();

        const animateRotation = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease in-out cubic
            const easeProgress = progress < 0.5
                ? 4 * progress * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;

            // Interpolate camera position
            this.camera.position.lerpVectors(startPos, targetCameraPos, easeProgress);

            if (progress < 1) {
                requestAnimationFrame(animateRotation);
            }
        };

        animateRotation();
    }

    _latLngToVec3(lat, lng) {
        const phi = (90 - lat) * Math.PI / 180;
        const theta = -(lng + 180) * Math.PI / 180;
        return new THREE.Vector3(
            Math.sin(phi) * Math.cos(theta),
            Math.cos(phi),
            Math.sin(phi) * Math.sin(theta)
        );
    }

    /**
     * Zoom camera out to default distance
     * @param {number} defaultDistance - Target distance
     */
    zoomToDistance(defaultDistance) {
        const currentDistance = this.camera.position.length();
        const targetDistance = defaultDistance;

        if (Math.abs(currentDistance - targetDistance) < 0.1) {
            return; // Already at target distance
        }

        const duration = 800; // ms
        const startTime = Date.now();
        const startPos = this.camera.position.clone();

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic
            const easeProgress = 1 - Math.pow(1 - progress, 3);

            // Calculate new position (scale from center, maintaining direction)
            const newDistance = currentDistance + (targetDistance - currentDistance) * easeProgress;
            const direction = startPos.clone().normalize();
            this.camera.position.copy(direction.multiplyScalar(newDistance));

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        animate();
    }

    /**
     * Enable auto-rotation
     */
    enableAutoRotation() {
        const quizActive = state.get('quiz.active');
        if (!quizActive) {
            this.autoRotateEnabled = true;
            this.controls.autoRotate = true;
            state.set('autoRotation.enabled', true);
        }
    }

    /**
     * Disable auto-rotation
     */
    disableAutoRotation() {
        this.autoRotateEnabled = false;
        this.controls.autoRotate = false;
        state.set('autoRotation.enabled', false);
    }

    /**
     * Stop auto-rotation and start idle timer
     */
    stopAutoRotation() {
        this.disableAutoRotation();

        // Clear any existing idle timeout
        if (this.idleTimeout) {
            clearTimeout(this.idleTimeout);
        }

        // Auto-rotation restart is temporarily disabled
        // Uncomment to enable idle timer:
        // this.idleTimeout = setTimeout(() => {
        //     this.enableAutoRotation();
        // }, this.IDLE_DELAY);
    }

    /**
     * Reset idle timer (call on user interaction)
     */
    resetIdleTimer() {
        this.lastInteractionTime = Date.now();
        state.set('autoRotation.lastInteractionTime', this.lastInteractionTime);

        if (this.autoRotateEnabled) {
            this.stopAutoRotation();
        }
    }

    /**
     * Update controls (call in render loop)
     */
    update() {
        if (this.controls) {
            this.controls.update();
        }
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
