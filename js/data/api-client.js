/**
 * API Client for the Globe3D quiz backend (Daily Challenge + leaderboard).
 *
 * The backend is self-hosted and called cross-origin from the static frontend.
 * Base URL is resolved three ways (see resolveApiBase):
 *   1. `window.GLOBE3D_API_BASE` if set — explicit override (how the deployed
 *      Cloudflare frontend points at the self-hosted API). Always wins.
 *   2. On a local-dev host (loopback, `0.0.0.0`, an mDNS `*.local` name, or a
 *      private-LAN IP) — defaults to Django's default dev port, `:8000/api`, so
 *      a two-server local setup just works: run the API with `manage.py
 *      runserver 0.0.0.0:8000` (→ :8000) and serve the static frontend on any
 *      other port (e.g. `python3 -m http.server 8001`). This covers reaching the
 *      pair over the LAN (e.g. from a phone) as well as via localhost. In DEBUG
 *      the backend allows these origins, so the frontend's port doesn't matter.
 *   3. Otherwise — same-origin `/api` (production behind one host).
 *
 * Identity is an opaque device token generated and stored client-side (mirrors
 * the settings-store localStorage pattern) and sent as `X-Device-Token`.
 */

/**
 * True for hosts that mean "local two-server dev setup", where the API runs on
 * Django's :8000 and the static frontend is served on some other port. Covers
 * loopback, 0.0.0.0, mDNS `*.local`, and the private-LAN IPv4 ranges so a
 * backend bound to 0.0.0.0 and reached over the LAN still finds the API.
 */
function isLocalDevHost(hostname) {
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

function resolveApiBase() {
    if (typeof window === 'undefined') return '/api';
    if (window.GLOBE3D_API_BASE) return window.GLOBE3D_API_BASE;
    const { hostname, protocol } = window.location;
    if (isLocalDevHost(hostname)) {
        // Django's default dev port, same host as the frontend (so LAN access
        // works). The static frontend may be served on any port.
        return `${protocol}//${hostname}:8000/api`;
    }
    return '/api';
}

const API_BASE = resolveApiBase();

const TOKEN_KEY = 'globe3d-device-token';

/** Persisted device token + cached profile. */
class DeviceIdentity {
    constructor() {
        this._data = this._read();
    }

    _read() {
        try {
            const raw = localStorage.getItem(TOKEN_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (_) {
            return {};
        }
    }

    _write() {
        try {
            localStorage.setItem(TOKEN_KEY, JSON.stringify(this._data));
        } catch (_) { /* private mode / quota — token just won't persist */ }
    }

    get token() {
        if (!this._data.token) {
            this._data.token = this._generate();
            this._write();
        }
        return this._data.token;
    }

    _generate() {
        if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
        return 'dt-' + Math.abs(hashString(String(performance.now()) + navigator.userAgent)).toString(36)
            + '-' + Math.floor(performance.now()).toString(36);
    }

    get profile() {
        return this._data.profile || null;
    }

    set profile(p) {
        this._data.profile = p;
        this._write();
    }

    /** True once the player has chosen a nickname (completed onboarding). */
    get isRegistered() {
        return !!(this._data.profile && this._data.profile.nickname);
    }
}

// Tiny non-crypto fallback hash (only used when randomUUID is unavailable).
function hashString(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h << 5) - h + s.charCodeAt(i);
        h |= 0;
    }
    return h;
}

export class ApiError extends Error {
    constructor(message, status, body) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.body = body;
    }
}

export class ApiClient {
    constructor(baseUrl = API_BASE) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.identity = new DeviceIdentity();
    }

    get isRegistered() {
        return this.identity.isRegistered;
    }

    get profile() {
        return this.identity.profile;
    }

    async _request(method, path, body) {
        const headers = { 'X-Device-Token': this.identity.token };
        if (body !== undefined) headers['Content-Type'] = 'application/json';

        let resp;
        try {
            resp = await fetch(this.baseUrl + path, {
                method,
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
            });
        } catch (networkErr) {
            throw new ApiError('Network error — is the quiz server reachable?', 0, null);
        }

        let data = null;
        const text = await resp.text();
        if (text) {
            try { data = JSON.parse(text); } catch (_) { data = text; }
        }

        if (!resp.ok) {
            const detail = (data && data.detail) || `Request failed (${resp.status})`;
            throw new ApiError(detail, resp.status, data);
        }
        return data;
    }

    /** Register/update the player; caches the returned profile locally. */
    async registerPlayer(nickname, country) {
        const profile = await this._request('POST', '/players', {
            deviceToken: this.identity.token,
            nickname,
            country: country || '',
        });
        this.identity.profile = profile;
        return profile;
    }

    getToday() {
        return this._request('GET', '/daily/today');
    }

    startDaily() {
        return this._request('POST', '/daily/today/start');
    }

    submitAnswer(attemptId, index, answer, elapsedMs) {
        return this._request('POST', '/daily/today/answer', {
            attemptId, index, answer, elapsedMs,
        });
    }

    getLeaderboard(date) {
        const path = date ? `/daily/${date}/leaderboard` : '/daily/today/leaderboard';
        return this._request('GET', path);
    }
}
