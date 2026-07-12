/**
 * Quiz Question Chrome (Identify-the-Flag screen)
 *
 * Builds the Terragotcha "Quiz Question" screen chrome — top bar (QUESTION n OF 10
 * + close), score/time stat chips, progress bar, and the question prompt — per the
 * design in design/flag_quiz/. Scoped to the flag quiz for now; the other quizzes
 * are restyled separately.
 *
 * Icons are inline SVG (no icon-font <link>, per CLAUDE.md), ported from Phosphor.
 * The chrome is built fresh on show() and removed on hide() so its #quiz-timer span
 * never lingers to confuse the shared QuizTimer when another quiz runs.
 */

// Phosphor glyphs (viewBox 0 0 256 256), filled with currentColor so CSS drives colour.
const ICON = {
    x: '<path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/>',
    clock: '<path d="M128,40a88,88,0,1,0,88,88A88.1,88.1,0,0,0,128,40Zm0,160a72,72,0,1,1,72-72A72.08,72.08,0,0,1,128,200Zm64-72a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z"/>',
    checkCircle: '<path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm45.66,85.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z"/>',
    check: '<path d="M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z"/>'
};

/** Build an inline SVG markup string for one of the ICON glyphs. */
export function svgIcon(name, size = 18) {
    return `<svg class="qz-svg" viewBox="0 0 256 256" width="${size}" height="${size}" `
        + `fill="currentColor" aria-hidden="true">${ICON[name]}</svg>`;
}

const TOTAL_QUESTIONS = 10;

export class QuizQuestionChrome {
    /**
     * @param {object} opts
     * @param {Map} opts.elements - dom element registry (needs 'quiz-container')
     * @param {Function} opts.onClose - called when the close button is tapped
     * @param {'fullscreen'|'floating'} [opts.variant] - 'fullscreen' (flag quiz,
     *   takes over the screen) or 'floating' (Name-the-Country quiz, a panel that
     *   floats over the live globe). Only adds a marker class; the container
     *   geometry lives in styles.css under the owning body class.
     * @param {number} [opts.total] - number of questions (denominator in "Q n/N"
     *   and the progress-bar scale). Defaults to 10; the Find-the-country quiz
     *   passes fewer when a small region can't supply 10 large countries.
     */
    constructor(opts = {}) {
        this.elements = opts.elements;
        this.onClose = opts.onClose || (() => {});
        this.variant = opts.variant || 'fullscreen';
        this.total = opts.total || TOTAL_QUESTIONS;
        this.root = null; // wrapper holding all chrome rows
    }

    /** Build the chrome DOM fresh and insert it into #quiz-container. */
    show() {
        this.hide(); // tear down any previous instance first

        // Remove any stale #quiz-timer (e.g. one another quiz left in #quiz-score)
        // so QuizTimer rebinds to the one we put in the time chip.
        document.querySelectorAll('#quiz-timer').forEach(el => el.remove());

        const root = document.createElement('div');
        root.id = 'qz-chrome';
        const progress = `<div class="qz-progress"><div class="qz-progress-fill" id="qz-progress-fill"></div></div>`;
        const prompt = `
            <div class="qz-prompt">
                <div class="qz-eyebrow" id="qz-eyebrow">WHICH COUNTRY</div>
                <div class="qz-main" id="qz-main">does this flag belong to?</div>
            </div>`;
        if (this.variant === 'floating') {
            // Compact, non-scrolling header: counter · score · time · close on a
            // single row, so the panel hugs the bottom edge with minimal height.
            root.classList.add('qz-floating');
            root.innerHTML = `
                <div class="qz-bar">
                    <div class="qz-progress-label">Q<span id="qz-qnum">1</span>/<span id="qz-qtotal">${this.total}</span></div>
                    <span class="qz-stat">
                        <span class="qz-stat-icon">${svgIcon('checkCircle', 15)}</span>
                        <span id="qz-score">0</span><span class="qz-stat-sub">/<span id="qz-answered">0</span></span>
                    </span>
                    <span class="qz-stat">
                        <span class="qz-stat-icon">${svgIcon('clock', 15)}</span>
                        <span id="quiz-timer">0:00</span>
                    </span>
                    <button type="button" class="qz-close" aria-label="Close quiz">${svgIcon('x', 15)}</button>
                </div>
                ${progress}
                ${prompt}
            `;
        } else {
            // Fullscreen variant: roomy top bar + score/time stat chips.
            root.innerHTML = `
                <div class="qz-topbar">
                    <div class="qz-progress-label">QUESTION <span id="qz-qnum">1</span> OF <span id="qz-qtotal">${this.total}</span></div>
                    <button type="button" class="qz-close" aria-label="Close quiz">${svgIcon('x', 15)}</button>
                </div>
                <div class="qz-chips">
                    <div class="qz-chip">
                        <span class="qz-chip-icon">${svgIcon('checkCircle', 18)}</span>
                        <span class="qz-chip-label">SCORE</span>
                        <span class="qz-chip-val"><span id="qz-score">0</span><span class="qz-chip-sub">/<span id="qz-answered">0</span></span></span>
                    </div>
                    <div class="qz-chip">
                        <span class="qz-chip-icon">${svgIcon('clock', 18)}</span>
                        <span class="qz-chip-label">TIME</span>
                        <span class="qz-chip-val"><span id="quiz-timer">0:00</span></span>
                    </div>
                </div>
                ${progress}
                ${prompt}
            `;
        }

        root.querySelector('.qz-close').addEventListener('click', () => this.onClose());

        // Insert at the top of the flex column so order: topbar → chips → progress →
        // prompt → (stage/options, ordered via CSS) → next button.
        const container = this.elements.get('quiz-container');
        container.insertBefore(root, container.firstChild);
        this.root = root;
    }

    /** Remove the chrome DOM (and its #quiz-timer). */
    hide() {
        if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
        this.root = null;
    }

    /**
     * Set the question total (denominator in "Q n/N" + progress-bar scale).
     * Call before setQuestion() when a quiz runs fewer than the default 10.
     */
    setTotal(total) {
        this.total = total || TOTAL_QUESTIONS;
        if (!this.root) return;
        const t = this.root.querySelector('#qz-qtotal');
        if (t) t.textContent = String(this.total);
    }

    /** Update the "QUESTION n OF N" label and the progress-bar fill. */
    setQuestion(n) {
        if (!this.root) return;
        const num = this.root.querySelector('#qz-qnum');
        const fill = this.root.querySelector('#qz-progress-fill');
        if (num) num.textContent = String(n);
        if (fill) fill.style.width = `${(n / this.total) * 100}%`;
    }

    /** Update the score chip ("score/answered"). */
    setScore(score, answered) {
        if (!this.root) return;
        const s = this.root.querySelector('#qz-score');
        const a = this.root.querySelector('#qz-answered');
        if (s) s.textContent = String(score);
        if (a) a.textContent = String(answered);
    }

    /**
     * Set the two-line prompt. Reusable across quizzes — the caller supplies the
     * copy and which line carries the emphasis.
     * @param {object} opts
     * @param {'forward'|'reverse'} [opts.layout] - 'forward': the eyebrow is the
     *   large Fredoka line over a small-caps main line (e.g. "Which country" /
     *   "does this flag belong to?"). 'reverse': a small uppercase eyebrow over a
     *   large main line (e.g. "WHICH FLAG BELONGS TO" / "France?").
     * @param {string} opts.eyebrow - first (top) line.
     * @param {string} opts.main - second (bottom) line.
     * @param {boolean} [opts.mainQuestion] - append an accented "?" to the main
     *   line (used by the reverse layout's country name).
     */
    setPrompt(opts = {}) {
        if (!this.root) return;
        const { layout = 'forward', eyebrow = '', main = '', mainQuestion = false } = opts;
        const prompt = this.root.querySelector('.qz-prompt');
        const eyebrowEl = this.root.querySelector('#qz-eyebrow');
        const mainEl = this.root.querySelector('#qz-main');
        if (layout === 'reverse') {
            // Small eyebrow over the large main line.
            prompt.classList.remove('qz-prompt-forward');
            eyebrowEl.textContent = eyebrow;
            mainEl.innerHTML = mainQuestion ? `${main}<span class="qz-q">?</span>` : main;
            mainEl.classList.add('qz-main-lg');
        } else {
            // Forward: large bold eyebrow over a small-caps main line.
            prompt.classList.add('qz-prompt-forward');
            eyebrowEl.textContent = eyebrow;
            mainEl.textContent = main;
            mainEl.classList.remove('qz-main-lg');
        }
    }
}
