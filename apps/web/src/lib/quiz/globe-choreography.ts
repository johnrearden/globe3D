/**
 * Drive the globe from a question's `map` block.
 *
 * Every quiz-core generator already describes what the globe should do, in
 * `payload.map` (`packages/quiz-core/src/payload.js:305`):
 *
 *     { highlight: string[], lock: boolean, focus?: string|null,
 *       marker?: {lat, lng}|null }
 *
 * The vanilla app ignored that and hand-wrote the camera choreography inside
 * each of the four modes — four sequences of `clearSelection` / `focusCountry` /
 * `frameGlobe` / `markers.*` that had to agree with each other and did not
 * always. Reading the block instead means one implementation, and a new mode
 * gets its globe behaviour by describing it rather than by writing it.
 *
 * Note this is NOT the Daily Challenge's map block. That one is server-shaped
 * (`center`, `zoom`, `focusCountry`, `lockRotation`) and is handled by
 * `js/features/daily-quiz/question-renderer.js`. Same idea, different producer.
 */
import type { GlobeBridge } from '../globe-types';

/** The client-side map block, as `mapBlock()` emits it. */
export interface MapBlock {
    highlight?: string[];
    lock?: boolean;
    focus?: string | null;
    marker?: { lat: number; lng: number } | null;
}

/**
 * How much of the screen a quiz subject fills.
 *
 * Deliberately small: the point is to show enough of the neighbourhood to make
 * the question fair without framing the answer so tightly that the shape gives
 * it away. Mirrors `QUIZ_SUBJECT_SCREEN_FRACTION` in `js/core/focus-zoom.js`.
 */
const SUBJECT_FRACTION = 0.20;

/**
 * Framing for a question that names a coordinate but no country — the reverse
 * capital question, where revealing which country to look at is the answer.
 */
const OVERVIEW_FRACTION = 0.25;

/** Put the globe into the state a question describes. */
export function applyMapBlock(globe: GlobeBridge, map: MapBlock | null | undefined): void {
    globe.showAll();
    globe.clearSelection();
    globe.markers.clear();

    if (!map) {
        globe.setInteractive(true);
        return;
    }

    // `lock` prevents the player spinning the subject out of frame on a question
    // whose answer is a grid pick. A map-click question must never be locked —
    // the player has to rotate to reach the country they mean, and the
    // drag-vs-tap threshold in PointerControls keeps that from registering as an
    // answer.
    globe.setInteractive(!map.lock);

    if (map.highlight?.length) globe.highlight(map.highlight[0]);

    if (map.focus) {
        // `aim` points the camera at the capital rather than the country's
        // centroid, so the marker is not off in a corner of the frame.
        globe.focusCountry(map.focus, {
            quizFraming: true,
            ...(map.marker ? { aim: map.marker } : {}),
        });
    } else if (map.marker) {
        globe.frameGlobe({
            lat: map.marker.lat,
            lng: map.marker.lng,
            widthFraction: OVERVIEW_FRACTION,
        });
    }

    // Placed without a label: the dot says "here", and naming it before the
    // answer would give the question away.
    if (map.marker) globe.markers.place(map.marker.lat, map.marker.lng);
}

/**
 * The reveal: name the marker the question left anonymous.
 *
 * Separate from `applyMapBlock` because the whole point is that it happens
 * later — placing a labelled marker with the question would answer it.
 */
export function revealMarkerLabel(globe: GlobeBridge, label: string): void {
    globe.markers.setLabel(label);
    globe.markers.showLabel();
}

/** Hand the globe back to the reader, exactly as it was before the quiz. */
export function releaseGlobe(globe: GlobeBridge): void {
    globe.markers.clear();
    globe.clearSelection();
    globe.showAll();
    globe.setInteractive(true);
    globe.setAutoRotateAllowed(true);
    globe.resetView();
}

export { SUBJECT_FRACTION, OVERVIEW_FRACTION };
