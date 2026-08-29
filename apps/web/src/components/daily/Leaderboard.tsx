/**
 * Today's board.
 *
 * A rewrite of `js/features/daily-quiz/leaderboard.js`, which built its rows as
 * `innerHTML` strings with a hand-rolled `escapeHtml` around every nickname.
 * These are names other people typed, so that escaping was the only thing
 * standing between the board and injected markup. React escapes by
 * construction, and the helper goes with the strings.
 *
 * Two behaviours carried over deliberately:
 *   - the board is **padded to ten rows**, so it reads as a ranked top ten
 *     rather than a sparse list on a quiet day.
 *   - a player who finished outside the top ten gets their own row underneath,
 *     because otherwise the board they just earned a place on does not show it.
 */
import { countryData, countryToISO } from '../../../../../js/data/country-data.js';
import { formatQuizDate, formatTime } from '../../lib/daily/format';
import type { LeaderboardData } from '../../lib/daily/types';

const BOARD_ROWS = 10;

function Flag({ country }: { country?: string }) {
    const iso =
        (countryData as Record<string, { iso?: string }>)[country ?? '']?.iso ??
        (countryToISO as Record<string, string>)[country ?? ''];
    if (!iso) return <span className="dq-flag dq-flag-none" aria-hidden="true" />;
    return (
        <img
            className="dq-flag"
            src={`https://flagcdn.com/w40/${iso.toLowerCase()}.png`}
            alt=""
            loading="lazy"
            width={40}
            height={27}
        />
    );
}

export default function Leaderboard({
    data,
    message,
    canRegister,
    onRegister,
    onDismiss,
}: {
    data: LeaderboardData | null;
    message?: string;
    /** The player finished but has no name on the board yet. */
    canRegister: boolean;
    onRegister: () => void;
    onDismiss: () => void;
}) {
    if (!data) {
        return <p className="sheet-empty">Loading the board…</p>;
    }

    const entries = data.entries ?? [];
    const you = data.you ?? null;
    const padding = Array.from(
        { length: Math.max(0, BOARD_ROWS - entries.length) },
        (_, i) => entries.length + i + 1,
    );
    const youAreListed = !!you && entries.some((e) => e.rank === you.rank);

    return (
        <div className="dq-board">
            {message && <p className="dq-message">{message}</p>}

            <p className="sheet-section-label">Leaderboard — {formatQuizDate(data.quizDate)}</p>

            <table className="dq-table">
                <thead>
                    <tr>
                        <th scope="col">#</th>
                        <th scope="col">Player</th>
                        <th scope="col">Score</th>
                        <th scope="col">Time</th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map((e) => (
                        <tr key={e.rank} className={you && e.rank === you.rank ? 'dq-you' : ''}>
                            <td>{e.rank}</td>
                            <td>
                                <span className="dq-player">
                                    <Flag country={e.country} />
                                    {e.nickname}
                                </span>
                            </td>
                            <td>{e.score}</td>
                            <td>{formatTime(e.timeMs)}</td>
                        </tr>
                    ))}
                    {padding.map((rank) => (
                        <tr key={`pad-${rank}`} className="dq-pad" aria-hidden="true">
                            <td>{rank}</td>
                            <td>
                                <span className="dq-player">
                                    <span className="dq-flag dq-flag-none" />
                                    ----
                                </span>
                            </td>
                            <td>--</td>
                            <td>--</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {you && !youAreListed && (
                <p className="dq-yourrow">
                    <Flag country={you.country} />
                    <span>
                        You: #{you.rank} · {you.score} pts · {formatTime(you.timeMs)}
                    </span>
                </p>
            )}

            {canRegister && (
                <button type="button" className="ctl-button" onClick={onRegister}>
                    Add your name to the leaderboard
                </button>
            )}

            <button type="button" className="sheet-dismiss" onClick={onDismiss}>
                Back to the globe
            </button>
        </div>
    );
}
