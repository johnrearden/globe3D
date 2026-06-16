/**
 * UI sync helpers — per-frame widgets driven by camera zoom distance.
 * Called from the render loop in index.html. Stateless; the camera is passed in.
 */

import { elements, show, hide, setText } from '../utils/dom.js';

const MIN_ZOOM = 1.13;
const MAX_ZOOM = 10;

/** Update the vertical zoom-level bar + numeric readout. */
export function updateZoomWidget(camera) {
    const currentZoom = camera.position.length();
    const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom));
    // Inverted: closer camera = taller bar.
    const percentage = ((MAX_ZOOM - clampedZoom) / (MAX_ZOOM - MIN_ZOOM)) * 100;

    const zoomBarFill = elements.get('zoom-bar-fill');
    if (zoomBarFill) {
        zoomBarFill.style.height = percentage + '%';
    }

    const zoomValue = elements.get('zoom-value');
    if (zoomValue) {
        setText(zoomValue, clampedZoom.toFixed(2));
    }
}

/** Show the zoom-out button when zoomed in (< 4), hide when zoomed out. */
export function updateZoomOutButtonVisibility(camera) {
    const zoomOutBtn = elements.get('zoom-out-btn');
    if (!zoomOutBtn) return;

    if (camera.position.length() < 4) {
        show(zoomOutBtn);
    } else {
        hide(zoomOutBtn);
    }
}
