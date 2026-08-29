/**
 * Leaderboard formatting.
 *
 * In `lib` rather than in the component because both are total functions over
 * server data with edge cases worth pinning — a malformed date and a sub-minute
 * time are both things the backend can legitimately send.
 */

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * "2026-03-25" → "25 March 26".
 *
 * Anything that is not an ISO date passes through unchanged rather than
 * becoming "NaN undefined NaN": the board's heading is not worth breaking over
 * a field the server may one day send differently.
 */
export function formatQuizDate(iso?: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
    if (!m) return iso || 'today';
    return `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1]} ${m[1].slice(2)}`;
}

/**
 * Whole seconds — the server's millisecond precision is not meaningful to a
 * reader, and "41s" is easier to compare down a column than "41.283s".
 */
export function formatTime(ms: number): string {
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    return m ? `${m}m ${s % 60}s` : `${s}s`;
}
