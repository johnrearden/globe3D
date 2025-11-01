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

        centroids.forEach(({ name, centroid }) => {
            // Determine font size based on country size
            let fontSize = 24; // Medium countries
            if (LARGE_COUNTRIES.has(name)) {
                fontSize = 32;
            } else if (SMALL_COUNTRIES.has(name)) {
                fontSize = 16;
            }

            const labelMesh = this.createTextLabel(name, fontSize);

            // Position at centroid, slightly above surface
            const labelPosition = centroid.clone().multiplyScalar(1.02);
            labelMesh.position.copy(labelPosition);

            // Orient label to face outward from globe center
            labelMesh.lookAt(new THREE.Vector3(0, 0, 0));
            labelMesh.rotateY(Math.PI);

            // Store metadata
            labelMesh.userData.countryName = name;
            labelMesh.userData.defaultPosition = labelPosition.clone();
            labelMesh.userData.defaultScale = 1.0;
            labelMesh.userData.fontSize = fontSize;

            // Store default configuration
            this.labelDefaults[name] = {
                position: labelPosition.clone(),
                scale: 1.0
            };

            this.scene.add(labelMesh);
            this.labels.push(labelMesh);
        });

        // Sync to state
        state.set('labels.list', this.labels, false);
        state.set('labels.defaults', this.labelDefaults, false);

        console.log(`Created ${this.labels.length} labels`);
    }

    /**
     * Create a text label mesh
     * @param {string} text - Label text
     * @param {number} fontSize - Font size in pixels
     * @returns {THREE.Sprite}
     */
    createTextLabel(text, fontSize = 24) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        // Set canvas size based on text length and font size
        const padding = 10;
        context.font = `bold ${fontSize}px Arial`;
        const metrics = context.measureText(text);
        canvas.width = metrics.width + padding * 2;
        canvas.height = fontSize + padding * 2;

        // Re-apply font after canvas resize
        context.font = `bold ${fontSize}px Arial`;
        context.fillStyle = 'black';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true
        });
        const sprite = new THREE.Sprite(spriteMaterial);

        // Scale sprite to appropriate size
        const scale = 0.1 * (fontSize / 24);
        sprite.scale.set(scale, scale * 0.5, 1);

        return sprite;
    }

    /**
     * Update label visibility based on camera distance and direction
     */
    updateVisibility() {
        const cameraDistance = this.camera.position.length();

        // Determine which size categories to show based on zoom
        let showLarge = true;
        let showMedium = cameraDistance < this.ZOOM_FAR;
        let showSmall = cameraDistance < this.ZOOM_CLOSE;

        this.labels.forEach(label => {
            const fontSize = label.userData.fontSize;

            // Size-based visibility
            let sizeVisible = false;
            if (fontSize >= 32 && showLarge) sizeVisible = true;
            else if (fontSize >= 24 && showMedium) sizeVisible = true;
            else if (fontSize < 24 && showSmall) sizeVisible = true;

            if (!sizeVisible) {
                label.visible = false;
                return;
            }

            // Direction-based visibility (only show labels facing camera)
            const labelWorldPos = new THREE.Vector3();
            label.getWorldPosition(labelWorldPos);

            const cameraToLabel = labelWorldPos.clone().sub(this.camera.position).normalize();
            const labelToCenter = labelWorldPos.clone().normalize();

            // Dot product: positive means label is on visible hemisphere
            const dotProduct = cameraToLabel.dot(labelToCenter);
            label.visible = dotProduct > 0.2; // Threshold to hide labels near edge
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
                const baseScale = 0.1 * (label.userData.fontSize / 24);
                label.scale.set(
                    baseScale * cfg.scale,
                    baseScale * 0.5 * cfg.scale,
                    1
                );
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

            const currentScale = label.scale.x / (0.1 * (label.userData.fontSize / 24));
            const hasCustomScale = Math.abs(currentScale - defaultScale) > 0.01;

            if (hasCustomPosition || hasCustomScale) {
                config[countryName] = {
                    position: {
                        x: label.position.x,
                        y: label.position.y,
                        z: label.position.z
                    },
                    scale: currentScale,
                    fontSize: label.userData.fontSize
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
        const baseScale = 0.1 * (label.userData.fontSize / 24);
        label.scale.set(baseScale, baseScale * 0.5, 1);

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
