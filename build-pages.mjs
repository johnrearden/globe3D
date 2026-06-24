#!/usr/bin/env node
/**
 * build-pages.mjs — stage the deployable static shell into dist/ for Cloudflare
 * Pages (build command: `npm run build:pages`, output dir: `dist`).
 *
 * `assets/` is intentionally NOT included: the baked binaries are served from
 * Cloudflare R2 (see js/data/asset-base.js), and the big ones (planet-z9.pmtiles
 * ~1.5 GB, world-mesh.bin ~31 MB) exceed Pages' 25 MiB/file limit anyway.
 *
 * An explicit allow-list (not a deny-list) guarantees nothing heavy or private
 * (backend/, node_modules/, docs/, .env, …) ever leaks into the Pages upload.
 */
import { rmSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');

// The static frontend the app actually loads: entry HTML, styles, JS module
// tree (incl. js/vendor/*), the runtime root-JSON configs, robots, and the
// Cloudflare Pages _headers file. Keep in sync if index.html gains a new
// root-level dependency.
const INCLUDE = [
    'index.html',
    'styles.css',
    'js',
    'img',                  // small UI-shell images (e.g. the loading-splash globe)
    'label-config.json',
    'country-colors.json',
    'country-zoom.json',
    'robots.txt',
    '_headers',
];

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

let copied = 0;
for (const entry of INCLUDE) {
    const src = join(ROOT, entry);
    if (!existsSync(src)) {
        console.warn(`build:pages — skipping missing ${entry}`);
        continue;
    }
    cpSync(src, join(DIST, entry), { recursive: true });
    copied++;
}

// Safety net: assets/ must never reach the Pages upload (25 MiB/file cap).
if (existsSync(join(DIST, 'assets'))) {
    console.error('build:pages — assets/ leaked into dist/; aborting');
    process.exit(1);
}

console.log(`build:pages — staged ${copied} entries into dist/`);
