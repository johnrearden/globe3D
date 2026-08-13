/**
 * Capital Cities Quiz Module
 * Each question randomly asks one of two directions:
 *   forward — "What is the capital of {Country}?"  → 4 capital-name options
 *   reverse — "{City} is the capital of which country?" → 4 country-name options
 * Structurally mirrors NameFlagQuiz (10 questions, 4-option multiple choice,
 * auto-advance, shared celebration overlay).
 */

import { state } from '../../data/state.js';
import { quizHistoryStore } from '../../data/quiz-history-store.js';
import { QuizQuestionChrome, svgIcon } from './quiz-question-chrome.js';
import { createSession, generateCapital, systemRng, toHistoryRecord } from '@terragotcha/quiz-core';

import * as THREE from 'three';

export class CapitalCitiesQuiz {
    constructor(options = {}) {
        this.globeManager = options.globeManager;
        this.cameraController = options.cameraController;
        this.elements = options.elements;
        this.rotateGlobeToCountry = options.rotateGlobeToCountry;
        this.showQuizCelebration = options.showQuizCelebration;
        this.clearQuizTimers = options.clearQuizTimers;
        this.countryTable = options.countryTable;
        this.labelManager = options.labelManager;
        this.quizTimer = options.quizTimer;

        // Quiz state
        // Score / progress / used-countries / per-question log all live in the
        // quiz-core session; only the view-side bits stay here.
        this.session = null;
        this.currentQuestion = null;
        this.autoAdvanceTimer = null;
        this.active = false;
        this.scope = 'globe'; // Region filter: 'globe' or a region name

        // Shared floating question-screen chrome (top bar / chips / progress /
        // prompt) — the same one the Name-the-Country quiz uses, so this quiz
        // matches its look and floats over the live globe.
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
    /** Live score, read straight from the session so there's one source of truth. */
    get score() { return this.session ? this.session.getState().score : 0; }

    /** Questions answered so far. */
    get questionsAnswered() { return this.session ? this.session.getState().answered : 0; }

    start(scope = 'globe') {
        this.active = true;
        this.scope = scope;

        this.session = createSession({
            mode: 'capital',
            scope,
            countries: this.countryTable.all,
            rng: systemRng,
            nextQuestion: generateCapital
        });

        // Update state
        state.set('quiz.active', true);
        state.set('quiz.mode', 'capital');
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
        // Marks this as the 4-option capitals quiz so the answer grid stays 2×2
        // (the shared mobile rule is a 3-col layout tuned for 6 options).
        document.body.classList.add('capital-quiz-active');

        // Clear any previous quiz options before starting
        const optionsContainer = this.elements.get('quiz-options');
        optionsContainer.innerHTML = '';
        optionsContainer.classList.add('qz-answers');

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

        // Build the floating chrome before the timer starts — the timer binds to
        // the #quiz-timer span that lives inside the chrome's time chip.
        this.chrome.show();
        this.chrome.setScore(0, 0);

        // Start the count-up timer
        this.quizTimer.start();

        // Load first question
        this.session.begin();
        this.renderQuestion();
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
        document.body.classList.remove('capital-quiz-active');

        // Hide quiz elements
        this.elements.get('quiz-score').style.display = 'none';
        this.elements.get('quiz-question').style.display = 'none';
        this.elements.get('quiz-options').innerHTML = '';
        this.elements.get('quiz-options').classList.remove('qz-answers');
        this.elements.get('quiz-container').style.display = 'none';

        // Reset globe highlighting + markers and zoom back out.
        this.globeManager.clearSelection();
        this.globeManager.markers.clear();
        this.cameraController.zoomOut();

        // Stop the timer, persist the result, and show the celebration overlay
        // with score + total time + standing/new best.
        const elapsedMs = this.quizTimer.stop();
        const summary = quizHistoryStore.record(
            toHistoryRecord(this.session.getState(), elapsedMs)
        );
        // The results modal owns Play again (→ quiz chooser) / Share / Globe.
        this.showQuizCelebration({
            score: this.score,
            total: this.questionsAnswered,
            seconds: elapsedMs / 1000,
            mode: 'capital',
            scope: this.scope,
            summary
        });
    }

    /**
     * Generate a quiz question with options.
     * @returns {Object|null} {direction, countryName, capital, options, correctAnswer, countryObj}
     */
    /**
     * Advance past a revealed question: the session either produces the next one
     * or reports the run is over.
     */
    nextQuestion() {
        this.session.advance();
        if (this.session.getState().status === 'complete') {
            this.end();
            return;
        }
        this.renderQuestion();
    }

    /**
     * Load next question
     */
    /** Render whatever question the session currently holds. */
    renderQuestion() {
        const live = this.session.getState().current;
        if (!live) {
            console.error('Failed to generate quiz question');
            this.end();
            return;
        }

        // Adapt quiz-core's payload to the shape this mode's DOM code expects.
        // The capital object comes from the globe so it keeps whatever extra
        // fields the marker/label code reads.
        const asked = live.meta.country;
        this.currentQuestion = {
            direction: live.meta.direction,
            countryName: asked,
            capital: this.globeManager.getCapital(asked),
            options: live.payload.grid.options.map(o => o.value),
            correctAnswer: live.answer.correct[0],
            countryObj: this.countryTable.centroidObj(asked)
        };

        // Hide result, next button
        this.elements.get('quiz-result').style.display = 'none';
        this.elements.get('quiz-next-btn').style.visibility = 'hidden';

        const { direction, countryName, capital, countryObj } = this.currentQuestion;

        // Reset the previous marker, then drop a dot (no name) on the capital.
        this.globeManager.markers.clear();
        this.globeManager.markers.place(capital.lat, capital.lng);

        // Drive the floating chrome prompt and frame the globe for each direction.
        // Both use the 'reverse' layout: a small uppercase eyebrow over the large
        // given entity (country or capital) with an accented "?".
        this.chrome.setQuestion(this.questionsAnswered + 1);
        if (direction === 'forward') {
            // "What is the capital of X?" — the country is given, so pan/zoom to
            // it; the dot marks the capital but its name stays hidden until the
            // answer is revealed.
            this.chrome.setPrompt({
                layout: 'reverse',
                eyebrow: 'WHAT IS THE CAPITAL OF',
                main: countryName,
                mainQuestion: true
            });
            const aimPoint = this.globeManager.latLngToVector3(capital.lat, capital.lng, 1.0, 0);
            this.cameraController.rotateToCountry(countryObj, true, aimPoint);
        } else {
            // "Y is the capital of which country?" — don't give the country away:
            // zoom way out so the globe fills ~25% of the screen width with the
            // dot visible, leaving the player to place it.
            this.chrome.setPrompt({
                layout: 'reverse',
                eyebrow: 'WHICH COUNTRY HAS THE CAPITAL',
                main: capital.name,
                mainQuestion: true
            });
            this.cameraController.frameWholeGlobe({ lat: capital.lat, lng: capital.lng, widthFraction: 0.25 });
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
        // Scoring, the history log (keyed on the country, since either direction
        // tests the same country↔capital pair) and used-country tracking all
        // happen in the session; this method is now purely the reveal.
        const { reveal } = this.session.answer(selectedAnswer);
        const isCorrect = reveal.correct;

        state.set('quiz.score', this.score);
        state.set('quiz.questionsAnswered', this.questionsAnswered);

        this.updateScoreDisplay();
        this.chrome.setScore(this.score, this.questionsAnswered);

        // Reveal outcome on every option: correct (green + check), the wrong pick
        // (red + ✕), and dim the rest — matching the Name-the-Country quiz. The
        // .qz-mark badge is an inline SVG icon (no icon font, per CLAUDE.md).
        const optionButtons = document.querySelectorAll('.quiz-option');
        optionButtons.forEach(button => {
            button.disabled = true;

            if (button.dataset.answer === this.currentQuestion.correctAnswer) {
                button.classList.add('correct');
                button.insertAdjacentHTML('beforeend',
                    `<span class="qz-mark qz-mark-correct">${svgIcon('check', 16)}</span>`);
            } else if (button.dataset.answer === selectedAnswer && !isCorrect) {
                button.classList.add('incorrect');
                button.insertAdjacentHTML('beforeend',
                    `<span class="qz-mark qz-mark-wrong">${svgIcon('x', 16)}</span>`);
            } else {
                button.classList.add('dimmed');
            }
        });

        this.elements.get('quiz-result').style.display = 'none';

        // Reveal the capital's name at the marker (no camera move). The green/red
        // option buttons already convey correct/incorrect.
        this.globeManager.markers.setLabel(this.currentQuestion.capital.name);
        this.globeManager.markers.showLabel();

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

        this.chrome.hide();
        document.body.classList.remove('quiz-active');
        document.body.classList.remove('globe-quiz-active');
        document.body.classList.remove('capital-quiz-active');

        this.elements.get('quiz-score').style.display = 'none';
        this.elements.get('quiz-question').style.display = 'none';
        this.elements.get('quiz-options').innerHTML = '';
        this.elements.get('quiz-options').classList.remove('qz-answers');
        // Clear the inline overrides (don't set 'none'/'block') so CSS restores
        // the idle state — Start Quiz panel on desktop, Take Quiz on mobile.
        this.elements.get('quiz-container').style.display = '';

        // Reset globe highlighting + markers and zoom back out.
        this.globeManager.clearSelection();
        this.globeManager.markers.clear();
        this.cameraController.zoomOut();
        if (this.labelManager) this.labelManager.setHighlight(null);

        this.elements.get('search-container').style.display = 'block';
        this.elements.get('take-quiz-btn').style.display = '';

        this.elements.get('quiz-cancel-btn').style.display = 'none';
        this.elements.get('quiz-next-btn').style.visibility = 'hidden';
        this.elements.get('quiz-start-btn').style.display = 'block';
        this.elements.get('quiz-start-btn').textContent = 'Start Quiz';
    }
}
