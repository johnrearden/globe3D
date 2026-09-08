/**
 * One hook for all four practice quizzes.
 *
 * The four vanilla modes are ~1,750 lines between them, and almost all of it is
 * the same sequence written four times: create a session, render a question,
 * grade an answer, show the reveal, advance, record history. quiz-core already
 * owns every one of those steps — `createSession` is a reducer with a
 * subscribe, which is exactly what `useSyncExternalStore` wants. So the modes
 * differ here only in which generator they pass and what they draw.
 *
 * `useSyncExternalStore` rather than `useState` + an effect: the session store
 * is external and can be dispatched into from outside React (a globe tap
 * answers the find-the-country quiz), and this is the API that gets tearing
 * right when that happens mid-render.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { track } from '../analytics';
import {
    QUESTIONS_PER_SESSION,
    createSession,
    quizStore,
    systemRng,
    toHistoryRecord,
} from '@terragotcha/quiz-core';
import { quizHistoryStore } from '../../../../../js/data/quiz-history-store.js';
import type { CountryRow } from '../globe';
import type { ModeId, Scope } from './modes';

/** One generated question, as every generator returns it. */
export interface Question {
    payload: {
        type: string;
        prompt: string;
        grid?: {
            options: Array<{ value: string; label: string; iso: string | null }>;
            cols: number;
            multiSelect: boolean;
            display: string;
        };
        answer: { method: string };
        map?: import('./globe-choreography').MapBlock | null;
        flag?: { iso: string } | null;
    };
    answer: { correct: string[] };
    meta: { mode: string; country: string; direction?: 'forward' | 'reverse' };
}

/** The grade of one answer — `gradeLocally`'s shape. */
export interface Reveal {
    correct: boolean;
    correctOptions: string[];
    yourSelections: string[];
    rightPicks: string[];
    wrongPicks: string[];
    missed: string[];
}

export interface SessionState {
    mode: ModeId;
    scope: Scope;
    status: 'idle' | 'question' | 'revealed' | 'complete';
    index: number;
    plannedTotal: number;
    score: number;
    answered: number;
    used: string[];
    current: Question | null;
    reveal: Reveal | null;
    log: Array<{ country: string; correct: boolean }>;
}

/** What the history store returns from `record()`. */
export interface BestSummary {
    isNewBest: boolean;
    bestScore: number;
    gamesPlayed: number;
    total: number;
}

export interface QuizSession {
    state: SessionState;
    /** Grade an answer and move to the reveal. Ignored unless a question is up. */
    answer(given: string | string[]): void;
    /** Past the reveal to the next question, or to completion. */
    advance(): void;
    /** Abandon. Never recorded — an abandoned quiz is not a result. */
    cancel(): void;
    /** Set once the session completes and history has been written. */
    best: BestSummary | null;
}

export interface UseQuizSessionOptions {
    mode: ModeId;
    scope: Scope;
    countries: CountryRow[];
    /**
     * The per-question generator, in quiz-core's `nextQuestion` shape: called
     * with `{countries, scope, used, rng, index}`, returns a question or null
     * when the pool is dry. `fromPlan` adapts a pre-planned session (find the
     * country) to the same contract.
     */
    nextQuestion: (ctx: {
        countries: CountryRow[];
        scope: Scope;
        used: Set<string>;
        rng: () => number;
        index: number;
    }) => Question | null;
    /** Fewer than ten for a small region; the plan's own length wins. */
    total?: number;
    /**
     * Called once the session completes, after history is recorded. `best` is
     * null when there was nothing to record — a pool that ran dry before the
     * player answered anything is not a result.
     */
    onComplete?: (state: SessionState, durationMs: number, best: BestSummary | null) => void;
    /** Called when the player abandons. */
    onCancel?: () => void;
}

export function useQuizSession({
    mode,
    scope,
    countries,
    nextQuestion,
    total = QUESTIONS_PER_SESSION,
    onComplete,
    onCancel,
}: UseQuizSessionOptions): QuizSession {
    // Built once for the life of the component. A quiz is a session; changing
    // mode or scope means unmounting this and mounting another, which is what
    // the key on the rendering component enforces.
    const session = useMemo(
        () => createSession({ mode, scope, countries, rng: systemRng, total, nextQuestion }),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: see above.
        [],
    );

    const startedAt = useRef<number>(0);
    const recorded = useRef(false);
    // State, not a ref: the results screen renders off this, so it has to cause
    // a render when it lands.
    const [best, setBest] = useState<BestSummary | null>(null);

    const state = useSyncExternalStore(
        session.subscribe,
        session.getState,
        session.getState,
    ) as SessionState;

    useEffect(() => {
        // Publish before the first question exists, so anything watching for
        // "a quiz is on screen" — the panel, analytics, the back-button guard —
        // sees the start rather than the first render of a question.
        quizStore.startSession(session);
        startedAt.current = performance.now();
        session.begin();
        return () => {
            quizStore.end();
        };
    }, [session]);

    // Record on completion, exactly once. In an effect rather than inside
    // `advance` because completion can also arrive from a dry pool, which the
    // reducer decides — there is no single call site that means "finished".
    useEffect(() => {
        if (state.status !== 'complete' || recorded.current) return;
        recorded.current = true;
        const durationMs = Math.round(performance.now() - startedAt.current);
        // A session with nothing answered is an abandonment the reducer happened
        // to complete (an empty pool), not a result worth filing — but the UI
        // still has to be told it is over, or it waits forever on a question
        // that will never arrive.
        const summary =
            state.answered === 0
                ? null
                : (quizHistoryStore.record(toHistoryRecord(state, durationMs)) as BestSummary);
        setBest(summary);
        track('quiz_complete', { mode: state.mode, answered: state.answered, duration_ms: durationMs });
        onComplete?.(state, durationMs, summary);
    }, [state, onComplete]);

    const answer = useCallback(
        (given: string | string[]) => {
            if (session.getState().status !== 'question') return;
            session.answer(given);
        },
        [session],
    );

    const advance = useCallback(() => {
        if (session.getState().status !== 'revealed') return;
        session.advance();
    }, [session]);

    const cancel = useCallback(() => {
        // Deliberately not recorded: `record()` is reached only through the
        // completion effect above, and cancelling never reaches 'complete' with
        // answers to file. Matches the vanilla rule that an abandoned quiz
        // leaves no trace.
        recorded.current = true;
        session.end();
        onCancel?.();
    }, [session, onCancel]);

    return { state, answer, advance, cancel, best };
}
