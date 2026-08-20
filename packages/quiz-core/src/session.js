/**
 * Quiz session state machine.
 *
 * All four practice modes run the same session:
 *
 *   idle → question → revealed → (question | complete)
 *
 * They differ only in how a question is produced and how the answer is
 * captured (option grid vs. globe tap). Before this, each mode hand-rolled the
 * loop across its own `start` / `handleAnswer` / `end` methods, with the
 * scoring, history logging and DOM mutation interleaved — `handleAnswer` was
 * near-identical in three files and drifted between them.
 *
 * `reduce` is pure and exported for testing. `createSession` is the thin
 * stateful wrapper the app uses; it owns the RNG and question source, which are
 * the only impure parts, and (since A5) a Zustand store so every dispatch is
 * observable. The reducer itself is untouched by that — the store holds the
 * state, `reduce` still computes it.
 */

import { createStore } from 'zustand/vanilla';
import { gradeLocally } from './grade.js';
import { QUESTIONS_PER_SESSION } from './generators.js';

/** @typedef {'idle'|'question'|'revealed'|'complete'} SessionStatus */

/**
 * @typedef {object} SessionState
 * @property {string|null} mode
 * @property {string} scope
 * @property {SessionStatus} status
 * @property {number} index      0-based index of the current question
 * @property {number} plannedTotal  questions this session intends to ask
 * @property {number} score
 * @property {number} answered
 * @property {string[]} used     answer countries already asked
 * @property {object|null} current  the live {payload, answer, meta}
 * @property {object|null} reveal   grade result for the answered question
 * @property {Array<{country: string, correct: boolean}>} log
 */

/** @returns {SessionState} */
export function initialState() {
    return {
        mode: null,
        scope: 'globe',
        status: 'idle',
        index: 0,
        plannedTotal: QUESTIONS_PER_SESSION,
        score: 0,
        answered: 0,
        used: [],
        current: null,
        reveal: null,
        log: []
    };
}

/**
 * Pure session reducer.
 *
 * @param {SessionState} state
 * @param {object} action
 * @returns {SessionState}
 */
export function reduce(state, action) {
    switch (action.type) {
        case 'start':
            return {
                ...initialState(),
                mode: action.mode,
                scope: action.scope || 'globe',
                plannedTotal: action.total ?? QUESTIONS_PER_SESSION,
                status: 'idle'
            };

        // A generated question arrives. A null question means the pool is
        // exhausted — a small region can run dry before plannedTotal, which is
        // legitimate and ends the session rather than erroring.
        case 'question': {
            if (!action.question) {
                return { ...state, status: 'complete', current: null, reveal: null };
            }
            const country = action.question.meta.country;
            return {
                ...state,
                status: 'question',
                current: action.question,
                reveal: null,
                used: state.used.includes(country) ? state.used : [...state.used, country]
            };
        }

        case 'answer': {
            if (state.status !== 'question' || !state.current) return state;
            const reveal = gradeLocally(state.current.answer.correct, action.given);
            const country = state.current.meta.country;
            return {
                ...state,
                status: 'revealed',
                reveal,
                score: state.score + (reveal.correct ? 1 : 0),
                answered: state.answered + 1,
                log: [...state.log, { country, correct: reveal.correct }]
            };
        }

        // Advance past a revealed question. The caller then dispatches the next
        // 'question'; this only moves the cursor and decides whether the
        // session is already over.
        case 'advance': {
            if (state.status !== 'revealed') return state;
            const nextIndex = state.index + 1;
            if (nextIndex >= state.plannedTotal) {
                return { ...state, status: 'complete', index: nextIndex, current: null };
            }
            return { ...state, status: 'idle', index: nextIndex, current: null, reveal: null };
        }

        case 'end':
            return { ...state, status: 'complete', current: null };

        default:
            return state;
    }
}

/** True once no further questions should be asked. */
export const isComplete = state => state.status === 'complete';

/**
 * The record quiz-history-store.record() expects. `total` is the number of
 * questions actually answered, not plannedTotal — a session cut short by a
 * small region scores out of what it asked.
 *
 * @param {SessionState} state
 * @param {number} durationMs
 * @param {number} [ts]  epoch ms; injected so callers stay testable
 */
export function toHistoryRecord(state, durationMs, ts = Date.now()) {
    return {
        ts,
        mode: state.mode,
        scope: state.scope,
        score: state.score,
        total: state.answered,
        durationMs,
        questions: state.log
    };
}

/**
 * Stateful session wrapper.
 *
 * @param {object} config
 * @param {string} config.mode
 * @param {string} [config.scope]
 * @param {object[]} config.countries        plain country table
 * @param {() => number} config.rng
 * @param {number} [config.total]
 * @param {(ctx: object) => object|null} config.nextQuestion
 *        Called with {countries, scope, used, rng, index} and returns a
 *        generated {payload, answer, meta}, or null when the pool is dry.
 */
export function createSession({ mode, scope = 'globe', countries, rng, total, nextQuestion }) {
    // Zustand rather than a plain closure variable so the session is observable:
    // quizStore mirrors it, and React/React Native bind to it with `useStore`.
    // `setState` is given a whole new object each time (the reducer already
    // returns one), so Zustand's default Object.is comparison correctly sees
    // every dispatch as a change.
    const store = createStore(() => reduce(initialState(), { type: 'start', mode, scope, total }));

    const generate = () => {
        const state = store.getState();
        return nextQuestion({
            countries,
            scope: state.scope,
            used: new Set(state.used),
            rng,
            index: state.index
        });
    };

    const dispatch = (action) => {
        const next = reduce(store.getState(), action);
        store.setState(next, true);   // replace, not merge — the reducer owns the shape
        return next;
    };

    return {
        getState: store.getState,

        /**
         * Observe every dispatch. Used by quizStore; also what a React hook
         * subscribes to.
         * @param {(state: SessionState, prev: SessionState) => void} listener
         * @returns {() => void} unsubscribe
         */
        subscribe: store.subscribe,

        /** Produce and install the first question. */
        begin() {
            return dispatch({ type: 'question', question: generate() });
        },

        /** Grade `given` against the live question and move to the reveal. */
        answer(given) {
            return dispatch({ type: 'answer', given });
        },

        /**
         * Move past the reveal and install the next question, or complete the
         * session. One call per "Next", so modes no longer sequence this by hand.
         */
        advance() {
            const afterAdvance = dispatch({ type: 'advance' });
            if (afterAdvance.status === 'complete') return afterAdvance;
            return dispatch({ type: 'question', question: generate() });
        },

        end() {
            return dispatch({ type: 'end' });
        }
    };
}

/**
 * Adapt a pre-generated list of questions to the `nextQuestion` contract.
 *
 * The click-country mode plans its whole session up front (there are no
 * per-question options to build), so it supplies a plan rather than a
 * generator. This keeps both shapes on one code path.
 *
 * @param {object[]} questions
 */
export function fromPlan(questions) {
    return ({ index }) => questions[index] || null;
}
