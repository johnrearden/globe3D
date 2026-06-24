/**
 * Quiz Mode Picker
 * Bottom-sheet style overlay for selecting quiz mode and geographic scope.
 * Based on the design handoff from docs/quiz_choice.
 */

const CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'];

// Inline SVG icons (Phosphor regular, 256x256 viewBox, scaled via CSS)
const ICONS = {
    globeHemisphereWest: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24ZM62.29,186.47l2.52-1.65A16,16,0,0,0,72,171.53l.21-36.23L93.17,104a3.62,3.62,0,0,0,.32.22l19.67,12.87a15.94,15.94,0,0,0,11.35,2.77L156,115.59a16,16,0,0,0,10-5.41l22.17-25.76A16,16,0,0,0,192,74V67.67A87.87,87.87,0,0,1,211.77,155l-16.14-14.76a16,16,0,0,0-16.93-3l-30.46,12.65a16.08,16.08,0,0,0-9.68,12.45l-2.39,16.19a16,16,0,0,0,11.77,17.81L169.4,202l2.36,2.37A87.88,87.88,0,0,1,62.29,186.47ZM40,128a87.78,87.78,0,0,1,9.64-40.1L73,104.51,52.13,135.82a8,8,0,0,0-1.29,3.78l-.22,38.77a88.1,88.1,0,0,1-10.62-50.37Zm136-64V74l-22.17,25.76-31.54,4.27L102.62,91.16a19.93,19.93,0,0,0-10.12-3.14l-32.14.21A88,88,0,0,1,128,40a87.44,87.44,0,0,1,48,14.24Z"/></svg>`,
    compass: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216ZM172.42,72.84l-64,32a8.05,8.05,0,0,0-3.58,3.58l-32,64A8,8,0,0,0,80,184a8.1,8.1,0,0,0,3.58-.84l64-32a8.05,8.05,0,0,0,3.58-3.58l32-64a8,8,0,0,0-10.74-10.74ZM138,138,97.89,158.11,118,118l40.15-20.07Z"/></svg>`,
    flag: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M42.76,50A8,8,0,0,0,40,56V224a8,8,0,0,0,16,0V179.77c26.79-21.16,49.87-9.75,76.45,3.41,16.4,8.11,34.06,16.85,53,16.85,13.93,0,28.54-4.75,43.82-18a8,8,0,0,0,2.76-6V56a8,8,0,0,0-13.27-6c-28,24.23-51.72,12.49-79.21-1.12C111.07,34.76,78.78,18.79,42.76,50ZM216,172.25c-26.79,21.16-49.87,9.74-76.45-3.41-25-12.35-52.81-26.13-83.55-8.4V59.79c26.79-21.16,49.87-9.75,76.45,3.4,25,12.35,52.82,26.13,83.55,8.4Z"/></svg>`,
    mapPin: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M128,64a40,40,0,1,0,40,40A40,40,0,0,0,128,64Zm0,64a24,24,0,1,1,24-24A24,24,0,0,1,128,128Zm0-112a88.1,88.1,0,0,0-88,88c0,31.4,14.51,64.68,42,96.25a254.19,254.19,0,0,0,41.45,38.3,8,8,0,0,0,9.18,0A254.19,254.19,0,0,0,174,200.25c27.45-31.57,42-64.85,42-96.25A88.1,88.1,0,0,0,128,16Zm0,206c-16.53-13-72-60.75-72-118a72,72,0,0,1,144,0C200,161.23,144.53,209,128,222Z"/></svg>`,
    bank: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M24,104H48v64H32a8,8,0,0,0,0,16H224a8,8,0,0,0,0-16H208V104h24a8,8,0,0,0,4.19-14.81l-104-64a8,8,0,0,0-8.38,0l-104,64A8,8,0,0,0,24,104Zm40,0H96v64H64Zm80,0v64H112V104Zm48,64H160V104h32ZM128,41.39,203.74,88H52.26ZM248,208a8,8,0,0,1-8,8H16a8,8,0,0,1,0-16H240A8,8,0,0,1,248,208Z"/></svg>`,
    arrowRight: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69l-58.35-58.34a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z"/></svg>`
};

const QUIZ_MODES = [
    {
        id: 'name',
        icon: ICONS.globeHemisphereWest,
        title: 'Name the country',
        description: 'Find a highlighted country and pick its flag'
    },
    {
        id: 'flag',
        icon: ICONS.flag,
        title: 'Identify the flag',
        description: 'See a flag and choose which country it belongs to'
    },
    {
        id: 'find',
        icon: ICONS.mapPin,
        title: 'Find the country',
        description: 'Tap the right country \u2014 10 in 45 seconds'
    },
    {
        id: 'capital',
        icon: ICONS.bank,
        title: 'Capital cities',
        description: 'Match countries to capitals \u2014 direction flips'
    }
];

export class QuizModePicker {
    constructor(options = {}) {
        this.onQuizStart = options.onQuizStart || (() => {});
        this.onCancel = options.onCancel || (() => {});

        // State
        this.scope = 'globe'; // 'globe' | 'region'
        this.region = 'Africa';
        this.visible = false;

        // DOM references (will be set after building)
        this.container = null;
        this.sheet = null;
        this.chipsContainer = null;

        this._buildDOM();
        this._attachListeners();
    }

    _buildDOM() {
        // Create container
        this.container = document.createElement('div');
        this.container.id = 'quiz-mode-picker';
        this.container.className = 'qmp';
        this.container.style.display = 'none';

        this.container.innerHTML = `
            <div class="qmp-overlay"></div>
            <div class="qmp-sheet">
                <div class="qmp-grabber"></div>

                <div class="qmp-heading">
                    <div class="qmp-title">Choose a quiz</div>
                    <div class="qmp-subtitle">PICK A MODE TO START PLAYING</div>
                </div>

                <div class="qmp-scope">
                    <div class="qmp-scope-label">COUNTRIES FROM</div>
                    <div class="qmp-segmented">
                        <button class="qmp-segment qmp-segment--active" data-scope="globe">
                            <span class="qmp-segment-icon">${ICONS.globeHemisphereWest}</span>
                            <span>Whole globe</span>
                        </button>
                        <button class="qmp-segment" data-scope="region">
                            <span class="qmp-segment-icon">${ICONS.compass}</span>
                            <span>By region</span>
                        </button>
                    </div>
                    <div class="qmp-chips" style="display: none;">
                        ${CONTINENTS.map((c, i) => `
                            <button class="qmp-chip${i === 0 ? ' qmp-chip--active' : ''}" data-region="${c}">${c}</button>
                        `).join('')}
                    </div>
                </div>

                <div class="qmp-divider"></div>

                <div class="qmp-cards">
                    ${QUIZ_MODES.map((mode, i) => `
                        <button class="qmp-card" data-mode="${mode.id}" style="animation-delay: ${0.22 + i * 0.05}s">
                            <div class="qmp-card-icon">${mode.icon}</div>
                            <div class="qmp-card-text">
                                <div class="qmp-card-title">${mode.title}</div>
                                <div class="qmp-card-desc">${mode.description}</div>
                            </div>
                            <span class="qmp-card-arrow">${ICONS.arrowRight}</span>
                        </button>
                    `).join('')}
                </div>

                <button class="qmp-cancel">Cancel</button>
            </div>
        `;

        document.body.appendChild(this.container);

        // Cache references
        this.sheet = this.container.querySelector('.qmp-sheet');
        this.chipsContainer = this.container.querySelector('.qmp-chips');
    }

    _attachListeners() {
        // Overlay click closes
        this.container.querySelector('.qmp-overlay').addEventListener('click', () => this.hide());

        // Segment buttons
        this.container.querySelectorAll('.qmp-segment').forEach(btn => {
            btn.addEventListener('click', () => this._setScope(btn.dataset.scope));
        });

        // Continent chips
        this.container.querySelectorAll('.qmp-chip').forEach(btn => {
            btn.addEventListener('click', () => this._setRegion(btn.dataset.region));
        });

        // Quiz cards
        this.container.querySelectorAll('.qmp-card').forEach(card => {
            card.addEventListener('click', () => this._startQuiz(card.dataset.mode));
        });

        // Cancel button
        this.container.querySelector('.qmp-cancel').addEventListener('click', () => this.hide());
    }

    _setScope(scope) {
        if (this.scope === scope) return;
        this.scope = scope;

        // Update segment styles
        this.container.querySelectorAll('.qmp-segment').forEach(btn => {
            btn.classList.toggle('qmp-segment--active', btn.dataset.scope === scope);
        });

        // Show/hide chips
        if (scope === 'region') {
            this.chipsContainer.style.display = 'flex';
            // Trigger reflow for animation
            void this.chipsContainer.offsetWidth;
            this.chipsContainer.classList.add('qmp-chips--visible');
        } else {
            this.chipsContainer.classList.remove('qmp-chips--visible');
            // Hide after animation
            setTimeout(() => {
                if (this.scope !== 'region') {
                    this.chipsContainer.style.display = 'none';
                }
            }, 300);
        }
    }

    _setRegion(region) {
        if (this.region === region) return;
        this.region = region;

        // Update chip styles
        this.container.querySelectorAll('.qmp-chip').forEach(btn => {
            btn.classList.toggle('qmp-chip--active', btn.dataset.region === region);
        });
    }

    _startQuiz(mode) {
        const scopeValue = this.scope === 'globe' ? 'globe' : this.region;
        this.hide();
        this.onQuizStart({ mode, scope: scopeValue });
    }

    show() {
        if (this.visible) return;
        this.visible = true;

        // Reset state to defaults
        this._setScope('globe');
        this._setRegion('Africa');

        this.container.style.display = 'block';
        // Trigger reflow for animations
        void this.container.offsetWidth;
        this.container.classList.add('qmp--visible');
    }

    hide() {
        if (!this.visible) return;
        this.visible = false;

        this.container.classList.remove('qmp--visible');
        // Hide after exit animation
        setTimeout(() => {
            if (!this.visible) {
                this.container.style.display = 'none';
            }
        }, 400);

        this.onCancel();
    }

    /**
     * Get the current scope setting
     * @returns {{ scope: 'globe' | string, region: string }}
     */
    getScope() {
        return {
            scope: this.scope,
            region: this.region
        };
    }
}
