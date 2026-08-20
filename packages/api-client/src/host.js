/**
 * Where the API lives — the one genuinely platform-dependent thing about the
 * client, split out so the client itself takes a plain string.
 *
 * On the web this has to be sniffed, because the same static bundle is served
 * from four different places (localhost, a LAN IP, *.pages.dev, the apex) and
 * only one of them is same-origin with the API. React Native has no such
 * problem: it ships with a build-time constant and never calls any of this.
 */

/**
 * True for hosts that mean "local two-server dev setup", where the API runs on
 * Django's :8000 and the static frontend is served on some other port. Covers
 * loopback, 0.0.0.0, mDNS `*.local`, and the private-LAN IPv4 ranges so a
 * backend bound to 0.0.0.0 and reached over the LAN still finds the API.
 *
 * Unchanged in the move from js/data/api-client.js — it was already pure and
 * already exported, and js/data/site-config.js depends on it directly.
 */
export function isLocalDevHost(hostname) {
    return (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        hostname === '::1' ||
        hostname.endsWith('.local') ||
        /^10\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    );
}

/**
 * Resolve the API base from explicit values rather than reading globals, so it
 * is testable and callable from anywhere. Precedence is unchanged:
 *
 *   1. `override` (window.GLOBE3D_API_BASE) — how the deployed Cloudflare
 *      frontend points at the self-hosted API. Always wins.
 *   2. A local-dev host — Django's default dev port on the same host, so a
 *      two-server setup works over localhost AND over the LAN from a phone.
 *   3. Same-origin `/api` — production behind one host.
 *
 * @param {{override?: string, hostname?: string, protocol?: string}} [ctx]
 * @returns {string}
 */
export function resolveApiBase(ctx = {}) {
    const { override, hostname, protocol } = ctx;
    if (override) return override;
    if (!hostname) return '/api';
    if (isLocalDevHost(hostname)) return `${protocol || 'http:'}//${hostname}:8000/api`;
    return '/api';
}
