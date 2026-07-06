/**
 * Landing-page border quiz — the interactive layer of a /borders/<slug> page.
 *
 * Deliberately tiny and globe-free: it reuses the daily-quiz OptionsGrid (whose
 * only dependency is a pure SVG-icon helper) and computes the reveal itself, so
 * NONE of the heavy globe / Three.js / api-client code is pulled onto a landing
 * page. Question data is read from the inlined <script id="border-data"> the
 * static generator (build-landing.mjs) emits.
 */
import { OptionsGrid } from '../features/daily-quiz/options-grid.js';

function readData() {
    const el = document.getElementById('border-data');
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
}

/** Reveal object OptionsGrid.applyReveal expects: the three set differences. */
function computeReveal(given, answer) {
    const answerSet = new Set(answer);
    const givenSet = new Set(given);
    return {
        rightPicks: given.filter((v) => answerSet.has(v)),
        wrongPicks: given.filter((v) => !answerSet.has(v)),
        missed: answer.filter((v) => !givenSet.has(v)),
    };
}

function init() {
    const data = readData();
    const host = document.getElementById('border-quiz');
    if (!data || !host) return;

    const answer = data.answer || [];

    // Build the action row (submit button + feedback) around the grid, reusing
    // the daily-quiz .dq-* action styles.
    const grid = new OptionsGrid(host);
    const actions = document.createElement('div');
    actions.className = 'dq-actions';
    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'dq-submit';
    submit.textContent = 'Check answer';
    submit.disabled = true;
    const feedback = document.createElement('div');
    feedback.className = 'dq-feedback';
    actions.appendChild(submit);
    actions.appendChild(feedback);
    host.appendChild(actions);

    grid.render({
        options: data.options || [],
        cols: data.cols || 3,
        multiSelect: true,
        onSelectionChange: (count) => { submit.disabled = count === 0; },
        onSubmit: (given) => {
            const reveal = computeReveal(given, answer);
            grid.applyReveal(reveal);
            const correct = reveal.wrongPicks.length === 0 && reveal.missed.length === 0;
            feedback.textContent = correct
                ? 'Nice work — that’s all of them!'
                : `Not quite — ${answer.length} countries border ${data.name}.`;
            feedback.classList.add(correct ? 'correct' : 'wrong');
            submit.disabled = true;
            submit.textContent = 'Answer revealed';
            // Reveal the "More border quizzes" links now the quiz is done, so
            // they don't spoil the answers up front.
            document.querySelector('.lp-related')?.classList.remove('is-collapsed');
            // A beat later, slide the CTA carousel: the "Like map puzzles?" panel
            // scrolls in from the left as the "Reclaim Your Brain" panel exits.
            setTimeout(() => {
                document.querySelector('.lp-cta-track')?.classList.add('is-swapped');
            }, 1000);
        },
    });

    submit.addEventListener('click', () => grid.submitSelected());
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
