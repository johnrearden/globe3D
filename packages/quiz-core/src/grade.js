/**
 * Client-side grading — a faithful port of the backend's services.grade()
 * (backend/quiz/services.py), kept in lockstep by tests/local-grade.test.js
 * which mirrors backend/quiz/tests.py::GradingTests.
 *
 * Used in two places: audit mode, so an auditor can answer questions without a
 * server round-trip (and therefore without creating Attempt rows), and the
 * practice-quiz session reducer, which grades locally. The reveal shape matches
 * what /api/daily/today/answer returns, so the daily challenge and practice
 * quizzes present results through the same code.
 *
 * Set semantics (not positional) so multi-select question types grade
 * correctly; single-choice is just the one-element case.
 */

function normalizeGiven(given) {
    if (given == null) return [];
    const list = Array.isArray(given) ? given : [given];
    return list.filter((g) => g != null && String(g) !== '').map(String);
}

export function gradeLocally(correctList, given) {
    const correct = [...(correctList || [])];
    const correctSet = new Set(correct);
    const givenList = normalizeGiven(given);
    const givenSet = new Set(givenList);

    const isCorrect =
        givenSet.size === correctSet.size && [...givenSet].every((v) => correctSet.has(v));
    return {
        correct: isCorrect,
        correctOptions: correct,
        yourSelections: givenList,
        rightPicks: [...givenSet].filter((v) => correctSet.has(v)).sort(),
        wrongPicks: [...givenSet].filter((v) => !correctSet.has(v)).sort(),
        missed: [...correctSet].filter((v) => !givenSet.has(v)).sort(),
    };
}

/** Reveal object for "show the answer without answering". */
export function revealOnly(correctList) {
    const correct = [...(correctList || [])];
    return {
        correct: true,
        correctOptions: correct,
        yourSelections: [],
        rightPicks: [...correct].sort(),
        wrongPicks: [],
        missed: [],
    };
}
