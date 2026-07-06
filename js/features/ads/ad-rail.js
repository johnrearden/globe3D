/**
 * Desktop ad side rail (AdSense).
 *
 * A single responsive display unit fixed in the empty left margin, vertically
 * centred, over the dark backdrop — never over the globe sphere, the zoom widget
 * (right edge), the search box, or any button. Built only on wide viewports
 * (matches the `min-width: 1200px` rule in styles.css) so we never request an ad
 * we won't show. Self-contained runtime-DOM module (cf. flag-renderer.js); all
 * styling lives in styles.css under `#ad-rail`.
 */

import { mountAd } from './adsense.js';
import { ADSENSE_RAIL_SLOT } from '../../data/site-config.js';

export class AdRail {
    constructor({ slot = ADSENSE_RAIL_SLOT } = {}) {
        this.slot = slot;
    }

    init() {
        if (document.getElementById('ad-rail')) return;
        // Gate on the same breakpoint the CSS uses, so no ad is requested on the
        // narrow layouts where the rail would be hidden anyway.
        if (!window.matchMedia('(min-width: 1200px)').matches) return;

        const rail = document.createElement('aside');
        rail.id = 'ad-rail';
        rail.setAttribute('aria-hidden', 'true');

        const label = document.createElement('div');
        label.className = 'ad-rail-label';
        label.textContent = 'Advertisement';

        const slotEl = document.createElement('div');
        slotEl.className = 'ad-rail-slot';

        rail.appendChild(label);
        rail.appendChild(slotEl);
        document.body.appendChild(rail);

        mountAd(slotEl, { slot: this.slot, format: 'auto' });
    }
}
