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
 * @returns {{all: object[], centroidObj: (name: string) => object|null, byName: (name: string) => object|null}}
 */
export function createCountryTable({ globeManager, countryToISO = {} }) {
    const centroids = globeManager.getCentroids() || [];
    const capitals = globeManager.getCapitalsData() || {};

    // A "dependency" is any record the globe assets tagged with its own ISO
    // code and sovereign parent (Greenland, Puerto Rico, …). getDependencyData()
    // is the same source the vanilla modes filtered against.
    const depNames = new Set(Object.keys(
        globeManager.getDependencyData ? globeManager.getDependencyData() : {}
    ));

    const all = centroids.map(c => {
        const record = globeManager.getCountryByName(c.name);
        const capital = capitals[c.name] || null;
        return {
            name: c.name,
            centroid: [c.centroid.x, c.centroid.y, c.centroid.z],
            area: record && record.area != null ? record.area : null,
            // Flag art is keyed off countryToISO, not the record's `iso` field —
            // that one is only populated for dependencies.
            iso: countryToISO[c.name] || null,
            region: COUNTRY_REGIONS[c.name] || null,
            capital: capital ? { name: capital.name, lat: capital.lat, lng: capital.lng } : null,
            isDependency: depNames.has(c.name)
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
