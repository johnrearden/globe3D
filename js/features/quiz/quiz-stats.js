/**
 * Quiz Stats screen
 *
 * A bottom-sheet overlay (same visual language as the quiz mode picker) that
 * surfaces the player's saved quiz history from `quiz-history-store.js`:
 *   - per mode×scope bests (best %, best/avg time, games played)
 *   - "Countries you keep missing" (lowest accuracy across all answers)
 *   - a recent-games list
 *
 * Self-contained: builds its own DOM + listeners at runtime and reads the
 * history store directly, so wiring it up is an import + one instantiation.
 */

import { quizHistoryStore, MODE_LABELS } from '../../data/quiz-history-store.js';
import { formatDuration } from './quiz-timer.js';

const ICON_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>`;

// Most-missed list tuning: a country needs at least this many attempts to show
// (one unlucky miss shouldn't crown a "weak" country), and we cap the list.
const MIN_ASKED = 2;
const MOST_MISSED_LIMIT = 8;
const RECENT_LIMIT = 10;

/** 'globe' → 'Whole globe', otherwise the region name verbatim. */
function scopeLabel(scope) {
    return scope === 'globe' ? 'Whole globe' : scope;
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

export class QuizStats {
    constructor() {
        this.visible = false;
        this.container = null;
        this._buildShell();
        this._attachListeners();
    }

    _buildShell() {
        this.container = document.createElement('div');
        this.container.id = 'quiz-stats';
        this.container.className = 'qsv';
        this.container.style.display = 'none';
        this.container.innerHTML = `
            <div class="qsv-overlay"></div>
            <div class="qsv-sheet">
                <div class="qsv-grabber"></div>
                <div class="qsv-heading">
                    <div>
                        <div class="qsv-title">Your progress</div>
                        <div class="qsv-subtitle">SAVED ON THIS DEVICE</div>
                    </div>
                    <button class="qsv-close" aria-label="Close">${ICON_CLOSE}</button>
                </div>
                <div class="qsv-body"></div>
                <button class="qsv-reset">Clear history</button>
            </div>
        `;
        document.body.appendChild(this.container);
        this.body = this.container.querySelector('.qsv-body');
        this.resetBtn = this.container.querySelector('.qsv-reset');
    }

    _attachListeners() {
        this.container.querySelector('.qsv-overlay').addEventListener('click', () => this.hide());
        this.container.querySelector('.qsv-close').addEventListener('click', () => this.hide());
        this.resetBtn.addEventListener('click', () => {
            if (window.confirm('Clear all saved quiz history? This cannot be undone.')) {
                quizHistoryStore.clear();
                this._render();
            }
        });
    }

    _render() {
        const total = quizHistoryStore.getTotalGames();
        if (total === 0) {
            this.body.innerHTML = `
                <div class="qsv-empty">
                    <div class="qsv-empty-title">No quizzes yet</div>
                    <div class="qsv-empty-text">Play a quiz and your scores, times and trouble
                    countries will show up here.</div>
                </div>`;
            this.resetBtn.style.display = 'none';
            return;
        }
        this.resetBtn.style.display = '';
        this.body.innerHTML =
            this._modeStatsHTML() + this._missedHTML() + this._recentHTML();
    }

    _modeStatsHTML() {
        const stats = quizHistoryStore.getModeStats();
        const rows = stats.map(s => {
            const time = s.bestTimeMs != null ? ` · best ${formatDuration(s.bestTimeMs)}` : '';
            return `
                <div class="qsv-row">
                    <div class="qsv-row-main">
                        <div class="qsv-row-title">${escapeHtml(MODE_LABELS[s.mode] || s.mode)}</div>
                        <div class="qsv-row-sub">${escapeHtml(scopeLabel(s.scope))} · ${s.games} game${s.games === 1 ? '' : 's'}${time}</div>
                    </div>
                    <div class="qsv-row-metric">
                        <div class="qsv-row-best">${s.bestScore}/10</div>
                        <div class="qsv-row-best-label">best · avg ${s.avgPct}%</div>
                    </div>
                </div>`;
        }).join('');
        return `<div class="qsv-section">
            <div class="qsv-section-label">BY QUIZ</div>
            ${rows}
        </div>`;
    }

    _missedHTML() {
        const missed = quizHistoryStore.getCountryStats({ minAsked: MIN_ASKED })
            .filter(c => c.pct < 100)
            .slice(0, MOST_MISSED_LIMIT);
        if (missed.length === 0) return '';
        const rows = missed.map(c => `
            <div class="qsv-missed">
                <span class="qsv-missed-name">${escapeHtml(c.country)}</span>
                <span class="qsv-missed-stat">${c.correct}/${c.asked} right · ${c.pct}%</span>
            </div>`).join('');
        return `<div class="qsv-section">
            <div class="qsv-section-label">COUNTRIES YOU KEEP MISSING</div>
            ${rows}
        </div>`;
    }

    _recentHTML() {
        const recent = quizHistoryStore.getSessions().slice(0, RECENT_LIMIT);
        const rows = recent.map(s => {
            const time = Number.isFinite(s.durationMs) && s.durationMs > 0
                ? ` · ${formatDuration(s.durationMs)}` : '';
            return `
                <div class="qsv-recent">
                    <span class="qsv-recent-mode">${escapeHtml(MODE_LABELS[s.mode] || s.mode)}</span>
                    <span class="qsv-recent-scope">${escapeHtml(scopeLabel(s.scope))}</span>
                    <span class="qsv-recent-score">${s.score}/${s.total}${time}</span>
                </div>`;
        }).join('');
        return `<div class="qsv-section">
            <div class="qsv-section-label">RECENT GAMES</div>
            ${rows}
        </div>`;
    }

    show() {
        if (this.visible) return;
        this.visible = true;
        this._render();
        this.container.style.display = 'block';
        void this.container.offsetWidth; // reflow for the entry transition
        this.container.classList.add('qsv--visible');
    }

    hide() {
        if (!this.visible) return;
        this.visible = false;
        this.container.classList.remove('qsv--visible');
        setTimeout(() => {
            if (!this.visible) this.container.style.display = 'none';
        }, 400);
    }
}
