/**
 * API client for the Terragotcha quiz backend (Daily Challenge, leaderboard,
 * themes, audit).
 *
 * The backend is self-hosted and called cross-origin from the static frontend.
 * Ported from js/data/api-client.js with three things injected instead of read
 * off globals — the API base (see host.js), the storage adapter behind the
 * device token, and `fetch`. Every endpoint method and the request/error
 * handling are otherwise unchanged.
 */

import { DeviceIdentity } from './identity.js';

/** sessionStorage key holding the signed audit token (set by index.html boot). */
export const AUDIT_TOKEN_KEY = 'tg-audit-token';

export class ApiError extends Error {
    constructor(message, status, body) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.body = body;
    }
}

export class ApiClient {
    /**
     * @param {object} opts
     * @param {string} opts.baseUrl        Resolved API base, e.g. `/api`. See resolveApiBase().
     * @param {import('@terragotcha/storage').StorageAdapter} opts.storage
     *        Persistent storage for the device token.
     * @param {import('@terragotcha/storage').StorageAdapter} [opts.auditStorage]
     *        Tab-scoped storage for the superuser audit token. Omitted on
     *        platforms without audit mode, where the header is simply never sent.
     * @param {typeof fetch} [opts.fetchImpl]
     * @param {() => string} [opts.generateId]
     */
    constructor({ baseUrl, storage, auditStorage, fetchImpl, generateId } = {}) {
        if (!baseUrl) throw new Error('ApiClient: baseUrl is required');
        if (!storage) throw new Error('ApiClient: storage adapter is required');
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.identity = new DeviceIdentity(storage, { generateId });
        this._auditStorage = auditStorage || null;
        this._fetch = fetchImpl || globalThis.fetch;
        if (typeof this._fetch !== 'function') {
            throw new Error('ApiClient: no fetch implementation available');
        }
        // Bind now: an unbound globalThis.fetch throws "Illegal invocation" in
        // browsers when called as a method off `this`.
        this._fetch = this._fetch.bind(globalThis);
    }

    get isRegistered() {
        return this.identity.isRegistered;
    }

    get profile() {
        return this.identity.profile;
    }

    async _request(method, path, body, extraHeaders) {
        const headers = { 'X-Device-Token': this.identity.token, ...extraHeaders };
        if (body !== undefined) headers['Content-Type'] = 'application/json';

        let resp;
        try {
            resp = await this._fetch(this.baseUrl + path, {
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

    // ---- superuser audit mode (see js/features/audit/) ----------------------
    // The signed token is handed over by the backend's /audit/launch page and
    // kept in tab-scoped storage; the backend re-verifies superuser status per
    // call, so a leaked token buys nothing on its own.

    _auditHeaders() {
        if (!this._auditStorage) return {};
        const token = this._auditStorage.get(AUDIT_TOKEN_KEY);
        return token ? { 'X-Audit-Token': token } : {};
    }

    /** Full quiz for a date (YYYY-MM-DD), answers included. Superuser only. */
    getAuditQuiz(date) {
        return this._request('GET', `/audit/daily/${date}`, undefined, this._auditHeaders());
    }

    /** Flag a question as faulty; the backend regenerates the slot. */
    flagAuditQuestion(date, index, reason, force = false) {
        return this._request('POST', `/audit/daily/${date}/flag`, {
            index, reason, regenerate: true, force,
        }, this._auditHeaders());
    }

    // ---- themes (see js/features/theme-switcher.js + theme-editor.js) --------
    // Public read (published themes); superuser-gated writes reuse the audit token.

    /** Public: published themes for the settings-gear selector. */
    listThemes() {
        return this._request('GET', '/themes');
    }

    /** Superuser: all themes incl. drafts. */
    listAllThemes() {
        return this._request('GET', '/admin/themes', undefined, this._auditHeaders());
    }

    /** Superuser: create a theme. */
    createTheme(theme) {
        return this._request('POST', '/admin/themes', theme, this._auditHeaders());
    }

    /** Superuser: update a theme. */
    updateTheme(id, theme) {
        return this._request('PUT', `/admin/themes/${id}`, theme, this._auditHeaders());
    }

    /** Superuser: delete a theme. */
    deleteTheme(id) {
        return this._request('DELETE', `/admin/themes/${id}`, undefined, this._auditHeaders());
    }
}
