/**
 * Country size categories, used for label sizing and visibility.
 *
 * Curated by eye rather than derived from `area`: the question a label tier
 * answers is "is there room to draw this name on the globe at this zoom", which
 * tracks a country's *shape* as much as its area. Chile and Norway are large by
 * area and hopeless to label; several island nations are legible far smaller
 * than their area suggests. A threshold on `country-meta.json` would get both
 * wrong, so the lists stay hand-maintained.
 *
 * **Every name must be one the globe actually uses**, which is not always the
 * name a person would write: the mesh calls them `USA`, `Democratic Congo` and
 * `Vatican`. All three were spelled out in full here and had silently done
 * nothing for as long as the lists have existed — a tier assignment that matches
 * no country is invisible, because the country simply falls through to medium.
 * `tests/country-sizes.test.js` checks every name against
 * `assets/country-meta.json` so the next one fails loudly instead.
 *
 * Anything absent from both is medium — `LabelManager.createLabels` treats the
 * two sets as the exceptions, not as an exhaustive partition.
 *
 * Extracted from `index.html` so the Astro app can mount labels from the same
 * lists. Two copies would drift silently: the only symptom is a label appearing
 * at the wrong zoom in one app, which nothing tests and nobody reports.
 */

/** @type {ReadonlySet<string>} */
export const LARGE_COUNTRIES = new Set([
    'Russia', 'Canada', 'USA', 'China', 'Brazil', 'Australia',
    'India', 'Argentina', 'Kazakhstan', 'Algeria', 'Democratic Congo',
    'Saudi Arabia', 'Mexico', 'Indonesia', 'Libya', 'Iran', 'Mongolia',
    'Peru', 'Chad', 'Niger', 'Angola', 'Mali', 'South Africa', 'Colombia',
    'Ethiopia', 'Bolivia', 'Mauritania', 'Egypt', 'Tanzania', 'Nigeria',
    'Venezuela', 'Pakistan', 'Mozambique', 'Turkey', 'Chile', 'Zambia',
    'Myanmar', 'Afghanistan', 'Somalia', 'Central African Republic', 'Ukraine',
    'Madagascar', 'Botswana', 'Kenya', 'France', 'Yemen', 'Thailand',
    'Spain', 'Turkmenistan', 'Cameroon', 'Papua New Guinea', 'Sweden',
    'Uzbekistan', 'Morocco', 'Iraq', 'Paraguay', 'Zimbabwe',
]);

/** @type {ReadonlySet<string>} */
export const SMALL_COUNTRIES = new Set([
    'Singapore', 'Bahrain', 'Malta', 'Maldives', 'Barbados',
    'Saint Lucia', 'Antigua And Barbuda', 'Andorra', 'Seychelles',
    'Palau', 'Saint Vincent And The Grenadines', 'Grenada',
    'Saint Kitts And Nevis', 'Marshall Islands', 'Liechtenstein',
    'San Marino', 'Tuvalu', 'Nauru', 'Monaco', 'Vatican',
    'Comoros', 'Mauritius', 'Sao Tome And Principe', 'Dominica',
    'Tonga', 'Kiribati', 'Micronesia', 'Cape Verde', 'Samoa',
]);
