import { describe, it, expect } from 'vitest';
import { gradeLocally, revealOnly } from '@terragotcha/quiz-core';

// Mirrors backend/quiz/tests.py::GradingTests so audit mode's local grading
// provably matches services.grade().
describe('gradeLocally', () => {
    it('accepts a single exact match', () => {
        const r = gradeLocally(['France'], 'France');
        expect(r.correct).toBe(true);
        expect(r.rightPicks).toEqual(['France']);
        expect(r.wrongPicks).toEqual([]);
    });

    it('rejects a single wrong pick', () => {
        const r = gradeLocally(['France'], 'Spain');
        expect(r.correct).toBe(false);
        expect(r.wrongPicks).toEqual(['Spain']);
        expect(r.missed).toEqual(['France']);
    });

    it('requires an exact multi-select match', () => {
        const r = gradeLocally(['Chad', 'Mali', 'Niger'], ['Chad', 'Mali', 'Niger']);
        expect(r.correct).toBe(true);
    });

    it('marks a partial multi-select incorrect', () => {
        const r = gradeLocally(['Chad', 'Mali', 'Niger'], ['Chad', 'Mali']);
        expect(r.correct).toBe(false);
        expect(r.missed).toEqual(['Niger']);
        expect(r.rightPicks).toEqual(['Chad', 'Mali']);
    });

    it('marks an extra pick incorrect', () => {
        const r = gradeLocally(['Chad', 'Mali'], ['Chad', 'Mali', 'Libya']);
        expect(r.correct).toBe(false);
        expect(r.wrongPicks).toEqual(['Libya']);
    });

    it('treats null/empty answers as no picks', () => {
        const r = gradeLocally(['France'], null);
        expect(r.correct).toBe(false);
        expect(r.yourSelections).toEqual([]);
        expect(r.missed).toEqual(['France']);
    });
});

describe('revealOnly', () => {
    it('builds a correct reveal highlighting every answer', () => {
        const r = revealOnly(['Chad', 'Mali']);
        expect(r.correct).toBe(true);
        expect(r.correctOptions).toEqual(['Chad', 'Mali']);
        expect(r.rightPicks).toEqual(['Chad', 'Mali']);
        expect(r.wrongPicks).toEqual([]);
        expect(r.missed).toEqual([]);
    });
});
