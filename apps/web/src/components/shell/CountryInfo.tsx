/**
 * The country info panel: a waving flag and the handful of facts worth knowing,
 * for whichever country is selected.
 *
 * The facts come off the country table, not from `country-data.js` directly:
 * that map holds the 210 sovereigns, and dependencies carry theirs on the mesh
 * record instead. `createCountryTable` is where the two are merged, which is
 * also the only place that has both.
 *
 * A rewrite of `js/features/flag-renderer.js`. That file mixed three jobs — a
 * Three.js flag renderer, a DOM populator reading static markup out of
 * `index.html`, and a suppression flag the settings panel poked directly. Here
 * the flag is `FlagStage` (already written for the quiz, now parameterised), the
 * facts are JSX, and "is the panel enabled" is just a setting this component
 * reads.
 *
 * ## Two things carried across deliberately
 *
 * **`pointer-events`.** The panel sits over the globe, so its container must not
 * eat drags — it is `none`, and only the close button and the link opt back in.
 * A port that forgets this ships a link that renders and cannot be clicked;
 * `styles.css:5621` had a comment about it for exactly that reason.
 *
 * **The link is gated on `country-pages.json`.** Four countries have articles,
 * so linking optimistically would 404 for the other 233. See `lib/published.ts`.
 *
 * ## What is not carried across
 *
 * The vanilla panel never disposed its WebGL context — it created one on first
 * show and held it for the session. `FlagStage` tears its own down on unmount,
 * which matters here because this panel opens and closes far more often than a
 * quiz does. It is still a second live context alongside the globe's while open,
 * which is the honest cost of a waving flag rather than a flat image.
 */
import { useEffect, useState } from 'react';
import { publishedPages } from '../../lib/published';
import type { CountryRow } from '../../lib/globe';
import Icon from '../quiz/Icon';
import FlagStage from '../quiz/FlagStage';

/** The flag is 120×80 CSS px here; this is its drawing buffer, at 2×. */
const FLAG_BUFFER_W = 240;
const FLAG_BUFFER_H = 160;

const NA = '—';

export default function CountryInfo({
    row,
    onClose,
}: {
    row: CountryRow;
    onClose: () => void;
}) {
    const [slug, setSlug] = useState<string | null>(null);

    // Does this country have an article? Asked per selection; the fetch behind
    // it happens once per session and every later call is the resolved promise.
    useEffect(() => {
        let live = true;
        publishedPages().then((pages) => {
            if (live) setSlug(pages.get(row.name) ?? null);
        });
        return () => { live = false; };
    }, [row.name]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <aside className="ci-panel" aria-label={`About ${row.name}`}>
            <button type="button" className="ci-close" onClick={onClose} aria-label="Close">
                <Icon name="x" size={16} />
            </button>

            {row.iso
                ? (
                    <div className="ci-flag">
                        <FlagStage
                            iso={row.iso}
                            label={`Flag of ${row.name}`}
                            width={FLAG_BUFFER_W}
                            height={FLAG_BUFFER_H}
                            className="ci-flag-stage"
                        />
                    </div>
                )
                // No ISO means no flag art exists for this record — the panel
                // still opens, because the facts are the point.
                : <div className="ci-flag ci-flag-none" aria-hidden="true" />}

            <div className="ci-body">
                <p className="ci-name">{row.name}</p>

                {row.parent && (
                    <p className="ci-parent">Territory of {row.parent}</p>
                )}

                <dl className="ci-facts">
                    <dt>Capital</dt>
                    <dd>{row.capital?.name || NA}</dd>
                    <dt>Population</dt>
                    <dd>{row.population != null ? `${row.population}M` : NA}</dd>
                    <dt>Area</dt>
                    <dd>{row.areaLabel || NA}</dd>
                    <dt>Language</dt>
                    <dd>{row.language || NA}</dd>
                </dl>

                {slug && (
                    <a className="ci-link" href={`/country/${slug}`}>
                        Read more
                        <Icon name="arrowRight" size={14} />
                    </a>
                )}
            </div>
        </aside>
    );
}
