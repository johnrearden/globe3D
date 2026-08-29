/**
 * Drive the globe from a Daily Challenge question's server-supplied map block.
 *
 * Sibling of `lib/quiz/globe-choreography.ts`, and deliberately not merged with
 * it: quiz-core's client block *describes* what to look at (`focus`, `marker`)
 * and the client decides the camera, whereas the server's block *is* a camera
 * (`center`, `zoom`, `lockRotation`). One applier taking both would have to
 * guess which shape it was handed, which is how the two would end up disagreeing
 * about the same field name.
 *
 * Ported from `js/features/daily-quiz/question-renderer.js:165-205`.
 */
import { QUIZ_SUBJECT_SCREEN_FRACTION } from '../../../../../js/core/focus-zoom.js';
import type { GlobeBridge } from '../globe-types';
import type { DailyQuestion } from './types';

/** Is this question answered by tapping the globe rather than a grid? */
export function isMapClick(question: DailyQuestion): boolean {
    const method = question.answer?.method;
    return method === 'map-click-single' || method === 'map-click-multi';
}

/**
 * Point the globe at a question.
 *
 * @param globe the bridge — no engine object crosses
 */
export function applyServerMap(globe: GlobeBridge, question: DailyQuestion): void {
    const map = question.map;

    if (!map) {
        // A text or flag question. Neutral globe behind the panel — but do NOT
        // leave a highlight from the previous question sitting on it.
        globe.showAll();
        globe.clearSelection();
        globe.resetView();
        return;
    }

    // An explicit server zoom wins. Otherwise this is a single-subject question:
    // frame it to a fraction of the screen so neighbours give context without
    // the framing itself giving the answer away.
    let distance = map.zoom;
    if (!distance && map.focusCountry) {
        distance = globe.framingDistanceFor(map.focusCountry, QUIZ_SUBJECT_SCREEN_FRACTION);
    }

    // A map-click question is never locked, whatever the server says: the player
    // has to be able to rotate to reach the country they mean. PointerControls'
    // drag-vs-tap threshold is what stops that registering as an answer. The
    // server's lock is honoured only for grid questions drawn over a background
    // map, where the subject is highlighted and must stay in frame.
    const lockRotation = isMapClick(question) ? false : !!map.lockRotation;

    globe.frameView({
        lat: map.center.lat,
        lng: map.center.lng,
        distance,
        focalAnchor: map.focalAnchor,
        lockRotation,
    });

    globe.showAll();
    globe.clearSelection();
    if (map.highlight?.length) globe.highlight(map.highlight[0]);
}

/** Hand the globe back exactly as the reader left it. */
export function releaseGlobe(globe: GlobeBridge): void {
    globe.resetView();
    globe.setInteractive(true);
    globe.setAutoRotateAllowed(true);
    globe.showAll();
    globe.clearSelection();
    globe.markers.clear();
}
