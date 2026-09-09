/**
 * The route vocabulary.
 *
 * Worth pinning because both of its jobs have already gone wrong once in this
 * codebase: the trailing slash is emitted in two shapes by two different
 * generators, and "what is on screen" used to be answered independently in two
 * places that could disagree.
 */
import { describe, it, expect } from 'vitest';
import {
    parseRoute, pathForRoute, sameRoute, HOME_PATH, HOME_ROUTE,
} from '../apps/web/src/lib/routes.ts';

describe('parseRoute', () => {
    it('reads a country path in both shapes', () => {
        // The generated landing panel writes one, CountryArticle writes the other.
        expect(parseRoute('/country/france')).toEqual({ view: 'country', slug: 'france' });
        expect(parseRoute('/country/france/')).toEqual({ view: 'country', slug: 'france' });
    });

    it('reads home with or without its trailing slash', () => {
        expect(parseRoute(HOME_PATH)).toEqual(HOME_ROUTE);
        expect(parseRoute(`${HOME_PATH.replace(/\/$/, '')}/`)).toEqual(HOME_ROUTE);
    });

    it('returns null for paths this app does not own', () => {
        // These must stay real navigations. Swallowing them would strand the
        // user on a URL whose content never loads.
        for (const p of ['/borders/poland', '/privacy/', '/country/', '/country/a/b',
                         '/countryside', '/sitemap.xml']) {
            expect(parseRoute(p), p).toBeNull();
        }
    });

    it('does not accept a slug shape the build never emits', () => {
        // getStaticPaths slugs are lowercase-hyphen; anything else would push a
        // URL that 404s on reload.
        expect(parseRoute('/country/France')).toBeNull();
        expect(parseRoute('/country/fr ance')).toBeNull();
    });
});

describe('pathForRoute', () => {
    it('emits exactly one shape for a country — no trailing slash', () => {
        // Must match CountryArticle's links and sitemap.xml, or the pushed URL
        // contradicts the canonical the page advertises.
        expect(pathForRoute({ view: 'country', slug: 'spain' })).toBe('/country/spain');
    });

    it('round-trips with parseRoute', () => {
        for (const r of [HOME_ROUTE, { view: 'country', slug: 'italy' }]) {
            expect(parseRoute(pathForRoute(r))).toEqual(r);
        }
    });
});

describe('sameRoute', () => {
    it('is true only for the same screen', () => {
        expect(sameRoute(HOME_ROUTE, { view: 'home', slug: null })).toBe(true);
        expect(sameRoute({ view: 'country', slug: 'a' }, { view: 'country', slug: 'a' })).toBe(true);
        expect(sameRoute({ view: 'country', slug: 'a' }, { view: 'country', slug: 'b' })).toBe(false);
        expect(sameRoute(HOME_ROUTE, { view: 'country', slug: 'a' })).toBe(false);
        expect(sameRoute(null, HOME_ROUTE)).toBe(false);
    });
});

describe('the apex is the Astro app', () => {
    it('serves it at /', () => {
        // Flipped at B11 together with APEX_IS_ASTRO in build-pages.mjs, which
        // now REQUIRES an Astro index.html rather than refusing one.
        expect(HOME_PATH).toBe('/');
        expect(parseRoute('/')).toEqual(HOME_ROUTE);
        expect(pathForRoute(HOME_ROUTE)).toBe('/');
    });
});
