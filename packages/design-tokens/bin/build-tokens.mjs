#!/usr/bin/env node
/**
 * Generate the three artefacts from the token source of truth.
 *
 * They are committed rather than gitignored, so changing a knob shows up as a
 * reviewable diff in the same commit — the point of the system is that the
 * three platforms cannot drift, and a diff nobody sees is a drift nobody
 * catches. `--check` re-runs the generator and fails if the committed files are
 * stale, which is what the test suite calls.
 *
 * Usage: node bin/build-tokens.mjs [--check]
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { toCss } from '../src/css.js';
import { toNativeTheme } from '../src/native.js';
import { toPythonAllowList } from '../src/python.js';
import { KNOBS } from '../src/tokens.js';

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(pkgRoot, 'dist');

const banner = kind => [
    `${kind === 'css' ? '/*' : '//'} GENERATED — do not edit.`,
    `${kind === 'css' ? '  ' : '//'} Source: packages/design-tokens/src/tokens.js`,
    `${kind === 'css' ? '  ' : '//'} Rebuild: npm run build:tokens`,
    kind === 'css' ? '*/' : '',
].filter(Boolean).join('\n') + '\n\n';

/** @returns {Record<string, string>} relative path → contents */
export function artefacts() {
    return {
        'tokens.css': banner('css') + toCss(),
        'tokens.native.js':
            banner('js') +
            '/** The resolved default theme as a plain object for React Native. */\n' +
            'export const theme = ' + JSON.stringify(toNativeTheme(), null, 2) + ';\n' +
            '\nexport default theme;\n',
        'tokens.py': toPythonAllowList() + '\n',
    };
}

const files = artefacts();
const check = process.argv.includes('--check');

if (check) {
    const stale = [];
    for (const [name, want] of Object.entries(files)) {
        const path = join(dist, name);
        if (!existsSync(path) || readFileSync(path, 'utf8') !== want) stale.push(name);
    }
    if (stale.length) {
        console.error(`design-tokens: stale artefacts — ${stale.join(', ')}`);
        console.error('Run: npm run build:tokens');
        process.exit(1);
    }
    console.log(`design-tokens — ${Object.keys(files).length} artefacts up to date (${KNOBS.length} knobs)`);
} else {
    mkdirSync(dist, { recursive: true });
    for (const [name, contents] of Object.entries(files)) {
        writeFileSync(join(dist, name), contents);
        console.log(`  wrote dist/${name}`);
    }
    console.log(`design-tokens — ${KNOBS.length} knobs → ${Object.keys(files).length} artefacts`);
}
