/**
 * The globe, published for the islands that are not the globe.
 *
 * A module singleton, in the same shape as `lib/panel.ts` and `lib/route.ts`,
 * and for the same forced reason: `GlobeIsland` is `client:only` and the quiz UI
 * is a separate React root. Separate roots cannot share a provider, so a
 * module-level store is the only thing both can reach. Same constraint that
 * makes `quizStore` a singleton — see `packages/quiz-core/src/store.js`.
 *
 * Two values cross, and only two:
 *
 *   - the `GlobeBridge`, so quiz code can command the globe without ever seeing
 *     `globeManager`, `cameraController`, a `THREE.Vector3` or a DOM node. That
 *     rule is what makes the interface portable to native; see
 *     `packages/globe-bridge/src/interface.js`.
 *   - the country table, because country data is deliberately NOT a globe
 *     concern. `createCountryTable` (`js/data/country-table.js`) assembles the
 *     plain, serialisable rows quiz-core's generators take. A renderer that
 *     happens to hold a capitals map is an accident of the web implementation.
 *
 * Both arrive late — after `loadGlobe()` resolves, seconds into the session — so
 * consumers subscribe rather than read. `onGlobeReady` fires immediately if the
 * globe is already up, which is the common case for a quiz started by a user who
 * has been looking at the globe for a while.
 */
import type { GlobeBridge } from './globe-types';

/** The rows quiz-core generators consume. Mirrors `js/data/country-table.js`. */
export interface CountryRow {
    name: string;
    centroid: [number, number, number];
    area?: number | null;
    iso?: string | null;
    region?: string | null;
    capital?: { name: string; lat: number; lng: number } | null;
    isDependency?: boolean;
}

export interface CountryTable {
    all: CountryRow[];
    byName(name: string): CountryRow | undefined;
    centroidObj(name: string): { x: number; y: number; z: number } | null;
}

export interface GlobeHandle {
    globe: GlobeBridge;
    countries: CountryTable;
}

type Listener = (handle: GlobeHandle) => void;

let current: GlobeHandle | null = null;
const listeners = new Set<Listener>();

/** The live globe, or null before it has finished loading. */
export function getGlobeHandle(): GlobeHandle | null {
    return current;
}

/**
 * Publish the globe. Called once by `GlobeIsland` after `loadGlobe()` resolves.
 *
 * Passing null clears it — the island does that on unmount, so a consumer can
 * never command a globe whose scene has been destroyed.
 */
export function setGlobeHandle(handle: GlobeHandle | null): void {
    current = handle;
    if (!handle) return;
    for (const fn of listeners) {
        try {
            fn(handle);
        } catch (err) {
            // One bad subscriber must not stop the others: a quiz that fails to
            // start should not also prevent the panel from re-framing.
            console.error('globe listener failed:', err);
        }
    }
}

/**
 * Run `fn` when the globe is available — immediately if it already is.
 *
 * @returns unsubscribe
 */
export function onGlobeReady(fn: Listener): () => void {
    if (current) {
        try {
            fn(current);
        } catch (err) {
            console.error('globe listener failed:', err);
        }
    }
    listeners.add(fn);
    return () => listeners.delete(fn);
}
