/**
 * Per-country JSON, emitted alongside each static page.
 *
 * This is what a pushState navigation fetches: the panel needs the new
 * country's content without a document load, and re-fetching the whole page's
 * HTML to scrape it would defeat the point of keeping the globe alive.
 *
 * One file per country rather than one bundle of all of them — the bundle grows
 * with every country published, and a visitor reads a handful.
 */
import type { APIRoute } from 'astro';
import { countries } from '../../lib/content';

export function getStaticPaths() {
    return countries.map((country) => ({
        params: { slug: country.slug },
        props: { country },
    }));
}

export const GET: APIRoute = ({ props }) =>
    new Response(JSON.stringify(props.country), {
        headers: { 'Content-Type': 'application/json' },
    });
