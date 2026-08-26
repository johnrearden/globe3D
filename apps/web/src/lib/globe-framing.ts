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

/** How much of the free region's short side the globe spans. Below 1 so the
 *  limb never touches the panel edge. */
const FILL = 0.62;

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
    // divide by zero.
    if (freeW <= 0 || freeH <= 0) return FULL(vw, vh);

    const focalAnchor = horizontal
        ? { x: (freeW * 0.5) / vw, y: 0.5 }
        : { x: 0.5, y: (freeH * 0.5) / vh };

    const diameter = FILL * Math.min(freeW, freeH);
    return {
        focalAnchor,
        widthFraction: diameter / vw,
        visibleFraction: Math.min(freeW, freeH) / Math.min(vw, vh),
    };
}
