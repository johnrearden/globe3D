/**
 * Quiz Results Modal
 *
 * The end-of-quiz "Quiz Results" card (design handoff: design/congratulations_modal).
 * A centered modal over a dimmed/blurred globe showing an animated score ring with a
 * count-up, a ratio-derived headline, a meta line (quiz name · scope), a time pill,
 * an optional best-score badge, and three actions: Play again / Share / Globe.
 *
 * Self-contained in the project's runtime-DOM style (cf. quiz-mode-picker.js): builds
 * its own DOM, owns the count-up animation, and manages show/hide. The score-gated
 * globe flourishes (shatter / confetti) stay in quiz-ui.js, which drives this modal.
 */

import { elements } from '../../utils/dom.js';
import { track } from '../analytics.js';

// Inline Phosphor SVG icons (256x256 viewBox, scaled via CSS — matches quiz-mode-picker).
const ICONS = {
    check: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>`,
    clock: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z"/></svg>`,
    arrowClockwise: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M197.67,186.37a8,8,0,0,1,0,11.29C196.58,198.73,170.82,224,128,224c-37.39,0-64.53-22.4-80-39.85V208a8,8,0,0,1-16,0V160a8,8,0,0,1,8-8H88a8,8,0,0,1,0,16H55.44C67.76,183.35,93,208,128,208c36,0,58.14-21.46,58.36-21.68A8,8,0,0,1,197.67,186.37ZM216,40a8,8,0,0,0-8,8V71.85C192.53,54.4,165.39,32,128,32,85.18,32,59.42,57.27,58.34,58.34a8,8,0,0,0,11.3,11.34C69.86,69.46,92,48,128,48c35,0,60.24,24.65,72.56,40H168a8,8,0,0,0,0,16h48a8,8,0,0,0,8-8V48A8,8,0,0,0,216,40Z"/></svg>`,
    shareNetwork: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M176,160a39.89,39.89,0,0,0-28.62,12.09l-46.1-29.63a39.8,39.8,0,0,0,0-28.92l46.1-29.63a40,40,0,1,0-8.66-13.45l-46.1,29.63a40,40,0,1,0,0,55.82l46.1,29.63A40,40,0,1,0,176,160Zm0-128a24,24,0,1,1-24,24A24,24,0,0,1,176,32ZM64,152a24,24,0,1,1,24-24A24,24,0,0,1,64,152Zm112,72a24,24,0,1,1,24-24A24,24,0,0,1,176,224Z"/></svg>`,
    globeHemisphereWest: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24ZM62.29,186.47l2.52-1.65A16,16,0,0,0,72,171.53l.21-36.23L93.17,104a3.62,3.62,0,0,0,.32.22l19.67,12.87a15.94,15.94,0,0,0,11.35,2.77L156,115.59a16,16,0,0,0,10-5.41l22.17-25.76A16,16,0,0,0,192,74V67.67A87.87,87.87,0,0,1,211.77,155l-16.14-14.76a16,16,0,0,0-16.93-3l-30.46,12.65a16.08,16.08,0,0,0-9.68,12.45l-2.39,16.19a16,16,0,0,0,11.77,17.81L169.4,202l2.36,2.37A87.88,87.88,0,0,1,62.29,186.47ZM40,128a87.78,87.78,0,0,1,9.64-40.1L73,104.51,52.13,135.82a8,8,0,0,0-1.29,3.78l-.22,38.77a88.1,88.1,0,0,1-10.62-50.37Zm136-64V74l-22.17,25.76-31.54,4.27L102.62,91.16a19.93,19.93,0,0,0-10.12-3.14l-32.14.21A88,88,0,0,1,128,40a87.44,87.44,0,0,1,48,14.24Z"/></svg>`,
    squaresFour: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M104,40H56A16,16,0,0,0,40,56v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,104,40Zm0,64H56V56h48v48Zm96-64H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm0,64H152V56h48v48Zm-96,32H56a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,104,136Zm0,64H56V152h48v48Zm96-64H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,200,136Zm0,64H152V152h48v48Z"/></svg>`
};

// Full circumference of the r=62 ring (2 * pi * 62), the SVG stroke-dasharray.
const RING_CIRCUMFERENCE = 2 * Math.PI * 62; // ≈ 389.56
// Count-up duration, easeOutCubic — matches the design prototype.
const COUNT_UP_MS = 950;

/** Headline text derived from the score ratio (design spec). */
function headlineFor(ratio) {
    if (ratio >= 1) return 'Perfect run!';
    if (ratio >= 0.8) return 'Brilliant work';
    if (ratio >= 0.6) return 'Nicely done';
    if (ratio >= 0.4) return 'Good effort';
    return 'Keep exploring';
}

/** "{m} min {s.d} seconds" — minutes int, seconds to one decimal; always shows the minutes segment. */
function formatTime(totalSeconds) {
    const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
    const m = Math.floor(safe / 60);
    const s = (safe - m * 60).toFixed(1);
    return `${m} min ${s} seconds`;
}

export class QuizResultsModal {
    constructor({ onPlayAgain = () => {}, onChooseQuiz = () => {}, onGlobe = () => {} } = {}) {
        this.onPlayAgain = onPlayAgain;
        this.onChooseQuiz = onChooseQuiz;
        this.onGlobe = onGlobe;

        this.visible = false;
        this._raf = null;
        this._hideTimer = null;
        this._last = null; // last shown result, for the Share text

        this._buildDOM();
        this._attachListeners();
    }

    _buildDOM() {
        this.container = document.createElement('div');
        this.container.id = 'quiz-results-modal';
        this.container.className = 'qr';
        this.container.style.display = 'none';

        this.container.innerHTML = `
            <div class="qr-card">
                <div class="qr-status qr-fade-item" style="animation-delay:.05s">
                    <span class="qr-status-icon">${ICONS.check}</span>
                    <span class="qr-status-text">Quiz complete</span>
                </div>

                <div class="qr-ring qr-fade-item" style="animation-delay:.1s">
                    <div class="qr-ring-glow"></div>
                    <svg class="qr-ring-svg" width="148" height="148" viewBox="0 0 148 148">
                        <defs>
                            <linearGradient id="qr-arc-gradient" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0" stop-color="#ffd9a8"></stop>
                                <stop offset="1" stop-color="#f59440"></stop>
                            </linearGradient>
                        </defs>
                        <circle class="qr-ring-track" cx="74" cy="74" r="62"></circle>
                        <circle class="qr-ring-arc" cx="74" cy="74" r="62"
                            stroke-dasharray="${RING_CIRCUMFERENCE.toFixed(2)}"
                            stroke-dashoffset="${RING_CIRCUMFERENCE.toFixed(2)}"></circle>
                    </svg>
                    <div class="qr-ring-center">
                        <div class="qr-ring-score">
                            <span class="qr-score-num">0</span><span class="qr-score-total">/0</span>
                        </div>
                        <div class="qr-ring-caption">Correct</div>
                    </div>
                </div>

                <div class="qr-headline qr-fade-item" style="animation-delay:.15s"></div>
                <div class="qr-meta qr-fade-item" style="animation-delay:.18s"></div>
                <div class="qr-best qr-fade-item" style="animation-delay:.2s; display:none;"></div>

                <div class="qr-time qr-fade-item" style="animation-delay:.22s">
                    <span class="qr-time-icon">${ICONS.clock}</span>
                    <span class="qr-time-label">Time</span>
                    <span class="qr-time-value"></span>
                </div>

                <div class="qr-fade-item" style="animation-delay:.26s">
                    <button class="qr-btn-primary" type="button">
                        <span class="qr-btn-icon">${ICONS.arrowClockwise}</span>Play again
                    </button>
                </div>

                <div class="qr-fade-item" style="animation-delay:.28s">
                    <button class="qr-btn-wide qr-choose" type="button">
                        <span class="qr-btn-icon">${ICONS.squaresFour}</span>Choose another quiz
                    </button>
                </div>

                <div class="qr-secondary qr-fade-item" style="animation-delay:.32s">
                    <button class="qr-btn-secondary qr-share" type="button">
                        <span class="qr-btn-icon">${ICONS.shareNetwork}</span><span class="qr-share-label">Share</span>
                    </button>
                    <button class="qr-btn-secondary qr-globe" type="button">
                        <span class="qr-btn-icon">${ICONS.globeHemisphereWest}</span>Globe
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(this.container);

        // Cache the bits the count-up + populate logic touches.
        this.scoreNumEl = this.container.querySelector('.qr-score-num');
        this.scoreTotalEl = this.container.querySelector('.qr-score-total');
        this.arcEl = this.container.querySelector('.qr-ring-arc');
        this.headlineEl = this.container.querySelector('.qr-headline');
        this.metaEl = this.container.querySelector('.qr-meta');
        this.bestEl = this.container.querySelector('.qr-best');
        this.timeValueEl = this.container.querySelector('.qr-time-value');
        this.shareBtn = this.container.querySelector('.qr-share');
        this.shareLabelEl = this.container.querySelector('.qr-share-label');
        this._shareFlashTimer = null;

        // Share needs the Web Share API or clipboard; drop the button if neither exists.
        if (!navigator.share && !(navigator.clipboard && navigator.clipboard.writeText)) {
            this.shareBtn.style.display = 'none';
        }
    }

    _attachListeners() {
        this.container.querySelector('.qr-btn-primary').addEventListener('click', () => {
            this.hide();
            this.onPlayAgain();
        });
        this.container.querySelector('.qr-choose').addEventListener('click', () => {
            this.hide();
            this.onChooseQuiz();
        });
        this.container.querySelector('.qr-globe').addEventListener('click', () => {
            this.hide();
            this.onGlobe();
        });
        this.shareBtn.addEventListener('click', () => this._share());
    }

    /**
     * Show the results modal and play the count-up animation.
     * @param {Object} opts
     * @param {number} opts.score      - correct answers
     * @param {number} opts.total      - total questions
     * @param {number} opts.seconds    - elapsed time (may be fractional)
     * @param {string} opts.quizName   - e.g. "Name the country"
     * @param {string} opts.scopeLabel - e.g. "Whole globe" or a region name
     * @param {?{text: string, isNewBest: boolean}} [opts.best] - best-score badge, or null
     */
    show({ score, total, seconds, quizName, scopeLabel, best = null }) {
        this._last = { score, total, seconds, quizName, scopeLabel };

        const ratio = total > 0 ? score / total : 0;

        // Static content.
        this.scoreTotalEl.textContent = `/${total}`;
        this.headlineEl.textContent = headlineFor(ratio);
        this.metaEl.textContent = `${quizName}  ·  ${scopeLabel}`;
        this.timeValueEl.textContent = formatTime(seconds);

        if (best && best.text) {
            this.bestEl.textContent = best.text;
            this.bestEl.classList.toggle('qr-best--new', !!best.isNewBest);
            this.bestEl.style.display = '';
        } else {
            this.bestEl.style.display = 'none';
        }

        // Reset the ring + number to empty before the count-up.
        this.scoreNumEl.textContent = '0';
        this.arcEl.style.strokeDashoffset = RING_CIRCUMFERENCE.toFixed(2);

        // Hide the surrounding chrome (reuses the existing celebration rules).
        document.body.classList.add('celebration-active');

        // Reveal with the staggered entrance (display → reflow → visible class).
        if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null; }
        this.visible = true;
        this.container.style.display = 'block';
        void this.container.offsetWidth; // force reflow so entrance animations replay
        this.container.classList.add('qr--visible');

        this._animateCountUp(score, ratio);
    }

    _animateCountUp(score, ratio) {
        if (this._raf) cancelAnimationFrame(this._raf);
        const start = performance.now();
        const tick = (now) => {
            const p = Math.min(1, (now - start) / COUNT_UP_MS);
            const t = 1 - Math.pow(1 - p, 3); // easeOutCubic
            this.scoreNumEl.textContent = String(Math.round(score * t));
            this.arcEl.style.strokeDashoffset = (RING_CIRCUMFERENCE * (1 - ratio * t)).toFixed(2);
            if (p < 1) this._raf = requestAnimationFrame(tick);
            else this._raf = null;
        };
        this._raf = requestAnimationFrame(tick);
    }

    hide() {
        if (!this.visible) return;
        this.visible = false;

        if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
        this.container.classList.remove('qr--visible');
        this._hideTimer = setTimeout(() => {
            if (!this.visible) this.container.style.display = 'none';
        }, 400); // matches the CSS exit transition

        // Restore the idle chrome the quiz modes hid (mirrors their cancel()).
        document.body.classList.remove('celebration-active');
        const search = elements.get('search-container');
        if (search) search.style.display = 'block';
        const takeQuiz = elements.get('take-quiz-btn');
        if (takeQuiz) takeQuiz.style.display = '';
    }

    _share() {
        if (!this._last) return;
        const { score, total, quizName, scopeLabel, seconds } = this._last;
        track('share', { method: navigator.share ? 'web_share' : 'clipboard', score, total });
        const text = `I scored ${score}/${total} on ${quizName} (${scopeLabel}) in ${formatTime(seconds)} — Terragotcha`;

        // Web Share API is the preferred path, but it's not implemented on every
        // desktop browser (e.g. Chrome on Linux), so fall back to the clipboard.
        // Either way give visible feedback — a silent copy reads as "broken".
        if (navigator.share) {
            navigator.share({ title: 'Terragotcha', text })
                .then(() => this._flashShareLabel('Shared!'))
                .catch((err) => {
                    // User-cancelled share is not an error; only fall back on real failures.
                    if (err && err.name === 'AbortError') return;
                    this._copyToClipboard(text);
                });
        } else {
            this._copyToClipboard(text);
        }
    }

    _copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
                .then(() => this._flashShareLabel('Copied!'))
                .catch(() => this._flashShareLabel('Copy failed'));
        } else {
            this._flashShareLabel('Copy failed');
        }
    }

    /** Briefly swap the Share button label to confirm the action, then restore it. */
    _flashShareLabel(message) {
        if (this._shareFlashTimer) clearTimeout(this._shareFlashTimer);
        this.shareLabelEl.textContent = message;
        this.shareBtn.classList.add('qr-share--flash');
        this._shareFlashTimer = setTimeout(() => {
            this.shareLabelEl.textContent = 'Share';
            this.shareBtn.classList.remove('qr-share--flash');
            this._shareFlashTimer = null;
        }, 1600);
    }
}
