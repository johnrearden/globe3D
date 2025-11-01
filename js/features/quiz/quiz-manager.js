/**
 * Quiz Manager Module
 * Coordinates different quiz modes and manages quiz state
 */

import { state } from '../../data/state.js';

// Access global THREE.js library
const THREE = window.THREE;

export class QuizManager {
    constructor(options = {}) {
        this.globeManager = options.globeManager;
        this.cameraController = options.cameraController;
        this.elements = options.elements;

        // Quiz mode handlers (will be set by index.html)
        this.modeHandlers = {
            'name-flag': null,
            'identify-flag': null,
            'click-country': null
        };

        // Current quiz state
        this.currentMode = null;
        this.active = false;
    }

    /**
     * Register a quiz mode handler
     * @param {string} mode - Quiz mode name
     * @param {Object} handler - Handler object with start/end methods
     */
    registerMode(mode, handler) {
        this.modeHandlers[mode] = handler;
    }

    /**
     * Start a quiz mode
     * @param {string} mode - Quiz mode to start
     */
    start(mode) {
        if (!this.modeHandlers[mode]) {
            console.error(`Quiz mode '${mode}' not registered`);
            return;
        }

        this.currentMode = mode;
        this.active = true;

        // Update state
        state.set('quiz.active', true);
        state.set('quiz.mode', mode);

        // Delegate to mode handler
        this.modeHandlers[mode].start();
    }

    /**
     * End the current quiz
     */
    end() {
        if (!this.active || !this.currentMode) {
            return;
        }

        // Delegate to current mode handler
        if (this.modeHandlers[this.currentMode]) {
            this.modeHandlers[this.currentMode].end();
        }

        this.active = false;
        this.currentMode = null;

        // Update state
        state.set('quiz.active', false);
        state.set('quiz.mode', null);
    }

    /**
     * Check if quiz is active
     * @returns {boolean}
     */
    isActive() {
        return this.active;
    }

    /**
     * Get current quiz mode
     * @returns {string|null}
     */
    getCurrentMode() {
        return this.currentMode;
    }

    /**
     * Show quiz mode selector
     */
    showModeSelector(showSelector, hideSelector) {
        if (showSelector) showSelector();
    }

    /**
     * Hide quiz mode selector
     */
    hideModeSelector(hideSelector) {
        if (hideSelector) hideSelector();
    }
}
