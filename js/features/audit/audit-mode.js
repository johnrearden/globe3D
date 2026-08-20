/**
 * AuditMode — superuser tool for reviewing Daily Challenge quizzes.
 *
 * Loaded (dynamically) only when a signed audit token is present, so players
 * never download it. Talks exclusively to the /api/audit endpoints (which
 * never create Attempts/AnswerRecords) and grades interactively-answered
 * questions locally, so auditing can't pollute leaderboards or player state.
 *
 * Two views inside one bottom-sheet panel:
 *   list      — date navigation + every question with its answer + flag state
 *   question  — the exact player rendering (QuestionPresenter) of one question,
 *               answerable for real, with "Reveal answer" and "Flag" shortcuts
 *
 * The question internals reuse the daily-quiz classes (.dq-prompt, .dq-grid-host,
 * …) so rendering is pixel-identical to what players see; the injected CSS only
 * covers the audit chrome (panel shell, list rows, nav).
 */

import { ApiError } from '../../data/api-client.js';
import { QuestionPresenter } from '../daily-quiz/question-renderer.js';
import { PanelSheet } from '../daily-quiz/panel-sheet.js';
import { svgIcon } from '../quiz/quiz-question-chrome.js';
import { FOREIGN_MODES, gradeLocally, quizStore, revealOnly } from '@terragotcha/quiz-core';

/** Local (not UTC) calendar date as YYYY-MM-DD, matching the date input. */
function localISODate(d = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftISODate(iso, days) {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d + days);
    return localISODate(date);
}

export class AuditMode {
    constructor({ apiClient, cameraController, globeManager, focusRegistry }) {
        this.api = apiClient;
        this.camera = cameraController;
        this.globe = globeManager;
        this.focusRegistry = focusRegistry;
        this.date = localISODate();
        this.data = null;         // last /api/audit/daily/<date> response
        this._viewing = null;     // question index while in the question view
        this._revealed = false;   // answer shown for the current question
        this._gen = 0;            // render generation (guards stale awaits)
    }

    // ---- public hooks (mirrors DailyQuiz; used by pointer-controls) ---------
    isAwaitingMapClick() {
        return this._viewing !== null && !this._revealed
            && this.presenter && this.presenter.isAwaitingMapClick();
    }

    handleMapClick(name) {
        if (this.presenter) this.presenter.submitMapClick(name);
    }

    // ------------------------------- boot ------------------------------------
    init() {
        this._injectStyles();
        this._buildDom();
        this.loadDate(this.date);
    }

    _buildDom() {
        this.panel = document.createElement('div');
        this.panel.id = 'audit-panel';
        this.panel.innerHTML = `
            <div class="dq-grab" role="button" tabindex="0" aria-label="Drag to show or hide the panel"></div>
            <div class="qz-bar dq-bar">
                <span class="audit-title">${svgIcon('checkCircle', 15)} Audit</span>
                <span class="audit-meta"></span>
                <button type="button" class="qz-close dq-close audit-close" aria-label="Close">${svgIcon('x', 15)}</button>
            </div>
            <div class="audit-list-view">
                <div class="audit-nav">
                    <button type="button" class="audit-btn audit-prev" aria-label="Previous day">&lsaquo;</button>
                    <input type="date" class="audit-date" />
                    <button type="button" class="audit-btn audit-next" aria-label="Next day">&rsaquo;</button>
                </div>
                <div class="audit-list"></div>
                <div class="audit-message"></div>
            </div>
            <div class="audit-question-view" hidden>
                <div class="audit-qnav">
                    <button type="button" class="audit-btn audit-back">&lsaquo; List</button>
                    <span class="audit-qcounter"></span>
                    <button type="button" class="audit-btn audit-reveal">Reveal answer</button>
                    <button type="button" class="audit-btn audit-flag-btn">&#9873; Flag</button>
                </div>
                <img class="dq-flag" alt="flag" style="display:none" />
                <div class="dq-prompt"></div>
                <div class="dq-grid-host"></div>
                <div class="dq-actions">
                    <button type="button" class="dq-submit" hidden>Submit</button>
                    <button type="button" class="dq-next audit-qnext" disabled>Next question</button>
                </div>
                <div class="dq-feedback"></div>
            </div>
        `;
        document.body.appendChild(this.panel);

        // Docked reopen pill for when the panel is closed but audit mode is live.
        this.toggleBtn = document.createElement('button');
        this.toggleBtn.id = 'audit-toggle';
        this.toggleBtn.type = 'button';
        this.toggleBtn.innerHTML = '&#9873; Audit';
        this.toggleBtn.hidden = true;
        this.toggleBtn.addEventListener('click', () => this.open());
        document.body.appendChild(this.toggleBtn);

        this.el = {
            meta: this.panel.querySelector('.audit-meta'),
            listView: this.panel.querySelector('.audit-list-view'),
            list: this.panel.querySelector('.audit-list'),
            message: this.panel.querySelector('.audit-message'),
            dateInput: this.panel.querySelector('.audit-date'),
            questionView: this.panel.querySelector('.audit-question-view'),
            qcounter: this.panel.querySelector('.audit-qcounter'),
            reveal: this.panel.querySelector('.audit-reveal'),
            flagBtn: this.panel.querySelector('.audit-flag-btn'),
            qnext: this.panel.querySelector('.audit-qnext'),
            prompt: this.panel.querySelector('.dq-prompt'),
            flag: this.panel.querySelector('.dq-flag'),
            gridHost: this.panel.querySelector('.dq-grid-host'),
            feedback: this.panel.querySelector('.dq-feedback'),
            submit: this.panel.querySelector('.dq-submit'),
        };

        this.el.dateInput.value = this.date;
        this.el.dateInput.addEventListener('change', () => {
            if (this.el.dateInput.value) this.loadDate(this.el.dateInput.value);
        });
        this.panel.querySelector('.audit-prev')
            .addEventListener('click', () => this.loadDate(shiftISODate(this.date, -1)));
        this.panel.querySelector('.audit-next')
            .addEventListener('click', () => this.loadDate(shiftISODate(this.date, 1)));
        this.panel.querySelector('.audit-close').addEventListener('click', () => this.close());
        this.panel.querySelector('.audit-back').addEventListener('click', () => this.backToList());
        this.el.reveal.addEventListener('click', () => this._revealCurrent());
        this.el.flagBtn.addEventListener('click', () => {
            if (this._viewing !== null) this.flagQuestion(this._viewing);
        });
        this.el.qnext.addEventListener('click', () => {
            const next = (this._viewing ?? -1) + 1;
            if (this.data && next < this.data.questions.length) this.viewQuestion(next);
            else this.backToList();
        });

        this.sheet = new PanelSheet(this.panel, {
            handles: [
                this.panel.querySelector('.dq-grab'),
                this.panel.querySelector('.dq-bar'),
            ],
        });

        this.presenter = new QuestionPresenter({
            cameraController: this.camera,
            globeManager: this.globe,
            focusRegistry: this.focusRegistry,
            els: {
                prompt: this.el.prompt,
                flag: this.el.flag,
                gridHost: this.el.gridHost,
                feedback: this.el.feedback,
                submit: this.el.submit,
            },
        });
    }

    // ------------------------------ list view --------------------------------
    async loadDate(dateStr) {
        this.date = dateStr;
        this.el.dateInput.value = dateStr;
        this.backToList();
        this.el.list.innerHTML = '';
        this._setMessage('Loading…');
        try {
            this.data = await this.api.getAuditQuiz(dateStr);
        } catch (e) {
            this.data = null;
            this._setMessage(this._errText(e));
            return;
        }
        this._setMessage('');
        this._renderList();
    }

    _renderList() {
        const d = this.data;
        this.el.meta.textContent =
            `${d.questionCount} questions · ${d.attemptCount} attempts · seed ${d.seed}`;
        this.el.list.innerHTML = '';
        d.questions.forEach((q, i) => {
            const row = document.createElement('div');
            row.className = 'audit-row';
            const flagBadge = q.flags.length
                ? `<span class="audit-flagged" title="${q.flags.length} flag(s)">&#9873; ${q.flags.length}</span>`
                : '';
            row.innerHTML = `
                <div class="audit-row-head">
                    <span class="audit-row-type">Q${i + 1} · ${q.type}</span>${flagBadge}
                </div>
                <div class="audit-row-prompt"></div>
                <div class="audit-row-answer"></div>
                <div class="audit-row-actions">
                    <button type="button" class="audit-btn audit-view">View on globe</button>
                    <button type="button" class="audit-btn audit-flag">&#9873; Flag</button>
                </div>
            `;
            row.querySelector('.audit-row-prompt').textContent = q.prompt;
            row.querySelector('.audit-row-answer').textContent =
                `Answer: ${(q.answer.correct || []).join(', ')}`;
            row.querySelector('.audit-view').addEventListener('click', () => this.viewQuestion(i));
            row.querySelector('.audit-flag').addEventListener('click', () => this.flagQuestion(i));
            this.el.list.appendChild(row);
        });
    }

    // ---------------------------- question view ------------------------------
    async viewQuestion(index) {
        if (!this.data) return;
        if (document.body.classList.contains('dq-active')) return; // daily quiz running
        const q = this.data.questions[index];
        if (!q) return;

        const gen = ++this._gen;
        this._viewing = index;
        this._revealed = false;
        this._enterQuestionMode();
        this.el.listView.hidden = true;
        this.el.questionView.hidden = false;
        this.el.qcounter.textContent = `Q${index + 1}/${this.data.questions.length}`;
        this.el.qnext.disabled = false;
        this.el.qnext.textContent =
            index + 1 < this.data.questions.length ? 'Next question' : 'Back to list';
        if (this.sheet) this.sheet.expand();

        const { answer } = await this.presenter.render(q.payload);
        if (gen !== this._gen || this._revealed) return;  // navigated away / revealed
        this._revealed = true;
        this.presenter.showReveal(gradeLocally(q.answer.correct, answer), q.payload);
    }

    _revealCurrent() {
        if (this._viewing === null || this._revealed || !this.data) return;
        const q = this.data.questions[this._viewing];
        this._revealed = true;
        this.presenter.showReveal(revealOnly(q.answer.correct), q.payload);
    }

    backToList() {
        if (this._viewing === null) return;
        this._gen++;
        this._viewing = null;
        this._revealed = false;
        this.presenter.teardown();
        this._exitQuestionMode();
        this.el.questionView.hidden = true;
        this.el.listView.hidden = false;
        this.camera.zoomOut();
    }

    _enterQuestionMode() {
        quizStore.startForeign(FOREIGN_MODES.AUDIT);
        document.body.classList.add('audit-active');
        this.camera.setAutoRotateAllowed(false);
    }

    _exitQuestionMode() {
        quizStore.end();
        document.body.classList.remove('audit-active');
        this.camera.setAutoRotateAllowed(true);
    }

    // ------------------------------ flagging ---------------------------------
    async flagQuestion(index) {
        const reason = window.prompt('Why is this question faulty? (optional)');
        if (reason === null) return;   // cancelled

        let resp;
        try {
            resp = await this.api.flagAuditQuestion(this.date, index, reason);
        } catch (e) {
            if (e instanceof ApiError && e.status === 409) {
                const n = (e.body && e.body.attemptCount) || 'some';
                const go = window.confirm(
                    `${n} player attempt(s) already exist for ${this.date}. `
                    + 'Regenerating rewrites what they answered. Continue?',
                );
                if (!go) return;
                try {
                    resp = await this.api.flagAuditQuestion(this.date, index, reason, true);
                } catch (e2) {
                    window.alert(this._errText(e2));
                    return;
                }
            } else {
                window.alert(this._errText(e));
                return;
            }
        }

        this.data.questions[index] = resp.question;
        this._renderList();
        // If the flagged question is on the globe right now, show its replacement.
        if (this._viewing === index) this.viewQuestion(index);
    }

    // ------------------------------ open/close -------------------------------
    open() {
        this.panel.hidden = false;
        this.toggleBtn.hidden = true;
        if (this.sheet) this.sheet.expand();
    }

    close() {
        this.backToList();
        this.panel.hidden = true;
        this.toggleBtn.hidden = false;
    }

    _setMessage(text) {
        this.el.message.textContent = text;
    }

    _errText(e) {
        if (e instanceof ApiError) {
            if (e.status === 401 || e.status === 403) {
                return `${e.message} (revisit /audit/launch on the API host for a fresh token)`;
            }
            return e.message;
        }
        return 'Something went wrong. Please try again.';
    }

    // ------------------------------- styles ----------------------------------
    _injectStyles() {
        const style = document.createElement('style');
        style.id = 'audit-styles';
        // Panel shell mirrors #dq-panel (which is id-scoped); question internals
        // (.dq-prompt/.dq-grid-host/.quiz-option/…) come from styles.css untouched.
        style.textContent = `
#audit-panel {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 300;
    background: var(--bg-panel); color: var(--text-heading);
    border-top: 1px solid var(--border-subtle); border-radius: var(--radius-panel) var(--radius-panel) 0 0;
    box-shadow: var(--shadow-dock);
    padding: 10px 14px 18px; overflow: hidden;
    font-family: var(--font-ui);
    transition: transform 0.25s ease; will-change: transform;
}
#audit-panel.dq-dragging { transition: none; }
@media (min-width: 760px) {
    #audit-panel {
        left: auto; right: 16px; bottom: 16px; width: 400px;
        border-radius: var(--radius-panel); border: 1px solid var(--border-subtle);
    }
}
#audit-panel .audit-title {
    display: inline-flex; align-items: center; gap: 6px;
    font-weight: var(--weight-bold); color: var(--accent);
}
#audit-panel .audit-meta { font-size: 12px; color: var(--text-soft); flex: 1; text-align: center; }
.audit-nav { display: flex; gap: 8px; align-items: center; justify-content: center; margin: 10px 0; }
.audit-date {
    background: var(--bg-app); color: var(--text-heading); border: 1px solid var(--border-subtle);
    border-radius: var(--radius-btn); padding: 6px 10px; font: inherit;
    color-scheme: dark;
}
.audit-btn {
    background: transparent; color: var(--text-soft); border: 1px solid var(--border-subtle);
    border-radius: var(--radius-btn); padding: 6px 10px; cursor: pointer; font: inherit; font-size: 13px;
}
.audit-btn:hover { color: var(--text-heading); border-color: #3a4a68; }
.audit-list { max-height: 46vh; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.audit-row { border: 1px solid var(--border-subtle); border-radius: var(--radius-panel); padding: 8px 10px; }
.audit-row-head { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-soft); }
.audit-row-type { font-weight: var(--weight-bold); letter-spacing: 0.02em; }
.audit-flagged { color: var(--accent); font-weight: var(--weight-bold); }
.audit-row-prompt { margin-top: 4px; font-size: 14px; }
.audit-row-answer { margin-top: 2px; font-size: 13px; color: var(--success); }
.audit-row-actions { display: flex; gap: 8px; margin-top: 8px; }
.audit-message { text-align: center; color: var(--text-soft); padding: 6px 0; }
.audit-qnav { display: flex; gap: 8px; align-items: center; margin: 8px 0 2px; }
.audit-qcounter { flex: 1; text-align: center; font-size: 13px; color: var(--text-soft); }
.audit-reveal { color: var(--accent); border-color: #5a4a24; }
.audit-flag-btn { color: var(--danger); border-color: #5a2a2a; }
#audit-toggle {
    position: fixed; top: 12px; left: 12px; z-index: 290;
    background: var(--bg-panel); color: var(--accent);
    border: 1px solid #3a4a68; border-radius: var(--radius-pill);
    padding: 8px 14px; cursor: pointer; font: inherit; font-size: 13px; font-weight: var(--weight-bold);
}
body.audit-active #dq-invite,
body.audit-active #quiz-invite,
body.audit-active #main-cta-cluster { display: none; }
        `;
        document.head.appendChild(style);
    }
}
