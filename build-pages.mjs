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
    // NOT index.html: the apex is Astro's since B11 (see APEX_IS_ASTRO below).
    // The vanilla page stays in the repo as the dev-tool page — label, colour
    // and zoom editors, audit mode — reachable locally at /legacy, and is not
    // deployed. NOT packages either: only that page's import map read them.
    'styles.css',           // still linked by every /borders/<slug> page (B12 retires it)
    'js',                   // the borders quiz (js/landing) and the shared engine
    'borders',              // generated border-quiz landing pages (build-landing.mjs)
    'img',                  // small UI-shell images (e.g. the loading-splash globe)
    'label-config.json',
    'country-colors.json',
    'country-zoom.json',
    'robots.txt',
    'sitemap.xml',
    'country-pages.json',   // name → slug, so the app links only to pages that exist
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

// Merge the Astro country pages in at the ROOT, not under a path.
//
// Not an INCLUDE entry, because INCLUDE maps a root name to dist/<name> and
// 'apps/web/dist' would land at dist/apps/web/dist. Astro's output is
// root-absolute — /_astro/…, /country/…, and a canonical of
// https://terragotcha.com/country/france — so it only works mounted at the site
// root. Copied after the loop above because that loop is preceded by rmSync.
const ASTRO_DIST = join(ROOT, 'apps', 'web', 'dist');
if (!existsSync(join(ASTRO_DIST, 'country'))) {
    // Hard failure, not a warning. sitemap.xml already advertises /country/<slug>
    // (build-landing.mjs writes them from content/countries.json), so deploying
    // without these pages points crawlers at 404s — worse than a failed build,
    // and invisible for weeks.
    console.error(
        `build:pages — no Astro output at ${ASTRO_DIST}/country. ` +
        `Run \`npm run build:web\` first; build:pages expects it to have run. ` +
        `Deploying without it would leave every /country/ URL in sitemap.xml a 404.`);
    process.exit(1);
}
// THE APEX IS NOT ASTRO'S YET. This merge copies entry-by-entry over dist/, so
// the day apps/web grows a src/pages/index.astro it would overwrite the vanilla
// app's index.html — the live front page — with no warning and no diff to notice.
//
// The apex is Astro's (B11). Through Phase B this was false and the loop below
// REFUSED an Astro index.html, so the flip could only happen as a deliberate
// edit here. Now it is true the guard inverts: a build whose Astro output has
// no index.html would deploy a site with no front page, and sitemap.xml already
// lists `/`, so that is a hard failure too — not a warning.
const APEX_IS_ASTRO = true;
const astroEntries = readdirSync(ASTRO_DIST);
if (APEX_IS_ASTRO && !astroEntries.includes('index.html')) {
    console.error(
        'build:pages — apps/web emitted no index.html, so there is no front page.\n' +
        '  The apex is src/pages/index.astro; check the Astro build output.');
    process.exit(1);
}
for (const entry of astroEntries) {
    if (entry === 'index.html' && !APEX_IS_ASTRO) {
        console.error(
            'build:pages — apps/web emitted an index.html, which would replace the ' +
            'vanilla app at /.\n' +
            '  If that is the intended flip, set APEX_IS_ASTRO = true in build-pages.mjs.');
        process.exit(1);
    }
    cpSync(join(ASTRO_DIST, entry), join(DIST, entry), { recursive: true });
}
const countryPages = readdirSync(join(DIST, 'country'))
    .filter((e) => existsSync(join(DIST, 'country', e, 'index.html'))).length;

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

console.log(`build:pages — staged ${copied} entries + ${countryPages} country page(s) into dist/`);
