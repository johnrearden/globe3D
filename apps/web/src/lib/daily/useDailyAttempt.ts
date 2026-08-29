/**
 * The Daily Challenge attempt, as an explicit state machine.
 *
 * The vanilla orchestrator (`daily-quiz.js:_play`) is an async `while` loop that
 * awaits a promise resolved from a DOM click handler, once per question. That
 * works, but it keeps the quiz's position in a call stack rather than in a
 * value: nothing can render from it, and closing the panel mid-await needed a
 * stashed `_cancelWait` to stop a pending timer driving the quiz on invisibly.
 *
 * Here the position IS the state, so the UI renders from it and closing is one
 * transition. Everything the server owns stays the server's — the questions,
 * the grading, the running score. This holds only what is on screen.
 *
 * **Not a quiz-core session.** The Daily Challenge runs on backend-issued
 * questions with no local reducer, which is exactly what
 * `quizStore.startForeign(FOREIGN_MODES.DAILY)` is for: it publishes "a quiz is
 * on screen" — which labels, auto-rotate and the weak-spots list all read —
 * without pretending there is a session to mirror.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { FOREIGN_MODES, quizStore } from '@terragotcha/quiz-core';
import { errorText, getApi } from './api';
import { applyServerMap, isMapClick, releaseGlobe } from './server-map';
import type { GlobeBridge } from '../globe-types';
import type {
    AnswerResponse,
    DailyQuestion,
    DailyReveal,
    LeaderboardData,
} from './types';

/**
 * How long the reveal sits before advancing on its own.
 *
 * Longer when wrong: there is more to read. A manual Next cancels it, which is
 * why the timer is cleared on every transition rather than only on advance.
 */
const AUTO_ADVANCE_CORRECT_MS = 1500;
const AUTO_ADVANCE_WRONG_MS = 2500;

export type Phase =
    | { k: 'idle' }
    | { k: 'loading' }
    | { k: 'question'; question: DailyQuestion }
    | { k: 'revealed'; question: DailyQuestion; reveal: DailyReveal; done: boolean }
    | { k: 'leaderboard'; data: LeaderboardData | null; message: string }
    | { k: 'error'; text: string };

export interface DailyAttempt {
    phase: Phase;
    /** Questions answered so far, and how many there are. */
    index: number;
    total: number;
    score: number;
    /** Whether the player has finished today's challenge. */
    done: boolean;
    /** Open the challenge: resume an attempt, or start one. */
    start(): Promise<void>;
    /** Submit an answer — one value, or several for a multi-select question. */
    answer(given: string | string[]): Promise<void>;
    /** Past the reveal. Also fired by the auto-advance timer. */
    next(): Promise<void>;
    /** Reload the board — after registering, so the player's row appears. */
    refreshLeaderboard(message?: string): Promise<void>;
    /** Leave, handing the globe back. */
    close(): void;
}

export function useDailyAttempt({
    globe,
    onNeedsName,
}: {
    globe: GlobeBridge;
    /**
     * Called once, after a completed run, before the board renders. Resolves
     * when the player has registered or declined — either is fine, and the board
     * keeps offering the CTA if they declined.
     */
    onNeedsName: () => Promise<void>;
}): DailyAttempt {
    const [phase, setPhase] = useState<Phase>({ k: 'idle' });
    const [index, setIndex] = useState(0);
    const [total, setTotal] = useState(0);
    const [score, setScore] = useState(0);
    const [done, setDone] = useState(false);

    const attemptId = useRef<string | null>(null);
    // When the current question was put on screen. The server clamps it, but the
    // measurement is the client's: only the client knows when the player saw it.
    const shownAt = useRef(0);
    const advanceTimer = useRef<number | null>(null);
    // The next question rides along on the answer response, so advancing past a
    // reveal costs no request.
    const pendingNext = useRef<DailyQuestion | null>(null);
    // Guards every await: the player can close the panel mid-request, and a
    // response landing afterwards must not reopen it.
    const live = useRef(true);
    useEffect(() => () => { live.current = false; }, []);

    const clearAdvance = useCallback(() => {
        if (advanceTimer.current !== null) {
            window.clearTimeout(advanceTimer.current);
            advanceTimer.current = null;
        }
    }, []);

    /** Put a question on screen and start its clock. */
    const present = useCallback((question: DailyQuestion) => {
        setIndex(question.index);
        applyServerMap(globe, question);
        shownAt.current = performance.now();
        setPhase({ k: 'question', question });
    }, [globe]);

    const showLeaderboard = useCallback(async (message = '') => {
        setPhase({ k: 'leaderboard', data: null, message });
        try {
            const api = await getApi();
            const data = await api.getLeaderboard();
            if (!live.current) return;
            setPhase({ k: 'leaderboard', data, message });
        } catch (err) {
            if (!live.current) return;
            setPhase({ k: 'error', text: errorText(err) });
        }
    }, []);

    const start = useCallback(async () => {
        live.current = true;
        setPhase({ k: 'loading' });
        // Not a reducer session — see the file header. Published before the
        // first question so labels and auto-rotate settle before anything draws.
        quizStore.startForeign(FOREIGN_MODES.DAILY);
        globe.setAutoRotateAllowed(false);

        try {
            const api = await getApi();
            const today = await api.getToday();
            if (!live.current) return;

            if (today.attempt?.status === 'completed') {
                setDone(true);
                await showLeaderboard("You've already played today. Come back tomorrow!");
                return;
            }

            // Resumes from the current question if one is in flight.
            const startResp = await api.startDaily();
            if (!live.current) return;
            attemptId.current = startResp.attemptId;
            setTotal(startResp.questionCount);
            setScore(startResp.runningScore);

            if (!startResp.question) {
                setDone(true);
                await showLeaderboard();
                return;
            }
            present(startResp.question);
        } catch (err) {
            if (!live.current) return;
            setPhase({ k: 'error', text: errorText(err) });
        }
    }, [globe, present, showLeaderboard]);

    const answer = useCallback(async (given: string | string[]) => {
        const current = phase.k === 'question' ? phase.question : null;
        if (!current || !attemptId.current) return;

        const elapsedMs = Math.round(performance.now() - shownAt.current);
        // Optimistically leave the question up: replacing it with a spinner for
        // one round trip makes a correct answer feel like a page change.
        let res: AnswerResponse;
        try {
            const api = await getApi();
            res = await api.submitAnswer(attemptId.current, current.index, given, elapsedMs);
        } catch (err) {
            if (!live.current) return;
            setPhase({ k: 'error', text: errorText(err) });
            return;
        }
        if (!live.current) return;

        setScore(res.runningScore);
        setPhase({ k: 'revealed', question: current, reveal: res.reveal, done: res.done });

        // The globe's half of the reveal, for a question the grid cannot show.
        if (isMapClick(current) && res.reveal.correctOptions?.length) {
            const correct = res.reveal.correctOptions[0];
            globe.highlight(correct);
        }

        // Stash the next question on the response so `next()` needs no request.
        pendingNext.current = res.next;
    }, [phase, globe]);

    const next = useCallback(async () => {
        clearAdvance();
        if (phase.k !== 'revealed') return;

        if (phase.done) {
            setDone(true);
            // Ask for a name only now — after they have actually played, so the
            // challenge never opens with a form. Their completed attempt is
            // already tied to this device's anonymous row; registering names it.
            await onNeedsName();
            if (!live.current) return;
            await showLeaderboard();
            return;
        }

        const q = pendingNext.current;
        pendingNext.current = null;
        if (q) present(q);
        else await showLeaderboard();
    }, [phase, clearAdvance, onNeedsName, showLeaderboard, present]);

    // Auto-advance off the reveal. In an effect rather than inside `answer` so
    // that leaving the reveal by ANY route — the button, closing, an error —
    // cancels it through the same cleanup.
    useEffect(() => {
        if (phase.k !== 'revealed') return;
        const delay = phase.reveal.correct ? AUTO_ADVANCE_CORRECT_MS : AUTO_ADVANCE_WRONG_MS;
        advanceTimer.current = window.setTimeout(() => { void next(); }, delay);
        return clearAdvance;
    }, [phase, next, clearAdvance]);

    const close = useCallback(() => {
        live.current = false;
        clearAdvance();
        quizStore.end();
        releaseGlobe(globe);
        setPhase({ k: 'idle' });
    }, [globe, clearAdvance]);

    const refreshLeaderboard = useCallback(
        (message = '') => showLeaderboard(message),
        [showLeaderboard],
    );

    return { phase, index, total, score, done, start, answer, next, refreshLeaderboard, close };
}
