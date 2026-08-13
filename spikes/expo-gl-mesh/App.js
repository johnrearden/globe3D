/**
 * C0 spike — can expo-gl + three render Terragotcha's real globe mesh on Android?
 *
 * This is a measurement rig, not a product. It loads the SAME assets the web app
 * loads (assets/world-mesh.bin, world-border-lines.bin, country-palette.bin),
 * builds the SAME geometry and compiles the SAME shaders, and reports timings on
 * screen so it can be run on a phone with no debugger attached.
 *
 * What we are actually trying to learn, in order of how likely each is to sink
 * the native-globe plan:
 *
 *   1. Can 30 MB of binary get into JS at all, and how fast? React Native's
 *      built-in fetch has historically round-tripped binary bodies as base64
 *      over the bridge, which would be ruinous at this size. Expo's WinterCG
 *      fetch is native-backed. The rig times both and reports the winner.
 *   2. Does expo-gl accept a 18 MB uint32 index buffer? Uint32 indices need
 *      WebGL2 or OES_element_index_uint; 974k vertices leaves no way back to
 *      uint16. The rig prints the GL version and the extension list.
 *   3. How long does the upload take? Every GL call crosses the JS↔native
 *      boundary; four bufferData calls totalling ~33 MB is the single biggest
 *      unknown, and it happens with the user staring at a blank screen.
 *   4. Does it hold a frame rate? 1.57M triangles in one draw call is a lot for
 *      a low-end GPU even though the draw-call count is trivial.
 *
 * Peak memory is deliberately NOT measured in-process: Hermes has no
 * performance.memory, and the number that matters (PSS across the JS heap, the
 * native heap and the GPU allocation) is only visible from outside. Use
 *     adb shell dumpsys meminfo <package>
 * once the rig reports "steady", and compare against a baseline taken before the
 * mesh loads — the rig prints its own package name to make that copy-pasteable.
 *
 * ASSET_BASE must point at a host the device can reach. 10.0.2.2 is the Android
 * emulator's alias for the host loopback; on a physical device set it to the
 * machine's LAN address.
 */
import { useState, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, Platform } from 'react-native';
import { GLView } from 'expo-gl';
import * as THREE from 'three';
import {
    VERTEX_SHADER, FRAGMENT_SHADER,
    BORDER_VERTEX_SHADER, BORDER_FRAGMENT_SHADER, BORDER_DEPTH_BIAS,
} from './shaders';

const ASSET_BASE = process.env.EXPO_PUBLIC_ASSET_BASE || 'http://10.0.2.2:8011/assets';

const SPHERE_RADIUS = 1.0;
const SPHERE_SEGMENTS = 96;
const PALETTE_W = 256;
const COUNTRY_MESH_SCALE = 1.002;
const DEFAULT_OCEAN_COLOR = [6, 26, 51];

const ms = t => `${Math.round(t)} ms`;
const mb = b => `${(b / 1048576).toFixed(1)} MB`;

/**
 * Fetch a binary asset with whichever fetch implementation is asked for, timing
 * it. `expo/fetch` is the native-backed WinterCG implementation; the global one
 * is React Native's. Returns null (rather than throwing) so one implementation
 * failing still lets the other be measured.
 */
async function timedFetch(url, impl, log) {
    const t0 = Date.now();
    try {
        let f = globalThis.fetch;
        if (impl === 'expo') {
            const mod = await import('expo/fetch');
            if (!mod.fetch) throw new Error('expo/fetch has no fetch export');
            f = mod.fetch;
        }
        const res = await f(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        log(`  ${impl.padEnd(6)} ${mb(buf.byteLength)} in ${ms(Date.now() - t0)}`);
        return buf;
    } catch (e) {
        log(`  ${impl.padEnd(6)} FAILED after ${ms(Date.now() - t0)}: ${e.message}`);
        return null;
    }
}

export default function App() {
    const [lines, setLines] = useState([]);
    const [fps, setFps] = useState(null);
    const linesRef = useRef([]);

    const log = useCallback((line) => {
        linesRef.current = [...linesRef.current, line];
        setLines(linesRef.current);
        console.log(line);
    }, []);

    const onContextCreate = useCallback(async (gl) => {
        const tStart = Date.now();

        // ---- 1. What kind of GL context did we actually get? -----------------
        log(`GL      ${gl.getParameter(gl.VERSION)}`);
        log(`GLSL    ${gl.getParameter(gl.SHADING_LANGUAGE_VERSION)}`);
        log(`GPU     ${gl.getParameter(gl.RENDERER)}`);
        const exts = gl.getSupportedExtensions() || [];
        const isWebGL2 = /WebGL 2/i.test(String(gl.getParameter(gl.VERSION)));
        const uintIndex = isWebGL2 || exts.includes('OES_element_index_uint');
        log(`uint32 indices supported: ${uintIndex}${isWebGL2 ? ' (WebGL2)' : ''}`);
        log(`drawing buffer ${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`);
        log(`three r${THREE.REVISION}, expo-gl on ${Platform.OS} ${Platform.Version}`);

        // three dropped WebGL1 in r163 and now calls WebGL2-only entry points
        // unconditionally. expo-gl's context is backed by ES 3.1, but it is a
        // JS object of its own class — so `instanceof` says nothing useful and
        // we have to ask method by method whether the WebGL2 API is really there.
        const WEBGL2_API = [
            'createVertexArray', 'bindVertexArray', 'texStorage2D', 'texSubImage3D',
            'drawArraysInstanced', 'drawElementsInstanced', 'vertexAttribDivisor',
            'drawBuffers', 'createQuery', 'bindBufferBase', 'getBufferSubData',
            'blitFramebuffer', 'invalidateFramebuffer', 'renderbufferStorageMultisample',
            'getContextAttributes',
        ];
        const missing = WEBGL2_API.filter(m => typeof gl[m] !== 'function');
        log(missing.length
            ? `WebGL2 API MISSING: ${missing.join(', ')}`
            : `WebGL2 API present (${WEBGL2_API.length}/${WEBGL2_API.length} probed)`);
        log('');

        // ---- 2. Get the bytes into JS ---------------------------------------
        log('fetch world-mesh.bin');
        let meshBuf = await timedFetch(`${ASSET_BASE}/world-mesh.bin`, 'expo', log);
        const via = meshBuf ? 'expo' : 'rn';
        if (!meshBuf) meshBuf = await timedFetch(`${ASSET_BASE}/world-mesh.bin`, 'rn', log);
        if (!meshBuf) { log('ABORT: could not load the mesh'); return; }

        // Same 2.7 MB file through both implementations, so the cost of React
        // Native's own fetch is measured without a second 30 MB buffer being
        // alive at once. Extrapolate ×11 for the mesh.
        log('fetch world-border-lines.bin (both fetch impls, for comparison)');
        const borderBuf = await timedFetch(`${ASSET_BASE}/world-border-lines.bin`, via, log);
        await timedFetch(`${ASSET_BASE}/world-border-lines.bin`, 'rn', log);
        log('fetch country-palette.bin');
        const paletteBuf = await timedFetch(`${ASSET_BASE}/country-palette.bin`, via, log);
        log('');

        // ---- 3. Decode (should be free — the arrays are views) ---------------
        const tDecode = Date.now();
        let view = new DataView(meshBuf);
        const vertexCount = view.getUint32(0, true);
        const indexCount = view.getUint32(4, true);
        const idsPadded = (vertexCount + 3) & ~3;
        const posOffset = 8;
        const idsOffset = posOffset + vertexCount * 12;
        const idxOffset = idsOffset + idsPadded;
        let positions = new Float32Array(meshBuf, posOffset, vertexCount * 3);
        let ids = new Uint8Array(meshBuf, idsOffset, vertexCount);
        let indices = new Uint32Array(meshBuf, idxOffset, indexCount);
        log(`decode  ${vertexCount.toLocaleString()} verts, ` +
            `${(indexCount / 3).toLocaleString()} tris in ${ms(Date.now() - tDecode)}`);

        // ---- 4. Build the scene (no GL work yet — three uploads lazily) ------
        const tBuild = Date.now();
        // three's only WebGL1 rejection is `context instanceof WebGLRenderingContext`
        // (three.module.js:16094, and it is the sole use of that global in the
        // whole library). expo-gl's context class descends from it for API-shape
        // reasons while being ES 3.x underneath, so the check is a false positive.
        // Hiding the global for the duration of the constructor is the narrowest
        // way past it — no patch-package, no fork, and it cannot affect anything
        // else because nothing else reads it.
        const RealWebGLRenderingContext = globalThis.WebGLRenderingContext;
        globalThis.WebGLRenderingContext = undefined;
        // expo-gl hands back a context, not a DOM canvas. three only reads a few
        // properties off it, so this is the minimum shim that satisfies the
        // constructor, setSize() and the resize path.
        const canvasShim = {
            width: gl.drawingBufferWidth,
            height: gl.drawingBufferHeight,
            clientWidth: gl.drawingBufferWidth,
            clientHeight: gl.drawingBufferHeight,
            style: {},
            addEventListener: () => {},
            removeEventListener: () => {},
            getContext: () => gl,
        };
        let renderer;
        try {
            renderer = new THREE.WebGLRenderer({ context: gl, canvas: canvasShim });
        } finally {
            globalThis.WebGLRenderingContext = RealWebGLRenderingContext;
        }
        renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
        // Match the web build exactly: three enabled colour management by default
        // in r152 and the web app has not opted into it, so the spike must not
        // either or the fills would not be comparable.
        THREE.ColorManagement.enabled = false;
        renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x001122);
        const camera = new THREE.PerspectiveCamera(
            75, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.1, 1000);
        camera.position.set(0, 0, 2.6);

        const paletteBytes = paletteBuf
            ? new Uint8Array(paletteBuf)
            : new Uint8Array(PALETTE_W * 4).fill(200);
        const paletteTex = new THREE.DataTexture(
            paletteBytes, PALETTE_W, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
        paletteTex.minFilter = THREE.NearestFilter;
        paletteTex.magFilter = THREE.NearestFilter;
        paletteTex.needsUpdate = true;

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uPaletteTex: { value: paletteTex },
                uPaletteW: { value: PALETTE_W },
                uSelectedId: { value: 0 },
                uSelectedColor: { value: new THREE.Color(1, 1, 1) },
                uSelGradient: { value: 1 },
                uSelectedCentroid: { value: new THREE.Vector3(0, 0, 0) },
                uSelectedRadius: { value: 0.1 },
                uFlashId: { value: 0 },
                uFlashColor: { value: new THREE.Color(0, 1, 0) },
                uFlashAlpha: { value: 0 },
                uShowCountries: { value: 1 },
                uOceanColor: {
                    value: new THREE.Color(
                        DEFAULT_OCEAN_COLOR[0] / 255,
                        DEFAULT_OCEAN_COLOR[1] / 255,
                        DEFAULT_OCEAN_COLOR[2] / 255),
                },
                uAmbient: { value: new THREE.Color(0.7, 0.7, 0.7) },
                uDiffuse: { value: 0.8 },
                uLightDir: { value: new THREE.Vector3(-0.4, 0.5, 1.0) },
                uSpecStrength: { value: 0.18 },
                uShininess: { value: 24 },
                uSpecColor: { value: new THREE.Color(1, 1, 1) },
                uOceanSpecBoost: { value: 2.2 },
            },
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            side: THREE.FrontSide,
        });

        // Ocean sphere: same material, every vertex tagged country id 0.
        const oceanGeo = new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
        const oceanIds = new Float32Array(oceanGeo.attributes.position.count);
        oceanGeo.setAttribute('aCountryId', new THREE.BufferAttribute(oceanIds, 1));
        scene.add(new THREE.Mesh(oceanGeo, material));

        // The merged country mesh — the thing this spike exists to test.
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geom.setAttribute('aCountryId', new THREE.BufferAttribute(ids, 1));
        geom.setIndex(new THREE.BufferAttribute(indices, 1));
        geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1.01);
        const countryMesh = new THREE.Mesh(geom, material);
        countryMesh.scale.setScalar(COUNTRY_MESH_SCALE);
        scene.add(countryMesh);

        let borderGeom = null;
        if (borderBuf) {
            const edgeIndices = new Uint32Array(borderBuf);
            const bgeo = borderGeom = new THREE.BufferGeometry();
            bgeo.setAttribute('position', geom.attributes.position);
            bgeo.setIndex(new THREE.BufferAttribute(edgeIndices, 1));
            bgeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1.01);
            const bmat = new THREE.ShaderMaterial({
                uniforms: {
                    uColor: { value: new THREE.Color(0x222831) },
                    uOpacity: { value: 0.85 },
                    uDepthBias: { value: BORDER_DEPTH_BIAS },
                },
                vertexShader: BORDER_VERTEX_SHADER,
                fragmentShader: BORDER_FRAGMENT_SHADER,
                transparent: true,
                depthTest: false,
                depthWrite: false,
            });
            const lines2 = new THREE.LineSegments(bgeo, bmat);
            lines2.renderOrder = 1;
            countryMesh.add(lines2);
            log(`build   scene assembled in ${ms(Date.now() - tBuild)} ` +
                `(+${(edgeIndices.length / 2).toLocaleString()} border edges)`);
        } else {
            log(`build   scene assembled in ${ms(Date.now() - tBuild)} (no borders)`);
        }

        // Once a BufferAttribute is uploaded, three keeps its typed array alive
        // forever — a second full-size copy of the mesh sitting in JS memory for
        // nothing, since this app never raycasts the geometry (picking goes
        // through the separate ID buffer) and the bounding sphere is set by hand.
        // Dropping it is the single largest memory lever available, so measure
        // both ways: EXPO_PUBLIC_KEEP_ARRAYS=1 keeps them.
        const releaseArrays = process.env.EXPO_PUBLIC_KEEP_ARRAYS !== '1';
        if (releaseArrays) {
            const drop = function () { this.array = null; };
            geom.attributes.position.onUpload(drop);
            geom.attributes.aCountryId.onUpload(drop);
            geom.index.onUpload(drop);
            if (borderGeom) borderGeom.index.onUpload(drop);
            // Nulling the attributes is not enough: these locals are captured by
            // the render-loop closure below, and every one of them is a view onto
            // the same 30 MB ArrayBuffer, so a single surviving reference pins the
            // lot. Real code would let a decode() frame go out of scope.
            positions = ids = indices = view = meshBuf = null;
        }
        log(`policy  JS-side attribute arrays: ${releaseArrays ? 'released after upload' : 'retained'}`);

        // ---- 5. First frame: shader compile + every bufferData upload -------
        const tFirst = Date.now();
        renderer.render(scene, camera);
        gl.endFrameEXP();
        const firstFrame = Date.now() - tFirst;
        log(`upload  first frame (compile + ${mb(vertexCount * 13 + indexCount * 4)} ` +
            `of buffers) in ${ms(firstFrame)}`);
        log(`total   context-create → first pixel: ${ms(Date.now() - tStart)}`);
        log('');
        log('rotating — watch the fps readout, then run:');
        log(`  adb shell dumpsys meminfo host.exp.exponent | head -20`);

        // ---- 6. Steady-state frame rate -------------------------------------
        let frames = 0;
        let last = Date.now();
        const loop = () => {
            requestAnimationFrame(loop);
            countryMesh.rotation.y += 0.004;
            scene.children[0].rotation.y += 0.004;
            renderer.render(scene, camera);
            gl.endFrameEXP();
            frames++;
            const now = Date.now();
            if (now - last >= 1000) {
                setFps(Math.round((frames * 1000) / (now - last)));
                frames = 0;
                last = now;
            }
        };
        loop();
    }, [log]);

    return (
        <View style={styles.root}>
            <GLView style={styles.gl} onContextCreate={onContextCreate} />
            <View style={styles.overlay}>
                {fps !== null && <Text style={styles.fps}>{fps} fps</Text>}
                <ScrollView style={styles.logBox}>
                    {lines.map((l, i) => <Text key={i} style={styles.line}>{l || ' '}</Text>)}
                </ScrollView>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#001122' },
    gl: { flex: 1 },
    overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, padding: 12, paddingTop: 44 },
    fps: { color: '#7CFC98', fontSize: 22, fontWeight: '700', marginBottom: 6 },
    logBox: { maxHeight: '70%' },
    line: { color: '#cfe3ff', fontSize: 11, fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo' },
});
