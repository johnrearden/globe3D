/**
 * The apex's content, for the client router.
 *
 * The mirror of `/country/<slug>.json`: navigating back to the apex after boot
 * must not cost a document load, so the panel needs the landing model as data.
 *
 * It cannot simply be imported by the router — `lib/landing.ts` reads
 * `assets/country-meta.json` and `build-landing-facts.mjs` at build time, so
 * importing it from a client island would drag 75 KB of geometry and a Node-only
 * module into the browser bundle.
 *
 * Named for what it serves rather than for where the apex currently lives, so it
 * does not have to move when the page does (`/app` → `/`).
 */
import type { APIRoute } from 'astro';
import { landing } from '../lib/landing';

export const GET: APIRoute = () =>
    new Response(JSON.stringify(landing), {
        headers: { 'Content-Type': 'application/json' },
    });
