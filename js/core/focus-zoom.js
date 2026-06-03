/**
 * Focus Zoom Module
 *
 * Classifies every country into one of 8 named focus levels (A–H) by the
 * horizontal width of its bounding box, and maps each level to a camera
 * distance. The chosen distance is used as the universal "focus zoom" for
 * clicking, searching, and the name-the-country quiz, and it ALSO doubles as
 * the country label's appearance threshold (a label is visible at its focus
 * zoom and every closer zoom — see js/core/labels.js updateVisibility).
 *
 * Manual reclassification is layered on top via overrides (a {name: 'E'} map,
 * persisted to country-zoom.json by the in-app Edit Zoom editor).
 */

// Camera distance for each level.
export const LEVEL_DISTANCES = {
    A: 1.14,
    B: 1.18,
    C: 1.28,
    D: 1.36,
    E: 1.55,
    F: 1.84,
    G: 1.94,
    H: 2.43
};

export const LEVELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// The example country that anchors each level (names match assets/country-meta.json).
export const EXAMPLE_COUNTRIES = {
    A: 'Liechtenstein',
    B: 'Montenegro',
    C: 'Romania',
    D: 'Ukraine',
    E: 'India',
    F: 'USA',
    G: 'China',
    H: 'Russia'
};

// Fallback boundaries (geometric midpoints of the example widths) used if an
// example country can't be found in the data. Upper edge of levels A..G.
const FALLBACK_BOUNDARIES = [0.0096, 0.0621, 0.1728, 0.3391, 0.6587, 0.9003, 1.1481];

const DEFAULT_LEVEL = 'C';

/**
 * Project a lat/lng (degrees) onto the unit sphere. Matches the equirectangular
 * convention used elsewhere in the project (rotateGlobe_latLngToVec3).
 */
function latLngToVec3(lat, lng) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = -(lng + 180) * Math.PI / 180;
    return [
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
    ];
}

/**
 * Horizontal extent of a country's bbox once projected to the unit sphere:
 * max(Δx, Δz) over the four bbox corners. This is the "width" the levels are
 * classified by.
 * @param {{minLat,maxLat,minLng,maxLng}} bbox
 * @returns {number}
 */
export function bboxWidth(bbox) {
    if (!bbox) return 0;
    const corners = [
        latLngToVec3(bbox.minLat, bbox.minLng),
        latLngToVec3(bbox.minLat, bbox.maxLng),
        latLngToVec3(bbox.maxLat, bbox.minLng),
        latLngToVec3(bbox.maxLat, bbox.maxLng)
    ];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const v of corners) {
        if (v[0] < minX) minX = v[0];
        if (v[0] > maxX) maxX = v[0];
        if (v[2] < minZ) minZ = v[2];
        if (v[2] > maxZ) maxZ = v[2];
    }
    return Math.max(maxX - minX, maxZ - minZ);
}

/**
 * Compute the 7 bucket boundaries (upper edge of A..G) as geometric midpoints
 * between consecutive example-country widths. Self-maintaining if the assets
 * are rebuilt. Falls back to FALLBACK_BOUNDARIES if any example is missing.
 * @param {Array<{name, bbox}>} records
 * @returns {number[]}
 */
export function computeBoundaries(records) {
    const widthByName = new Map();
    for (const r of records) widthByName.set(r.name, bboxWidth(r.bbox));

    const exampleWidths = [];
    for (const lvl of LEVELS) {
        const w = widthByName.get(EXAMPLE_COUNTRIES[lvl]);
        if (w === undefined || !(w > 0)) {
            console.warn(`focus-zoom: example country "${EXAMPLE_COUNTRIES[lvl]}" (level ${lvl}) not found; using fallback boundaries`);
            return FALLBACK_BOUNDARIES.slice();
        }
        exampleWidths.push(w);
    }

    const boundaries = [];
    for (let i = 0; i < exampleWidths.length - 1; i++) {
        boundaries.push(Math.sqrt(exampleWidths[i] * exampleWidths[i + 1]));
    }
    return boundaries;
}

/**
 * Registry of per-country focus levels. Build once from country records, then
 * layer manual overrides on top.
 */
export class FocusZoomRegistry {
    constructor() {
        this.levelByName = new Map();
        this.boundaries = FALLBACK_BOUNDARIES.slice();
        this.overrides = {};
    }

    /**
     * Classify all countries from their bboxes.
     * @param {Array<{name, bbox}>} records
     */
    buildFromCountries(records) {
        this.boundaries = computeBoundaries(records);
        this.levelByName.clear();
        for (const r of records) {
            this.levelByName.set(r.name, this._classify(bboxWidth(r.bbox)));
        }
        // Re-apply any overrides that were loaded before the build.
        this.applyOverrides(this.overrides);
    }

    _classify(width) {
        for (let i = 0; i < this.boundaries.length; i++) {
            if (width < this.boundaries[i]) return LEVELS[i];
        }
        return 'H';
    }

    /**
     * Merge a {countryName: 'E'} override map. Only valid level letters are kept.
     * Stored so getOverrides() / Save persists just the manual diffs.
     * @param {Object} obj
     */
    applyOverrides(obj) {
        if (!obj) return;
        for (const name in obj) {
            const lvl = obj[name];
            if (!LEVEL_DISTANCES[lvl]) continue;
            this.levelByName.set(name, lvl);
            this.overrides[name] = lvl;
        }
    }

    /**
     * Manually set a single country's level (records it as an override).
     */
    setLevel(name, level) {
        if (!LEVEL_DISTANCES[level]) return;
        this.levelByName.set(name, level);
        this.overrides[name] = level;
    }

    levelOf(name) {
        return this.levelByName.get(name) || DEFAULT_LEVEL;
    }

    distanceOf(name) {
        return LEVEL_DISTANCES[this.levelOf(name)];
    }

    getOverrides() {
        return this.overrides;
    }
}
