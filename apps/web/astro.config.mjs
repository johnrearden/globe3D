// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { createReadStream, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Serve the repo's baked globe assets at /assets during `astro dev`.
 *
 * Without this the dev server has to load them from R2, whose CORS policy allows
 * only https://terragotcha.com and https://www.terragotcha.com — so localhost is
 * blocked and the globe silently never appears. Serving them same-origin sidesteps
 * CORS entirely, which is better than widening a production policy for dev.
 *
 * A symlink in public/ would also work, but `astro build` copies public/ into the
 * output — 13.8 MB of assets into a bundle that is supposed to load them from R2.
 * Middleware runs in dev only and cannot leak into a build.
 */
function serveGlobeAssets() {
    return {
        name: 'terragotcha:serve-globe-assets',
        configureServer(server) {
            server.middlewares.use('/assets', (req, res, next) => {
                // Strip any traversal before joining — this reads from the repo.
                const rel = normalize(decodeURIComponent(req.url.split('?')[0]))
                    .replace(/^(\.\.[/\\])+/, '')
                    .replace(/^[/\\]+/, '');
                const file = join(REPO_ROOT, 'assets', rel);
                try {
                    const stat = statSync(file);
                    if (!stat.isFile()) return next();
                    res.setHeader('Content-Length', stat.size);
                    res.setHeader(
                        'Content-Type',
                        file.endsWith('.json') ? 'application/json' : 'application/octet-stream',
                    );
                    createReadStream(file).pipe(res);
                } catch {
                    next();
                }
            });
        },
    };
}

/**
 * Astro is a BUILD-TIME static generator here, nothing more. The runtime is a
 * plain SPA: navigation after boot is app-owned pushState, so `ClientRouter` is
 * deliberately not enabled — nothing needs `transition:persist` and no island has
 * to survive a document swap.
 *
 * `site` is required for canonical URLs and the sitemap to resolve absolutely.
 */
/**
 * Let the dev theme lab persist a knob map to `packages/design-tokens/theme.json`.
 *
 * Dev-only by construction, the same reason `serveGlobeAssets` is a middleware
 * rather than a `public/` symlink: `configureServer` never runs during a build,
 * so there is no way for this to reach production. `ThemeLab` is likewise gated
 * on `import.meta.env.DEV`, so nothing in a build even tries to call it.
 *
 * `writeTheme` filters the body through `pickKnobs`, so the worst a malformed
 * request can do is write `{}`.
 */
function saveThemeFile() {
    return {
        name: 'terragotcha:save-theme-file',
        configureServer(server) {
            server.middlewares.use('/__theme/save', (req, res, next) => {
                if (req.method !== 'POST') return next();
                let body = '';
                req.on('data', (chunk) => { body += chunk; });
                req.on('end', async () => {
                    try {
                        const { writeTheme } =
                            await import('@terragotcha/design-tokens/theme-file.js');
                        const written = writeTheme(JSON.parse(body || '{}'));
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ ok: true, written }));
                    } catch (err) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ ok: false, error: String(err.message || err) }));
                    }
                });
            });
        },
    };
}

export default defineConfig({
    site: 'https://terragotcha.com',
    integrations: [react()],
    vite: { plugins: [serveGlobeAssets(), saveThemeFile()] },
    // Emit /country/france/index.html rather than /country/france.html, so the
    // URL the app pushes and the URL the build serves are the same string.
    // A trailing-slash mismatch is the classic way pushState routing 404s on
    // hard reload.
    build: { format: 'directory' },
    trailingSlash: 'ignore',
});
