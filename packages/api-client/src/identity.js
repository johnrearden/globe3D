/**
 * Device identity — an opaque token generated and stored client-side, sent as
 * `X-Device-Token`. There is no login flow: this token IS the account, which is
 * why losing it loses the player's leaderboard history, and why the generator
 * must not collide.
 *
 * Ported from js/data/api-client.js. The storage and the id generator are now
 * injected, because neither `localStorage` nor `crypto.randomUUID` is reliably
 * present on React Native.
 */

export const DEVICE_TOKEN_KEY = 'globe3d-device-token';

/** Tiny non-crypto fallback hash (only used when randomUUID is unavailable). */
function hashString(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h << 5) - h + s.charCodeAt(i);
        h |= 0;
    }
    return h;
}

/**
 * Default id generator. Prefers `crypto.randomUUID` wherever it exists (all
 * current browsers over HTTPS, and Hermes with a polyfill); the fallback mixes a
 * high-resolution timestamp with whatever entropy the environment offers, which
 * is weak but only ever reached on platforms that lack the real thing.
 */
export function defaultGenerateId() {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    const now = (globalThis.performance && globalThis.performance.now)
        ? globalThis.performance.now()
        : 0;
    const agent = (globalThis.navigator && globalThis.navigator.userAgent) || 'unknown';
    return 'dt-' + Math.abs(hashString(String(now) + agent)).toString(36)
        + '-' + Math.floor(now).toString(36);
}

/** Persisted device token + cached profile. */
export class DeviceIdentity {
    /**
     * @param {import('@terragotcha/storage').StorageAdapter} storage
     * @param {{generateId?: () => string}} [opts]
     */
    constructor(storage, opts = {}) {
        this._storage = storage;
        this._generateId = opts.generateId || defaultGenerateId;
        this._data = this._read();
    }

    _read() {
        const raw = this._storage.get(DEVICE_TOKEN_KEY);
        if (!raw) return {};
        try {
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    _write() {
        this._storage.set(DEVICE_TOKEN_KEY, JSON.stringify(this._data));
    }

    /** Lazily minted on first use, then stable for the life of the install. */
    get token() {
        if (!this._data.token) {
            this._data.token = this._generateId();
            this._write();
        }
        return this._data.token;
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
