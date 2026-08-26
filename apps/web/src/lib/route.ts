/**
 * What is on screen, shared between islands.
 *
 * A module singleton rather than React Context, and that is forced rather than
 * chosen: Astro islands are separate React roots, so a provider in one cannot be
 * consumed by another. A module-level store is the only thing both can reach —
 * the same reason quiz-core's quizStore is a singleton.
 *
 * It holds the ROUTE, not just a country. The vanilla app kept the equivalent
 * answer in two unrelated places that could disagree about the same URL; one
 * store and one parser (`routes.ts`) is the fix. Fetching, the panel render and
 * the History API all live in AppRouter; the globe just listens.
 */
import type { Country } from '../components/CountryArticle';
import type { LandingModel } from './landing';
import { HOME_ROUTE, sameRoute, type Route } from './routes';

export interface Screen {
    route: Route;
    /** The article on screen, when the route names one. */
    country: Country | null;
}

type Listener = (screen: Screen) => void;

let current: Screen = { route: HOME_ROUTE, country: null };
const listeners = new Set<Listener>();

export function getScreen(): Screen {
    return current;
}

/** Publish a new screen. No-op if it is already the one showing. */
export function setScreen(screen: Screen): void {
    if (sameRoute(current.route, screen.route)) return;
    current = screen;
    for (const fn of listeners) {
        try {
            fn(screen);
        } catch (err) {
            // One bad listener must not stop the others — a globe that fails to
            // re-frame should not also prevent the panel from updating.
            console.error('route listener failed:', err);
        }
    }
}

/** @returns unsubscribe */
export function onScreenChange(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/** A country's content. The JSON sits beside its page. */
export async function fetchCountry(slug: string): Promise<Country> {
    const res = await fetch(`/country/${slug}.json`);
    if (!res.ok) throw new Error(`No content for ${slug} (${res.status})`);
    return res.json();
}

/**
 * The apex's content.
 *
 * Fetched rather than imported: `lib/landing.ts` reads country-meta.json and
 * build-landing-facts.mjs at build time, and importing it from a client island
 * would drag 75 KB of geometry and a Node-only module into the browser bundle.
 * The endpoint is named for what it serves rather than for where the page
 * currently lives, so it survives the apex moving from /app to /.
 */
let landingCache: LandingModel | null = null;
export async function fetchLanding(): Promise<LandingModel> {
    if (landingCache) return landingCache;
    const res = await fetch('/landing.json');
    if (!res.ok) throw new Error(`No landing content (${res.status})`);
    landingCache = await res.json();
    return landingCache!;
}
