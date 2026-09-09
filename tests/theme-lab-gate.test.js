/**
 * The Theme Lab: on demand, gated, and out of the static document.
 *
 * Until B9 it was a dev-only island behind a conditional `await import()` of a
 * wrapper — the shape that let Rollup drop the module, after the obvious
 * `{import.meta.env.DEV && <ThemeLab client:only />}` shipped an 8 KB chunk and
 * its CSS into every page. Promoting it to a gated production editor changes
 * the shape, not the invariants:
 *
 *   - it is never in the shell's initial chunk (React.lazy, so its own chunk,
 *     fetched when opened);
 *   - it can never reach the static document `/` and `/country/*` are held
 *     to (the shell island renders null at build time; the Lab is a child of
 *     it);
 *   - its stylesheet travels with it.
 *
 * `/` and `/country/*` are held to a static-content baseline — that is the
 * entire reason this app exists — so a panel leaking into it is not cosmetic.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { KNOBS, KNOB_NAMES } from '../packages/design-tokens/src/tokens.js';
import { SETTINGS_KEY } from '../packages/storage/src/settings-store.js';
import { AUDIT_TOKEN_KEY } from '../packages/api-client/src/client.js';
import { extractAuditToken, AUDIT_TOKEN_KEY as APP_AUDIT_KEY } from '../apps/web/src/lib/audit.ts';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

const layout = read('apps/web/src/layouts/AppLayout.astro');
const shell = read('apps/web/src/components/shell/ShellControls.tsx');
const panel = read('apps/web/src/components/theme/ThemeLab.tsx');
const themeLib = read('apps/web/src/lib/theme.ts');

describe('how the Lab is reached', () => {
    it('is not imported by the layout at all', () => {
        // A layout import is a build-time edge into every page's bundle and CSS.
        expect(layout).not.toMatch(/components\/(theme|dev)\//);
        expect(layout).not.toMatch(/ThemeLab|DevTools/);
    });

    it('is a lazy import from the shell, so it is its own chunk', () => {
        expect(shell).toMatch(/lazy\(\(\) => import\('\.\.\/theme\/ThemeLab'\)\)/);
        expect(shell).not.toMatch(/^import ThemeLab/m);
    });

    it('opens only from the settings sheet, behind canAuthorThemes', () => {
        const sheet = read('apps/web/src/components/shell/SettingsSheet.tsx');
        expect(sheet).toMatch(/useState\(canAuthorThemes\)/);
        expect(sheet).toMatch(/setOverlay\('theme-lab'\)/);
        // And nowhere else: the overlay name appears in the shell only to render it.
        expect(shell.match(/'theme-lab'/g)).toHaveLength(1);
    });
});

describe('its stylesheet', () => {
    it('is imported by the component as a string, not the layout', () => {
        // Astro hoists the CSS of every module a page can reach — dynamic
        // imports included — into the page's <style>. A plain import put the
        // Lab's rules into every crawler-facing document; `?inline` keeps
        // them in the chunk.
        expect(panel).toContain("from '../../styles/theme-lab.css?inline'");
        expect(panel).toMatch(/<style>\{labCss\}<\/style>/);
        expect(layout).not.toContain('theme-lab.css');
    });

    it('is the only place .tl- rules live', () => {
        for (const f of readdirSync(fileURLToPath(new URL('../apps/web/src/styles', import.meta.url)))) {
            if (f === 'theme-lab.css') continue;
            expect(read(`apps/web/src/styles/${f}`), f).not.toMatch(/\.tl-/);
        }
    });
});

describe('the Theme Lab covers the knob table', () => {
    it('renders a control for every knob type the system defines', () => {
        // The panel generates its rows from KNOB_GROUPS, which is the point --
        // a fifteenth knob should need no change to it. But that only holds
        // while every `type` has a branch: a knob whose type the panel does not
        // handle renders an empty cell, with nothing to notice.
        const handled = new Set(
            [...panel.matchAll(/knob\.type === '([a-z]+)'/g)].map(m => m[1]));
        for (const type of new Set(KNOBS.map(k => k.type))) {
            expect(handled, `no control for knob type '${type}'`).toContain(type);
        }
    });

    it('drives the roundness sliders in px, the unit the knobs are declared in', () => {
        expect(panel).toMatch(/`\$\{e\.target\.value\}px`/);
        for (const k of KNOBS.filter(k => k.type === 'length')) {
            expect(k.value, `${k.name} is not in px`).toMatch(/^\d+px$/);
        }
    });
});

describe('what a stored theme is', () => {
    it('is the complete knob map, never the diff', () => {
        // applyCssVariables resolves the whole system from what it is given
        // and writes every property, so a partial map would reset every knob
        // it omitted to the PACKAGE default -- not to the built artefact with
        // theme.json in it. The Lab must therefore publish `knobs`, not
        // `overrides`.
        expect(panel).toMatch(/tokens: knobsToApi\(knobs\)/);
        expect(panel).not.toMatch(/knobsToApi\(overrides\)/);
    });

    it('speaks the backend\'s prefixed names, and every knob is on its allow-list', () => {
        // knobsToApi adds `--`; the Python allow-list is generated from the same
        // KNOB_NAMES, so this is the round trip the two sides agree on.
        const allow = read('backend/themes/tokens.py');
        for (const name of KNOB_NAMES) {
            expect(allow, `--${name} not accepted by the backend`).toContain(`'--${name}'`);
        }
        expect(themeLib).toMatch(/\[`--\$\{n\}`, knobs\[n\]\]/);
    });

    it('"default" removes the inline properties rather than applying package defaults', () => {
        // defaultTheme() does not know about theme.json. The way back to the
        // product's look is the cascade, which means removing what was set.
        expect(themeLib).toMatch(/style\.removeProperty\(prop\)/);
        expect(themeLib).not.toMatch(/applyCssVariables\(defaultTheme\(\)/);
    });
});

describe('wearing it again before first paint', () => {
    const inline = layout.match(/<script is:inline>([\s\S]*?)<\/script>/)?.[1] ?? '';

    it('has an inline script in the head that reads the cached property map', () => {
        expect(inline).toContain('themeInline.css');
        expect(inline).toContain("indexOf('remote:') === 0");
        expect(layout.indexOf('<script is:inline>')).toBeLessThan(layout.indexOf('</head>'));
    });

    it('reads the settings store under its real key', () => {
        // Restated as a literal because the script cannot import; this is the
        // test that keeps the two in step.
        expect(inline).toContain(`localStorage.getItem('${SETTINGS_KEY}')`);
    });

    it('derives nothing — the resolved map is written by lib/theme.ts', () => {
        expect(themeLib).toMatch(/css: toCssVariables\(knobs\)/);
        expect(inline).not.toMatch(/import|toCss|resolve/);
    });
});

describe('the audit token', () => {
    it('uses the key the api client reads', () => {
        expect(APP_AUDIT_KEY).toBe(AUDIT_TOKEN_KEY);
    });

    it('is taken out of the query string and nothing else is', () => {
        expect(extractAuditToken('?audit=abc.def&x=1')).toEqual({ token: 'abc.def', rest: 'x=1' });
        expect(extractAuditToken('?audit=abc')).toEqual({ token: 'abc', rest: '' });
        expect(extractAuditToken('?x=1')).toEqual({ token: null, rest: 'x=1' });
        expect(extractAuditToken('')).toEqual({ token: null, rest: '' });
    });

    it('is kept by the inline head script, before AppRouter rewrites the URL', () => {
        // An island reading location.search runs after the router has
        // normalised it, and the token is gone. So the head script does it,
        // under the same key, and scrubs the address bar.
        const inline = layout.match(/<script is:inline>([\s\S]*?)<\/script>/)?.[1] ?? '';
        expect(inline).toContain(`sessionStorage.setItem('${AUDIT_TOKEN_KEY}', audit)`);
        expect(inline).toMatch(/q\.delete\('audit'\)[\s\S]*history\.replaceState/);
        // The island keeps the fallback.
        expect(shell).toMatch(/useEffect\(\(\) => \{ captureAuditToken\(\); \}, \[\]\)/);
    });
});

describe('the dev server sees a token rebuild', () => {
    const config = read('apps/web/astro.config.mjs');

    it('watches the generated stylesheet explicitly', () => {
        // It lives OUTSIDE apps/web, and Vite's watcher is rooted there — so a
        // rebuild produced no change event and the dev server kept serving the
        // transform it had cached.
        expect(config).toMatch(/server\.watcher\.add\(/);
        expect(config).toContain('packages/design-tokens/dist/tokens.css');
    });

    it('watches the same file the layout imports', () => {
        const imported = layout.match(/import '([^']*dist\/tokens\.css)'/)[1];
        const watched = config.match(/join\(REPO_ROOT, '([^']*tokens\.css)'\)/)[1];
        expect(imported.endsWith(watched)).toBe(true);
    });

    it('reloads rather than hot-swapping the stylesheet', () => {
        // The globe reads --globe-space/--globe-border/--ocean through
        // cssToken() when it is CONSTRUCTED.
        expect(config).toMatch(/type:\s*'full-reload'/);
    });
});

describe('the theme.json save path (dev only)', () => {
    const config = read('apps/web/astro.config.mjs');

    it('loads the token module through Vite, not a bare dynamic import', () => {
        // `await import()` is cached by NODE for the life of the process. A dev
        // server running since before `globe-border` became the 14th knob
        // filtered saves against the stale list for nine days, answering ok.
        expect(config).toMatch(/ssrLoadModule\(\s*\n?\s*'@terragotcha\/design-tokens\/theme-file\.js'/);
        expect(config).not.toMatch(/await import\('@terragotcha\/design-tokens/);
    });

    it('reports anything pickKnobs refused, rather than swallowing it', () => {
        expect(config).toMatch(/dropped/);
        expect(panel).toMatch(/body\.dropped/);
    });

    it('seeds the panel from the stored theme, not from the built artefact', () => {
        // They disagree for exactly as long as it takes to remember
        // `npm run build:tokens`; seeding from the artefact once DELETED a
        // saved-but-unbaked knob on the next save.
        expect(config).toContain('/__theme/current');
        expect(panel).toContain("fetch('/__theme/current')");
        expect(panel).toMatch(/\.\.\.defaultTheme\(\),\s*\.\.\.stored/);
    });

    it('offers the file controls in dev only', () => {
        // The endpoints are the dev server's; in production the button would
        // POST into a 404.
        expect(panel).toMatch(/if \(!DEV\) return;/);
        expect(panel).toMatch(/\{DEV && \([\s\S]*?Save to theme\.json/);
    });
});
