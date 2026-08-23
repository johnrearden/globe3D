// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

/**
 * Astro is a BUILD-TIME static generator here, nothing more. The runtime is a
 * plain SPA: navigation after boot is app-owned pushState, so `ClientRouter` is
 * deliberately not enabled — nothing needs `transition:persist` and no island has
 * to survive a document swap.
 *
 * `site` is required for canonical URLs and the sitemap to resolve absolutely.
 */
export default defineConfig({
    site: 'https://terragotcha.com',
    integrations: [react()],
    // Emit /country/france/index.html rather than /country/france.html, so the
    // URL the app pushes and the URL the build serves are the same string.
    // A trailing-slash mismatch is the classic way pushState routing 404s on
    // hard reload.
    build: { format: 'directory' },
    trailingSlash: 'ignore',
});
