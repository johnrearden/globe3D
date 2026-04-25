/**
 * Globe Management Module — textured-sphere edition.
 *
 * Replaces the per-country mesh approach with a single SphereGeometry rendered
 * by a custom ShaderMaterial that samples a baked color texture and a country
 * ID texture. Highlighting is a uniform write; picking is an O(1) lookup into
 * a CPU-side copy of the ID texture.
 */

import { state } from '../data/state.js';

const THREE = window.THREE;

const SPHERE_RADIUS = 1.0;
const SPHERE_SEGMENTS = 96;
const OVERRIDE_W = 256;

const VERTEX_SHADER = /* glsl */`
varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vNormalW;

void main() {
    vLocalPosition = position;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

// UV is computed from the local-space position so the mapping matches the
// build-time convention (build-textures.js's negated theta) regardless of
// SphereGeometry's default UV layout.
const FRAGMENT_SHADER = /* glsl */`
precision highp float;

uniform sampler2D uColorTex;
uniform sampler2D uIdTex;
uniform sampler2D uOverrideTex;
uniform float uOverrideW;
uniform float uSelectedId;
uniform float uFlashId;
uniform vec3 uFlashColor;
uniform float uFlashAlpha;
uniform float uShowCountries;
uniform vec3 uOceanColor;
uniform vec3 uAmbient;
uniform float uDiffuse;

varying vec3 vLocalPosition;
varying vec3 vWorldPosition;
varying vec3 vNormalW;

void main() {
    vec3 nrm = normalize(vLocalPosition);
    float theta = atan(-nrm.z, nrm.x);
    if (theta < 0.0) theta += 6.283185307179586;
    float u = theta / 6.283185307179586;
    float v = acos(clamp(nrm.y, -1.0, 1.0)) / 3.141592653589793;

    vec4 baseColor = texture2D(uColorTex, vec2(u, v));

    vec4 idSample = texture2D(uIdTex, vec2(u, v));
    float idHi = floor(idSample.r * 255.0 + 0.5);
    float idLo = floor(idSample.g * 255.0 + 0.5);
    float id = idHi * 256.0 + idLo;

    vec3 color = baseColor.rgb;

    // Per-country override (preserves existing country-colors.json behaviour).
    if (id > 0.5) {
        vec4 override = texture2D(uOverrideTex, vec2((id + 0.5) / uOverrideW, 0.5));
        color = mix(color, override.rgb, override.a);
    }

    if (uShowCountries < 0.5) {
        color = uOceanColor;
    }

    // Selection tints to white (matches old material.color.setHex(0xFFFFFF)).
    if (id > 0.5 && uSelectedId > 0.5 && abs(id - uSelectedId) < 0.5) {
        color = vec3(1.0);
    }

    // Quiz flash overlay.
    if (id > 0.5 && uFlashId > 0.5 && abs(id - uFlashId) < 0.5) {
        color = mix(color, uFlashColor, uFlashAlpha);
    }

    // Camera-aligned directional light + ambient.
    vec3 lightDir = normalize(cameraPosition - vWorldPosition);
    float ndotl = max(dot(normalize(vNormalW), lightDir), 0.0);
    vec3 lit = color * (uAmbient + uDiffuse * ndotl);

    gl_FragColor = vec4(lit, 1.0);
}
`;

export class GlobeManager {
    constructor(scene) {
        this.scene = scene;
        this.globe = null;
        this.sphereMesh = null;
        this.material = null;
        this.colorTexture = null;
        this.idTexture = null;
        this.overrideTexture = null;

        this.idBytes = null;        // Uint8Array, packed [idHi, idLo, ...]
        this.idW = 0;
        this.idH = 0;

        this.countriesById = [];    // sparse, indexed by id
        this.nameToId = {};
        this.idToName = {};
        this.countryCentroids = []; // [{name, centroid: Vector3, meshRef: null}]

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

        state.set('scene.globe', this.globe, false);
        state.set('scene.baseSphere', null, false);

        console.log('GlobeManager initialized (textured-sphere)');
    }

    /**
     * Convert latitude/longitude to 3D vector position on sphere (build-globe
     * convention — the same one used by the build script and label-config.json).
     */
    latLngToVector3(lat, lng, radius = 1, height = 0) {
        const phi = (90 - lat) * Math.PI / 180;
        const theta = -(lng + 180) * Math.PI / 180;
        const r = radius + height;
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.cos(phi);
        const z = r * Math.sin(phi) * Math.sin(theta);
        return new THREE.Vector3(x, y, z);
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
            if (onProgress) onProgress(5, 'Fetching textures...');

            const colorPromise = new Promise((resolve, reject) => {
                const loader = new THREE.TextureLoader();
                loader.load(
                    'assets/world-color.png',
                    (tex) => resolve(tex),
                    (xhr) => {
                        if (onProgress && xhr.total) {
                            const pct = Math.floor((xhr.loaded / xhr.total) * 50);
                            onProgress(5 + pct, `Downloading color map... ${Math.floor(xhr.loaded / xhr.total * 100)}%`);
                        }
                    },
                    (err) => reject(err)
                );
            });
            const idPromise = fetch('assets/world-id.bin').then(r => {
                if (!r.ok) throw new Error(`Failed to fetch world-id.bin: ${r.status}`);
                return r.arrayBuffer();
            });
            const metaPromise = fetch('assets/country-meta.json').then(r => {
                if (!r.ok) throw new Error(`Failed to fetch country-meta.json: ${r.status}`);
                return r.json();
            });

            const [colorTex, idBuffer, meta] = await Promise.all([colorPromise, idPromise, metaPromise]);

            if (onProgress) onProgress(70, 'Building shader...');

            this.idW = meta.idWidth;
            this.idH = meta.idHeight;
            this.idBytes = new Uint8Array(idBuffer);
            const expected = this.idW * this.idH * 2;
            if (this.idBytes.length !== expected) {
                throw new Error(`world-id.bin size mismatch: got ${this.idBytes.length}, expected ${expected}`);
            }

            // Color texture: linear filtering with mipmaps + anisotropy.
            // flipY=false so it matches the ID DataTexture's orientation —
            // both have row 0 = north pole, so v=0 in the shader maps to the
            // north pole for both. Without this, PNG would be flipped relative
            // to the IDs and the globe colors appear vertically inverted.
            colorTex.flipY = false;
            colorTex.colorSpace = THREE.SRGBColorSpace || colorTex.colorSpace;
            colorTex.minFilter = THREE.LinearMipmapLinearFilter;
            colorTex.magFilter = THREE.LinearFilter;
            colorTex.generateMipmaps = true;
            colorTex.wrapS = THREE.RepeatWrapping;
            colorTex.wrapT = THREE.ClampToEdgeWrapping;
            const renderer = state.get('scene.renderer');
            if (renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy) {
                colorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
            }
            colorTex.needsUpdate = true;
            this.colorTexture = colorTex;

            // ID texture: packed into RGBA so it works under WebGL1 without
            // depending on RG/LuminanceAlpha format support. R=idHi, G=idLo.
            const rgbaId = new Uint8Array(this.idW * this.idH * 4);
            for (let i = 0; i < this.idW * this.idH; i++) {
                rgbaId[i * 4] = this.idBytes[i * 2];
                rgbaId[i * 4 + 1] = this.idBytes[i * 2 + 1];
                rgbaId[i * 4 + 2] = 0;
                rgbaId[i * 4 + 3] = 255;
            }
            const idTex = new THREE.DataTexture(rgbaId, this.idW, this.idH, THREE.RGBAFormat, THREE.UnsignedByteType);
            idTex.minFilter = THREE.NearestFilter;
            idTex.magFilter = THREE.NearestFilter;
            idTex.generateMipmaps = false;
            idTex.wrapS = THREE.RepeatWrapping;
            idTex.wrapT = THREE.ClampToEdgeWrapping;
            idTex.needsUpdate = true;
            this.idTexture = idTex;

            // Override texture: 256×1 RGBA. Initially all zeros (no override).
            const overrideData = new Uint8Array(OVERRIDE_W * 4);
            const overrideTex = new THREE.DataTexture(overrideData, OVERRIDE_W, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
            overrideTex.minFilter = THREE.NearestFilter;
            overrideTex.magFilter = THREE.NearestFilter;
            overrideTex.generateMipmaps = false;
            overrideTex.needsUpdate = true;
            this.overrideTexture = overrideTex;

            const oceanColor = meta.oceanColor || [6, 26, 51];

            this.material = new THREE.ShaderMaterial({
                uniforms: {
                    uColorTex: { value: colorTex },
                    uIdTex: { value: idTex },
                    uOverrideTex: { value: overrideTex },
                    uOverrideW: { value: OVERRIDE_W },
                    uSelectedId: { value: 0 },
                    uFlashId: { value: 0 },
                    uFlashColor: { value: new THREE.Color(0, 1, 0) },
                    uFlashAlpha: { value: 0 },
                    uShowCountries: { value: 1 },
                    uOceanColor: { value: new THREE.Color(oceanColor[0] / 255, oceanColor[1] / 255, oceanColor[2] / 255) },
                    uAmbient: { value: new THREE.Color(0.7, 0.7, 0.7) },
                    uDiffuse: { value: 0.8 }
                },
                vertexShader: VERTEX_SHADER,
                fragmentShader: FRAGMENT_SHADER,
                side: THREE.FrontSide
            });

            const sphereGeo = new THREE.SphereGeometry(SPHERE_RADIUS, SPHERE_SEGMENTS, SPHERE_SEGMENTS);
            this.sphereMesh = new THREE.Mesh(sphereGeo, this.material);
            this.sphereMesh.userData.isGlobeSurface = true;
            this.globe.add(this.sphereMesh);

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
                    bbox: c.bbox
                };
                this.countriesById[c.id] = record;
                this.countryCentroids.push({ name: c.name, centroid, meshRef: null });
            }

            state.set('countries.list', [], false);
            state.set('countries.centroids', this.countryCentroids, false);

            if (onProgress) onProgress(100, 'Complete!');

            console.log(`Loaded ${this.countryCentroids.length} countries (textured)`);
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
        return { id, name };
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
        if (!this.overrideTexture) return;
        const id = this.nameToId[name];
        if (id === undefined || id < 1 || id >= OVERRIDE_W) return;
        const data = this.overrideTexture.image.data;
        data[id * 4] = Math.max(0, Math.min(255, Math.round(rgb01[0] * 255)));
        data[id * 4 + 1] = Math.max(0, Math.min(255, Math.round(rgb01[1] * 255)));
        data[id * 4 + 2] = Math.max(0, Math.min(255, Math.round(rgb01[2] * 255)));
        data[id * 4 + 3] = 255;
        this.overrideTexture.needsUpdate = true;
    }

    clearCountryColor(name) {
        if (!this.overrideTexture) return;
        const id = this.nameToId[name];
        if (id === undefined || id < 1 || id >= OVERRIDE_W) return;
        const data = this.overrideTexture.image.data;
        data[id * 4] = 0;
        data[id * 4 + 1] = 0;
        data[id * 4 + 2] = 0;
        data[id * 4 + 3] = 0;
        this.overrideTexture.needsUpdate = true;
    }

    applyColorOverrides(config) {
        if (!config || !this.overrideTexture) return;
        // Match country-colors.json's flexible name-matching against the
        // canonical names in nameToId.
        for (const configName in config) {
            const rgb = config[configName];
            if (!Array.isArray(rgb) || rgb.length < 3) continue;
            const id = this._lookupIdLoose(configName);
            if (id === undefined) continue;
            const data = this.overrideTexture.image.data;
            data[id * 4] = Math.max(0, Math.min(255, Math.round(rgb[0] * 255)));
            data[id * 4 + 1] = Math.max(0, Math.min(255, Math.round(rgb[1] * 255)));
            data[id * 4 + 2] = Math.max(0, Math.min(255, Math.round(rgb[2] * 255)));
            data[id * 4 + 3] = 255;
        }
        this.overrideTexture.needsUpdate = true;
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

    serializeColorOverrides() {
        const out = {};
        if (!this.overrideTexture) return out;
        const data = this.overrideTexture.image.data;
        for (let id = 1; id < OVERRIDE_W; id++) {
            if (data[id * 4 + 3] === 0) continue;
            const name = this.idToName[id];
            if (!name) continue;
            out[name] = [
                data[id * 4] / 255,
                data[id * 4 + 1] / 255,
                data[id * 4 + 2] / 255
            ];
        }
        return out;
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

    /** Deprecated — countries are no longer separate meshes. */
    getCountries() {
        return [];
    }

    getGlobe() {
        return this.globe;
    }

    /**
     * The textured sphere doubles as the ocean (where no country is drawn) and
     * the land. Returned for any consumer that toggles "show base sphere".
     */
    getBaseSphere() {
        return this.sphereMesh;
    }

    /** For raycasting: the single mesh covering the entire globe surface. */
    getSphereMesh() {
        return this.sphereMesh;
    }
}
