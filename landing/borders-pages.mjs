/**
 * The borders pages' publish gate and page model — the one place that decides
 * WHICH `/borders/<slug>` pages exist and WHAT each one says.
 *
 * Two consumers, on purpose: the Astro page (`apps/web/src/pages/borders/
 * [slug].astro`) builds one route per entry `publishedBorderPages()` returns,
 * and `build-sitemap.mjs` lists the same entries. Reading the gate from one
 * function is what stops a page and its sitemap entry from existing
 * independently — the rule the sitemap already keeps for the country pages by
 * reading the same `content/countries.json` the build consumes.
 *
 * The gate itself: a page ships only if `img/borders/<slug>.png` exists, so no
 * page ever goes out with a broken hero or share image. An entry without one is
 * reported, not silently dropped — a missing page is an SEO regression nobody
 * notices for a month.
 *
 * Build-time only, like `build-landing-facts.mjs`: reached from `.astro`
 * frontmatter, from `build-sitemap.mjs` and from vitest, never from a client
 * bundle. It locates NOTHING on disk itself — the caller hands it the image
 * list — because under Vite this module is bundled into the server entry and
 * `import.meta.url` there points into the build output, not the repo. The
 * first build done the other way found no images and emitted no pages, with
 * the build green. The Astro page uses `import.meta.glob`; the sitemap script
 * uses `imageSlugs()` below.
 */
import { readdirSync } from 'node:fs';
import data from './borders-data.json' with { type: 'json' };

export const ORIGIN = 'https://terragotcha.com';

/** The slugs with a hero image, from the file names in `img/borders`. */
export function imageSlugs(paths) {
    return new Set(paths.map((p) => p.match(/([^/\\]+)\.png$/)?.[1]).filter(Boolean));
}

/** Node: the same set read from the directory. */
export function imageSlugsIn(dir) {
    return imageSlugs(readdirSync(dir));
}

/**
 * Every entry with a hero image, in data order, plus the slugs that were held
 * back. `images` is the set from `imageSlugs()`; a parameter so the gate can be
 * tested against any set.
 */
export function publishedBorderPages({ entries = data, images }) {
    if (!(images instanceof Set)) throw new TypeError('publishedBorderPages: pass the image slug set');
    const published = [];
    const skipped = [];
    for (const entry of entries) {
        (images.has(entry.slug) ? published : skipped).push(entry);
    }
    return { published, skipped: skipped.map((e) => e.slug) };
}

// A handful of names read better with a leading article in running prose.
const ARTICLED = { USA: 'the USA', Netherlands: 'the Netherlands' };
const phrase = (name) => ARTICLED[name] || name;

const fmtArea = (km2) => (km2 ? Math.round(km2).toLocaleString('en-US') : null);

function prose(list) {
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} and ${list[1]}`;
    return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

function truncate(s, max = 155) {
    if (s.length <= max) return s;
    return s.slice(0, max - 1).replace(/[\s,;]+\S*$/, '') + '…';
}

/**
 * Everything the page renders for one entry, as plain strings and lists. The
 * page template does no string building of its own, so the copy can be
 * unit-tested here without Astro.
 *
 * Two rules from the original handoff are kept here because they are easy to
 * lose in a template: the VISIBLE copy never states the neighbour count (it
 * would give the quiz away — the count lives only in the hidden answer block
 * and the JSON-LD), and related links go only to pages that are published, so
 * a page never links to a 404.
 *
 * @param {object} entry            a `borders-data.json` record
 * @param {Set<string>} published   slugs that will have a page
 */
export function borderPageModel(entry, published) {
    const name = entry.name;
    const canonicalPath = `/borders/${entry.slug}`;
    const canonical = `${ORIGIN}${canonicalPath}`;
    const answerSentence = `${phrase(name)} shares a land border with ${prose(entry.neighbours)}.`;
    const area = fmtArea(entry.areaKm2);
    const h1 = `Which countries border ${phrase(name)}?`;
    return {
        slug: entry.slug,
        name,
        region: entry.region,
        canonicalPath,
        title: `What countries border ${phrase(name)}? — Map quiz | Terragotcha`,
        h1,
        description: truncate(`${h1} ${answerSentence} Take the quick map quiz.`),
        areaLabel: area ? `${area} km²` : '',
        imagePath: `/img/borders/${entry.slug}.png`,
        imageAlt: entry.imageAlt
            || `Map of ${entry.region} with ${name} highlighted and its ${entry.borderCount} bordering countries`,
        neighbours: entry.neighbours,
        answerSentence,
        related: (entry.related || []).filter((r) => published.has(r.slug)),
        quiz: {
            name,
            cols: 3,
            options: entry.options.map((o) => ({ value: o.value, label: o.label })),
            answer: entry.answer,
        },
        jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'Quiz',
            name: h1,
            url: canonical,
            about: { '@type': 'Country', name },
            educationalUse: 'Geography quiz',
            hasPart: {
                '@type': 'Question',
                name: h1,
                acceptedAnswer: { '@type': 'Answer', text: answerSentence },
            },
        },
    };
}

/**
 * JSON for an inline `<script type="application/json">`: the only breakout is
 * `</script>`, so escaping every `<` closes it.
 */
export const inlineJson = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');
