/**
 * Which full-screen surface is open, if any.
 *
 * A module singleton for the same forced reason as `panel.ts`, `route.ts` and
 * `globe.ts`: the surfaces live in one island and some of the things that open
 * them live in another. The quiz's mode picker offers "View your progress", and
 * the progress sheet belongs to the shell — separate React roots, no shared
 * provider.
 *
 * It holds ONE name rather than a set, because these surfaces are mutually
 * exclusive by design: each is a sheet that covers the globe, and two at once
 * would be a stack the Escape key could not unwind predictably.
 *
 * A quiz is deliberately NOT one of these. It is not a sheet over the app, it is
 * the app for its duration, and `quizStore` already answers "is a quiz running".
 */

/**
 * `theme-lab` is a sheet in the same sense: it covers the globe and is opened
 * from settings, so the two are exclusive by the same rule.
 */
export type OverlayName = 'settings' | 'stats' | 'theme-lab';

type Listener = (open: OverlayName | null) => void;

let current: OverlayName | null = null;
const listeners = new Set<Listener>();

export function getOverlay(): OverlayName | null {
    return current;
}

/** Open one surface, or pass null to close whatever is open. */
export function setOverlay(next: OverlayName | null): void {
    if (current === next) return;
    current = next;
    for (const fn of listeners) {
        try {
            fn(next);
        } catch (err) {
            // One bad listener must not leave the overlay half-open.
            console.error('overlay listener failed:', err);
        }
    }
}

export function closeOverlay(): void {
    setOverlay(null);
}

/** @returns unsubscribe */
export function onOverlayChange(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
