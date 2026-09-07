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

describe('the dev server sees a token rebuild', () => {
    const config = read('apps/web/astro.config.mjs');

    it('watches the generated stylesheet explicitly', () => {
        // It lives OUTSIDE apps/web, and Vite's watcher is rooted there — so a
        // rebuild produced no change event and the dev server kept serving the
        // transform it had cached. `npm run build:tokens` appeared to do
        // nothing and only a dev-server restart helped, which is precisely the
        // loop the Theme Lab exists to remove.
        expect(config).toMatch(/server\.watcher\.add\(/);
        expect(config).toContain('packages/design-tokens/dist/tokens.css');
    });

    it('watches the same file the layout imports', () => {
        // Two paths to one artefact: if they drift the watcher silently watches
        // nothing, and the symptom is again "the rebuild did not take".
        const imported = layout.match(/import '([^']*dist\/tokens\.css)'/)[1];
        const watched = config.match(/join\(REPO_ROOT, '([^']*tokens\.css)'\)/)[1];
        expect(imported.endsWith(watched)).toBe(true);
    });

    it('reloads rather than hot-swapping the stylesheet', () => {
        // The globe reads --globe-space/--globe-border/--ocean through
        // cssToken() when it is CONSTRUCTED. A CSS-only hot update would
        // restyle the DOM and leave the globe wearing the old theme.
        expect(config).toMatch(/type:\s*'full-reload'/);
    });
});

describe('the theme save endpoint', () => {
    const config = read('apps/web/astro.config.mjs');
    const panel = read('apps/web/src/components/dev/ThemeLab.tsx');

    it('loads the token module through Vite, not a bare dynamic import', () => {
        // `await import()` is cached by NODE for the life of the process, and
        // Astro reloading its config does not clear that. A dev server running
        // since before `globe-border` became the 14th knob filtered saves
        // against the stale 13-name list and dropped it -- for nine days, while
        // answering ok. ssrLoadModule goes through the graph the watcher
        // invalidates.
        expect(config).toMatch(/ssrLoadModule\(\s*\n?\s*'@terragotcha\/design-tokens\/theme-file\.js'/);
        expect(config).not.toMatch(/await import\('@terragotcha\/design-tokens/);
    });

    it('reports anything pickKnobs refused, rather than swallowing it', () => {
        // The write succeeds either way, so without this the panel goes on
        // reporting success while the value is simply gone.
        expect(config).toMatch(/dropped/);
        expect(panel).toMatch(/body\.dropped/);
    });

    it('seeds the panel from the stored theme, not from the built artefact', () => {
        // They disagree for exactly as long as it takes to remember
        // `npm run build:tokens`. Seeding from the artefact meant a knob saved
        // but not yet baked showed its default, was not counted as an override,
        // and was DELETED by the next save -- which writes the diff against
        // defaults. Losing a value the reader already saved is the worst thing
        // this panel can do.
        expect(config).toContain('/__theme/current');
        expect(panel).toContain("fetch('/__theme/current')");
        expect(panel).toMatch(/\.\.\.defaultTheme\(\),\s*\.\.\.stored/);
    });
});
