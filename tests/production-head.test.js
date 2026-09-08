/**
 * The production head on `/app` and `/country/*`.
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
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    ADSENSE_CLIENT_ID, CMP_PUBLISHER_ID, CONSENT_REGIONS, GA_MEASUREMENT_ID,
} from '../js/data/site-config.js';
import { productionHead } from '../apps/web/src/lib/site-head.ts';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');
const layout = read('apps/web/src/layouts/AppLayout.astro');
const head = layout.slice(layout.indexOf('<head>'), layout.indexOf('</head>'));
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
        for (const f of ['apps/web/src/lib/site-head.ts', 'apps/web/src/layouts/AppLayout.astro']) {
            expect(read(f), f).not.toMatch(/ca-pub-\d|pub-\d{6}|G-[A-Z0-9]{8}/);
        }
    });

    it('denies the consent regions by default and grants the rest, in that order', () => {
        expect(prod.consent).toContain(`region:${JSON.stringify(CONSENT_REGIONS)}`);
        expect(prod.consent.indexOf("ad_storage:'denied'")).toBeLessThan(prod.consent.indexOf("ad_storage:'granted'"));
        expect(prod.consent).toContain('wait_for_update:500');
    });
});

describe('the layout head', () => {
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
        expect(layout).toMatch(/resolveTheme\(readTheme\(\)\)\['bg-app'\]/);
        expect(head).not.toMatch(/theme-color" content="#/);
    });

    it('starts error reporting from a hoisted script, before any island', () => {
        expect(head).toMatch(/<script>\s*import \{ initErrorReporter \} from '\.\.\/lib\/error-reporter';\s*initErrorReporter\(\);\s*<\/script>/);
        expect(read('apps/web/src/lib/error-reporter.ts')).toMatch(/import\.meta\.env\.PROD/);
    });
});

describe('one region list', () => {
    it('is the only copy: analytics.js and build-landing.mjs read site-config', () => {
        expect(read('js/features/analytics.js')).toMatch(/CONSENT_REGIONS/);
        expect(read('js/features/analytics.js')).not.toMatch(/'AT', 'BE'/);
        expect(read('build-landing.mjs')).toMatch(/CONSENT_REGIONS/);
        expect(read('build-landing.mjs')).not.toMatch(/\['AT', 'BE'/);
    });

    it('is what the generated /borders pages actually carry', () => {
        // The generator regex-reads it; a broken regex would silently emit an
        // empty list and deny nobody. Check the artefact, not the code.
        expect(read('borders/france/index.html')).toContain(`region:${JSON.stringify(CONSENT_REGIONS)}`);
    });
});

describe('the pages', () => {
    it('give the apex WebApplication data and a country an Article', () => {
        expect(read('apps/web/src/pages/app/index.astro')).toMatch(/'@type': 'WebApplication'/);
        expect(read('apps/web/src/pages/country/[slug].astro')).toMatch(/'@type': 'Article'/);
    });

    it('render the WebGL failure card only from the client-only island', () => {
        const island = read('apps/web/src/components/GlobeIsland.tsx');
        expect(island).toMatch(/\{failed && \(/);
        expect(island).toMatch(/window\.location\.reload\(\)/);
        for (const p of ['apps/web/src/pages/app/index.astro', 'apps/web/src/pages/country/[slug].astro', 'apps/web/src/layouts/AppLayout.astro']) {
            expect(read(p), p).not.toContain('globe-failed');
        }
    });
});
