/**
 * Third-party version drift guard (three, zustand).
 *
 * The app is buildless: index.html resolves bare specifiers through an importmap
 * pointing at pinned CDN URLs, while package.json pins the copy that Node, vitest
 * and (later) Vite/Metro resolve. Nothing links the two, so they can silently
 * diverge — and a version skew between the browser and the test runner is exactly
 * the kind of bug that surfaces only as a rendering or behaviour difference in
 * production, long after the commit that caused it.
 *
 * Asserts, for every CDN-resolved dependency, that the importmap URL, the
 * package.json pin and the installed copy all name the same exact version.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Pull the `imports` object out of index.html's <script type="importmap">. */
function readImportMap() {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const match = html.match(/<script type="importmap">\s*([\s\S]*?)\s*<\/script>/);
    expect(match, 'index.html has an importmap').toBeTruthy();
    return JSON.parse(match[1]).imports;
}

/**
 * Both entries are pinned the same way and fail the same way, so they share one
 * check. Adding a third CDN-resolved dependency means adding a row here, not a
 * new file.
 */
describe.each([
    ['three', 'three', d => `https://cdn.jsdelivr.net/npm/three@${d}/build/three.module.js`],
    ['zustand', 'zustand/vanilla', d => `https://cdn.jsdelivr.net/npm/zustand@${d}/esm/vanilla.mjs`],
])('%s version pinning', (pkg, specifier, cdnUrl) => {
    const imports = readImportMap();
    const pkgJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    // The pin can live in the root package.json (three, used by js/) or in the
    // workspace package that actually depends on it (zustand, used by quiz-core).
    const declared = pkgJson.dependencies[pkg]
        || JSON.parse(readFileSync(join(root, 'packages/quiz-core/package.json'), 'utf8')).dependencies[pkg];

    it('is pinned to an exact version', () => {
        // Exact, not a range: the importmap URL can only name one version, so a
        // range would let npm install something the browser never sees.
        expect(declared).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('matches the importmap entry', () => {
        expect(imports[specifier]).toBe(cdnUrl(declared));
    });

    it('matches the installed package', () => {
        const installed = JSON.parse(
            readFileSync(join(root, `node_modules/${pkg}/package.json`), 'utf8')
        );
        expect(installed.version).toBe(declared);
    });
});

describe('three subpath mapping', () => {
    const imports = readImportMap();
    const declared = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).dependencies.three;

    it('resolves the "three/" prefix to the same package root', () => {
        // Needed for three/examples/jsm/controls/OrbitControls.js, which the
        // bare "three" entry alone does not cover.
        expect(imports['three/']).toBe(`https://cdn.jsdelivr.net/npm/three@${declared}/`);
    });
});
