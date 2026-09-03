/**
 * `createCountryTable` — the app's one record of what it knows about a country.
 *
 * The rules worth pinning are all about DEPENDENCIES, because that is where the
 * two data sources disagree and where the Astro port lost facts. `country-data.js`
 * covers the 210 sovereigns; territories carry their own ISO, parent, population,
 * area and language on the mesh record instead. The vanilla app built the union
 * by mutating the imported `countryData` at boot (`index.html:622`), so a module
 * changed shape depending on who had loaded first; this builds it here, where
 * both sources are already in scope.
 *
 * Greenland is the worked example: absent from `countryToISO` entirely, so
 * before the fallback it rendered in the info panel with no flag and four
 * em-dashes.
 */
import { describe, it, expect } from 'vitest';
import { createCountryTable } from '../js/data/country-table.js';

/** Just the shape createCountryTable reads. */
function stubGlobe({ dependencies = {} } = {}) {
    return {
        getCentroids: () => [
            { name: 'France', centroid: { x: 1, y: 0, z: 0 } },
            { name: 'Greenland', centroid: { x: 0, y: 1, z: 0 } },
            { name: 'Nowhere', centroid: { x: 0, y: 0, z: 1 } },
        ],
        getCapitalsData: () => ({ France: { name: 'Paris', lat: 48.85, lng: 2.35 } }),
        getDependencyData: () => dependencies,
        getCountryByName: (name) => ({ name, area: name === 'France' ? 643801 : null }),
    };
}

const GREENLAND = {
    Greenland: {
        iso: 'gl', parent: 'Denmark', pop: 0.06, area: '2.17M km²',
        lang: 'Greenlandic, Danish',
    },
};

const COUNTRY_DATA = {
    France: { iso: 'fr', pop: 67.7, area: '643K km²', lang: 'French' },
};

const build = (opts = {}) => createCountryTable({
    globeManager: stubGlobe({ dependencies: opts.dependencies ?? GREENLAND }),
    countryToISO: opts.countryToISO ?? { France: 'fr' },
    countryData: opts.countryData ?? COUNTRY_DATA,
});

describe('display facts', () => {
    it('reads a sovereign from countryData', () => {
        expect(build().byName('France')).toMatchObject({
            population: 67.7, areaLabel: '643K km²', language: 'French',
        });
    });

    it('reads a dependency from the mesh, which is the only place it exists', () => {
        expect(build().byName('Greenland')).toMatchObject({
            population: 0.06, areaLabel: '2.17M km²', language: 'Greenlandic, Danish',
        });
    });

    it('is null rather than undefined for a country in neither source', () => {
        // The panel prints an em-dash for null. `undefined` would too, but the
        // row would then not declare the field at all.
        expect(build().byName('Nowhere')).toMatchObject({
            population: null, areaLabel: null, language: null,
        });
    });

    it("treats the mesh's 'N/A' as absent, not as a value to print", () => {
        const t = build({
            dependencies: { Greenland: { iso: 'gl', pop: 'N/A', area: 'N/A', lang: 'N/A' } },
        });
        expect(t.byName('Greenland')).toMatchObject({
            population: null, areaLabel: null, language: null,
        });
    });

    it('keeps the numeric area apart from the label', () => {
        // `area` is km² for quiz size filtering; `areaLabel` is for a reader.
        const france = build().byName('France');
        expect(france.area).toBe(643801);
        expect(france.areaLabel).toBe('643K km²');
    });
});

describe('iso', () => {
    it('prefers countryToISO, which is what flag art is keyed on', () => {
        expect(build().byName('France').iso).toBe('fr');
    });

    it("falls back to the mesh record for a dependency countryToISO omits", () => {
        // Greenland has no countryToISO entry at all, so without this it got
        // no flag — silently, since the panel simply renders a blank instead.
        expect(build().byName('Greenland').iso).toBe('gl');
    });

    it('is null when neither source knows', () => {
        expect(build().byName('Nowhere').iso).toBe(null);
    });
});

describe('parent', () => {
    it('names the sovereign a territory belongs to', () => {
        expect(build().byName('Greenland')).toMatchObject({
            parent: 'Denmark', isDependency: true,
        });
    });

    it('is null for a sovereign', () => {
        expect(build().byName('France')).toMatchObject({
            parent: null, isDependency: false,
        });
    });

    it('survives a globe with no dependency data at all', () => {
        const table = createCountryTable({
            globeManager: { ...stubGlobe(), getDependencyData: undefined },
            countryToISO: { France: 'fr' },
            countryData: COUNTRY_DATA,
        });
        expect(table.byName('France').parent).toBe(null);
        expect(table.all).toHaveLength(3);
    });
});
