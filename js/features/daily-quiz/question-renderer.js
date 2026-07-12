/**
 * QuestionPresenter — turns a sanitized question payload into a presentation
 * (globe framing / highlight, optional flag, optional options grid) and captures
 * the player's answer + the time they took.
 *
 * It deliberately does NOT use flagRenderer.show() for identify-flag questions:
 * that panel also prints the country name, which is the answer. A static flag
 * image is shown instead.
 */

import { OptionsGrid } from './options-grid.js';
import { QUIZ_SUBJECT_SCREEN_FRACTION } from '../../core/focus-zoom.js';

export class QuestionPresenter {
    constructor({ cameraController, globeManager, focusRegistry, els }) {
        this.camera = cameraController;
        this.globe = globeManager;
        this.focusRegistry = focusRegistry;
        this.els = els;                       // {prompt, flag, gridHost, feedback, submit}
        this.grid = new OptionsGrid(this.els.gridHost);
        this._awaitingMapClick = false;
        this._submitHandler = null;

        // A one-line affordance shown under the prompt on map-click questions
        // ("Click X."): the globe used to be frozen here, so the fact that you
        // can now rotate it to line your answer up face-on isn't discoverable
        // otherwise. Created at runtime (no static markup in index.html) and
        // slotted right after the prompt, where a map-click question has no grid.
        this._hint = document.createElement('div');
        this._hint.className = 'dq-map-hint';
        this._hint.textContent = 'Drag to rotate • tap your answer';
        this._hint.style.display = 'none';
        if (this.els.prompt && this.els.prompt.insertAdjacentElement) {
            this.els.prompt.insertAdjacentElement('afterend', this._hint);
        }
    }

    /**
     * Present `question` and resolve with {answer, elapsedMs} once the player
     * answers (grid submit or map click).
     */
    render(question) {
        this._resetView();
        this.els.prompt.textContent = question.prompt || '';
        this.els.feedback.textContent = '';
        this.els.feedback.className = 'dq-feedback';

        this._setupFlag(question);
        this._setupMap(question);

        const startedAt = performance.now();
        return new Promise((resolve) => {
            const done = (answer) => {
                const elapsedMs = Math.round(performance.now() - startedAt);
                this._awaitingMapClick = false;
                this._setHint(false);        // answer is in — the rotate hint is stale
                this._hideSubmit();          // answer is in — the row keeps only Next
                resolve({ answer, elapsedMs });
            };

            const method = question.answer && question.answer.method;
            if (method === 'map-click-single' || method === 'map-click-multi') {
                // No Submit button — clicking the map/single country is the submit.
                this._awaitingMapClick = true;
                this._setHint(true);         // globe is rotatable — tell the player
                this._mapResolve = (name) => done(name);
            } else {
                const multi = !!question.grid.multiSelect;
                this.grid.render({
                    options: question.grid.options,
                    cols: question.grid.cols,
                    multiSelect: multi,
                    display: question.grid.display,
                    onSubmit: (values) => done(multi ? values : values[0]),
                    // Multi-select needs an explicit Submit; single-select submits on tap.
                    onSelectionChange: multi ? (n) => this._updateSubmit(n) : null,
                });
                if (multi) this._showSubmit();
            }
        });
    }

    /** Reveal the (multi-select) Submit button and wire it to the grid. */
    _showSubmit() {
        const btn = this.els.submit;
        if (!btn) return;
        btn.hidden = false;
        btn.disabled = true;            // nothing selected yet
        btn.textContent = 'Submit';
        this._submitHandler = () => this.grid.submitSelected();
        btn.addEventListener('click', this._submitHandler);
    }

    /** Enable/label the Submit button as the multi-selection changes. */
    _updateSubmit(count) {
        const btn = this.els.submit;
        if (!btn) return;
        btn.disabled = count === 0;
        btn.textContent = count ? `Submit (${count})` : 'Submit';
    }

    /** Show/hide the "drag to rotate" hint shown under the prompt on map clicks. */
    _setHint(visible) {
        if (this._hint) this._hint.style.display = visible ? '' : 'none';
    }

    /** Hide the Submit button and detach its handler. */
    _hideSubmit() {
        const btn = this.els.submit;
        if (!btn) return;
        if (this._submitHandler) {
            btn.removeEventListener('click', this._submitHandler);
            this._submitHandler = null;
        }
        btn.hidden = true;
        btn.disabled = true;
    }

    /** Called by the orchestrator when a country is clicked during a map question. */
    isAwaitingMapClick() {
        return this._awaitingMapClick;
    }

    submitMapClick(name) {
        if (this._awaitingMapClick && this._mapResolve) {
            this.globe.setSelectedCountry(name);
            this._mapResolve(name);
        }
    }

    /** Apply the post-answer reveal (colour the grid, highlight correct on map). */
    showReveal(reveal, question) {
        const method = question.answer && question.answer.method;
        const isGrid = method === 'grid-single' || method === 'grid-multi';
        if (isGrid) {
            this.grid.applyReveal(reveal);
        } else if (reveal.correctOptions && reveal.correctOptions.length) {
            // Map question: flash the correct country green.
            const correct = reveal.correctOptions[0];
            this.globe.flashCountry(correct, 0x33dd66, 1600);
            this.globe.setSelectedCountry(correct);
        }
        const ok = reveal.correct;
        // Keep the readout to ~2 lines so the reserved feedback space holds: for
        // grid questions the cells already colour right/wrong/missed, so the text
        // stays generic; map questions name the (single) correct country.
        let text;
        if (ok) text = 'Correct!';
        else if (isGrid) text = 'Not quite — the answer is highlighted.';
        else text = `Answer: ${(reveal.correctOptions || []).join(', ')}`;
        this.els.feedback.textContent = text;
        this.els.feedback.className = 'dq-feedback ' + (ok ? 'correct' : 'wrong');
    }

    _setupFlag(question) {
        if (question.flag) {
            this.els.flag.src = `https://flagcdn.com/w320/${question.flag}.png`;
            this.els.flag.style.display = 'block';
        } else {
            this.els.flag.removeAttribute('src');
            this.els.flag.style.display = 'none';
        }
    }

    _setupMap(question) {
        const map = question.map;
        if (!map) {
            // Text/flag-only question — neutral full globe behind the panel.
            this.camera.clearViewOffset();
            this.globe.showAll();
            this.globe.clearSelection();
            this.camera.zoomOut();
            return;
        }

        // Server-supplied zoom (multi-country framing) wins; otherwise this is a
        // single-subject question — frame it so it fills ≤20% of the screen, giving
        // neighbour context without revealing the answer.
        let distance = map.zoom;
        if (!distance && map.focusCountry) {
            distance = this.camera.framingDistanceFor(map.focusCountry, QUIZ_SUBJECT_SCREEN_FRACTION);
        }

        // Map-click questions ("Click X.") let the player rotate the globe so they
        // can bring their intended country to the least-distorted centre before
        // tapping — the drag-vs-tap threshold in pointer-controls keeps a rotate
        // from registering as an answer. The server lock is honoured only for
        // grid questions drawn over a background map (e.g. "border X"), where the
        // subject is highlighted and mustn't be spun out of frame.
        const method = question.answer && question.answer.method;
        const isMapClick = method === 'map-click-single' || method === 'map-click-multi';
        const lockRotation = isMapClick ? false : !!map.lockRotation;

        this.camera.frameView({
            lat: map.center.lat,
            lng: map.center.lng,
            distance,
            focalAnchor: map.focalAnchor,
            lockRotation,
        });

        this.globe.showAll();
        this.globe.clearSelection();
        if (map.highlight && map.highlight.length) {
            this.globe.setSelectedCountry(map.highlight[0]);
        }
    }

    _resetView() {
        this.grid.clear();
        this.els.flag.style.display = 'none';
        this._setHint(false);
        this._hideSubmit();
    }

    /** Full cleanup when the quiz ends. */
    teardown() {
        this.camera.clearViewOffset();
        this.camera.getControls().enableRotate = true;
        this.globe.showAll();
        this.globe.clearSelection();
        this.grid.clear();
        this.els.flag.style.display = 'none';
        this._setHint(false);
        this._hideSubmit();
    }
}
