/**
 * The observable home of "is a quiz on screen, and which one".
 *
 * Two things drove this out of js/data/state.js:
 *
 * 1. **React Context cannot cross Astro islands.** Each island is its own React
 *    root, so a provider in one cannot be consumed by another. A module-level
 *    store is the only thing both can reach — which makes this mandatory for
 *    Phase B rather than a matter of taste. Vanilla Zustand because `useStore`
 *    binds it to React and React Native with no bridge code of ours.
 *
 * 2. **There were three overlapping sources of truth.** A2 collapsed the
 *    per-mode class fields into one session reducer; this collapses the second,
 *    `state.js`'s `quiz.*` slice, whose `score` / `questionsAnswered` /
 *    `currentQuestion` / `usedCountries` had become write-only — set by every
 *    mode, read by nobody. Only `active` and `mode` were ever read, by six
 *    call sites, and they now come from here.
 *
 * The `quiz-active` body class is deliberately NOT retired: it is a CSS hook
 * (and the change signal BackButtonGuard's MutationObserver watches for the
 * daily/results/picker overlays, which have no session). It is presentation,
 * not state — the duplication that mattered was the slice.
 */

import { createStore } from 'zustand/vanilla';

/**
 * Modes that are "a quiz is on screen" without being a reducer session: the
 * Daily Challenge runs on backend-issued questions, and audit mode replays a
 * past daily. Both still need to suppress hover flags, labels and auto-rotate,
 * which is all the six readers ever asked `quiz.active` for.
 * @type {Readonly<Record<string, string>>}
 */
export const FOREIGN_MODES = Object.freeze({ DAILY: 'daily', AUDIT: 'audit' });

/**
 * @typedef {object} QuizStoreState
 * @property {boolean} active   any quiz is on screen
 * @property {string|null} mode  mode id — a practice mode, or a FOREIGN_MODES value
 * @property {string|null} scope 'globe' or a region name; null for foreign modes
 * @property {import('./session.js').SessionState|null} session
 *           Live reducer state, mirrored on every dispatch. Null for foreign modes.
 */

/** @returns {QuizStoreState} */
const idle = () => ({ active: false, mode: null, scope: null, session: null });

/**
 * Create an isolated quiz store. Exported mainly so tests get a fresh one; the
 * app uses the `quizStore` singleton below.
 */
export function createQuizStore() {
    const store = createStore(() => idle());
    // Kept out of store state: an unsubscribe function is not data, and putting
    // a live closure in the state would leak into anything that serialises it.
    let detach = null;

    const stop = () => {
        if (detach) { detach(); detach = null; }
    };

    return {
        getState: store.getState,
        subscribe: store.subscribe,

        /** True while any quiz — practice, daily or audit — is on screen. */
        isActive: () => store.getState().active,

        /**
         * Fire only when the quiz starts or ends, not on every dispatch within
         * one. This matters: `startSession` mirrors the reducer, so the store
         * changes ~30 times a quiz, and a raw `subscribe` would run an analytics
         * event or a widget re-render on each of them. Zustand v5's vanilla
         * build has no selector subscription built in, so compare here.
         *
         * @param {(active: boolean, mode: string|null) => void} listener
         * @returns {() => void} unsubscribe
         */
        onActiveChange(listener) {
            return store.subscribe((next, prev) => {
                if (next.active !== prev.active) listener(next.active, next.mode);
            });
        },

        /**
         * Attach a reducer session created by `createSession`. The store mirrors
         * every dispatch, so subscribers see score and progress advance without
         * each mode having to publish them by hand (which is exactly what the
         * old `state.set('quiz.score', …)` calls were, minus any reader).
         *
         * @param {{getState: Function, subscribe: Function}} session
         */
        startSession(session) {
            stop();
            const snap = session.getState();
            store.setState({
                active: true,
                mode: snap.mode,
                scope: snap.scope,
                session: snap,
            });
            detach = session.subscribe(next => store.setState({ session: next }));
        },

        /**
         * Mark a non-reducer quiz active (Daily Challenge, audit replay).
         * @param {string} mode one of FOREIGN_MODES
         */
        startForeign(mode) {
            stop();
            store.setState({ active: true, mode, scope: null, session: null });
        },

        /** Back to the bare globe. Idempotent — cancel paths may call it twice. */
        end() {
            stop();
            store.setState(idle());
        },
    };
}

/**
 * App-wide singleton. A module singleton rather than an injected instance
 * because that is the whole point (see the header): it has to be reachable from
 * separate React roots.
 */
export const quizStore = createQuizStore();
