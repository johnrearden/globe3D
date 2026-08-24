#!/usr/bin/env node
/**
 * build-landing.mjs — generate the static "bordering countries" SEO landing
 * pages (/borders/<slug>) from the baked landing/borders-data.json + the
 * landing/border-page.template.html template.
 *
 * Runs BEFORE build-pages.mjs (see package.json `build:pages`). Its output
 * (borders/<slug>/index.html) is then staged into dist/ by build-pages.mjs,
 * which lists 'borders' in its INCLUDE allow-list. Nothing here touches the
 * globe/app runtime.
 *
 * Image-gated: a page is emitted only when img/borders/<slug>.png exists, so we
 * never ship a page with a broken hero / OG share image. Missing images are
 * warned + skipped. Also regenerates sitemap.xml (apex + one URL per page built).
 *
 * Analytics/ads tags are injected only when the corresponding IDs are set in
 * js/data/site-config.js (read here via a small regex — no module import, so the
 * window-touching app graph never loads at build time).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const ORIGIN = 'https://terragotcha.com';

const data = JSON.parse(readFileSync(join(ROOT, 'landing/borders-data.json'), 'utf8'));
const template = readFileSync(join(ROOT, 'landing/border-page.template.html'), 'utf8');

// --- config IDs (regex out of site-config.js; dependency-free) --------------
const cfg = readFileSync(join(ROOT, 'js/data/site-config.js'), 'utf8');
const idOf = (name) => {
    const m = cfg.match(new RegExp(`export const ${name}\\s*=\\s*'([^']*)'`));
    return m ? m[1] : '';
};
const GA_ID = idOf('GA_MEASUREMENT_ID');
const ADS_ID = idOf('ADSENSE_CLIENT_ID');
const ADS_SLOT = idOf('ADSENSE_LANDING_SLOT');
const CMP_ID = idOf('CMP_PUBLISHER_ID');

// EEA + UK + Switzerland — MUST stay in sync with EEA_UK_CH in
// js/features/analytics.js and the CMP message's geo-targeting. Consent Mode
// denies these regions by default (Google's CMP grants per user); the rest of
// the world is granted so analytics flows without a banner.
const EEA_UK_CH = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH'];

// --- helpers ----------------------------------------------------------------
const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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

function analyticsHead() {
    if (!GA_ID && !ADS_ID && !CMP_ID) return '';
    const region = JSON.stringify(EEA_UK_CH);
    // AdSense site-ownership verification account (the ca-pub-… id). Falls back
    // to CMP_ID if the ad client is ever unset again, so verification survives
    // independently of whether ads are switched on.
    const adsenseAccount = ADS_ID || (CMP_ID ? `ca-${CMP_ID}` : '');
    // Region-scoped Consent Mode v2 defaults: EEA/UK/CH denied (the CMP grants),
    // rest of world granted. Google matches the visitor's region by IP. Mirrors
    // js/features/analytics.js initConsentDefaults so the SPA and these landing
    // pages share one consent model.
    const parts = [
        '    <!-- Consent Mode v2 region-scoped defaults (EEA/UK/CH denied, rest granted); Google CMP grants EEA. -->',
        "    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}"
        + `gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',region:${region},wait_for_update:500});`
        + "gtag('consent','default',{ad_storage:'granted',analytics_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'});</script>",
    ];
    if (adsenseAccount) {
        // Site-ownership verification — prepend so it sits high in <head>.
        parts.unshift(`    <meta name="google-adsense-account" content="${adsenseAccount}">`);
    }
    if (GA_ID) {
        parts.push(`    <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>`);
        parts.push(`    <script>gtag('js',new Date());gtag('config','${GA_ID}');</script>`);
    }
    if (ADS_ID) {
        parts.push(`    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADS_ID}" crossorigin="anonymous"></script>`);
    }
    if (CMP_ID) {
        // Google's certified CMP (Funding Choices). Two <script>s in Google's
        // snippet: the loader + the `googlefcPresent` detection iframe (self-heals
        // if <body> isn't parsed yet). Mirrors js/features/consent-cmp.js.
        parts.push(`    <script async src="https://fundingchoicesmessages.google.com/i/${CMP_ID}?ers=1"></script>`);
        parts.push('    <script>(function(){function s(){if(window.frames["googlefcPresent"])return;if(!document.body){setTimeout(s,0);return;}var i=document.createElement("iframe");i.style.cssText="width:0;height:0;border:none;z-index:-1000;left:-1000px;top:-1000px;";i.style.display="none";i.name="googlefcPresent";document.body.appendChild(i);}s();})();</script>');
    }
    return parts.join('\n');
}

function adSection() {
    // Needs BOTH ids: a slot-less <ins> renders as a blank 100px-tall box under
    // an "Advertisement" label (styles.css .lp-ad), which is itself an AdSense
    // policy problem. The <head> loader (analyticsHead) is keyed on ADS_ID alone
    // on purpose — that is what review looks for, and it renders nothing.
    if (!ADS_ID || !ADS_SLOT) return '';
    return `        <section class="lp-ad">
            <div class="lp-ad-label">Advertisement</div>
            <ins class="adsbygoogle" style="display:block"
                 data-ad-client="${ADS_ID}" data-ad-slot="${ADS_SLOT}"
                 data-ad-format="auto" data-full-width-responsive="true"></ins>
            <script>(adsbygoogle=window.adsbygoogle||[]).push({});</script>
        </section>
`;
}

function jsonLd(entry, name, canonical, answerSentence) {
    const obj = {
        '@context': 'https://schema.org',
        '@type': 'Quiz',
        name: `Which countries border ${name}?`,
        url: canonical,
        about: { '@type': 'Country', name },
        educationalUse: 'Geography quiz',
        hasPart: {
            '@type': 'Question',
            name: `Which countries border ${name}?`,
            acceptedAnswer: { '@type': 'Answer', text: answerSentence },
        },
    };
    return JSON.stringify(obj, null, 4);
}

// Inline JSON safely inside <script type="application/json"> (block only the
// </script> breakout by escaping every '<').
const inlineJson = (obj) => JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');

// --- generate ---------------------------------------------------------------
const bordersDir = join(ROOT, 'borders');
rmSync(bordersDir, { recursive: true, force: true });

const built = [];
const skipped = [];

// A slug is buildable iff its hero image exists. Computed up front so related
// links can be gated to pages that will actually be generated (no 404s).
const buildable = new Set(
    data.filter((e) => existsSync(join(ROOT, 'img/borders', `${e.slug}.png`))).map((e) => e.slug),
);

for (const e of data) {
    if (!buildable.has(e.slug)) { skipped.push(e.slug); continue; }

    const name = e.name;
    const canonical = `${ORIGIN}/borders/${e.slug}`;
    const nbrProse = prose(e.neighbours);
    const answerSentence = `${phrase(name)} shares a land border with ${nbrProse}.`;
    const area = fmtArea(e.areaKm2);

    const title = `What countries border ${phrase(name)}? — Map quiz | Terragotcha`;
    const h1 = `Which countries border ${phrase(name)}?`;
    // Visible copy deliberately omits the neighbour COUNT — revealing "8 countries"
    // gives the quiz answer away (see the handoff's critical rule). The count lives
    // only in the hidden SEO answer block + JSON-LD below.
    const areaLabel = area ? `${area} km²` : '';
    const description = truncate(`Which countries border ${phrase(name)}? ${answerSentence} Take the quick map quiz.`);
    const imgAlt = e.imageAlt
        || `Map of ${e.region} with ${name} highlighted and its ${e.borderCount} bordering countries`;

    const answerList = e.neighbours
        .map((n) => `                <li>${esc(n)}</li>`)
        .join('\n');

    // Only link to neighbours whose page is actually being built (no 404s).
    // Hidden by default (is-collapsed) — border-quiz.js reveals it after the
    // quiz is answered, so it doesn't spoil the answers up front. Still in the
    // server-rendered HTML, so the internal links stay crawlable for SEO.
    const related = (e.related || []).filter((r) => buildable.has(r.slug));
    const relatedSection = related.length
        ? `        <nav class="lp-related is-collapsed" aria-label="Related quizzes">
            <h2>More border quizzes</h2>
            <ul>
${related.map((r) => `                <li><a href="/borders/${r.slug}">Countries bordering ${esc(r.name)}</a></li>`).join('\n')}
            </ul>
        </nav>
`
        : '';

    const quizJson = inlineJson({
        name,
        cols: 3,
        options: e.options.map((o) => ({ value: o.value, label: o.label })),
        answer: e.answer,
    });

    const html = template
        .replaceAll('__SLUG__', e.slug)
        .replaceAll('__NAME__', esc(name))
        .replaceAll('__H1__', esc(h1))
        .replaceAll('__TITLE__', esc(title))
        .replaceAll('__DESCRIPTION__', esc(description))
        .replaceAll('__CANONICAL__', canonical)
        .replaceAll('__OG_IMAGE__', `${ORIGIN}/img/borders/${e.slug}.png`)
        .replaceAll('__IMG_ALT__', esc(imgAlt))
        .replaceAll('__REGION__', esc(e.region))
        .replaceAll('__AREA__', esc(areaLabel))
        .replaceAll('__ANSWER_SENTENCE__', esc(answerSentence))
        .replaceAll('__ANSWER_LIST__', answerList)
        .replaceAll('__JSONLD__', jsonLd(e, name, canonical, answerSentence))
        .replaceAll('__ANALYTICS_HEAD__', analyticsHead())
        .replaceAll('__AD_SECTION__', adSection())
        .replaceAll('__RELATED_SECTION__', relatedSection)
        .replaceAll('__QUIZ_JSON__', quizJson);

    const outDir = join(bordersDir, e.slug);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'index.html'), html);
    built.push(e.slug);
}

// --- sitemap ----------------------------------------------------------------
// One generator for the whole site, not one per page type: two would drift, and
// a sitemap that disagrees with itself is worse than a short one. The country
// pages are built by Astro (apps/web) but listed here, from the same
// content/countries.json that build consumes — so a page and its sitemap entry
// cannot exist independently.
let countryPages = [];
try {
    const content = JSON.parse(readFileSync(join(ROOT, 'content', 'countries.json'), 'utf8'));
    countryPages = content.countries.map((c) => c.slug);
} catch (err) {
    // Not fatal: the border pages are still worth a sitemap. But say so, because
    // silently dropping ~200 URLs is exactly the kind of SEO regression nobody
    // notices for a month.
    console.warn(`build-landing — no content/countries.json (${err.code ?? err.message}); ` +
                 `sitemap will omit the country pages.`);
}

const urls = [
    { loc: `${ORIGIN}/`, changefreq: 'weekly', priority: '1.0' },
    // Country pages rank above the border quizzes: they carry the editorial
    // content, and they are the reason this sitemap matters.
    ...countryPages.map((slug) => ({ loc: `${ORIGIN}/country/${slug}`, changefreq: 'monthly', priority: '0.8' })),
    ...built.map((slug) => ({ loc: `${ORIGIN}/borders/${slug}`, changefreq: 'monthly', priority: '0.7' })),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
writeFileSync(join(ROOT, 'sitemap.xml'), sitemap);

console.log(`build-landing — generated ${built.length} page(s): ${built.join(', ') || '(none)'}`);
if (skipped.length) {
    console.warn(`build-landing — skipped ${skipped.length} (no img/borders/<slug>.png): ${skipped.join(', ')}`);
}
console.log(`build-landing — sitemap.xml lists ${urls.length} URL(s) ` +
            `(${countryPages.length} country, ${built.length} borders, 1 apex).`);
