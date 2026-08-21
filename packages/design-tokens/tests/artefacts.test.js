/**
 * The committed artefacts must match what the generator produces.
 *
 * They are committed so a knob change shows up as a reviewable diff — but a
 * committed generated file is only useful if it cannot go stale, and "someone
 * edited the knob and forgot to rebuild" is the exact failure this system exists
 * to prevent.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artefacts } from '../bin/build-tokens.mjs';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const expected = artefacts();

describe('committed artefacts', () => {
    it.each(Object.keys(expected))('dist/%s is present and current', (name) => {
        const path = join(dist, name);
        expect(existsSync(path), `${name} missing — run: npm run build:tokens`).toBe(true);
        expect(readFileSync(path, 'utf8'), `${name} is stale — run: npm run build:tokens`)
            .toBe(expected[name]);
    });

    it('every artefact warns against hand-editing and names its source', () => {
        for (const [name, body] of Object.entries(expected)) {
            expect(body, name).toMatch(/GENERATED/);
            expect(body, name).toContain('packages/design-tokens/src/tokens.js');
        }
    });
});
