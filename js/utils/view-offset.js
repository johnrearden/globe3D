/**
 * Pure helper for camera focal-anchor offsetting (kept THREE/DOM-free so it's
 * unit-testable in Node). See CameraController.frameView().
 *
 * Given a viewport of (w, h) and a normalized screen anchor where the globe
 * center should appear, return the (x, y) offset for PerspectiveCamera
 * .setViewOffset(w, h, x, y, w, h).
 *
 * A feature at full-image (w/2, h/2) renders at (w/2 - x, h/2 - y); solving so
 * that lands at (anchor.x*w, anchor.y*h) gives x = w*(0.5 - anchor.x),
 * y = h*(0.5 - anchor.y). Anchor {x:0.5,y:0.5} → no shift.
 *
 * @param {number} w viewport width (px)
 * @param {number} h viewport height (px)
 * @param {{x:number,y:number}} anchor normalized [0..1], origin top-left
 * @returns {{x:number,y:number}} offset for setViewOffset
 */
export function viewOffsetFor(w, h, anchor) {
    return {
        x: w * (0.5 - anchor.x),
        y: h * (0.5 - anchor.y),
    };
}
