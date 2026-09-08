/**
 * The backend client, for the islands that need it.
 *
 * A lazy module singleton rather than a top-level import, for two reasons:
 *
 *   - `js/data/api-client.js` reads `window.GLOBE3D_API_BASE` and the device
 *     token from localStorage at construction. Neither exists on the server, and
 *     every `client:idle` island is server-rendered — it just renders null there.
 *   - only two things talk to a backend: the Daily Challenge and the theme
 *     picker. A static import would put `@terragotcha/api-client` and the
 *     identity code into the shell's initial chunk for every reader who never
 *     opens either.
 *
 * The client is created once and reused, because it owns the device token —
 * `DeviceIdentity` mints one on first read and that token IS the account. Two
 * clients would still share localStorage, but the caching would diverge.
 *
 * Note that every request carries that token, the public theme list included,
 * so opening the settings sheet mints an anonymous device id for a reader who
 * has one. The vanilla app did the same; it is an id, not an account, until
 * `registerPlayer` is called.
 */
import type { ApiClient as DailyApi } from './daily/types';

/** A stored theme as the backend sends it (`themes/serializers.py`). */
export interface RemoteTheme {
    id: number;
    name: string;
    /** `{'--knob': value}` — the backend speaks prefixed names. */
    tokens: Record<string, string>;
    /** A palette key (`COUNTRY_SCHEMES`), or '' to inherit. */
    countryScheme: string;
    isPublished: boolean;
    createdBy: string;
    updated: string;
}

/** What the superuser endpoints accept. */
export interface ThemeInput {
    name: string;
    tokens: Record<string, string>;
    countryScheme: string;
    isPublished: boolean;
}

export interface ThemeApi {
    /** Public: published themes, for the picker. */
    listThemes(): Promise<RemoteTheme[]>;
    /** Superuser: every theme, drafts included. */
    listAllThemes(): Promise<RemoteTheme[]>;
    createTheme(theme: ThemeInput): Promise<RemoteTheme>;
    updateTheme(id: number, theme: ThemeInput): Promise<RemoteTheme>;
    deleteTheme(id: number): Promise<void>;
}

export type Api = DailyApi & ThemeApi;

let client: Api | null = null;
let pending: Promise<Api> | null = null;

/** The shared client, constructed on first use. */
export function getApi(): Promise<Api> {
    if (client) return Promise.resolve(client);
    // Deduplicated: two islands asking at once must not build two clients.
    pending ??= import('../../../../js/data/api-client.js').then((m) => {
        client = new m.ApiClient() as unknown as Api;
        return client;
    });
    return pending;
}
