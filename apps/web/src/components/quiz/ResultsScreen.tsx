/**
 * The end of a quiz: what you scored, whether it beat your best, what next.
 *
 * A rewrite of `js/features/quiz/quiz-results-modal.js`. The score ring and its
 * count-up survive because they are the screen's whole personality; the
 * hand-rolled rAF easeOutCubic behind them does not — a CSS transition on
 * `stroke-dashoffset` animates on the compositor and needs no JavaScript at all.
 *
 * `formatBestSuffix` and the best/new-best comparison come from
 * `@terragotcha/storage`, not from here: whether a score is a personal best is a
 * fact about the history, and the store already answers it per mode × scope.
 */
import { useEffect, useState } from 'react';
import { formatDuration } from '../../lib/quiz/useElapsed';
import { scopeLabel, type Scope } from '../../lib/quiz/modes';
import { setOverlay } from '../../lib/overlay';
import type { BestSummary } from '../../lib/quiz/useQuizSession';

/** Circumference of the r=62 ring, for the dash-offset arc. */
const RING = 2 * Math.PI * 62;

/** What to say about a score. Thresholds carried over from the vanilla modal. */
function headlineFor(ratio: number): string {
    if (ratio === 1) return 'Perfect.';
    if (ratio >= 0.8) return 'Strong round.';
    if (ratio >= 0.5) return 'Solid effort.';
    if (ratio > 0) return 'Room to grow.';
    return 'Everyone starts somewhere.';
}

export default function ResultsScreen({
    score,
    total,
    durationMs,
    quizName,
    scope,
    best,
    onPlayAgain,
    onChooseQuiz,
    onGlobe,
}: {
    score: number;
    total: number;
    durationMs: number;
    quizName: string;
    scope: Scope;
    best: BestSummary | null;
    onPlayAgain: () => void;
    onChooseQuiz: () => void;
    onGlobe: () => void;
}) {
    const ratio = total > 0 ? score / total : 0;

    // Start the arc empty and fill it on the next frame, so the CSS transition
    // has two values to move between. Without the second render it would paint
    // full immediately.
    const [drawn, setDrawn] = useState(false);
    useEffect(() => {
        const id = requestAnimationFrame(() => setDrawn(true));
        return () => cancelAnimationFrame(id);
    }, []);

    return (
        <div className="qr sheet-overlay" role="dialog" aria-modal="true" aria-labelledby="qr-headline">
            <div className="qr-sheet sheet">
                <div className="qr-ring">
                    <svg viewBox="0 0 140 140" aria-hidden="true">
                        <circle className="qr-ring-track" cx="70" cy="70" r="62" />
                        <circle
                            className="qr-ring-arc"
                            cx="70"
                            cy="70"
                            r="62"
                            style={{
                                strokeDasharray: RING,
                                strokeDashoffset: drawn ? RING * (1 - ratio) : RING,
                            }}
                        />
                    </svg>
                    <p className="qr-score">
                        <strong>{score}</strong>
                        <span>/{total}</span>
                    </p>
                </div>

                <h2 id="qr-headline" className="qr-headline">{headlineFor(ratio)}</h2>
                <p className="qr-meta">
                    {quizName} · {scopeLabel(scope)} · {formatDuration(durationMs)}
                </p>

                {best && (
                    <p className="qr-best">
                        {best.isNewBest
                            ? '🎉 New best!'
                            : `Best: ${best.bestScore}/${best.total}`}
                    </p>
                )}

                <div className="qr-actions">
                    <button type="button" className="qr-primary" onClick={onPlayAgain}>
                        Play again
                    </button>
                    <button type="button" className="qr-secondary" onClick={onChooseQuiz}>
                        Choose another quiz
                    </button>
                    <button type="button" className="qr-tertiary" onClick={onGlobe}>
                        Back to the globe
                    </button>
                </div>

                <button
                    type="button"
                    className="qr-progress-link"
                    onClick={() => { onGlobe(); setOverlay('stats'); }}
                >
                    See all your results
                </button>
            </div>
        </div>
    );
}
