/**
 * Scene Management Module
 * Handles Three.js scene initialization, rendering, and lifecycle management
 */

import { state } from '../data/state.js';
import { createWebGLRenderer } from '../utils/webgl-diagnostics.js';

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

        // Callbacks invoked after each (settled) resize, e.g. to reposition the camera.
        this.resizeCallbacks = [];

        // Loading progress tracking
        this.currentProgress = 0;
        this.progressAnimationFrame = null;

        // Stable bound handler so addEventListener/removeEventListener match.
        // It schedules (rather than runs) the resize so we can wait for layout to
        // settle — mobile reports stale innerWidth/innerHeight right after an
        // orientationchange, which otherwise sizes the canvas for the old orientation.
        this._onResize = () => this._scheduleResize();
        this._resizeRaf = null;
    }

    /**
     * Initialize Three.js scene, camera, and renderer
     */
    init() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x001122); // darkened space; original was 0x001122

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
        this.renderer = createWebGLRenderer({ antialias: true }, { label: 'globe' });
        // Cap DPR at 2: high-DPI phones otherwise render blurry (DPR never applied)
        // while >2 wastes fill rate for no visible gain.
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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

        // Setup resize listeners. orientationchange and visualViewport are needed
        // on mobile: a plain 'resize' can fire before the post-rotation viewport
        // dimensions have settled, and visualViewport reports the settled size.
        window.addEventListener('resize', this._onResize);
        window.addEventListener('orientationchange', this._onResize);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', this._onResize);
        }

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

        // Start fully dark and remember each light's target intensity. The scene
        // is revealed with a smooth lights-up (fadeInLights) once the globe
        // texture has finished loading. NOTE: the country ShaderMaterial lights
        // itself and ignores these lights — GlobeManager.fadeInLighting() ramps
        // the matching shader uniforms so the textured globe reveals in step.
        this.lights = [ambientLight, directionalLight, pointLight1, pointLight2];
        this.lightTargets = this.lights.map(l => l.intensity);
        this.lights.forEach(l => { l.intensity = 0; });
    }

    /**
     * Smoothly raise every scene light from 0 to its default intensity.
     * The running render loop picks up the new intensities each frame.
     * @param {number} duration - Fade duration in milliseconds
     */
    fadeInLights(duration = 1500) {
        if (!this.lights) return;
        const targets = this.lightTargets;
        const start = performance.now();
        const step = (now) => {
            const t = Math.min((now - start) / duration, 1);
            const e = t * t * (3 - 2 * t); // smoothstep ease
            this.lights.forEach((l, i) => { l.intensity = targets[i] * e; });
            if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    /**
     * Coalesce resize/orientationchange bursts and defer the actual resize until
     * layout has settled. Two rAFs give the browser a chance to report the real
     * post-rotation viewport before we read it — without this, mobile sizes the
     * canvas to the stale pre-rotation (e.g. landscape) dimensions and the globe
     * ends up oversized in a corner after rotating back to portrait.
     */
    _scheduleResize() {
        if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
        this._resizeRaf = requestAnimationFrame(() => {
            this._resizeRaf = requestAnimationFrame(() => {
                this._resizeRaf = null;
                this.applyResize();
            });
        });
    }

    /**
     * Apply a resize using the settled viewport dimensions, then notify any
     * registered resize callbacks (e.g. camera repositioning).
     */
    applyResize() {
        // visualViewport reports the settled post-rotation size on mobile;
        // fall back to innerWidth/innerHeight elsewhere.
        const vv = window.visualViewport;
        const width = Math.round(vv ? vv.width : window.innerWidth);
        const height = Math.round(vv ? vv.height : window.innerHeight);
        const aspectRatio = width / height;

        this.camera.aspect = aspectRatio;
        this.camera.updateProjectionMatrix();
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(width, height);

        // Recalculate camera distance for new viewport size
        const fov = 75 * Math.PI / 180;
        const isMobile = width <= 768;

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

        // Notify resize subscribers (e.g. reposition camera + controls.update)
        this.resizeCallbacks.forEach(callback => {
            try {
                callback({ width, height });
            } catch (error) {
                console.error('Error in resize callback:', error);
            }
        });
    }

    /**
     * Register a callback invoked after each settled resize.
     * @param {Function} callback - Function called with { width, height }
     */
    onResize(callback) {
        this.resizeCallbacks.push(callback);
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

        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('orientationchange', this._onResize);
        if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', this._onResize);
        }
        if (this._resizeRaf) {
            cancelAnimationFrame(this._resizeRaf);
            this._resizeRaf = null;
        }

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.renderCallbacks = [];
        this.resizeCallbacks = [];
    }

    /**
     * Set the scene background — the "space" color behind the globe. Accepts a
     * CSS color string, a hex int, or a THREE.Color. Admin-themeable via
     * js/features/scene-appearance.js (canvas can't read CSS tokens).
     * @param {string|number|THREE.Color} color
     */
    setBackground(color) {
        if (!this.scene) return;
        if (this.scene.background && this.scene.background.isColor) {
            this.scene.background.set(color);
        } else {
            this.scene.background = new THREE.Color(color);
        }
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
