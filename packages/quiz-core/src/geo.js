/**
 * Geometry helpers over the country table.
 *
 * Centroids are unit-sphere Cartesian points. In the vanilla app they arrive as
 * THREE.Vector3 instances and the distance helper called `.dot()` on them
 * (js/features/quiz/quiz-ui.js:26). Here they are plain `[x, y, z]` arrays and
 * the dot product is written out, so this package has no Three.js dependency
 * and runs unchanged in Node, the browser, and React Native.
 */

/**
 * @typedef {object} CountryRecord
 * @property {string} name
 * @property {[number, number, number]} centroid  unit-sphere position
 * @property {number|null} [area]                 land area in km²
 * @property {string|null} [iso]                  ISO 3166-1 alpha-2, lowercase
 * @property {string|null} [region]               quiz region (see country-regions)
 * @property {{name: string, lat: number, lng: number}|null} [capital]
 * @property {boolean} [isDependency]             overseas territory / dependency
 */

/**
 * Great-circle distance in radians between two unit-sphere centroids.
 *
 * Used only for ranking (nearest-neighbour distractors), so the angle is never
 * converted to km — the ordering is identical either way.
 *
 * @param {CountryRecord} a
 * @param {CountryRecord} b
 * @returns {number} radians in [0, π]
 */
export function greatCircleDistance(a, b) {
    const [ax, ay, az] = a.centroid;
    const [bx, by, bz] = b.centroid;
    const dot = ax * bx + ay * by + az * bz;
    // Clamp guards against acos(NaN) when accumulated float error pushes the
    // dot product a hair outside [-1, 1] for coincident or antipodal points.
    return Math.acos(Math.max(-1, Math.min(1, dot)));
}

/**
 * The `count` countries nearest `target`, excluding `target` itself.
 *
 * Ties are broken by the pool's existing order, which is stable for a given
 * country table — so a seeded run is fully reproducible.
 *
 * @param {CountryRecord} target
 * @param {CountryRecord[]} pool
 * @param {number} count
 * @returns {CountryRecord[]}
 */
export function nearestCountries(target, pool, count) {
    return pool
        .filter(c => c.name !== target.name)
        .map(c => ({ country: c, distance: greatCircleDistance(target, c) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, count)
        .map(entry => entry.country);
}
