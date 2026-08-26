/**
 * Coordinate utilities — pure, dependency-free geometry.
 *
 * Kept free of THREE so the math is unit-testable in Node. GlobeManager wraps
 * latLngToXYZ() in a THREE.Vector3; see js/core/globe.js.
 *
 * Convention (matches the globe build):
 *   phi   = (90 - lat) * PI/180
 *   theta = -(lng + 180) * PI/180
 *   x = r*sin(phi)*cos(theta), y = r*cos(phi), z = r*sin(phi)*sin(theta)
 * where r = radius + height.
 */

const DEG = Math.PI / 180;

/**
 * Convert latitude/longitude (degrees) to a Cartesian point on a sphere.
 * @param {number} lat
 * @param {number} lng
 * @param {number} [radius=1]
 * @param {number} [height=0]
 * @returns {{x:number, y:number, z:number}}
 */
export function latLngToXYZ(lat, lng, radius = 1, height = 0) {
    const phi = (90 - lat) * DEG;
    const theta = -(lng + 180) * DEG;
    const r = radius + height;
    return {
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.cos(phi),
        z: r * Math.sin(phi) * Math.sin(theta),
    };
}

/**
 * Inverse of latLngToXYZ for points on a sphere of any radius (height assumed 0).
 * Longitude is normalized to (-180, 180].
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {{lat:number, lng:number}}
 */
export function xyzToLatLng(x, y, z) {
    const r = Math.sqrt(x * x + y * y + z * z);
    const lat = 90 - Math.acos(y / r) / DEG;
    const theta = Math.atan2(z, x); // = theta (mod 2pi); sin(phi) >= 0
    let lng = -theta / DEG - 180;
    // Normalize into (-180, 180].
    lng = ((lng + 180) % 360 + 360) % 360 - 180;
    return { lat, lng };
}

/**
 * The unit direction to aim the camera along, given an OPTIONAL lat/lng.
 *
 * `frameGlobe()` documents every field as optional — "show me the whole globe"
 * is a legitimate request that names no point — but `latLngToXYZ(undefined, …)`
 * returns NaN, and a NaN camera position renders an entirely blank canvas with
 * no error, no warning and no way to recover. That combination cost a session:
 * the globe simply vanished on one route and the checks all still passed,
 * because a canvas existed and the ready flag was set.
 *
 * So: use the point when there is one, keep the current direction when there is
 * not, and fall back to a fixed direction if that is unusable too. The result is
 * always a finite unit vector.
 *
 * @param {Object} opts
 * @param {number} [opts.lat]
 * @param {number} [opts.lng]
 * @param {{x:number,y:number,z:number}} [opts.current]  current camera position
 * @returns {{x:number, y:number, z:number}} unit vector, always finite
 */
export function framingDirection({ lat, lng, current } = {}) {
    const named = Number.isFinite(lat) && Number.isFinite(lng);
    const raw = named ? latLngToXYZ(lat, lng, 1, 0) : current;

    const x = Number(raw?.x), y = Number(raw?.y), z = Number(raw?.z);
    const len = Math.hypot(x, y, z);
    // Not finite, or a zero-length vector that cannot be normalised: face the
    // point where the prime meridian meets the equator.
    if (!Number.isFinite(len) || len === 0) return { x: 0, y: 0, z: 1 };
    return { x: x / len, y: y / len, z: z / len };
}
