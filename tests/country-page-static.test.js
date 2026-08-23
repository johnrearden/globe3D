/**
 * The country page must keep shipping its content as static HTML.
 *
 * This is the one invariant the whole static-page effort rests on, and the edit
 * that would undo it is a single word: adding a `client:` directive to
 * CountryArticle turns it into a hydrated island, and the prose stops being in
 * the initial HTML response — which is exactly the failure that got the site
 * rejected by AdSense.
 *
 * Structural rather than build-based on purpose: a full Astro build in the unit
 * suite would be slow, and the end-to-end proof (JS-disabled render) already
 * exists as a scratchpad harness. This guards the source so the regression can
 * never reach that harness unnoticed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/**
 * Strip comments so the checks below read CODE, not prose. Without this the
 * article's own docstring — which names the things it promises not to use —
 * fails its own test. Crude — a comment-terminator inside a string literal would
 * confuse it — which is fine for source files we control and assert on.
 */
const stripComments = src => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

const page = read('../apps/web/src/pages/country/[slug].astro');
const article = stripComments(read('../apps/web/src/components/CountryArticle.tsx'));
const content = JSON.parse(read('../content/countries.json'));

describe('country page composition', () => {
    it('renders CountryArticle with NO client: directive', () => {
        // Astro ships zero JS for a component without one, so the text cannot be
        // wiped by hydration.
        const tag = page.match(/<CountryArticle[^>]*>/);
        expect(tag, 'CountryArticle is not rendered by the page').toBeTruthy();
        expect(tag[0]).not.toMatch(/client:/);
    });

    it('hydrates PanelSheet, and only PanelSheet', () => {
        const hydrated = [...page.matchAll(/<(\w+)[^>]*\sclient:[\w]+/g)].map(m => m[1]);
        expect(hydrated).toEqual(['PanelSheet']);
    });

    it('passes the article to PanelSheet as a slot, not as a prop', () => {
        // A prop would serialise the whole country into the island's markup and
        // then re-render it client-side; a slot stays static HTML.
        expect(page).toMatch(/<PanelSheet[^>]*>[\s\S]*<CountryArticle[\s\S]*<\/PanelSheet>/);
        expect(page).not.toMatch(/<PanelSheet[^>]*country=/);
    });

    it('keeps the article free of hooks and browser globals', () => {
        // Any of these would make it a client component by necessity.
        for (const banned of ['useState', 'useEffect', 'useRef', 'onClick', 'window.', 'document.']) {
            expect(article, `CountryArticle uses ${banned}`).not.toContain(banned);
        }
    });

    it('never injects stored markup', () => {
        // Prose is plain text by contract, so a database field cannot put HTML
        // into a statically generated page.
        expect(article).not.toContain('dangerouslySetInnerHTML');
    });

    it('emits related links as real anchors', () => {
        // A WebGL canvas is not crawlable; without these the pages are orphans.
        expect(article).toMatch(/<a href=\{`\/country\/\$\{[\w.]+\}`\}/);
    });
});

describe('exported content', () => {
    it('is the version this build understands', () => {
        expect(content.version).toBe(1);
    });

    it('has at least one page, or the build would emit nothing', () => {
        expect(content.countries.length).toBeGreaterThan(0);
    });

    it('carries enough prose per page to be worth indexing', () => {
        for (const c of content.countries) {
            const words = [c.summary, ...c.sections.flatMap(s => s.paragraphs)]
                .join(' ').trim().split(/\s+/).length;
            expect(words, `${c.slug} has only ${words} words`).toBeGreaterThan(150);
        }
    });

    it('gives every page all three sections, filled', () => {
        for (const c of content.countries) {
            expect(c.sections.map(s => s.id)).toEqual(['geography', 'history', 'literature']);
            for (const s of c.sections) {
                expect(s.paragraphs.length, `${c.slug}/${s.id} is empty`).toBeGreaterThan(0);
            }
        }
    });

    it('only links to pages that exist', () => {
        const slugs = new Set(content.countries.map(c => c.slug));
        for (const c of content.countries) {
            for (const r of c.related) {
                expect(slugs.has(r.slug), `${c.slug} links to missing ${r.slug}`).toBe(true);
            }
        }
    });
});
