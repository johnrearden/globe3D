/**
 * App-owned pushState navigation across every route.
 *
 * **This is the component that stops the globe being rebuilt.** A WebGL context
 * belongs to a document, so any real navigation destroys the context, the scene
 * graph and the GPU buffers, then re-decodes a 4 MB mesh, a 1.3 MB border index
 * and an 8 MB ID buffer and re-uploads all of it. Nothing about how the HTML was
 * produced changes that — only not loading a document does. So after boot this
 * intercepts internal links, swaps the panel content and rewrites the URL, and
 * the globe instance lives for the whole session.
 *
 * It replaces CountryRouter, which did the same thing between country pages
 * only. The apex was a separate application, so reaching it meant a document
 * load and a full rebuild — the cost this exists to remove.
 *
 * Astro's `ClientRouter` is deliberately not used. It swaps documents, which
 * means every island needs `transition:persist` to survive; owning the
 * navigation ourselves means nothing has to survive anything.
 *
 * ## What it must not break
 *
 * The initial page is server-rendered static HTML — the whole point of B1/B2,
 * and a crawler never gets past it because it does not click. React takes over
 * the panel only on the FIRST user navigation, so the document a crawler or a
 * JS-disabled visitor sees is untouched.
 *
 * Every pushed URL must match a built page exactly, or a hard reload 404s.
 * `pathForRoute` is the only thing that formats one, for that reason.
 */
import { useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import CountryArticle, { type Country } from './CountryArticle';
import LandingContent from './LandingContent';
import type { LandingModel } from '../lib/landing';
import { fetchCountry, fetchLanding, setScreen } from '../lib/route';
import { parseRoute, pathForRoute, sameRoute, HOME_ROUTE, type Route } from '../lib/routes';

interface Props {
    /** The route this document was built for — what is already on screen. */
    initial: Route;
    /** Present when the document is a country page. */
    country?: Country;
}

const HOME_TITLE = 'Terragotcha — learn world geography on an interactive 3D globe';
const countryTitle = (c: Country) =>
    `${c.name} — geography, history and literature | Terragotcha`;

export default function AppRouter({ initial, country }: Props) {
    const rootRef = useRef<Root | null>(null);

    useEffect(() => {
        // Seed the store so the globe knows what is on screen without a
        // navigation having happened.
        setScreen({ route: initial, country: country ?? null });

        const host = document.querySelector('.panel-body');
        if (!host) return;

        /**
         * Render client-side, taking over from the static HTML.
         *
         * createRoot, not hydrateRoot. Hydration would demand the trees match,
         * and on the first navigation they deliberately do not — the static
         * markup is for a different route. Created lazily so an untouched page
         * keeps its server-rendered DOM.
         */
        const render = (node: React.ReactElement) => {
            if (!rootRef.current) {
                host.innerHTML = '';
                rootRef.current = createRoot(host);
            }
            rootRef.current.render(node);
        };

        /** Head metadata is not part of the React tree, so update it by hand. */
        const updateHead = (title: string, description: string, path: string) => {
            document.title = title;
            document.querySelector('meta[name="description"]')
                ?.setAttribute('content', description);
            document.querySelector('link[rel="canonical"]')
                ?.setAttribute('href', `https://terragotcha.com${path}`);
        };

        let disposed = false;
        let currentRoute: Route = initial;

        const go = async (route: Route, push: boolean) => {
            let article: Country | null = null;
            let model: LandingModel | null = null;
            try {
                if (route.view === 'country') article = await fetchCountry(route.slug);
                else model = await fetchLanding();
            } catch (err) {
                // Fall back to a real navigation rather than stranding the user
                // on a URL whose content never arrives. Slower, but correct.
                console.error('Route fetch failed, falling back to a full load:', err);
                window.location.href = pathForRoute(route);
                return;
            }
            if (disposed) return;

            const path = pathForRoute(route);
            if (push) history.pushState({ route }, '', path);
            currentRoute = route;

            if (article) {
                // The canonical stays the country's own URL even though the apex
                // is currently served from /app — it is the page a share or a
                // reload must land on.
                updateHead(countryTitle(article), article.summary, `/country/${article.slug}`);
                render(<CountryArticle country={article} />);
            } else if (model) {
                updateHead(HOME_TITLE, model.intro.paragraphs[0], '/');
                render(<LandingContent model={model} />);
            }
            setScreen({ route, country: article });

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

            // parseRoute returns null for everything this app does not own —
            // /borders/*, /privacy/, the sitemap. Those must stay real
            // navigations; swallowing one would strand the reader on a URL whose
            // content never loads.
            const route = parseRoute(link.pathname);
            if (!route || sameRoute(route, currentRoute)) return;

            e.preventDefault();
            void go(route, true);
        };

        const onPop = (e: PopStateEvent) => {
            const route = (e.state?.route as Route | undefined)
                ?? parseRoute(window.location.pathname);
            // An entry we did not write — another pushState consumer's, or a
            // path outside the app. Leave it to the browser.
            if (!route || sameRoute(route, currentRoute)) return;
            void go(route, false);
        };

        // Replace rather than push, so the entry the user landed on carries its
        // route — otherwise Back from the first navigation has nothing to read.
        history.replaceState({ route: initial }, '', window.location.pathname);

        document.addEventListener('click', onClick);
        window.addEventListener('popstate', onPop);
        return () => {
            disposed = true;
            document.removeEventListener('click', onClick);
            window.removeEventListener('popstate', onPop);
        };
    }, [initial, country]);

    return null;
}

export { HOME_ROUTE };
