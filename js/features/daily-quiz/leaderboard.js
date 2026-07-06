/**
 * Render the daily leaderboard into a container element.
 * Highlights the current player's row (matched by the `you` entry's rank).
 */

import { countryData, countryToISO } from '../../data/country-data.js';

// Always show a full top-N board, padding with placeholder rows when there are
// fewer real finishers.
const LEADERBOARD_ROWS = 10;

/**
 * A small country flag for a player's stored country NAME (e.g. "France"), or an
 * empty fixed-width placeholder when the country is missing/unknown so nicknames
 * stay aligned across rows. `iso` is a lowercase 2-letter code from our own data
 * map (safe to interpolate); `country` is only ever used as a lookup key.
 */
function flagHtml(country) {
    const iso = country && (countryData[country]?.iso || countryToISO[country]);
    if (!iso) return '<span class="dq-lb-flag dq-lb-flag--none"></span>';
    return `<img class="dq-lb-flag" src="https://flagcdn.com/w40/${iso}.png" alt="" loading="lazy">`;
}

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

export function renderLeaderboard(container, data, onDismiss) {
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
            <td><span class="dq-lb-player">${flagHtml(e.country)}${escapeHtml(e.nickname)}</span></td>
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
        tr.innerHTML = `<td>${rank}</td><td><span class="dq-lb-player"><span class="dq-lb-flag dq-lb-flag--none"></span>----</span></td><td>--</td><td>--m --s</td>`;
        body.appendChild(tr);
    }

    container.appendChild(table);

    // If the player finished outside the shown range, append their row.
    if (data.you && (!data.entries || !data.entries.some((e) => e.rank === data.you.rank))) {
        const you = document.createElement('div');
        you.className = 'dq-lb-yourrow';
        // innerHTML so the flag can be prepended; the trailing text is all
        // app-controlled numbers/labels (no user input), the flag iso is safe.
        you.innerHTML = `${flagHtml(data.you.country)}<span>You: #${data.you.rank} · ${data.you.score} pts · ${fmtTime(data.you.timeMs)}</span>`;
        container.appendChild(you);
    }

    // Dismiss button at the foot of the board (the × top-right still closes too).
    if (onDismiss) {
        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'dq-lb-dismiss';
        dismiss.textContent = 'Back to globe';
        dismiss.addEventListener('click', onDismiss);
        container.appendChild(dismiss);
    }
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}
