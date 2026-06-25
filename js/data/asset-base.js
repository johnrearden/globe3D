/**
 * Asset base resolution
 * --------------------------------------------------------------------------
 * Where the baked binary/geo assets (assets/*.bin, *.json) are served from.
 *
 *   - Local / LAN dev: relative `./assets` — served by the static dev server,
 *     resolves under any deploy sub-path (e.g. /globe/).
 *   - Production: an absolute base set via `window.GLOBE3D_ASSET_BASE`
 *     (Cloudflare R2 at https://assets.terragotcha.com), because the big file
 *     — world-mesh.bin (~31 MB) — exceeds Cloudflare Pages' 25 MiB/file limit
 *     and must come from R2.
 *
 * Mirrors the API-base override in js/data/api-client.js. The global is set in
 * index.html (guarded to the production hostname) before the app module loads.
 */
export const ASSET_BASE = (typeof window !== 'undefined' && window.GLOBE3D_ASSET_BASE)
    ? window.GLOBE3D_ASSET_BASE.replace(/\/+$/, '')
    : './assets';

/** Build a URL for a baked asset by filename, e.g. assetUrl('world-mesh.bin'). */
export function assetUrl(name) {
    return `${ASSET_BASE}/${name}`;
}
