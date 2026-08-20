/**
 * Weak Spots overlay — a chromeless, right-aligned heads-up list docked top-right
 * over the live 3D globe on the main screen. It surfaces the countries the player
 * gets wrong most often (their "weak spots") so they're always glanceable.
 *
 * Data comes from the existing wrong-answer tally (`quizHistoryStore.getCountryStats`).
 * Unlike the original display-only design, clicking a row reproduces a globe
 * country-click: highlight + camera fly-to + flag/info panel.
 *
 * Self-contained per CLAUDE.md: builds its own DOM, attaches its own listeners,
 * pulls styling from `.weakspots-*` rules in styles.css. Wiring it up is an import
 * + one instantiation in index.html.
 */
import { quizStore } from '@terragotcha/quiz-core';
import { quizHistoryStore } from '../data/quiz-history-store.js';

// Top-N worst offenders to surface; the viewport shows 5 at a time and scrolls.
const MAX_ENTRIES = 10;

// Phosphor `crosshair` (fill weight), ported to inline SVG — no icon webfont.
// Path lifted from @phosphor-icons fill set (256×256 viewBox).
const CROSSHAIR_SVG = `<svg class="weakspots-icon" viewBox="0 0 256 256" aria-hidden="true" focusable="false"><path fill="currentColor" d="M128,20A108,108,0,1,0,236,128,108.12,108.12,0,0,0,128,20Zm12,191.13V184a12,12,0,0,0-24,0v27.13A84.18,84.18,0,0,1,44.87,140H72a12,12,0,0,0,0-24H44.87A84.18,84.18,0,0,1,116,44.87V72a12,12,0,0,0,24,0V44.87A84.18,84.18,0,0,1,211.13,116H184a12,12,0,0,0,0,24h27.13A84.18,84.18,0,0,1,140,211.13Z"/></svg>`;

export class WeakSpotsWidget {
    constructor(options = {}) {
        this.globeManager = options.globeManager;
        this.cameraController = options.cameraController;
        this.flagRenderer = options.flagRenderer;
        this.labelManager = options.labelManager;
        this.countryData = options.countryData;
        this.countryToISO = options.countryToISO;
        this.resetIdleTimer = options.resetIdleTimer || (() => {});

        this.container = null;
        this.listEl = null;
        this._quizActive = false;
    }

    init() {
        this._buildDom();

        // Hide while a quiz is running; refresh + re-show when it ends (tallies changed).
        this._quizActive = quizStore.isActive();
        quizStore.onActiveChange((active) => {
            this._quizActive = active;
            if (active) {
                this._setVisible(false);
            } else {
                this.refresh();
            }
        });

        this.refresh();
    }

    _buildDom() {
        const container = document.createElement('div');
        container.className = 'weakspots';
        container.style.display = 'none';

        const title = document.createElement('div');
        title.className = 'weakspots-title';
        const label = document.createElement('span');
        label.className = 'weakspots-label';
        label.textContent = 'Weak spots';
        title.appendChild(label);
        title.insertAdjacentHTML('beforeend', CROSSHAIR_SVG);

        const list = document.createElement('div');
        list.className = 'weakspots-list';
        // Delegate row clicks → reproduce a globe country-click.
        list.addEventListener('click', (e) => {
            const row = e.target.closest('.weakspots-row');
            if (row && row.dataset.country) this._selectCountry(row.dataset.country);
        });

        container.appendChild(title);
        container.appendChild(list);
        document.body.appendChild(container);

        this.container = container;
        this.listEl = list;
    }

    /** Re-read the tally and rebuild the list. Hides the widget when empty / mid-quiz. */
    refresh() {
        const list = quizHistoryStore.getCountryStats({ minAsked: 1 })
            .filter((c) => c.pct < 100)
            .slice(0, MAX_ENTRIES);

        if (list.length === 0 || this._quizActive) {
            this._setVisible(false);
            return;
        }

        this.listEl.innerHTML = '';
        for (const entry of list) {
            this.listEl.appendChild(this._buildRow(entry.country));
        }
        this._setVisible(true);
    }

    _buildRow(name) {
        const row = document.createElement('div');
        row.className = 'weakspots-row';
        row.dataset.country = name;

        const nameEl = document.createElement('span');
        nameEl.className = 'weakspots-name';
        nameEl.textContent = name;
        row.appendChild(nameEl);

        const iso = this.countryData[name]?.iso || this.countryToISO[name];
        if (iso) {
            const img = document.createElement('img');
            img.className = 'weakspots-flag';
            img.src = `https://flagcdn.com/w80/${iso}.png`;
            img.alt = '';
            img.loading = 'lazy';
            row.appendChild(img);
        }
        return row;
    }

    /** Reproduce the non-quiz globe click path (see PointerControls.onPointerUp). */
    _selectCountry(name) {
        if (this._quizActive) return;
        this.globeManager.clearSelection();
        this.globeManager.setSelectedCountry(name);
        if (this.labelManager) this.labelManager.setHighlight(name);
        this.cameraController.rotateToCountry(name, false);
        if (this.flagRenderer) {
            this.flagRenderer.show(name, this.countryData, this.countryToISO,
                this.globeManager.getCapital(name)?.name);
        }
        this.resetIdleTimer();
    }

    _setVisible(visible) {
        if (this.container) this.container.style.display = visible ? '' : 'none';
    }
}
