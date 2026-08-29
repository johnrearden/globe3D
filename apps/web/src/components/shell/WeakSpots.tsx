/**
 * The countries you keep getting wrong, as a heads-up list beside the globe.
 *
 * A rewrite of `js/features/weak-spots-widget.js`, with one thing genuinely
 * fixed. The vanilla widget's row click reproduced a globe tap by hand —
 * `globeManager.clearSelection()`, `setSelectedCountry()`,
 * `labelManager.setHighlight()`, `cameraController.rotateToCountry()`, in that
 * order, with a comment admitting it was copying `PointerControls.onPointerUp`.
 * A copy of a sequence is a copy that drifts. It is `globe.highlight()` plus
 * `globe.focusCountry()` here: two bridge calls, and the bridge owns the order.
 *
 * It hides during a quiz, because a list of the answers you are worst at is a
 * hint sheet while a question is on screen.
 */
import { useEffect, useMemo, useState } from 'react';
import { quizStore } from '@terragotcha/quiz-core';
import { quizHistoryStore } from '../../../../../js/data/quiz-history-store.js';
import { setOverlay } from '../../lib/overlay';
import type { GlobeBridge } from '../../lib/globe-types';

/** Enough rows to be useful, few enough not to become the page. */
const MAX_ENTRIES = 5;

interface Weak {
    country: string;
    asked: number;
    correct: number;
    pct: number;
}

export default function WeakSpots({
    globe,
    isoOf,
}: {
    globe: GlobeBridge;
    isoOf: (name: string) => string | null | undefined;
}) {
    const [quizActive, setQuizActive] = useState(() => quizStore.isActive());
    // Recomputed when a quiz ends, which is the only moment the tally changes.
    const [revision, setRevision] = useState(0);

    useEffect(
        () =>
            quizStore.onActiveChange((active: boolean) => {
                setQuizActive(active);
                // onActiveChange fires only on the start/end flip — a raw
                // subscription would fire ~30 times per quiz and re-read the
                // history on every answered question.
                if (!active) setRevision((r) => r + 1);
            }),
        [],
    );

    const rows: Weak[] = useMemo(
        () =>
            (quizHistoryStore.getCountryStats({ minAsked: 1 }) as Weak[])
                .filter((c) => c.pct < 100)
                .slice(0, MAX_ENTRIES),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the store is read imperatively.
        [revision],
    );

    if (quizActive || rows.length === 0) return null;

    return (
        <aside className="weakspots" aria-label="Countries you keep missing">
            <p className="weakspots-title">
                <button type="button" onClick={() => setOverlay('stats')}>
                    Weak spots
                </button>
            </p>
            <ul className="weakspots-list">
                {rows.map((row) => {
                    const iso = isoOf(row.country);
                    return (
                        <li key={row.country}>
                            <button
                                type="button"
                                className="weakspots-row"
                                onClick={() => {
                                    globe.highlight(row.country);
                                    globe.focusCountry(row.country);
                                }}
                            >
                                <span className="weakspots-name">{row.country}</span>
                                {iso && (
                                    <img
                                        className="weakspots-flag"
                                        src={`https://flagcdn.com/w80/${iso.toLowerCase()}.png`}
                                        alt=""
                                        loading="lazy"
                                        width={80}
                                        height={53}
                                    />
                                )}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </aside>
    );
}
