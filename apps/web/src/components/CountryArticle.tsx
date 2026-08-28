/**
 * The country page's editorial content.
 *
 * **React, and rendered with NO `client:` directive — that combination is the
 * entire point of this file.** Astro renders it to HTML at build time and ships
 * zero JavaScript for it, so the text is in the initial HTML response and is
 * structurally incapable of being wiped by hydration. That is precisely the
 * failure that got the site rejected by AdSense: a client-rendered shell whose
 * content only appears after JS runs.
 *
 * It is React rather than `.astro` so the *same* component can also render
 * client-side after an app-owned pushState navigation, without a second
 * implementation of the markup drifting from this one.
 *
 * Consequences to preserve:
 *   - No hooks, no event handlers, no browser globals. Anything interactive
 *     belongs in a sibling island, not here.
 *   - Prose arrives as pre-split paragraphs from content/countries.json. It is
 *     plain text, never HTML, so nothing here uses dangerouslySetInnerHTML — a
 *     database field cannot inject markup into a static page.
 */

import { HOME_PATH } from '../lib/routes';

export interface Section {
    id: string;
    heading: string;
    paragraphs: string[];
}

export interface Related {
    slug: string;
    name: string;
    relation: 'borders' | 'region';
}

export interface Country {
    slug: string;
    name: string;
    cca2: string;
    cca3: string;
    flagIso: string;
    region: string;
    subregion: string;
    capital: string;
    areaKm2: number | null;
    summary: string;
    sections: Section[];
    related: Related[];
}

const km2 = (n: number | null) =>
    n == null ? null : `${Math.round(n).toLocaleString('en-GB')} km²`;

export default function CountryArticle({ country }: { country: Country }) {
    const facts: Array<[string, string]> = [
        ['Capital', country.capital],
        ['Region', country.subregion || country.region],
        ['Area', km2(country.areaKm2) ?? ''],
    ].filter((row): row is [string, string] => Boolean(row[1]));

    return (
        <article className="country-article">
            <header>
                <h1>{country.name}</h1>
                {/* Repeated as the meta description in the page head. Kept in the
                    body too so it is real page content, not head-only metadata. */}
                <p className="country-summary">{country.summary}</p>
            </header>

            {facts.length > 0 && (
                <dl className="country-facts">
                    {facts.map(([label, value]) => (
                        <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                        </div>
                    ))}
                </dl>
            )}

            {country.sections
                .filter((s) => s.paragraphs.length > 0)
                .map((section) => (
                    <section key={section.id} id={section.id}>
                        <h2>{section.heading}</h2>
                        {section.paragraphs.map((text, i) => (
                            <p key={i}>{text}</p>
                        ))}
                    </section>
                ))}

            {/* The route into the app. A country page with no way through to the
                globe is a dead end for a reader, and the globe is the reason they
                are on the site.

                It aims at the app's HOME route, not at this country. The previous
                version linked to `/?country=<slug>`, which pointed the globe at
                the country the reader was already looking at — behind this very
                panel — so it promised an experience it could not deliver. Home is
                a genuinely different screen: the landing content and the whole
                globe.

                HOME_PATH rather than a literal, so the link follows the apex when
                it moves from /app to /. Because the router owns that path,
                `parseRoute` claims the click and the navigation is client-side —
                the globe is never rebuilt. The href stays real, so it still works
                for a crawler and with JavaScript disabled. */}
            <p className="explore-cta">
                <a href={HOME_PATH}>Explore the globe</a>
            </p>

            {/* Real anchors, server-rendered. A WebGL canvas is not crawlable, so
                without these the ~200 pages are sitemap orphans with no internal
                link graph. Every href here is guaranteed by the exporter to point
                at a page that exists. */}
            {country.related.length > 0 && (
                <nav className="country-related" aria-label={`Countries related to ${country.name}`}>
                    <h2>Explore nearby</h2>
                    <ul>
                        {country.related.map((r) => (
                            <li key={r.slug}>
                                <a href={`/country/${r.slug}`}>{r.name}</a>
                                {r.relation === 'borders' && (
                                    <span className="relation"> · shares a border</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </nav>
            )}
        </article>
    );
}
