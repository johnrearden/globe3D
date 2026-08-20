/**
 * API client — host resolution, device identity, and request wiring.
 *
 * Host resolution gets the most attention because it is the piece that has to
 * keep working across four deploy shapes (localhost, a LAN IP, *.pages.dev, the
 * apex) and is the only thing the native app will bypass entirely.
 */
import { describe, it, expect, vi } from 'vitest';
import { createMemoryStorage } from '@terragotcha/storage';
import {
    ApiClient, ApiError, AUDIT_TOKEN_KEY,
    DeviceIdentity, DEVICE_TOKEN_KEY,
    isLocalDevHost, resolveApiBase,
} from '../src/index.js';

/** Minimal fetch double returning a JSON body; records the calls it received. */
function fakeFetch(responses = [{ status: 200, body: {} }]) {
    const calls = [];
    let i = 0;
    const fn = async (url, init) => {
        calls.push({ url, init });
        const r = responses[Math.min(i++, responses.length - 1)];
        if (r.networkError) throw new TypeError('Failed to fetch');
        return {
            ok: r.status >= 200 && r.status < 300,
            status: r.status,
            text: async () => (r.body === undefined ? '' : JSON.stringify(r.body)),
        };
    };
    fn.calls = calls;
    return fn;
}

const make = (opts = {}) => new ApiClient({
    baseUrl: '/api',
    storage: createMemoryStorage(),
    fetchImpl: fakeFetch(),
    ...opts,
});

describe('isLocalDevHost', () => {
    it.each(['localhost', '127.0.0.1', '0.0.0.0', '::1', 'johns-mac.local',
             '10.0.0.4', '192.168.1.201', '172.16.0.1', '172.31.255.254'])(
        'treats %s as local dev', h => expect(isLocalDevHost(h)).toBe(true));

    it.each(['terragotcha.com', 'www.terragotcha.com', 'abc.pages.dev',
             // Just outside the private-LAN block — a public address that
             // merely looks like one.
             '172.15.0.1', '172.32.0.1', '11.0.0.1'])(
        'treats %s as public', h => expect(isLocalDevHost(h)).toBe(false));
});

describe('resolveApiBase', () => {
    it('lets an explicit override win over everything', () => {
        expect(resolveApiBase({
            override: 'https://api.terragotcha.com/api',
            hostname: 'localhost', protocol: 'http:',
        })).toBe('https://api.terragotcha.com/api');
    });

    it('points at Django on :8000 on the same host in local dev', () => {
        expect(resolveApiBase({ hostname: 'localhost', protocol: 'http:' }))
            .toBe('http://localhost:8000/api');
    });

    it('keeps the LAN IP so a phone on the network reaches the same backend', () => {
        expect(resolveApiBase({ hostname: '192.168.1.201', protocol: 'http:' }))
            .toBe('http://192.168.1.201:8000/api');
    });

    it('falls back to same-origin /api in production', () => {
        expect(resolveApiBase({ hostname: 'terragotcha.com', protocol: 'https:' })).toBe('/api');
    });

    it('falls back to /api with no host at all (SSR / build time)', () => {
        expect(resolveApiBase()).toBe('/api');
    });
});

describe('DeviceIdentity', () => {
    it('mints a token lazily and persists it', () => {
        const storage = createMemoryStorage();
        const id = new DeviceIdentity(storage, { generateId: () => 'tok-1' });
        expect(storage.get(DEVICE_TOKEN_KEY)).toBe(null);   // nothing written yet
        expect(id.token).toBe('tok-1');
        expect(JSON.parse(storage.get(DEVICE_TOKEN_KEY)).token).toBe('tok-1');
    });

    it('reuses the stored token across instances — it IS the account', () => {
        const storage = createMemoryStorage();
        const first = new DeviceIdentity(storage, { generateId: () => 'tok-1' }).token;
        const second = new DeviceIdentity(storage, { generateId: () => 'tok-2' }).token;
        expect(second).toBe(first);
    });

    it('tracks registration through the cached profile', () => {
        const id = new DeviceIdentity(createMemoryStorage(), { generateId: () => 't' });
        expect(id.isRegistered).toBe(false);
        id.profile = { nickname: 'Jo' };
        expect(id.isRegistered).toBe(true);
        expect(new DeviceIdentity(id._storage).profile).toEqual({ nickname: 'Jo' });
    });

    it('starts clean on a corrupt payload rather than throwing', () => {
        const storage = createMemoryStorage({ [DEVICE_TOKEN_KEY]: '<<garbage' });
        const id = new DeviceIdentity(storage, { generateId: () => 'fresh' });
        expect(id.token).toBe('fresh');
    });
});

describe('ApiClient', () => {
    it('refuses to construct without a base URL or storage', () => {
        expect(() => new ApiClient({ storage: createMemoryStorage() })).toThrow(/baseUrl/);
        expect(() => new ApiClient({ baseUrl: '/api' })).toThrow(/storage/);
    });

    it('strips a trailing slash so paths do not double up', () => {
        expect(make({ baseUrl: 'https://api.example.com/api/' }).baseUrl)
            .toBe('https://api.example.com/api');
    });

    it('sends the device token on every request', async () => {
        const fetchImpl = fakeFetch([{ status: 200, body: { ok: true } }]);
        const client = make({ fetchImpl, generateId: () => 'tok-9' });
        await client.getToday();
        expect(fetchImpl.calls[0].url).toBe('/api/daily/today');
        expect(fetchImpl.calls[0].init.headers['X-Device-Token']).toBe('tok-9');
    });

    it('sets Content-Type only when there is a body', async () => {
        const fetchImpl = fakeFetch();
        const client = make({ fetchImpl });
        await client.getToday();
        expect(fetchImpl.calls[0].init.headers['Content-Type']).toBeUndefined();
        await client.startDaily();
        expect(fetchImpl.calls[1].init.body).toBeUndefined();
        await client.submitAnswer('a1', 0, 'France', 100);
        expect(fetchImpl.calls[2].init.headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(fetchImpl.calls[2].init.body)).toEqual({
            attemptId: 'a1', index: 0, answer: 'France', elapsedMs: 100,
        });
    });

    it('caches the profile returned by registerPlayer', async () => {
        const storage = createMemoryStorage();
        const client = make({
            storage,
            fetchImpl: fakeFetch([{ status: 200, body: { nickname: 'Jo', country: 'IE' } }]),
        });
        await client.registerPlayer('Jo', 'IE');
        expect(client.isRegistered).toBe(true);
        expect(JSON.parse(storage.get(DEVICE_TOKEN_KEY)).profile.nickname).toBe('Jo');
    });

    it('picks the dated leaderboard path only when given a date', async () => {
        const fetchImpl = fakeFetch();
        const client = make({ fetchImpl });
        await client.getLeaderboard();
        await client.getLeaderboard('2026-08-13');
        expect(fetchImpl.calls.map(c => c.url)).toEqual([
            '/api/daily/today/leaderboard',
            '/api/daily/2026-08-13/leaderboard',
        ]);
    });

    it('raises ApiError with status and body on a failed response', async () => {
        const client = make({ fetchImpl: fakeFetch([{ status: 429, body: { detail: 'Slow down' } }]) });
        await expect(client.getToday()).rejects.toMatchObject({
            name: 'ApiError', status: 429, message: 'Slow down',
        });
    });

    it('reports a network failure as status 0, not as a thrown TypeError', async () => {
        const client = make({ fetchImpl: fakeFetch([{ networkError: true }]) });
        const err = await client.getToday().catch(e => e);
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(0);
    });

    it('omits the audit header when no audit storage is wired', async () => {
        const fetchImpl = fakeFetch();
        await make({ fetchImpl }).getAuditQuiz('2026-08-13');
        expect(fetchImpl.calls[0].init.headers['X-Audit-Token']).toBeUndefined();
    });

    it('sends the audit header when the token is present', async () => {
        const fetchImpl = fakeFetch();
        const auditStorage = createMemoryStorage({ [AUDIT_TOKEN_KEY]: 'signed-abc' });
        await make({ fetchImpl, auditStorage }).flagAuditQuestion('2026-08-13', 2, 'ambiguous');
        expect(fetchImpl.calls[0].init.headers['X-Audit-Token']).toBe('signed-abc');
        expect(JSON.parse(fetchImpl.calls[0].init.body))
            .toEqual({ index: 2, reason: 'ambiguous', regenerate: true, force: false });
    });

    it('gates only the admin theme routes behind the audit token', async () => {
        const fetchImpl = fakeFetch([{ status: 200, body: [] }]);
        const auditStorage = createMemoryStorage({ [AUDIT_TOKEN_KEY]: 'signed-abc' });
        const client = make({ fetchImpl, auditStorage });
        await client.listThemes();
        await client.listAllThemes();
        expect(fetchImpl.calls[0].url).toBe('/api/themes');
        expect(fetchImpl.calls[0].init.headers['X-Audit-Token']).toBeUndefined();
        expect(fetchImpl.calls[1].url).toBe('/api/admin/themes');
        expect(fetchImpl.calls[1].init.headers['X-Audit-Token']).toBe('signed-abc');
    });
});
