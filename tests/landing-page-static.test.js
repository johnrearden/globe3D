/**
 * The apex must ship its content as static HTML — on the Astro route too.
 *
 * This is the same invariant `country-page-static.test.js` pins for a country
 * page, retargeted to the page the AdSense rejection was actually about. The
 * apex served 137 indexable words, 62 of them inside a 1×1px-clipped block, and
 * linked to none of the content. Whatever replaces it has to do better, and has
 * to keep doing better.
 *
 * Structural rather than build-based on purpose: a full Astro build in the unit
 * suite would be slow, and the end-to-end proof (JS-disabled render) is a
 * separate harness. This guards the source so the regression cannot reach it
 * unnoticed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** Strip comments so the checks read CODE, not prose — a file's own docstring
 *  names the things it promises not to do. */
const stripComments = src => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

const page = read('../apps/web/src/pages/index.astro');
const content = stripComments(read('../apps/web/src/components/LandingContent.tsx'));

describe('apex page composition', () => {
    it('renders LandingContent with NO client: directive', () => {
        // Astro ships zero JS for a component without one, so the text cannot be
        // wiped by hydration. One word here would undo the whole exercise.
        const tag = page.match(/<LandingContent[^>]*>/);
        expect(tag, 'LandingContent is not rendered by the page').toBeTruthy();
        expect(tag[0]).not.toMatch(/client:/);
    });

    it('passes it to PanelSheet as a slot, not as a prop', () => {
        // A prop would serialise the whole landing model into the island's
        // hydration payload and re-render it client-side; a slot is built to
        // HTML and handed over untouched.
        expect(page).toMatch(/<PanelSheet[^>]*>\s*<LandingContent/);
        expect(page).not.toMatch(/<PanelSheet[^>]*\bcontent=/);
    });

    it('hydrates exactly the known islands, each in the right mode', () => {
        const hydrated = [...page.matchAll(/<(\w+)[^>]*\sclient:([\w]+)/g)]
            .map(m => `${m[1]}:${m[2]}`)
            .sort();
        expect(hydrated).toEqual(['AppRouter:idle', 'GlobeIsland:only', 'PanelSheet:idle']);
    });

    it('keeps the globe placeholder in the page, not inside the island', () => {
        // client:only contributes no build-time HTML, so a placeholder inside it
        // would leave the first paint empty behind the panel.
        expect(page).toMatch(/id="globe-placeholder"/);
    });
});

describe('the content component stays static-safe', () => {
    it('uses no hooks, handlers or browser globals', () => {
        expect(content).not.toMatch(/\buse(State|Effect|Ref|Memo|Callback)\b/);
        expect(content).not.toMatch(/\bon[A-Z]\w*=/);
        expect(content).not.toMatch(/\b(window|document|localStorage)\b/);
    });

    it('never injects stored markup', () => {
        // Copy comes from a JSON file that Django writes. It is plain text, and
        // it must stay incapable of carrying markup into a static page.
        expect(content).not.toMatch(/dangerouslySetInnerHTML/);
    });

    it('renders no figure of its own', () => {
        // Every number is precomputed and verified against country-meta.json by
        // landingModel. A component that formatted its own could disagree with
        // the claim the build checked.
        expect(content).not.toMatch(/toLocaleString|toFixed|Math\./);
    });
});

describe('the apex', () => {
    it('is indexable — the staging noindex left with the flip', () => {
        // While staged at /app it was noindex, because an indexable duplicate
        // of the front page would be an own-goal on a site rejected for content
        // quality. It IS the front page now; a leftover override would hide it.
        expect(page).not.toMatch(/robots=/);
    });

    it('is canonical at /', () => {
        expect(page).toMatch(/canonicalPath="\/"/);
    });
});
