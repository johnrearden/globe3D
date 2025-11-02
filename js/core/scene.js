/**
 * Scene Management Module
 * Handles Three.js scene initialization, rendering, and lifecycle management
 */

import { state } from '../data/state.js';

// Access global THREE.js library
const THREE = window.THREE;

export class SceneManager {
    constructor(containerElement) {
        this.container = containerElement;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.initialCameraDistance = null;
        this.animationId = null;

        // Callbacks for render loop
        this.renderCallbacks = [];

        // Loading progress tracking
        this.currentProgress = 0;
        this.progressAnimationFrame = null;
    }

    /**
     * Initialize Three.js scene, camera, and renderer
     */
    init() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x001122);

        // Create camera with adaptive positioning
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );

        // Calculate initial camera distance based on device
        const aspectRatio = window.innerWidth / window.innerHeight;
        const fov = 75 * Math.PI / 180; // Convert to radians
        const isMobile = window.innerWidth <= 768;

        // Calculate distance needed for globe to occupy viewport
        let cameraDistance;
        let targetPercentage = isMobile ? 0.85 : 0.70; // 85% on mobile, 70% on desktop

        if (aspectRatio >= 1) {
            // Width >= Height, so height is the limiting dimension
            cameraDistance = (1 / Math.tan(fov / 2)) / targetPercentage;
        } else {
            // Height > Width, so width is the limiting dimension
            const horizontalFov = 2 * Math.atan(Math.tan(fov / 2) * aspectRatio);
            cameraDistance = (1 / Math.tan(horizontalFov / 2)) / targetPercentage;
        }

        // Store initial camera distance for zoom out button
        this.initialCameraDistance = cameraDistance;

        // Center globe vertically on all screen sizes
        const verticalOffset = 0;
        this.camera.position.set(0, verticalOffset, cameraDistance);

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.domElement.id = 'globe-canvas';
        this.container.appendChild(this.renderer.domElement);

        // Setup lights
        this.setupLights();

        // Sync to state
        state.set('scene.scene', this.scene, false);
        state.set('scene.camera', this.camera, false);
        state.set('scene.renderer', this.renderer, false);
        state.set('scene.initialCameraDistance', this.initialCameraDistance, false);

        // Setup window resize listener
        window.addEventListener('resize', () => this.onWindowResize());

        console.log('SceneManager initialized');
    }

    /**
     * Setup Three.js lighting
     */
    setupLights() {
        // Ambient light - provides overall base illumination
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);

        // Directional light behind camera (will be updated in animate loop)
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(0, 0, 10); // Behind camera
        this.scene.add(directionalLight);

        // Additional point lights for better coverage
        const pointLight1 = new THREE.PointLight(0xffffff, 0.5);
        pointLight1.position.set(5, 5, 5);
        this.scene.add(pointLight1);

        const pointLight2 = new THREE.PointLight(0xffffff, 0.5);
        pointLight2.position.set(-5, -5, 5);
        this.scene.add(pointLight2);

        // Store reference for updating position with camera
        this.scene.userData.cameraLight = directionalLight;
    }

    /**
     * Handle window resize events
     */
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        // Recalculate camera distance for new viewport size
        const aspectRatio = window.innerWidth / window.innerHeight;
        const fov = 75 * Math.PI / 180;
        const isMobile = window.innerWidth <= 768;

        let cameraDistance;
        let targetPercentage = isMobile ? 0.85 : 0.65;

        if (aspectRatio >= 1) {
            cameraDistance = (1 / Math.tan(fov / 2)) / targetPercentage;
        } else {
            const horizontalFov = 2 * Math.atan(Math.tan(fov / 2) * aspectRatio);
            cameraDistance = (1 / Math.tan(horizontalFov / 2)) / targetPercentage;
        }

        // Update stored initial distance
        this.initialCameraDistance = cameraDistance;
        state.set('scene.initialCameraDistance', this.initialCameraDistance);
    }

    /**
     * Update loading progress bar
     * @param {number} percent - Progress percentage (0-100)
     * @param {string} message - Optional message to display
     * @param {boolean} animated - Whether to animate the progress
     * @param {Function} getElement - Function to get DOM elements
     */
    updateLoadingProgress(percent, message = null, animated = false, getElement) {
        const progressFill = getElement('loading-progress-fill');
        const progressText = getElement('loading-progress-text');

        if (animated) {
            // Cancel any ongoing animation
            if (this.progressAnimationFrame) {
                cancelAnimationFrame(this.progressAnimationFrame);
            }

            const startProgress = this.currentProgress;
            const targetProgress = percent;
            const duration = 600; // 600ms for smooth animation
            const startTime = Date.now();

            const animateProgress = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Ease out cubic for smooth deceleration
                const easeProgress = 1 - Math.pow(1 - progress, 3);
                const newProgress = startProgress + (targetProgress - startProgress) * easeProgress;

                this.currentProgress = newProgress;

                if (progressFill) {
                    progressFill.style.width = newProgress + '%';
                }
                if (progressText && message) {
                    // Only append percentage if message doesn't already contain it
                    const hasPercentage = message.includes('%');
                    progressText.textContent = hasPercentage ? message : message + ' ' + Math.round(newProgress) + '%';
                } else if (progressText) {
                    progressText.textContent = 'Loading... ' + Math.round(newProgress) + '%';
                }

                if (progress < 1) {
                    this.progressAnimationFrame = requestAnimationFrame(animateProgress);
                } else {
                    this.progressAnimationFrame = null;
                }
            };

            animateProgress();
        } else {
            // Instant update
            this.currentProgress = percent;
            if (progressFill) {
                progressFill.style.width = percent + '%';
            }
            if (progressText && message) {
                // Only append percentage if message doesn't already contain it
                const hasPercentage = message.includes('%');
                progressText.textContent = hasPercentage ? message : message + ' ' + Math.round(percent) + '%';
            } else if (progressText) {
                progressText.textContent = 'Loading... ' + Math.round(percent) + '%';
            }
        }

        // Sync to state
        state.set('ui.loadingProgress', percent);
    }

    /**
     * Register a callback to be called on each render frame
     * @param {Function} callback - Function to call on each frame
     */
    onRender(callback) {
        this.renderCallbacks.push(callback);
    }

    /**
     * Main animation/render loop
     */
    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());

        // Update light position to stay behind camera
        if (this.scene.userData.cameraLight) {
            this.scene.userData.cameraLight.position.copy(this.camera.position);
        }

        // Call all registered render callbacks
        this.renderCallbacks.forEach(callback => {
            try {
                callback();
            } catch (error) {
                console.error('Error in render callback:', error);
            }
        });

        // Render scene
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Start the animation loop
     */
    start() {
        if (!this.animationId) {
            this.animate();
        }
    }

    /**
     * Stop the animation loop
     */
    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    /**
     * Cleanup and destroy
     */
    destroy() {
        this.stop();

        if (this.renderer) {
            this.renderer.dispose();
            if (this.container.contains(this.renderer.domElement)) {
                this.container.removeChild(this.renderer.domElement);
            }
        }

        window.removeEventListener('resize', () => this.onWindowResize());

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.renderCallbacks = [];
    }

    /**
     * Get scene objects
     */
    getScene() {
        return this.scene;
    }

    getCamera() {
        return this.camera;
    }

    getRenderer() {
        return this.renderer;
    }

    getInitialCameraDistance() {
        return this.initialCameraDistance;
    }
}
