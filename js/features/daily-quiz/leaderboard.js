/**
 * Render the daily leaderboard into a container element.
 * Highlights the current player's row (matched by the `you` entry's rank).
 */

// Always show a full top-N board, padding with placeholder rows when there are
// fewer real finishers.
const LEADERBOARD_ROWS = 10;

function fmtTime(ms) {
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return m ? `${m}m ${rem}s` : `${rem}s`;
}

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

/** Format an ISO date (YYYY-MM-DD) as e.g. "25 March 26"; pass through anything else. */
function fmtQuizDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return iso || 'today';
    return `${parseInt(m[3], 10)} ${MONTH_NAMES[parseInt(m[2], 10) - 1]} ${m[1].slice(2)}`;
}

export function renderLeaderboard(container, data) {
    container.innerHTML = '';

    const heading = document.createElement('div');
    heading.className = 'dq-lb-heading';
    heading.textContent = `Leaderboard — ${fmtQuizDate(data.quizDate)}`;
    container.appendChild(heading);

    const table = document.createElement('table');
    table.className = 'dq-lb-table';
    table.innerHTML = `
        <thead><tr><th>#</th><th>Player</th><th>Score</th><th>Time</th></tr></thead>
        <tbody></tbody>
    `;
    const body = table.querySelector('tbody');
    const youRank = data.you ? data.you.rank : null;
    const entries = data.entries || [];

    entries.forEach((e) => {
        const tr = document.createElement('tr');
        if (youRank && e.rank === youRank) tr.className = 'dq-lb-you';
        tr.innerHTML = `
            <td>${e.rank}</td>
            <td>${escapeHtml(e.nickname)}</td>
            <td>${e.score}</td>
            <td>${fmtTime(e.timeMs)}</td>
        `;
        body.appendChild(tr);
    });

    // Pad out to a full board (e.g. 7th–10th when there are only 6 finishers) so
    // it always reads as a ranked top-10 rather than a sparse list.
    for (let rank = entries.length + 1; rank <= LEADERBOARD_ROWS; rank++) {
        const tr = document.createElement('tr');
        tr.className = 'dq-lb-pad';
        tr.innerHTML = `<td>${rank}</td><td>----</td><td>--</td><td>--m --s</td>`;
        body.appendChild(tr);
    }

    container.appendChild(table);

    // If the player finished outside the shown range, append their row.
    if (data.you && (!data.entries || !data.entries.some((e) => e.rank === data.you.rank))) {
        const you = document.createElement('div');
        you.className = 'dq-lb-yourrow';
        you.textContent = `You: #${data.you.rank} · ${data.you.score} pts · ${fmtTime(data.you.timeMs)}`;
        container.appendChild(you);
    }
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}
