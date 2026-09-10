/**
 * The /borders/<slug> pages as Astro pages (B12 commit 2).
 *
 * Until B12 they came from a hand template through build-landing.mjs, with a
 * head of their own, the legacy styles.css and js/landing/border-quiz.js served
 * raw. These pin what replaced that: one publish gate shared with the sitemap,
 * a page model whose copy rules can be tested without Astro, a page that is
 * StaticLayout + markup + one bundled script — no globe, no island — and an
 * answer button shared with the app's quiz rather than copied.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    publishedBorderPages, borderPageModel, imageSlugs, imageSlugsIn, inlineJson,
} from '../landing/borders-pages.mjs';

const root = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const read = (rel) => readFileSync(root(rel), 'utf8');
const page = read('apps/web/src/pages/borders/[slug].astro');
const css = read('apps/web/src/styles/borders.css');

describe('the publish gate', () => {
    const entries = [
        { slug: 'france', name: 'France' }, { slug: 'russia', name: 'Russia' }, { slug: 'spain', name: 'Spain' },
    ];

    it('publishes exactly the entries that have a hero image, in data order', () => {
        const { published, skipped } = publishedBorderPages({ entries, images: new Set(['spain', 'france']) });
        expect(published.map((e) => e.slug)).toEqual(['france', 'spain']);
        expect(skipped).toEqual(['russia']);
    });

    it('reads the image set from file names, however the caller lists them', () => {
        // The Astro page hands it import.meta.glob keys; the sitemap a readdir.
        expect(imageSlugs(['../../img/borders/france.png', '/abs/img/borders/spain.png', 'notes.txt']))
            .toEqual(new Set(['france', 'spain']));
        expect(imageSlugsIn(root('img/borders')).size).toBeGreaterThan(20);
    });

    it('refuses to guess the image set — the first build that did shipped no pages', () => {
        expect(() => publishedBorderPages({ entries })).toThrow(/image slug set/);
    });

    it('is what the page and the sitemap both call', () => {
        expect(page).toMatch(/publishedBorderPages\(\{ images \}\)/);
        expect(page).toMatch(/import\.meta\.glob\('[^']*img\/borders\/\*\.png'\)/);
        const sitemap = read('build-sitemap.mjs');
        expect(sitemap).toMatch(/publishedBorderPages\(\{ images: imageSlugsIn\(/);
        expect(sitemap).toMatch(/content\/countries\.json/);
    });
});

describe('the page model', () => {
    const entry = {
        slug: 'usa', name: 'USA', region: 'North America', borderCount: 2, areaKm2: 9833517,
        neighbours: ['Canada', 'Mexico'], answer: ['Canada', 'Mexico'],
        options: [{ value: 'Canada', label: 'Canada', flag: 'ca' }, { value: 'Cuba', label: 'Cuba', flag: 'cu' }],
        related: [{ slug: 'canada', name: 'Canada' }, { slug: 'mexico', name: 'Mexico' }],
        imageAlt: null,
    };
    const model = borderPageModel(entry, new Set(['usa', 'canada']));

    it('writes the copy the generator wrote, article included', () => {
        expect(model.title).toBe('What countries border the USA? — Map quiz | Terragotcha');
        expect(model.h1).toBe('Which countries border the USA?');
        expect(model.answerSentence).toBe('the USA shares a land border with Canada and Mexico.');
        expect(model.areaLabel).toBe('9,833,517 km²');
        expect(model.canonicalPath).toBe('/borders/usa');
        expect(model.imagePath).toBe('/img/borders/usa.png');
        expect(model.imageAlt).toContain('2 bordering countries');
    });

    it('never states the neighbour count in visible copy', () => {
        // The count gives the quiz away; it lives only in the hidden answer
        // block and the JSON-LD. The alt text is not visible copy.
        for (const s of [model.h1, model.description, model.areaLabel]) expect(s).not.toMatch(/\b2\b/);
        expect(model.jsonLd.hasPart.acceptedAnswer.text).toBe(model.answerSentence);
    });

    it('links only to related pages that are published', () => {
        expect(model.related.map((r) => r.slug)).toEqual(['canada']);
    });

    it('strips the flag from the quiz options and escapes the inline JSON', () => {
        expect(model.quiz.options[0]).toEqual({ value: 'Canada', label: 'Canada' });
        expect(inlineJson({ s: '</script>' })).not.toContain('</script>');
    });
});

describe('the page', () => {
    it('is StaticLayout and markup — no island, no globe, no React', () => {
        expect(page).toMatch(/import StaticLayout from/);
        expect(page).not.toMatch(/client:/);
        expect(page).not.toMatch(/GlobeIsland|AppRouter|PanelSheet|globe-placeholder/);
        expect(page).not.toMatch(/from 'react'/);
    });

    it('keeps the crawler-facing content the generator emitted', () => {
        expect(page).toMatch(/<h1 class="lp-title">\{page\.h1\}<\/h1>/);
        expect(page).toMatch(/<section class="lp-answer sr-only">/);
        expect(page).toMatch(/jsonLd=\{page\.jsonLd\}/);
        expect(page).toMatch(/<nav class="lp-related is-collapsed"/);
        expect(page).toMatch(/set:html=\{inlineJson\(page\.quiz\)\}/);
    });

    it('bundles the quiz script rather than serving it from /js', () => {
        expect(page).toMatch(/<script>\s*import '[^']*js\/landing\/border-quiz\.js';\s*<\/script>/);
        expect(page).not.toMatch(/src="\/js\//);
        const include = read('build-pages.mjs');
        const list = include.slice(include.indexOf('const INCLUDE'), include.indexOf('];'));
        for (const gone of ['js', 'borders', 'styles.css']) {
            expect(list, gone).not.toMatch(new RegExp(`^\\s*'${gone.replace('.', '\\.')}'`, 'm'));
        }
    });

    it('gates the ad unit on both ids, so it renders nothing until a slot exists', () => {
        expect(page).toMatch(/adsId && ADSENSE_LANDING_SLOT/);
        expect(page).toMatch(/\{adSlot && \(/);
    });

    it('does no string building of its own', () => {
        // Titles, descriptions, the answer sentence: all from the model, so the
        // handoff's rules are tested above rather than re-read here.
        expect(page).not.toMatch(/`What countries|`Which countries|`\$\{[^}]*\} shares/);
    });
});

describe('the stylesheets', () => {
    it('share the answer button: answers.css is imported by both quizzes and defined once', () => {
        expect(read('apps/web/src/styles/quiz.css')).toMatch(/@import '\.\/answers\.css';/);
        expect(css).toMatch(/@import '\.\/answers\.css';/);
        const defines = (src) => (src.match(/^\.quiz-option \{/gm) ?? []).length;
        expect(defines(read('apps/web/src/styles/answers.css'))).toBe(1);
        expect(defines(read('apps/web/src/styles/quiz.css'))).toBe(0);
        expect(defines(css)).toBe(0);
    });

    it('carry no !important and no legacy vocabulary', () => {
        const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
        expect(rules).not.toContain('!important');
        expect(rules).not.toMatch(/--(accent|steel|neutral|green|red|glow|font-ui|font-display|weight-semibold|text-heading|text-mid|text-low)\b/);
    });

    it('cover every class the page and the quiz script emit', () => {
        const runtime = read('js/landing/border-quiz.js') + read('js/landing/options-grid.js');
        const used = new Set([
            ...[...page.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)),
            ...[...runtime.matchAll(/className = '([^']+)'/g)].map((m) => m[1]),
            ...[...runtime.matchAll(/classList\.add\('([a-z-]+)'/g)].map((m) => m[1]),
        ]);
        const styled = new Set([...(css + read('apps/web/src/styles/answers.css')).matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1]));
        // Marker classes the script toggles on elements that are styled by
        // another class; and the AdSense host class, styled by Google.
        const markers = new Set(['is-collapsed', 'cta-open', 'is-retry', 'adsbygoogle', 'dq-wide', 'selected', 'correct', 'incorrect', 'missed', 'dimmed', 'nearly', 'wrong']);
        const missing = [...used].filter((c) => !styled.has(c) && !markers.has(c));
        expect(missing).toEqual([]);
    });
});

describe('what left with the generator', () => {
    it('build-landing.mjs and the template are gone; the sitemap script remains', () => {
        expect(readdirSync(root('.'))).not.toContain('build-landing.mjs');
        expect(readdirSync(root('landing'))).not.toContain('border-page.template.html');
        expect(read('package.json')).toMatch(/"build:sitemap": "node build-sitemap\.mjs"/);
        expect(read('package.json')).not.toMatch(/build-landing\.mjs/);
    });

    it('the /borders/* cache rule replaced the /styles.css and /js/* ones', () => {
        const headers = read('_headers');
        expect(headers).toMatch(/^\/borders\/\*$/m);
        expect(headers).not.toMatch(/^\/styles\.css$|^\/js\/\*$/m);
    });
});
