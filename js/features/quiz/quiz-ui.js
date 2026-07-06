/**
 * Quiz UI glue: the end-of-quiz results modal trigger, the mode-selector / results
 * show-hide helpers, and the small pure helpers injected into the quiz modes.
 *
 * `showCelebration` plays a score-gated globe flourish (shatter on a poor run,
 * confetti on a perfect one) and then hands the result to the QuizResultsModal.
 * Both the animation instances (`quizUI.animations`) and the modal
 * (`quizUI.resultsModal`) are injected once they've been built.
 */

import { elements, show, hide } from '../../utils/dom.js';
import { MODE_LABELS } from '../../data/quiz-history-store.js';
import { track } from '../analytics.js';

// Score fraction at or below which the celebration shatters the globe.
const SHATTER_THRESHOLD = 0.3;

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

/**
 * Turn a `quizHistoryStore.record()` summary into best-score badge data for the
 * results modal: a "🎉 New best!" shout on a personal best, otherwise the standing
 * best once there's a history to compare against, or null on a first-ever game.
 * Mirrors `formatBestSuffix` (quiz-history-store.js) as structured data.
 */
function bestBadge(summary) {
    if (!summary) return null;
    if (summary.isNewBest) return { text: '🎉 New best!', isNewBest: true };
    if (summary.gamesPlayed > 1) return { text: `Best ${summary.bestScore}/${summary.total}`, isNewBest: false };
    return null;
}

export class QuizUI {
    constructor({ animations = {} } = {}) {
        // { bounce, shatter, pinball } — assigned once the animations are built.
        this.animations = animations;
        // QuizResultsModal instance — assigned post-construction in index.html
        // (mirrors how `animations` is wired up after the modes are built).
        this.resultsModal = null;
    }

    /**
     * Show the end-of-quiz results modal and play a score-gated globe flourish.
     * Shatter for a poor run (≤30%), confetti for a perfect run; mid-range plays
     * nothing (the bounce/pinball animations are kept but no longer auto-triggered).
     *
     * @param {Object} opts
     * @param {number} opts.score   - correct answers
     * @param {number} opts.total   - total questions
     * @param {number} opts.seconds - elapsed time in seconds (may be fractional)
     * @param {string} opts.mode    - mode id ('name-flag', 'click-country', …)
     * @param {string} opts.scope   - 'globe' or a region name
     * @param {Object} [opts.summary] - the quizHistoryStore.record() return value
     */
    showCelebration({ score, total, seconds, mode, scope, summary }) {
        const fraction = total > 0 ? score / total : 0;

        track('quiz_complete', {
            mode: mode || 'unknown',
            scope: scope === 'globe' ? 'globe' : scope,
            score,
            total,
        });

        if (fraction <= SHATTER_THRESHOLD) {
            if (this.animations.shatter) this.animations.shatter.start();
        } else if (score === total) {
            triggerConfetti();
        }
        // Mid-range: no globe animation (bounce/pinball intentionally not called).

        this.resultsModal.show({
            score,
            total,
            seconds,
            quizName: MODE_LABELS[mode] || 'Quiz',
            scopeLabel: scope === 'globe' ? 'Whole globe' : scope,
            best: bestBadge(summary),
        });
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
