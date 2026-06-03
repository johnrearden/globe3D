/**
 * Curated dependency / overseas-territory table (build-time only).
 *
 * world-geojson folds every dependency into its sovereign parent's file (e.g.
 * denmark.json contains all of Greenland). This table lets build-textures.js
 * peel a dependency's rings back out into their own country ID, so it gets its
 * own name, flag, colour, centroid and focus zoom on the globe.
 *
 * The cut line is principled: a landmass is split out only if it has its own
 * ISO 3166-1 code / flag (served by flagcdn). That keeps archipelago NATIONS
 * whole (Indonesia, Philippines) and automatically leaves code-less integral
 * regions with their parent (Spain's Canaries, Portugal's Azores & Madeira).
 *
 * Routing is by ring centroid: a ring of `parentFile` whose centroid falls in
 * ANY of a dependency's `bboxes` is reassigned to that dependency; otherwise it
 * stays with the parent. Because matching is scoped to the parent's own rings,
 * bboxes that overlap in absolute coordinates across DIFFERENT parents (e.g.
 * US Virgin Islands vs British Virgin Islands) never conflict.
 *
 * Not separable, deliberately omitted: Hong Kong & Macau are contiguous with
 * the Chinese mainland (a single ring), so there is no distinct geometry to
 * peel out. Most uninhabited sub-pixel specks are also skipped; an unmatched
 * ring simply stays with its parent, which is harmless.
 *
 * bbox fields are [minLng, maxLng, minLat, maxLat].
 */

function bb(minLng, maxLng, minLat, maxLat) {
    return { minLng, maxLng, minLat, maxLat };
}

const DEPENDENCIES = [
    // ── Denmark ──────────────────────────────────────────────────────────
    { name: 'Greenland', iso: 'gl', parentFile: 'denmark', parentName: 'Denmark',
      info: { pop: 0.06, area: '2.17M km²', lang: 'Greenlandic, Danish' },
      bboxes: [bb(-74, -10, 59, 84)] },
    { name: 'Faroe Islands', iso: 'fo', parentFile: 'denmark', parentName: 'Denmark',
      info: { pop: 0.05, area: '1.4K km²', lang: 'Faroese, Danish' },
      bboxes: [bb(-7.8, -6.0, 61.3, 62.5)] },

    // ── Netherlands ──────────────────────────────────────────────────────
    { name: 'Aruba', iso: 'aw', parentFile: 'netherlands', parentName: 'Netherlands',
      info: { pop: 0.11, area: '180 km²', lang: 'Dutch, Papiamento' },
      bboxes: [bb(-70.2, -69.8, 12.3, 12.8)] },
    { name: 'Curaçao', iso: 'cw', parentFile: 'netherlands', parentName: 'Netherlands',
      info: { pop: 0.15, area: '444 km²', lang: 'Dutch, Papiamento' },
      bboxes: [bb(-69.3, -68.6, 11.9, 12.5)] },

    // ── France ───────────────────────────────────────────────────────────
    { name: 'French Guiana', iso: 'gf', parentFile: 'france', parentName: 'France',
      info: { pop: 0.3, area: '84K km²', lang: 'French' },
      bboxes: [bb(-54.8, -51.4, 2.0, 6.0)] },
    { name: 'Guadeloupe', iso: 'gp', parentFile: 'france', parentName: 'France',
      info: { pop: 0.4, area: '1.6K km²', lang: 'French' },
      bboxes: [bb(-61.85, -61.0, 15.8, 16.6)] },
    { name: 'Martinique', iso: 'mq', parentFile: 'france', parentName: 'France',
      info: { pop: 0.37, area: '1.1K km²', lang: 'French' },
      bboxes: [bb(-61.25, -60.78, 14.35, 14.95)] },
    { name: 'Réunion', iso: 're', parentFile: 'france', parentName: 'France',
      info: { pop: 0.87, area: '2.5K km²', lang: 'French' },
      bboxes: [bb(55.15, 55.9, -21.45, -20.8)] },
    { name: 'Mayotte', iso: 'yt', parentFile: 'france', parentName: 'France',
      info: { pop: 0.3, area: '374 km²', lang: 'French' },
      bboxes: [bb(44.95, 45.35, -13.05, -12.6)] },
    { name: 'New Caledonia', iso: 'nc', parentFile: 'france', parentName: 'France',
      info: { pop: 0.27, area: '18.6K km²', lang: 'French' },
      bboxes: [bb(163.5, 168.3, -22.9, -18.4)] },
    { name: 'French Polynesia', iso: 'pf', parentFile: 'france', parentName: 'France',
      info: { pop: 0.28, area: '4.2K km²', lang: 'French, Tahitian' },
      bboxes: [bb(-155, -134, -28.2, -7.5)] },
    { name: 'Saint Pierre and Miquelon', iso: 'pm', parentFile: 'france', parentName: 'France',
      info: { pop: 0.006, area: '242 km²', lang: 'French' },
      bboxes: [bb(-56.55, -56.05, 46.7, 47.25)] },
    { name: 'Wallis and Futuna', iso: 'wf', parentFile: 'france', parentName: 'France',
      info: { pop: 0.011, area: '142 km²', lang: 'French' },
      bboxes: [bb(-178.3, -177.9, -14.5, -14.1)] },
    { name: 'Saint Barthélemy', iso: 'bl', parentFile: 'france', parentName: 'France',
      info: { pop: 0.01, area: '25 km²', lang: 'French' },
      bboxes: [bb(-62.92, -62.75, 17.86, 17.96)] },
    { name: 'French Southern Territories', iso: 'tf', parentFile: 'france', parentName: 'France',
      info: { pop: 'N/A', area: '7.7K km²', lang: 'French' },
      bboxes: [bb(68.4, 70.8, -49.9, -48.4), bb(50.0, 52.5, -46.7, -45.7), bb(77.3, 77.8, -38.9, -37.6)] },

    // ── United States ────────────────────────────────────────────────────
    { name: 'Puerto Rico', iso: 'pr', parentFile: 'usa', parentName: 'United States',
      info: { pop: 3.2, area: '9K km²', lang: 'Spanish, English' },
      bboxes: [bb(-67.4, -65.15, 17.8, 18.6)] },
    { name: 'United States Virgin Islands', iso: 'vi', parentFile: 'usa', parentName: 'United States',
      info: { pop: 0.09, area: '347 km²', lang: 'English' },
      bboxes: [bb(-65.1, -64.5, 17.6, 18.45)] },
    { name: 'Guam', iso: 'gu', parentFile: 'usa', parentName: 'United States',
      info: { pop: 0.17, area: '540 km²', lang: 'English, Chamorro' },
      bboxes: [bb(144.5, 145.05, 13.1, 13.75)] },
    { name: 'Northern Mariana Islands', iso: 'mp', parentFile: 'usa', parentName: 'United States',
      info: { pop: 0.05, area: '464 km²', lang: 'English, Chamorro' },
      bboxes: [bb(145.05, 146.2, 13.9, 20.7)] },
    { name: 'American Samoa', iso: 'as', parentFile: 'usa', parentName: 'United States',
      info: { pop: 0.05, area: '199 km²', lang: 'English, Samoan' },
      bboxes: [bb(-171.2, -168.0, -14.6, -10.9)] },

    // ── Norway ───────────────────────────────────────────────────────────
    { name: 'Svalbard', iso: 'sj', parentFile: 'norway', parentName: 'Norway',
      info: { pop: 0.003, area: '61K km²', lang: 'Norwegian' },
      bboxes: [bb(8, 35, 74, 81.5)] },

    // ── Finland ──────────────────────────────────────────────────────────
    { name: 'Åland Islands', iso: 'ax', parentFile: 'finland', parentName: 'Finland',
      info: { pop: 0.03, area: '1.5K km²', lang: 'Swedish' },
      bboxes: [bb(19.3, 20.45, 59.7, 60.55)] },

    // ── United Kingdom ───────────────────────────────────────────────────
    { name: 'Falkland Islands', iso: 'fk', parentFile: 'united_kingdom', parentName: 'United Kingdom',
      info: { pop: 0.003, area: '12K km²', lang: 'English' },
      bboxes: [bb(-61.8, -57.5, -53.0, -50.8)] },
    { name: 'S. Georgia & S. Sandwich Is.', iso: 'gs', parentFile: 'united_kingdom', parentName: 'United Kingdom',
      info: { pop: 'N/A', area: '3.9K km²', lang: 'English' },
      bboxes: [bb(-38.5, -35.5, -55.1, -53.7), bb(-28.3, -26.0, -59.7, -56.1)] },
    { name: 'Turks and Caicos Islands', iso: 'tc', parentFile: 'united_kingdom', parentName: 'United Kingdom',
      info: { pop: 0.05, area: '948 km²', lang: 'English' },
      bboxes: [bb(-72.7, -71.0, 21.1, 22.1)] },
    { name: 'British Virgin Islands', iso: 'vg', parentFile: 'united_kingdom', parentName: 'United Kingdom',
      info: { pop: 0.03, area: '151 km²', lang: 'English' },
      bboxes: [bb(-64.85, -64.2, 18.25, 18.85)] },
    { name: 'Anguilla', iso: 'ai', parentFile: 'united_kingdom', parentName: 'United Kingdom',
      info: { pop: 0.015, area: '91 km²', lang: 'English' },
      bboxes: [bb(-63.25, -62.9, 18.1, 18.35)] },
    { name: 'Montserrat', iso: 'ms', parentFile: 'united_kingdom', parentName: 'United Kingdom',
      info: { pop: 0.005, area: '102 km²', lang: 'English' },
      bboxes: [bb(-62.35, -62.05, 16.6, 16.9)] },
    { name: 'Cayman Islands', iso: 'ky', parentFile: 'united_kingdom', parentName: 'United Kingdom',
      info: { pop: 0.07, area: '264 km²', lang: 'English' },
      bboxes: [bb(-81.5, -79.6, 19.2, 19.85)] },
    { name: 'Bermuda', iso: 'bm', parentFile: 'united_kingdom', parentName: 'United Kingdom',
      info: { pop: 0.06, area: '54 km²', lang: 'English' },
      bboxes: [bb(-64.95, -64.6, 32.2, 32.45)] },
    { name: 'Jersey', iso: 'je', parentFile: 'united_kingdom', parentName: 'United Kingdom',
      info: { pop: 0.1, area: '116 km²', lang: 'English, French' },
      bboxes: [bb(-2.35, -2.0, 49.1, 49.3)] },
    { name: 'Guernsey', iso: 'gg', parentFile: 'united_kingdom', parentName: 'United Kingdom',
      info: { pop: 0.06, area: '78 km²', lang: 'English, French' },
      bboxes: [bb(-2.72, -2.5, 49.4, 49.55)] },
    { name: 'Isle of Man', iso: 'im', parentFile: 'united_kingdom', parentName: 'United Kingdom',
      info: { pop: 0.08, area: '572 km²', lang: 'English, Manx' },
      bboxes: [bb(-4.9, -4.3, 54.0, 54.45)] },
    { name: 'Gibraltar', iso: 'gi', parentFile: 'united_kingdom', parentName: 'United Kingdom',
      info: { pop: 0.03, area: '6.8 km²', lang: 'English' },
      bboxes: [bb(-5.4, -5.3, 36.0, 36.25)] },
    { name: 'Saint Helena', iso: 'sh', parentFile: 'united_kingdom', parentName: 'United Kingdom',
      info: { pop: 0.005, area: '394 km²', lang: 'English' },
      bboxes: [bb(-5.85, -5.6, -16.05, -15.85), bb(-14.45, -14.25, -8.05, -7.85), bb(-12.8, -9.7, -40.5, -36.9)] },
    { name: 'Pitcairn Islands', iso: 'pn', parentFile: 'united_kingdom', parentName: 'United Kingdom',
      info: { pop: 0.00005, area: '47 km²', lang: 'English' },
      bboxes: [bb(-130.9, -124.7, -25.2, -23.8)] },

    // ── Australia ────────────────────────────────────────────────────────
    { name: 'Norfolk Island', iso: 'nf', parentFile: 'australia', parentName: 'Australia',
      info: { pop: 0.002, area: '35 km²', lang: 'English' },
      bboxes: [bb(167.8, 168.1, -29.2, -28.9)] },

    // ── New Zealand ──────────────────────────────────────────────────────
    { name: 'Tokelau', iso: 'tk', parentFile: 'new_zealand', parentName: 'New Zealand',
      info: { pop: 0.0015, area: '12 km²', lang: 'Tokelauan, English' },
      bboxes: [bb(-172.6, -171.0, -9.5, -8.4)] },
];

function pointInBboxes(lng, lat, bboxes) {
    for (const b of bboxes) {
        if (lng >= b.minLng && lng <= b.maxLng && lat >= b.minLat && lat <= b.maxLat) return true;
    }
    return false;
}

module.exports = { DEPENDENCIES, pointInBboxes };
