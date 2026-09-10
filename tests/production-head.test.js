/**
 * The production head on `/` and `/country/*`.
 *
 * B11 step 1. The Astro layout carried a title, description, canonical and Open
 * Graph — and none of what the vanilla apex carries to be a *site*: no AdSense
 * loader or verification meta, no consent defaults, no GA4, no CMP, no favicons
 * or manifest. Every AdSense mention in apps/web was prose. These pin the head
 * that fixes that, and the two rules under it:
 *
 *   1. the tags are STATIC — a non-executing crawler must find them in the raw
 *      HTML, which is the class of failure the site was rejected for;
 *   2. consent defaults come before any tag that could store.
 *
 * The ids come from `js/data/site-config.js` by import, and the region list is
 * read from there by all three consumers, so this file also checks that nothing
 * restates them.
 *
 * Since B12 commit 1 the head is `components/SiteHead.astro`, rendered by both
 * `AppLayout` and `StaticLayout`; the tests below read the component.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    ADSENSE_CLIENT_ID, CMP_PUBLISHER_ID, CONSENT_REGIONS, GA_MEASUREMENT_ID, PRODUCTION_API_BASE,
} from '../js/data/site-config.js';
import { isLocalDevHost } from '../packages/api-client/src/host.js';
import { productionHead } from '../apps/web/src/lib/site-head.ts';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');
// B12 commit 1 moved the head out of AppLayout into a component both layouts
// render inside <head>. Its markup is everything after the frontmatter.
const siteHead = read('apps/web/src/components/SiteHead.astro');
const head = siteHead.slice(siteHead.lastIndexOf('\n---\n'));
const layouts = ['apps/web/src/layouts/AppLayout.astro', 'apps/web/src/layouts/StaticLayout.astro'];
const at = (needle) => { const i = head.indexOf(needle); expect(i, `${needle} in <head>`).toBeGreaterThan(-1); return i; };

describe('productionHead', () => {
    const prod = productionHead(true);

    it('emits nothing at all outside a production build', () => {
        // astro dev must never send a hit or show a banner.
        expect(Object.values(productionHead(false)).every(v => v === '')).toBe(true);
    });

    it('carries the ids from site-config, not copies of them', () => {
        expect(prod.gaId).toBe(GA_MEASUREMENT_ID);
        expect(prod.adsId).toBe(ADSENSE_CLIENT_ID);
        expect(prod.cmpId).toBe(CMP_PUBLISHER_ID);
        expect(prod.adsenseAccount).toBe(ADSENSE_CLIENT_ID);
        // No literal publisher / measurement id anywhere in the app source.
        for (const f of ['apps/web/src/lib/site-head.ts', 'apps/web/src/components/SiteHead.astro', ...layouts]) {
            expect(read(f), f).not.toMatch(/ca-pub-\d|pub-\d{6}|G-[A-Z0-9]{8}/);
        }
    });

    it('denies the consent regions by default and grants the rest, in that order', () => {
        expect(prod.consent).toContain(`region:${JSON.stringify(CONSENT_REGIONS)}`);
        expect(prod.consent.indexOf("ad_storage:'denied'")).toBeLessThan(prod.consent.indexOf("ad_storage:'granted'"));
        expect(prod.consent).toContain('wait_for_update:500');
    });
});

describe('the site head', () => {
    it('puts the consent defaults before every tag that could store', () => {
        const consent = at('head.consent');
        for (const tag of ['googletagmanager.com/gtag/js', 'head.gaConfig', 'adsbygoogle.js', 'fundingchoicesmessages']) {
            expect(at(tag), `${tag} after consent`).toBeGreaterThan(consent);
        }
    });

    it('ships the AdSense loader and verification as static markup', () => {
        // Not a component, not an island, not injected from JS.
        expect(head).toMatch(/<meta name="google-adsense-account"/);
        expect(head).toMatch(/<script\s+async\s+src=\{`https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=/);
        expect(head).toMatch(/crossorigin="anonymous"/);
    });

    it('carries the site furniture the vanilla apex carried', () => {
        for (const needle of [
            'rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png"',
            'rel="apple-touch-icon" sizes="180x180" href="/favicon-180.png"',
            'rel="manifest" href="/manifest.webmanifest"',
            'name="theme-color"', 'property="og:site_name"', 'property="og:image"',
            'name="twitter:image"', 'application/ld+json',
        ]) at(needle);
    });

    it('reads theme-color from the tokens rather than restating a colour', () => {
        expect(siteHead).toMatch(/resolveTheme\(readTheme\(\)\)\['bg-app'\]/);
        expect(head).not.toMatch(/theme-color" content="#/);
    });

    it('starts error reporting from a hoisted script, before any island', () => {
        expect(head).toMatch(/<script>\s*import \{ initErrorReporter \} from '\.\.\/lib\/error-reporter';\s*initErrorReporter\(\);\s*<\/script>/);
        expect(read('apps/web/src/lib/error-reporter.ts')).toMatch(/import\.meta\.env\.PROD/);
    });
});

describe('the API base', () => {
    // The vanilla head set window.GLOBE3D_API_BASE for deployed hosts; the Astro
    // layout did not, so on terragotcha.com the client fell back to same-origin
    // /api — Cloudflare Pages, where a POST is a 405. The Daily Challenge's
    // first production failure.
    const script = head.match(/<script is:inline define:vars=\{\{ apiBase \}\}>([\s\S]*?)<\/script>/)?.[1];

    it('is emitted from site-config, before any island', () => {
        expect(script, 'the define:vars script').toBeTruthy();
        expect(siteHead).toMatch(/import \{ PRODUCTION_API_BASE \} from '[^']*js\/data\/site-config\.js'/);
        expect(head).not.toContain('api.terragotcha.com');
        expect(head.indexOf('define:vars={{ apiBase }}')).toBeLessThan(head.indexOf('<title>'));
    });

    it('agrees with isLocalDevHost about which hosts are local', () => {
        // Run the shipped script against a fake window for each host.
        const run = (hostname) => {
            const win = {};
            new Function('location', 'window', `const apiBase = ${JSON.stringify(PRODUCTION_API_BASE)};\n${script}`)({ hostname }, win);
            return win.GLOBE3D_API_BASE;
        };
        for (const h of ['terragotcha.com', 'www.terragotcha.com', 'abc123.terragotcha.pages.dev',
                         'localhost', '127.0.0.1', '0.0.0.0', '::1', 'john-pc.local',
                         '10.0.0.5', '192.168.1.20', '172.16.0.9', '172.32.0.1', '11.0.0.1']) {
            const local = isLocalDevHost(h);
            expect(run(h), `${h} (${local ? 'local' : 'deployed'})`).toBe(local ? undefined : PRODUCTION_API_BASE);
        }
    });
});

describe('one head, two layouts', () => {
    // B12 commit 1. The borders pages need the production head without the
    // app's islands, so the head is a component and each layout renders it
    // inside <head> — and carries none of it directly, so there is exactly one
    // copy to keep right.
    const inHead = (src) => src.slice(src.indexOf('<head>'), src.indexOf('</head>'));
    // The layouts' docblocks describe what they do not carry; check the code.
    const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    it('is rendered by both layouts, inside <head>, with every prop passed through', () => {
        expect(inHead(read(layouts[0]))).toMatch(/<SiteHead \{\.\.\.Astro\.props\} \/>/);
        // StaticLayout keeps one prop for itself — the body class a static page
        // styles — and spreads the rest.
        const stat = read(layouts[1]);
        expect(stat).toMatch(/const \{ bodyClass, \.\.\.head \} = Astro\.props;/);
        expect(inHead(stat)).toMatch(/<SiteHead \{\.\.\.head\} \/>/);
    });

    it('lives nowhere else', () => {
        for (const f of layouts) {
            const src = code(read(f));
            for (const tag of ['google-adsense-account', 'adsbygoogle', 'define:vars', 'og:image',
                               'theme-color', 'rel="manifest"', 'fonts.googleapis', 'initErrorReporter']) {
                expect(src, `${tag} in ${f}`).not.toContain(tag);
            }
        }
    });

    it('gives a static page the head and nothing else — no islands, no furniture', () => {
        const src = code(read('apps/web/src/layouts/StaticLayout.astro'));
        expect(src).not.toMatch(/client:/);
        expect(src).not.toMatch(/import .*\.css/);
        expect(src.match(/^import /gm)).toHaveLength(2); // the type helper and SiteHead
        expect(src).toMatch(/<body class=\{bodyClass\}>\s*<slot \/>\s*<\/body>/);
    });

    it('imports the token artefact once, from the head', () => {
        expect(siteHead).toMatch(/import '[^']*dist\/tokens\.css'/);
        for (const f of layouts) expect(read(f), f).not.toContain('tokens.css');
    });
});

describe('one region list', () => {
    it('is the only copy: site-config.js, read by site-head.ts', () => {
        // Until B12 build-landing.mjs regex-read a second copy for the borders
        // pages; those are Astro pages on SiteHead now, so there is one reader.
        expect(read('apps/web/src/lib/site-head.ts')).toMatch(/CONSENT_REGIONS/);
        expect(read('apps/web/src/lib/site-head.ts')).not.toMatch(/\['AT', 'BE'/);
        expect(read('build-sitemap.mjs')).not.toMatch(/CONSENT_REGIONS|'AT'/);
    });

    it('reaches the borders pages through the same head', () => {
        const page = read('apps/web/src/pages/borders/[slug].astro');
        expect(page).toMatch(/import StaticLayout from '\.\.\/\.\.\/layouts\/StaticLayout\.astro'/);
        expect(page).not.toMatch(/adsbygoogle\.js|gtag|fundingchoices|google-adsense-account/);
    });
});

describe('the pages', () => {
    it('give the apex WebApplication data and a country an Article', () => {
        expect(read('apps/web/src/pages/index.astro')).toMatch(/'@type': 'WebApplication'/);
        expect(read('apps/web/src/pages/country/[slug].astro')).toMatch(/'@type': 'Article'/);
    });

    it('render the WebGL failure card only from the client-only island', () => {
        const island = read('apps/web/src/components/GlobeIsland.tsx');
        expect(island).toMatch(/\{failed && \(/);
        expect(island).toMatch(/window\.location\.reload\(\)/);
        for (const p of ['apps/web/src/pages/index.astro', 'apps/web/src/pages/country/[slug].astro', ...layouts]) {
            expect(read(p), p).not.toContain('globe-failed');
        }
    });
});
