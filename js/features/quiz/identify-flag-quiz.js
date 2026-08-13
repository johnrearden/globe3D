/**
 * Identify Flag Quiz Module
 * Displays a 3D waving flag and asks the player to identify which country it belongs to
 */

import { state } from '../../data/state.js';
import { quizHistoryStore } from '../../data/quiz-history-store.js';
import { QuizQuestionChrome, svgIcon } from './quiz-question-chrome.js';
import { createWebGLRenderer } from '../../utils/webgl-diagnostics.js';
import {
    buildFlagDirectionSchedule, createSession, generateIdentifyFlag, systemRng, toHistoryRecord
} from '@terragotcha/quiz-core';

import * as THREE from 'three';

export class IdentifyFlagQuiz {
    constructor(options = {}) {
        this.globeManager = options.globeManager;
        this.elements = options.elements;
        this.showQuizCelebration = options.showQuizCelebration;
        this.clearQuizTimers = options.clearQuizTimers;
        this.countryToISO = options.countryToISO;
        this.countryTable = options.countryTable;
        this.animateFlagWave = options.animateFlagWave;
        this.quizTimer = options.quizTimer;

        // Quiz state
        // Score / progress / used-countries / per-question log all live in the
        // quiz-core session; only the view-side bits stay here.
        this.session = null;
        this.currentQuestion = null;
        this.autoAdvanceTimer = null;
        this.active = false;
        this.scope = 'globe'; // Region filter: 'globe' or a region name

        // Hero flag renderer state (forward questions: one big waving flag)
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.flagMesh = null;
        this.flagOriginalPositions = null;
        this.flagTime = 0;

        // Reverse-question grid: 6 waving flags on one shared canvas/context.
        this.activeLayout = 'forward'; // 'forward' (hero) | 'reverse' (grid)
        this.gridRenderer = null;
        this.gridScene = null;
        this.gridCamera = null;
        this.gridFlags = []; // [{ mesh, originalPositions, country }]
        // Bumped on every nextQuestion so stale async flag loads are dropped.
        this.questionToken = 0;

        // Terragotcha question-screen chrome (top bar / chips / progress / prompt).
        this.chrome = new QuizQuestionChrome({
            elements: this.elements,
            onClose: () => this.cancel()
        });
    }

    // 2×3 grid cell centres (world units), row-major. Flags share the hero plane
    // size (10×6.67) so animateFlagWave reuses the hero's wave constants unchanged;
    // renderGrid() draws each flag through its own viewport with the camera aimed
    // at that flag, so every tile looks like a centred copy of the hero flag. The
    // world spacing only needs to exceed each cell's frustum so neighbours don't
    // bleed into adjacent viewports.
    static GRID_CELLS = [[-10, 16], [10, 16], [-10, 0], [10, 0], [-10, -16], [10, -16]];

    /**
     * Initialize the reverse-question grid renderer (one canvas, 6 flags).
     */
    initGridRenderer() {
        if (this.gridRenderer) return;

        this.gridScene = new THREE.Scene();
        this.gridScene.background = null;

        // Perspective camera (re-aimed at each flag per cell in renderGrid) so the
        // Z-wave produces the same edge-flutter as the hero flag — an orthographic
        // camera would render a Z-only ripple as a motionless rectangle.
        this.gridCamera = new THREE.PerspectiveCamera(45, 1.5, 0.1, 100);

        this.gridRenderer = createWebGLRenderer({ antialias: true, alpha: true }, { label: 'quiz-flag' });
        // updateStyle=false: keep the drawing buffer square (2 cols × 3 rows of 3:2
        // cells → 1:1) but let CSS size the canvas element (else setSize writes inline
        // px and beats the stylesheet).
        this.gridRenderer.setSize(720, 720, false);
        this.gridRenderer.setClearColor(0x000000, 0);

        // Lights so the wave is visible: under orthographic projection a pure-Z
        // ripple only reads through shading (the lit material's normals), exactly
        // like the hero flag. Same setup as initRenderer().
        this.gridScene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(5, 5, 5);
        this.gridScene.add(dir);
    }

    /** Dispose all current grid flag meshes/materials/textures. */
    clearGridFlags() {
        for (const f of this.gridFlags) {
            if (this.gridScene) this.gridScene.remove(f.mesh);
            f.mesh.geometry.dispose();
            if (f.mesh.material.map) f.mesh.material.map.dispose();
            f.mesh.material.dispose();
        }
        this.gridFlags = [];
    }

    /**
     * Load and lay out 6 waving flags for a reverse question, one per option.
     * Flag i sits in grid cell i so it aligns with overlay button i.
     * @param {string[]} options - the 6 shuffled country names
     */
    displayFlagGrid(options) {
        this.initGridRenderer();
        this.clearGridFlags();

        const token = this.questionToken;
        const loader = new THREE.TextureLoader();

        options.forEach((countryName, i) => {
            const iso = this.countryToISO[countryName];
            if (!iso || i >= IdentifyFlagQuiz.GRID_CELLS.length) return;
            const [cx, cy] = IdentifyFlagQuiz.GRID_CELLS[i];

            loader.load(
                `https://flagcdn.com/w320/${iso}.png`,
                (tex) => {
                    // Drop the load if the player already advanced.
                    if (token !== this.questionToken) { tex.dispose(); return; }

                    const geo = new THREE.PlaneGeometry(10, 6.67, 12, 8);
                    // Lit material (matches the hero) so the Z-wave shows as moving
                    // shading under the orthographic camera.
                    const mat = new THREE.MeshStandardMaterial({
                        map: tex,
                        side: THREE.DoubleSide,
                        roughness: 0.7,
                        metalness: 0.1
                    });
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.position.set(cx, cy, 0);

                    const orig = new Float32Array(geo.attributes.position.array);
                    this.gridScene.add(mesh);
                    this.gridFlags.push({ mesh, originalPositions: orig, country: countryName, cellIndex: i });
                },
                undefined,
                (error) => console.error('Error loading grid flag:', countryName, error)
            );
        });
    }

    /**
     * Initialize the flag renderer (creates scene, camera, renderer, lights)
     */
    initRenderer() {
        if (this.renderer) return; // Already initialized

        // Create flag scene for quiz
        this.scene = new THREE.Scene();
        this.scene.background = null; // Transparent background

        // Create flag camera for quiz display
        this.camera = new THREE.PerspectiveCamera(45, 560 / 373, 0.1, 1000);
        this.camera.position.z = 9.5;

        // Create flag renderer for quiz. updateStyle=false so CSS controls the
        // display size (the stage panel caps it); inline px would fight the CSS.
        this.renderer = createWebGLRenderer({ antialias: true, alpha: true }, { label: 'quiz-flag' });
        this.renderer.setSize(560, 373, false);
        this.renderer.setClearColor(0x000000, 0); // Transparent

        // Add lights to flag scene
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 5, 5);
        this.scene.add(directionalLight);
    }

    /**
     * Update flag wave animation
     */
    updateAnimation() {
        this.flagTime = performance.now() * 0.001 * 3; // Speed factor
        if (this.activeLayout === 'reverse') {
            // Animate the 6 grid flags, then render them ourselves (per-cell
            // viewports). The getters return null in reverse so the main loop
            // skips its single render() call and we own the draw entirely.
            for (const f of this.gridFlags) {
                this.animateFlagWave(f.mesh, f.originalPositions, this.flagTime);
            }
            this.renderGrid();
        } else {
            if (!this.flagMesh || !this.flagOriginalPositions) return;
            this.animateFlagWave(this.flagMesh, this.flagOriginalPositions, this.flagTime);
        }
    }

    /**
     * Render the 6 reverse-question flags, each through its own viewport with the
     * camera aimed straight at it — gives every tile the hero flag's perspective
     * edge-flutter while keeping each flag centred and aligned to its button cell.
     */
    renderGrid() {
        if (!this.gridRenderer || this.gridFlags.length === 0) return;

        const r = this.gridRenderer;
        const W = 720, H = 720;            // drawing-buffer size (square: 2×3 of 3:2)
        const cw = W / 2, ch = H / 3;      // cell size in buffer pixels
        // Inset each flag's viewport inside its cell to add separation between flags
        // (the invisible click buttons still cover the full cell).
        const mx = cw * 0.12, my = ch * 0.12;
        const cam = this.gridCamera;
        cam.aspect = (cw - 2 * mx) / (ch - 2 * my);

        // Clear the whole canvas once; each per-cell render then clears+draws only
        // its scissored cell, so cells don't wipe each other.
        r.setScissorTest(false);
        r.clear();
        r.setScissorTest(true);

        for (const f of this.gridFlags) {
            const col = f.cellIndex % 2;
            const row = (f.cellIndex / 2) | 0;
            const px = col * cw + mx;
            const py = H - (row + 1) * ch + my; // WebGL viewport origin is bottom-left
            r.setViewport(px, py, cw - 2 * mx, ch - 2 * my);
            r.setScissor(px, py, cw - 2 * mx, ch - 2 * my);

            const p = f.mesh.position;
            cam.position.set(p.x, p.y, 9.5);
            cam.lookAt(p.x, p.y, 0);
            cam.updateProjectionMatrix();
            r.render(this.gridScene, cam);
        }

        r.setScissorTest(false);
        r.setViewport(0, 0, W, H);
    }

    /**
     * Display a flag for the quiz
     * @param {string} countryName - Name of the country whose flag to display
     */
    displayFlag(countryName) {
        // Initialize renderer if needed
        this.initRenderer();

        // Get ISO code for the country
        const isoCode = this.countryToISO[countryName];
        if (!isoCode) {
            console.error('No ISO code found for country:', countryName);
            return;
        }

        // Remove old flag if exists
        if (this.flagMesh) {
            this.scene.remove(this.flagMesh);
            this.flagMesh.geometry.dispose();
            // Dispose material and texture properly
            if (this.flagMesh.material.map) {
                this.flagMesh.material.map.dispose();
            }
            this.flagMesh.material.dispose();
            this.flagMesh = null;
            this.flagOriginalPositions = null;
        }

        // Create plane geometry with subdivisions for wave effect
        const flagGeometry = new THREE.PlaneGeometry(10, 6.67, 20, 15);

        // Store reference to this load operation
        const currentLoadIsoCode = isoCode;

        // Load flag texture with callback
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(
            `https://flagcdn.com/w640/${isoCode}.png`,
            (flagTexture) => {
                // Only proceed if this is still the current quiz question
                // (prevents race condition if user advances quickly)
                if (this.currentQuestion && this.countryToISO[this.currentQuestion.correctCountry] === currentLoadIsoCode) {
                    // Texture loaded successfully
                    // Create material
                    const flagMaterial = new THREE.MeshStandardMaterial({
                        map: flagTexture,
                        side: THREE.DoubleSide,
                        roughness: 0.7,
                        metalness: 0.1
                    });

                    // Create mesh
                    const flag = new THREE.Mesh(flagGeometry, flagMaterial);

                    // Store original positions for animation
                    const positions = flag.geometry.attributes.position;
                    const originalPositions = new Float32Array(positions.array);

                    // Update references
                    this.flagMesh = flag;
                    this.flagOriginalPositions = originalPositions;
                    this.scene.add(this.flagMesh);

                    // Force render with new texture
                    this.renderer.render(this.scene, this.camera);

                    // Now that texture is loaded, show the flag stage (flex centres
                    // the canvas; matches the CSS panel layout).
                    this.elements.get('quiz-flag-display').style.display = 'flex';
                } else {
                    // Question changed before texture loaded, dispose texture
                    flagTexture.dispose();
                    flagGeometry.dispose();
                }
            },
            undefined,
            (error) => {
                console.error('Error loading flag texture:', error);
                flagGeometry.dispose();
            }
        );

        // Attach the canvas the first time only. Toggling display between
        // questions collapses the container and bounces the Next button.
        // Once visible, leave it visible — the canvas will render transparent
        // for the brief moment between removing the old mesh and the new
        // texture arriving.
        const flagDisplay = this.elements.get('quiz-flag-display');
        if (this.renderer.domElement.parentNode !== flagDisplay) {
            flagDisplay.innerHTML = '';
            flagDisplay.appendChild(this.renderer.domElement);
        }
    }

    /**
     * Start the quiz
     * @param {string} scope - 'globe' for all countries, or a region name
     */
    /** Live score, read straight from the session so there's one source of truth. */
    get score() { return this.session ? this.session.getState().score : 0; }

    /** Questions answered so far. */
    get questionsAnswered() { return this.session ? this.session.getState().answered : 0; }

    start(scope = 'globe') {
        this.active = true;
        this.scope = scope;

        // Balanced-random schedule: 5 forward (flag → name) + 5 reverse
        // (name → flags), shuffled. Consumed by question index below.
        this.questionTypes = buildFlagDirectionSchedule(systemRng);

        this.session = createSession({
            mode: 'identify-flag',
            scope,
            countries: this.countryTable.all,
            rng: systemRng,
            // The schedule is per-question, so the direction is looked up by the
            // session's question index rather than tracked separately.
            nextQuestion: ctx => generateIdentifyFlag({
                ...ctx,
                direction: this.questionTypes[ctx.index] || 'forward'
            })
        });

        // Update state
        state.set('quiz.active', true);
        state.set('quiz.mode', 'identify-flag');
        state.set('quiz.score', 0);
        state.set('quiz.questionsAnswered', 0);

        // Add quiz-active and flag-quiz-active classes to body
        document.body.classList.add('quiz-active');
        document.body.classList.add('flag-quiz-active');

        // Clear any previous quiz options before starting
        const optionsContainer = this.elements.get('quiz-options');
        optionsContainer.innerHTML = '';

        // Clear any inline display overrides left over from cancelQuiz/end —
        // otherwise the container stays hidden and the Take Quiz button stays
        // visible despite the CSS rules driven by body.quiz-active.
        this.elements.get('quiz-container').style.display = '';
        this.elements.get('take-quiz-btn').style.display = '';

        // Legacy chrome (header/score/question/result/×) is replaced by the
        // Terragotcha question screen — hide it (CSS also hides it, but these
        // elements carry inline display overrides we must clear).
        this.elements.get('quiz-score').style.display = 'none';
        this.elements.get('quiz-question').style.display = 'none';
        this.elements.get('quiz-start-btn').style.display = 'none';
        this.elements.get('quiz-result').style.display = 'none';
        this.elements.get('quiz-next-btn').style.visibility = 'hidden';
        this.elements.get('quiz-flag-display').style.display = 'none';
        this.elements.get('quiz-cancel-btn').style.display = 'none';

        // Build the question-screen chrome (top bar / chips / progress / prompt).
        // Must run before quizTimer.start() so the timer binds to the chip's span.
        this.chrome.show();
        this.chrome.setScore(0, 0);

        // Start the count-up timer
        this.quizTimer.start();

        // Load first question
        this.session.begin();
        this.renderQuestion();
    }

    /**
     * End the quiz
     */
    end() {
        this.active = false;

        // Clear auto-advance timer if active
        if (this.autoAdvanceTimer) {
            clearTimeout(this.autoAdvanceTimer);
            this.autoAdvanceTimer = null;
        }

        // Update state
        state.set('quiz.active', false);
        state.set('quiz.mode', null);

        // Remove quiz-active and flag-quiz-active classes from body
        document.body.classList.remove('quiz-active');
        document.body.classList.remove('flag-quiz-active');

        // Drop any in-flight flag loads and dispose the reverse grid.
        this.questionToken++;
        this.clearGridFlags();
        this.activeLayout = 'forward';

        // Hide quiz elements
        this.elements.get('quiz-score').style.display = 'none';
        this.elements.get('quiz-question').style.display = 'none';
        this.elements.get('quiz-flag-display').style.display = 'none';
        this.elements.get('quiz-options').classList.remove('flag-overlay');
        this.elements.get('quiz-options').classList.remove('qz-answers');
        this.elements.get('quiz-options').innerHTML = '';
        this.elements.get('quiz-container').style.display = 'none';
        this.elements.get('quiz-next-btn').style.visibility = 'hidden';

        // Stop the timer, persist the result, and show the celebration overlay
        // with score + total time + standing/new best.
        const elapsedMs = this.quizTimer.stop();
        this.chrome.hide();
        const summary = quizHistoryStore.record(
            toHistoryRecord(this.session.getState(), elapsedMs)
        );
        // The results modal owns Play again (→ quiz chooser) / Share / Globe.
        this.showQuizCelebration({
            score: this.score,
            total: this.questionsAnswered,
            seconds: elapsedMs / 1000,
            mode: 'identify-flag',
            scope: this.scope,
            summary
        });
    }

    /**
     * Advance past a revealed question: the session either produces the next one
     * or reports the run is over.
     */
    nextQuestion() {
        this.session.advance();
        if (this.session.getState().status === 'complete') {
            this.end();
            return;
        }
        this.renderQuestion();
    }

    /** Render whatever question the session currently holds. */
    renderQuestion() {
        const live = this.session.getState().current;
        if (!live) {
            console.error('Failed to generate flag quiz question');
            this.end();
            return;
        }

        // Adapt quiz-core's payload to the shape this mode's DOM code expects.
        // `type` is the direction actually used — quiz-core downgrades reverse →
        // forward when a region can't supply enough flaggable distractors.
        const correctCountry = live.answer.correct[0];
        this.currentQuestion = {
            correctCountry,
            options: live.payload.grid.options.map(o => o.value),
            countryObj: this.countryTable.centroidObj(correctCountry),
            type: live.meta.direction
        };

        // Hide result and next button
        this.elements.get('quiz-result').style.display = 'none';
        this.elements.get('quiz-next-btn').style.visibility = 'hidden';

        // Invalidate any in-flight async flag loads from the previous question.
        this.questionToken++;

        const isReverse = this.currentQuestion.type === 'reverse';
        this.activeLayout = isReverse ? 'reverse' : 'forward';
        const optionsContainer = this.elements.get('quiz-options');
        const flagDisplay = this.elements.get('quiz-flag-display');

        // Drive the question-screen chrome (counter + progress + prompt).
        this.chrome.setQuestion(this.questionsAnswered + 1);
        if (this.currentQuestion.type === 'reverse') {
            this.chrome.setPrompt({
                layout: 'reverse',
                eyebrow: 'WHICH FLAG BELONGS TO',
                main: this.currentQuestion.correctCountry,
                mainQuestion: true
            });
        } else {
            this.chrome.setPrompt({
                layout: 'forward',
                eyebrow: 'Which country',
                main: 'does this flag belong to?'
            });
        }

        if (isReverse) {
            // Reverse: country name in the prompt, pick from 6 waving flags.
            flagDisplay.style.display = 'none';
            optionsContainer.classList.add('flag-overlay');
            optionsContainer.classList.remove('qz-answers');
            this.displayFlagGrid(this.currentQuestion.options);
        } else {
            // Forward: show the waving hero flag, pick from 6 country names.
            optionsContainer.classList.remove('flag-overlay');
            optionsContainer.classList.add('qz-answers');
            this.displayFlag(this.currentQuestion.correctCountry);
        }

        // Clear previous options completely
        optionsContainer.innerHTML = '';

        // Small delay to ensure DOM is clean before creating new buttons
        setTimeout(() => {
            // Reverse: the grid canvas sits behind the buttons as the first child,
            // absolutely filling #quiz-options; the 6 transparent buttons overlay it
            // in a matching 3×2 grid so clicks/feedback reuse the .quiz-option flow.
            if (isReverse && this.gridRenderer) {
                optionsContainer.appendChild(this.gridRenderer.domElement);
            }

            this.currentQuestion.options.forEach(optionName => {
                const button = document.createElement('button');
                button.className = isReverse ? 'quiz-option flag-cell' : 'quiz-option';
                button.disabled = false;
                button.removeAttribute('style');

                if (!isReverse) {
                    // Forward: country-name label.
                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = optionName;
                    button.appendChild(nameSpan);
                }
                // Reverse buttons stay empty/transparent — the waving flag shows through.

                button.dataset.country = optionName;
                button.addEventListener('click', () => this.handleAnswer(optionName));
                optionsContainer.appendChild(button);
            });
        }, 0);
    }

    /**
     * Handle quiz answer selection
     * @param {string} selectedCountry - Name of selected country
     */
    handleAnswer(selectedCountry) {
        // Scoring, the history log (keyed on the country whose flag was shown)
        // and used-country tracking all happen in the session; this method is
        // now purely the reveal.
        const { reveal } = this.session.answer(selectedCountry);
        const isCorrect = reveal.correct;

        state.set('quiz.score', this.score);
        state.set('quiz.questionsAnswered', this.questionsAnswered);

        // Update score display (legacy spans + the chrome chip).
        this.updateScoreDisplay();
        this.chrome.setScore(this.score, this.questionsAnswered);

        // Reveal locked state per the design: the correct option always turns
        // green (+ check mark), a wrong pick turns red (+ x mark), and every other
        // option dims. Marks are appended as a corner badge (flag tiles) or a
        // trailing icon (name buttons); CSS positions .qz-mark per layout.
        const optionButtons = document.querySelectorAll('.quiz-option');
        optionButtons.forEach(button => {
            button.disabled = true;
            const country = button.dataset.country;
            if (country === this.currentQuestion.correctCountry) {
                button.classList.add('correct');
                button.insertAdjacentHTML('beforeend',
                    `<span class="qz-mark qz-mark-correct">${svgIcon('check', 16)}</span>`);
            } else if (country === selectedCountry && !isCorrect) {
                button.classList.add('incorrect');
                button.insertAdjacentHTML('beforeend',
                    `<span class="qz-mark qz-mark-wrong">${svgIcon('x', 16)}</span>`);
            } else {
                button.classList.add('dimmed');
            }
        });

        // Don't show any result message
        this.elements.get('quiz-result').style.display = 'none';

        if (this.questionsAnswered >= 10) {
            setTimeout(() => {
                this.end();
            }, 2000);
        } else {
            // Show next button for 3 seconds, then auto-advance
            this.elements.get('quiz-next-btn').style.visibility = 'visible';

            // Clear any existing timer
            if (this.autoAdvanceTimer) {
                clearTimeout(this.autoAdvanceTimer);
            }

            // Linger longer on a wrong answer so the player can see the correct
            // flag/name highlighted before advancing.
            const advanceDelay = isCorrect ? 1500 : 2500;
            this.autoAdvanceTimer = setTimeout(() => {
                this.elements.get('quiz-next-btn').style.visibility = 'hidden';
                this.autoAdvanceTimer = null;
                this.nextQuestion();
            }, advanceDelay);
        }
    }

    /**
     * Update score display
     */
    updateScoreDisplay() {
        this.elements.get('quiz-score-value').textContent = this.score;
        this.elements.get('quiz-total-value').textContent = this.questionsAnswered;
    }

    /**
     * Check if quiz is active
     * @returns {boolean}
     */
    isActive() {
        return this.active;
    }

    /** End the quiz immediately without showing the celebration. */
    cancel() {
        if (this.autoAdvanceTimer) {
            clearTimeout(this.autoAdvanceTimer);
            this.autoAdvanceTimer = null;
        }
        this.quizTimer.cancel();
        this.chrome.hide();
        this.active = false;
        state.set('quiz.active', false);
        state.set('quiz.mode', null);

        document.body.classList.remove('quiz-active');
        document.body.classList.remove('flag-quiz-active');

        // Drop any in-flight flag loads and dispose the reverse grid.
        this.questionToken++;
        this.clearGridFlags();
        this.activeLayout = 'forward';

        this.elements.get('quiz-score').style.display = 'none';
        this.elements.get('quiz-question').style.display = 'none';
        this.elements.get('quiz-flag-display').style.display = 'none';
        this.elements.get('quiz-options').classList.remove('flag-overlay');
        this.elements.get('quiz-options').classList.remove('qz-answers');
        this.elements.get('quiz-options').innerHTML = '';
        // Clear the inline overrides (don't set 'none'/'block') so CSS restores
        // the idle state — Start Quiz panel on desktop, Take Quiz on mobile.
        this.elements.get('quiz-container').style.display = '';

        this.elements.get('search-container').style.display = 'block';
        this.elements.get('take-quiz-btn').style.display = '';

        this.elements.get('quiz-cancel-btn').style.display = 'none';
        this.elements.get('quiz-next-btn').style.visibility = 'hidden';
        this.elements.get('quiz-start-btn').style.display = 'block';
        this.elements.get('quiz-start-btn').textContent = 'Start Quiz';
    }

    /**
     * Get the flag renderer (for animation updates in main loop)
     * @returns {THREE.WebGLRenderer}
     */
    // Reverse questions render themselves (renderGrid, per-cell viewports), so the
    // getters return null in that layout — the main loop's `if (renderer && scene
    // && camera)` guard then skips its single render() and leaves the draw to us.
    getRenderer() {
        return this.activeLayout === 'reverse' ? null : this.renderer;
    }

    /**
     * Get the flag scene (for animation updates in main loop)
     * @returns {THREE.Scene}
     */
    getScene() {
        return this.activeLayout === 'reverse' ? null : this.scene;
    }

    /**
     * Get the flag camera (for animation updates in main loop)
     * @returns {THREE.Camera}
     */
    getCamera() {
        return this.activeLayout === 'reverse' ? null : this.camera;
    }

    /**
     * Get the flag mesh (for animation updates in main loop)
     * @returns {THREE.Mesh}
     */
    getFlagMesh() {
        return this.flagMesh;
    }
}
