/**
 * Quiz Timer Module
 *
 * A small count-up stopwatch shared by the three multiple-choice practice quizzes
 * (Name the Country, Identify the Flag, Capital Cities). It owns a subtle `#quiz-timer`
 * display injected as a child of `#quiz-score`, so it inherits the score element's
 * show/hide across every layout without extra visibility wiring.
 *
 * The Click-the-Country quiz has its own countdown bar and does not use this.
 */

import { elements } from '../../utils/dom.js';

/** Format a duration in milliseconds as "M:SS" (e.g. 67000 -> "1:07"). */
export function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export class QuizTimer {
    constructor() {
        this.startTime = 0;
        this.interval = null;
        this.displayEl = null;
    }

    /** Lazily create the `#quiz-timer` span inside `#quiz-score` (idempotent). */
    ensureDisplay() {
        // Re-query if the cached node was detached — the flag quiz moves #quiz-timer
        // into its chrome time chip and removes it on exit, so a stale ref would
        // otherwise leave the timer updating an orphaned node for other quizzes.
        if (this.displayEl && this.displayEl.isConnected) return this.displayEl;

        const existing = document.getElementById('quiz-timer');
        if (existing) {
            this.displayEl = existing;
            return existing;
        }

        const span = document.createElement('span');
        span.id = 'quiz-timer';
        const scoreEl = elements.get('quiz-score');
        if (scoreEl) scoreEl.appendChild(span);
        this.displayEl = span;
        return span;
    }

    /** Reset to 0:00 and begin counting up, ticking once per second. */
    start() {
        const display = this.ensureDisplay();
        this.startTime = Date.now();
        if (display) display.textContent = formatDuration(0);

        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => {
            if (this.displayEl) {
                this.displayEl.textContent = formatDuration(Date.now() - this.startTime);
            }
        }, 1000);
    }

    /** Stop counting and return the elapsed time in milliseconds. */
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        return Date.now() - this.startTime;
    }

    /** Stop counting without reporting elapsed time (quiz abandoned). */
    cancel() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
}
