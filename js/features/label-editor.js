/**
 * Label editor — select a country label, drag to reposition, wheel/long-press/
 * double-tap to resize, fine-tune via the modal sliders, and save the result to
 * label-config.json.
 *
 * Owns the editor state (edit-mode flag, selected label, selection helper, and
 * the working label config). The pointer-event choreography (drag start/end,
 * long-press, double-tap) lives in the pointer handlers, which call this class's
 * methods. labelDefaults are read from the injected LabelManager.
 */

import { elements, show, hide, addClass, removeClass, setText } from '../utils/dom.js';

import * as THREE from 'three';

export class LabelEditor {
    constructor({ scene, camera, controls, labelManager, updateLabelVisibility } = {}) {
        this.scene = scene;
        this.camera = camera;
        this.controls = controls;
        this.labelManager = labelManager;
        this.updateLabelVisibility = updateLabelVisibility || (() => {});

        this.editMode = false;
        this.selectedLabel = null;
        this.selectionHelper = null; // green wireframe around the selected label
        this.config = {};            // custom positions / font sizes, keyed by name
    }

    isActive() { return this.editMode; }
    getSelected() { return this.selectedLabel; }

    _labels() { return this.labelManager ? this.labelManager.getLabels() : []; }
    _defaults() { return this.labelManager ? this.labelManager.labelDefaults : {}; }

    toggle() {
        this.editMode = !this.editMode;

        const editBtn = elements.get('edit-mode-btn');
        const saveBtn = elements.get('save-config-btn');

        if (this.editMode) {
            console.log('Edit mode ENABLED - Click labels to select, drag to move, wheel to resize');
            this._labels().forEach(label => label.visible = true);
            this.controls.enableRotate = true; // still allow rotation when not dragging
            addClass(editBtn, 'active');
            setText(editBtn, 'Exit Edit Mode');
            show(saveBtn);
        } else {
            console.log('Edit mode DISABLED');
            if (this.selectedLabel) this.deselect();
            this.updateLabelVisibility();
            removeClass(editBtn, 'active');
            setText(editBtn, 'Edit Labels');
            hide(saveBtn);
        }
    }

    selectLabel(label) {
        if (this.selectedLabel) this.deselect();
        this.selectedLabel = label;

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

        this.selectionHelper.position.copy(label.position);
        this.selectionHelper.quaternion.copy(label.quaternion);
        this.selectionHelper.visible = true;

        show(elements.get('fine-tune-btn'));
        console.log(`Selected: ${label.userData.countryName}`);
    }

    deselect() {
        if (this.selectionHelper) this.selectionHelper.visible = false;
        this.selectedLabel = null;
        hide(elements.get('fine-tune-btn'));
    }

    /** Scale the selected label by `multiplier` (clamped), persisting to config. */
    resizeSelected(multiplier) {
        if (!this.selectedLabel) return;

        const countryName = this.selectedLabel.userData.countryName;
        if (!this.config[countryName]) this.config[countryName] = {};

        let currentFontSize = this.config[countryName].fontSize || 32;
        let currentScale = this.config[countryName].scale || this.selectedLabel.scale.x;

        currentScale *= multiplier;
        currentFontSize *= multiplier;

        currentScale = Math.max(0.1, Math.min(3.0, currentScale));
        currentFontSize = Math.max(8, Math.min(128, currentFontSize));

        this.selectedLabel.scale.set(currentScale, currentScale, currentScale);
        if (this.selectionHelper) {
            this.selectionHelper.scale.set(currentScale, currentScale, currentScale);
        }

        this.config[countryName].fontSize = currentFontSize;
        this.config[countryName].scale = currentScale;
        console.log(`${countryName}: fontSize=${currentFontSize.toFixed(1)}, scale=${currentScale.toFixed(2)}`);
    }

    /** Does this raycaster hit the selected label (or its helper)? */
    canStartDragAt(raycaster) {
        if (!this.editMode || !this.selectedLabel) return false;
        const targets = [this.selectedLabel];
        if (this.selectionHelper && this.selectionHelper.visible) targets.push(this.selectionHelper);
        return raycaster.intersectObjects(targets).length > 0;
    }

    /** Move the selected label to a point on the label sphere, persisting position. */
    dragSelectedTo(point) {
        const label = this.selectedLabel;
        if (!label) return;

        label.position.copy(point);
        label.lookAt(point.clone().multiplyScalar(2));

        if (this.selectionHelper) {
            this.selectionHelper.position.copy(point);
            this.selectionHelper.quaternion.copy(label.quaternion);
        }

        const countryName = label.userData.countryName;
        if (!this.config[countryName]) this.config[countryName] = {};
        this.config[countryName].position = { x: point.x, y: point.y, z: point.z };
    }

    /** Mouse-wheel resize of the selected label (desktop). */
    onWheel(event) {
        if (!this.editMode || !this.selectedLabel) return;
        event.preventDefault();
        // Stop OrbitControls (and other wheel listeners) from also handling this tick.
        event.stopImmediatePropagation();
        this.resizeSelected(event.deltaY > 0 ? 0.95 : 1.05);
    }

    /** Edit-mode click: select the label under the raycaster, if any. */
    trySelectAt(raycaster) {
        const hits = raycaster.intersectObjects(this._labels());
        if (hits.length > 0) {
            this.selectLabel(hits[0].object);
            return true;
        }
        return false;
    }

    openModal() {
        if (!this.selectedLabel) return;

        const countryName = this.selectedLabel.userData.countryName;
        setText(elements.get('label-editor-title'), `Edit Label: ${countryName}`);

        const currentPos = this.selectedLabel.position.clone();
        const defaultPos = this._defaults()[countryName].position;

        const offsetX = currentPos.x - defaultPos.x;
        const offsetY = currentPos.y - defaultPos.y;
        const offsetZ = currentPos.z - defaultPos.z;
        const currentScale = this.selectedLabel.scale.x;

        elements.get('label-offset-x').value = offsetX;
        elements.get('label-offset-y').value = offsetY;
        elements.get('label-offset-z').value = offsetZ;
        elements.get('label-scale').value = currentScale;

        setText(elements.get('label-offset-x-value'), offsetX.toFixed(2));
        setText(elements.get('label-offset-y-value'), offsetY.toFixed(2));
        setText(elements.get('label-offset-z-value'), offsetZ.toFixed(2));
        setText(elements.get('label-scale-value'), currentScale.toFixed(1));

        show(elements.get('label-editor-modal'));
    }

    closeModal() {
        hide(elements.get('label-editor-modal'));
    }

    onOffsetChange() {
        if (!this.selectedLabel) return;

        const countryName = this.selectedLabel.userData.countryName;
        const defaultPos = this._defaults()[countryName].position;

        const offsetX = parseFloat(elements.get('label-offset-x').value);
        const offsetY = parseFloat(elements.get('label-offset-y').value);
        const offsetZ = parseFloat(elements.get('label-offset-z').value);

        setText(elements.get('label-offset-x-value'), offsetX.toFixed(2));
        setText(elements.get('label-offset-y-value'), offsetY.toFixed(2));
        setText(elements.get('label-offset-z-value'), offsetZ.toFixed(2));

        const newPos = new THREE.Vector3(
            defaultPos.x + offsetX,
            defaultPos.y + offsetY,
            defaultPos.z + offsetZ
        );

        this.selectedLabel.position.copy(newPos);
        this.selectedLabel.lookAt(newPos.clone().multiplyScalar(2));

        if (this.selectionHelper) {
            this.selectionHelper.position.copy(newPos);
            this.selectionHelper.quaternion.copy(this.selectedLabel.quaternion);
        }

        if (!this.config[countryName]) this.config[countryName] = {};
        this.config[countryName].position = { x: newPos.x, y: newPos.y, z: newPos.z };
    }

    onScaleChange() {
        if (!this.selectedLabel) return;

        const countryName = this.selectedLabel.userData.countryName;
        const scale = parseFloat(elements.get('label-scale').value);

        setText(elements.get('label-scale-value'), scale.toFixed(1));

        this.selectedLabel.scale.set(scale, scale, scale);
        if (this.selectionHelper) {
            this.selectionHelper.scale.set(scale, scale, scale);
        }

        if (!this.config[countryName]) this.config[countryName] = {};
        this.config[countryName].scale = scale;
        this.config[countryName].fontSize = 32 * scale; // proportional font size
    }

    resetSelected() {
        if (!this.selectedLabel) return;

        const countryName = this.selectedLabel.userData.countryName;
        const defaults = this._defaults()[countryName];

        this.selectedLabel.position.copy(defaults.position);
        this.selectedLabel.lookAt(defaults.position.clone().multiplyScalar(2));
        this.selectedLabel.scale.set(1, 1, 1);

        if (this.selectionHelper) {
            this.selectionHelper.position.copy(defaults.position);
            this.selectionHelper.quaternion.copy(this.selectedLabel.quaternion);
            this.selectionHelper.scale.set(1, 1, 1);
        }

        delete this.config[countryName];

        elements.get('label-offset-x').value = 0;
        elements.get('label-offset-y').value = 0;
        elements.get('label-offset-z').value = 0;
        elements.get('label-scale').value = 1.0;

        setText(elements.get('label-offset-x-value'), '0.00');
        setText(elements.get('label-offset-y-value'), '0.00');
        setText(elements.get('label-offset-z-value'), '0.00');
        setText(elements.get('label-scale-value'), '1.0');

        console.log(`${countryName} reset to default`);
        if (navigator.vibrate) navigator.vibrate(50);
    }

    /** Fetch label-config.json (if present) and apply it. */
    loadConfig() {
        // Cache-buster: the preview host caches .json aggressively, so a fresh
        // query string guarantees each load fetches the latest config.
        fetch('label-config.json?v=' + Date.now())
            .then(response => {
                if (!response.ok) throw new Error('No saved config found');
                return response.json();
            })
            .then(config => {
                this.config = config;
                console.log('Loaded label configuration for', Object.keys(this.config).length, 'countries');
                this.applyConfig();
            })
            .catch(() => {
                console.log('No label config file found, using defaults');
            });
    }

    applyConfig() {
        this._labels().forEach(label => {
            const config = this.config[label.userData.countryName];
            if (!config) return;
            if (config.position) {
                label.position.set(config.position.x, config.position.y, config.position.z);
                label.lookAt(label.position.clone().multiplyScalar(2));
            }
            if (config.scale) {
                label.scale.set(config.scale, config.scale, config.scale);
            }
        });
    }

    saveConfig() {
        const dataStr = JSON.stringify(this.config, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = 'label-config.json';
        link.click();

        URL.revokeObjectURL(url);
        console.log('Label configuration saved! Countries configured:', Object.keys(this.config).length);
    }
}
