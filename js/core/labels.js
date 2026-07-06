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
        this.currentHighlight = null;
        // Master switch (settings panel): when true, every country name label is
        // kept hidden regardless of zoom/facing. Used to capture clean globe
        // screenshots. updateVisibility() honours it each frame.
        this.labelsHidden = false;

        // Reusable scratch vector for updateVisibility() — pooled so the per-frame
        // visibility pass doesn't allocate a Vector3 every call.
        this._cameraDirection = new THREE.Vector3();

        // Constants
        this.ZOOM_FAR = 6.0;      // Show only large country labels
        this.ZOOM_MEDIUM = 3.5;   // Show large + medium labels
        this.ZOOM_CLOSE = 2.2;    // Show all labels

        // Hide every label when the camera is farther than this — labels only appear when zoomed in.
        this.LABEL_HIDE_ABOVE = 1.6;

        // Only show labels within this angular distance of the screen-center point on the globe.
        // Larger = more labels visible at the edges (where they rotate ugly); smaller = tighter cluster.
        this.LABEL_VISIBILITY_ANGLE_DEG = 12;

        // Labels appear at focusZoom × this margin, i.e. slightly farther out than
        // the country's focus distance. Without the margin a label's threshold sits
        // exactly at the settle distance, so per-frame jitter at rest flips it
        // on/off (thrashing). 1.06 keeps the label comfortably on once focused.
        this.LABEL_APPEAR_MARGIN = 1.06;
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

            // Create material with transparency.
            // DoubleSide: empirically the only setting that renders text right-side-up here.
            // FrontSide produced mirror-flipped + upside-down text in this configuration, which
            // means the plane's effective front-face is on the inward side of the sphere.
            const labelMaterial = new THREE.MeshBasicMaterial({
                map: labelTexture,
                transparent: true,
                opacity: 1.0,
                side: THREE.DoubleSide,
                depthTest: false,
                depthWrite: false,
                // Discards near-transparent fragments. Low (0.01) so labels fade smoothly under
                // the per-frame opacity lerp instead of eroding pixel-by-pixel as opacity drops.
                alphaTest: 0.01
            });

            // Create plane geometry with size based on country category
            const labelGeometry = new THREE.PlaneGeometry(labelWidth, labelHeight);
            const labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);

            // Position at centroid, just above the country mesh surface
            // (radius 1.0008). 1.005 keeps a thin gap to avoid sub-pixel
            // intersection with the mesh while making the parallax between
            // label and surface much less noticeable at close zoom.
            const labelPosition = centroid.clone().multiplyScalar(1.005);
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

        // Font-load race guard. The synchronous pass above can run before the browser's
        // FontFaceSet has resolved Arial — when that happens, fillText produces garbage-textured
        // rectangles for some labels (the intermittent "corrupted background" bug, cleared by
        // a reload that warms the cache). Force-loading the font and then repainting once
        // guarantees every texture is drawn with a fully resolved font.
        if (typeof document !== 'undefined' && document.fonts && document.fonts.load) {
            document.fonts.load('32px Arial').then(() => this.repaintAllLabels());
        }
    }

    /**
     * Recreate every label's canvas texture in place. Used by the font-load race guard to
     * fix textures that may have been drawn before Arial was resolved by the browser.
     * Highlight state is preserved automatically because it lives on material.color, not
     * on the texture itself.
     */
    repaintAllLabels() {
        this.labels.forEach(label => {
            const oldTexture = label.material.map;
            const newTexture = this.createTextLabel(label.userData.countryName);
            label.material.map = newTexture;
            label.material.needsUpdate = true;
            if (oldTexture) oldTexture.dispose();
        });
    }

    /**
     * Create a text label texture. Text is always drawn white; the actual displayed colour
     * is produced by tinting through material.color (white for default, black for highlighted).
     * Keeps the texture immutable and avoids per-highlight texture swaps.
     * @param {string} text - Label text
     * @returns {THREE.Texture}
     */
    createTextLabel(text) {
        // Size MUST be set before getContext so the context binds to the final dimensions;
        // setting width/height afterwards re-initialises canvas state and can leave the GPU
        // upload racing with uninitialised pixel memory.
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const context = canvas.getContext('2d');

        // Explicit clear so the texture upload never sees garbage in transparent regions.
        context.clearRect(0, 0, canvas.width, canvas.height);

        context.font = '32px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        context.fillStyle = '#FFFFFF';
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        // Disable mipmaps: averaging antialiased-text alpha across mip levels otherwise
        // produces visible rectangular halos / "random pixel" blocks at distance.
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;

        return texture;
    }

    /**
     * Switch which label is rendered in highlighted (mid-gray) form.
     * Pass null to clear. Repaints the canvas textures of the affected labels.
     * @param {string|null} name
     */
    setHighlight(name) {
        if (name === this.currentHighlight) return;

        const previous = this.currentHighlight;
        this.currentHighlight = name || null;

        // Toggle material.color rather than swapping textures. The texture has white text;
        // tinting it mid-gray via material.color produces the highlighted look — readable
        // against both the dark ocean and the white highlighted country fill.
        const setLabelColor = (countryName, hex) => {
            if (!countryName) return;
            const label = this.labels.find(l => l.userData.countryName === countryName);
            if (label) label.material.color.setHex(hex);
        };

        setLabelColor(previous, 0xFFFFFF);
        setLabelColor(this.currentHighlight, 0x808080);
    }

    /**
     * Stamp each label with its country's focus-zoom distance. A label is shown
     * when the camera is at or inside that distance (see updateVisibility), so the
     * focus zoom doubles as the label's appearance threshold. Re-callable after
     * overrides load or a manual reclassification.
     * @param {import('./focus-zoom.js').FocusZoomRegistry} registry
     */
    applyFocusZoom(registry) {
        if (!registry) return;
        this.labels.forEach(label => {
            // Pad the threshold so the label appears a touch farther out than the
            // focus distance — prevents on/off thrashing at the settle point.
            label.userData.focusZoom =
                registry.distanceOf(label.userData.countryName) * this.LABEL_APPEAR_MARGIN;
        });
    }

    /**
     * Update label visibility based on camera distance and direction.
     * Each label has a target opacity (1 or 0) and material.opacity is lerped toward it,
     * so transitions fade smoothly instead of popping.
     *
     * A label appears once the camera is at or inside that country's focus-zoom
     * distance (userData.focusZoom) — so it's guaranteed visible at the focus zoom
     * and every closer zoom — and only while it sits within the center cone.
     */
    updateVisibility() {
        const quizActive = state.get('quiz.active');
        const cameraDistance = this.camera.position.length();

        const cameraDirection = this._cameraDirection;
        this.camera.getWorldDirection(cameraDirection);

        // labelPosition (outward) and cameraDirection (into globe) are antiparallel at center,
        // so dot = -cos(angle). Cutoff at -cos(LABEL_VISIBILITY_ANGLE_DEG).
        const visibilityCutoff = -Math.cos(this.LABEL_VISIBILITY_ANGLE_DEG * Math.PI / 180);

        // Per-frame fade step. ~0.08 gives a ~200ms fade at 60 fps. Increase for faster, decrease for slower.
        const fadeStep = 0.08;

        this.labels.forEach(label => {
            // Default focus zoom for any label missing a classification.
            const focusZoom = label.userData.focusZoom || 1.28;
            let shouldShow = !this.labelsHidden && !quizActive && cameraDistance <= focusZoom;

            if (shouldShow) {
                const dotProduct = label.position.clone().normalize().dot(cameraDirection);
                shouldShow = dotProduct < visibilityCutoff;
            }

            const target = shouldShow ? 1 : 0;
            const current = label.material.opacity;
            const delta = target - current;
            label.material.opacity = Math.abs(delta) <= fadeStep
                ? target
                : current + Math.sign(delta) * fadeStep;

            // Skip drawing labels that have fully faded out.
            label.visible = label.material.opacity > 0.01;
        });
    }

    /**
     * Master show/hide for all country name labels (settings panel). Visibility
     * is recomputed each frame in updateVisibility(); this just flips the flag it
     * reads, so labels fade out/in on the next frames.
     * @param {boolean} visible
     */
    setLabelsVisible(visible) {
        this.labelsHidden = !visible;
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
