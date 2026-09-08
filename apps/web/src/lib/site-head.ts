/**
 * The third-party head, built at build time from `js/data/site-config.js`.
 *
 * The vanilla apex carried these tags by hand in `index.html`, and
 * `build-landing.mjs` generates them into every `/borders/<slug>` page from the
 * same config. This is the third consumer of that config and deliberately not a
 * third copy of the ids: `site-config.js` is imported, so an id changed there
 * changes here.
 *
 * ## What has to be in the raw HTML, and why
 *
 * `index.html`'s comment on its loader tag is the whole rule: **the AdSense
 * loader must sit in the raw HTML.** Injecting it from JS once hid it behind a
 * WebGL try/catch and a 6-second deferral, so a non-executing crawler saw no ad
 * code at all — which is the class of failure the site was rejected for. The
 * same goes for the verification meta, the consent defaults (which must precede
 * every tag) and the GA loader. All of them are static here.
 *
 * ## Production only
 *
 * Emitted only by a production build (`import.meta.env.PROD`), so `astro dev`
 * never sends a hit and never shows a banner. That is the same effect the
 * vanilla modules got from `isProdHost()` at runtime, moved to build time
 * because the tags are static now. A `build:local` preview therefore does carry
 * them — exactly as a previewed `/borders/*` page already does.
 *
 * ## Consent before tags
 *
 * The first script on the page emits Consent Mode v2 defaults: denied for the
 * regions in `CONSENT_REGIONS`, granted elsewhere, before `gtag.js` or
 * `adsbygoogle.js` can load. Google's CMP (Funding Choices) then grants per
 * user in those regions. Mirrors `js/features/analytics.js`
 * `initConsentDefaults` to the letter; the region list is the same import.
 */
import {
    ADSENSE_CLIENT_ID, CMP_PUBLISHER_ID, CONSENT_REGIONS, GA_MEASUREMENT_ID,
} from '../../../../js/data/site-config.js';

export interface ProductionHead {
    /** The `google-adsense-account` verification id, or ''. */
    adsenseAccount: string;
    /** Inline: Consent Mode v2 defaults. First script on the page. */
    consent: string;
    gaId: string;
    /** Inline: `gtag('js'…); gtag('config'…)`, after the gtag loader. */
    gaConfig: string;
    adsId: string;
    cmpId: string;
    /** Inline: the `googlefcPresent` iframe Google's CMP detects itself by. */
    fcPresent: string;
}

/** Google's own snippet, verbatim in effect: retries until <body> exists. */
const FC_PRESENT = '(function(){function s(){if(window.frames["googlefcPresent"])return;'
    + 'if(!document.body){setTimeout(s,0);return;}var i=document.createElement("iframe");'
    + 'i.style.cssText="width:0;height:0;border:none;z-index:-1000;left:-1000px;top:-1000px;";'
    + 'i.style.display="none";i.name="googlefcPresent";document.body.appendChild(i);}s();})();';

/**
 * @param prod  whether this is a production build. A parameter so the test can
 *   exercise both answers; callers pass `import.meta.env.PROD`.
 */
export function productionHead(prod: boolean): ProductionHead {
    const none: ProductionHead = {
        adsenseAccount: '', consent: '', gaId: '', gaConfig: '', adsId: '', cmpId: '', fcPresent: '',
    };
    if (!prod) return none;
    const region = JSON.stringify(CONSENT_REGIONS);
    return {
        // Verification survives independently of whether ads are switched on.
        adsenseAccount: ADSENSE_CLIENT_ID || (CMP_PUBLISHER_ID ? `ca-${CMP_PUBLISHER_ID}` : ''),
        consent: 'window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}'
            + `gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',`
            + `ad_user_data:'denied',ad_personalization:'denied',region:${region},wait_for_update:500});`
            + `gtag('consent','default',{ad_storage:'granted',analytics_storage:'granted',`
            + `ad_user_data:'granted',ad_personalization:'granted'});`,
        gaId: GA_MEASUREMENT_ID,
        gaConfig: GA_MEASUREMENT_ID
            ? `gtag('js',new Date());gtag('config','${GA_MEASUREMENT_ID}');` : '',
        adsId: ADSENSE_CLIENT_ID,
        cmpId: CMP_PUBLISHER_ID,
        fcPresent: CMP_PUBLISHER_ID ? FC_PRESENT : '',
    };
}
