/**
 * Globe Management Module — textured-sphere edition.
 *
 * Replaces the per-country mesh approach with a single SphereGeometry rendered
 * by a custom ShaderMaterial that samples a baked color texture and a country
 * ID texture. Highlighting is a uniform write; picking is an O(1) lookup into
 * a CPU-side copy of the ID texture.
 */

import { state } from '../data/state.js';
import { latLngToXYZ } from '../utils/coordinates.js';

const THREE = window.THREE;

const SPHERE_RADIUS = 1.0;
const SPHERE_SEGMENTS = 96;
const PALETTE_W = 256;
// Country borders are drawn as a line that shares the fill mesh's exact vertices
// (assets/world-border-lines.bin = boundary-edge index pairs). It sits at the
// same radius as the fills, so to avoid z-fighting we nudge it toward the camera
// in clip space by a tiny depth bias — NOT a radial lift, which would reintroduce
// the parallax that made the previous raised line drift off its boundary near the
// globe's limb. The XY position is identical to the fill edge → zero parallax.
const BORDER_DEPTH_BIAS = 0.00015;

// Flat, depth-biased line shader (constant 1px width in WebGL, i.e. the same
// width at every zoom). Color/opacity are settable; depthTest keeps the far
// hemisphere's borders hidden behind the globe.
const BORDER_VERTEX_SHADER = /* glsl */`
uniform float uDepthBias;
void main() {
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    clip.z -= uDepthBias * clip.w; // toward camera in NDC; no XY change → no parallax
    gl_Position = clip;
}
`;
const BORDER_FRAGMENT_SHADER = /* glsl */`
precision highp float;
uniform vec3 uColor;
uniform float uOpacity;
void main() {
    gl_FragColor = vec4(uColor, uOpacity);
}
`;

// Default ocean color (matches the `meta.oceanColor` fallback used in loadGlobe).
// Used to tint the pre-load placeholder sphere so it matches the real ocean.
const DEFAULT_OCEAN_COLOR = [6, 26, 51];

// Default shader lighting levels. The globe is created fully dark (these at 0)
// and ramped up to these targets by fadeInLighting() once the texture loads.
const LIGHTING_TARGETS = { ambient: 0.7, diffuse: 0.8, specStrength: 0.18 };
const COUNTRY_MESH_SCALE = 1.002; // raises country mesh above ocean sphere; build-time
// triangle subdivision (MAX_CHORD_SAG in build-textures.js) keeps every triangle's
// chord-vs-arc sag well below this offset so country interiors clear the ocean.

// Same shader for both the ocean sphere (aCountryId = 0 for every vertex) and
// the merged country mesh (aCountryId = each country's ID). The fragment shader
// looks up the per-country color from the palette texture; id=0 falls through
// to the ocean-color uniform.
const VERTEX_SHADER = /* glsl */`
attribute float aCountryId;
varying float vCountryId;
varying vec3 vViewPos;
varying vec3 vViewNormal;

void main() {
    vCountryId = aCountryId;
    // Both meshes are unit-sphere geometry, so the surface normal is the
    // normalized local position. This avoids relying on SphereGeometry's
    // baked normal attribute and works for the merged country mesh too.
    vec3 nrmLocal = normalize(position);
    // View-space lighting (camera-relative). normalMatrix is the inverse-
    // transpose of the modelView matrix, giving a correct view-space normal —
    // and correctly handling the non-uniform squash of the bounce animation.
    vViewNormal = normalize(normalMatrix * nrmLocal);
    vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
    vViewPos = viewPos.xyz;
    gl_Position = projectionMatrix * viewPos;
}
`;

const FRAGMENT_SHADER = /* glsl */`
precision highp float;

uniform sampler2D uPaletteTex;
uniform float uPaletteW;
uniform float uSelectedId;
uniform vec3 uSelectedColor;   // tint applied to the selected country
uniform float uFlashId;
uniform vec3 uFlashColor;
uniform float uFlashAlpha;
uniform float uShowCountries;
uniform vec3 uOceanColor;
uniform vec3 uAmbient;
uniform float uDiffuse;
uniform vec3 uLightDir;        // light direction in VIEW space (camera-relative)
uniform float uSpecStrength;   // glossy highlight strength
uniform float uShininess;      // highlight tightness (higher = smaller, sharper)
uniform vec3 uSpecColor;       // highlight tint
uniform float uOceanSpecBoost; // extra gloss on the ocean (water glint)

varying float vCountryId;
varying vec3 vViewPos;
varying vec3 vViewNormal;

void main() {
    float id = vCountryId;

    // Palette is the single source of truth for country fills.
    // RGB = country color; A = visibility (0 = hidden → ocean, 1 = full).
    vec3 color = uOceanColor;
    if (id > 0.5) {
        vec4 entry = texture2D(uPaletteTex, vec2((id + 0.5) / uPaletteW, 0.5));
        color = mix(uOceanColor, entry.rgb, entry.a);
    }

    if (uShowCountries < 0.5) {
        color = uOceanColor;
    }

    // Selection tints to uSelectedColor (white by default; settable per scheme).
    if (id > 0.5 && uSelectedId > 0.5 && abs(id - uSelectedId) < 0.5) {
        color = uSelectedColor;
    }

    // Quiz flash overlay.
    if (id > 0.5 && uFlashId > 0.5 && abs(id - uFlashId) < 0.5) {
        color = mix(color, uFlashColor, uFlashAlpha);
    }

    // Camera-relative (view-space) lighting: the light is fixed relative to the
    // viewer, so the hemisphere you are looking at is ALWAYS lit — orbiting the
    // camera never reveals a dark side. uLightDir is offset up/left of the view
    // axis, so the specular highlight sits off-center for a glossy, dimensional
    // look. Bounce/pinball still shift the shading because the geometry moves
    // relative to the view, and it scales perfectly at every zoom.
    vec3 N = normalize(vViewNormal);
    vec3 V = normalize(-vViewPos);       // camera is at the origin in view space
    vec3 L = normalize(uLightDir);       // constant view-space light direction
    float ndotl = max(dot(N, L), 0.0);

    // Specular highlight — the glossy sheen that makes the surface look less
    // matte. Gated by ndotl so it never appears on the unlit side. The ocean
    // gets an extra boost so it reads like a water glint.
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), uShininess) * ndotl;
    float specStrength = (id < 0.5) ? uSpecStrength * uOceanSpecBoost : uSpecStrength;

    vec3 lit = color * (uAmbient + uDiffuse * ndotl) + uSpecColor * (spec * specStrength);

    gl_FragColor = vec4(lit, 1.0);
}
`;

export class GlobeManager {
    constructor(scene) {
        this.scene = scene;
        this.globe = null;
        this.oceanMesh = null;       // background sphere (radius 1.0)
        this.countryMesh = null;     // merged vector country fills (radius 1.0008)
        this.material = null;
        this.paletteTexture = null;
        this.paletteDefaults = null; // build-time palette snapshot for resets

        this.borderLines = null;     // LineSegments sharing the fill mesh's vertices (fail-soft)
        this.borderMaterial = null;
        this._borderColor = 0x222831; // border ink color
        this._borderOpacity = 0.85;   // line opacity; applied when borders are visible
        this._borderVisible = false;

        this.idBytes = null;        // Uint8Array, packed [idHi, idLo, ...]
        this.idW = 0;
        this.idH = 0;

        this.countriesById = [];    // sparse, indexed by id
        this.nameToId = {};
        this.idToName = {};
        this.countryCentroids = []; // [{name, centroid: Vector3, meshRef: null}]

        this.capitals = {};         // {countryName: {name, lat, lng}} (sidecar, fail-soft)
        this.capitalMarker = null;  // reusable marker mesh for the capitals quiz

        this.flashTimer = null;     // {id, color, startTime, duration}

        // Reusable ray helpers.
        this._tmpRay = new THREE.Ray();
        this._tmpVec = new THREE.Vector3();
        this._tmpMat = new THREE.Matrix4();
    }

    init() {
        this.globe = new THREE.Group();
        this.scene.add(this.globe);

        this.addLatLongLines();
        this.showPlaceholder();

        state.set('scene.globe', this.globe, false);
        state.set('scene.baseSphere', null, false);

        console.log('GlobeManager initialized (textured-sphere)');
    }

    /**
     * Add a lit, ocean-colored placeholder sphere so the globe is visible
     * immediately — before the ~3.8 MB country mesh and palette finish loading.
     * Unlike the country ShaderMaterial (which lights itself), this stock
     * MeshPhongMaterial is lit by the scene lights set up in SceneManager.
     * Replaced by the real ocean sphere in loadGlobe (see removePlaceholder).
     */
    showPlaceholder() {
        if (this.placeholderMesh) return;
        const geo = new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
        const mat = new THREE.MeshPhongMaterial({
            color: new THREE.Color(
                DEFAULT_OCEAN_COLOR[0] / 255,
                DEFAULT_OCEAN_COLOR[1] / 255,
                DEFAULT_OCEAN_COLOR[2] / 255
            )
        });
        this.placeholderMesh = new THREE.Mesh(geo, mat);
        this.globe.add(this.placeholderMesh);
    }

    /**
     * Remove the placeholder sphere once the real ocean sphere is ready. The
     * real ocean is the same radius, so the swap is seamless (no z-fight, no gap).
     */
    removePlaceholder() {
        if (!this.placeholderMesh) return;
        this.globe.remove(this.placeholderMesh);
        this.placeholderMesh.geometry.dispose();
        this.placeholderMesh.material.dispose();
        this.placeholderMesh = null;
    }

    /**
     * Smoothly raise the textured globe's shader lighting from black to its
     * default levels (LIGHTING_TARGETS). Pair with SceneManager.fadeInLights()
     * to reveal the whole scene once the texture has finished loading. Uniform
     * values are read every frame by the running render loop, so mutating them
     * here is enough — no needsUpdate required.
     * @param {number} duration - Fade duration in milliseconds
     */
    fadeInLighting(duration = 1500) {
        if (!this.material) return;
        const u = this.material.uniforms;
        const start = performance.now();
        const step = (now) => {
            const t = Math.min((now - start) / duration, 1);
            const e = t * t * (3 - 2 * t); // smoothstep ease
            u.uAmbient.value.setScalar(LIGHTING_TARGETS.ambient * e);
            u.uDiffuse.value = LIGHTING_TARGETS.diffuse * e;
            u.uSpecStrength.value = LIGHTING_TARGETS.specStrength * e;
            if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    /**
     * Convert latitude/longitude to 3D vector position on sphere (build-globe
     * convention — the same one used by the build script and label-config.json).
     */
    latLngToVector3(lat, lng, radius = 1, height = 0) {
        const { x, y, z } = latLngToXYZ(lat, lng, radius, height);
        return new THREE.Vector3(x, y, z);
    }

    /**
     * Decode world-mesh.bin into a single BufferGeometry holding every country's
     * triangulated polygon, with a per-vertex aCountryId attribute that lets the
     * fragment shader pick each pixel's color out of the palette texture.
     *
     * Format: [u32 vertexCount][u32 indexCount]
     *         [f32 positions × 3*vertexCount]
     *         [u8 ids × vertexCount, padded up to 4-byte alignment]
     *         [u32 indices × indexCount]
     */
    _buildCountryMesh(buffer) {
        const view = new DataView(buffer);
        const vertexCount = view.getUint32(0, true);
        const indexCount = view.getUint32(4, true);
        const idsPadded = (vertexCount + 3) & ~3;
        const posOffset = 8;
        const idsOffset = posOffset + vertexCount * 12;
        const idxOffset = idsOffset + idsPadded;

        const positions = new Float32Array(buffer, posOffset, vertexCount * 3);
        const ids = new Uint8Array(buffer, idsOffset, vertexCount);
        const indices = new Uint32Array(buffer, idxOffset, indexCount);

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geom.setAttribute('aCountryId', new THREE.BufferAttribute(ids, 1));
        geom.setIndex(new THREE.BufferAttribute(indices, 1));
        // Bounding sphere covers the unit sphere — frustum-cull the whole mesh
        // as a unit (still one draw call per frame).
        geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1.01);

        const mesh = new THREE.Mesh(geom, this.material);
        mesh.userData.isGlobeSurface = true;
        console.log(`Country mesh: ${vertexCount} vertices, ${indexCount / 3} triangles`);
        return mesh;
    }

    /**
     * Build the country-border line from world-border-lines.bin — a Uint32 list
     * of vertex-index pairs naming the fill mesh's boundary edges. The line
     * geometry shares the country mesh's exact position attribute and is added as
     * a child of the country mesh, so every border vertex coincides with a fill
     * boundary vertex (no gap, no parallax). A flat depth-biased shader nudges it
     * a hair toward the camera in clip space to avoid z-fighting without moving it
     * radially. Fail-soft: a missing/invalid asset just means no borders.
     */
    _buildBorderLines(buffer) {
        if (!buffer || !this.countryMesh) return;
        const edgeIndices = new Uint32Array(buffer);
        if (edgeIndices.length === 0 || edgeIndices.length % 2 !== 0) return;

        const geo = new THREE.BufferGeometry();
        // Share the fill mesh's position BufferAttribute verbatim — identical
        // vertices guarantee the line traces the fill outlines exactly.
        geo.setAttribute('position', this.countryMesh.geometry.attributes.position);
        geo.setIndex(new THREE.BufferAttribute(edgeIndices, 1));
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1.01);

        this.borderMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(this._borderColor) },
                uOpacity: { value: this._borderOpacity },
                uDepthBias: { value: BORDER_DEPTH_BIAS }
            },
            vertexShader: BORDER_VERTEX_SHADER,
            fragmentShader: BORDER_FRAGMENT_SHADER,
            transparent: true,
            depthTest: true,
            depthWrite: false
        });

        this.borderLines = new THREE.LineSegments(geo, this.borderMaterial);
        this.borderLines.renderOrder = 1; // after the fills
        this.borderLines.visible = this._borderVisible;
        // Child of the country mesh → inherits COUNTRY_MESH_SCALE and any
        // bounce/shatter transform, staying glued to the fills.
        this.countryMesh.add(this.borderLines);
    }

    addLatLongLines() {
        const radius = 1.001;
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x444444, opacity: 0.3, transparent: true
        });

        for (let lat = -75; lat <= 75; lat += 15) {
            const points = [];
            for (let lng = -180; lng <= 180; lng += 5) {
                points.push(this.latLngToVector3(lat, lng, radius));
            }
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            this.globe.add(new THREE.Line(geometry, lineMaterial));
        }

        for (let lng = -180; lng < 180; lng += 15) {
            const points = [];
            for (let lat = -90; lat <= 90; lat += 5) {
                points.push(this.latLngToVector3(lat, lng, radius));
            }
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            this.globe.add(new THREE.Line(geometry, lineMaterial));
        }

        const equatorMaterial = new THREE.LineBasicMaterial({
            color: 0x666666, opacity: 0.5, transparent: true
        });
        const equatorPoints = [];
        for (let lng = -180; lng <= 180; lng += 5) {
            equatorPoints.push(this.latLngToVector3(0, lng, radius));
        }
        const equatorGeometry = new THREE.BufferGeometry().setFromPoints(equatorPoints);
        this.globe.add(new THREE.Line(equatorGeometry, equatorMaterial));
    }

    async loadGlobe(onProgress, onComplete, onError) {
        try {
            console.log('Loading textured globe...');
            if (onProgress) onProgress(5, 'Fetching globe data...');

            const idPromise = fetch('assets/world-id.bin').then(r => {
                if (!r.ok) throw new Error(`Failed to fetch world-id.bin: ${r.status}`);
                return r.arrayBuffer();
            });
            const palettePromise = fetch('assets/country-palette.bin').then(r => {
                if (!r.ok) throw new Error(`Failed to fetch country-palette.bin: ${r.status}`);
                return r.arrayBuffer();
            });
            const meshPromise = fetch('assets/world-mesh.bin').then(r => {
                if (!r.ok) throw new Error(`Failed to fetch world-mesh.bin: ${r.status}`);
                return r.arrayBuffer();
            });
            const metaPromise = fetch('assets/country-meta.json').then(r => {
                if (!r.ok) throw new Error(`Failed to fetch country-meta.json: ${r.status}`);
                return r.json();
            });

            // Capital cities are an optional sidecar (like label-config/country-colors):
            // fail soft to {} so a missing file never blocks the globe from loading.
            const capitalsPromise = fetch('assets/capitals.json')
                .then(r => r.ok ? r.json() : {})
                .catch(() => ({}));

            // Border edges are optional too: fail soft to null so a missing asset
            // just means "no borders available", never a failed load.
            const borderPromise = fetch('assets/world-border-lines.bin')
                .then(r => r.ok ? r.arrayBuffer() : null)
                .catch(() => null);

            const [idBuffer, paletteBuffer, meshBuffer, meta, capitals, borderBuffer] =
                await Promise.all([idPromise, palettePromise, meshPromise, metaPromise, capitalsPromise, borderPromise]);

            this.capitals = capitals || {};

            if (onProgress) onProgress(70, 'Building globe...');

            this.idW = meta.idWidth;
            this.idH = meta.idHeight;
            this.idBytes = new Uint8Array(idBuffer);
            const expected = this.idW * this.idH * 2;
            if (this.idBytes.length !== expected) {
                throw new Error(`world-id.bin size mismatch: got ${this.idBytes.length}, expected ${expected}`);
            }
            // Note: idBytes stays CPU-side for O(1) picking. The GPU never sees the
            // ID buffer in this build — country IDs come from a per-vertex attribute
            // on the merged country mesh instead.

            // Country palette: 256×1 RGBA. RGB = country color, A = visibility.
            const paletteBytes = new Uint8Array(paletteBuffer);
            if (paletteBytes.length !== PALETTE_W * 4) {
                throw new Error(`country-palette.bin size mismatch: got ${paletteBytes.length}, expected ${PALETTE_W * 4}`);
            }
            this.paletteDefaults = new Uint8Array(paletteBytes); // mutable reset baseline (tracks the active scheme)
            this.paletteOriginal = new Uint8Array(paletteBytes); // immutable build palette (Vibrant restore + shade derivation)
            const paletteTex = new THREE.DataTexture(paletteBytes, PALETTE_W, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
            paletteTex.minFilter = THREE.NearestFilter;
            paletteTex.magFilter = THREE.NearestFilter;
            paletteTex.generateMipmaps = false;
            paletteTex.needsUpdate = true;
            this.paletteTexture = paletteTex;

            const oceanColor = meta.oceanColor || [6, 26, 51];

            this.material = new THREE.ShaderMaterial({
                uniforms: {
                    uPaletteTex: { value: paletteTex },
                    uPaletteW: { value: PALETTE_W },
                    uSelectedId: { value: 0 },
                    uSelectedColor: { value: new THREE.Color(1.0, 1.0, 1.0) },
                    uFlashId: { value: 0 },
                    uFlashColor: { value: new THREE.Color(0, 1, 0) },
                    uFlashAlpha: { value: 0 },
                    uShowCountries: { value: 1 },
                    uOceanColor: { value: new THREE.Color(oceanColor[0] / 255, oceanColor[1] / 255, oceanColor[2] / 255) },
                    // Lighting starts at 0 (black globe) and is ramped up to
                    // LIGHTING_TARGETS by fadeInLighting() once the texture loads.
                    uAmbient: { value: new THREE.Color(0, 0, 0) },
                    uDiffuse: { value: 0.0 },
                    // Camera-relative light (view space) + glossy specular sheen.
                    // Direction points up/left/toward-camera so the visible face
                    // is always lit and the highlight sits off-center. Tune live.
                    uLightDir: { value: new THREE.Vector3(-0.4, 0.5, 1.0) },
                    uSpecStrength: { value: 0.0 }, // target 0.18
                    uShininess: { value: 12.0 }, // 24
                    uSpecColor: { value: new THREE.Color(1.0, 1.0, 1.0) },
                    uOceanSpecBoost: { value: 1.7 }
                },
                vertexShader: VERTEX_SHADER,
                fragmentShader: FRAGMENT_SHADER,
                side: THREE.FrontSide,
                // Polygon offset prevents flicker where neighboring countries share
                // borders and produce coincident triangle edges from the source GeoJSON.
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1
            });

            // Ocean sphere — the same shader runs with aCountryId=0 everywhere,
            // which falls through to the ocean-color uniform. Visible wherever
            // the country mesh isn't drawn.
            const oceanGeo = new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
            const oceanIds = new Uint8Array(oceanGeo.attributes.position.count);
            oceanGeo.setAttribute('aCountryId', new THREE.BufferAttribute(oceanIds, 1));
            this.oceanMesh = new THREE.Mesh(oceanGeo, this.material);
            this.oceanMesh.userData.isGlobeSurface = true;
            this.removePlaceholder();
            this.globe.add(this.oceanMesh);

            // Merged country mesh — vector polygon fills, one draw call.
            this.countryMesh = this._buildCountryMesh(meshBuffer);
            this.countryMesh.scale.setScalar(COUNTRY_MESH_SCALE);
            this.globe.add(this.countryMesh);

            // Country borders — a line sharing the fill mesh's exact vertices, so
            // it sits on the fills with no gap or parallax (a depth bias, not a
            // radial lift, keeps it from z-fighting). Added as a child of the
            // country mesh so it inherits the same scale + any animation transform.
            this._buildBorderLines(borderBuffer);

            if (onProgress) onProgress(85, 'Indexing countries...');

            // Build country lookups + centroid records (compatible with existing
            // consumers that expect [{name, centroid: Vector3, meshRef}]).
            this.nameToId = meta.nameToId || {};
            this.idToName = meta.idToName || {};
            this.countriesById = [];
            this.countryCentroids = [];

            for (const c of (meta.countries || [])) {
                const centroid = new THREE.Vector3(c.centroid[0], c.centroid[1], c.centroid[2]);
                const record = {
                    id: c.id,
                    name: c.name,
                    centroid,
                    bbox: c.bbox,
                    fullBounds: c.fullBounds || null, // antimeridian-aware framing bounds (country map)
                    // Dependency-only fields (Greenland, Puerto Rico, …): own flag
                    // code, sovereign parent, and optional pop/area/lang.
                    iso: c.iso || null,
                    parent: c.parent || null,
                    info: c.info || null
                };
                this.countriesById[c.id] = record;
                this.countryCentroids.push({ name: c.name, centroid, meshRef: null });
            }

            state.set('countries.list', [], false);
            state.set('countries.centroids', this.countryCentroids, false);

            if (onProgress) onProgress(100, 'Complete!');

            console.log(`Loaded ${this.countryCentroids.length} countries (vector mesh)`);
            if (onComplete) onComplete([]);
        } catch (error) {
            console.error('Error loading textured globe:', error);
            if (onError) onError(error);
        }
    }

    /**
     * Pick a country at a screen ray. Pass the world-space ray from the
     * Three.js raycaster: `raycaster.ray`. Returns `{id, name}` or null.
     */
    pick(worldRay) {
        if (!this.idBytes || !this.globe) return null;

        // Transform ray into globe-local space so picking respects rotation.
        this._tmpMat.copy(this.globe.matrixWorld).invert();
        this._tmpRay.copy(worldRay).applyMatrix4(this._tmpMat);

        // Ray-sphere intersection at origin, radius SPHERE_RADIUS.
        const o = this._tmpRay.origin;
        const d = this._tmpRay.direction;
        const b = o.dot(d);
        const c = o.dot(o) - SPHERE_RADIUS * SPHERE_RADIUS;
        const disc = b * b - c;
        if (disc < 0) return null;
        const sqrtDisc = Math.sqrt(disc);
        const t = -b - sqrtDisc;
        if (t < 0) return null;

        this._tmpVec.copy(o).addScaledVector(d, t);
        const nx = this._tmpVec.x;
        const ny = this._tmpVec.y;
        const nz = this._tmpVec.z;

        // Mirror the shader's UV derivation.
        let theta = Math.atan2(-nz, nx);
        if (theta < 0) theta += 2 * Math.PI;
        const u = theta / (2 * Math.PI);
        const v = Math.acos(Math.max(-1, Math.min(1, ny))) / Math.PI;

        let px = Math.floor(u * this.idW);
        let py = Math.floor(v * this.idH);
        if (px < 0) px = 0;
        else if (px >= this.idW) px = this.idW - 1;
        if (py < 0) py = 0;
        else if (py >= this.idH) py = this.idH - 1;

        const idx = (py * this.idW + px) * 2;
        const id = this.idBytes[idx] * 256 + this.idBytes[idx + 1];
        if (id === 0) return null;
        const name = this.idToName[id] || null;
        if (!name) return null;
        // `point` is the local-space hit on the unit sphere — same frame as the
        // stored country centroids — so callers can focus exactly where the user
        // clicked rather than on the country's (possibly distant) centroid.
        return { id, name, point: this._tmpVec.clone() };
    }

    setSelectedCountry(name) {
        if (!this.material) return;
        if (!name) {
            this.material.uniforms.uSelectedId.value = 0;
            return;
        }
        const id = this.nameToId[name];
        if (id === undefined) return;
        this.material.uniforms.uSelectedId.value = id;
    }

    clearSelection() {
        if (!this.material) return;
        this.material.uniforms.uSelectedId.value = 0;
    }

    /**
     * Flash a country with a color for a short duration. The flash uses an
     * additional uniform pair so it composes on top of any current selection.
     */
    flashCountry(name, hexColor, durationMs = 500) {
        if (!this.material) return;
        const id = this.nameToId[name];
        if (id === undefined) return;
        const color = new THREE.Color(hexColor);
        this.material.uniforms.uFlashId.value = id;
        this.material.uniforms.uFlashColor.value = color;
        this.material.uniforms.uFlashAlpha.value = 1;
        this.flashTimer = { id, color, startTime: performance.now(), duration: durationMs };
    }

    updateFlash() {
        if (!this.flashTimer || !this.material) return;
        const now = performance.now();
        const t = (now - this.flashTimer.startTime) / this.flashTimer.duration;
        if (t >= 1) {
            this.material.uniforms.uFlashAlpha.value = 0;
            this.material.uniforms.uFlashId.value = 0;
            this.flashTimer = null;
        } else {
            this.material.uniforms.uFlashAlpha.value = 1 - t;
        }
    }

    setCountryColor(name, rgb01) {
        if (!this.paletteTexture) return;
        const id = this.nameToId[name];
        if (id === undefined || id < 1 || id >= PALETTE_W) return;
        const data = this.paletteTexture.image.data;
        data[id * 4] = Math.max(0, Math.min(255, Math.round(rgb01[0] * 255)));
        data[id * 4 + 1] = Math.max(0, Math.min(255, Math.round(rgb01[1] * 255)));
        data[id * 4 + 2] = Math.max(0, Math.min(255, Math.round(rgb01[2] * 255)));
        data[id * 4 + 3] = 255;
        this.paletteTexture.needsUpdate = true;
    }

    /** Restore a country to its build-time default color and full visibility. */
    resetCountryColor(name) {
        if (!this.paletteTexture || !this.paletteDefaults) return;
        const id = this.nameToId[name];
        if (id === undefined || id < 1 || id >= PALETTE_W) return;
        const data = this.paletteTexture.image.data;
        const off = id * 4;
        data[off] = this.paletteDefaults[off];
        data[off + 1] = this.paletteDefaults[off + 1];
        data[off + 2] = this.paletteDefaults[off + 2];
        data[off + 3] = this.paletteDefaults[off + 3];
        this.paletteTexture.needsUpdate = true;
    }

    /** Back-compat alias for callers still referencing the override-era API. */
    clearCountryColor(name) {
        this.resetCountryColor(name);
    }

    /**
     * Set the color the selected country is tinted with. The selection process
     * itself is unchanged (still driven by uSelectedId) — this only changes the
     * tint. Accepts a hex (0xRRGGBB / '#rrggbb') or an [r,g,b] 0–1 triple.
     */
    setHighlightColor(color) {
        if (!this.material) return;
        const u = this.material.uniforms.uSelectedColor.value;
        if (Array.isArray(color)) u.setRGB(color[0], color[1], color[2]);
        else u.set(color);
    }

    /**
     * Country borders — a line that shares the fill mesh's vertices (built in
     * _buildBorderLines). These drive its visibility/opacity/color; all are
     * safe no-ops before the line is built or if the asset is missing.
     */
    setBorderVisible(visible) {
        this._borderVisible = !!visible;
        if (this.borderLines) this.borderLines.visible = this._borderVisible;
    }

    setBorderOpacity(opacity) {
        this._borderOpacity = Math.max(0, Math.min(1, opacity));
        if (this.borderMaterial) this.borderMaterial.uniforms.uOpacity.value = this._borderOpacity;
    }

    setBorderColor(hex) {
        this._borderColor = hex;
        if (this.borderMaterial) this.borderMaterial.uniforms.uColor.value.set(hex);
    }

    // WebGL caps line width at 1px, so the border is a constant 1px at every
    // zoom regardless of this value; kept for API compatibility.
    setBorderWidth(_pixels) { /* no-op: GL line width is fixed at 1px */ }

    /**
     * Recolor every country at once (the engine behind color schemes). `rgbById`
     * maps a country id (1…255) to an [r,g,b] 0–255 triple. Writes RGB into the
     * live palette texture AND into paletteDefaults (preserving each entry's
     * alpha/visibility byte) so resetCountryColor returns to the active scheme,
     * not the build-time palette. Pass `globeManager.paletteOriginal` slices for
     * an exact Vibrant restore.
     */
    applyBaseColors(rgbById) {
        if (!this.paletteTexture || !this.paletteDefaults) return;
        const data = this.paletteTexture.image.data;
        for (let id = 1; id < PALETTE_W; id++) {
            const rgb = rgbById[id];
            if (!rgb) continue;
            const off = id * 4;
            const r = Math.max(0, Math.min(255, Math.round(rgb[0])));
            const g = Math.max(0, Math.min(255, Math.round(rgb[1])));
            const b = Math.max(0, Math.min(255, Math.round(rgb[2])));
            data[off] = r; data[off + 1] = g; data[off + 2] = b; // alpha (off+3) untouched
            this.paletteDefaults[off] = r;
            this.paletteDefaults[off + 1] = g;
            this.paletteDefaults[off + 2] = b;
        }
        this.paletteTexture.needsUpdate = true;
    }

    applyColorOverrides(config) {
        if (!config || !this.paletteTexture) return;
        // Match country-colors.json's flexible name-matching against the
        // canonical names in nameToId.
        for (const configName in config) {
            const rgb = config[configName];
            if (!Array.isArray(rgb) || rgb.length < 3) continue;
            const id = this._lookupIdLoose(configName);
            if (id === undefined) continue;
            const data = this.paletteTexture.image.data;
            data[id * 4] = Math.max(0, Math.min(255, Math.round(rgb[0] * 255)));
            data[id * 4 + 1] = Math.max(0, Math.min(255, Math.round(rgb[1] * 255)));
            data[id * 4 + 2] = Math.max(0, Math.min(255, Math.round(rgb[2] * 255)));
            data[id * 4 + 3] = 255;
        }
        this.paletteTexture.needsUpdate = true;
    }

    _lookupIdLoose(name) {
        if (this.nameToId[name] !== undefined) return this.nameToId[name];
        const target = name.toLowerCase().replace(/\s+/g, '');
        for (const canonical in this.nameToId) {
            const c = canonical.toLowerCase().replace(/\s+/g, '');
            if (c === target || c.includes(target) || target.includes(c)) {
                return this.nameToId[canonical];
            }
        }
        return undefined;
    }

    /**
     * Emit only countries whose palette entry differs from the build-time default.
     * Output format is unchanged from the old override-texture serializer so
     * existing label-config / country-colors.json consumers keep working.
     */
    serializeColorOverrides() {
        const out = {};
        if (!this.paletteTexture || !this.paletteDefaults) return out;
        const data = this.paletteTexture.image.data;
        const def = this.paletteDefaults;
        for (let id = 1; id < PALETTE_W; id++) {
            const off = id * 4;
            if (data[off] === def[off]
                && data[off + 1] === def[off + 1]
                && data[off + 2] === def[off + 2]
                && data[off + 3] === def[off + 3]) continue;
            const name = this.idToName[id];
            if (!name) continue;
            out[name] = [
                data[off] / 255,
                data[off + 1] / 255,
                data[off + 2] / 255
            ];
        }
        return out;
    }

    /**
     * Show only the listed countries; everyone else renders as ocean.
     * Coastline overlay is unaffected — borders are always drawn.
     */
    showOnly(names) {
        if (!this.paletteTexture) return;
        const data = this.paletteTexture.image.data;
        const allow = new Set();
        for (const name of names) {
            const id = this._lookupIdLoose(name);
            if (id !== undefined) allow.add(id);
        }
        for (let id = 1; id < PALETTE_W; id++) {
            data[id * 4 + 3] = allow.has(id) ? 255 : 0;
        }
        this.paletteTexture.needsUpdate = true;
    }

    /** Restore full visibility for every country (alpha=1 from build defaults). */
    showAll() {
        if (!this.paletteTexture || !this.paletteDefaults) return;
        const data = this.paletteTexture.image.data;
        for (let id = 1; id < PALETTE_W; id++) {
            data[id * 4 + 3] = this.paletteDefaults[id * 4 + 3];
        }
        this.paletteTexture.needsUpdate = true;
    }

    hideCountry(name) {
        if (!this.paletteTexture) return;
        const id = this._lookupIdLoose(name);
        if (id === undefined || id < 1 || id >= PALETTE_W) return;
        this.paletteTexture.image.data[id * 4 + 3] = 0;
        this.paletteTexture.needsUpdate = true;
    }

    /** Highlighted countries stay at full color; everyone else fades toward ocean. */
    fadeOthers(names, dimAlpha = 0.25) {
        if (!this.paletteTexture) return;
        const data = this.paletteTexture.image.data;
        const focus = new Set();
        for (const name of names) {
            const id = this._lookupIdLoose(name);
            if (id !== undefined) focus.add(id);
        }
        const dim = Math.max(0, Math.min(255, Math.round(dimAlpha * 255)));
        for (let id = 1; id < PALETTE_W; id++) {
            data[id * 4 + 3] = focus.has(id) ? 255 : dim;
        }
        this.paletteTexture.needsUpdate = true;
    }

    setShowCountries(show) {
        if (!this.material) return;
        this.material.uniforms.uShowCountries.value = show ? 1 : 0;
    }

    getCentroids() {
        return this.countryCentroids;
    }

    /**
     * @returns {{id, name, centroid: Vector3, bbox} | null}
     */
    getCountryByName(name) {
        const id = this.nameToId[name];
        if (id === undefined) return null;
        return this.countriesById[id] || null;
    }

    getCountryNames() {
        return Object.keys(this.nameToId);
    }

    /**
     * @returns {Object} {countryName: {name, lat, lng}} capital map (may be empty)
     */
    getCapitalsData() {
        return this.capitals;
    }

    /**
     * @returns {{name, lat, lng} | null} the capital entry for a country, or null
     */
    getCapital(name) {
        return this.capitals[name] || null;
    }

    /**
     * Build (once) a canvas texture of a small black dot ringed by a black
     * circle — a simple location marker.
     */
    _buildCapitalIconTexture() {
        if (this._capitalIconTexture) return this._capitalIconTexture;
        const S = 64;
        const c = S / 2;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = S;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#000000';
        ctx.strokeStyle = '#000000';

        // Outer ring (stroked circle) with a transparent gap to the inner dot.
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(c, c, 24, 0, Math.PI * 2);
        ctx.stroke();

        // Inner filled dot.
        ctx.beginPath();
        ctx.arc(c, c, 9, 0, Math.PI * 2);
        ctx.fill();

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        this._capitalIconTexture = tex;
        return tex;
    }

    /**
     * Drop (or move) a small city-icon marker at a capital's lat/lng. The marker
     * lives inside the globe group so it rotates with the surface. Used by the
     * capitals quiz to reveal where a capital sits once the answer is shown.
     */
    showCapitalMarker(lat, lng) {
        if (!this.globe) return;
        if (!this.capitalMarker) {
            const mat = new THREE.SpriteMaterial({
                map: this._buildCapitalIconTexture(),
                depthTest: false,
                transparent: true
            });
            this.capitalMarker = new THREE.Sprite(mat);
            this.capitalMarker.scale.setScalar(0.0055);
            this.capitalMarker.renderOrder = 999; // draw on top of the country fills
            this.globe.add(this.capitalMarker);
        }
        const pos = this.latLngToVector3(lat, lng, SPHERE_RADIUS, 0.015);
        this.capitalMarker.position.copy(pos);
        this.capitalMarker.visible = true;
    }

    /**
     * Hide the capital marker (between questions / on quiz end).
     */
    clearCapitalMarker() {
        if (this.capitalMarker) this.capitalMarker.visible = false;
    }

    /**
     * Build a {name: {iso, parent, pop, area, lang}} map for every dependency /
     * overseas territory baked into the assets (entries carrying an iso code).
     * Merged into the runtime countryData table so the flag panel can show the
     * territory's own flag and its sovereign parent.
     * @returns {Object}
     */
    getDependencyData() {
        const out = {};
        for (const rec of this.countriesById) {
            if (!rec || !rec.iso) continue;
            const info = rec.info || {};
            out[rec.name] = {
                iso: rec.iso,
                parent: rec.parent || null,
                pop: info.pop !== undefined ? info.pop : 'N/A',
                area: info.area !== undefined ? info.area : 'N/A',
                lang: info.lang !== undefined ? info.lang : 'N/A'
            };
        }
        return out;
    }

    /** Deprecated — countries are no longer separate meshes. */
    getCountries() {
        return [];
    }

    getGlobe() {
        return this.globe;
    }

    /**
     * The ocean sphere is the base surface — visible wherever no country is
     * drawn. Returned for any consumer that needs a "globe surface" reference.
     */
    getBaseSphere() {
        return this.oceanMesh;
    }

    /** For raycasting: the ocean sphere covers the entire globe surface. */
    getSphereMesh() {
        return this.oceanMesh;
    }
}
