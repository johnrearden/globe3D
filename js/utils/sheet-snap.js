/**
 * The snap decision for a draggable bottom sheet: after a drag, does it
 * settle expanded or collapsed?
 *
 * Pure, and its own module because two sheets share it — the vanilla
 * `PanelSheet` class (js/features/daily-quiz/panel-sheet.js) and the Astro
 * app's `PanelSheet.tsx`. The class is DOM and stays with the vanilla app;
 * this is the part with a right answer, so it is the part with a test.
 */

// Collapse if the panel was dragged past this fraction of its travel.
const SNAP_FRACTION = 0.33;
// A release faster than this (px/ms) snaps in the fling direction regardless of position.
const FLING_VELOCITY = 0.35;

/**
 * @param {number} translateY    current downward offset (px, 0 = fully expanded)
 * @param {number} maxTranslate  offset at the collapsed/peek position (px)
 * @param {number} velocityY     release velocity (px/ms; + = downward)
 * @returns {'expanded'|'collapsed'}
 */
export function decideSnap(translateY, maxTranslate, velocityY) {
    if (maxTranslate <= 0) return 'expanded';
    if (velocityY > FLING_VELOCITY) return 'collapsed';
    if (velocityY < -FLING_VELOCITY) return 'expanded';
    return translateY > maxTranslate * SNAP_FRACTION ? 'collapsed' : 'expanded';
}
