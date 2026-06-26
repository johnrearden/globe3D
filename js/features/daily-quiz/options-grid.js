/**
 * OptionsGrid — a reusable grid of country (or capital) choices.
 *
 * Single-select submits on tap; multi-select toggles and is submitted by an
 * EXTERNAL button (the panel's persistent action row owns it) — the grid reports
 * selection changes via onSelectionChange and exposes submitSelected(). Variable
 * column counts; post-answer reveal colouring (right / wrong / missed). Cells use
 * minmax(0,1fr) tracks so the grid always fits the panel width (never scrolls
 * horizontally). Self-contained: it builds its own DOM inside the host element.
 *
 * Cells are `.quiz-option` buttons + `.qz-mark` reveal icons — the same markup and
 * design tokens as the practice quizzes (js/features/quiz) — so the Daily Challenge
 * shares their look; daily-specific rules live under `.dq-grid` in styles.css.
 */

import { svgIcon } from '../quiz/quiz-question-chrome.js';

export class OptionsGrid {
    constructor(host) {
        this.host = host;
        this.root = document.createElement('div');
        this.root.className = 'dq-grid-wrap';
        this.host.appendChild(this.root);
        this._cells = new Map();   // value -> cell element
        this._selected = new Set();
        this._locked = false;
    }

    /**
     * Render a question's options.
     * @param {Object} cfg
     * @param {Array<{value,label}>} cfg.options
     * @param {number} cfg.cols
     * @param {boolean} cfg.multiSelect
     * @param {string} [cfg.display]  'name' (default) — show label text
     * @param {(answer:string[])=>void} cfg.onSubmit  called with selected values
     * @param {(count:number)=>void} [cfg.onSelectionChange]  multi-select only:
     *        fired on every toggle so an external Submit button can enable itself
     */
    render(cfg) {
        this.clear();
        this._multi = !!cfg.multiSelect;
        this._onSubmit = cfg.onSubmit;
        this._onSelectionChange = cfg.onSelectionChange || null;
        this._locked = false;

        const grid = document.createElement('div');
        grid.className = 'dq-grid';
        // minmax(0,1fr) lets the tracks shrink below their content's min-content
        // width, so long country names never push the grid past the panel edge.
        grid.style.gridTemplateColumns = `repeat(${cfg.cols || 2}, minmax(0, 1fr))`;

        (cfg.options || []).forEach((opt) => {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'quiz-option';
            cell.dataset.value = opt.value;

            const label = document.createElement('span');
            label.className = 'dq-cell-label';
            label.textContent = opt.label != null ? opt.label : opt.value;
            cell.appendChild(label);

            cell.addEventListener('click', () => this._onCellClick(opt.value, cell));
            this._cells.set(opt.value, cell);
            grid.appendChild(cell);
        });
        this.root.appendChild(grid);
    }

    _onCellClick(value, cell) {
        if (this._locked) return;
        if (this._multi) {
            if (this._selected.has(value)) {
                this._selected.delete(value);
                cell.classList.remove('selected');
            } else {
                this._selected.add(value);
                cell.classList.add('selected');
            }
            if (this._onSelectionChange) this._onSelectionChange(this._selected.size);
        } else {
            this._locked = true;
            this._onSubmit([value]);
        }
    }

    /** Submit the current multi-select (called by the external Submit button). */
    submitSelected() {
        if (this._locked || !this._selected.size) return;
        this._locked = true;
        this._onSubmit([...this._selected]);
    }

    /**
     * Colour cells from a reveal object after the answer is graded, reusing the
     * practice-quiz feedback classes (.correct / .incorrect / .dimmed) + a trailing
     * .qz-mark icon. `missed` (a correct option the player didn't pick) keeps its
     * own distinct gold cue so multi-select reveals still separate "you got it"
     * (green) from "you missed it" (gold).
     */
    applyReveal(reveal) {
        this._locked = true;
        const right = new Set(reveal.rightPicks || []);
        const wrong = new Set(reveal.wrongPicks || []);
        const missed = new Set(reveal.missed || []);
        this._cells.forEach((cell, value) => {
            cell.classList.remove('selected');
            let mark = null;
            if (right.has(value)) { cell.classList.add('correct'); mark = 'correct'; }
            else if (wrong.has(value)) { cell.classList.add('incorrect'); mark = 'wrong'; }
            else if (missed.has(value)) { cell.classList.add('missed'); mark = 'missed'; }
            else cell.classList.add('dimmed');
            if (mark) {
                const glyph = mark === 'wrong' ? 'x' : 'check';
                cell.insertAdjacentHTML(
                    'beforeend',
                    `<span class="qz-mark qz-mark-${mark}">${svgIcon(glyph, 16)}</span>`,
                );
            }
        });
    }

    clear() {
        this.root.innerHTML = '';
        this._cells.clear();
        this._selected.clear();
    }

    destroy() {
        this.clear();
        if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
    }
}
