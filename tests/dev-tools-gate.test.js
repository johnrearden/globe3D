/**
 * Dev tools must not reach a production build.
 *
 * The obvious gate does not work, and it fails quietly. Writing
 *
 *     {import.meta.env.DEV && <ThemeLab client:only="react" />}
 *
 * directly in `AppLayout` removes the *render* but not the *module*: a client
 * directive is read by the Astro compiler, which registers the island in the
 * client manifest whether or not the expression around it can ever be true. The
 * first build done that way emitted an 8 KB `ThemeLab` chunk and inlined
 * `dev-theme.css` into all five pages, with nothing visibly wrong.
 *
 * The working shape is a conditional `await import()` of a wrapper that holds
 * the directive, so Rollup has a whole module to drop. These tests pin that
 * shape, because the broken one looks more correct than it is and would be a
 * natural "simplification" later.
 *
 * `/app` and `/country/*` are held to a static-content baseline — that is the
 * entire reason this app exists — so a dev panel leaking into it is not a
 * cosmetic problem.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { KNOBS } from '../packages/design-tokens/src/tokens.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

const LAYOUT = 'apps/web/src/layouts/AppLayout.astro';
const layout = read(LAYOUT);
const frontmatter = layout.slice(0, layout.indexOf('---', 3));

describe('the dev-tools gate in AppLayout', () => {
    it('never imports a dev component statically', () => {
        // A static import is a build-time edge, and CSS imported down that edge
        // is emitted whether the component renders or not.
        expect(frontmatter).not.toMatch(/^\s*import\s+\w+\s+from\s+['"][^'"]*\/dev\//m);
    });

    it('reaches the dev tools only through a DEV-gated dynamic import', () => {
        expect(frontmatter).toMatch(
            /import\.meta\.env\.DEV[\s\S]{0,80}await import\(\s*['"][^'"]*components\/dev\/DevTools\.astro['"]\s*\)/);
    });

    it('carries no client directive on anything from dev/', () => {
        // The directive lives in DevTools.astro, which is the module the
        // production build drops whole.
        const body = layout.slice(layout.indexOf('---', 3));
        expect(body).not.toMatch(/<ThemeLab[^>]*client:/);
    });
});

describe('the dev components themselves', () => {
    const files = readdirSync(fileURLToPath(new URL('../apps/web/src/components/dev', import.meta.url)));

    it('keep their stylesheet out of the layout', () => {
        // dev-theme.css must be imported by the component, so it travels with
        // the module Rollup drops. Imported by AppLayout it would ship always.
        expect(read('apps/web/src/components/dev/ThemeLab.tsx'))
            .toContain("import '../../styles/dev-theme.css'");
        expect(layout).not.toContain('dev-theme.css');
    });

    it('put every client directive behind the wrapper', () => {
        for (const f of files.filter(n => n.endsWith('.astro') && n !== 'DevTools.astro')) {
            expect(read(`apps/web/src/components/dev/${f}`), f).not.toMatch(/client:/);
        }
        expect(read('apps/web/src/components/dev/DevTools.astro')).toMatch(/client:only="react"/);
    });

    it('are the only place dev-only styling lives', () => {
        // A `.tl-` rule anywhere else would ship, since only components/dev is
        // behind the gate.
        for (const f of readdirSync(fileURLToPath(new URL('../apps/web/src/styles', import.meta.url)))) {
            if (f === 'dev-theme.css') continue;
            expect(read(`apps/web/src/styles/${f}`), f).not.toMatch(/\.tl-/);
        }
    });
});

describe('the Theme Lab covers the knob table', () => {
    const panel = read('apps/web/src/components/dev/ThemeLab.tsx');

    it('renders a control for every knob type the system defines', () => {
        // The panel generates its rows from KNOB_GROUPS, which is the point --
        // a fourteenth knob should need no change to it. But that only holds
        // while every `type` has a branch: a knob whose type the panel does not
        // handle renders an empty cell, with nothing to notice.
        const handled = new Set(
            [...panel.matchAll(/knob\.type === '([a-z]+)'/g)].map(m => m[1]));
        for (const type of new Set(KNOBS.map(k => k.type))) {
            expect(handled, `no control for knob type '${type}'`).toContain(type);
        }
    });

    it('drives the roundness sliders in px, the unit the knobs are declared in', () => {
        // `${n}px` on the way out, parseInt on the way in. A bare number would
        // resolve to nothing as a border-radius and fail silently.
        expect(panel).toMatch(/`\$\{e\.target\.value\}px`/);
        for (const k of KNOBS.filter(k => k.type === 'length')) {
            expect(k.value, `${k.name} is not in px`).toMatch(/^\d+px$/);
        }
    });
});
