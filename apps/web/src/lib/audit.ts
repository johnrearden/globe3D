/**
 * The superuser audit token.
 *
 * `/audit/launch` on the backend mints a signed, expiring token and sends the
 * browser here with `?audit=<token>`. It lives in sessionStorage — tab-scoped,
 * gone when the tab closes — under the key `@terragotcha/api-client` reads it
 * back from on every gated request. The vanilla app did this inline in
 * `index.html`; here it is a function, called once by the shell island.
 *
 * Two things it gates in this app: the lighting sliders in settings (optics,
 * not palette — a bad value makes the globe unreadable) and publishing from
 * the Theme Lab.
 */

/** Must equal `AUDIT_TOKEN_KEY` in the api-client package. Pinned by test. */
export const AUDIT_TOKEN_KEY = 'tg-audit-token';

/**
 * Pull `audit=` out of a query string.
 *
 * Pure, so it can be tested: the token and the query string with it removed
 * (no leading `?`; '' when nothing else was there).
 */
export function extractAuditToken(search: string): { token: string | null; rest: string } {
    const params = new URLSearchParams(search);
    const token = params.get('audit');
    params.delete('audit');
    return { token, rest: params.toString() };
}

/**
 * Stash an arriving token for the session and strip it from the address bar
 * immediately, so it is never bookmarked, shared or left in history.
 *
 * The `is:inline` script in `AppLayout.astro` does this before paint, because
 * `AppRouter` normalises the URL at boot and an island runs after it. This is
 * the same logic as a function — the fallback when that script could not run,
 * and the thing the test exercises.
 */
export function captureAuditToken(): void {
    if (typeof window === 'undefined') return;
    const { token, rest } = extractAuditToken(window.location.search);
    if (!token) return;
    try {
        sessionStorage.setItem(AUDIT_TOKEN_KEY, token);
    } catch {
        // Private mode, or storage blocked. The token is simply not kept.
    }
    window.history.replaceState(
        window.history.state, '',
        window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
}

/** True when a superuser arrived via `/audit/launch` in this tab. */
export function hasAuditToken(): boolean {
    try {
        return !!sessionStorage.getItem(AUDIT_TOKEN_KEY);
    } catch {
        return false;
    }
}

/**
 * May this session open the Theme Lab?
 *
 * In dev, always — the Lab is also how `theme.json` is authored, and that needs
 * no backend. In production, only with the audit token, which is the same gate
 * the backend puts on the write endpoints; a Lab with no way to save would be
 * a puzzle rather than a tool.
 */
export function canAuthorThemes(): boolean {
    return import.meta.env.DEV || hasAuditToken();
}
