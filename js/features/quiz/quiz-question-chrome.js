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
    return `<svg class="fqq-svg" viewBox="0 0 256 256" width="${size}" height="${size}" `
        + `fill="currentColor" aria-hidden="true">${ICON[name]}</svg>`;
}

const TOTAL_QUESTIONS = 10;

export class QuizQuestionChrome {
    /**
     * @param {object} opts
     * @param {Map} opts.elements - dom element registry (needs 'quiz-container')
     * @param {Function} opts.onClose - called when the close button is tapped
     */
    constructor(opts = {}) {
        this.elements = opts.elements;
        this.onClose = opts.onClose || (() => {});
        this.root = null; // wrapper holding all chrome rows
    }

    /** Build the chrome DOM fresh and insert it into #quiz-container. */
    show() {
        this.hide(); // tear down any previous instance first

        // Remove any stale #quiz-timer (e.g. one another quiz left in #quiz-score)
        // so QuizTimer rebinds to the one we put in the time chip.
        document.querySelectorAll('#quiz-timer').forEach(el => el.remove());

        const root = document.createElement('div');
        root.id = 'fqq-chrome';
        root.innerHTML = `
            <div class="fqq-topbar">
                <div class="fqq-progress-label">QUESTION <span id="fqq-qnum">1</span> OF ${TOTAL_QUESTIONS}</div>
                <button type="button" class="fqq-close" aria-label="Close quiz">${svgIcon('x', 15)}</button>
            </div>
            <div class="fqq-chips">
                <div class="fqq-chip">
                    <span class="fqq-chip-icon">${svgIcon('checkCircle', 18)}</span>
                    <span class="fqq-chip-label">SCORE</span>
                    <span class="fqq-chip-val"><span id="fqq-score">0</span><span class="fqq-chip-sub">/<span id="fqq-answered">0</span></span></span>
                </div>
                <div class="fqq-chip">
                    <span class="fqq-chip-icon">${svgIcon('clock', 18)}</span>
                    <span class="fqq-chip-label">TIME</span>
                    <span class="fqq-chip-val"><span id="quiz-timer">0:00</span></span>
                </div>
            </div>
            <div class="fqq-progress"><div class="fqq-progress-fill" id="fqq-progress-fill"></div></div>
            <div class="fqq-prompt">
                <div class="fqq-eyebrow" id="fqq-eyebrow">WHICH COUNTRY</div>
                <div class="fqq-main" id="fqq-main">does this flag belong to?</div>
            </div>
        `;

        root.querySelector('.fqq-close').addEventListener('click', () => this.onClose());

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

    /** Update the "QUESTION n OF 10" label and the progress-bar fill. */
    setQuestion(n) {
        if (!this.root) return;
        const num = this.root.querySelector('#fqq-qnum');
        const fill = this.root.querySelector('#fqq-progress-fill');
        if (num) num.textContent = String(n);
        if (fill) fill.style.width = `${(n / TOTAL_QUESTIONS) * 100}%`;
    }

    /** Update the score chip ("score/answered"). */
    setScore(score, answered) {
        if (!this.root) return;
        const s = this.root.querySelector('#fqq-score');
        const a = this.root.querySelector('#fqq-answered');
        if (s) s.textContent = String(score);
        if (a) a.textContent = String(answered);
    }

    /**
     * Set the prompt for the active question direction.
     * @param {'forward'|'reverse'} type
     * @param {string} country - correct country (used by the reverse prompt)
     */
    setPrompt(type, country) {
        if (!this.root) return;
        const prompt = this.root.querySelector('.fqq-prompt');
        const eyebrow = this.root.querySelector('#fqq-eyebrow');
        const main = this.root.querySelector('#fqq-main');
        if (type === 'reverse') {
            // Small eyebrow over the large country name.
            prompt.classList.remove('fqq-prompt-forward');
            eyebrow.textContent = 'WHICH FLAG BELONGS TO';
            main.innerHTML = `${country}<span class="fqq-q">?</span>`;
            main.classList.add('fqq-main-lg');
        } else {
            // Forward: large bold "Which country" over small-caps "does this flag…".
            prompt.classList.add('fqq-prompt-forward');
            eyebrow.textContent = 'Which country';
            main.textContent = 'does this flag belong to?';
            main.classList.remove('fqq-main-lg');
        }
    }
}
