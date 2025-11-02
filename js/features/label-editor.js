/**
 * Label Editor Module
 * Handles interactive label editing with position/scale adjustments and config persistence
 */

// Access global THREE.js library
const THREE = window.THREE;

export class LabelEditor {
    constructor(options = {}) {
        this.elements = options.elements;
        this.labelManager = options.labelManager;
        this.scene = options.scene;
        this.camera = options.camera;
        this.controls = options.controls;
        this.raycaster = options.raycaster;
        this.mouse = options.mouse;
        this.updateLabelVisibility = options.updateLabelVisibility;

        // Label editor state
        this.editMode = false;
        this.selectedLabel = null;
        this.selectionHelper = null;
        this.labelConfig = {};
        this.labelDefaults = {};
        this.isDraggingLabel = false;
        this.longPressTimer = null;
        this.lastTapTime = 0;

        // Pointer tracking
        this.mouseDownPos = { x: 0, y: 0 };
        this.longPressTriggered = false;
    }

    /**
     * Initialize label editor event listeners
     */
    init() {
        // Button event listeners
        this.elements.get('edit-mode-btn').addEventListener('click', () => this.toggle());
        this.elements.get('save-config-btn').addEventListener('click', () => this.saveConfig());
        this.elements.get('fine-tune-btn').addEventListener('click', () => this.openModal());
        this.elements.get('label-editor-close-btn').addEventListener('click', () => this.closeModal());
        this.elements.get('label-editor-overlay').addEventListener('click', () => this.closeModal());
        this.elements.get('label-reset-btn').addEventListener('click', () => this.resetToDefault());

        // Slider event listeners
        this.elements.get('label-offset-x').addEventListener('input', (e) => this.onOffsetChange(e));
        this.elements.get('label-offset-y').addEventListener('input', (e) => this.onOffsetChange(e));
        this.elements.get('label-offset-z').addEventListener('input', (e) => this.onOffsetChange(e));
        this.elements.get('label-scale').addEventListener('input', (e) => this.onScaleChange(e));

        // Wheel event for label resizing
        window.addEventListener('wheel', (e) => this.onWheelResize(e), { passive: false });

        console.log('LabelEditor initialized');
    }

    /**
     * Toggle edit mode
     */
    toggle() {
        this.editMode = !this.editMode;

        const editBtn = this.elements.get('edit-mode-btn');
        const saveBtn = this.elements.get('save-config-btn');

        if (this.editMode) {
            console.log('Edit mode ENABLED - Click labels to select, drag to move, wheel to resize');

            // Make all labels visible for editing
            const countryLabels = this.labelManager.getLabels();
            countryLabels.forEach(label => label.visible = true);

            // Still allow rotation when not dragging
            this.controls.enableRotate = true;

            // Update UI
            editBtn.classList.add('active');
            editBtn.textContent = 'Exit Edit Mode';
            saveBtn.style.display = 'block';
        } else {
            console.log('Edit mode DISABLED');

            // Deselect any selected label
            if (this.selectedLabel) {
                this.deselect();
            }

            // Restore normal visibility
            if (this.updateLabelVisibility) {
                this.updateLabelVisibility();
            }

            // Update UI
            editBtn.classList.remove('active');
            editBtn.textContent = 'Edit Labels';
            saveBtn.style.display = 'none';
        }
    }

    /**
     * Select a label in edit mode
     * @param {THREE.Mesh} label - Label to select
     */
    select(label) {
        // Deselect previous label
        if (this.selectedLabel) {
            this.deselect();
        }

        this.selectedLabel = label;

        // Create visual indicator (a wireframe box around the label)
        if (!this.selectionHelper) {
            const helperGeometry = new THREE.PlaneGeometry(
                label.geometry.parameters.width * 1.1,
                label.geometry.parameters.height * 1.1
            );
            const helperMaterial = new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                wireframe: true,
                transparent: true,
                opacity: 0.8,
                depthTest: false,
                depthWrite: false
            });
            this.selectionHelper = new THREE.Mesh(helperGeometry, helperMaterial);
            this.scene.add(this.selectionHelper);
        }

        // Position helper at label
        this.selectionHelper.position.copy(label.position);
        this.selectionHelper.quaternion.copy(label.quaternion);
        this.selectionHelper.visible = true;

        // Show fine tune button
        this.elements.get('fine-tune-btn').style.display = 'block';

        console.log(`Selected: ${label.userData.countryName}`);
    }

    /**
     * Deselect current label
     */
    deselect() {
        if (this.selectionHelper) {
            this.selectionHelper.visible = false;
        }
        this.selectedLabel = null;

        // Hide fine tune button
        this.elements.get('fine-tune-btn').style.display = 'none';
    }

    /**
     * Resize selected label by a multiplier
     * @param {number} multiplier - Scale multiplier
     */
    resize(multiplier) {
        if (!this.selectedLabel) return;

        const countryName = this.selectedLabel.userData.countryName;
        if (!this.labelConfig[countryName]) {
            this.labelConfig[countryName] = {};
        }

        // Get current font size or default
        let currentFontSize = this.labelConfig[countryName].fontSize || 32;
        let currentScale = this.labelConfig[countryName].scale || this.selectedLabel.scale.x;

        // Apply multiplier
        currentScale *= multiplier;
        currentFontSize *= multiplier;

        // Clamp values
        currentScale = Math.max(0.1, Math.min(3.0, currentScale));
        currentFontSize = Math.max(8, Math.min(128, currentFontSize));

        // Update label scale
        this.selectedLabel.scale.set(currentScale, currentScale, currentScale);

        // Update selection helper scale
        if (this.selectionHelper) {
            this.selectionHelper.scale.set(currentScale, currentScale, currentScale);
        }

        // Store in config
        this.labelConfig[countryName].fontSize = currentFontSize;
        this.labelConfig[countryName].scale = currentScale;

        console.log(`${countryName}: fontSize=${currentFontSize.toFixed(1)}, scale=${currentScale.toFixed(2)}`);
    }

    /**
     * Handle wheel event for label resizing
     * @param {WheelEvent} event - Wheel event
     */
    onWheelResize(event) {
        if (this.editMode && this.selectedLabel) {
            event.preventDefault();

            const scaleDelta = event.deltaY > 0 ? 0.95 : 1.05;
            this.resize(scaleDelta);
        }
    }

    /**
     * Save label configuration to JSON file
     */
    saveConfig() {
        const dataStr = JSON.stringify(this.labelConfig, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'label-config.json';
        link.click();

        URL.revokeObjectURL(url);
        console.log('Label configuration saved! Countries configured:', Object.keys(this.labelConfig).length);
    }

    /**
     * Load label configuration from JSON file
     */
    async loadConfig() {
        try {
            const response = await fetch('label-config.json');
            if (!response.ok) {
                throw new Error('No saved config found');
            }
            this.labelConfig = await response.json();
            console.log('Loaded label configuration for', Object.keys(this.labelConfig).length, 'countries');

            // Apply loaded config to existing labels
            this.applyConfig();
        } catch (err) {
            console.log('No label config file found, using defaults');
        }
    }

    /**
     * Apply saved configuration to labels
     */
    applyConfig() {
        const countryLabels = this.labelManager.getLabels();

        countryLabels.forEach(label => {
            const countryName = label.userData.countryName;
            const config = this.labelConfig[countryName];

            if (config) {
                // Apply custom position
                if (config.position) {
                    label.position.set(config.position.x, config.position.y, config.position.z);
                    label.lookAt(label.position.clone().multiplyScalar(2));
                }

                // Apply custom scale
                if (config.scale) {
                    label.scale.set(config.scale, config.scale, config.scale);
                }
            }
        });
    }

    /**
     * Open label editor modal for selected label
     */
    openModal() {
        if (!this.selectedLabel) return;

        const countryName = this.selectedLabel.userData.countryName;
        const modal = this.elements.get('label-editor-modal');
        const title = this.elements.get('label-editor-title');

        title.textContent = `Edit Label: ${countryName}`;

        // Get current position (or default)
        const currentPos = this.selectedLabel.position.clone();
        const defaultPos = this.labelDefaults[countryName].position;

        // Calculate offsets from default
        const offsetX = currentPos.x - defaultPos.x;
        const offsetY = currentPos.y - defaultPos.y;
        const offsetZ = currentPos.z - defaultPos.z;

        // Get current scale
        const currentScale = this.selectedLabel.scale.x;

        // Update slider values
        this.elements.get('label-offset-x').value = offsetX;
        this.elements.get('label-offset-y').value = offsetY;
        this.elements.get('label-offset-z').value = offsetZ;
        this.elements.get('label-scale').value = currentScale;

        // Update value displays
        this.elements.get('label-offset-x-value').textContent = offsetX.toFixed(2);
        this.elements.get('label-offset-y-value').textContent = offsetY.toFixed(2);
        this.elements.get('label-offset-z-value').textContent = offsetZ.toFixed(2);
        this.elements.get('label-scale-value').textContent = currentScale.toFixed(1);

        modal.style.display = 'flex';
    }

    /**
     * Close label editor modal
     */
    closeModal() {
        const modal = this.elements.get('label-editor-modal');
        modal.style.display = 'none';
    }

    /**
     * Handle position offset changes from sliders
     * @param {Event} event - Input event
     */
    onOffsetChange(event) {
        if (!this.selectedLabel) return;

        const countryName = this.selectedLabel.userData.countryName;
        const defaultPos = this.labelDefaults[countryName].position;

        // Get offsets from sliders
        const offsetX = parseFloat(this.elements.get('label-offset-x').value);
        const offsetY = parseFloat(this.elements.get('label-offset-y').value);
        const offsetZ = parseFloat(this.elements.get('label-offset-z').value);

        // Update value displays
        this.elements.get('label-offset-x-value').textContent = offsetX.toFixed(2);
        this.elements.get('label-offset-y-value').textContent = offsetY.toFixed(2);
        this.elements.get('label-offset-z-value').textContent = offsetZ.toFixed(2);

        // Apply new position
        const newPos = new THREE.Vector3(
            defaultPos.x + offsetX,
            defaultPos.y + offsetY,
            defaultPos.z + offsetZ
        );

        this.selectedLabel.position.copy(newPos);
        this.selectedLabel.lookAt(newPos.clone().multiplyScalar(2));

        // Update selection helper
        if (this.selectionHelper) {
            this.selectionHelper.position.copy(newPos);
            this.selectionHelper.quaternion.copy(this.selectedLabel.quaternion);
        }

        // Store in config
        if (!this.labelConfig[countryName]) {
            this.labelConfig[countryName] = {};
        }
        this.labelConfig[countryName].position = {
            x: newPos.x,
            y: newPos.y,
            z: newPos.z
        };
    }

    /**
     * Handle scale changes from slider
     * @param {Event} event - Input event
     */
    onScaleChange(event) {
        if (!this.selectedLabel) return;

        const countryName = this.selectedLabel.userData.countryName;
        const scale = parseFloat(this.elements.get('label-scale').value);

        // Update value display
        this.elements.get('label-scale-value').textContent = scale.toFixed(1);

        // Apply scale
        this.selectedLabel.scale.set(scale, scale, scale);

        // Update selection helper
        if (this.selectionHelper) {
            this.selectionHelper.scale.set(scale, scale, scale);
        }

        // Store in config
        if (!this.labelConfig[countryName]) {
            this.labelConfig[countryName] = {};
        }
        this.labelConfig[countryName].scale = scale;
        this.labelConfig[countryName].fontSize = 32 * scale; // Proportional font size
    }

    /**
     * Reset label to default position and scale
     */
    resetToDefault() {
        if (!this.selectedLabel) return;

        const countryName = this.selectedLabel.userData.countryName;
        const defaults = this.labelDefaults[countryName];

        // Reset position
        this.selectedLabel.position.copy(defaults.position);
        this.selectedLabel.lookAt(defaults.position.clone().multiplyScalar(2));

        // Reset scale
        this.selectedLabel.scale.set(1, 1, 1);

        // Update selection helper
        if (this.selectionHelper) {
            this.selectionHelper.position.copy(defaults.position);
            this.selectionHelper.quaternion.copy(this.selectedLabel.quaternion);
            this.selectionHelper.scale.set(1, 1, 1);
        }

        // Remove from config
        delete this.labelConfig[countryName];

        // Update sliders
        this.elements.get('label-offset-x').value = 0;
        this.elements.get('label-offset-y').value = 0;
        this.elements.get('label-offset-z').value = 0;
        this.elements.get('label-scale').value = 1.0;

        this.elements.get('label-offset-x-value').textContent = '0.00';
        this.elements.get('label-offset-y-value').textContent = '0.00';
        this.elements.get('label-offset-z-value').textContent = '0.00';
        this.elements.get('label-scale-value').textContent = '1.0';

        console.log(`${countryName} reset to default`);

        // Provide haptic feedback if available
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
    }

    /**
     * Store default label positions (called after labels are created)
     * @param {Object} defaults - Map of country names to default positions
     */
    setDefaults(defaults) {
        this.labelDefaults = defaults;
    }

    /**
     * Handle pointer down for label dragging
     * @param {PointerEvent} event - Pointer event
     * @param {THREE.Vector2} mouseDownPos - Mouse down position
     * @returns {boolean} True if label dragging started
     */
    onPointerDown(event, mouseDownPos) {
        this.mouseDownPos = mouseDownPos;
        this.longPressTriggered = false;

        // Edit mode: Start dragging selected label if clicked on it or its helper
        if (this.editMode && this.selectedLabel) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const objectsToCheck = [this.selectedLabel];
            if (this.selectionHelper && this.selectionHelper.visible) {
                objectsToCheck.push(this.selectionHelper);
            }
            const labelIntersects = this.raycaster.intersectObjects(objectsToCheck);

            if (labelIntersects.length > 0) {
                this.isDraggingLabel = true;
                this.controls.enableRotate = false; // Disable rotation while dragging label

                // Start long-press timer for resize down
                this.longPressTimer = setTimeout(() => {
                    if (this.selectedLabel) {
                        this.longPressTriggered = true;
                        this.resize(0.9); // Decrease size by 10%
                        // Provide haptic feedback if available
                        if (navigator.vibrate) {
                            navigator.vibrate(50);
                        }
                    }
                }, 500); // 500ms for long press

                return true;
            }
        }

        return false;
    }

    /**
     * Handle pointer up for label selection and double-tap resize
     * @param {PointerEvent} event - Pointer event
     * @returns {boolean} True if event was handled by label editor
     */
    onPointerUp(event) {
        // Clear long press timer
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }

        // Handle label dragging end
        if (this.isDraggingLabel) {
            this.isDraggingLabel = false;
            this.controls.enableRotate = true;

            // If long press was triggered, don't process as tap
            if (this.longPressTriggered) {
                this.longPressTriggered = false;
                return true;
            }

            // Check if this was just a quick tap (not a drag)
            const deltaX = Math.abs(event.clientX - this.mouseDownPos.x);
            const deltaY = Math.abs(event.clientY - this.mouseDownPos.y);
            if (deltaX < 5 && deltaY < 5 && this.selectedLabel) {
                // Detect double-tap
                const currentTime = Date.now();
                const timeSinceLastTap = currentTime - this.lastTapTime;

                if (timeSinceLastTap < 300) { // Double tap within 300ms
                    this.resize(1.1); // Increase size by 10%
                    // Provide haptic feedback if available
                    if (navigator.vibrate) {
                        navigator.vibrate(50);
                    }
                    this.lastTapTime = 0; // Reset to prevent triple-tap
                } else {
                    this.lastTapTime = currentTime;
                }
            }
            return true;
        }

        // Edit mode: Check for label clicks
        if (this.editMode) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const countryLabels = this.labelManager.getLabels();
            const labelIntersects = this.raycaster.intersectObjects(countryLabels);

            if (labelIntersects.length > 0) {
                this.select(labelIntersects[0].object);
                return true; // Event handled
            }
        }

        return false; // Event not handled
    }

    /**
     * Handle pointer move for label dragging
     * @param {PointerEvent} event - Pointer event
     * @returns {boolean} True if label is being dragged
     */
    onPointerMove(event) {
        // Handle label dragging in edit mode
        if (this.isDraggingLabel && this.selectedLabel) {
            // Project mouse position onto sphere surface
            this.raycaster.setFromCamera(this.mouse, this.camera);

            // Create a sphere to intersect with (at radius 1.02 where labels are)
            const sphereGeometry = new THREE.SphereGeometry(1.02, 32, 32);
            const sphereMesh = new THREE.Mesh(sphereGeometry);
            const sphereIntersects = this.raycaster.intersectObject(sphereMesh);

            if (sphereIntersects.length > 0) {
                const newPosition = sphereIntersects[0].point;
                this.selectedLabel.position.copy(newPosition);

                // Update label orientation to face outward
                this.selectedLabel.lookAt(newPosition.clone().multiplyScalar(2));

                // Update selection helper position
                if (this.selectionHelper) {
                    this.selectionHelper.position.copy(newPosition);
                    this.selectionHelper.quaternion.copy(this.selectedLabel.quaternion);
                }

                // Store the new position in config
                const countryName = this.selectedLabel.userData.countryName;
                if (!this.labelConfig[countryName]) {
                    this.labelConfig[countryName] = {};
                }
                this.labelConfig[countryName].position = {
                    x: newPosition.x,
                    y: newPosition.y,
                    z: newPosition.z
                };
            }

            return true; // Don't process other mouse events while dragging
        }

        return false;
    }

    /**
     * Check if edit mode is active
     * @returns {boolean}
     */
    isActive() {
        return this.editMode;
    }

    /**
     * Check if currently dragging a label
     * @returns {boolean}
     */
    isDragging() {
        return this.isDraggingLabel;
    }

    /**
     * Get label configuration
     * @returns {Object}
     */
    getConfig() {
        return this.labelConfig;
    }

    /**
     * Get label defaults
     * @returns {Object}
     */
    getDefaults() {
        return this.labelDefaults;
    }
}
