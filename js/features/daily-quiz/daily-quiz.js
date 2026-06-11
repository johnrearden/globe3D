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

export class DailyQuiz {
    constructor({ apiClient, cameraController, globeManager, focusRegistry }) {
        this.api = apiClient;
        this.camera = cameraController;
        this.globe = globeManager;
        this.focusRegistry = focusRegistry;
        this._active = false;
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
        this.launchBtn = document.createElement('button');
        this.launchBtn.id = 'dq-launch';
        this.launchBtn.type = 'button';
        this.launchBtn.textContent = '★ Daily Challenge';
        this.launchBtn.addEventListener('click', () => this.launch());
        document.body.appendChild(this.launchBtn);

        this.panel = document.createElement('div');
        this.panel.id = 'dq-panel';
        this.panel.hidden = true;
        this.panel.innerHTML = `
            <div class="dq-topbar">
                <span class="dq-counter"></span>
                <span class="dq-score">Score: 0</span>
                <button type="button" class="dq-close" aria-label="Close">×</button>
            </div>
            <div class="dq-body">
                <img class="dq-flag" alt="flag" style="display:none" />
                <div class="dq-prompt"></div>
                <div class="dq-grid-host"></div>
                <div class="dq-feedback"></div>
                <div class="dq-next-wrap"></div>
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
            feedback: this.panel.querySelector('.dq-feedback'),
            nextWrap: this.panel.querySelector('.dq-next-wrap'),
            leaderboard: this.panel.querySelector('.dq-leaderboard'),
            message: this.panel.querySelector('.dq-message'),
        };
        this.panel.querySelector('.dq-close').addEventListener('click', () => this.close());

        this.presenter = new QuestionPresenter({
            cameraController: this.camera,
            globeManager: this.globe,
            focusRegistry: this.focusRegistry,
            els: {
                prompt: this.el.prompt,
                flag: this.el.flag,
                gridHost: this.el.gridHost,
                feedback: this.el.feedback,
            },
        });
    }

    // --------------------------- flow ---------------------------------------
    async launch() {
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
                await this._showLeaderboard('Done! Here\'s how you stack up.');
                return;
            }
            question = res.next;
        }
    }

    _waitNext(isLast) {
        return new Promise((resolve) => {
            this.el.nextWrap.innerHTML = '';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dq-next';
            btn.textContent = isLast ? 'See results' : 'Next';
            btn.addEventListener('click', () => { this.el.nextWrap.innerHTML = ''; resolve(); });
            this.el.nextWrap.appendChild(btn);
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
        this.el.flag.style.display = 'none';
        this.el.prompt.style.display = '';
        this.el.gridHost.style.display = '';
        this.el.feedback.style.display = '';
        this.el.leaderboard.innerHTML = '';
    }

    _hideQuestionUi() {
        this.el.prompt.style.display = 'none';
        this.el.gridHost.style.display = 'none';
        this.el.feedback.style.display = 'none';
        this.el.flag.style.display = 'none';
        this.el.nextWrap.innerHTML = '';
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
        this.el.nextWrap.innerHTML = '';
        this.presenter.teardown();
        this._exitQuizMode();
        document.body.classList.remove('dq-active');
        this.camera.setAutoRotateAllowed(true);
        this.camera.zoomOut();
    }

    _errText(e) {
        if (e instanceof ApiError) {
            if (e.status === 409) return 'You\'ve already completed today\'s challenge.';
            return e.message;
        }
        return 'Something went wrong. Please try again.';
    }
}
