/**
 * Label Management Module
 * Handles country label creation, visibility, and configuration
 */

import { state } from '../data/state.js';

// Access global THREE.js library
const THREE = window.THREE;

export class LabelManager {
    constructor(scene, camera, globeManager) {
        this.scene = scene;
        this.camera = camera;
        this.globeManager = globeManager;
        this.labels = [];
        this.labelConfig = {};
        this.labelDefaults = {};

        // Constants
        this.ZOOM_FAR = 6.0;      // Show only large country labels
        this.ZOOM_MEDIUM = 3.5;   // Show large + medium labels
        this.ZOOM_CLOSE = 2.2;    // Show all labels
    }

    /**
     * Create labels for all countries
     * @param {Object} LARGE_COUNTRIES - Set of large country names
     * @param {Object} SMALL_COUNTRIES - Set of small country names
     */
    createLabels(LARGE_COUNTRIES, SMALL_COUNTRIES) {
        console.log('Creating country labels...');

        const centroids = this.globeManager.getCentroids();
        const globe = this.globeManager.getGlobe();

        centroids.forEach(({ name, centroid }) => {
            // Determine size category and dimensions
            let sizeCategory = 'medium';
            let labelWidth, labelHeight;

            if (LARGE_COUNTRIES.has(name)) {
                sizeCategory = 'large';
                labelWidth = 0.25;
                labelHeight = 0.065;
            } else if (SMALL_COUNTRIES.has(name)) {
                sizeCategory = 'small';
                labelWidth = 0.12;
                labelHeight = 0.032;
            } else {
                sizeCategory = 'medium';
                labelWidth = 0.18;
                labelHeight = 0.048;
            }

            const labelTexture = this.createTextLabel(name);

            // Create material with transparency
            const labelMaterial = new THREE.MeshBasicMaterial({
                map: labelTexture,
                transparent: true,
                opacity: 1.0,
                side: THREE.DoubleSide,
                depthTest: false,
                depthWrite: false
            });

            // Create plane geometry with size based on country category
            const labelGeometry = new THREE.PlaneGeometry(labelWidth, labelHeight);
            const labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);

            // Position at centroid, slightly above surface
            const labelPosition = centroid.clone().multiplyScalar(1.02);
            labelMesh.position.copy(labelPosition);

            // Orient label to face outward from globe center
            labelMesh.lookAt(centroid.clone().multiplyScalar(2));

            // Store metadata
            labelMesh.userData.countryName = name;
            labelMesh.userData.sizeCategory = sizeCategory;

            // Store default configuration
            this.labelDefaults[name] = {
                position: labelPosition.clone(),
                scale: 1.0,
                width: labelWidth,
                height: labelHeight
            };

            // Initially hide all labels
            labelMesh.visible = false;

            // Add to globe so it rotates with it
            globe.add(labelMesh);
            this.labels.push(labelMesh);
        });

        // Sync to state
        state.set('labels.list', this.labels, false);
        state.set('labels.defaults', this.labelDefaults, false);

        console.log(`Created ${this.labels.length} labels`);
    }

    /**
     * Create a text label texture
     * @param {string} text - Label text
     * @returns {THREE.Texture}
     */
    createTextLabel(text) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        // Set canvas size (fixed)
        canvas.width = 512;
        canvas.height = 128;

        // Configure text style
        context.font = '32px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        // Draw dark gray text for contrast with ocean
        context.fillStyle = '#686868';
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        return texture;
    }

    /**
     * Update label visibility based on camera distance and direction
     */
    updateVisibility() {
        // Hide all labels during quiz mode
        const quizActive = state.get('quiz.active');
        if (quizActive) {
            this.labels.forEach(label => {
                label.visible = false;
            });
            return;
        }

        const cameraDistance = this.camera.position.length();

        // Determine which size categories to show based on zoom
        let showLarge = false;
        let showMedium = false;
        let showSmall = false;

        if (cameraDistance >= this.ZOOM_FAR) {
            // Far zoom - show only large countries
            showLarge = true;
        } else if (cameraDistance >= this.ZOOM_MEDIUM) {
            // Medium zoom - show large and medium countries
            showLarge = true;
            showMedium = true;
        } else {
            // Close zoom - show all countries
            showLarge = true;
            showMedium = true;
            showSmall = true;
        }

        // Get camera direction
        const cameraDirection = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDirection);

        this.labels.forEach(label => {
            const sizeCategory = label.userData.sizeCategory;

            // Determine if this label should be shown based on zoom level
            let shouldShowByZoom = false;
            if (sizeCategory === 'large') {
                shouldShowByZoom = showLarge;
            } else if (sizeCategory === 'medium') {
                shouldShowByZoom = showMedium;
            } else if (sizeCategory === 'small') {
                shouldShowByZoom = showSmall;
            }

            if (!shouldShowByZoom) {
                label.visible = false;
                return;
            }

            // Check if label is front-facing (visible from camera)
            const labelPosition = label.position.clone().normalize();
            const dotProduct = labelPosition.dot(cameraDirection);

            // Show label if it's facing the camera (dot product < 0, since camera looks inward)
            label.visible = dotProduct < -0.1;
        });
    }

    /**
     * Load label configuration from object
     * @param {Object} config - Label configuration
     */
    loadConfig(config) {
        if (!config || Object.keys(config).length === 0) {
            return;
        }

        this.labelConfig = config;
        this.applyConfig();

        // Sync to state
        state.set('labels.config', this.labelConfig, false);

        console.log(`Loaded configuration for ${Object.keys(config).length} labels`);
    }

    /**
     * Apply loaded configuration to labels
     */
    applyConfig() {
        Object.entries(this.labelConfig).forEach(([countryName, cfg]) => {
            const label = this.labels.find(l => l.userData.countryName === countryName);
            if (!label) return;

            // Apply position if specified
            if (cfg.position) {
                label.position.set(cfg.position.x, cfg.position.y, cfg.position.z);
            }

            // Apply scale if specified
            if (cfg.scale !== undefined) {
                label.scale.set(cfg.scale, cfg.scale, 1);
            }
        });
    }

    /**
     * Save label configuration to object
     * @returns {Object} Label configuration
     */
    saveConfig() {
        const config = {};

        this.labels.forEach(label => {
            const countryName = label.userData.countryName;
            const defaultPos = this.labelDefaults[countryName]?.position;
            const defaultScale = this.labelDefaults[countryName]?.scale || 1.0;

            // Only save if different from default
            const hasCustomPosition = defaultPos &&
                !label.position.equals(defaultPos);

            const currentScale = label.scale.x;
            const hasCustomScale = Math.abs(currentScale - defaultScale) > 0.01;

            if (hasCustomPosition || hasCustomScale) {
                config[countryName] = {
                    position: {
                        x: label.position.x,
                        y: label.position.y,
                        z: label.position.z
                    },
                    scale: currentScale
                };
            }
        });

        this.labelConfig = config;
        state.set('labels.config', this.labelConfig);

        return config;
    }

    /**
     * Reset label to default position and scale
     * @param {string} countryName - Name of country to reset
     */
    resetLabel(countryName) {
        const label = this.labels.find(l => l.userData.countryName === countryName);
        if (!label) return;

        const defaults = this.labelDefaults[countryName];
        if (!defaults) return;

        // Reset position
        label.position.copy(defaults.position);

        // Reset scale
        label.scale.set(defaults.scale, defaults.scale, 1);

        // Remove from config
        delete this.labelConfig[countryName];
        state.set('labels.config', this.labelConfig);
    }

    /**
     * Get all labels
     * @returns {Array} Array of label sprites
     */
    getLabels() {
        return this.labels;
    }

    /**
     * Get label configuration
     * @returns {Object} Label configuration
     */
    getConfig() {
        return this.labelConfig;
    }
}
