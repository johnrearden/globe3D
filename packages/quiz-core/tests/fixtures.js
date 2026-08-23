/**
 * Synthetic country table for generator specs.
 *
 * Deliberately synthetic rather than loaded from assets/country-meta.json: the
 * filters need countries that sit at known distances and that each violate
 * exactly one eligibility rule, which real data can't guarantee. Asset shape is
 * already covered by tests/country-meta.test.js.
 *
 * Centroids are unit vectors placed along a great circle so nearest-neighbour
 * ordering is obvious by inspection: `angle` degrees around the equator.
 *
 * Capital names are unrelated to their country names on purpose. A capital
 * that contains its country's name (Alpha / "Alpha City") is self-evident and
 * would be stripped by the capital-quiz filter, silently emptying the pool.
 */

const CAPITALS = {
    Alpha: 'Rome',
    Bravo: 'Cairo',
    Charlie: 'Oslo',
    Delta: 'Lima',
    Echo: 'Kyiv',
    Foxtrot: 'Doha',
    Golf: 'Bern',
    Hotel: 'Riga',
    Dependencia: 'Vaduz',
    Flagless: 'Sofia',
    Selfville: 'Selfville',
    Tinyland: 'Male',
    Mysteria: 'Accra',
    Specktoria: 'Doha',
    Nebulosa: 'Vienna',
    Elsewhere: 'Tokyo'
};

/** The capital city name for a fixture country. */
export const capitalOf = name => CAPITALS[name];

function atAngle(name, degrees, extra = {}) {
    const rad = (degrees * Math.PI) / 180;
    const capitalName = CAPITALS[name];
    return {
        name,
        centroid: [Math.cos(rad), 0, Math.sin(rad)],
        area: 100000,
        iso: name.slice(0, 2).toLowerCase(),
        region: 'Testland',
        capital: capitalName ? { name: capitalName, lat: 0, lng: degrees } : null,
        isDependency: false,
        ...extra
    };
}

/**
 * Eight countries, evenly spaced 10° apart, all fully eligible.
 * Alpha is at 0°, so nearest order is Bravo, Charlie, Delta, …
 */
export const BASE = [
    atAngle('Alpha', 0),
    atAngle('Bravo', 10),
    atAngle('Charlie', 20),
    atAngle('Delta', 30),
    atAngle('Echo', 40),
    atAngle('Foxtrot', 50),
    atAngle('Golf', 60),
    atAngle('Hotel', 70)
];

/**
 * A large dependency — the Greenland case. Excluded by capital, kept by the
 * other three: big enough that "which country is highlighted?" is fair.
 */
export const DEPENDENCY = atAngle('Dependencia', 5, { isDependency: true });

/**
 * A small dependency — the Gibraltar case. Kept by identify-flag (a flag is a
 * flag at any size) but not by name-country, where the player has to pick it
 * out on the globe.
 */
export const MINOR_DEPENDENCY = atAngle('Specktoria', 65, { isDependency: true, area: 6 });

/**
 * A dependency with unknown area. Kept — the lenient reading matches the click
 * filter's treatment of the same field, and the only real record like this
 * (Svalbard) is genuinely large.
 */
export const UNKNOWN_AREA_DEPENDENCY = atAngle('Nebulosa', 75, { isDependency: true, area: null });

/** No ISO code — cannot be a flag answer or a reverse-direction distractor. */
export const NO_FLAG = atAngle('Flagless', 15, { iso: null });

/** No capital entry — cannot appear in the capital quiz. */
export const NO_CAPITAL = atAngle('Capitalless', 25, { capital: null });

/** Capital gives the country away (Monaco/Monaco) — excluded from the capital quiz. */
export const SELF_EVIDENT = atAngle('Selfville', 35);

/** Below the 1628 km² click threshold. */
export const TINY = atAngle('Tinyland', 45, { area: 12 });

/** Unknown area — deliberately KEPT by the click filter. */
export const UNKNOWN_AREA = atAngle('Mysteria', 55, { area: null });

/** A country in a different region, for scope filtering. */
export const OTHER_REGION = atAngle('Elsewhere', 80, { region: 'Otherland' });

/** Everything, for tests that assert a specific country is filtered out. */
export const FULL = [
    ...BASE,
    DEPENDENCY,
    MINOR_DEPENDENCY,
    UNKNOWN_AREA_DEPENDENCY,
    NO_FLAG,
    NO_CAPITAL,
    SELF_EVIDENT,
    TINY,
    UNKNOWN_AREA,
    OTHER_REGION
];

/** Option values present in a generated single-choice payload. */
export const optionValues = result => result.payload.grid.options.map(o => o.value);
