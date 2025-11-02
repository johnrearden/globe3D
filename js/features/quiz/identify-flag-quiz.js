/**
 * Identify Flag Quiz Module
 * Displays a 3D waving flag and asks the player to identify which country it belongs to
 */

import { state } from '../../data/state.js';

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

        // Quiz state
        this.score = 0;
        this.questionsAnswered = 0;
        this.usedCountries = [];
        this.currentQuestion = null;
        this.autoAdvanceTimer = null;
        this.active = false;

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

        // Add the canvas to the quiz flag display but keep it hidden
        const flagDisplay = this.elements.get('quiz-flag-display');
        flagDisplay.innerHTML = ''; // Clear any existing content
        flagDisplay.appendChild(this.renderer.domElement);
        flagDisplay.style.display = 'none'; // Keep hidden until texture loads
    }

    /**
     * Start the quiz
     */
    start() {
        this.active = true;
        this.score = 0;
        this.questionsAnswered = 0;
        this.usedCountries = [];

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

        // Show celebration overlay with score
        this.showQuizCelebration(this.score, this.questionsAnswered);

        // Add click event to celebration close button
        this.elements.get('celebration-close-btn').onclick = () => {
            this.elements.get('quiz-celebration-overlay').style.display = 'none';
            this.elements.get('quiz-container').style.display = 'block';
            this.elements.get('quiz-next-btn').style.visibility = 'hidden';
            this.elements.get('quiz-start-btn').style.display = 'block';
            this.elements.get('quiz-start-btn').textContent = 'Play Again';
        };
    }

    /**
     * Generate a quiz question with options
     * @returns {Object} Question with correctCountry, options, and countryObj
     */
    generateQuestion() {
        const centroids = this.globeManager.getCentroids();

        // Filter out countries already used in this quiz
        const availableCountries = centroids.filter(c => !this.usedCountries.includes(c.name));

        if (availableCountries.length < 4) {
            console.error('Not enough unused countries for quiz');
            return null;
        }

        // Select random country from available countries as the correct answer
        const correctIndex = Math.floor(Math.random() * availableCountries.length);
        const correctCountry = availableCountries[correctIndex];

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

            // Highlight correct and incorrect answers
            if (button.dataset.country === this.currentQuestion.correctCountry) {
                button.classList.add('correct');
                const label = document.createElement('span');
                label.className = 'correct-label';
                label.textContent = 'correct answer';
                button.appendChild(label);
            } else if (button.dataset.country === selectedCountry && !isCorrect) {
                button.classList.add('incorrect');
            }
        });

        // Don't show any result message
        this.elements.get('quiz-result').style.display = 'none';

        // End quiz after 10 questions
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
            }, 3000);
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
