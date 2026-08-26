#!/usr/bin/env node
/**
 * check-tokens.mjs — the design system, enforced.
 *
 * WHY: the whole point of @terragotcha/design-tokens is that the finished app
 * can be restyled from packages/design-tokens/src/tokens.js. That only holds if
 * EVERY UI surface resolves to a token, and a rule written in prose does not
 * survive thousands of lines of new UI. The old styles.css is the evidence: it
 * reached 5,649 lines largely because spacing was never tokenised.
 *
 * SCOPE IS THE MIGRATION'S PROGRESS BAR. This checks an explicit list, not the
 * whole repo. It starts at the files that already comply and a file joins when
 * it is rewritten against the token system — so new code is compliant by
 * construction. The legacy styles.css and js/features/** never join: they are
 * deleted at the end of the Phase B rewrite. Switching a linter on against a
 * mountain of violations only ever ends with the linter switched off.
 *
 * Repo-native rather than stylelint because the surfaces that actually broke are
 * ones stylelint cannot see: JSX inline styles, .astro <style> blocks, and
 * THREE.Color(0x……) literals in the globe engine.
 *
 * Usage:  node check-tokens.mjs [--verbose]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();

// --- scope -----------------------------------------------------------------
// Directories whose files are held to the token rule. Add a path when its
// contents have been migrated, never before.
export const SCOPE = [
    'apps/web/src',
    'js/core',
    'js/utils/theme.js',   // the CSS-var → canvas/WebGL bridge; its names must be real
];

// Files that legitimately contain what the rules forbid.
export const EXEMPT = new Set([
    // The source of truth defines the literals everything else refers to.
    'packages/design-tokens/src/tokens.js',
]);

const CHECKED_EXT = new Set(['.css', '.astro', '.tsx', '.jsx', '.ts', '.js']);

// --- the vocabulary --------------------------------------------------------

/** Token names emitted by the build, e.g. 'bg-app'. The only names UI may use. */
export function emittedTokens(css) {
    return new Set([...css.matchAll(/^\s*--([a-z0-9-]+)\s*:/gm)].map(m => m[1]));
}

// --- rules -----------------------------------------------------------------

const NAMED_COLOURS = new Set([
    'white', 'black', 'red', 'green', 'blue', 'yellow', 'orange', 'purple',
    'grey', 'gray', 'silver', 'navy', 'teal', 'aqua', 'lime', 'maroon', 'olive',
    'fuchsia', 'pink', 'brown', 'gold', 'cyan', 'magenta', 'beige', 'ivory',
]);

/** Properties whose value must come from the six-step spacing scale. */
const SPACING_PROPS = /^(margin|padding|gap|row-gap|column-gap)(-(top|right|bottom|left|inline|block))?$/;

/** Lengths allowed raw: hairlines, and the zero/keyword values. */
const RAW_LENGTH_OK = /^(0|auto|inherit|initial|unset|revert|none|1px|2px)$/;

/** Marks a legacy token name kept as a fallback until the old stylesheet goes. */
const LEGACY_PRAGMA = /token-check: legacy-vocabulary/;

/** Collected across the run and reported on success, so they cannot be forgotten. */
let legacyFallbacks = [];

const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
const stripJsComments = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (m, p) => p + ' '.repeat(m.length - p.length));

const lineOf = (src, index) => src.slice(0, index).split('\n').length;

/**
 * Pull the CSS-ish regions out of a file: whole .css files, <style> blocks in
 * .astro, and the object literal inside a JSX style={{ … }}. Returns
 * [{text, offset}] so violations keep their real line numbers.
 */
function cssRegions(src, ext) {
    if (ext === '.css') return [{ text: src, offset: 0 }];
    const out = [];
    if (ext === '.astro') {
        for (const m of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
            out.push({ text: m[1], offset: m.index + m[0].indexOf(m[1]) });
        }
    }
    for (const m of src.matchAll(/style=\{\{([\s\S]*?)\}\}/g)) {
        out.push({ text: m[1], offset: m.index + m[0].indexOf(m[1]) });
    }
    return out;
}

function checkCss(text, offset, src, file, add) {
    const clean = stripCssComments(text);

    for (const m of clean.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\s*\(/g)) {
        add(lineOf(src, offset + m.index), m[0].trim(),
            'colour literal — use a var(--…) token');
    }

    // Declarations: property, then value.
    for (const m of clean.matchAll(/(^|[;{])\s*([a-z-]+)\s*:\s*([^;{}]+)/g)) {
        const prop = m[2];
        const value = m[3].trim();
        const at = () => lineOf(src, offset + m.index + m[0].indexOf(m[2]));

        if (prop === 'font-family' && !value.includes('var(--')) {
            add(at(), `${prop}: ${value}`, 'use var(--font-heading) or var(--font-body)');
        }
        if (prop === 'font-weight' && !value.includes('var(--') && !/^(inherit|initial)$/.test(value)) {
            add(at(), `${prop}: ${value}`, 'use var(--weight-normal|medium|bold)');
        }
        if (prop === 'box-shadow' && !value.includes('var(--') && value !== 'none') {
            add(at(), `${prop}: …`, 'use var(--shadow-low|mid|high|dock)');
        }
        if (/^border(-[a-z]+)?-radius$/.test(prop) && !value.includes('var(--')
            && !/^(0|50%|inherit)$/.test(value)) {
            add(at(), `${prop}: ${value}`, 'use var(--radius-btn|panel|pill|circle)');
        }
        if (SPACING_PROPS.test(prop)) {
            // A calc() built from the scale is fine and sometimes required —
            // `calc(var(--space-2) * -1)` is how a negative margin is expressed,
            // since the scale has no negative steps. Blank those out so their
            // internals are not read as loose numbers; a calc() with no token in
            // it stays behind and is flagged.
            // (A nested-paren regex is not worth it: `calc(var(--space-2) * -1)`
            // defeats the naive /calc\([^)]*\)/ at var()'s closing paren.)
            const scanned = value.includes('calc(') && value.includes('var(--space-')
                ? '' : value;
            for (const part of scanned.split(/\s+/)) {
                if (!part || part.includes('var(--') || RAW_LENGTH_OK.test(part)
                    || /%$/.test(part)) continue;
                if (/\d/.test(part)) {
                    add(at(), `${prop}: ${value}`, 'spacing must come from var(--space-1…6)');
                }
            }
        }
        if (NAMED_COLOURS.has(value.toLowerCase())) {
            add(at(), `${prop}: ${value}`, 'named colour — use a var(--…) token');
        }
    }
}

/**
 * Every var(--x) must name an emitted token or a custom property declared in the
 * same file. This is the rule that matters most during a rewrite: the old
 * stylesheet has ~24 legacy knob names and the new system has 13 different ones,
 * so a rule copied across brings a dead name with it — and var(--accent) does
 * not error, it silently resolves to nothing.
 */
function checkVocabulary(src, file, tokens, add) {
    const local = new Set([...src.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1].slice(2)));
    // Both ways a token is read: var(--x) from CSS, cssToken('--x') from JS that
    // renders to canvas or WebGL. The second is easy to forget and just as easy
    // to get wrong — cssToken returns '' for an unknown name and falls back
    // silently, so a stale name shows up as a wrong colour, not an error.
    const refs = [
        ...[...src.matchAll(/var\(\s*--([a-z0-9-]+)/g)].map(m => [m.index, m[1], `var(--${m[1]})`]),
        ...[...src.matchAll(/cssToken\(\s*['"`]--([a-z0-9-]+)/g)].map(m => [m.index, m[1], `cssToken('--${m[1]}')`]),
    ];
    const lines = src.split('\n');
    for (const [index, name, text] of refs) {
        if (tokens.has(name) || local.has(name)) continue;
        // Narrow escape hatch for the one case that is legitimate while the old
        // stylesheet is still live: reading a legacy token name as a FALLBACK
        // behind a real one. It exempts this rule only — a colour literal on a
        // pragma'd line is still a violation — and every use is counted in the
        // success line, so they read as a countdown rather than a hiding place.
        // The pragma may sit on the reference's own line or in the comment
        // immediately above it, which is where an explanation naturally goes.
        const at = lineOf(src, index);
        if (lines.slice(Math.max(0, at - 4), at).some(l => LEGACY_PRAGMA.test(l))) {
            legacyFallbacks.push(`${file}:${at} ${text}`);
            continue;
        }
        add(at, text,
            'not a token in packages/design-tokens/dist/tokens.css, and not declared in this file. '
            + 'If it is a deliberate fallback behind a real token, mark the line '
            + `${LEGACY_PRAGMA.source.replace(/\\/g, '')}`);
    }
}

/**
 * Six-digit hex colours in engine JS. Deliberately six digits: shorter 0x
 * literals are bit masks, not colours.
 *
 * The allow-list is for values that are optics rather than palette — a theme
 * that could set light intensity could make the globe unreadable.
 */
export const JS_COLOUR_ALLOW = [
    { file: 'js/core/scene.js', match: /AmbientLight|DirectionalLight|PointLight/,
      why: 'light colour — optics, not palette' },
];

function checkJsColours(src, file, add) {
    const clean = stripJsComments(src);
    for (const m of clean.matchAll(/0x[0-9a-fA-F]{6}\b/g)) {
        const line = lineOf(src, m.index);
        const text = src.split('\n')[line - 1] ?? '';
        if (JS_COLOUR_ALLOW.some(a => file === a.file && a.match.test(text))) continue;
        add(line, m[0], 'colour literal — read the token via cssToken() (js/utils/theme.js)');
    }
}

/**
 * Every rule, against one file's source. Pure — takes the text and the
 * vocabulary, touches no filesystem — so the rules can be unit-tested against
 * fixtures instead of only against the repo's current contents.
 *
 * @param {string} file   repo-relative path (selects the JS colour allow-list)
 * @param {string} src
 * @param {Set<string>} tokens  emitted token names, without the `--`
 * @returns {Array<{file:string, line:number, text:string, why:string}>}
 */
export function checkSource(file, src, tokens) {
    const violations = [];
    const ext = extname(file);
    const add = (line, text, why) => violations.push({ file, line, text, why });

    for (const { text, offset } of cssRegions(src, ext)) checkCss(text, offset, src, file, add);
    checkVocabulary(src, file, tokens, add);
    if (ext === '.js' || ext === '.ts' || ext === '.tsx') checkJsColours(src, file, add);
    return violations;
}

// --- driver ----------------------------------------------------------------

function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
        if (statSync(p).isDirectory()) walk(p, out);
        else if (CHECKED_EXT.has(extname(p))) out.push(p);
    }
    return out;
}

export function run({ verbose = false } = {}) {
    const tokensCss = readFileSync(
        join(ROOT, 'packages/design-tokens/dist/tokens.css'), 'utf8');
    const tokens = emittedTokens(tokensCss);

    const files = SCOPE.flatMap((entry) => {
        const abs = join(ROOT, entry);
        return statSync(abs).isDirectory() ? walk(abs) : [abs];
    })
        .map(p => relative(ROOT, p))
        .filter(p => !EXEMPT.has(p))
        .sort();

    const violations = [];
    legacyFallbacks = [];
    for (const file of files) {
        violations.push(...checkSource(file, readFileSync(join(ROOT, file), 'utf8'), tokens));
    }

    if (verbose) {
        console.log(`check-tokens — vocabulary: ${tokens.size} tokens; scope: ${files.length} files`);
        for (const f of files) console.log(`  ${f}`);
    }

    if (violations.length) {
        console.error(`check-tokens — ${violations.length} violation(s)\n`);
        let last = null;
        for (const v of violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
            if (v.file !== last) { console.error(`  ${v.file}`); last = v.file; }
            console.error(`    ${String(v.line).padStart(4)}  ${v.text}`);
            console.error(`          ↳ ${v.why}`);
        }
        console.error(`\nEvery UI value must resolve to a @terragotcha/design-tokens token.`);
        console.error(`Source of truth: packages/design-tokens/src/tokens.js (npm run build:tokens)`);
        return 1;
    }

    console.log(`check-tokens — ${files.length} file(s) clean `
        + `against ${tokens.size} tokens (${SCOPE.join(', ')}).`);
    if (legacyFallbacks.length) {
        console.log(`  ${legacyFallbacks.length} legacy-vocabulary fallback(s) still to remove `
            + 'when styles.css goes:');
        for (const f of legacyFallbacks) console.log(`    ${f}`);
    }
    return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exit(run({ verbose: process.argv.includes('--verbose') }));
}
