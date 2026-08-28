/**
 * The waving flag on a forward identify-the-flag question.
 *
 * Deliberately imperative Three.js inside a `useEffect`, not react-three-fiber:
 * this is a scene, a camera, a light pair, one plane and a per-frame vertex
 * displacement. Expressed declaratively it would be a second implementation of
 * something the vanilla app already has right, and the interesting part — the
 * Perlin displacement — is a loop over a `BufferAttribute` either way.
 *
 * The geometry, camera, lights and material are the vanilla ones
 * (`identify-flag-quiz.js:156-336`), so the flag looks the same. What is NOT
 * carried across is that file's SECOND renderer: the reverse question drew its
 * six options as six viewports inside one more WebGL canvas, positioned to line
 * up with the DOM buttons overlaid on top. That coupling — a canvas whose
 * contents must track the layout of elements above it — is the kind this rewrite
 * exists to shed, and it cost a third WebGL context alongside the globe's. The
 * option grid uses flag images instead.
 *
 * Everything is torn down on unmount: geometry, material, texture, renderer and
 * the WebGL context itself. A leaked context is not free — browsers cap them per
 * page, and the globe holds one for the whole session.
 */
import { useEffect, useRef } from 'react';

/** Plane size and subdivision, from the vanilla hero flag. */
const FLAG_W = 10;
const FLAG_H = 6.67;
const SEG_X = 20;
const SEG_Y = 15;

/** Drawing-buffer size. CSS sizes the element; this is resolution only. */
const BUFFER_W = 560;
const BUFFER_H = 373;

/** Wave speed, in Perlin units per second. */
const SPEED = 3;

export default function FlagStage({ iso, label }: { iso: string; label: string }) {
    const hostRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;

        let disposed = false;
        let frame = 0;
        let cleanup: (() => void) | null = null;

        (async () => {
            const [THREE, { perlin2 }] = await Promise.all([
                import('three'),
                import('../../../../../js/utils/perlin.js'),
            ]);
            if (disposed) return;

            const scene = new THREE.Scene();
            scene.background = null;

            // Perspective, not orthographic: the displacement is purely along Z,
            // and an orthographic camera renders a Z-only ripple as a motionless
            // rectangle. The lights matter for the same reason — the wave reads
            // through shading, not through silhouette.
            const camera = new THREE.PerspectiveCamera(45, BUFFER_W / BUFFER_H, 0.1, 1000);
            camera.position.z = 9.5;

            scene.add(new THREE.AmbientLight(0xffffff, 0.6));
            const key = new THREE.DirectionalLight(0xffffff, 0.8);
            key.position.set(5, 5, 5);
            scene.add(key);

            const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            // updateStyle = false: keep the buffer at a fixed resolution but let
            // CSS size the element. Otherwise setSize writes inline pixels and
            // beats the stylesheet.
            renderer.setSize(BUFFER_W, BUFFER_H, false);
            // No setClearColor: `alpha: true` already clears to fully
            // transparent, so the flag floats on the panel behind it.
            renderer.domElement.className = 'qz-flag-canvas';
            host.appendChild(renderer.domElement);

            const geometry = new THREE.PlaneGeometry(FLAG_W, FLAG_H, SEG_X, SEG_Y);
            const positions = geometry.attributes.position;
            // The rest pose, kept because the displacement is absolute rather
            // than incremental — reading back the displaced Z each frame would
            // compound the noise into a runaway ripple.
            const rest = new Float32Array(positions.array);

            const texture = await new Promise<any>((resolve, reject) => {
                new THREE.TextureLoader().load(
                    `https://flagcdn.com/w640/${iso.toLowerCase()}.png`,
                    resolve,
                    undefined,
                    reject,
                );
            }).catch(() => null);

            // The question may have moved on while the texture was in flight.
            if (disposed || !texture) {
                texture?.dispose();
                geometry.dispose();
                renderer.dispose();
                return;
            }

            const material = new THREE.MeshStandardMaterial({
                map: texture,
                side: THREE.DoubleSide,
                roughness: 0.7,
                metalness: 0.1,
            });
            const mesh = new THREE.Mesh(geometry, material);
            scene.add(mesh);

            // Wave constants, unchanged from js/features/flag-wave.js — they are
            // tuned by eye, and a different set is a different flag.
            const COEFF = 72;
            const COEFF2 = 65;
            const GAP = 10;
            const SPACING = 30;

            const draw = () => {
                if (disposed) return;
                const t = (performance.now() * 0.001) * SPEED;
                for (let i = 0; i < positions.count; i++) {
                    const x = rest[i * 3];
                    const y = rest[i * 3 + 1];
                    positions.array[i * 3 + 2] =
                        1 + (SPACING / 25) * perlin2(x * (GAP / COEFF) + t, y * (GAP / COEFF2));
                }
                positions.needsUpdate = true;
                geometry.computeVertexNormals();   // the wave is only visible through shading
                renderer.render(scene, camera);
                frame = requestAnimationFrame(draw);
            };
            draw();

            cleanup = () => {
                cancelAnimationFrame(frame);
                scene.remove(mesh);
                geometry.dispose();
                material.dispose();
                texture.dispose();
                renderer.dispose();
                // Hand the context back rather than waiting for GC: a page gets
                // only so many, and the globe is holding one for the session.
                renderer.forceContextLoss?.();
                renderer.domElement.remove();
            };
        })();

        return () => {
            disposed = true;
            cancelAnimationFrame(frame);
            cleanup?.();
        };
    }, [iso]);

    return (
        <div
            ref={hostRef}
            className="qz-flag-stage"
            role="img"
            // The canvas is the question, so it needs a name — but naming the
            // country would BE the answer.
            aria-label={label}
        />
    );
}
