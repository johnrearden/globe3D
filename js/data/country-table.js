/**
 * Country table adapter — the bridge between GlobeManager and @terragotcha/quiz-core.
 *
 * quiz-core's generators take a plain, serialisable country table so they can
 * run in Node, the browser and React Native. This module is the one place that
 * knows how to assemble that table out of the globe's runtime structures
 * (centroid list, per-id records, capitals map, dependency map) and the static
 * countryToISO table.
 *
 * It also keeps a name → original-centroid-object lookup. Those objects carry a
 * THREE.Vector3 centroid and are what CameraController.rotateToCountry() and
 * the highlight helpers expect, so modes still hand the real object to the
 * globe while doing all their selection logic on the plain table.
 */

import { COUNTRY_REGIONS } from './country-regions.js';

/**
 * @param {object} deps
 * @param {object} deps.globeManager  loaded GlobeManager
 * @param {Object<string, string>} deps.countryToISO  name → ISO alpha-2
 * @param {Object<string, object>} [deps.countryData]  name → {iso, pop, area, lang}
 * @returns {{all: object[], centroidObj: (name: string) => object|null, byName: (name: string) => object|null}}
 */
/**
 * The three facts the country info panel shows, from whichever source has them.
 * @returns {{population: number|null, areaLabel: string|null, language: string|null}}
 */
function displayFacts(fromData, fromDependency) {
    const src = fromDependency || fromData || {};
    const clean = v => (v === undefined || v === null || v === 'N/A' ? null : v);
    return {
        population: typeof clean(src.pop) === 'number' ? src.pop : null,
        areaLabel: typeof clean(src.area) === 'string' ? src.area : null,
        language: clean(src.lang) || null,
    };
}

export function createCountryTable({ globeManager, countryToISO = {}, countryData = {} }) {
    const centroids = globeManager.getCentroids() || [];
    const capitals = globeManager.getCapitalsData() || {};

    // A "dependency" is any record the globe assets tagged with its own ISO
    // code and sovereign parent (Greenland, Puerto Rico, …). getDependencyData()
    // is the same source the vanilla modes filtered against.
    const dependencies = globeManager.getDependencyData
        ? globeManager.getDependencyData()
        : {};
    const depNames = new Set(Object.keys(dependencies));

    const all = centroids.map(c => {
        const record = globeManager.getCountryByName(c.name);
        const capital = capitals[c.name] || null;
        return {
            name: c.name,
            centroid: [c.centroid.x, c.centroid.y, c.centroid.z],
            area: record && record.area != null ? record.area : null,
            // Flag art is keyed off countryToISO for sovereigns; dependencies
            // are absent from that map and carry their own ISO on the mesh
            // record instead. Both or neither — Greenland has no entry in
            // countryToISO at all, so without the fallback it gets no flag.
            iso: countryToISO[c.name] || (dependencies[c.name] || {}).iso || null,
            region: COUNTRY_REGIONS[c.name] || null,
            capital: capital ? { name: capital.name, lat: capital.lat, lng: capital.lng } : null,
            isDependency: depNames.has(c.name),
            // The sovereign this territory belongs to, for the country info
            // panel's "Territory of" row. Null for sovereigns and for the
            // handful of dependencies the assets do not name a parent for.
            // Read here rather than through GlobeBridge for the usual reason:
            // country data is not a globe concern.
            parent: (dependencies[c.name] && dependencies[c.name].parent) || null,
            // Display facts for the country info panel. The union of two
            // sources, because neither covers everything: `countryData` holds
            // the 210 sovereigns and the mesh holds the dependencies. The
            // vanilla app built the same union by MUTATING the imported
            // countryData at boot (index.html:622); doing it here instead means
            // a module does not quietly change shape depending on who loaded
            // first. Named apart from the numeric `area` above, which is km² for
            // quiz size filtering rather than anything to show a reader.
            ...displayFacts(countryData[c.name], dependencies[c.name])
        };
    });

    const centroidIndex = new Map(centroids.map(c => [c.name, c]));
    const tableIndex = new Map(all.map(c => [c.name, c]));

    return {
        all,
        /** The globe's centroid object (THREE.Vector3 centroid) for camera/highlight calls. */
        centroidObj: name => centroidIndex.get(name) || null,
        /** The plain quiz-core record. */
        byName: name => tableIndex.get(name) || null
    };
}
