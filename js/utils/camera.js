/**
 * Camera Utilities Module
 * Provides reusable camera animation and manipulation functions
 */

/**
 * Easing functions for smooth animations
 */
export const Easing = {
    /**
     * Ease in-out cubic easing
     * @param {number} t - Progress value between 0 and 1
     * @returns {number} Eased value
     */
    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },

    /**
     * Ease out cubic easing
     * @param {number} t - Progress value between 0 and 1
     * @returns {number} Eased value
     */
    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    },

    /**
     * Ease in cubic easing
     * @param {number} t - Progress value between 0 and 1
     * @returns {number} Eased value
     */
    easeInCubic(t) {
        return t * t * t;
    },

    /**
     * Linear easing (no easing)
     * @param {number} t - Progress value between 0 and 1
     * @returns {number} Same value
     */
    linear(t) {
        return t;
    }
};

/**
 * Animate camera position with easing
 * @param {THREE.Camera} camera - The camera to animate
 * @param {THREE.Vector3} targetPosition - Target camera position
 * @param {number} duration - Animation duration in milliseconds
 * @param {Function} easingFunction - Easing function to use (default: easeOutCubic)
 * @returns {Promise<void>} Promise that resolves when animation completes
 */
export function animateCamera(camera, targetPosition, duration = 1000, easingFunction = Easing.easeOutCubic) {
    return new Promise((resolve) => {
        const startPosition = camera.position.clone();
        const startTime = Date.now();

        function animate() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = easingFunction(progress);

            camera.position.lerpVectors(startPosition, targetPosition, easeProgress);
            camera.lookAt(0, 0, 0);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                resolve();
            }
        }

        animate();
    });
}

/**
 * Animate camera position and target with easing
 * @param {THREE.Camera} camera - The camera to animate
 * @param {Object} controls - OrbitControls instance
 * @param {THREE.Vector3} targetPosition - Target camera position
 * @param {THREE.Vector3} targetTarget - Target look-at position
 * @param {number} duration - Animation duration in milliseconds
 * @param {Function} easingFunction - Easing function to use
 * @returns {Promise<void>} Promise that resolves when animation completes
 */
export function animateCameraWithTarget(camera, controls, targetPosition, targetTarget, duration = 1000, easingFunction = Easing.easeOutCubic) {
    return new Promise((resolve) => {
        const startPosition = camera.position.clone();
        const startTarget = controls.target.clone();
        const startTime = Date.now();

        function animate() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = easingFunction(progress);

            camera.position.lerpVectors(startPosition, targetPosition, easeProgress);
            controls.target.lerpVectors(startTarget, targetTarget, easeProgress);
            controls.update();

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                resolve();
            }
        }

        animate();
    });
}

/**
 * Zoom camera to a specific distance from origin
 * @param {THREE.Camera} camera - The camera to zoom
 * @param {Object} controls - OrbitControls instance
 * @param {number} distance - Target distance from origin
 * @param {number} duration - Animation duration in milliseconds
 * @returns {Promise<void>} Promise that resolves when animation completes
 */
export function zoomToDistance(camera, controls, distance, duration = 1000) {
    const direction = camera.position.clone().normalize();
    const targetPosition = direction.multiplyScalar(distance);
    return animateCamera(camera, targetPosition, duration);
}

/**
 * Calculate camera distance for responsive viewport
 * @param {number} width - Viewport width
 * @param {number} height - Viewport height
 * @param {number} fov - Field of view in degrees
 * @param {number} targetPercentage - Target screen percentage (default: 0.65)
 * @returns {number} Calculated camera distance
 */
export function calculateCameraDistance(width, height, fov = 75, targetPercentage = 0.65) {
    const aspectRatio = width / height;
    const fovRadians = fov * Math.PI / 180;

    if (aspectRatio >= 1) {
        return (1 / Math.tan(fovRadians / 2)) / targetPercentage;
    } else {
        const horizontalFov = 2 * Math.atan(Math.tan(fovRadians / 2) * aspectRatio);
        return (1 / Math.tan(horizontalFov / 2)) / targetPercentage;
    }
}
