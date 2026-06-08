/**
 * Country borders — a thin vector line overlay drawn on the globe.
 *
 * Built lazily (on first enable) from assets/countries.geojson — the same
 * per-country outline asset the 2D map already uses — and projected onto the
 * sphere with the globe's own latLngToVector3, reusing the addLatLongLines
 * pattern. One merged THREE.LineSegments → a single draw call. Crisp at any
 * zoom, and no need to upload the 16 MB ID buffer to the GPU.
 *
 * Coastlines (country↔ocean rings) come along for free, which suits the
 * spartan look.
 */

const THREE = (typeof window !== 'undefined') ? window.THREE : undefined;
const COUNTRIES_GEOJSON_URL = 'assets/countries.geojson';
const BORDER_HEIGHT = 0.0035; // above the 1.002 country mesh
const DEFAULT_COLOR = 0x222831;
const DEFAULT_OPACITY = 0.85;
// Max angular span (degrees) of one drawn sub-segment. Long straight borders
// (e.g. the US–Canada 49th parallel) are stored as just two far-apart vertices;
// a single straight 3D chord between them would dip below the sphere and be
// occluded. Subdividing along the lat/lng path keeps the line on the surface.
const MAX_SEG_DEG = 2;

export class BorderLayer {
    constructor({ globeManager } = {}) {
        this.globeManager = globeManager;
        this.mesh = null;
        this.material = null;
        this._building = null;     // in-flight build promise (dedupe)
        this._wantVisible = false; // requested state before the build lands
        this._color = DEFAULT_COLOR;
        this._opacity = DEFAULT_OPACITY;
    }

    isReady() {
        return !!this.mesh;
    }

    /** Show/hide the borders; triggers the lazy build the first time it's shown. */
    setVisible(visible) {
        this._wantVisible = !!visible;
        if (this.mesh) {
            this.mesh.visible = this._wantVisible;
        } else if (visible) {
            this._build();
        }
    }

    setColor(hex) {
        this._color = hex;
        if (this.material) this.material.color.set(hex);
    }

    /** Set border line opacity, 0–1. WebGL caps line width at 1px, so opacity
     *  is the practical way to make the borders read as finer/lighter. */
    setOpacity(opacity) {
        this._opacity = opacity;
        if (this.material) this.material.opacity = opacity;
    }

    async _build() {
        if (this._building) return this._building;
        this._building = (async () => {
            const gm = this.globeManager;
            if (!gm || !gm.globe) return;
            let geojson;
            try {
                const res = await fetch(COUNTRIES_GEOJSON_URL);
                geojson = await res.json();
            } catch (err) {
                console.warn('[BorderLayer] countries.geojson unavailable:', err.message);
                return;
            }

            const positions = [];
            for (const feature of (geojson.features || [])) {
                this._addGeometry(feature.geometry, gm, positions);
            }

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            this.material = new THREE.LineBasicMaterial({
                color: this._color,
                transparent: true,
                opacity: this._opacity,
                depthWrite: false
            });
            this.mesh = new THREE.LineSegments(geometry, this.material);
            this.mesh.renderOrder = 2; // draw after the fills
            this.mesh.visible = this._wantVisible;
            gm.globe.add(this.mesh);
        })();
        return this._building;
    }

    /** Walk a GeoJSON geometry, emitting border segments into `positions`. */
    _addGeometry(geometry, gm, positions) {
        if (!geometry) return;
        if (geometry.type === 'Polygon') {
            for (const ring of geometry.coordinates) this._addRing(ring, gm, positions);
        } else if (geometry.type === 'MultiPolygon') {
            for (const poly of geometry.coordinates) {
                for (const ring of poly) this._addRing(ring, gm, positions);
            }
        }
    }

    /**
     * Emit one ring as line segments (vertex pairs), skipping any segment that
     * jumps the antimeridian (|Δlng| > 180) — the same wrap the graticule avoids.
     * Long segments are subdivided along the lat/lng path so they hug the sphere
     * instead of cutting a straight chord beneath its surface.
     */
    _addRing(ring, gm, positions) {
        for (let i = 0; i + 1 < ring.length; i++) {
            const [lngA, latA] = ring[i];
            const [lngB, latB] = ring[i + 1];
            const dLng = lngB - lngA;
            const dLat = latB - latA;
            if (Math.abs(dLng) > 180) continue; // antimeridian seam

            const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dLng), Math.abs(dLat)) / MAX_SEG_DEG));
            let prev = gm.latLngToVector3(latA, lngA, 1.0, BORDER_HEIGHT);
            for (let s = 1; s <= steps; s++) {
                const t = s / steps;
                const cur = gm.latLngToVector3(latA + dLat * t, lngA + dLng * t, 1.0, BORDER_HEIGHT);
                positions.push(prev.x, prev.y, prev.z, cur.x, cur.y, cur.z);
                prev = cur;
            }
        }
    }

    dispose() {
        if (this.mesh) {
            this.globeManager?.globe?.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.material.dispose();
            this.mesh = null;
            this.material = null;
        }
    }
}
