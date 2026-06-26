/**
 * Main CTA cluster — the primary "Give me a quiz" button (amber) plus, beside it,
 * the secondary Daily Challenge pill (purple, owned by daily-quiz.js and only shown
 * after "Maybe later"). Per design/main_buttons: desktop top-left, mobile bottom-right.
 *
 * This module enhances the pre-existing #take-quiz-btn (kept in index.html so its
 * click wiring stays put): it wraps the button in a positioned #main-cta-cluster,
 * adds the animated amber glow behind it, and fills the button with the icon badge +
 * two-line label. All placement / responsive / hide rules live in styles.css under
 * #main-cta-cluster; this file only builds DOM.
 *
 * Icons are inline SVG (no icon-font <link>, per CLAUDE.md) — Phosphor fill glyphs.
 */

// Phosphor fill `globe-hemisphere-west` (viewBox 0 0 256 256), filled with currentColor.
const GLOBE_FILL = '<path d="M128,24A104,104,0,1,0,232,128,104.13,104.13,0,0,0,128,24ZM92,206.51a87.78,87.78,0,0,1-37.49-30.61l16.69-9.7a8,8,0,0,1,9.21.84l11.7,10.23a8,8,0,0,0,10.51,0l13.36-11.69a8,8,0,0,1,6.65-1.9l16.86,2.81a8,8,0,0,0,9-5.84l4.92-18.43a8,8,0,0,0-3.16-8.65l-17.78-12.46a8,8,0,0,1-2.91-9.65l3.81-9.13A8,8,0,0,1,144,98.36l13.13.94a8,8,0,0,0,8.5-6.69l1.66-10.07a8,8,0,0,1,4.07-5.69l13.62-7.48a88,88,0,0,1,8.5,99.06l-14.13-8.21a8,8,0,0,0-9.18.76l-13.36,11.69a8,8,0,0,1-6.65,1.9Z"/>';

// `Give me a quiz` icon badge + two-line label, injected into the existing button.
function quizButtonInner() {
    return `
        <span class="qb-icon" aria-hidden="true"><svg viewBox="0 0 256 256" width="25" height="25" fill="currentColor">${GLOBE_FILL}</svg></span>
        <span class="qb-text">
            <span class="qb-title">Give me a quiz</span>
            <span class="qb-sub">Countries &middot; Flags &middot; Capitals</span>
        </span>
    `;
}

/**
 * Publish the Quiz pill's live height as `--cta-quiz-h` so the docked Daily pill can
 * sit a fixed gap below it (desktop) / above it (mobile) without guessing the height
 * — the 44px icon badge and webfont metrics make a hardcoded offset unreliable.
 */
function syncQuizHeight() {
    const cluster = document.getElementById('main-cta-cluster');
    const h = cluster && cluster.offsetHeight;
    if (h) document.documentElement.style.setProperty('--cta-quiz-h', `${h}px`);
}

/**
 * Wrap #take-quiz-btn in the cluster + glow and fill its label. Idempotent: a second
 * call (or a missing button) is a no-op. The click handler stays wired in index.html.
 */
export function initMainCta() {
    const btn = document.getElementById('take-quiz-btn');
    if (!btn || document.getElementById('main-cta-cluster')) return;

    const cluster = document.createElement('div');
    cluster.id = 'main-cta-cluster';

    const glow = document.createElement('div');
    glow.className = 'qb-glow';
    glow.setAttribute('aria-hidden', 'true');

    // Insert the cluster where the button is, then move the button inside (behind it
    // sits the glow, so the radial halo renders below the pill — a ::before can't,
    // since negative-z children still paint above the button's own gradient).
    btn.parentNode.insertBefore(cluster, btn);
    cluster.appendChild(glow);
    cluster.appendChild(btn);

    btn.innerHTML = quizButtonInner();

    // Measure now, after layout, on resize (breakpoint flips the height), and once
    // the webfonts land (Fredoka changes the pill height when it swaps in).
    syncQuizHeight();
    requestAnimationFrame(syncQuizHeight);
    window.addEventListener('resize', syncQuizHeight);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncQuizHeight);
}
