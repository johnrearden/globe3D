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
import { rmSync, mkdirSync, cpSync, existsSync, readdirSync } from 'node:fs';
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
    'packages',             // workspace packages, resolved via index.html's import map
    'borders',              // generated border-quiz landing pages (build-landing.mjs)
    'img',                  // small UI-shell images (e.g. the loading-splash globe)
    'label-config.json',
    'country-colors.json',
    'country-zoom.json',
    'robots.txt',
    'sitemap.xml',
    'ads.txt',              // AdSense authorized-sellers file (served at site root)
    'privacy',              // /privacy/ policy page (required by AdSense)
    'manifest.webmanifest', // PWA manifest (referenced from index.html <head>)
    // SEO / share assets served from the site root (referenced in index.html's
    // <head>): favicons, Apple touch icon, and the 1200x630 Open Graph image.
    'favicon-16.png',
    'favicon-32.png',
    'favicon-180.png',
    'favicon-512.png',
    'og-image.png',
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

// npm workspaces can materialise a nested node_modules inside a package when a
// dependency can't be hoisted. quiz-core depends on zustand, which hoists to the
// root today — but a version conflict would nest it here and silently bloat the
// upload (and ship a copy the import map never resolves). Fail loudly instead.
const distPackages = join(DIST, 'packages');
if (existsSync(distPackages)) {
    for (const pkg of readdirSync(distPackages)) {
        if (existsSync(join(distPackages, pkg, 'node_modules'))) {
            console.error(`build:pages — node_modules leaked into dist/packages/${pkg}/; aborting`);
            process.exit(1);
        }
    }
}

console.log(`build:pages — staged ${copied} entries into dist/`);
