/**
 * DailyQuiz — orchestrates the once-per-day backend-driven challenge.
 *
 * Self-contained: builds its own launch button + panel DOM and attaches its own
 * listeners (so index.html only imports + instantiates it). Flow:
 *   ensure player (onboarding) -> GET today -> start/resume -> per-question loop
 *   (present -> answer -> submit -> reveal -> next) -> leaderboard.
 *
 * Server owns scoring; the running score arrives with each answer. Per-question
 * time is measured client-side (display -> answer) and sent with the answer.
 */

import { state } from '../../data/state.js';
import { ApiError } from '../../data/api-client.js';
import { QuestionPresenter } from './question-renderer.js';
import { showOnboarding } from './onboarding.js';
import { renderLeaderboard } from './leaderboard.js';
import { PanelSheet } from './panel-sheet.js';
import { calendarDots } from '../../utils/icons.js';

export class DailyQuiz {
    constructor({ apiClient, cameraController, globeManager, focusRegistry }) {
        this.api = apiClient;
        this.camera = cameraController;
        this.globe = globeManager;
        this.focusRegistry = focusRegistry;
        this._active = false;
        this._doneForToday = false;   // finished/already-completed this session
        this._dismissed = false;      // "Maybe Later" — dock the button top-left
        this._buildDom();
    }

    // ---- public hooks (used by pointer-controls for map-click questions) ----
    isAwaitingMapClick() {
        return this._active && this.presenter && this.presenter.isAwaitingMapClick();
    }

    handleMapClick(name) {
        if (this.presenter) this.presenter.submitMapClick(name);
    }

    // ---------------------------- DOM ---------------------------------------
    _buildDom() {
        // Invite: a glass bottom-sheet shown under the globe once the intro overlay
        // has faded (see _wireIntroInvite), if today isn't done. Terragotcha design
        // system (Fredoka heading / Archivo body / amber action). On "Maybe later"
        // it collapses into the #dq-today icon button docked top-left (see _dock).
        this.invite = document.createElement('div');
        this.invite.id = 'dq-invite';
        this.invite.innerHTML = `
            <div class="dq-sheet-content">
                <div class="dq-invite-heading">Up for today&rsquo;s challenge?</div>
                <div class="dq-invite-text">10 questions against the world &hellip;<br>Can&rsquo;t stop, I&rsquo;m being timed</div>
            </div>
        `;
        this.content = this.invite.querySelector('.dq-sheet-content');

        this.launchBtn = document.createElement('button');
        this.launchBtn.id = 'dq-launch';
        this.launchBtn.type = 'button';
        this.launchBtn.textContent = "Start today's challenge";
        this.launchBtn.addEventListener('click', () => this.launch());
        this.content.appendChild(this.launchBtn);

        // "Maybe later": dismiss the sheet — it collapses into the docked icon below.
        this.maybeLaterBtn = document.createElement('button');
        this.maybeLaterBtn.id = 'dq-maybe-later';
        this.maybeLaterBtn.type = 'button';
        this.maybeLaterBtn.textContent = 'Maybe later';
        this.maybeLaterBtn.addEventListener('click', () => this._dock());
        this.content.appendChild(this.maybeLaterBtn);

        // The docked "today" button: what the sheet morphs into top-left, under the
        // Take Quiz button. Hidden while the sheet is expanded; tapping it launches.
        this.todayBtn = document.createElement('button');
        this.todayBtn.id = 'dq-today';
        this.todayBtn.type = 'button';
        this.todayBtn.setAttribute('aria-label', "Today's challenge");
        this.todayBtn.innerHTML = calendarDots;
        this.todayBtn.addEventListener('click', () => this.launch());
        this.invite.appendChild(this.todayBtn);

        document.body.appendChild(this.invite);
        this._wireIntroInvite();

        this.panel = document.createElement('div');
        this.panel.id = 'dq-panel';
        this.panel.hidden = true;
        this.panel.innerHTML = `
            <div class="dq-grab" role="button" tabindex="0" aria-label="Drag to show or hide the panel"></div>
            <div class="dq-topbar">
                <span class="dq-counter"></span>
                <span class="dq-score">Score: 0</span>
                <button type="button" class="dq-close" aria-label="Close">×</button>
            </div>
            <div class="dq-body">
                <img class="dq-flag" alt="flag" style="display:none" />
                <div class="dq-prompt"></div>
                <div class="dq-grid-host"></div>
                <div class="dq-actions">
                    <button type="button" class="dq-submit" hidden>Submit</button>
                    <button type="button" class="dq-next" disabled>Next</button>
                </div>
                <div class="dq-feedback"></div>
                <div class="dq-leaderboard"></div>
                <div class="dq-message"></div>
            </div>
        `;
        document.body.appendChild(this.panel);

        this.el = {
            counter: this.panel.querySelector('.dq-counter'),
            score: this.panel.querySelector('.dq-score'),
            prompt: this.panel.querySelector('.dq-prompt'),
            flag: this.panel.querySelector('.dq-flag'),
            gridHost: this.panel.querySelector('.dq-grid-host'),
            actions: this.panel.querySelector('.dq-actions'),
            submit: this.panel.querySelector('.dq-submit'),
            next: this.panel.querySelector('.dq-next'),
            feedback: this.panel.querySelector('.dq-feedback'),
            leaderboard: this.panel.querySelector('.dq-leaderboard'),
            message: this.panel.querySelector('.dq-message'),
        };
        this.panel.querySelector('.dq-close').addEventListener('click', () => this.close());

        // Draggable "peek" behaviour: drag/tap the grab handle or top bar to slide
        // the panel down until just its top bar shows (reveals the globe behind).
        this.sheet = new PanelSheet(this.panel, {
            handles: [
                this.panel.querySelector('.dq-grab'),
                this.panel.querySelector('.dq-topbar'),
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

    // --------------------------- invite ------------------------------------
    /** Show the under-globe invite once the intro overlay has faded out. */
    _wireIntroInvite() {
        document.addEventListener(
            'globe3d:intro-dismissed',
            () => this._maybeShowInvite(),
            { once: true },
        );
    }

    async _maybeShowInvite() {
        if (this._active) return;                 // already playing
        let played = false;
        try {
            if (this.api.isRegistered) {
                const today = await this.api.getToday();
                played = !!(today.attempt && today.attempt.status === 'completed');
            }
        } catch (_) {
            played = false;                        // can't tell (server down) — still invite
        }
        if (!played && !this._active) this._showInvite();
    }

    _showInvite() {
        this.invite.classList.add('dq-invite-show');
        // Already dismissed earlier this session — show it docked, no morph.
        if (this._dismissed) this.invite.classList.add('dq-docked');
    }
    _hideInvite() { this.invite.classList.remove('dq-invite-show'); }

    /**
     * "Maybe later" — collapse the sheet into the #dq-today icon button docked
     * top-left. FLIP: snap to the docked layout, invert with a transform back over
     * the sheet's old footprint, then transition the transform away so it shrinks
     * and flies to the corner. The content crossfade (sheet out, icon in) is CSS.
     */
    _dock() {
        if (this._dismissed) return;            // idempotent
        this._dismissed = true;

        const el = this.invite;
        const first = el.getBoundingClientRect();
        el.classList.add('dq-docked');           // → final docked layout
        const last = el.getBoundingClientRect();

        const dx = first.left - last.left;
        const dy = first.top - last.top;
        const sx = first.width / last.width;
        const sy = first.height / last.height;

        // Invert: place it visually back where the sheet was.
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

        // Play: next frame, animate the transform away.
        requestAnimationFrame(() => {
            el.style.transition = 'transform 0.42s var(--ease-soft, cubic-bezier(0.4,0,0.2,1))';
            el.style.transform = '';
        });

        // Clean up the inline transform/transition once it lands.
        const done = (e) => {
            if (e.target !== el || e.propertyName !== 'transform') return;
            el.style.transition = '';
            el.style.transform = '';
            el.removeEventListener('transitionend', done);
        };
        el.addEventListener('transitionend', done);
    }

    // --------------------------- flow ---------------------------------------
    async launch() {
        this._hideInvite();
        this.launchBtn.disabled = true;
        try {
            if (!this.api.isRegistered) {
                const info = await showOnboarding(this.globe.getCountryNames(), this.api.profile);
                if (!info) { this.launchBtn.disabled = false; return; }
                await this.api.registerPlayer(info.nickname, info.country);
            }
            await this._begin();
        } catch (e) {
            this._openPanel();
            this._message(this._errText(e));
        } finally {
            this.launchBtn.disabled = false;
        }
    }

    async _begin() {
        const today = await this.api.getToday();
        if (today.attempt && today.attempt.status === 'completed') {
            this._doneForToday = true;
            this._openPanel();
            this._enterQuizMode();
            await this._showLeaderboard('You\'ve already played today. Come back tomorrow!');
            return;
        }
        const startResp = await this.api.startDaily();
        this._openPanel();
        this._enterQuizMode();
        await this._play(startResp);
    }

    async _play(startResp) {
        this.attemptId = startResp.attemptId;
        this.total = startResp.questionCount;
        this._setScore(startResp.runningScore);

        let question = startResp.question;
        while (question) {
            this._showQuestionUi();
            this._setCounter(question.index);

            const { answer, elapsedMs } = await this.presenter.render(question);

            // Snap fully open on submit so the reveal + Next button are visible
            // even if the player had slid the panel down to peek at the globe.
            if (this.sheet) this.sheet.expand();

            let res;
            try {
                res = await this.api.submitAnswer(this.attemptId, question.index, answer, elapsedMs);
            } catch (e) {
                this._message(this._errText(e));
                return;
            }

            this._setScore(res.runningScore);
            this.presenter.showReveal(res.reveal, question);

            await this._waitNext(res.done);
            if (res.done) {
                this._doneForToday = true;
                await this._showLeaderboard();   // the table speaks for itself
                return;
            }
            question = res.next;
        }
    }

    _waitNext(isLast) {
        // The Next button is persistent and was faded/disabled while answering;
        // enable it now (so the row never resized on submit) and wait for a click.
        return new Promise((resolve) => {
            const btn = this.el.next;
            btn.textContent = isLast ? 'See results' : 'Next';
            btn.disabled = false;
            const onClick = () => {
                btn.removeEventListener('click', onClick);
                btn.disabled = true;
                resolve();
            };
            btn.addEventListener('click', onClick);
        });
    }

    async _showLeaderboard(message) {
        this._hideQuestionUi();
        this.presenter.teardown();
        this._exitQuizMode();
        this.el.message.textContent = message || '';
        try {
            const data = await this.api.getLeaderboard();
            renderLeaderboard(this.el.leaderboard, data);
        } catch (e) {
            this.el.leaderboard.textContent = this._errText(e);
        }
    }

    // --------------------------- ui helpers ---------------------------------
    _openPanel() {
        this.panel.hidden = false;
        this.el.message.textContent = '';
        this.el.leaderboard.innerHTML = '';
        if (this.sheet) this.sheet.expand();
    }

    _enterQuizMode() {
        this._active = true;
        state.set('quiz.active', true);
        document.body.classList.add('dq-active');
        this.camera.setAutoRotateAllowed(false);
    }

    _exitQuizMode() {
        this._active = false;
        state.set('quiz.active', false);
    }

    _showQuestionUi() {
        // A new question always springs the panel back up so its prompt/cards are
        // never hidden behind the peek bar; the user re-collapses to view the globe.
        if (this.sheet) this.sheet.expand();
        this.el.flag.style.display = 'none';
        this.el.prompt.style.display = '';
        this.el.gridHost.style.display = '';
        // The action row + feedback area are always present and reserve their
        // height, so answering (submit / single-click) never resizes the panel.
        // The presenter reveals Submit only for multi-select questions; Next stays
        // faded/disabled until the answer is in.
        this.el.actions.style.display = '';
        this.el.submit.hidden = true;
        this.el.submit.disabled = true;
        this.el.next.disabled = true;
        this.el.next.textContent = 'Next';
        this.el.feedback.style.display = '';
        this.el.feedback.textContent = '';
        this.el.feedback.className = 'dq-feedback';
        this.el.leaderboard.innerHTML = '';
    }

    _hideQuestionUi() {
        this.el.prompt.style.display = 'none';
        this.el.gridHost.style.display = 'none';
        this.el.actions.style.display = 'none';
        this.el.feedback.style.display = 'none';
        this.el.flag.style.display = 'none';
        this.el.submit.hidden = true;
        this.el.next.disabled = true;
    }

    _setScore(score) {
        this.el.score.textContent = `Score: ${score}`;
    }

    _setCounter(index) {
        this.el.counter.textContent = `Q${index + 1} / ${this.total}`;
    }

    _message(text) {
        this._hideQuestionUi();
        this.el.message.textContent = text;
    }

    close() {
        this.panel.hidden = true;
        if (this.sheet) this.sheet.expand();   // reset peek state for next open
        this.presenter.teardown();
        this._exitQuizMode();
        document.body.classList.remove('dq-active');
        this.camera.setAutoRotateAllowed(true);
        this.camera.zoomOut();
        // If they bailed before finishing, re-offer the invite so they can resume
        // (start/today resumes from the current question). Once done for the day,
        // it stays hidden until tomorrow.
        if (!this._doneForToday) this._showInvite();
    }

    _errText(e) {
        if (e instanceof ApiError) {
            if (e.status === 409) return 'You\'ve already completed today\'s challenge.';
            return e.message;
        }
        return 'Something went wrong. Please try again.';
    }
}
