/**
 * Mounts the real Three.js globe behind the article.
 *
 * `client:only="react"` — this renders nothing at build time and must not try:
 * it needs WebGL, a canvas and `window`. That is also why the "Loading globe…"
 * placeholder lives in the page's own markup rather than here; a client:only
 * island contributes no HTML for the crawler or the first paint.
 *
 * The engine is the vanilla app's, imported unchanged: SceneManager,
 * GlobeManager and CameraController behind the GlobeBridge from stage A6. This
 * component is glue and lifecycle only — it deliberately contains no globe
 * logic, because a second implementation would be the one that drifts.
 *
 * The import is dynamic so the ~600 KB of Three.js is never in the page's
 * initial bundle: the article is readable long before any of this arrives, and
 * a visitor who never gets here (crawler, JS disabled, slow connection that
 * gives up) has lost nothing that matters.
 */
import { useEffect, useRef, useState } from 'react';
import { getScreen, onScreenChange, type Screen } from '../lib/route';
import { framingFor } from '../lib/globe-framing';
import { getPanelSnap, onPanelSnapChange } from '../lib/panel';
import { setGlobeHandle } from '../lib/globe';
import { readThemeColors } from '../lib/theme-colors';
import { track } from '../lib/analytics';

/**
 * Where the baked .bin assets load from.
 *
 * R2 in production. In dev, same-origin `/assets`, served by the middleware in
 * astro.config.mjs — R2's CORS policy allows only the two terragotcha.com
 * origins, so a dev server pointed at it gets a CORS failure and no globe.
 * `PUBLIC_ASSET_BASE` overrides both, which is how a local *build* is previewed.
 */
const ASSET_BASE =
    import.meta.env.PUBLIC_ASSET_BASE ??
    (import.meta.env.DEV ? '/assets' : 'https://assets.terragotcha.com');

export default function GlobeIsland({ focus }: { focus?: string }) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [failed, setFailed] = useState<string | null>(null);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;

        let disposed = false;
        // Everything that needs tearing down if the component unmounts before
        // the globe finishes loading — a real case on a fast pushState away.
        let sceneManager: any = null;
        let unsubscribe: (() => void) | null = null;
        let unsubscribePanel: (() => void) | null = null;
        let onResize: (() => void) | null = null;

        (async () => {
            // The vanilla loader reads this global to build asset URLs. Set it
            // before importing anything that captures it at module scope.
            (window as any).GLOBE3D_ASSET_BASE = ASSET_BASE;

            try {
                const [
                    { SceneManager },
                    { GlobeManager },
                    { CameraController },
                    { LabelManager },
                    { FocusZoomRegistry },
                    { installContextRecovery },
                    { SmallCountryIndicator },
                    { PointerControls },
                    { createWebGlobeBridge },
                    { createWebGlobeAppearance },
                    { createCountryTable },
                    { settingsStore },
                    { LARGE_COUNTRIES, SMALL_COUNTRIES },
                    { countryData, countryToISO },
                ] = await Promise.all([
                    import('../../../../js/core/scene.js'),
                    import('../../../../js/core/globe.js'),
                    import('../../../../js/core/camera-controls.js'),
                    import('../../../../js/core/labels.js'),
                    import('../../../../js/core/focus-zoom.js'),
                    import('../../../../js/core/context-recovery.js'),
                    import('../../../../js/core/small-country-indicator.js'),
                    import('../../../../js/core/pointer-controls.js'),
                    import('../../../../js/data/globe-bridge.js'),
                    import('../../../../js/data/globe-appearance.js'),
                    import('../../../../js/data/country-table.js'),
                    import('../../../../js/data/settings-store.js'),
                    import('../../../../js/data/country-sizes.js'),
                    import('../../../../js/data/country-data.js'),
                ]);
                if (disposed) return;

                sceneManager = new SceneManager(host);
                sceneManager.init();

                const globeManager = new GlobeManager(sceneManager.getScene());
                // Creates the globe Group and the placeholder sphere. loadGlobe
                // adds meshes to that Group, so skipping this fails later and
                // less obviously, at `this.globe.add(...)` on a null.
                globeManager.init();
                const cameraController = new CameraController(
                    sceneManager.getCamera(),
                    sceneManager.getRenderer(),
                    sceneManager.getScene(),
                );
                cameraController.setupControls();

                await new Promise<void>((resolve, reject) => {
                    globeManager.loadGlobe(undefined, resolve, reject);
                });
                if (disposed) return;


                // Country names. The size tiers come from js/data/country-sizes.js
                // rather than a copy here, so both apps draw the same labels at
                // the same zooms.
                const labelManager = new LabelManager(
                    sceneManager.getScene(),
                    sceneManager.getCamera(),
                    globeManager,
                );
                labelManager.createLabels(LARGE_COUNTRIES, SMALL_COUNTRIES);

                // Classify every country into a focus-zoom level (A–H) by bbox
                // width. It drives both the camera distance a focus flies to and
                // each label's appearance threshold, so labels need it before
                // they can decide when to show.
                const focusRegistry = new FocusZoomRegistry();
                focusRegistry.buildFromCountries(
                    globeManager.getCountryNames()
                        .map((n: string) => globeManager.getCountryByName(n))
                        .filter(Boolean),
                );
                labelManager.applyFocusZoom(focusRegistry);

                // rotateToCountry reveals a country too small to see through
                // this at the end of its animation. It takes the same size list
                // the labels do — a country that is too small to label is the
                // one that needs the marker.
                const smallCountryIndicator = new SmallCountryIndicator({
                    globeManager,
                    smallCountries: SMALL_COUNTRIES,
                });

                // Configured in one call, after loadGlobe, because every
                // collaborator here needs the mesh: the registry is built from
                // country bboxes and the labels from centroids. Nothing asks the
                // camera to fly anywhere before this point.
                cameraController.configure({
                    globeManager,
                    labelManager,
                    smallCountryIndicator,
                    focusRegistry,
                    initialCameraDistance: sceneManager.getInitialCameraDistance(),
                });

                sceneManager.onRender(() => {
                    cameraController.update();
                    globeManager.updateFlash();
                    labelManager.updateVisibility();
                });
                sceneManager.start();
                sceneManager.fadeInLights();
                globeManager.fadeInLighting?.();

                // Everything past this point goes through the two interfaces,
                // not the engine objects — the same contract the quiz layer and
                // the settings panel use. The bridge is where the globe is
                // POINTING; the appearance is how it LOOKS.
                const globe = createWebGlobeBridge({ globeManager, cameraController });
                const appearance = createWebGlobeAppearance({
                    globeManager, cameraController, labelManager, sceneManager,
                });

                // The reader's saved preferences, all of them, in one call.
                //
                // Must come after loadGlobe: a scheme is derived FROM
                // `paletteOriginal`, so applying one before the palette exists
                // silently does nothing — which is how the baked "vibrant"
                // palette used to show through and make the globe appear to
                // change colour between the two apps.
                //
                // A remote theme that pins a scheme wrote it into `scheme`
                // when it was applied (lib/theme.ts), so there is no second
                // place to consult here — the store is the one answer.
                appearance.applyAll(settingsStore.get());

                // The globe's themed colours. `scene.js` and `globe.js` read
                // --globe-space and --globe-border for themselves at boot, but
                // nothing read --ocean at all: the water came from the baked
                // `meta.oceanColor` and the knob styled only the loading
                // placeholder. One call makes all three follow the tokens, and
                // is the same call the dev theme lab makes on every edit.
                appearance.setThemeColors(readThemeColors());

                // Taps on the globe. PointerControls owns the whole pointer
                // dispatch — drag vs. tap, flick momentum, long-press — so this
                // is not "add a click handler"; reimplementing it would fork the
                // gesture thresholds.
                //
                // The editors and the vanilla quiz objects are simply absent:
                // they default to permanently-inactive stand-ins, so an ordinary
                // tap takes the plain select-and-fly path. Quiz code hears the
                // pick through `globe.onPick` instead, which is the only route
                // that carries no engine object with it.
                const pointerControls = new PointerControls({
                    camera: sceneManager.getCamera(),
                    controls: cameraController.controls,
                    renderer: sceneManager.getRenderer(),
                    globeManager,
                    labelManager,
                    smallCountryIndicator,
                    deliverPick: (name: string) => globe.deliverPick(name),
                    onSelect: (name: string) => track('country_select', { country: name, source: 'globe' }),
                    deliverDeselect: () => globe.deliverDeselect(),
                    rotateGlobeToCountry: (arg: unknown, quiz: boolean, aim: unknown) =>
                        cameraController.rotateToCountry(arg, quiz, aim),
                    resetIdleTimer: () => cameraController.resetIdleTimer(),
                    onFlick: (vx: number, vy: number) => cameraController.flick(vx, vy),
                    cancelFlick: () => cameraController.cancelFlick(),
                    countryData,
                    countryToISO,
                });
                pointerControls.attach();

                // A lost context is otherwise permanent here: the island mounts
                // once and never remounts, so nothing would rebuild the globe.
                installContextRecovery(sceneManager, { globeManager });

                // Publish the globe for the islands that are not the globe — the
                // quiz UI is a separate React root and cannot be handed this
                // through a provider. Country data crosses as a plain table, not
                // as the renderer: `createCountryTable` is the seam between the
                // engine and quiz-core.
                setGlobeHandle({
                    globe,
                    appearance,
                    countries: createCountryTable({ globeManager, countryToISO, countryData }),
                });

                /**
                 * Framing that puts the globe in whatever the panel leaves free.
                 * Measured from the live rect, so it follows the CSS breakpoint
                 * instead of restating it.
                 */
                const framing = () => framingFor(
                    // A collapsed panel leaves the whole viewport free. Taken from
                    // the state rather than the rect on purpose: the rect is
                    // mid-transition for 260ms after a collapse, and framing off a
                    // moving target lands the globe somewhere it will not stay.
                    getPanelSnap() === 'collapsed'
                        ? null
                        : document.querySelector('.panel-sheet')?.getBoundingClientRect() ?? null,
                    { width: window.innerWidth, height: window.innerHeight },
                );

                /**
                 * Point the globe at whatever the route names. A country gets
                 * highlighted and flown to; the apex gets the whole world, since
                 * there is nothing in particular to look at.
                 */
                const show = (screen: Screen) => {
                    // Declare the covered region BEFORE framing anything, so a
                    // country focus lands beside the panel rather than behind it
                    // — focusCountry has no framing options of its own.
                    const f = framing();
                    globe.setVisibleRegion({
                        focalAnchor: f.focalAnchor,
                        visibleFraction: f.visibleFraction,
                    });

                    const name = screen.country?.name
                        // The router mounts client:idle and this island
                        // client:only, so on a country page the store may not be
                        // seeded yet when the mesh lands. The page tells us
                        // directly for exactly that window.
                        ?? (screen.route.view === 'country' ? focus : null);
                    if (name) {
                        globe.highlight(name);
                        globe.focusCountry(name);
                    } else {
                        // No country: show the whole globe, beside the panel
                        // rather than behind it. frameGlobe names no lat/lng, so
                        // it keeps the current heading — the engine guards that
                        // case, because aiming at an undefined point yields a NaN
                        // camera and a canvas that renders nothing at all.
                        globe.clearSelection();
                        globe.frameGlobe(f);
                    }
                };

                // Whatever is on screen now — the store may already have moved
                // on if the mesh took a while and the reader navigated.
                show(getScreen());

                // Re-frame on every pushState navigation. This subscription is
                // the whole reason the globe survives a link click: the router
                // publishes, the globe moves, and nothing is torn down.
                unsubscribe = onScreenChange(show);

                // setViewOffset bakes in the viewport it was given, so a resize
                // needs the framing recomputed or the projection skews.
                onResize = () => {
                    // setViewOffset bakes in the viewport it was given, so both
                    // halves of the region have to be recomputed, on every route.
                    show(getScreen());
                };
                window.addEventListener('resize', onResize);
                unsubscribePanel = onPanelSnapChange(() => show(getScreen()));

                // Hand the page over: the placeholder fades out, the globe in.
                document.documentElement.dataset.globe = 'ready';
            } catch (err) {
                console.error('Globe failed to load:', err);
                // The article is the page's reason to exist and is already on
                // screen, so a globe failure must not look like a broken page.
                if (!disposed) setFailed(String((err as Error)?.message ?? err));
                document.documentElement.dataset.globe = 'failed';
            }
        })();

        return () => {
            disposed = true;
            // Before anything else: a consumer must never command a destroyed
            // scene. Clearing this is what makes that impossible rather than
            // unlikely.
            setGlobeHandle(null);
            unsubscribe?.();
            unsubscribePanel?.();
            if (onResize) window.removeEventListener('resize', onResize);
            sceneManager?.destroy?.();
            delete document.documentElement.dataset.globe;
        };
    }, [focus]);

    return (
        <>
            <div
                ref={hostRef}
                className="globe-host"
                aria-hidden="true"
                data-failed={failed ? 'true' : 'false'}
            />
            {/* The article is still on screen and still the point of the page,
                so this is a card in the globe's seat rather than a modal over
                everything — the vanilla fallback's message and its Reload,
                without its takeover. Rendered by a client:only island, so it
                can never be in the static document. */}
            {failed && (
                <div className="globe-failed">
                    <div
                        className="globe-failed-card"
                        role="alertdialog"
                        aria-labelledby="globe-failed-title"
                        aria-describedby="globe-failed-body"
                    >
                        <svg viewBox="0 0 256 256" width="40" height="40" fill="currentColor" aria-hidden="true">
                            <path d="M236.8,188.09,149.35,36.22a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM120,104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm8,88a12,12,0,1,1,12-12A12,12,0,0,1,128,192Z" />
                        </svg>
                        <h2 id="globe-failed-title">3D graphics couldn't start</h2>
                        <p id="globe-failed-body">
                            Your browser couldn't start the 3D globe. Try reloading — and if that
                            doesn't help, check that hardware acceleration is on. The article
                            below still works.
                        </p>
                        <button type="button" onClick={() => window.location.reload()}>Reload</button>
                    </div>
                </div>
            )}
        </>
    );
}
