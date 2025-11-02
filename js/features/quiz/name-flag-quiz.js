/**
 * Name the Country Quiz Module
 * Displays a highlighted country on the globe and asks the player to identify it by selecting the correct flag
 */

import { state } from '../../data/state.js';

// Access global THREE.js library
const THREE = window.THREE;

export class NameFlagQuiz {
    constructor(options = {}) {
        this.globeManager = options.globeManager;
        this.cameraController = options.cameraController;
        this.elements = options.elements;
        this.rotateGlobeToCountry = options.rotateGlobeToCountry;
        this.showQuizCelebration = options.showQuizCelebration;
        this.clearQuizTimers = options.clearQuizTimers;
        this.calculateGreatCircleDistance = options.calculateGreatCircleDistance;

        // Quiz state
        this.score = 0;
        this.questionsAnswered = 0;
        this.usedCountries = [];
        this.currentQuestion = null;
        this.autoAdvanceTimer = null;
        this.active = false;
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
        state.set('quiz.mode', 'name-flag');
        state.set('quiz.score', 0);
        state.set('quiz.questionsAnswered', 0);

        // Disable auto-rotation during quiz
        const controls = this.cameraController.getControls();
        controls.autoRotate = false;

        // Add quiz-active class to body for mobile styling
        document.body.classList.add('quiz-active');

        // Clear any previous quiz options before starting
        const optionsContainer = this.elements.get('quiz-options');
        optionsContainer.innerHTML = '';

        // Show quiz elements
        this.elements.get('quiz-score').style.display = 'block';
        this.elements.get('quiz-question').style.display = 'block';

        // Hide start button and previous results
        this.elements.get('quiz-start-btn').style.display = 'none';
        this.elements.get('quiz-result').style.display = 'none';
        this.elements.get('quiz-next-btn').style.visibility = 'hidden';

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

        // Remove quiz-active class from body
        document.body.classList.remove('quiz-active');

        // Hide quiz elements
        this.elements.get('quiz-score').style.display = 'none';
        this.elements.get('quiz-question').style.display = 'none';
        this.elements.get('quiz-options').innerHTML = '';
        this.elements.get('quiz-container').style.display = 'none';

        // Reset globe highlighting
        const countries = this.globeManager.getCountries();
        countries.forEach(country => {
            country.material.vertexColors = true;
            country.material.color.setHex(0xffffff);
            country.material.needsUpdate = true;
        });

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

        // Calculate distances to all other countries (including used ones for distractors)
        const distancesWithCountries = centroids
            .filter(country => country.name !== correctCountry.name)
            .map(country => ({
                country: country,
                distance: this.calculateGreatCircleDistance(correctCountry, country)
            }));

        // Sort by distance (ascending - closest first)
        distancesWithCountries.sort((a, b) => a.distance - b.distance);

        // Select 3 closest countries as distractors
        const distractors = distancesWithCountries
            .slice(0, 3)
            .map(item => item.country.name);

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
            console.error('Failed to generate quiz question');
            return;
        }

        // Hide result and next button
        this.elements.get('quiz-result').style.display = 'none';
        this.elements.get('quiz-next-btn').style.visibility = 'hidden';

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

            // Highlight country on globe and rotate to it
            this.highlightQuizCountry(this.currentQuestion.countryObj);
        }, 0);
    }

    /**
     * Highlight the quiz country on the globe
     * @param {Object} countryObj - Country centroid object
     */
    highlightQuizCountry(countryObj) {
        const countries = this.globeManager.getCountries();

        // Reset all countries
        countries.forEach(country => {
            country.material.vertexColors = true;
            country.material.color.setHex(0xffffff);
            country.material.needsUpdate = true;
        });

        // Get all mesh references for this country
        const countryMeshes = countries.filter(mesh => mesh.userData.name === countryObj.name);

        // Highlight the quiz country with white
        countryMeshes.forEach(mesh => {
            mesh.material.vertexColors = false;
            mesh.material.color.setHex(0xFFFFFF);
            mesh.material.needsUpdate = true;
        });

        // Rotate globe to center the country
        if (countryMeshes.length > 0) {
            this.rotateGlobeToCountry(countryMeshes[0], true);
        }
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
                // Add "CORRECT ANSWER" label to correct answer button
                const label = document.createElement('span');
                label.className = 'correct-label';
                label.textContent = 'correct answer';
                button.appendChild(label);
            } else if (button.dataset.country === selectedCountry && !isCorrect) {
                button.classList.add('incorrect');
            }
        });

        // Don't show any result message - button feedback is sufficient
        this.elements.get('quiz-result').style.display = 'none';

        // Show next button or end quiz after 10 questions
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
}
