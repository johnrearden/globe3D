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

/** Where the baked .bin assets are served from. */
const ASSET_BASE =
    import.meta.env.PUBLIC_ASSET_BASE ?? 'https://assets.terragotcha.com';

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

        (async () => {
            // The vanilla loader reads this global to build asset URLs. Set it
            // before importing anything that captures it at module scope.
            (window as any).GLOBE3D_ASSET_BASE = ASSET_BASE;

            try {
                const [
                    { SceneManager },
                    { GlobeManager },
                    { CameraController },
                    { SmallCountryIndicator },
                    { createWebGlobeBridge },
                ] = await Promise.all([
                    import('../../../../js/core/scene.js'),
                    import('../../../../js/core/globe.js'),
                    import('../../../../js/core/camera-controls.js'),
                    import('../../../../js/features/small-country-indicator.js'),
                    import('../../../../js/data/globe-bridge.js'),
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

                // rotateToCountry reveals tiny countries through this at the end
                // of its animation, so it has to exist. An empty set means it
                // always no-ops — the reveal marker is a quiz affordance, not
                // something a content page needs.
                cameraController.configure({
                    globeManager,
                    smallCountryIndicator: new SmallCountryIndicator({
                        globeManager,
                        smallCountries: new Set(),
                    }),
                    initialCameraDistance: sceneManager.getInitialCameraDistance(),
                });

                await new Promise<void>((resolve, reject) => {
                    globeManager.loadGlobe(undefined, resolve, reject);
                });
                if (disposed) return;

                sceneManager.onRender(() => {
                    cameraController.update();
                    globeManager.updateFlash();
                });
                sceneManager.start();
                sceneManager.fadeInLights();
                globeManager.fadeInLighting?.();

                // Everything past this point goes through the bridge, not the
                // engine objects — the same contract the quiz layer uses.
                const globe = createWebGlobeBridge({ globeManager, cameraController });
                if (focus) {
                    globe.highlight(focus);
                    globe.focusCountry(focus);
                }

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
            sceneManager?.destroy?.();
            delete document.documentElement.dataset.globe;
        };
    }, [focus]);

    return (
        <div
            ref={hostRef}
            className="globe-host"
            aria-hidden="true"
            data-failed={failed ? 'true' : 'false'}
        />
    );
}
