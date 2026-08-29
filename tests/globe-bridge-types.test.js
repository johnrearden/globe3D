/**
 * The TypeScript restatement of GlobeBridge must not drift from the contract.
 *
 * `apps/web/src/lib/globe-types.ts` exists because `packages/globe-bridge` is
 * plain JS with JSDoc — deliberately, so Node, the browser import map and Metro
 * can all load it with no build step. The cost of that choice is a hand-written
 * `.ts` mirror, and a mirror nothing checks is a copy waiting to rot.
 *
 * So this parses the method names straight out of the interface declarations and
 * asserts they are EXACTLY the two exported name lists. Adding a bridge method
 * without adding it here fails, which is the point: the compiler would otherwise
 * reject the new call in TypeScript with an error that reads like a typo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    GLOBE_BRIDGE_METHODS,
    GLOBE_MARKER_METHODS,
} from '../packages/globe-bridge/src/interface.js';
import { GLOBE_APPEARANCE_METHODS } from '../packages/globe-bridge/src/appearance.js';

const src = readFileSync(
    fileURLToPath(new URL('../apps/web/src/lib/globe-types.ts', import.meta.url)),
    'utf8',
);

/**
 * Method names declared inside one `interface X { … }` block.
 *
 * Matches `name(` at the start of a line, which is how a TS method signature is
 * written, and skips comment lines so the prose describing a method is not
 * mistaken for another one. `markers: GlobeMarkers` is a property rather than a
 * method, so it is picked up separately below.
 */
function methodsIn(name) {
    const start = src.indexOf(`export interface ${name} {`);
    expect(start, `interface ${name} is missing`).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf('\n}', start));
    return body
        .split('\n')
        .map(line => line.trim())
        .filter(line => !line.startsWith('*') && !line.startsWith('/'))
        .map(line => /^([A-Za-z_$][\w$]*)\s*\(/.exec(line)?.[1])
        .filter(Boolean);
}

describe('globe-types.ts mirrors the GlobeBridge contract', () => {
    it('declares exactly the bridge methods, and no others', () => {
        const declared = methodsIn('GlobeBridge');
        expect([...declared].sort()).toEqual([...GLOBE_BRIDGE_METHODS].sort());
    });

    it('declares the markers property the interface requires', () => {
        // Not a method, so methodsIn() cannot see it — but omitting it would
        // make every markers.* call a type error.
        expect(src).toMatch(/^\s*markers: GlobeMarkers;$/m);
    });

    it('declares exactly the marker methods', () => {
        expect([...methodsIn('GlobeMarkers')].sort())
            .toEqual([...GLOBE_MARKER_METHODS].sort());
    });

    it('declares exactly the appearance methods', () => {
        // The display half of the boundary, mirrored for the same reason and
        // guarded the same way.
        expect([...methodsIn('GlobeAppearance')].sort())
            .toEqual([...GLOBE_APPEARANCE_METHODS].sort());
    });
});
