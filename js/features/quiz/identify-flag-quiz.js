/**
 * Identify Flag Quiz Module
 * Displays a 3D waving flag and asks the player to identify which country it belongs to
 */

import { state } from '../../data/state.js';
import { quizHistoryStore } from '../../data/quiz-history-store.js';

// Access global THREE.js library
const THREE = window.THREE;

export class IdentifyFlagQuiz {
    constructor(options = {}) {
        this.globeManager = options.globeManager;
        this.elements = options.elements;
        this.showQuizCelebration = options.showQuizCelebration;
        this.clearQuizTimers = options.clearQuizTimers;
        this.countryToISO = options.countryToISO;
        this.animateFlagWave = options.animateFlagWave;
        this.quizTimer = options.quizTimer;

        // Quiz state
        this.score = 0;
        this.questionsAnswered = 0;
        this.usedCountries = [];
        this.questionLog = []; // [{ country, correct }] for quiz-history recording
        this.currentQuestion = null;
        this.autoAdvanceTimer = null;
        this.active = false;
        this.scope = 'globe'; // Region filter: 'globe' or a region name

        // Flag renderer state
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.flagMesh = null;
        this.flagOriginalPositions = null;
        this.flagTime = 0;
    }

    /**
     * Initialize the flag renderer (creates scene, camera, renderer, lights)
     */
    initRenderer() {
        if (this.renderer) return; // Already initialized

        // Create flag scene for quiz
        this.scene = new THREE.Scene();
        this.scene.background = null; // Transparent background

        // Create flag camera for quiz display
        this.camera = new THREE.PerspectiveCamera(45, 560 / 373, 0.1, 1000);
        this.camera.position.z = 9.5;

        // Create flag renderer for quiz
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(560, 373);
        this.renderer.setClearColor(0x000000, 0); // Transparent

        // Add lights to flag scene
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 5, 5);
        this.scene.add(directionalLight);
    }

    /**
     * Update flag wave animation
     */
    updateAnimation() {
        if (!this.flagMesh || !this.flagOriginalPositions) return;
        this.flagTime = performance.now() * 0.001 * 3; // Speed factor
        this.animateFlagWave(this.flagMesh, this.flagOriginalPositions, this.flagTime);
    }

    /**
     * Display a flag for the quiz
     * @param {string} countryName - Name of the country whose flag to display
     */
    displayFlag(countryName) {
        // Initialize renderer if needed
        this.initRenderer();

        // Get ISO code for the country
        const isoCode = this.countryToISO[countryName];
        if (!isoCode) {
            console.error('No ISO code found for country:', countryName);
            return;
        }

        // Remove old flag if exists
        if (this.flagMesh) {
            this.scene.remove(this.flagMesh);
            this.flagMesh.geometry.dispose();
            // Dispose material and texture properly
            if (this.flagMesh.material.map) {
                this.flagMesh.material.map.dispose();
            }
            this.flagMesh.material.dispose();
            this.flagMesh = null;
            this.flagOriginalPositions = null;
        }

        // Create plane geometry with subdivisions for wave effect
        const flagGeometry = new THREE.PlaneGeometry(10, 6.67, 20, 15);

        // Store reference to this load operation
        const currentLoadIsoCode = isoCode;

        // Load flag texture with callback
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(
            `https://flagcdn.com/w640/${isoCode}.png`,
            (flagTexture) => {
                // Only proceed if this is still the current quiz question
                // (prevents race condition if user advances quickly)
                if (this.currentQuestion && this.countryToISO[this.currentQuestion.correctCountry] === currentLoadIsoCode) {
                    // Texture loaded successfully
                    // Create material
                    const flagMaterial = new THREE.MeshStandardMaterial({
                        map: flagTexture,
                        side: THREE.DoubleSide,
                        roughness: 0.7,
                        metalness: 0.1
                    });

                    // Create mesh
                    const flag = new THREE.Mesh(flagGeometry, flagMaterial);

                    // Store original positions for animation
                    const positions = flag.geometry.attributes.position;
                    const originalPositions = new Float32Array(positions.array);

                    // Update references
                    this.flagMesh = flag;
                    this.flagOriginalPositions = originalPositions;
                    this.scene.add(this.flagMesh);

                    // Force render with new texture
                    this.renderer.render(this.scene, this.camera);

                    // Now that texture is loaded, show the flag display
                    this.elements.get('quiz-flag-display').style.display = 'block';
                } else {
                    // Question changed before texture loaded, dispose texture
                    flagTexture.dispose();
                    flagGeometry.dispose();
                }
            },
            undefined,
            (error) => {
                console.error('Error loading flag texture:', error);
                flagGeometry.dispose();
            }
        );

        // Attach the canvas the first time only. Toggling display between
        // questions collapses the container and bounces the Next button.
        // Once visible, leave it visible — the canvas will render transparent
        // for the brief moment between removing the old mesh and the new
        // texture arriving.
        const flagDisplay = this.elements.get('quiz-flag-display');
        if (this.renderer.domElement.parentNode !== flagDisplay) {
            flagDisplay.innerHTML = '';
            flagDisplay.appendChild(this.renderer.domElement);
        }
    }

    /**
     * Start the quiz
     * @param {string} scope - 'globe' for all countries, or a region name
     */
    start(scope = 'globe') {
        this.active = true;
        this.scope = scope;
        this.score = 0;
        this.questionsAnswered = 0;
        this.usedCountries = [];
        this.questionLog = [];

        // Update state
        state.set('quiz.active', true);
        state.set('quiz.mode', 'identify-flag');
        state.set('quiz.score', 0);
        state.set('quiz.questionsAnswered', 0);

        // Add quiz-active and flag-quiz-active classes to body
        document.body.classList.add('quiz-active');
        document.body.classList.add('flag-quiz-active');

        // Clear any previous quiz options before starting
        const optionsContainer = this.elements.get('quiz-options');
        optionsContainer.innerHTML = '';

        // Clear any inline display overrides left over from cancelQuiz/end —
        // otherwise the container stays hidden and the Take Quiz button stays
        // visible despite the CSS rules driven by body.quiz-active.
        this.elements.get('quiz-container').style.display = '';
        this.elements.get('take-quiz-btn').style.display = '';

        // Show quiz elements
        this.elements.get('quiz-score').style.display = 'block';
        this.elements.get('quiz-question').textContent = 'Which country does this flag belong to?';
        this.elements.get('quiz-question').style.display = 'block';

        // Hide start button and previous results
        this.elements.get('quiz-start-btn').style.display = 'none';
        this.elements.get('quiz-result').style.display = 'none';
        this.elements.get('quiz-next-btn').style.visibility = 'hidden';
        this.elements.get('quiz-flag-display').style.display = 'none';

        // Show cancel button
        this.elements.get('quiz-cancel-btn').style.display = 'block';

        // Reset score display
        this.updateScoreDisplay();

        // Start the count-up timer
        this.quizTimer.start();

        // Load first question
        this.nextQuestion();
    }

    /**
     * End the quiz
     */
    end() {
        this.active = false;

        // Clear auto-advance timer if active
        if (this.autoAdvanceTimer) {
            clearTimeout(this.autoAdvanceTimer);
            this.autoAdvanceTimer = null;
        }

        // Update state
        state.set('quiz.active', false);
        state.set('quiz.mode', null);

        // Remove quiz-active and flag-quiz-active classes from body
        document.body.classList.remove('quiz-active');
        document.body.classList.remove('flag-quiz-active');

        // Hide quiz elements
        this.elements.get('quiz-score').style.display = 'none';
        this.elements.get('quiz-question').style.display = 'none';
        this.elements.get('quiz-flag-display').style.display = 'none';
        this.elements.get('quiz-options').innerHTML = '';
        this.elements.get('quiz-container').style.display = 'none';
        this.elements.get('quiz-next-btn').style.visibility = 'hidden';

        // Stop the timer, persist the result, and show the celebration overlay
        // with score + total time + standing/new best.
        const elapsedMs = this.quizTimer.stop();
        const summary = quizHistoryStore.record({
            ts: Date.now(),
            mode: 'identify-flag',
            scope: this.scope,
            score: this.score,
            total: this.questionsAnswered,
            durationMs: elapsedMs,
            questions: this.questionLog
        });
        // The results modal owns Play again (→ quiz chooser) / Share / Globe.
        this.showQuizCelebration({
            score: this.score,
            total: this.questionsAnswered,
            seconds: elapsedMs / 1000,
            mode: 'identify-flag',
            scope: this.scope,
            summary
        });
    }

    /**
     * Generate a quiz question with options
     * @returns {Object} Question with correctCountry, options, and countryObj
     */
    generateQuestion() {
        const centroids = this.globeManager.getCentroidsByRegion(this.scope);

        // Filter out countries already used in this quiz
        const availableCountries = centroids.filter(c => !this.usedCountries.includes(c.name));

        if (availableCountries.length < 4) {
            console.error('Not enough unused countries for quiz');
            return null;
        }

        // The correct answer must have an ISO code so displayFlag can fetch its flag.
        // Without this filter, a country missing from countryToISO causes displayFlag
        // to early-return without clearing the previous flag, leaving stale art on screen.
        const flaggable = availableCountries.filter(c => this.countryToISO[c.name]);
        if (flaggable.length === 0) {
            console.error('No remaining countries with flags available for quiz');
            return null;
        }

        // Select random country from flaggable countries as the correct answer
        const correctIndex = Math.floor(Math.random() * flaggable.length);
        const correctCountry = flaggable[correctIndex];

        // Mark this country as used
        this.usedCountries.push(correctCountry.name);

        // Get all other countries for random distractors
        const otherCountries = centroids.filter(country => country.name !== correctCountry.name);

        // Select 3 random distractors
        const shuffledOthers = otherCountries.sort(() => Math.random() - 0.5);
        const distractors = shuffledOthers.slice(0, 3).map(c => c.name);

        // Combine correct answer with distractors
        const allOptions = [correctCountry.name, ...distractors];

        // Shuffle the options randomly
        const shuffledOptions = allOptions.sort(() => Math.random() - 0.5);

        return {
            correctCountry: correctCountry.name,
            options: shuffledOptions,
            countryObj: correctCountry
        };
    }

    /**
     * Load next question
     */
    nextQuestion() {
        // Generate new question
        this.currentQuestion = this.generateQuestion();

        if (!this.currentQuestion) {
            console.error('Failed to generate flag quiz question');
            return;
        }

        // Hide result and next button
        this.elements.get('quiz-result').style.display = 'none';
        this.elements.get('quiz-next-btn').style.visibility = 'hidden';

        // Display the flag
        this.displayFlag(this.currentQuestion.correctCountry);

        // Clear previous options completely
        const optionsContainer = this.elements.get('quiz-options');
        optionsContainer.innerHTML = '';

        // Small delay to ensure DOM is clean before creating new buttons
        setTimeout(() => {
            // Create option buttons with explicit neutral styling
            this.currentQuestion.options.forEach(optionName => {
                const button = document.createElement('button');
                button.className = 'quiz-option';
                button.disabled = false;
                button.removeAttribute('style');

                // Create span for country name
                const nameSpan = document.createElement('span');
                nameSpan.textContent = optionName;
                button.appendChild(nameSpan);

                button.dataset.country = optionName;
                button.addEventListener('click', () => this.handleAnswer(optionName));
                optionsContainer.appendChild(button);
            });
        }, 0);
    }

    /**
     * Handle quiz answer selection
     * @param {string} selectedCountry - Name of selected country
     */
    handleAnswer(selectedCountry) {
        const isCorrect = selectedCountry === this.currentQuestion.correctCountry;

        // Record this question for quiz history (the flag shown is the answer).
        this.questionLog.push({ country: this.currentQuestion.correctCountry, correct: isCorrect });

        // Update score if correct
        if (isCorrect) {
            this.score++;
            state.set('quiz.score', this.score);
        }
        this.questionsAnswered++;
        state.set('quiz.questionsAnswered', this.questionsAnswered);

        // Update score display
        this.updateScoreDisplay();

        // Disable all option buttons
        const optionButtons = document.querySelectorAll('.quiz-option');
        optionButtons.forEach(button => {
            button.disabled = true;

            // Highlight correct and incorrect answers (color only — appending a label here
            // mutates button size and reflows neighbours).
            if (button.dataset.country === this.currentQuestion.correctCountry) {
                button.classList.add('correct');
            } else if (button.dataset.country === selectedCountry && !isCorrect) {
                button.classList.add('incorrect');
            }
        });

        // Don't show any result message
        this.elements.get('quiz-result').style.display = 'none';

        if (this.questionsAnswered >= 10) {
            setTimeout(() => {
                this.end();
            }, 2000);
        } else {
            // Show next button for 3 seconds, then auto-advance
            this.elements.get('quiz-next-btn').style.visibility = 'visible';

            // Clear any existing timer
            if (this.autoAdvanceTimer) {
                clearTimeout(this.autoAdvanceTimer);
            }

            // Set new timer
            this.autoAdvanceTimer = setTimeout(() => {
                this.elements.get('quiz-next-btn').style.visibility = 'hidden';
                this.autoAdvanceTimer = null;
                this.nextQuestion();
            }, 1500);
        }
    }

    /**
     * Update score display
     */
    updateScoreDisplay() {
        this.elements.get('quiz-score-value').textContent = this.score;
        this.elements.get('quiz-total-value').textContent = this.questionsAnswered;
    }

    /**
     * Check if quiz is active
     * @returns {boolean}
     */
    isActive() {
        return this.active;
    }

    /** End the quiz immediately without showing the celebration. */
    cancel() {
        if (this.autoAdvanceTimer) {
            clearTimeout(this.autoAdvanceTimer);
            this.autoAdvanceTimer = null;
        }
        this.quizTimer.cancel();
        this.active = false;
        state.set('quiz.active', false);
        state.set('quiz.mode', null);

        document.body.classList.remove('quiz-active');
        document.body.classList.remove('flag-quiz-active');

        this.elements.get('quiz-score').style.display = 'none';
        this.elements.get('quiz-question').style.display = 'none';
        this.elements.get('quiz-flag-display').style.display = 'none';
        this.elements.get('quiz-options').innerHTML = '';
        // Clear the inline overrides (don't set 'none'/'block') so CSS restores
        // the idle state — Start Quiz panel on desktop, Take Quiz on mobile.
        this.elements.get('quiz-container').style.display = '';

        this.elements.get('search-container').style.display = 'block';
        this.elements.get('take-quiz-btn').style.display = '';

        this.elements.get('quiz-cancel-btn').style.display = 'none';
        this.elements.get('quiz-next-btn').style.visibility = 'hidden';
        this.elements.get('quiz-start-btn').style.display = 'block';
        this.elements.get('quiz-start-btn').textContent = 'Start Quiz';
    }

    /**
     * Get the flag renderer (for animation updates in main loop)
     * @returns {THREE.WebGLRenderer}
     */
    getRenderer() {
        return this.renderer;
    }

    /**
     * Get the flag scene (for animation updates in main loop)
     * @returns {THREE.Scene}
     */
    getScene() {
        return this.scene;
    }

    /**
     * Get the flag camera (for animation updates in main loop)
     * @returns {THREE.Camera}
     */
    getCamera() {
        return this.camera;
    }

    /**
     * Get the flag mesh (for animation updates in main loop)
     * @returns {THREE.Mesh}
     */
    getFlagMesh() {
        return this.flagMesh;
    }
}
