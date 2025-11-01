/**
 * Camera Controls Module
 * Handles camera setup, orbital controls, and camera animations
 */

import { state } from '../data/state.js';

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
        this.controls.rotateSpeed = 0.5;

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
     * Rotate globe to show a specific country
     * @param {THREE.Mesh} country - Country mesh
     * @param {boolean} isQuizMode - Whether in quiz mode (affects zoom)
     */
    rotateToCountry(country, isQuizMode = false) {
        // Get the country's position (centroid of all vertices)
        const geometry = country.geometry;
        const positions = geometry.attributes.position;

        let centerX = 0, centerY = 0, centerZ = 0;
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        const vertexCount = positions.count;

        for (let i = 0; i < vertexCount; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);

            centerX += x;
            centerY += y;
            centerZ += z;

            // Track bounding box
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
        }

        centerX /= vertexCount;
        centerY /= vertexCount;
        centerZ /= vertexCount;

        // Calculate bounding box size (approximate land area)
        const bbox = new THREE.Vector3(maxX - minX, maxY - minY, maxZ - minZ);
        const bboxSize = bbox.length(); // Diagonal length of bounding box

        // Apply country's world matrix to get actual position
        const worldPos = new THREE.Vector3(centerX, centerY, centerZ);
        country.localToWorld(worldPos);

        // Normalize to get direction
        worldPos.normalize();

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
