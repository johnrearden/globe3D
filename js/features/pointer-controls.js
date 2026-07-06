/**
 * Pointer controls — the central pointer dispatch for the globe canvas.
 *
 * Owns the pointer-interaction state (mouse, raycaster, drag flags, long-press /
 * double-tap timers) and routes pointerdown/move/up to: label-drag and selection
 * (LabelEditor), color/zoom edit-mode picks, click-quiz answers, and ordinary
 * country selection (highlight + focus + flag panel). All collaborators are
 * injected; nothing here is globe-specific beyond the injected managers.
 */

import { track } from './analytics.js';

const THREE = window.THREE;

export class PointerControls {
    constructor(deps = {}) {
        this.camera = deps.camera;
        this.controls = deps.controls;
        this.renderer = deps.renderer;
        this.globeManager = deps.globeManager;
        this.labelManager = deps.labelManager;
        this.flagRenderer = deps.flagRenderer;
        this.smallCountryIndicator = deps.smallCountryIndicator;
        this.labelEditor = deps.labelEditor;
        this.colorEditor = deps.colorEditor;
        this.zoomEditor = deps.zoomEditor;
        this.clickQuiz = deps.clickQuiz;
        this.dailyQuiz = deps.dailyQuiz;
        this.rotateGlobeToCountry = deps.rotateGlobeToCountry || (() => {});
        this.resetIdleTimer = deps.resetIdleTimer || (() => {});
        this.onFlick = deps.onFlick || (() => {});       // (velX, velY) px/ms at release
        this.cancelFlick = deps.cancelFlick || (() => {});
        this.countryData = deps.countryData;
        this.countryToISO = deps.countryToISO;
        this.state = deps.state;

        // Pointer-interaction state.
        this.mouse = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        this.mouseDownPos = new THREE.Vector2();
        this.isDragging = false;          // orbit drag (pointer moved past threshold)
        this.isDraggingLabel = false;     // dragging a selected label in edit mode
        this.longPressTimer = null;
        this.longPressTriggered = false;
        this.lastTapTime = 0;
        this.selectedCountry = null;
        // Cached invisible sphere at label radius (1.005) for label-drag raycasting.
        this.dragHitSphere = new THREE.Mesh(new THREE.SphereGeometry(1.005, 32, 32));

        // Orbit-drag velocity sampling for release momentum (flick).
        this._velX = 0;        // smoothed px/ms
        this._velY = 0;
        this._lastMoveX = 0;
        this._lastMoveY = 0;
        this._lastMoveTime = 0;
    }

    attach() {
        const el = this.renderer.domElement;
        el.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        el.addEventListener('pointerup', (e) => this.onPointerUp(e));
        el.addEventListener('pointermove', (e) => this.onPointerMove(e));
    }

    _updateMouse(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    onPointerDown(event) {
        // Any press counts as interaction (covers touch taps with no move).
        this.resetIdleTimer();
        this.cancelFlick(); // grabbing the globe stops any coasting spin
        this._updateMouse(event);

        this.mouseDownPos.x = event.clientX;
        this.mouseDownPos.y = event.clientY;
        this.isDragging = false;
        this.longPressTriggered = false;

        // Reset velocity sampling for this drag.
        this._velX = 0;
        this._velY = 0;
        this._lastMoveTime = 0;

        // Edit mode: start dragging the selected label if clicked on it or its helper.
        if (this.labelEditor.isActive() && this.labelEditor.getSelected()) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            if (this.labelEditor.canStartDragAt(this.raycaster)) {
                this.isDraggingLabel = true;
                this.controls.enableRotate = false; // no orbit while dragging a label

                // Long-press → shrink the label.
                this.longPressTimer = setTimeout(() => {
                    if (!this.isDragging && this.labelEditor.getSelected()) {
                        this.longPressTriggered = true;
                        this.labelEditor.resizeSelected(0.9);
                        if (navigator.vibrate) navigator.vibrate(50);
                    }
                }, 500);
            }
        }
    }

    onPointerUp(event) {
        this._updateMouse(event);

        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }

        // Label drag end (and tap/double-tap resize).
        if (this.isDraggingLabel) {
            this.isDraggingLabel = false;
            this.controls.enableRotate = true;

            if (this.longPressTriggered) {
                this.longPressTriggered = false;
                return;
            }

            const deltaX = Math.abs(event.clientX - this.mouseDownPos.x);
            const deltaY = Math.abs(event.clientY - this.mouseDownPos.y);
            if (deltaX < 5 && deltaY < 5 && this.labelEditor.getSelected()) {
                const currentTime = Date.now();
                if (currentTime - this.lastTapTime < 300) { // double-tap → grow
                    this.labelEditor.resizeSelected(1.1);
                    if (navigator.vibrate) navigator.vibrate(50);
                    this.lastTapTime = 0; // prevent triple-tap
                } else {
                    this.lastTapTime = currentTime;
                }
            }
            return;
        }

        // Orbit drag release — not a click. Carry the release velocity into a
        // decaying spin. Touch already gets good inertia from OrbitControls
        // damping, so only boost mouse/pen (where a release barely coasts), and
        // skip it if the pointer had effectively stopped before lift-off.
        if (this.isDragging) {
            this.isDragging = false;
            const fresh = this._lastMoveTime && (event.timeStamp - this._lastMoveTime) < 60;
            if (fresh && event.pointerType !== 'touch') {
                this.onFlick(this._velX, this._velY);
            }
            return;
        }

        // Edit mode: label click selects.
        if (this.labelEditor.isActive()) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            if (this.labelEditor.trySelectAt(this.raycaster)) {
                return; // don't process country clicks in edit mode
            }
        }

        // Color edit mode: recolor the clicked country.
        if (this.colorEditor.isActive()) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const colorPick = this.globeManager.pick(this.raycaster.ray);
            if (colorPick) {
                this.colorEditor.changeCountryColor(colorPick.name);
                return;
            }
        }

        // Zoom edit mode: assign focus level to the clicked country.
        if (this.zoomEditor.isActive()) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const zoomPick = this.globeManager.pick(this.raycaster.ray);
            if (zoomPick) {
                this.zoomEditor.setCountryFocusLevel(zoomPick.name);
                return;
            }
        }

        // Ordinary click: select a country.
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const pickResult = this.globeManager.pick(this.raycaster.ray);
        if (!pickResult) {
            // A tap on the ocean or off the globe dismisses the country detail panel
            // (pick() returns null for ocean id 0 and for rays that miss the sphere).
            if (!this.state.get('quiz.active') && this.flagRenderer && this.flagRenderer.isShowing()) {
                this.deselectCountry();
            }
            return;
        }

        const pickedName = pickResult.name;
        this.selectedCountry = pickedName;
        console.log('Selected country:', pickedName);

        if (this.clickQuiz && this.clickQuiz.isActive()) {
            this.clickQuiz.handleAnswer(pickedName);
            return;
        }

        // Daily Challenge map-click questions (e.g. "Click Zambia").
        if (this.dailyQuiz && this.dailyQuiz.isAwaitingMapClick()) {
            this.dailyQuiz.handleMapClick(pickedName);
            return;
        }

        if (!this.state.get('quiz.active')) {
            this.smallCountryIndicator.remove();

            this.globeManager.clearSelection();
            this.globeManager.setSelectedCountry(pickedName);
            track('country_select', { country: pickedName, source: 'globe' });
            if (this.labelManager) this.labelManager.setHighlight(pickedName);

            this.rotateGlobeToCountry(pickedName, false, pickResult.point);
            if (this.flagRenderer) {
                this.flagRenderer.show(pickedName, this.countryData, this.countryToISO,
                    this.globeManager.getCapital(pickedName)?.name);
            }
        }
    }

    /** Clear the current country selection: globe highlight, label, indicator, panel. */
    deselectCountry() {
        this.selectedCountry = null;
        if (this.smallCountryIndicator) this.smallCountryIndicator.remove();
        this.globeManager.clearSelection();
        if (this.labelManager) this.labelManager.setHighlight(null);
        if (this.flagRenderer) this.flagRenderer.hide();
    }

    onPointerMove(event) {
        this.resetIdleTimer();
        this._updateMouse(event);

        // Drag a selected label onto the label sphere.
        if (this.isDraggingLabel && this.labelEditor.getSelected()) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const sphereIntersects = this.raycaster.intersectObject(this.dragHitSphere);
            if (sphereIntersects.length > 0) {
                this.labelEditor.dragSelectedTo(sphereIntersects[0].point);
            }
            return; // don't process other moves while dragging
        }

        // Promote to an orbit drag once the pointer moves past the threshold,
        // and sample the pointer velocity (px/ms) for release momentum.
        if (event.buttons === 1) {
            const deltaX = Math.abs(event.clientX - this.mouseDownPos.x);
            const deltaY = Math.abs(event.clientY - this.mouseDownPos.y);
            if (deltaX > 5 || deltaY > 5) {
                this.isDragging = true;
            }

            const t = event.timeStamp;
            if (this._lastMoveTime) {
                const dt = t - this._lastMoveTime;
                if (dt > 0) {
                    // Exponential smoothing so the release reflects the last moments.
                    const vx = (event.clientX - this._lastMoveX) / dt;
                    const vy = (event.clientY - this._lastMoveY) / dt;
                    this._velX = this._velX * 0.5 + vx * 0.5;
                    this._velY = this._velY * 0.5 + vy * 0.5;
                }
            }
            this._lastMoveX = event.clientX;
            this._lastMoveY = event.clientY;
            this._lastMoveTime = t;
        }

        // No hover effects during quiz or while dragging.
        if (this.state.get('quiz.active') || this.isDragging) {
            return;
        }

        // Hover: cursor feedback only.
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hoverPick = this.globeManager.pick(this.raycaster.ray);
        document.body.style.cursor = hoverPick ? 'pointer' : 'default';
    }
}
