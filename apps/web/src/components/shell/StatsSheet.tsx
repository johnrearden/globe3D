/**
 * Progress — bests per quiz, the countries you keep missing, recent games.
 *
 * A rewrite of `js/features/quiz/quiz-stats.js`, and the cleanest port in the
 * codebase: it is a pure read over `quizHistoryStore`, which already computes
 * every figure. Nothing is aggregated here.
 *
 * Two things the vanilla version got wrong that are fixed rather than carried:
 *
 *   - it rendered every best as `N/10`, a hard-coded ten. A region quiz can plan
 *     fewer than ten questions, so a 6/6 showed as `6/10` — a perfect round
 *     reported as a mediocre one. The store records the real total per session.
 *   - it built its rows as HTML strings with a hand-rolled `escapeHtml`. React
 *     escapes by construction, so a country name can never be markup.
 *
 * `window.confirm` for the clear action does not survive either; it blocks the
 * page and cannot be styled or made accessible. Confirmation is a second click
 * on the same button.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    quizHistoryStore,
    MODE_LABELS,
} from '../../../../../js/data/quiz-history-store.js';
import { formatDuration } from '../../lib/quiz/useElapsed';
import { scopeLabel, type Scope } from '../../lib/quiz/modes';
import { closeOverlay } from '../../lib/overlay';

/** A country needs this many attempts before "you keep missing it" is fair. */
const MIN_ASKED = 2;
const MOST_MISSED_LIMIT = 8;
const RECENT_LIMIT = 10;

interface ModeStat {
    mode: string;
    scope: string;
    games: number;
    bestScore: number;
    bestTotal: number;
    bestPct: number;
    avgPct: number;
    bestTimeMs: number | null;
}

interface CountryStat {
    country: string;
    asked: number;
    correct: number;
    pct: number;
}

interface Session {
    ts: number;
    mode: string;
    scope: string;
    score: number;
    total: number;
    durationMs: number;
}

export default function StatsSheet() {
    // A counter rather than the data: re-reading the store is cheap, and this
    // way "cleared" and "just finished a quiz" both invalidate the same way.
    const [revision, setRevision] = useState(0);
    const [confirmingClear, setConfirmingClear] = useState(false);

    const data = useMemo(() => ({
        modes: quizHistoryStore.getModeStats() as ModeStat[],
        missed: (quizHistoryStore.getCountryStats({ minAsked: MIN_ASKED }) as CountryStat[])
            .filter((c) => c.pct < 100)
            .slice(0, MOST_MISSED_LIMIT),
        recent: (quizHistoryStore.getSessions() as Session[]).slice(0, RECENT_LIMIT),
        games: quizHistoryStore.getTotalGames() as number,
        // revision is the dependency; the store is read imperatively.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [revision]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeOverlay();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const clear = useCallback(() => {
        if (!confirmingClear) {
            setConfirmingClear(true);
            return;
        }
        quizHistoryStore.clear();
        setConfirmingClear(false);
        setRevision((r) => r + 1);
    }, [confirmingClear]);

    return (
        <div
            className="sheet-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stats-heading"
        >
            <button
                type="button"
                className="sheet-scrim"
                onClick={closeOverlay}
                aria-label="Close progress"
            />

            <div className="sheet">
                <div className="sheet-grabber" aria-hidden="true" />
                <h2 id="stats-heading" className="sheet-title">Your progress</h2>

                {data.games === 0 ? (
                    <p className="sheet-empty">
                        No quizzes yet. Play one and your bests will show up here.
                    </p>
                ) : (
                    <>
                        <p className="sheet-section-label">By quiz</p>
                        <ul className="stat-list">
                            {data.modes.map((s) => (
                                <li key={`${s.mode}:${s.scope}`} className="stat-row">
                                    <span className="stat-main">
                                        <strong>{MODE_LABELS[s.mode] ?? s.mode}</strong>
                                        <span className="stat-sub">
                                            {scopeLabel(s.scope as Scope)} · {s.games}{' '}
                                            {s.games === 1 ? 'game' : 'games'}
                                            {s.bestTimeMs != null &&
                                                ` · best ${formatDuration(s.bestTimeMs)}`}
                                        </span>
                                    </span>
                                    <span className="stat-metric">
                                        {/* bestTotal, not a hard-coded 10: a
                                            region quiz plans fewer questions, and
                                            the vanilla screen reported a perfect
                                            6/6 as 6/10. The two now come from one
                                            session rather than being two separate
                                            maxima. */}
                                        <strong>{s.bestScore}/{s.bestTotal}</strong>
                                        <span className="stat-sub">best · avg {s.avgPct}%</span>
                                    </span>
                                </li>
                            ))}
                        </ul>

                        {data.missed.length > 0 && (
                            <>
                                <p className="sheet-section-label">Countries you keep missing</p>
                                <ul className="stat-list">
                                    {data.missed.map((c) => (
                                        <li key={c.country} className="stat-row">
                                            <span className="stat-main">{c.country}</span>
                                            <span className="stat-metric stat-sub">
                                                {c.correct}/{c.asked} right · {c.pct}%
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}

                        <p className="sheet-section-label">Recent games</p>
                        <ul className="stat-list">
                            {data.recent.map((s) => (
                                <li key={s.ts} className="stat-row">
                                    <span className="stat-main">
                                        <strong>{MODE_LABELS[s.mode] ?? s.mode}</strong>
                                        <span className="stat-sub">
                                            {scopeLabel(s.scope as Scope)}
                                        </span>
                                    </span>
                                    <span className="stat-metric stat-sub">
                                        {s.score}/{s.total}
                                        {s.durationMs > 0 && ` · ${formatDuration(s.durationMs)}`}
                                    </span>
                                </li>
                            ))}
                        </ul>

                        <button
                            type="button"
                            className={`ctl-button ctl-danger ${confirmingClear ? 'armed' : ''}`}
                            onClick={clear}
                            onBlur={() => setConfirmingClear(false)}
                        >
                            {confirmingClear ? 'Tap again to erase everything' : 'Clear history'}
                        </button>
                    </>
                )}

                <button type="button" className="sheet-dismiss" onClick={closeOverlay}>
                    Done
                </button>
            </div>
        </div>
    );
}
