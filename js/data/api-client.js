/**
 * Web binding for the quiz backend client.
 *
 * The client lives in @terragotcha/api-client so React Native can share it;
 * this file supplies the three things that are genuinely browser-specific — the
 * API base sniffed off `window`, localStorage for the device token, and
 * sessionStorage for the audit token — and re-exports the rest so every
 * existing call site is unchanged.
 *
 * Base URL precedence (see resolveApiBase in the package):
 *   1. `window.GLOBE3D_API_BASE` if set — explicit override (how the deployed
 *      Cloudflare frontend points at the self-hosted API). Always wins.
 *   2. On a local-dev host (loopback, `0.0.0.0`, an mDNS `*.local` name, or a
 *      private-LAN IP) — Django's default dev port, `:8000/api`, so a
 *      two-server local setup just works: run the API with `manage.py
 *      runserver 0.0.0.0:8000` and serve the static frontend on any other port
 *      (e.g. `python3 -m http.server 8001`). This covers reaching the pair over
 *      the LAN (e.g. from a phone) as well as via localhost.
 *   3. Otherwise — same-origin `/api` (production behind one host).
 */

import {
    ApiClient as CoreApiClient,
    resolveApiBase,
} from '@terragotcha/api-client';
import { webStorage, webSessionStorage } from './storage.js';

export { ApiError, AUDIT_TOKEN_KEY, isLocalDevHost } from '@terragotcha/api-client';

/** The browser's view of where the API is. Read once, at module load. */
export const API_BASE = resolveApiBase(
    typeof window === 'undefined'
        ? {}
        : {
            override: window.GLOBE3D_API_BASE,
            hostname: window.location.hostname,
            protocol: window.location.protocol,
        }
);

/**
 * Browser-wired ApiClient. Keeps the original `new ApiClient()` /
 * `new ApiClient(baseUrl)` call shape so index.html and the audit/daily
 * features need no change.
 */
export class ApiClient extends CoreApiClient {
    constructor(baseUrl = API_BASE) {
        super({
            baseUrl,
            storage: webStorage,
            auditStorage: webSessionStorage,
        });
    }
}
