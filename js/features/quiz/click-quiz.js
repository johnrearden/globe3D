/**
 * Click Country Quiz Module
 * Displays country names and asks the player to click on the correct country on the globe within a time limit
 */

import { state } from '../../data/state.js';

// Access global THREE.js library
const THREE = window.THREE;

export class ClickQuiz {
    constructor(options = {}) {
        this.globeManager = options.globeManager;
        this.cameraController = options.cameraController;
        this.elements = options.elements;
        this.showQuizCelebration = options.showQuizCelebration;
        this.clearQuizTimers = options.clearQuizTimers;

        // Quiz state
        this.active = false;
        this.currentIndex = 0;
        this.score = 0;
        this.countries = []; // List of 10 random countries for this quiz
        this.timeRemaining = 45000; // 45 seconds
        this.startTime = 0;
        this.timerInterval = null;
    }

    /**
     * Start the quiz
     */
    start() {
        this.active = true;
        this.currentIndex = 0;
        this.score = 0;
        this.timeRemaining = 45000; // 45 seconds
        this.startTime = Date.now();

        // Update state
        state.set('quiz.active', true);
        state.set('quiz.mode', 'click-country');

        // Select 10 random countries
        const centroids = this.globeManager.getCentroids();
        const shuffled = [...centroids].sort(() => Math.random() - 0.5);
        this.countries = shuffled.slice(0, 10).map(c => c.name);

        // Disable auto-rotation during quiz
        const controls = this.cameraController.getControls();
        controls.autoRotate = false;

        // Hide search container and take quiz button
        this.elements.get('search-container').style.display = 'none';
        this.elements.get('take-quiz-btn').style.display = 'none';

        // Show click quiz UI
        this.elements.get('click-quiz-container').style.display = 'block';
        this.elements.get('click-quiz-timer-bar-container').style.display = 'block';

        // Start timer
        this.timerInterval = setInterval(() => this.updateTimer(), 100);

        // Show first question
        this.showQuestion();
    }

    /**
     * End the quiz
     * @param {boolean} completed - Whether quiz was completed or timed out
     */
    end(completed) {
        this.active = false;

        // Clear timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        // Update state
        state.set('quiz.active', false);
        state.set('quiz.mode', null);

        // Hide quiz UI
        this.elements.get('click-quiz-container').style.display = 'none';
        this.elements.get('click-quiz-timer-bar-container').style.display = 'none';

        // Calculate final time
        const totalTime = 45000;
        const timeUsed = totalTime - Math.max(0, this.timeRemaining);
        const seconds = (timeUsed / 1000).toFixed(1);
        const timeInfo = completed ? `Completed in ${seconds}s` : `Time's Up! ${seconds}s elapsed`;

        // Show celebration overlay with score
        this.showQuizCelebration(this.score, this.currentIndex, timeInfo);

        // Add click event to celebration close button
        this.elements.get('celebration-close-btn').onclick = () => {
            this.elements.get('quiz-celebration-overlay').style.display = 'none';
            // Show search and quiz button again
            this.elements.get('search-container').style.display = 'block';
            this.elements.get('take-quiz-btn').style.display = 'block';
        };
    }

    /**
     * Show the current question
     */
    showQuestion() {
        const countryName = this.countries[this.currentIndex];
        this.elements.get('click-quiz-country-name').textContent = countryName;
        this.elements.get('click-quiz-question-counter').textContent =
            `Question ${this.currentIndex + 1} of 10`;
        this.elements.get('click-quiz-score-display').textContent =
            `Score: ${this.score}/${this.currentIndex}`;
    }

    /**
     * Update the timer display and check if time has run out
     */
    updateTimer() {
        // Calculate elapsed time
        const elapsed = Date.now() - this.startTime;
        this.timeRemaining = 45000 - elapsed;

        // Update timer bar
        const percentage = Math.max(0, (this.timeRemaining / 45000) * 100);
        this.elements.get('click-quiz-timer-fill').style.height = percentage + '%';

        // End quiz if time runs out
        if (this.timeRemaining <= 0) {
            this.end(false);
        }
    }

    /**
     * Handle a country click during the quiz
     * @param {string} clickedCountryName - Name of the clicked country
     */
    handleAnswer(clickedCountryName) {
        const correctCountryName = this.countries[this.currentIndex];

        if (clickedCountryName === correctCountryName) {
            // Correct answer!
            this.score++;
            this.showFeedback('Correct!', true);

            // Flash country green
            this.flashCountryColor(clickedCountryName, 0x00ff00);

            // Move to next question after a short delay
            setTimeout(() => {
                this.currentIndex++;

                if (this.currentIndex >= 10) {
                    // Quiz complete!
                    this.end(true);
                } else {
                    this.showQuestion();
                }
            }, 800);
        } else {
            // Wrong answer - deduct 5 seconds
            this.startTime -= 5000; // Move start time back by 5 seconds
            this.showFeedback('Wrong! -5 seconds', false);

            // Flash country red
            this.flashCountryColor(clickedCountryName, 0xff0000);
        }
    }

    /**
     * Show feedback message (correct/wrong)
     * @param {string} message - Feedback message
     * @param {boolean} isCorrect - Whether answer was correct
     */
    showFeedback(message, isCorrect) {
        const feedbackEl = this.elements.get('click-quiz-feedback');
        feedbackEl.textContent = message;
        feedbackEl.className = isCorrect ? 'correct' : 'wrong';
        feedbackEl.style.display = 'block';

        setTimeout(() => {
            feedbackEl.style.display = 'none';
        }, 1000);
    }

    /**
     * Flash a country with a color briefly
     * @param {string} countryName - Name of the country
     * @param {number} color - Hex color to flash
     */
    flashCountryColor(countryName, color) {
        const countries = this.globeManager.getCountries();
        const country = countries.find(c => c.userData.name === countryName);
        if (country) {
            const originalColor = country.material.color.getHex();
            country.material.color.setHex(color);
            country.material.needsUpdate = true;

            setTimeout(() => {
                country.material.color.setHex(originalColor);
                country.material.needsUpdate = true;
            }, 500);
        }
    }

    /**
     * Check if quiz is active
     * @returns {boolean}
     */
    isActive() {
        return this.active;
    }
}
