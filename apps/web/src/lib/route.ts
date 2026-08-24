/**
 * The current country, shared between islands.
 *
 * A module singleton rather than React Context, and that is forced rather than
 * chosen: Astro islands are separate React roots, so a provider in one cannot be
 * consumed by another. A module-level store is the only thing both can reach —
 * the same reason quiz-core's quizStore is a singleton.
 *
 * Deliberately tiny. It holds which country is on screen and notifies listeners;
 * the fetching, the panel render and the History API all live in
 * CountryRouter, and the globe just listens.
 */
import type { Country } from '../components/CountryArticle';

type Listener = (country: Country) => void;

let current: Country | null = null;
const listeners = new Set<Listener>();

export function getCountry(): Country | null {
    return current;
}

/** Publish a new country. No-op if it is already the one on screen. */
export function setCountry(country: Country): void {
    if (current && current.slug === country.slug) return;
    current = country;
    for (const fn of listeners) {
        try {
            fn(country);
        } catch (err) {
            // One bad listener must not stop the others — a globe that fails to
            // re-focus should not also prevent the panel from updating.
            console.error('route listener failed:', err);
        }
    }
}

/** @returns unsubscribe */
export function onCountryChange(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/** Fetch a country's content. The JSON sits beside its page. */
export async function fetchCountry(slug: string): Promise<Country> {
    const res = await fetch(`/country/${slug}.json`);
    if (!res.ok) throw new Error(`No content for ${slug} (${res.status})`);
    return res.json();
}
