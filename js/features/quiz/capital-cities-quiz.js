/**
 * Capital Cities Quiz Module
 * Each question randomly asks one of two directions:
 *   forward — "What is the capital of {Country}?"  → 4 capital-name options
 *   reverse — "{City} is the capital of which country?" → 4 country-name options
 * Structurally mirrors NameFlagQuiz (10 questions, 4-option multiple choice,
 * auto-advance, shared celebration overlay).
 */

import { state } from '../../data/state.js';

// Access global THREE.js library
const THREE = window.THREE;

export class CapitalCitiesQuiz {
    constructor(options = {}) {
        this.globeManager = options.globeManager;
        this.cameraController = options.cameraController;
        this.elements = options.elements;
        this.countryMap = options.countryMap; // 2D country map used as the quiz visual
        this.rotateGlobeToCountry = options.rotateGlobeToCountry;
        this.showQuizCelebration = options.showQuizCelebration;
        this.clearQuizTimers = options.clearQuizTimers;
        this.calculateGreatCircleDistance = options.calculateGreatCircleDistance;
        this.labelManager = options.labelManager;

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
        state.set('quiz.mode', 'capital');
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

        // Clear inline display overrides left over from a previous quiz/end so the
        // CSS rules driven by body.quiz-active can govern visibility again.
        this.elements.get('quiz-container').style.display = '';
        this.elements.get('take-quiz-btn').style.display = '';

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

        // Close the 2D map and return to the globe.
        if (this.countryMap) this.countryMap.hide();

        // Hide quiz elements
        this.elements.get('quiz-score').style.display = 'none';
        this.elements.get('quiz-question').style.display = 'none';
        this.elements.get('quiz-options').innerHTML = '';
        this.elements.get('quiz-container').style.display = 'none';

        // Reset globe highlighting + capital marker
        this.globeManager.clearSelection();
        this.globeManager.clearCapitalMarker();

        // Show celebration overlay with score
        this.showQuizCelebration(this.score, this.questionsAnswered);

        // Play Again returns to the quiz-mode chooser. Clear the inline display
        // override on #quiz-container so the next quiz's start() can show the panel.
        this.elements.get('celebration-close-btn').onclick = () => {
            this.elements.get('quiz-celebration-overlay').style.display = 'none';
            this.elements.get('quiz-container').style.display = '';
            this.elements.get('quiz-next-btn').style.visibility = 'hidden';
            this.elements.get('quiz-start-btn').style.display = 'block';
            this.elements.get('quiz-start-btn').textContent = 'Start Quiz';
            this.elements.get('quiz-mode-selector').style.display = 'block';
        };
    }

    /**
     * Generate a quiz question with options.
     * @returns {Object|null} {direction, countryName, capital, options, correctAnswer, countryObj}
     */
    generateQuestion() {
        const centroids = this.globeManager.getCentroids();
        const capitals = this.globeManager.getCapitalsData();

        // Exclude overseas territories / dependencies — too obscure / numerous to be
        // fair quiz targets — and restrict to countries that actually have a capital
        // entry (sovereign countries only).
        const depNames = new Set(Object.keys(
            this.globeManager.getDependencyData ? this.globeManager.getDependencyData() : {}
        ));
        const quizCentroids = centroids.filter(c => !depNames.has(c.name) && capitals[c.name]);

        // Filter out countries already used in this quiz
        const availableCountries = quizCentroids.filter(c => !this.usedCountries.includes(c.name));

        if (availableCountries.length < 4) {
            console.error('Not enough countries with capitals for quiz');
            return null;
        }

        // Select random country as the correct answer
        const correctIndex = Math.floor(Math.random() * availableCountries.length);
        const correctCountry = availableCountries[correctIndex];

        // Mark this country as used
        this.usedCountries.push(correctCountry.name);

        // Pick 3 geographically closest countries as distractors (same fairness
        // approach as the name-the-country quiz).
        const distractors = quizCentroids
            .filter(country => country.name !== correctCountry.name)
            .map(country => ({
                country,
                distance: this.calculateGreatCircleDistance(correctCountry, country)
            }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 3)
            .map(item => item.country);

        const allCountries = [correctCountry, ...distractors];

        // Randomly choose the question direction.
        const direction = Math.random() < 0.5 ? 'forward' : 'reverse';

        let options, correctAnswer;
        if (direction === 'forward') {
            // Ask the capital — options are capital names.
            options = allCountries.map(c => capitals[c.name].name);
            correctAnswer = capitals[correctCountry.name].name;
        } else {
            // Ask the country — options are country names.
            options = allCountries.map(c => c.name);
            correctAnswer = correctCountry.name;
        }

        // Shuffle the options
        const shuffledOptions = options.sort(() => Math.random() - 0.5);

        return {
            direction,
            countryName: correctCountry.name,
            capital: capitals[correctCountry.name],
            options: shuffledOptions,
            correctAnswer,
            countryObj: correctCountry
        };
    }

    /**
     * Load next question
     */
    nextQuestion() {
        this.currentQuestion = this.generateQuestion();

        if (!this.currentQuestion) {
            console.error('Failed to generate quiz question');
            return;
        }

        // Hide result, next button
        this.elements.get('quiz-result').style.display = 'none';
        this.elements.get('quiz-next-btn').style.visibility = 'hidden';

        const { direction, countryName, capital } = this.currentQuestion;

        // Set the question prompt text and the 2D-map visual for each direction.
        const questionEl = this.elements.get('quiz-question');
        if (direction === 'forward') {
            // "What is the capital of X?" — show the country with a red dot + "?".
            questionEl.textContent = `What is the capital of ${countryName}?`;
            this.countryMap.showForQuiz(countryName, 'capital');
        } else {
            // "Y is the capital of which country?" — show only the country outline.
            questionEl.textContent = `${capital.name} is the capital of which country?`;
            this.countryMap.showForQuiz(countryName, 'shape');
        }

        // Clear previous options completely
        const optionsContainer = this.elements.get('quiz-options');
        optionsContainer.innerHTML = '';

        // Small delay to ensure DOM is clean before creating new buttons
        setTimeout(() => {
            this.currentQuestion.options.forEach(optionText => {
                const button = document.createElement('button');
                button.className = 'quiz-option';
                button.disabled = false;
                button.removeAttribute('style');

                const nameSpan = document.createElement('span');
                nameSpan.textContent = optionText;
                button.appendChild(nameSpan);

                button.dataset.answer = optionText;
                button.addEventListener('click', () => this.handleAnswer(optionText));
                optionsContainer.appendChild(button);
            });
        }, 0);
    }

    /**
     * Handle quiz answer selection
     * @param {string} selectedAnswer - Text of the selected option
     */
    handleAnswer(selectedAnswer) {
        const isCorrect = selectedAnswer === this.currentQuestion.correctAnswer;

        // Update score if correct
        if (isCorrect) {
            this.score++;
            state.set('quiz.score', this.score);
        }
        this.questionsAnswered++;
        state.set('quiz.questionsAnswered', this.questionsAnswered);

        this.updateScoreDisplay();

        // Disable all option buttons and color correct/incorrect (color only — no
        // appended label, which would reflow the grid).
        const optionButtons = document.querySelectorAll('.quiz-option');
        optionButtons.forEach(button => {
            button.disabled = true;
            if (button.dataset.answer === this.currentQuestion.correctAnswer) {
                button.classList.add('correct');
            } else if (button.dataset.answer === selectedAnswer && !isCorrect) {
                button.classList.add('incorrect');
            }
        });

        this.elements.get('quiz-result').style.display = 'none';

        // Reveal the full 2D map (basemap, outline, named capital) for both directions.
        this.countryMap.revealQuizAnswer();

        if (this.questionsAnswered >= 10) {
            setTimeout(() => {
                this.end();
            }, 2000);
        } else {
            // Show next button for 3 seconds, then auto-advance
            this.elements.get('quiz-next-btn').style.visibility = 'visible';

            if (this.autoAdvanceTimer) {
                clearTimeout(this.autoAdvanceTimer);
            }

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

    /** End the quiz immediately without showing the celebration. */
    cancel() {
        if (this.autoAdvanceTimer) {
            clearTimeout(this.autoAdvanceTimer);
            this.autoAdvanceTimer = null;
        }
        this.active = false;
        state.set('quiz.active', false);
        state.set('quiz.mode', null);

        document.body.classList.remove('quiz-active');

        this.elements.get('quiz-score').style.display = 'none';
        this.elements.get('quiz-question').style.display = 'none';
        this.elements.get('quiz-options').innerHTML = '';
        this.elements.get('quiz-container').style.display = 'none';

        // Close the 2D map and reset globe highlighting + capital marker.
        if (this.countryMap) this.countryMap.hide();
        this.globeManager.clearSelection();
        this.globeManager.clearCapitalMarker();
        if (this.labelManager) this.labelManager.setHighlight(null);

        this.elements.get('search-container').style.display = 'block';
        this.elements.get('take-quiz-btn').style.display = 'block';

        this.elements.get('quiz-cancel-btn').style.display = 'none';
        this.elements.get('quiz-next-btn').style.visibility = 'hidden';
        this.elements.get('quiz-start-btn').style.display = 'block';
        this.elements.get('quiz-start-btn').textContent = 'Start Quiz';
    }
}
