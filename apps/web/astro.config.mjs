// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { createReadStream, readFileSync, statSync } from 'node:fs';
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
 * Reload when the generated token artefact changes.
 *
 * `SiteHead` imports `packages/design-tokens/dist/tokens.css`, which lives
 * OUTSIDE this Astro project — Vite's watcher is rooted at `apps/web`, so a
 * rebuild of that file produced no change event and the dev server went on
 * serving the transform it had cached. `npm run build:tokens` appeared to do
 * nothing, and the only way through was restarting the dev server: exactly the
 * loop the Theme Lab exists to remove.
 *
 * Watching one file by absolute path is the whole fix. A full reload rather
 * than a CSS hot-update because the globe reads `--globe-space`, `--globe-border`
 * and `--ocean` through `cssToken()` when it is CONSTRUCTED; swapping the
 * stylesheet under a live scene would restyle the DOM and leave the globe
 * wearing the previous theme, which is worse than an honest reload.
 */
function watchDesignTokens() {
    const artefact = join(REPO_ROOT, 'packages/design-tokens/dist/tokens.css');
    return {
        name: 'terragotcha:watch-design-tokens',
        configureServer(server) {
            server.watcher.add(artefact);
            server.watcher.on('change', (file) => {
                if (normalize(file) !== normalize(artefact)) return;
                for (const mod of server.moduleGraph.getModulesByFile(artefact) || []) {
                    server.moduleGraph.invalidateModule(mod);
                }
                server.ws.send({ type: 'full-reload' });
            });
        },
    };
}

/**
 * Serve the repo's `country-pages.json` during `astro dev`.
 *
 * It is a root file of the *vanilla* app that `build-pages.mjs` stages into
 * `dist/`, so it exists in production but not under `astro dev`, which serves
 * only its own routes. The country info panel fetches it to decide whether a
 * country has an article to link to — without this the link never appears in
 * dev, which reads as the feature being broken rather than the file being
 * absent.
 *
 * Not an Astro route: emitting `src/pages/country-pages.json.ts` would collide
 * with the copy `build-pages.mjs` stages at the same path, and the merge is
 * entry-by-entry with no warning about which won.
 */
function serveCountryPages() {
    return {
        name: 'terragotcha:serve-country-pages',
        configureServer(server) {
            server.middlewares.use('/country-pages.json', (_req, res, next) => {
                try {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(readFileSync(join(REPO_ROOT, 'country-pages.json')));
                } catch {
                    next();
                }
            });
        },
    };
}

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
            // The stored theme, so the panel can show what is SAVED rather than
            // what was last built. Those differ for as long as it takes to run
            // `npm run build:tokens`, and seeding from the artefact meant a
            // knob saved but not yet baked read as untouched — and was then
            // deleted by the next save, which writes the diff against defaults.
            server.middlewares.use('/__theme/current', async (req, res, next) => {
                if (req.method !== 'GET') return next();
                try {
                    const { readTheme } = await server.ssrLoadModule(
                        '@terragotcha/design-tokens/theme-file.js');
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(readTheme()));
                } catch {
                    next();
                }
            });

            server.middlewares.use('/__theme/save', (req, res, next) => {
                if (req.method !== 'POST') return next();
                let body = '';
                req.on('data', (chunk) => { body += chunk; });
                req.on('end', async () => {
                    try {
                        // ssrLoadModule, not `await import()`. A bare dynamic
                        // import is cached by NODE for the life of the process,
                        // and Astro reloading its config does not clear that —
                        // so a dev server running since before `globe-border`
                        // became the 14th knob filtered saves against the old
                        // 13-name list and dropped it, for nine days, while
                        // answering ok. Vite's loader goes through the module
                        // graph the watcher invalidates, so editing tokens.js
                        // is picked up without a restart.
                        const { writeTheme } = await server.ssrLoadModule(
                            '@terragotcha/design-tokens/theme-file.js');
                        const requested = JSON.parse(body || '{}');
                        const written = writeTheme(requested);
                        // Anything pickKnobs refused. Reported rather than
                        // swallowed: a save that silently loses a knob is worse
                        // than one that fails, because the panel goes on
                        // claiming it worked.
                        const dropped = Object.keys(requested)
                            .filter((k) => !(k in written));
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ ok: true, written, dropped }));
                    } catch (err) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ ok: false, error: String(err.message || err) }));
                    }
                });
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
export default defineConfig({
    site: 'https://terragotcha.com',
    integrations: [react()],
    vite: {
        plugins: [
            serveGlobeAssets(), serveCountryPages(), saveThemeFile(), watchDesignTokens(),
        ],
    },
    // Emit /country/france/index.html rather than /country/france.html, so the
    // URL the app pushes and the URL the build serves are the same string.
    // A trailing-slash mismatch is the classic way pushState routing 404s on
    // hard reload.
    build: { format: 'directory' },
    trailingSlash: 'ignore',
});
