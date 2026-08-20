/**
 * quizStore — the single observable answer to "is a quiz on screen".
 *
 * Two behaviours carry real weight and get most of the attention here:
 * `onActiveChange` firing only on the flip (a raw subscription would run an
 * analytics event per answered question), and `end()` detaching the session
 * subscription (a leak would let a finished quiz keep writing to the store
 * while the next one is running).
 */
import { describe, it, expect, vi } from 'vitest';
import { createQuizStore, FOREIGN_MODES } from '../src/store.js';
import { createSession } from '../src/session.js';

/** A session over `n` questions whose correct answer is always `A<index>`. */
function fakeSession(n = 3, mode = 'name-flag', scope = 'globe') {
    return createSession({
        mode,
        scope,
        countries: [],
        rng: () => 0.5,
        total: n,
        nextQuestion: ({ index }) => (index < n
            ? { payload: {}, answer: { correct: [`A${index}`] }, meta: { country: `C${index}` } }
            : null),
    });
}

describe('quizStore', () => {
    it('starts idle', () => {
        const store = createQuizStore();
        expect(store.getState()).toEqual({ active: false, mode: null, scope: null, session: null });
        expect(store.isActive()).toBe(false);
    });

    it('takes mode and scope from the attached session', () => {
        const store = createQuizStore();
        store.startSession(fakeSession(3, 'capital', 'Europe'));
        expect(store.isActive()).toBe(true);
        expect(store.getState().mode).toBe('capital');
        expect(store.getState().scope).toBe('Europe');
    });

    it('mirrors every session dispatch', () => {
        const store = createQuizStore();
        const session = fakeSession(2);
        store.startSession(session);

        session.begin();
        expect(store.getState().session.status).toBe('question');

        session.answer(['A0']);
        expect(store.getState().session.score).toBe(1);
        expect(store.getState().session.status).toBe('revealed');

        session.advance();
        session.answer(['wrong']);
        session.advance();
        expect(store.getState().session.status).toBe('complete');
        expect(store.getState().session.score).toBe(1);
    });

    it('fires onActiveChange only on the flip, not on each dispatch', () => {
        const store = createQuizStore();
        const listener = vi.fn();
        store.onActiveChange(listener);

        const session = fakeSession(3);
        store.startSession(session);
        session.begin();
        session.answer(['A0']);
        session.advance();
        session.answer(['A1']);
        session.advance();
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenLastCalledWith(true, 'name-flag');

        store.end();
        expect(listener).toHaveBeenCalledTimes(2);
        expect(listener).toHaveBeenLastCalledWith(false, null);
    });

    it('stops mirroring a session after end()', () => {
        // The leak this guards: a cancelled quiz whose session is still driven by
        // a pending auto-advance timer would otherwise keep writing to the store.
        const store = createQuizStore();
        const session = fakeSession(3);
        store.startSession(session);
        session.begin();
        store.end();

        session.answer(['A0']);
        expect(store.getState().session).toBe(null);
        expect(store.isActive()).toBe(false);
    });

    it('detaches the previous session when a new one starts', () => {
        const store = createQuizStore();
        const first = fakeSession(3, 'name-flag');
        const second = fakeSession(3, 'capital');
        store.startSession(first);
        store.startSession(second);

        first.begin();                                  // the abandoned session
        expect(store.getState().mode).toBe('capital');
        expect(store.getState().session.status).toBe('idle');

        second.begin();
        expect(store.getState().session.status).toBe('question');
    });

    it('is idempotent on end() — cancel paths call it more than once', () => {
        const store = createQuizStore();
        store.startSession(fakeSession());
        store.end();
        expect(() => store.end()).not.toThrow();
        expect(store.isActive()).toBe(false);
    });

    it.each(Object.values(FOREIGN_MODES))(
        'marks %s active without a reducer session',
        (mode) => {
            const store = createQuizStore();
            store.startForeign(mode);
            expect(store.isActive()).toBe(true);
            expect(store.getState().mode).toBe(mode);
            expect(store.getState().session).toBe(null);
        }
    );

    it('lets a practice quiz follow a foreign one cleanly', () => {
        const store = createQuizStore();
        store.startForeign(FOREIGN_MODES.DAILY);
        store.end();
        store.startSession(fakeSession(3, 'capital'));
        expect(store.getState().mode).toBe('capital');
        expect(store.getState().session).not.toBe(null);
    });

    it('gives separate instances separate state', () => {
        // The app uses a singleton on purpose; tests must not inherit its state.
        const a = createQuizStore();
        const b = createQuizStore();
        a.startForeign(FOREIGN_MODES.DAILY);
        expect(b.isActive()).toBe(false);
    });
});

describe('session observability', () => {
    it('notifies subscribers on every dispatch', () => {
        const session = fakeSession(2);
        const seen = [];
        session.subscribe(s => seen.push(s.status));
        session.begin();
        session.answer(['A0']);
        session.advance();
        expect(seen).toEqual(['question', 'revealed', 'idle', 'question']);
    });

    it('unsubscribe stops notifications', () => {
        const session = fakeSession(2);
        const listener = vi.fn();
        const off = session.subscribe(listener);
        session.begin();
        off();
        session.answer(['A0']);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('replaces state rather than merging, so the reducer owns the shape', () => {
        const session = fakeSession(2);
        session.begin();
        session.answer(['A0']);
        session.advance();
        // `reveal` is cleared by the 'question' action; a merging setState would
        // have left the previous reveal in place.
        expect(session.getState().reveal).toBe(null);
    });
});
