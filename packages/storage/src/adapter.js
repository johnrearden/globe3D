/**
 * StorageAdapter — the one interface every persisted store talks to.
 *
 * **Synchronous by design, and that is the whole point.** Both stores read their
 * data in the constructor and hand callers a live object; making reads async
 * would push a `await store.init()` through every call site on both platforms.
 * localStorage is sync, and MMKV is sync on React Native — which is precisely
 * why the plan chose MMKV over AsyncStorage. Any adapter added later must be
 * sync too, or the stores have to be rewritten around it.
 *
 * Storage is also allowed to simply not work: Safari private mode throws on
 * write, a full quota throws, and some embedded webviews throw on merely
 * *touching* `localStorage`. Every adapter here swallows those, so a store never
 * needs its own try/catch and the app degrades to "preferences don't persist"
 * rather than breaking.
 *
 * @typedef {object} StorageAdapter
 * @property {(key: string) => (string|null)} get   Value, or null if absent/unreadable.
 * @property {(key: string, value: string) => void} set   Best-effort; never throws.
 * @property {(key: string) => void} remove         Best-effort; never throws.
 */

/**
 * In-memory adapter. The test double, the SSR/Node fallback, and what
 * `createWebStorage` degrades to when the browser refuses to hand over a real
 * one — so a store constructed against it behaves identically, just without
 * surviving a reload.
 * @returns {StorageAdapter}
 */
export function createMemoryStorage(initial) {
    const map = new Map(initial ? Object.entries(initial) : []);
    return {
        get: key => (map.has(key) ? map.get(key) : null),
        set: (key, value) => { map.set(key, String(value)); },
        remove: key => { map.delete(key); },
    };
}

/**
 * Browser adapter over a Web Storage object (localStorage by default,
 * sessionStorage for the audit token).
 *
 * Probes with a real write rather than trusting that the object exists: the
 * failure mode that matters is a `localStorage` that is present and throws, not
 * one that is missing. If the probe fails we return a memory adapter, so callers
 * never have to ask which they got.
 *
 * @param {Storage} [backing]
 * @returns {StorageAdapter}
 */
export function createWebStorage(backing) {
    let store = backing;
    try {
        if (!store) store = globalThis.localStorage;
        const probe = '__tg_probe__';
        store.setItem(probe, '1');
        store.removeItem(probe);
    } catch (_) {
        return createMemoryStorage();
    }
    return {
        get: (key) => {
            try { return store.getItem(key); } catch (_) { return null; }
        },
        set: (key, value) => {
            try { store.setItem(key, value); } catch (_) { /* quota / private mode */ }
        },
        remove: (key) => {
            try { store.removeItem(key); } catch (_) { /* no-op */ }
        },
    };
}

/**
 * React Native adapter over an MMKV instance. Takes the instance rather than
 * importing `react-native-mmkv`, so this package stays dependency-free and
 * importable in Node and the browser — only `apps/native` ever supplies one.
 *
 * @param {{getString: (k: string) => (string|undefined), set: Function, delete: Function}} mmkv
 * @returns {StorageAdapter}
 */
export function createNativeStorage(mmkv) {
    return {
        get: (key) => {
            try {
                const v = mmkv.getString(key);
                return v === undefined ? null : v;
            } catch (_) { return null; }
        },
        set: (key, value) => {
            try { mmkv.set(key, value); } catch (_) { /* no-op */ }
        },
        remove: (key) => {
            try { mmkv.delete(key); } catch (_) { /* no-op */ }
        },
    };
}

/**
 * Read and parse a JSON value, falling back on anything going wrong — absent
 * key, corrupt JSON, or a value that isn't a plain object. That last case
 * matters: `JSON.parse('null')` and `JSON.parse('7')` both succeed, and both
 * would break the `{ ...DEFAULTS, ...parsed }` merges the stores do.
 *
 * @param {StorageAdapter} storage
 * @param {string} key
 * @param {object} fallback
 */
export function readJson(storage, key, fallback) {
    const raw = storage.get(key);
    if (!raw) return fallback;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
        return parsed;
    } catch (_) {
        return fallback;
    }
}

/**
 * Serialise and write. Silent on failure — see the note at the top of this file.
 * @param {StorageAdapter} storage
 * @param {string} key
 * @param {object} value
 */
export function writeJson(storage, key, value) {
    try {
        storage.set(key, JSON.stringify(value));
    } catch (_) {
        /* circular structure — not reachable with the shapes the stores hold */
    }
}
