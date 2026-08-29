/**
 * The backend client, for the islands that need it.
 *
 * A lazy module singleton rather than a top-level import, for two reasons:
 *
 *   - `js/data/api-client.js` reads `window.GLOBE3D_API_BASE` and the device
 *     token from localStorage at construction. Neither exists on the server, and
 *     the Daily Challenge island is server-rendered like every `client:idle`
 *     island — it just renders null there.
 *   - the Daily Challenge is the only thing that talks to a backend at all. A
 *     static import would put `@terragotcha/api-client` and the identity code
 *     into the shell's initial chunk for every reader who never opens it.
 *
 * The client is created once and reused, because it owns the device token —
 * `DeviceIdentity` mints one on first read and that token IS the account. Two
 * clients would still share localStorage, but the caching would diverge.
 */
import type { ApiClient } from './types';

let client: ApiClient | null = null;
let pending: Promise<ApiClient> | null = null;

/** The shared client, constructed on first use. */
export function getApi(): Promise<ApiClient> {
    if (client) return Promise.resolve(client);
    // Deduplicated: two islands asking at once must not build two clients.
    pending ??= import('../../../../../js/data/api-client.js').then((m) => {
        client = new m.ApiClient() as ApiClient;
        return client;
    });
    return pending;
}

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
