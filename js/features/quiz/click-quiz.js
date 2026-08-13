/**
 * Click Country Quiz ("Find the country")
 *
 * Shows "CLICK / {country}" and asks the player to tap that country on the globe.
 * There is no timer pressure: the globe is never framed toward the answer and stays
 * freely rotatable, so the player can bring any country face-on before tapping. The
 * first tap is the answer (one shot) — a wrong pick flashes red, the correct country
 * is revealed green, and the quiz advances. 10 questions, score out of 10.
 *
 * Structurally mirrors CapitalCitiesQuiz: the shared floating QuizQuestionChrome
 * (top bar / score / count-up time chip / progress / prompt), the shared count-up
 * QuizTimer, quiz-history recording, and the shared celebration overlay. The only
 * difference is the answer is a globe map-click rather than a multiple-choice grid.
 */

import { state } from '../../data/state.js';
import { quizHistoryStore } from '../../data/quiz-history-store.js';
import { QuizQuestionChrome } from './quiz-question-chrome.js';
import {
    createSession, fromPlan, generateClickCountrySession, systemRng, toHistoryRecord
} from '@terragotcha/quiz-core';

import * as THREE from 'three';

const TOTAL_QUESTIONS = 10;

export class ClickQuiz {
    constructor(options = {}) {
        this.globeManager = options.globeManager;
        this.cameraController = options.cameraController;
        this.elements = options.elements;
        this.showQuizCelebration = options.showQuizCelebration;
        this.clearQuizTimers = options.clearQuizTimers;
        this.countryTable = options.countryTable;
        this.quizTimer = options.quizTimer;

        // Quiz state
        this.active = false;
        this.scope = 'globe'; // Region filter: 'globe' or a region name
        // Score / progress / per-question log live in the quiz-core session.
        this.session = null;
        this.total = TOTAL_QUESTIONS; // actual question count (may be < 10 for a small region)
        this.answering = false; // Guards the reveal window so a second tap is ignored
        this.advanceTimer = null;

        // Shared floating question-screen chrome — the same one the Capital Cities
        // and Name-the-Country quizzes use, so this quiz matches their look and
        // floats over the live globe (which is the question).
        this.chrome = new QuizQuestionChrome({
            elements: this.elements,
            onClose: () => this.cancel(),
            variant: 'floating'
        });

        // One-line "you can rotate" affordance, reused from the Daily Challenge's
        // map-click question. Created once and slotted under the prompt after the
        // chrome is built (no static markup in index.html, per CLAUDE.md).
        this.hint = document.createElement('div');
        this.hint.className = 'dq-map-hint';
        this.hint.textContent = 'Drag to rotate · tap your answer';
    }

    /**
     * Start the quiz
     * @param {string} scope - 'globe' for all countries, or a region name
     */
    /** Live score, read straight from the session so there's one source of truth. */
    get score() { return this.session ? this.session.getState().score : 0; }

    /** 0-based index of the question on screen. */
    get currentIndex() { return this.session ? this.session.getState().index : 0; }

    start(scope = 'globe') {
        this.active = true;
        this.scope = scope;
        this.answering = false;

        // Update state
        state.set('quiz.active', true);
        state.set('quiz.mode', 'click-country');

        // Pick up to 10 random countries from the chosen region. The area filter
        // (and its "N. America & Caribbean" exemption) now lives in quiz-core.
        // This mode plans the whole session up front — there are no per-question
        // options to build — so it feeds the session a plan rather than a
        // generator.
        const plan = generateClickCountrySession({
            countries: this.countryTable.all,
            scope: this.scope,
            count: TOTAL_QUESTIONS,
            rng: systemRng
        });
        // A small region (e.g. Oceania after filtering) may yield fewer than 10 —
        // run exactly as many questions as we have targets.
        this.total = plan.length;

        this.session = createSession({
            mode: 'click-country',
            scope,
            countries: this.countryTable.all,
            rng: systemRng,
            total: plan.length,
            nextQuestion: fromPlan(plan)
        });

        // Disable auto-rotation but keep manual rotation on — the player brings
        // their intended country face-on before tapping. Start from a neutral
        // overview; the camera is never moved toward the answer after this.
        const controls = this.cameraController.getControls();
        controls.autoRotate = false;
        controls.enableRotate = true;
        this.cameraController.zoomOut();

        // globe-quiz-active turns #quiz-container into the floating panel that lets
        // the live globe (the question) show through behind it.
        document.body.classList.add('quiz-active');
        document.body.classList.add('globe-quiz-active');

        // Clear inline display overrides left over from a previous quiz/end so the
        // CSS rules driven by body.quiz-active can govern visibility again.
        this.elements.get('quiz-container').style.display = '';
        this.elements.get('take-quiz-btn').style.display = '';
        this.elements.get('quiz-start-btn').style.display = 'none';
        this.elements.get('quiz-next-btn').style.visibility = 'hidden';
        // No answer grid — this quiz answers by tapping the globe.
        this.elements.get('quiz-options').innerHTML = '';

        // Build the floating chrome before the timer starts — the timer binds to
        // the #quiz-timer span that lives inside the chrome's time chip.
        this.chrome.show();
        this.chrome.setTotal(this.total); // "Q n/N" + progress reflect the real count
        this.chrome.setScore(0, 0);

        // Slot the rotate hint under the prompt (the chrome is rebuilt on show()).
        const prompt = this.chrome.root && this.chrome.root.querySelector('.qz-prompt');
        if (prompt) prompt.insertAdjacentElement('afterend', this.hint);
        this.hint.style.display = '';

        // Start the count-up timer
        this.quizTimer.start();

        // Show first question
        this.session.begin();
        this.showQuestion();
    }

    /**
     * End the quiz and show the celebration overlay.
     */
    end() {
        this.active = false;
        this.answering = false;
        if (this.advanceTimer) {
            clearTimeout(this.advanceTimer);
            this.advanceTimer = null;
        }

        // Update state
        state.set('quiz.active', false);
        state.set('quiz.mode', null);

        // Tear down the floating chrome (and its hint) and body classes.
        this.chrome.hide();
        if (this.hint.parentNode) this.hint.parentNode.removeChild(this.hint);
        document.body.classList.remove('quiz-active');
        document.body.classList.remove('globe-quiz-active');

        // Reset globe highlighting and zoom back out.
        this.globeManager.clearSelection();
        this.cameraController.zoomOut();

        // Stop the timer, persist the result, and show the celebration overlay.
        // Score is out of the actual number of questions asked (usually 10, fewer
        // for a small region).
        const elapsedMs = this.quizTimer.stop();
        const summary = quizHistoryStore.record(
            toHistoryRecord(this.session.getState(), elapsedMs)
        );
        // The results modal owns Play again (→ quiz chooser) / Share / Globe.
        this.showQuizCelebration({
            score: this.score,
            total: this.total,
            seconds: elapsedMs / 1000,
            mode: 'click-country',
            scope: this.scope,
            summary
        });
    }

    /**
     * Show the current question — "CLICK / {country}" in the chrome prompt. The
     * camera is never moved; the player rotates the globe themselves.
     */
    showQuestion() {
        this.answering = false;
        this.globeManager.clearSelection();

        const live = this.session.getState().current;
        if (!live) { this.end(); return; }

        this.chrome.setQuestion(this.currentIndex + 1);
        this.chrome.setPrompt({ layout: 'reverse', eyebrow: 'CLICK', main: live.meta.country });
    }

    /**
     * Handle a country click during the quiz. The first tap is the answer.
     * @param {string} clickedCountryName - Name of the clicked country
     */
    handleAnswer(clickedCountryName) {
        // Ignore taps fired during the post-answer reveal window.
        if (this.answering) return;
        this.answering = true;

        const correctCountryName = this.session.getState().current.meta.country;

        // Scoring and the history log happen in the session.
        const { reveal } = this.session.answer(clickedCountryName);
        const isCorrect = reveal.correct;
        this.chrome.setScore(this.score, this.currentIndex + 1);

        // Reveal the correct country: highlight it (persistent tint) and flash it
        // green. On a wrong pick the correct country is usually off-screen (the
        // player was hunting elsewhere), so the highlight alone gives no feedback —
        // rotate the globe to bring it into view. The longer flash keeps it lit
        // while the ~1s camera move lands; allow extra time before advancing.
        this.globeManager.setSelectedCountry(correctCountryName);
        this.globeManager.flashCountry(correctCountryName, 0x33dd66, isCorrect ? 1600 : 2400);

        let delay = 1200;
        if (!isCorrect) {
            this.cameraController.rotateToCountry(correctCountryName, true);
            delay = 2600;
        }

        // Advance after the reveal delay. Clear the small-country reveal overlay
        // (white disc + yellow arrow that rotateToCountry drops on a wrong answer)
        // at the transition, so it never lingers into the next question.
        this.advanceTimer = setTimeout(() => {
            this.advanceTimer = null;
            this.cameraController.clearSmallCountryIndicator();
            this.session.advance();
            if (this.session.getState().status === 'complete') {
                this.end();
            } else {
                this.showQuestion();
            }
        }, delay);
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
        if (this.advanceTimer) {
            clearTimeout(this.advanceTimer);
            this.advanceTimer = null;
        }
        this.quizTimer.cancel();
        this.active = false;
        this.answering = false;
        state.set('quiz.active', false);
        state.set('quiz.mode', null);

        this.chrome.hide();
        if (this.hint.parentNode) this.hint.parentNode.removeChild(this.hint);
        document.body.classList.remove('quiz-active');
        document.body.classList.remove('globe-quiz-active');

        // Reset globe highlighting and zoom back out.
        this.globeManager.clearSelection();
        this.cameraController.zoomOut();

        this.elements.get('quiz-container').style.display = '';
        // Clear the take-quiz override so CSS restores it (hidden on desktop,
        // shown on mobile); the desktop Start Quiz panel comes back on its own.
        this.elements.get('search-container').style.display = 'block';
        this.elements.get('take-quiz-btn').style.display = '';
    }
}
