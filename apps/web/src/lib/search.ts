/**
 * Matching a typed query against country names.
 *
 * Pure, and separate from `SearchBox` for the same reason `quiz/reveal.ts` is
 * separate from `OptionGrid`: these are the two rules the old implementation got
 * wrong, and a rule worth getting right is worth being able to test without a
 * browser.
 *
 * **Diacritics fold.** The mesh names countries `Curaçao`, `Åland` and
 * `São Tomé and Principe`. `js/features/search.js:69` matched on the raw string,
 * so typing "Curacao" or "Aland" found nothing at all — with no feedback
 * distinguishing "no such country" from "you typed it without the accent".
 *
 * **Prefix beats substring.** The old ranking was `.filter().sort()`, i.e.
 * alphabetical, which put *British Indian Ocean Territory* above *India* for
 * "ind". Not merely untidy: Enter with no arrow-key cursor takes the first
 * result, so the ordering decided what pressing Enter did.
 *
 * A linear scan over ~237 names is still the right answer at this size. What
 * changed is that the folded form is computed once by `buildIndex` rather than
 * re-derived for every name on every keystroke.
 */

/** Enough to choose from; more turns a dropdown into a scroll pit. */
export const MAX_RESULTS = 8;

export interface Entry {
    name: string;
    folded: string;
}

/** Lowercase and strip accents, so "Curacao" finds "Curaçao". */
export function fold(s: string): string {
    return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Fold every name once, alphabetically, ready for repeated queries. */
export function buildIndex(names: string[]): Entry[] {
    return names
        .map((name) => ({ name, folded: fold(name) }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Prefix matches first, then substring; alphabetical within each, since the
 * index arrives sorted and both passes preserve that order.
 */
export function rank(entries: Entry[], query: string, limit = MAX_RESULTS): string[] {
    const term = fold(query.trim());
    if (!term) return [];
    const prefix: string[] = [];
    const contains: string[] = [];
    for (const e of entries) {
        const at = e.folded.indexOf(term);
        if (at === 0) prefix.push(e.name);
        else if (at > 0) contains.push(e.name);
    }
    return [...prefix, ...contains].slice(0, limit);
}

/**
 * What Enter should choose.
 *
 * A fully typed name wins over the arrow-key cursor: someone who typed "Chad"
 * and pressed Enter meant Chad, whatever the cursor was resting on. Otherwise
 * the cursor, and otherwise the first result — which is why the ranking above
 * has to be right.
 */
export function resolveEnter(results: string[], query: string, cursor: number): string | null {
    if (!results.length) return null;
    const exact = results.find((n) => fold(n) === fold(query.trim()));
    return exact ?? results[cursor] ?? results[0];
}
