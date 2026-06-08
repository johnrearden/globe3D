/**
 * Quiz UI glue: the end-of-quiz celebration overlay, the mode-selector / results
 * show-hide helpers, and the small pure helpers injected into the quiz modes.
 *
 * The celebration picks one of three animations by score fraction; the animation
 * instances are injected (they're also driven by the dev buttons), assigned via
 * `quizUI.animations` once they've been built.
 */

import { elements, show, hide, showFlex } from '../../utils/dom.js';

// Score fraction at or below which the celebration shatters the globe.
const SHATTER_THRESHOLD = 0.3;
// Score fraction at which the celebration triggers the pinball animation.
const PINBALL_THRESHOLD = 1.0;
// How long the pinball plays before auto-restoring to rest pose.
const PINBALL_DURATION_MS = 3000;

/** Clear quiz timers (auto-advance, click-quiz interval). Returns nulled ids. */
export function clearQuizTimers(autoAdvanceTimer = null, clickQuizTimer = null) {
    if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
    if (clickQuizTimer) clearInterval(clickQuizTimer);
    return { autoAdvanceTimer: null, clickQuizTimer: null };
}

/** Great-circle distance (radians) between two country centroids on the unit sphere. */
export function calculateGreatCircleDistance(country1, country2) {
    const dotProduct = country1.centroid.dot(country2.centroid);
    const clampedDot = Math.max(-1, Math.min(1, dotProduct));
    return Math.acos(clampedDot);
}

// Confetti burst from both sides for a few seconds (canvas-confetti global).
function triggerConfetti() {
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10001 };

    const randomInRange = (min, max) => Math.random() * (max - min) + min;

    const interval = setInterval(() => {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) {
            return clearInterval(interval);
        }
        const particleCount = 50 * (timeLeft / duration);
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);
}

export class QuizUI {
    constructor({ animations = {} } = {}) {
        // { bounce, shatter, pinball } — assigned once the animations are built.
        this.animations = animations;
    }

    /** Show the celebration overlay and play a score-appropriate animation. */
    showCelebration(score, total, extraInfo = '') {
        const percentage = Math.round((score / total) * 100);
        const extraHTML = extraInfo
            ? `<div style="font-size: 1.2rem; margin-top: 15px; color: #E0E0E0;">${extraInfo}</div>`
            : '';

        elements.get('celebration-score').innerHTML = `
            <div style="font-size: 1rem; margin-bottom: 4px;">Your Score</div>
            <div>${score} / ${total} (${percentage}%)</div>
            ${extraHTML}
        `;

        showFlex(elements.get('quiz-celebration-overlay'));
        // Hide background UI chrome so the celebration is the only focus.
        document.body.classList.add('celebration-active');

        const fraction = total > 0 ? score / total : 0;
        if (fraction <= SHATTER_THRESHOLD) {
            if (this.animations.shatter) this.animations.shatter.start();
        } else if (fraction >= PINBALL_THRESHOLD) {
            triggerConfetti();
            if (this.animations.pinball) this.animations.pinball.start(PINBALL_DURATION_MS);
        } else {
            triggerConfetti();
            if (this.animations.bounce) this.animations.bounce.start();
        }
    }

    showModeSelector() {
        show(elements.get('quiz-mode-selector'));
    }

    hideModeSelector() {
        hide(elements.get('quiz-mode-selector'));
    }

    closeClickQuizResults() {
        hide(elements.get('click-quiz-results'));
        // Show search and quiz button again.
        show(elements.get('search-container'));
        show(elements.get('take-quiz-btn'));
    }
}
