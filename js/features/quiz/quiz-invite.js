/**
 * QuizInvite — a bottom-sheet nudge toward the regular geography quizzes,
 * styled like the Daily Challenge invite (shared #dq-/#qz- CSS).
 *
 * Self-contained: builds its own DOM + listeners (index.html only imports +
 * instantiates). It takes the bottom-sheet slot *after* the Daily Challenge
 * prompt is resolved — it listens for `globe3d:daily-resolved` (fired by
 * daily-quiz when its prompt is dismissed or wasn't shown). Shows once, then
 * remembers (localStorage); thereafter the top-left Take Quiz button is the
 * permanent entry point. Dismissing fades it out and jiggles that button to
 * associate the two.
 */

const SEEN_KEY = 'globe3d-quiz-reminder-seen';

export class QuizInvite {
    constructor({ quizUI } = {}) {
        this.quizUI = quizUI;
        this.panel = null;
        this._dismissed = false;
    }

    init() {
        this._buildDom();
        // Appear once the Daily Challenge prompt has freed the bottom slot.
        document.addEventListener(
            'globe3d:daily-resolved',
            () => this._maybeShow(),
            { once: true },
        );
    }

    _buildDom() {
        this.panel = document.createElement('div');
        this.panel.id = 'quiz-invite';
        this.panel.innerHTML = `
            <div class="qz-sheet-content">
                <div class="qz-invite-heading">Get to know the world</div>
                <div class="qz-invite-text">Practice flags, countries and capitals &mdash;<br>the playful way to make geography stick.</div>
            </div>
        `;
        this.content = this.panel.querySelector('.qz-sheet-content');

        this.launchBtn = document.createElement('button');
        this.launchBtn.id = 'qz-launch';
        this.launchBtn.type = 'button';
        this.launchBtn.textContent = 'Quiz Me';
        this.launchBtn.addEventListener('click', () => this._onQuizMe());
        this.content.appendChild(this.launchBtn);

        this.maybeLaterBtn = document.createElement('button');
        this.maybeLaterBtn.id = 'qz-maybe-later';
        this.maybeLaterBtn.type = 'button';
        this.maybeLaterBtn.textContent = 'Maybe later';
        this.maybeLaterBtn.addEventListener('click', () => this._dismiss());
        this.content.appendChild(this.maybeLaterBtn);

        document.body.appendChild(this.panel);
    }

    _maybeShow() {
        if (localStorage.getItem(SEEN_KEY)) return;        // once, then remember
        if (document.body.classList.contains('quiz-active')) return;
        this.panel.classList.add('qz-invite-show');
    }

    /** Quiz Me — open the standard quiz mode selector. */
    _onQuizMe() {
        this._markSeen();
        this.panel.classList.remove('qz-invite-show');
        if (this.quizUI) this.quizUI.showModeSelector();
    }

    /** Maybe later — quick fade out, then jiggle the Take Quiz button. */
    _dismiss() {
        if (this._dismissed) return;
        this._dismissed = true;
        this._markSeen();

        const el = this.panel;
        el.style.transition = 'opacity 0.25s ease';
        el.classList.remove('qz-invite-show');

        const done = (e) => {
            if (e.target !== el || e.propertyName !== 'opacity') return;
            el.style.display = 'none';
            el.removeEventListener('transitionend', done);
            this._jiggleTakeQuiz();
        };
        el.addEventListener('transitionend', done);
    }

    _jiggleTakeQuiz() {
        const btn = document.getElementById('take-quiz-btn');
        if (!btn) return;
        btn.classList.add('tq-jiggle');
        btn.addEventListener('animationend', () => btn.classList.remove('tq-jiggle'), { once: true });
    }

    _markSeen() {
        try { localStorage.setItem(SEEN_KEY, '1'); } catch (_) { /* storage unavailable */ }
    }
}
