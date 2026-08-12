/**
 * Deterministic RNG + unbiased selection helpers.
 *
 * Question generation takes an injected RNG so a seeded run is reproducible:
 * tests can assert exact question sequences, and the daily challenge's
 * date-derived seed has a client-side equivalent if it's ever needed.
 *
 * The default export `systemRng` is the non-deterministic one for real play.
 */

/**
 * mulberry32 — small, fast, well-distributed 32-bit PRNG. Chosen over a
 * hand-rolled LCG because the low bits of an LCG are notoriously poor, and
 * shuffling reads exactly those bits.
 *
 * @param {number} seed
 * @returns {() => number} function returning a float in [0, 1)
 */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Non-deterministic RNG for real play. */
export const systemRng = () => Math.random();

/**
 * Uniform integer in [0, n).
 *
 * @param {() => number} rng
 * @param {number} n
 * @returns {number}
 */
export function randomInt(rng, n) {
    return Math.floor(rng() * n);
}

/**
 * Uniformly random element, or undefined for an empty array.
 *
 * @template T
 * @param {() => number} rng
 * @param {T[]} items
 * @returns {T | undefined}
 */
export function pick(rng, items) {
    if (!items.length) return undefined;
    return items[randomInt(rng, items.length)];
}

/**
 * Fisher-Yates shuffle, returning a new array.
 *
 * Replaces the `arr.sort(() => Math.random() - 0.5)` idiom used across the
 * vanilla quiz modes (e.g. name-flag-quiz.js:216). That comparator is not a
 * valid ordering — it's inconsistent between calls — so the resulting
 * permutation is measurably biased and engine-dependent. For a 6-option
 * question that meant the correct answer landed in some slots more often than
 * others, which is exactly the kind of tell a quiz must not have.
 *
 * @template T
 * @param {() => number} rng
 * @param {T[]} items
 * @returns {T[]}
 */
export function shuffle(rng, items) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = randomInt(rng, i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/**
 * `count` distinct random elements, without mutating the input. Returns fewer
 * than requested when the pool is too small — callers that require an exact
 * count must check the length.
 *
 * @template T
 * @param {() => number} rng
 * @param {T[]} items
 * @param {number} count
 * @returns {T[]}
 */
export function sample(rng, items, count) {
    if (count >= items.length) return shuffle(rng, items);
    return shuffle(rng, items).slice(0, count);
}
