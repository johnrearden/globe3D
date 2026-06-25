/**
 * Name the Country Quiz Module
 * Displays a highlighted country on the globe and asks the player to identify it by selecting the correct flag
 */

import { state } from '../../data/state.js';
import { quizHistoryStore } from '../../data/quiz-history-store.js';
import { QuizQuestionChrome, svgIcon } from './quiz-question-chrome.js';

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
        this.labelManager = options.labelManager;
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

        // Shared question-screen chrome (top bar / chips / progress / prompt),
        // floating-panel variant: it sits over the live globe rather than taking
        // over the screen like the flag quiz. See design/name_country_quiz/.
        this.chrome = new QuizQuestionChrome({
            elements: this.elements,
            onClose: () => this.cancel(),
            variant: 'floating'
        });
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
        state.set('quiz.mode', 'name-flag');
        state.set('quiz.score', 0);
        state.set('quiz.questionsAnswered', 0);

        // Disable auto-rotation during quiz
        const controls = this.cameraController.getControls();
        controls.autoRotate = false;

        // Add quiz-active class to body for mobile styling. globe-quiz-active
        // turns #quiz-container into the floating panel that lets the live globe
        // (the question) show through behind it.
        document.body.classList.add('quiz-active');
        document.body.classList.add('globe-quiz-active');

        // Clear any previous quiz options before starting
        const optionsContainer = this.elements.get('quiz-options');
        optionsContainer.innerHTML = '';
        optionsContainer.classList.add('qz-answers');

        // Clear any inline display overrides left over from cancelQuiz/end —
        // otherwise the container stays hidden and the Take Quiz button stays
        // visible despite the CSS rules driven by body.quiz-active.
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

        // Build the floating question-screen chrome (top bar / chips / progress /
        // prompt) before the timer starts — the timer binds to the #quiz-timer
        // span that lives inside the chrome's time chip.
        this.chrome.show();
        this.chrome.setScore(0, 0);

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

        // Tear down the floating chrome and its body classes.
        this.chrome.hide();
        document.body.classList.remove('quiz-active');
        document.body.classList.remove('globe-quiz-active');

        // Hide quiz elements
        this.elements.get('quiz-score').style.display = 'none';
        this.elements.get('quiz-question').style.display = 'none';
        this.elements.get('quiz-options').innerHTML = '';
        this.elements.get('quiz-options').classList.remove('qz-answers');
        this.elements.get('quiz-container').style.display = 'none';

        // Reset globe highlighting
        this.globeManager.clearSelection();

        // Stop the timer, persist the result, and show the celebration overlay
        // with score + total time + standing/new best.
        const elapsedMs = this.quizTimer.stop();
        const summary = quizHistoryStore.record({
            ts: Date.now(),
            mode: 'name-flag',
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
            mode: 'name-flag',
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

        // Exclude overseas territories / dependencies (Greenland, Pitcairn, …).
        // They stay clickable on the globe, but are too obscure / numerous to be
        // fair quiz targets — drop them as both answers and distractors.
        const depNames = new Set(Object.keys(
            this.globeManager.getDependencyData ? this.globeManager.getDependencyData() : {}
        ));
        const quizCentroids = centroids.filter(c => !depNames.has(c.name));

        // Filter out countries already used in this quiz
        const availableCountries = quizCentroids.filter(c => !this.usedCountries.includes(c.name));

        if (availableCountries.length < 1 || quizCentroids.length < 6) {
            console.error('Not enough countries for a 6-option quiz');
            return null;
        }

        // Select random country from available countries as the correct answer
        const correctIndex = Math.floor(Math.random() * availableCountries.length);
        const correctCountry = availableCountries[correctIndex];

        // Mark this country as used
        this.usedCountries.push(correctCountry.name);

        // Calculate distances to all other countries (including used ones for distractors)
        const distancesWithCountries = quizCentroids
            .filter(country => country.name !== correctCountry.name)
            .map(country => ({
                country: country,
                distance: this.calculateGreatCircleDistance(correctCountry, country)
            }));

        // Sort by distance (ascending - closest first)
        distancesWithCountries.sort((a, b) => a.distance - b.distance);

        // Select 5 closest countries as distractors (6 options total, per design)
        const distractors = distancesWithCountries
            .slice(0, 5)
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

        // Drive the floating chrome (counter + progress + prompt). The prompt
        // reuses the forward layout: large "Which country" over a quiet
        // "is highlighted on the globe".
        this.chrome.setQuestion(this.questionsAnswered + 1);
        this.chrome.setPrompt({
            layout: 'forward',
            eyebrow: 'Which country',
            main: 'is highlighted on the globe'
        });

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
        this.globeManager.setSelectedCountry(countryObj.name);

        const record = this.globeManager.getCountryByName(countryObj.name);
        if (record) {
            this.rotateGlobeToCountry(record, true);
        }
    }

    /**
     * Handle quiz answer selection
     * @param {string} selectedCountry - Name of selected country
     */
    handleAnswer(selectedCountry) {
        const isCorrect = selectedCountry === this.currentQuestion.correctCountry;

        // Record this question for quiz history (the country shown is the answer).
        this.questionLog.push({ country: this.currentQuestion.correctCountry, correct: isCorrect });

        // Update score if correct
        if (isCorrect) {
            this.score++;
            state.set('quiz.score', this.score);
        }
        this.questionsAnswered++;
        state.set('quiz.questionsAnswered', this.questionsAnswered);

        // Update score display (legacy spans + the chrome score chip).
        this.updateScoreDisplay();
        this.chrome.setScore(this.score, this.questionsAnswered);

        // Reveal outcome on every option: correct (green + check), the wrong pick
        // (red + ✕), and dim the rest. The .qz-mark badge is an inline SVG icon
        // (no icon font, per CLAUDE.md); CSS positions it per layout.
        const optionButtons = document.querySelectorAll('.quiz-option');
        optionButtons.forEach(button => {
            button.disabled = true;

            if (button.dataset.country === this.currentQuestion.correctCountry) {
                button.classList.add('correct');
                button.insertAdjacentHTML('beforeend',
                    `<span class="qz-mark qz-mark-correct">${svgIcon('check', 16)}</span>`);
            } else if (button.dataset.country === selectedCountry && !isCorrect) {
                button.classList.add('incorrect');
                button.insertAdjacentHTML('beforeend',
                    `<span class="qz-mark qz-mark-wrong">${svgIcon('x', 16)}</span>`);
            } else {
                button.classList.add('dimmed');
            }
        });

        // Don't show any result message - button feedback is sufficient
        this.elements.get('quiz-result').style.display = 'none';

        if (this.questionsAnswered >= 10) {
            setTimeout(() => {
                this.end();
            }, 2000);
        } else {
            // Reveal the Next button (bottom of the panel) for manual advance, and
            // also auto-advance. Give a wrong answer longer to read the correct one.
            this.elements.get('quiz-next-btn').style.visibility = 'visible';
            if (this.autoAdvanceTimer) {
                clearTimeout(this.autoAdvanceTimer);
            }
            const advanceDelay = isCorrect ? 1500 : 2500;
            this.autoAdvanceTimer = setTimeout(() => {
                this.elements.get('quiz-next-btn').style.visibility = 'hidden';
                this.autoAdvanceTimer = null;
                this.nextQuestion();
            }, advanceDelay);
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

        this.chrome.hide();
        document.body.classList.remove('quiz-active');
        document.body.classList.remove('globe-quiz-active');

        this.elements.get('quiz-score').style.display = 'none';
        this.elements.get('quiz-question').style.display = 'none';
        this.elements.get('quiz-options').innerHTML = '';
        this.elements.get('quiz-options').classList.remove('qz-answers');
        // Clear the inline overrides (don't set 'none'/'block') so CSS restores
        // the idle state — Start Quiz panel on desktop, Take Quiz on mobile.
        this.elements.get('quiz-container').style.display = '';

        this.globeManager.clearSelection();
        if (this.labelManager) this.labelManager.setHighlight(null);

        this.elements.get('search-container').style.display = 'block';
        this.elements.get('take-quiz-btn').style.display = '';

        this.elements.get('quiz-cancel-btn').style.display = 'none';
        this.elements.get('quiz-next-btn').style.visibility = 'hidden';
        this.elements.get('quiz-start-btn').style.display = 'block';
        this.elements.get('quiz-start-btn').textContent = 'Start Quiz';
    }
}
