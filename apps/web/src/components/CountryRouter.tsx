/**
 * App-owned pushState navigation between country pages.
 *
 * The globe takes seconds to load; a document navigation would throw it away
 * and rebuild it on every link. So after boot this intercepts internal country
 * links, swaps the panel content, re-focuses the globe and rewrites the URL —
 * the globe instance lives for the whole session.
 *
 * Astro's `ClientRouter` is deliberately not used. It swaps documents, which
 * means every island needs `transition:persist` to survive; owning the
 * navigation ourselves means nothing has to survive anything.
 *
 * ## What it must not break
 *
 * The initial page is server-rendered static HTML — that is the whole point of
 * B1/B2, and a crawler never gets past it because it does not click. React only
 * takes over the panel on the FIRST user navigation, so the document a crawler
 * or a JS-disabled visitor sees is untouched.
 *
 * Every pushed URL must also match a built page exactly, or a hard reload 404s.
 * `<a href="/country/spain">` is emitted by CountryArticle and the build emits
 * `/country/spain/index.html` with `trailingSlash: 'ignore'`, so both resolve.
 */
import { useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import CountryArticle, { type Country } from './CountryArticle';
import { fetchCountry, setCountry } from '../lib/route';

/** `/country/<slug>` (with or without a trailing slash) → slug. */
function slugFromPath(pathname: string): string | null {
    const m = /^\/country\/([a-z0-9-]+)\/?$/.exec(pathname);
    return m ? m[1] : null;
}

export default function CountryRouter({ initial }: { initial: Country }) {
    const rootRef = useRef<Root | null>(null);

    useEffect(() => {
        // Seed the store so the globe knows what is on screen without a
        // navigation having happened.
        setCountry(initial);

        const host = document.querySelector('.panel-body');
        if (!host) return;

        /** Render the article client-side, taking over from the static HTML. */
        const render = (country: Country) => {
            if (!rootRef.current) {
                // First navigation only. createRoot replaces the server-rendered
                // markup wholesale rather than hydrating it — hydration would
                // demand the trees match, and this one is deliberately different.
                host.innerHTML = '';
                rootRef.current = createRoot(host);
            }
            rootRef.current.render(<CountryArticle country={country} />);
        };

        /** Head metadata is not part of the React tree, so update it by hand. */
        const updateHead = (country: Country) => {
            document.title =
                `${country.name} — geography, history and literature | Terragotcha`;
            document
                .querySelector('meta[name="description"]')
                ?.setAttribute('content', country.summary);
            document
                .querySelector('link[rel="canonical"]')
                ?.setAttribute('href', `https://terragotcha.com/country/${country.slug}`);
        };

        let disposed = false;

        const go = async (slug: string, push: boolean) => {
            let country: Country;
            try {
                country = await fetchCountry(slug);
            } catch (err) {
                // Fall back to a real navigation rather than stranding the user
                // on a page whose URL no longer matches its content.
                console.error('Country fetch failed, falling back to a full load:', err);
                window.location.href = `/country/${slug}`;
                return;
            }
            if (disposed) return;
            if (push) history.pushState({ slug }, '', `/country/${slug}`);
            updateHead(country);
            render(country);
            setCountry(country);
            // A new document would start at the top; a pushState one has to be
            // told.
            document.querySelector('.panel-body')?.scrollTo({ top: 0 });
        };

        const onClick = (e: MouseEvent) => {
            // Leave modified clicks alone: they mean "new tab", "download",
            // "save" — all of which want a real navigation.
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey ||
                e.shiftKey || e.altKey) return;

            const link = (e.target as Element)?.closest?.('a');
            if (!(link instanceof HTMLAnchorElement)) return;
            if (link.target && link.target !== '_self') return;
            if (link.hasAttribute('download')) return;
            if (link.origin !== window.location.origin) return;

            const slug = slugFromPath(link.pathname);
            if (!slug || slug === slugFromPath(window.location.pathname)) return;

            e.preventDefault();
            void go(slug, true);
        };

        const onPop = (e: PopStateEvent) => {
            const slug = (e.state?.slug as string | undefined)
                ?? slugFromPath(window.location.pathname);
            if (slug) void go(slug, false);
        };

        // Replace rather than push, so the entry the user landed on carries the
        // slug — otherwise Back from the first navigation has no state to read.
        history.replaceState({ slug: initial.slug }, '', window.location.pathname);

        document.addEventListener('click', onClick);
        window.addEventListener('popstate', onPop);
        return () => {
            disposed = true;
            document.removeEventListener('click', onClick);
            window.removeEventListener('popstate', onPop);
        };
    }, [initial]);

    return null;
}
