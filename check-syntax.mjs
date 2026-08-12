#!/usr/bin/env node
/**
 * check-syntax.mjs — parse every frontend ES module and fail on syntax errors.
 *
 * The app ships as raw ES modules with no bundler, so nothing between the
 * editor and the browser catches a syntax error: the module simply fails to
 * evaluate at runtime and the app dies with a bare console message. Unit tests
 * don't cover it either, since they only import the handful of pure modules.
 *
 * This is a fast (~50ms) parse of the whole tree. It catches the class of
 * mistake that is easy to introduce when merging or splitting functions —
 * a duplicate `const` in a combined scope, an unbalanced brace, a stray
 * `await` — before it reaches a browser.
 *
 * Not a linter and not a type checker: parse errors only.
 */
import { build } from 'esbuild';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['js', 'packages'];

function collect(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules') continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) collect(full, out);
        else if (entry.endsWith('.js')) out.push(full);
    }
    return out;
}

const files = ROOTS.flatMap(r => collect(r));

try {
    await build({
        entryPoints: files,
        format: 'esm',
        write: false,          // parse only; nothing is emitted
        bundle: false,         // don't try to resolve bare specifiers
        outdir: 'never-written', // required for multiple inputs even with write:false
        logLevel: 'silent',
    });
    console.log(`check:syntax — ${files.length} modules parsed cleanly`);
} catch (err) {
    for (const e of err.errors || []) {
        const loc = e.location;
        console.error(`${loc ? `${loc.file}:${loc.line}:${loc.column}` : '?'} — ${e.text}`);
        if (loc?.lineText) console.error(`    ${loc.lineText.trim()}`);
    }
    console.error(`\ncheck:syntax — FAILED (${(err.errors || []).length} error(s))`);
    process.exit(1);
}
