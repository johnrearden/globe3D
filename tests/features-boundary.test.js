/**
 * Nothing that survives B11 may import from js/features.
 *
 * `js/features/**` is the vanilla app's, and B11 deletes it (bar the dev
 * editors and the three celebrations). Six modules used to live there by
 * accident of when they were written while being real dependencies of code
 * that stays — the engine, the Astro app, and the deployed /borders/* pages.
 * Two of those would have broken the borders quiz at runtime, in the browser,
 * with the build and this suite both green.
 *
 * So the rule is structural: an `import` from a surviving tree into
 * js/features is a build error here, not a runtime surprise later.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Trees that outlive the vanilla app. */
const SURVIVORS = ['js/core', 'js/data', 'js/utils', 'js/landing', 'apps/web/src', 'packages'];
const EXT = new Set(['.js', '.mjs', '.ts', '.tsx', '.astro']);

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist' || name === 'tests') continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) yield* walk(p);
        else if (EXT.has(p.slice(p.lastIndexOf('.')))) yield p;
    }
}

/** Real import edges only — a comment naming the module it replaced is fine. */
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

describe('the js/features boundary', () => {
    it('is crossed by nothing that survives the deletion', () => {
        const offenders = [];
        for (const tree of SURVIVORS) {
            for (const file of walk(join(ROOT, tree))) {
                const src = readFileSync(file, 'utf8');
                for (const m of src.matchAll(IMPORT_RE)) {
                    const spec = m[1] ?? m[2];
                    if (spec.includes('/features/')) offenders.push(`${file.slice(ROOT.length)} → ${spec}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it('the six survivors are where they now belong', () => {
        for (const p of [
            'js/data/color-schemes.js',
            'js/core/pointer-controls.js',
            'js/core/small-country-indicator.js',
            'js/utils/sheet-snap.js',
            'js/landing/options-grid.js',
            'js/landing/quiz-question-chrome.js',
        ]) expect(() => statSync(join(ROOT, p)), p).not.toThrow();
    });

    it('engine code reads its inks from tokens with the old literals as fallbacks', () => {
        // js/core is in check-tokens SCOPE, so a 0x…… literal there fails the
        // build; the marker's colours therefore go through cssToken, and the
        // fallbacks keep the vanilla app — which loads no tokens.css — as it was.
        const src = readFileSync(join(ROOT, 'js/core/small-country-indicator.js'), 'utf8');
        expect(src).toMatch(/cssToken\('--globe-label', '#ffffff'\)/);
        expect(src).toMatch(/cssToken\('--primary', '#ffff00'\)/);
        expect(src).not.toMatch(/0xffff/);
    });

    it('pointer-controls reports a selection through an injected hook, not an analytics import', () => {
        const src = readFileSync(join(ROOT, 'js/core/pointer-controls.js'), 'utf8');
        expect(src).not.toMatch(/from ['"][^'"]*analytics/);
        expect(src).toMatch(/this\.onSelect\(pickedName\)/);
        // The product wires it; the dev-tool page has no analytics and leaves
        // it unset, which is the point of a hook with a no-op default.
        expect(readFileSync(join(ROOT, 'apps/web/src/components/GlobeIsland.tsx'), 'utf8')).toMatch(/onSelect: \(name: string\) => track\('country_select'/);
        expect(readFileSync(join(ROOT, 'index.html'), 'utf8')).not.toMatch(/analytics/);
    });
});
