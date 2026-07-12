/**
 * Landing-page border quiz — the interactive layer of a /borders/<slug> page.
 *
 * Deliberately tiny and globe-free: it reuses the daily-quiz OptionsGrid (whose
 * only dependency is a pure SVG-icon helper) and computes the reveal itself, so
 * NONE of the heavy globe / Three.js / api-client code is pulled onto a landing
 * page. Question data is read from the inlined <script id="border-data"> the
 * static generator (build-landing.mjs) emits.
 *
 * Critical rule (see the design handoff): the UI never reveals HOW MANY answers
 * are correct — no "of N" anywhere. The counter shows a bare count and the result
 * line never states the total, so the player can't back into the answer.
 */
import { OptionsGrid } from '../features/daily-quiz/options-grid.js';
import { svgIcon } from '../features/quiz/quiz-question-chrome.js';

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
    const total = answer.length;

    // Live counter chip (rendered by the template); we swap its text + icon.
    const counterIcon = document.getElementById('lp-counter-icon');
    const counterText = document.getElementById('lp-counter-text');
    const PIN = svgIcon('mapPin', 14);
    const DONE = svgIcon('checkCircle', 14);
    const setCounter = (icon, text) => {
        if (counterIcon) counterIcon.innerHTML = icon;
        if (counterText) counterText.textContent = text;
    };

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

    let checked = false;
    const cta = document.querySelector('.lp-cta');
    const heroGrid = document.querySelector('.lp-hero-grid');
    let ctaTimer = null;

    grid.render({
        options: data.options || [],
        cols: data.cols || 3,
        multiSelect: true,
        missedGlyph: 'plus',   // correct-but-missed cells show a "+" (handoff)
        onSelectionChange: (count) => {
            if (checked) return;
            submit.disabled = count === 0;
            setCounter(PIN, count === 1 ? '1 selected' : `${count} selected`);
        },
        onSubmit: (given) => {
            const reveal = computeReveal(given, answer);
            grid.applyReveal(reveal);
            checked = true;

            const found = reveal.rightPicks.length;
            const wrong = reveal.wrongPicks.length;

            // Counter → "N correct" (never "N of M").
            setCounter(DONE, found === 1 ? '1 correct' : `${found} correct`);

            // Result line — states correct/wrong but NEVER the target total.
            feedback.classList.remove('correct', 'nearly', 'wrong');
            if (found === total && wrong === 0) {
                feedback.textContent = 'Perfect — every border found!';
                feedback.classList.add('correct');
            } else {
                const parts = [found === 1 ? '1 correct' : `${found} correct`];
                if (wrong > 0) parts.push(`${wrong} wrong`);
                feedback.textContent = parts.join(' · ');
                feedback.classList.add(found >= total - 3 ? 'nearly' : 'wrong');
            }

            // The button becomes a neutral "Try again" that replays the quiz.
            submit.disabled = false;
            submit.textContent = 'Try again';
            submit.classList.add('is-retry');

            // Reveal the "More border quizzes" links now the quiz is done, so
            // they don't spoil the answers up front.
            document.querySelector('.lp-related')?.classList.remove('is-collapsed');

            // After a 1.5s beat, fade the CTA panel in. `cta-open` on the hero
            // grid lets CSS hide the map on mobile so the CTA takes its place
            // (over the map on desktop, in the map's slot on mobile).
            clearTimeout(ctaTimer);
            ctaTimer = setTimeout(() => {
                cta?.classList.remove('is-collapsed');
                heroGrid?.classList.add('cta-open');
            }, 1500);
        },
    });

    // On the narrow 3-column mobile grid, long country names would wrap or clip
    // in one cell — tag them so a CSS media query can let them span two cells
    // (keeping them on one line). The class is inert on desktop (no span rule).
    host.querySelectorAll('.quiz-option').forEach((cell) => {
        const label = cell.querySelector('.dq-cell-label');
        if (label && label.textContent.trim().length >= 11) cell.classList.add('dq-wide');
    });

    const reset = () => {
        checked = false;
        grid.reset();                 // clears reveal + selection, fires onSelectionChange(0)
        submit.textContent = 'Check answer';
        submit.classList.remove('is-retry');
        submit.disabled = true;
        feedback.textContent = '';
        feedback.classList.remove('correct', 'nearly', 'wrong');
        setCounter(PIN, '0 selected');
        // Cancel a pending fade-in and re-hide the CTA (and bring the mobile map
        // back) so the map/quiz are clear for a replay.
        clearTimeout(ctaTimer);
        cta?.classList.add('is-collapsed');
        heroGrid?.classList.remove('cta-open');
    };

    submit.addEventListener('click', () => {
        if (checked) reset();
        else grid.submitSelected();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
