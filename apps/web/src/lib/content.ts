/**
 * The build's view of the content pipeline.
 *
 * `content/countries.json` is baked by Django's `export_country_content`
 * (see backend/README.md) and committed, so the frontend build needs no database.
 * Only PUBLISHED, complete entries are in it — a country without reviewed content
 * has no page at all, which is deliberate: a thin page is worse than no page.
 */
import type { Country } from '../components/CountryArticle';
import data from '../../../../content/countries.json';

interface ContentFile {
    version: number;
    countries: Country[];
}

const file = data as unknown as ContentFile;

if (file.version !== 1) {
    throw new Error(
        `content/countries.json is version ${file.version}, this build expects 1. ` +
        `Re-run: python manage.py export_country_content`,
    );
}

export const countries: Country[] = file.countries;

export function countryBySlug(slug: string): Country | undefined {
    return countries.find((c) => c.slug === slug);
}
