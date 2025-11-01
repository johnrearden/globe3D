/**
 * State Management Module
 * Centralized state store for Globe3D application
 * Provides reactive state updates and subscription system
 */

export class StateManager {
    constructor() {
        this.state = {
            // Scene & Rendering
            scene: {
                scene: null,
                camera: null,
                renderer: null,
                globe: null,
                controls: null,
                baseSphere: null,
                initialCameraDistance: null
            },

            // Countries & Geography
            countries: {
                list: [],
                centroids: [],
                selected: null,
                borders: []
            },

            // Mouse & Interaction
            mouse: {
                position: null,  // THREE.Vector2
                raycaster: null, // THREE.Raycaster
                downPos: null,   // THREE.Vector2
                isDragging: false
            },

            // Quiz System
            quiz: {
                active: false,
                mode: null, // 'name-flag', 'identify-flag', or 'find-country'
                currentQuestion: null,
                score: 0,
                questionsAnswered: 0,
                usedCountries: [],
                autoAdvanceTimer: null,

                // Click quiz specific
                clickQuiz: {
                    active: false,
                    countries: [],
                    currentIndex: 0,
                    score: 0,
                    startTime: 0,
                    timeRemaining: 45000,
                    timerInterval: null
                }
            },

            // Labels
            labels: {
                list: [],
                config: {},
                defaults: {},
                editMode: false,
                selected: null,
                isDragging: false,
                selectionHelper: null,
                lastTapTime: 0,
                longPressTimer: null,
                longPressTriggered: false
            },

            // Color Editor
            colorEditor: {
                editMode: false,
                config: {}
            },

            // Flags
            flags: {
                hover: {
                    scene: null,
                    camera: null,
                    renderer: null,
                    mesh: null,
                    originalPositions: null,
                    time: 0
                },
                quiz: {
                    scene: null,
                    camera: null,
                    renderer: null,
                    mesh: null,
                    originalPositions: null,
                    time: 0
                }
            },

            // Search
            search: {
                selected: null
            },

            // UI State
            ui: {
                seoContentHidden: false,
                loadingProgress: 0
            },

            // Auto-rotation
            autoRotation: {
                enabled: false,
                lastInteractionTime: Date.now(),
                idleTimer: null
            }
        };

        // Subscribers for reactive updates
        this.subscribers = new Map();
    }

    /**
     * Get value from state using dot notation path
     * @param {string} path - Dot notation path (e.g., 'quiz.score')
     * @returns {*} The value at the path
     */
    get(path) {
        const keys = path.split('.');
        let value = this.state;

        for (const key of keys) {
            if (value === null || value === undefined) {
                return undefined;
            }
            value = value[key];
        }

        return value;
    }

    /**
     * Set value in state using dot notation path
     * @param {string} path - Dot notation path
     * @param {*} value - Value to set
     * @param {boolean} notify - Whether to notify subscribers (default: true)
     */
    set(path, value, notify = true) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let target = this.state;

        for (const key of keys) {
            if (!(key in target)) {
                target[key] = {};
            }
            target = target[key];
        }

        const oldValue = target[lastKey];
        target[lastKey] = value;

        if (notify && oldValue !== value) {
            this.notifySubscribers(path, value, oldValue);
        }
    }

    /**
     * Subscribe to state changes at a specific path
     * @param {string} path - Path to watch
     * @param {Function} callback - Callback function(newValue, oldValue, path)
     * @returns {Function} Unsubscribe function
     */
    subscribe(path, callback) {
        if (!this.subscribers.has(path)) {
            this.subscribers.set(path, new Set());
        }

        this.subscribers.get(path).add(callback);

        // Return unsubscribe function
        return () => {
            const callbacks = this.subscribers.get(path);
            if (callbacks) {
                callbacks.delete(callback);
                if (callbacks.size === 0) {
                    this.subscribers.delete(path);
                }
            }
        };
    }

    /**
     * Notify subscribers of state changes
     * @param {string} path - Path that changed
     * @param {*} newValue - New value
     * @param {*} oldValue - Old value
     */
    notifySubscribers(path, newValue, oldValue) {
        // Notify exact path subscribers
        const exactCallbacks = this.subscribers.get(path);
        if (exactCallbacks) {
            exactCallbacks.forEach(callback => {
                try {
                    callback(newValue, oldValue, path);
                } catch (error) {
                    console.error(`Error in subscriber for ${path}:`, error);
                }
            });
        }

        // Notify parent path subscribers (e.g., 'quiz' when 'quiz.score' changes)
        const pathParts = path.split('.');
        while (pathParts.length > 1) {
            pathParts.pop();
            const parentPath = pathParts.join('.');
            const parentCallbacks = this.subscribers.get(parentPath);

            if (parentCallbacks) {
                const parentValue = this.get(parentPath);
                parentCallbacks.forEach(callback => {
                    try {
                        callback(parentValue, undefined, parentPath);
                    } catch (error) {
                        console.error(`Error in subscriber for ${parentPath}:`, error);
                    }
                });
            }
        }
    }

    /**
     * Update multiple state values at once
     * @param {Object} updates - Object with path: value pairs
     */
    batchUpdate(updates) {
        const changedPaths = [];

        // Update all values without notifying
        for (const [path, value] of Object.entries(updates)) {
            const oldValue = this.get(path);
            this.set(path, value, false);
            if (oldValue !== value) {
                changedPaths.push({ path, value, oldValue });
            }
        }

        // Notify all subscribers after batch update
        changedPaths.forEach(({ path, value, oldValue }) => {
            this.notifySubscribers(path, value, oldValue);
        });
    }

    /**
     * Reset specific section of state
     * @param {string} section - Section to reset (e.g., 'quiz')
     */
    reset(section) {
        if (section === 'quiz') {
            this.batchUpdate({
                'quiz.active': false,
                'quiz.mode': null,
                'quiz.currentQuestion': null,
                'quiz.score': 0,
                'quiz.questionsAnswered': 0,
                'quiz.usedCountries': [],
                'quiz.autoAdvanceTimer': null
            });
        } else if (section === 'clickQuiz') {
            this.batchUpdate({
                'quiz.clickQuiz.active': false,
                'quiz.clickQuiz.countries': [],
                'quiz.clickQuiz.currentIndex': 0,
                'quiz.clickQuiz.score': 0,
                'quiz.clickQuiz.startTime': 0,
                'quiz.clickQuiz.timeRemaining': 45000,
                'quiz.clickQuiz.timerInterval': null
            });
        } else if (section === 'labels') {
            this.set('labels.editMode', false);
            this.set('labels.selected', null);
            this.set('labels.isDragging', false);
        }
    }

    /**
     * Get entire state (for debugging)
     * @returns {Object} Current state
     */
    getState() {
        return this.state;
    }

    /**
     * Log current state (for debugging)
     */
    debug() {
        console.log('=== Globe3D State ===');
        console.log('Quiz:', this.state.quiz);
        console.log('Labels:', this.state.labels);
        console.log('Countries:', this.state.countries.list.length, 'loaded');
        console.log('UI:', this.state.ui);
        console.log('====================');
    }
}

// Export singleton instance
export const state = new StateManager();

// Make available for debugging in browser console
if (typeof window !== 'undefined') {
    window.globe3dState = state;
}
