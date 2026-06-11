/**
 * Render the daily leaderboard into a container element.
 * Highlights the current player's row (matched by the `you` entry's rank).
 */

function fmtTime(ms) {
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return m ? `${m}m ${rem}s` : `${rem}s`;
}

export function renderLeaderboard(container, data) {
    container.innerHTML = '';

    const heading = document.createElement('div');
    heading.className = 'dq-lb-heading';
    heading.textContent = `Leaderboard — ${data.quizDate || 'today'}`;
    container.appendChild(heading);

    const table = document.createElement('table');
    table.className = 'dq-lb-table';
    table.innerHTML = `
        <thead><tr><th>#</th><th>Player</th><th>Score</th><th>Time</th></tr></thead>
        <tbody></tbody>
    `;
    const body = table.querySelector('tbody');
    const youRank = data.you ? data.you.rank : null;

    (data.entries || []).forEach((e) => {
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

    if (!data.entries || !data.entries.length) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="4" class="dq-lb-empty">No finishers yet — be the first!</td>';
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
