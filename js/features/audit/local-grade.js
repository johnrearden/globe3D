/**
 * Client-side grading for audit mode — a faithful port of the backend's
 * services.grade() so an auditor can answer questions interactively without
 * any server round-trip (and therefore without creating Attempt rows).
 * The reveal shape matches what /api/daily/today/answer returns.
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
