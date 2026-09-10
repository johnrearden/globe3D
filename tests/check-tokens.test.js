/**
 * The design-system rules, against fixtures.
 *
 * `check-tokens.mjs` running clean over the repo proves nothing on its own — a
 * checker with a broken regex is also clean. These pin that each rule actually
 * fires, and just as importantly that the shapes which are *allowed* stay
 * allowed: a token check that flags `calc(var(--space-2) * -1)` gets switched
 * off within a week.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkSource, emittedTokens, SCOPE } from '../check-tokens.mjs';

const tokens = emittedTokens(
    readFileSync(fileURLToPath(new URL('../packages/design-tokens/dist/tokens.css', import.meta.url)), 'utf8'));

const why = (src, file = 'a.css') => checkSource(file, src, tokens).map(v => v.why);
const clean = (src, file = 'a.css') => expect(checkSource(file, src, tokens)).toEqual([]);

describe('vocabulary', () => {
    it('accepts a token the build emits', () => clean('.a { color: var(--text-primary); }'));

    it('rejects a legacy name from the old stylesheet', () => {
        // The likeliest rewrite bug: var(--accent) does not error, it resolves to
        // nothing, so the element renders unstyled and nobody notices.
        expect(why('.a { color: var(--accent); }')[0]).toMatch(/not a token/);
    });

    it('accepts a custom property declared in the same file', () =>
        clean('.a { --panel-grip: 44px; height: var(--panel-grip); }'));

    it('checks cssToken() calls too, not just var()', () => {
        expect(why("const f = cssToken('--font-ui');", 'x.js')[0]).toMatch(/not a token/);
        clean("const f = cssToken('--font-body');", 'x.js');
    });

    it('honours the legacy-vocabulary pragma, and only for this rule', () => {
        clean("// token-check: legacy-vocabulary\nconst f = cssToken('--font-ui');", 'x.js');
        // …but a pragma is not a blanket exemption:
        expect(why("// token-check: legacy-vocabulary\nconst c = 0xff8800;", 'x.js')[0])
            .toMatch(/colour literal/);
    });
});

describe('literals', () => {
    it('rejects hex, rgb() and named colours', () => {
        expect(why('.a { color: #ff0000; }')[0]).toMatch(/colour literal/);
        expect(why('.a { color: rgba(0,0,0,.5); }')[0]).toMatch(/colour literal/);
        expect(why('.a { color: white; }')[0]).toMatch(/named colour/);
    });

    it('rejects font, weight, shadow and radius literals', () => {
        expect(why(".a { font-family: Arial; }")[0]).toMatch(/font-heading|font-body/);
        expect(why('.a { font-weight: 600; }')[0]).toMatch(/weight-/);
        expect(why('.a { box-shadow: 0 1px 2px #000; }').join(' ')).toMatch(/shadow-/);
        expect(why('.a { border-radius: 8px; }')[0]).toMatch(/radius-/);
    });

    it('allows the shapes that are legitimately not tokens', () => {
        clean('.a { border-radius: 50%; }');            // a circle is a shape, not a scale step
        clean('.a { box-shadow: none; }');
        clean('.a { font-weight: inherit; }');
    });
});

describe('spacing', () => {
    it('rejects a raw length', () =>
        expect(why('.a { padding: 13px; }')[0]).toMatch(/space-1…6/));

    it('accepts the scale, calc() built from it, and zero/auto/hairlines', () => {
        clean('.a { padding: var(--space-2) var(--space-3); }');
        clean('.a { margin-left: calc(var(--space-2) * -1); }');   // the scale has no negatives
        clean('.a { margin: 0 auto; }');
        clean('.a { padding: 1px; }');
    });

    it('still rejects a calc() with no token in it', () =>
        expect(why('.a { padding: calc(10px + 3px); }')[0]).toMatch(/space-1…6/));
});

describe('engine colours', () => {
    it('rejects a six-digit hex colour in JS', () =>
        expect(why('const c = 0x222831;', 'js/core/globe.js')[0]).toMatch(/colour literal/));

    it('does not mistake a bit mask for a colour', () =>
        clean('const b = v & 0xff; const w = n >> 0x10;', 'js/core/globe.js'));

    it('allows light colours — optics, not palette', () =>
        clean('const l = new THREE.AmbientLight(0xffffff, 0.7);', 'js/core/scene.js'));
});

describe('scope', () => {
    it('covers the new app, the engine and the token bridge', () => {
        expect(SCOPE).toContain('apps/web/src');
        expect(SCOPE).toContain('js/core');
    });

    it('excludes the legacy app, which is deleted rather than migrated', () => {
        expect(SCOPE).not.toContain('legacy.css');
        expect(SCOPE).not.toContain('styles.css');
        expect(SCOPE.some(s => s.startsWith('js/features'))).toBe(false);
    });
});
