import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const meta = JSON.parse(
    readFileSync(fileURLToPath(new URL('../assets/country-meta.json', import.meta.url)), 'utf8')
);

describe('country-meta.json integrity', () => {
    it('nameToId and idToName are a consistent bijection', () => {
        const names = Object.keys(meta.nameToId);
        const ids = Object.keys(meta.idToName);
        expect(names.length).toBe(ids.length);

        for (const [name, id] of Object.entries(meta.nameToId)) {
            expect(meta.idToName[String(id)]).toBe(name);
        }
        for (const [id, name] of Object.entries(meta.idToName)) {
            expect(meta.nameToId[name]).toBe(Number(id));
        }
    });

    it('every countries[] entry matches the name/id maps', () => {
        expect(meta.countries.length).toBeGreaterThan(0);
        for (const c of meta.countries) {
            expect(meta.nameToId[c.name]).toBe(c.id);
            expect(meta.idToName[String(c.id)]).toBe(c.name);
        }
    });

    it('country ids fit in the palette (< paletteCountries)', () => {
        for (const c of meta.countries) {
            expect(c.id).toBeGreaterThanOrEqual(1);
            expect(c.id).toBeLessThan(meta.paletteCountries);
        }
    });
});
