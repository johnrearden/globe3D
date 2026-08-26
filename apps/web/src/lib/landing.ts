/**
 * The build's view of the apex content.
 *
 * The editorial copy is `landing/landing-facts.json`; the figures are derived
 * from `assets/country-meta.json` — the same geometry the globe renders — by
 * `landingModel` in `build-landing-facts.mjs`. Importing that rather than
 * re-deriving here is the whole point: the model VERIFIES every superlative
 * against the data and reports any claim it contradicts.
 *
 * A page of superlatives is a page of falsifiable claims. "USA, highest GDP per
 * capita" reads perfectly plausibly and is wrong. So a failed check is a failed
 * build, exactly as it is for the vanilla app's generated panel — a second
 * renderer must not become a way to route around the checking.
 *
 * All three imports are build-time only. This module is reached from `.astro`
 * frontmatter and from a component with no `client:` directive, so none of it —
 * least of all the 75 KB country-meta.json — is in any client bundle.
 * `tests/landing-page-static.test.js` asserts that.
 */
import { landingModel } from '../../../../build-landing-facts.mjs';
import facts from '../../../../landing/landing-facts.json';
import meta from '../../../../assets/country-meta.json';
import content from '../../../../content/countries.json';

export interface NotableEntry {
    id: string;
    eyebrow: string;
    name: string;
    /** Derived from country-meta.json, never authored — prose and figure cannot drift. */
    stat: string;
    blurb: string;
    /** Null when the country has no published page, so the panel never links to a 404. */
    href: string | null;
}

export interface GuideEntry {
    name: string;
    slug: string;
    summary: string;
    href: string;
}

export interface LandingModel {
    intro: { h1: string; paragraphs: string[] };
    notable: { heading: string; lede: string; entries: NotableEntry[] };
    guides: { heading: string; lede: string; entries: GuideEntry[] };
    failures: string[];
    links: number;
}

const model = landingModel({ facts, meta, content }) as LandingModel;

if (model.failures.length) {
    throw new Error(
        'landing content contradicts assets/country-meta.json:\n  '
        + model.failures.join('\n  ')
        + '\n\nFix landing/landing-facts.json (or the claim is simply no longer true).',
    );
}

export const landing: LandingModel = model;
