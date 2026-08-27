/**
 * Whether the content panel is expanded or collapsed.
 *
 * A module singleton for the same forced reason as `route.ts`: PanelSheet, the
 * router and the globe are three separate React roots (Astro islands), so a
 * provider in one cannot be read by another.
 *
 * It exists because "Explore <country> on the globe" is not a navigation. In an
 * app that keeps one globe for the whole session, the globe is already on screen
 * behind the article — the reader is asking for the panel to get out of the way.
 * It used to be an `<a href="/?country=…">` pointing at the vanilla app, so it
 * left the Astro app entirely and rebuilt the globe from scratch.
 */

export type Snap = 'expanded' | 'collapsed';

type Listener = (snap: Snap) => void;

let current: Snap = 'expanded';
const listeners = new Set<Listener>();

export function getPanelSnap(): Snap {
    return current;
}

/** Set the panel state. No-op if unchanged. */
export function setPanelSnap(next: Snap): void {
    if (next === current) return;
    current = next;
    for (const fn of listeners) {
        try {
            fn(next);
        } catch (err) {
            // One bad listener must not stop the others — a globe that fails to
            // re-frame should not also leave the panel stuck.
            console.error('panel listener failed:', err);
        }
    }
}

/** @returns unsubscribe */
export function onPanelSnapChange(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
