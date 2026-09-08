/**
 * Daily Challenge error helpers. The client itself is `lib/api.ts` — it moved
 * there when the theme picker became the second thing to talk to the backend.
 */
export { getApi } from '../api';

/**
 * Is this error the backend saying "you already played today"?
 *
 * A 409 is a normal outcome rather than a failure — the player opened the
 * challenge twice — so it gets its own message instead of the generic one.
 */
export function isAlreadyPlayed(err: unknown): boolean {
    return !!err && typeof err === 'object' && (err as { status?: number }).status === 409;
}

/** What to show the player when a call fails. */
export function errorText(err: unknown): string {
    if (isAlreadyPlayed(err)) return "You've already completed today's challenge.";
    const message = (err as { message?: string })?.message;
    // ApiError carries the server's own message, which is written for players.
    // Anything else is a network or programming fault they cannot act on.
    if (message && (err as { status?: number }).status !== undefined) return message;
    return 'Something went wrong. Please try again.';
}
