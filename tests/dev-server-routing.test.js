/**
 * The dev server's route split, which exists so that `/` and `/country/*` share
 * one local origin the way Cloudflare Pages serves them in production.
 *
 * The specific bug this guards: the prefix was `/country` without a trailing
 * slash, which also matches `/country-pages.json` — the file that tells the app
 * which countries have an article. Proxying it to Astro made every "Read more"
 * link vanish in dev, with nothing in the console to explain why.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAstroPath, ASTRO_PREFIXES } from '../dev-server.mjs';

const repoFile = rel => existsSync(fileURLToPath(new URL(rel, import.meta.url)));

describe('dev-server route split', () => {
    it('proxies the Astro-owned routes', () => {
        for (const p of ['/country/france/', '/country/france.json', '/country/', '/_astro/x.css',
                         '/@vite/client', '/src/pages/index.astro', '/node_modules/.vite/deps/react.js']) {
            expect(isAstroPath(p), p).toBe(true);
        }
    });

    it('serves the repo-root country-*.json files locally, not through Astro', () => {
        // These really are at the repo root, which is why the naive prefix broke.
        for (const name of ['country-pages.json', 'country-colors.json', 'country-zoom.json']) {
            expect(repoFile(`../${name}`), `${name} should exist at the repo root`).toBe(true);
            expect(isAstroPath(`/${name}`), name).toBe(false);
        }
    });

    it('serves the vanilla app locally', () => {
        for (const p of ['/', '/index.html', '/styles.css', '/js/features/landing-panel.js',
                         '/assets/world-mesh.bin', '/packages/quiz-core/src/index.js', '/sitemap.xml']) {
            expect(isAstroPath(p), p).toBe(false);
        }
    });

    it('keeps every path prefix anchored, so no sibling name can be swallowed', () => {
        // A prefix that is a whole path segment must end in '/' (or be a marker
        // like '/@'), or it matches longer names that merely start the same way.
        for (const pre of ASTRO_PREFIXES) {
            expect(pre.startsWith('/'), pre).toBe(true);
            // '/@' is a marker, not a path segment: Vite's /@vite, /@id and /@fs
            // all share it and nothing else can begin that way.
            if (pre === '/@') continue;
            expect(pre.endsWith('/'),
                `"${pre}" has no trailing slash — it would also match "${pre}-anything"`).toBe(true);
        }
    });
});
