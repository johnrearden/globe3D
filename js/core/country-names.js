/**
 * Resolving a country name to its palette id.
 *
 * The globe knows countries by the exact names baked into `country-meta.json`
 * (`USA`, `Democratic Congo`, `Vatican`); the override files an editor writes
 * (`country-colors.json`, `label-config.json`) and the names a caller passes to
 * `showOnly` / `fadeOthers` / `hideCountry` are hand-typed and drift from them
 * in case and spacing. So the lookup is forgiving — but only in ways that
 * cannot pick the WRONG country.
 *
 * The old lookup (`_lookupIdLoose`, Stage 5 item 1) fell back to a symmetric
 * substring match in iteration order, so `niger` resolved to whichever of
 * Niger and Nigeria the metadata listed first, and nine real names — Congo,
 * Dominica, Georgia, Guinea, Mali, Niger, Oman, Samoa, Sudan — are substrings
 * of another. Nothing warned; the wrong country was recoloured or hidden.
 *
 * Three stages, each strictly narrower than a substring:
 *   1. the exact key;
 *   2. the same name normalised — case, whitespace, punctuation and diacritics
 *      folded away, so `Usa`, `democratic congo` and `Côte d'Ivoire` resolve;
 *   3. a normalised PREFIX, but only when exactly one country has it — `Liecht`
 *      is Liechtenstein, `Guin` (Guinea, Guinea-Bissau, Equatorial Guinea…) is
 *      nothing rather than a guess.
 * A name that is itself a whole country — `Niger`, `Dominica`, `Guinea` — is
 * settled at stage 1 or 2 before a longer name can be considered.
 */

/** Fold case, whitespace, punctuation and diacritics: `Côte d'Ivoire` → `cotedivoire`. */
export function normalizeCountryName(name) {
    return String(name)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

/**
 * @param {Record<string, number>} nameToId  canonical name → palette id
 * @param {string} name
 * @returns {number | undefined}
 */
export function lookupCountryId(nameToId, name) {
    if (name == null) return undefined;
    if (nameToId[name] !== undefined) return nameToId[name];

    const target = normalizeCountryName(name);
    if (!target) return undefined;

    let prefixHit;
    let prefixHits = 0;
    for (const canonical in nameToId) {
        const c = normalizeCountryName(canonical);
        if (c === target) return nameToId[canonical];
        if (c.startsWith(target)) {
            prefixHits++;
            prefixHit = nameToId[canonical];
        }
    }
    return prefixHits === 1 ? prefixHit : undefined;
}
