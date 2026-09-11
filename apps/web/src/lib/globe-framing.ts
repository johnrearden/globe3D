/**
 * Where the globe should sit when a panel covers part of the screen.
 *
 * The panel takes roughly two thirds of the viewport, so a globe framed against
 * the whole viewport ends up centred *behind* it — visible only as a sliver past
 * the panel's edge. This works out the free region and returns framing that puts
 * the globe in the middle of it.
 *
 * Pure, and takes plain rectangles rather than elements, so it is testable in
 * Node and carries no DOM into the bridge — `focalAnchor` crosses as two
 * numbers, which is the rule that keeps GlobeBridge portable.
 *
 * The canvas itself must stay full-viewport: `PointerControls` maps pointer→NDC
 * against `window.innerWidth/innerHeight`, so a canvas sized to the free region
 * would make every pick resolve to the wrong country, with nothing to notice.
 * Only the projection moves.
 */

export interface Rect { left: number; top: number; width: number; height: number }
export interface Framing {
    /** Normalized screen position for the globe's centre; {x:.5,y:.5} is centre. */
    focalAnchor: { x: number; y: number };
    /** Globe diameter as a fraction of viewport width, for frameGlobe(). */
    widthFraction: number;
    /** Short side of the free region over the viewport's, for setVisibleRegion(). */
    visibleFraction: number;
}

/** How much of the free region's short side the globe spans beside a desktop
 *  column, and when nothing covers it. Below 1 so the limb never touches the
 *  panel edge. */
const FILL = 0.62;

/** The same, in the strip above a phone's bottom sheet. The globe is the
 *  application, and on a phone the strip is half the screen: it fills most of
 *  it. 0.9 read as too close on a real phone; 0.8 keeps the limb clear of the
 *  round corner buttons with a margin of sky around it. */
const FILL_STACKED = 0.8;

/**
 * The smallest free strip worth framing into, as a fraction of viewport height.
 *
 * The engine cannot draw the globe arbitrarily small: the camera's farthest
 * zoom is a distance of 10 (`camera-controls.js`), and with the 75° vertical
 * FOV the globe at that distance is vh / (10 · tan 37.5°) ≈ 0.13 · vh across,
 * whatever the width. Framing asks for FILL_STACKED of the strip, so a strip
 * shorter than 0.13 / 0.8 ≈ 0.17 · vh gets a globe the camera clamps LARGER
 * than the strip — clipped by the screen edge above and the sheet below, a
 * sliver under the search box. That is what the apex looked like on a phone
 * with the sheet at 88vh (a 100px strip on an 844px screen). Below this, the
 * honest answer is that nothing is free: centre the globe behind the sheet, as
 * a collapsed sheet or a drag will reveal it whole.
 */
const MIN_FREE_FRACTION = 0.17;

/** Nothing is covering the globe: centre it, full size. */
const FULL = (vw: number, vh: number): Framing => ({
    focalAnchor: { x: 0.5, y: 0.5 },
    widthFraction: (FILL * Math.min(vw, vh)) / vw,
    visibleFraction: 1,
});

/**
 * @param panel    the panel's bounding rect, or null when nothing covers the globe
 * @param viewport { width, height } in CSS pixels
 */
export function framingFor(panel: Rect | null, viewport: { width: number; height: number }): Framing {
    const vw = Math.max(viewport.width, 1);
    const vh = Math.max(viewport.height, 1);

    if (!panel || panel.width <= 0 || panel.height <= 0) {
        return FULL(vw, vh);
    }

    // Side by side when the panel leaves a usable column beside it; stacked
    // (mobile bottom sheet) otherwise. Measured from the live rect rather than
    // duplicating the CSS breakpoint, so the two cannot disagree.
    const horizontal = panel.left > vw * 0.12;
    const freeW = horizontal ? panel.left : vw;
    const freeH = horizontal ? vh : panel.top;

    // A collapsed sheet can leave no free region at all; centre rather than
    // divide by zero. A strip the camera cannot shrink the globe into counts
    // as no free region too — see MIN_FREE_FRACTION.
    if (freeW <= 0 || freeH <= 0) return FULL(vw, vh);
    if (Math.min(freeW, freeH) < MIN_FREE_FRACTION * vh) return FULL(vw, vh);

    const focalAnchor = horizontal
        ? { x: (freeW * 0.5) / vw, y: 0.5 }
        : { x: 0.5, y: (freeH * 0.5) / vh };

    const diameter = (horizontal ? FILL : FILL_STACKED) * Math.min(freeW, freeH);
    return {
        focalAnchor,
        widthFraction: diameter / vw,
        visibleFraction: Math.min(freeW, freeH) / Math.min(vw, vh),
    };
}
