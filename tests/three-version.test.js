/**
 * Three.js version drift guard.
 *
 * The app is buildless: index.html resolves the bare specifier `three` through an
 * importmap pointing at a pinned CDN URL, while package.json pins the copy that
 * Node, vitest and (later) Vite/Metro resolve. Nothing links the two, so they can
 * silently diverge — and a version skew between the browser and the test runner is
 * exactly the kind of bug that only shows up as a rendering difference in prod.
 *
 * This asserts they name the same version, and that the `three/` prefix mapping
 * (used for `three/examples/jsm/...`) points at the same package root.
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

describe('three version pinning', () => {
    const imports = readImportMap();
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    // Exact pin (no ^ or ~): the importmap URL can only name one version, so a
    // range in package.json would let npm install something the browser never sees.
    const declared = pkg.dependencies.three;

    it('package.json pins three to an exact version', () => {
        expect(declared).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('the importmap "three" entry matches that version', () => {
        expect(imports.three).toBe(
            `https://cdn.jsdelivr.net/npm/three@${declared}/build/three.module.js`
        );
    });

    it('the importmap "three/" prefix resolves to the same package root', () => {
        expect(imports['three/']).toBe(`https://cdn.jsdelivr.net/npm/three@${declared}/`);
    });

    it('the installed package is that version', async () => {
        const installed = JSON.parse(
            readFileSync(join(root, 'node_modules/three/package.json'), 'utf8')
        );
        expect(installed.version).toBe(declared);
    });
});
