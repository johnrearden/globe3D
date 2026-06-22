/**
 * OptionsGrid — a reusable grid of country (or capital) choices.
 *
 * Handles both single-select (submit on tap) and multi-select (toggle + Submit),
 * variable column counts, and post-answer reveal colouring (right / wrong /
 * missed). Cells use minmax(0,1fr) tracks so the grid always fits the panel width
 * (never scrolls horizontally). Self-contained: it builds its own DOM inside the
 * host element passed to render().
 */

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
     */
    render(cfg) {
        this.clear();
        this._multi = !!cfg.multiSelect;
        this._onSubmit = cfg.onSubmit;
        this._locked = false;

        const grid = document.createElement('div');
        grid.className = 'dq-grid';
        // minmax(0,1fr) lets the tracks shrink below their content's min-content
        // width, so long country names never push the grid past the panel edge.
        grid.style.gridTemplateColumns = `repeat(${cfg.cols || 2}, minmax(0, 1fr))`;

        (cfg.options || []).forEach((opt) => {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'dq-cell';
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

        if (this._multi) {
            this._submitBtn = document.createElement('button');
            this._submitBtn.type = 'button';
            this._submitBtn.className = 'dq-submit';
            this._submitBtn.textContent = 'Submit';
            this._submitBtn.addEventListener('click', () => this._submit());
            this.root.appendChild(this._submitBtn);
            this._updateSubmitState();
        }
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
            this._updateSubmitState();
        } else {
            this._locked = true;
            this._onSubmit([value]);
        }
    }

    _updateSubmitState() {
        if (this._submitBtn) {
            this._submitBtn.textContent = this._selected.size
                ? `Submit (${this._selected.size})`
                : 'Submit';
        }
    }

    _submit() {
        if (this._locked) return;
        this._locked = true;
        this._onSubmit([...this._selected]);
    }

    /** Colour cells from a reveal object after the answer is graded. */
    applyReveal(reveal) {
        this._locked = true;
        const right = new Set(reveal.rightPicks || []);
        const wrong = new Set(reveal.wrongPicks || []);
        const missed = new Set(reveal.missed || []);
        this._cells.forEach((cell, value) => {
            if (right.has(value)) cell.classList.add('reveal-right');
            else if (wrong.has(value)) cell.classList.add('reveal-wrong');
            else if (missed.has(value)) cell.classList.add('reveal-missed');
            cell.classList.add('reveal-dim');
        });
        if (this._submitBtn) this._submitBtn.disabled = true;
    }

    clear() {
        this.root.innerHTML = '';
        this._cells.clear();
        this._selected.clear();
        this._submitBtn = null;
    }

    destroy() {
        this.clear();
        if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
    }
}
