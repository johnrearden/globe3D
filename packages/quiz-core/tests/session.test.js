import { describe, it, expect } from 'vitest';
import {
    MODES,
    createSession,
    fromPlan,
    generateNameCountry,
    initialState,
    isComplete,
    mulberry32,
    reduce,
    toHistoryRecord
} from '../src/index.js';
import { BASE, FULL } from './fixtures.js';

/** A minimal generated question, matching the generators' return shape. */
const q = (country, correct = country) => ({
    payload: { type: 'test', prompt: country, grid: { options: [], cols: 2, multiSelect: false, display: 'name' }, answer: { method: 'grid-single' } },
    answer: { correct: [correct] },
    meta: { mode: MODES.NAME_FLAG, country }
});

const started = (over = {}) =>
    reduce(initialState(), { type: 'start', mode: MODES.NAME_FLAG, scope: 'globe', ...over });

describe('reduce', () => {
    it('starts idle with a clean slate', () => {
        const s = started();
        expect(s).toMatchObject({
            mode: MODES.NAME_FLAG, scope: 'globe', status: 'idle',
            index: 0, score: 0, answered: 0, used: [], current: null, log: []
        });
    });

    it('installing a question records its country as used', () => {
        const s = reduce(started(), { type: 'question', question: q('France') });
        expect(s.status).toBe('question');
        expect(s.used).toEqual(['France']);
        expect(s.current.meta.country).toBe('France');
    });

    it('scores a correct answer and logs it', () => {
        let s = reduce(started(), { type: 'question', question: q('France') });
        s = reduce(s, { type: 'answer', given: 'France' });
        expect(s.status).toBe('revealed');
        expect(s.score).toBe(1);
        expect(s.answered).toBe(1);
        expect(s.reveal.correct).toBe(true);
        expect(s.log).toEqual([{ country: 'France', correct: true }]);
    });

    it('logs a wrong answer without scoring it', () => {
        let s = reduce(started(), { type: 'question', question: q('France') });
        s = reduce(s, { type: 'answer', given: 'Spain' });
        expect(s.score).toBe(0);
        expect(s.answered).toBe(1);
        expect(s.reveal.correct).toBe(false);
        expect(s.reveal.wrongPicks).toEqual(['Spain']);
        // The log records the country that was ASKED, not the wrong pick —
        // that is what drives the weak-spots widget.
        expect(s.log).toEqual([{ country: 'France', correct: false }]);
    });

    it('ignores a second answer for the same question', () => {
        let s = reduce(started(), { type: 'question', question: q('France') });
        s = reduce(s, { type: 'answer', given: 'France' });
        const after = reduce(s, { type: 'answer', given: 'Spain' });
        expect(after).toBe(s);
        expect(after.score).toBe(1);
        expect(after.answered).toBe(1);
    });

    it('ignores an answer when no question is live', () => {
        const s = started();
        expect(reduce(s, { type: 'answer', given: 'France' })).toBe(s);
    });

    it('advance only moves on from a reveal', () => {
        let s = reduce(started(), { type: 'question', question: q('France') });
        expect(reduce(s, { type: 'advance' })).toBe(s);
        s = reduce(s, { type: 'answer', given: 'France' });
        s = reduce(s, { type: 'advance' });
        expect(s.status).toBe('idle');
        expect(s.index).toBe(1);
        expect(s.current).toBeNull();
        expect(s.reveal).toBeNull();
    });

    it('completes once the planned total is reached', () => {
        let s = started({ total: 2 });
        for (const name of ['France', 'Spain']) {
            s = reduce(s, { type: 'question', question: q(name) });
            s = reduce(s, { type: 'answer', given: name });
            s = reduce(s, { type: 'advance' });
        }
        expect(isComplete(s)).toBe(true);
        expect(s.score).toBe(2);
        expect(s.answered).toBe(2);
    });

    it('completes early when the pool runs dry', () => {
        let s = reduce(started(), { type: 'question', question: q('France') });
        s = reduce(s, { type: 'answer', given: 'France' });
        s = reduce(s, { type: 'advance' });
        s = reduce(s, { type: 'question', question: null });
        expect(isComplete(s)).toBe(true);
        expect(s.answered).toBe(1);
    });
});

describe('toHistoryRecord', () => {
    it('reports total as questions answered, not the planned total', () => {
        let s = started({ total: 10 });
        s = reduce(s, { type: 'question', question: q('France') });
        s = reduce(s, { type: 'answer', given: 'France' });
        s = reduce(s, { type: 'advance' });
        s = reduce(s, { type: 'question', question: null });

        const rec = toHistoryRecord(s, 4200, 1234);
        expect(rec).toEqual({
            ts: 1234,
            mode: MODES.NAME_FLAG,
            scope: 'globe',
            score: 1,
            total: 1,
            durationMs: 4200,
            questions: [{ country: 'France', correct: true }]
        });
    });
});

describe('createSession', () => {
    it('plays a full ten-question session against real generators', () => {
        const session = createSession({
            mode: MODES.NAME_FLAG,
            countries: BASE,
            rng: mulberry32(5),
            nextQuestion: generateNameCountry
        });

        session.begin();
        let guard = 0;
        while (!isComplete(session.getState()) && guard++ < 50) {
            const s = session.getState();
            // Always answer correctly.
            session.answer(s.current.answer.correct[0]);
            session.advance();
        }

        const s = session.getState();
        expect(s.answered).toBe(8); // BASE has 8 countries, so it runs dry at 8
        expect(s.score).toBe(8);
        expect(new Set(s.used).size).toBe(s.used.length);
    });

    it('never repeats a country across a session', () => {
        const session = createSession({
            mode: MODES.NAME_FLAG,
            countries: FULL,
            scope: 'Testland',
            rng: mulberry32(9),
            nextQuestion: generateNameCountry
        });
        session.begin();
        let guard = 0;
        while (!isComplete(session.getState()) && guard++ < 50) {
            session.answer('nope');
            session.advance();
        }
        const s = session.getState();
        expect(s.score).toBe(0);
        expect(new Set(s.log.map(l => l.country)).size).toBe(s.log.length);
    });

    it('fromPlan drives a pre-generated session', () => {
        const plan = ['France', 'Spain', 'Italy'].map(n => q(n));
        const session = createSession({
            mode: MODES.CLICK_COUNTRY,
            countries: [],
            rng: mulberry32(1),
            total: plan.length,
            nextQuestion: fromPlan(plan)
        });

        session.begin();
        expect(session.getState().current.meta.country).toBe('France');
        session.answer('France');
        session.advance();
        expect(session.getState().current.meta.country).toBe('Spain');
        session.answer('wrong');
        session.advance();
        expect(session.getState().current.meta.country).toBe('Italy');
        session.answer('Italy');
        session.advance();

        const s = session.getState();
        expect(isComplete(s)).toBe(true);
        expect(s.score).toBe(2);
        expect(s.answered).toBe(3);
    });

    it('end() stops a session mid-flight', () => {
        const session = createSession({
            mode: MODES.NAME_FLAG,
            countries: BASE,
            rng: mulberry32(3),
            nextQuestion: generateNameCountry
        });
        session.begin();
        session.answer(session.getState().current.answer.correct[0]);
        const s = session.end();
        expect(isComplete(s)).toBe(true);
        expect(s.answered).toBe(1);
    });
});
