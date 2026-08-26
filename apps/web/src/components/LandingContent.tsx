/**
 * The apex's editorial content.
 *
 * Same contract as `CountryArticle`, for the same reason: **React with NO
 * `client:` directive**, so Astro renders it to HTML at build time and ships
 * zero JavaScript for it. The apex is the page the AdSense rejection was
 * actually about — it served 137 indexable words, 62 of them inside a
 * 1×1px-clipped block, and linked to nothing. Every word here is in the initial
 * HTML response and visible.
 *
 * React rather than `.astro` so the same component also renders client-side
 * after a pushState navigation back from a country page, with no second copy of
 * the markup to drift.
 *
 * Consequences to preserve:
 *   - No hooks, no event handlers, no browser globals.
 *   - Every figure comes from the model already verified against
 *     assets/country-meta.json. Nothing here computes or formats a number, so a
 *     claim cannot be true in the prose and wrong on screen.
 *   - A country with no published page renders as text, not as a dead link.
 */
import type { LandingModel } from '../lib/landing';

export default function LandingContent({ model }: { model: LandingModel }) {
    return (
        <div className="landing">
            <header className="landing-intro">
                <p className="landing-wordmark">
                    <span className="wordmark-terra">Terra</span>
                    <span className="wordmark-gotcha">gotcha</span>
                </p>
                <h1>{model.intro.h1}</h1>
                {model.intro.paragraphs.map((p) => <p key={p}>{p}</p>)}
            </header>

            <section className="landing-section" aria-labelledby="landing-notable">
                <h2 id="landing-notable">{model.notable.heading}</h2>
                <p className="landing-lede">{model.notable.lede}</p>
                <ul className="landing-cards">
                    {model.notable.entries.map((e) => (
                        <li className="landing-card" key={e.id}>
                            <p className="landing-eyebrow">{e.eyebrow}</p>
                            <h3>
                                {e.href
                                    ? <a href={e.href}>{e.name}</a>
                                    : e.name}
                            </h3>
                            <p className="landing-stat">{e.stat}</p>
                            <p>{e.blurb}</p>
                        </li>
                    ))}
                </ul>
            </section>

            {model.guides.entries.length > 0 && (
                <section className="landing-section" aria-labelledby="landing-guides">
                    <h2 id="landing-guides">{model.guides.heading}</h2>
                    <p className="landing-lede">{model.guides.lede}</p>
                    <ul className="landing-guides">
                        {model.guides.entries.map((g) => (
                            <li key={g.slug}>
                                <h3><a href={g.href}>{g.name}</a></h3>
                                <p>{g.summary}</p>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}
