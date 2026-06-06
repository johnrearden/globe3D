/**
 * Country Map Module
 * --------------------------------------------------------------------------
 * Full-screen, zoomable 2D vector map of a single selected country (geographic
 * features + capital city), shown on top of the 3D globe and dismissed with a
 * Back button. Rendered with MapLibre GL JS reading Protomaps PMTiles vector
 * tiles.
 *
 * Self-contained by design (see CLAUDE.md "Code Organization"): this module
 * pulls MapLibre + PMTiles via dynamic ESM import, builds its own DOM (the
 * full-screen view AND the "View 2D Map" button on the country info panel),
 * and attaches its own listeners. The only thing index.html does is import and
 * instantiate it. Styling lives in styles.css.
 *
 * Tile source is a single constant: flip PMTILES_URL between the temp
 * deployment static file and the Cloudflare endpoint without touching anything
 * else. While PMTILES_URL is null we render a sample MapLibre style so the
 * end-to-end flow can be exercised before any tileset exists (Phase 1).
 */

// ── Tile configuration ────────────────────────────────────────────────────
// null → public MapLibre demo style (no tiles of our own).
// Temp deploy:  'pmtiles://./assets/planet-z9.pmtiles'  (relative → resolves
//               under /globe/, and against localhost:8000 for local testing).
// Cloudflare:   the R2/Worker endpoint.
const PMTILES_URL = 'pmtiles://./assets/planet-z9.pmtiles';

// Protomaps basemap theme + shared font/sprite assets.
const PM_THEME = 'light';
const PM_GLYPHS = 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf';
const PM_SPRITE = 'https://protomaps.github.io/basemaps-assets/sprites/v4/light';
const PM_ATTRIB = '<a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap</a> &middot; Protomaps';

const SAMPLE_STYLE = 'https://demotiles.maplibre.org/style.json';

// Feature-toggle groups, keyed by Protomaps `source-layer`. Each checkbox flips
// every style layer in the group. Only groups with layers present are shown.
const TOGGLE_GROUPS = [
    { key: 'labels', label: 'Place labels', sourceLayers: ['places', 'pois'] },
    { key: 'roads', label: 'Roads', sourceLayers: ['roads'] },
    { key: 'water', label: 'Water', sourceLayers: ['water'] },
    { key: 'land', label: 'Land use', sourceLayers: ['landuse', 'landcover'] },
    { key: 'boundaries', label: 'Boundaries', sourceLayers: ['boundaries'] }
];

// Per-country outline polygons (built by build-textures.js). Relative path so it
// resolves under any deploy sub-path (e.g. /globe/). Used for the exact mask.
const COUNTRIES_GEOJSON_URL = './assets/countries.geojson';

// ESM builds of the mapping libs, loaded on first use (keeps app startup light).
const MAPLIBRE_ESM = 'https://esm.sh/maplibre-gl@4';
const PMTILES_ESM = 'https://esm.sh/pmtiles@4';
const THEME_ESM = 'https://esm.sh/protomaps-themes-base@4.5.0';
const MAPLIBRE_CSS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4/dist/maplibre-gl.css';

export class CountryMap {
    /**
     * @param {Object} deps
     * @param {Object} deps.globeManager - getCountryByName(name) / getCapital(name)
     * @param {Object} deps.sceneManager - start()/stop() the globe render loop
     * @param {Object} deps.flagRenderer - getCurrentCountry() for the panel button
     * @param {Function} [deps.onEnter] - index.html idle-timer suspend hook
     * @param {Function} [deps.onExit]  - index.html idle-timer resume hook
     */
    constructor({ globeManager, sceneManager, flagRenderer, onEnter, onExit }) {
        this.globeManager = globeManager;
        this.sceneManager = sceneManager;
        this.flagRenderer = flagRenderer;
        this.onEnter = onEnter || (() => {});
        this.onExit = onExit || (() => {});

        this.map = null;          // MapLibre map instance (lazy, reused)
        this._libs = null;        // memoised { maplibregl, pmtiles }
        this._active = false;     // is the full-screen map currently shown?
        this.currentCountry = null;

        // DOM nodes this module owns (created in init()).
        this.viewEl = null;
        this.canvasEl = null;
        this.titleEl = null;
        this.togglesEl = null;
        this.viewMapBtn = null;
    }

    /** Build DOM + wire listeners. Does not load MapLibre (deferred to show()). */
    init() {
        this._buildView();
        this._buildPanelButton();
        this._attachListeners();
    }

    isShowing() {
        return this._active;
    }

    /**
     * Open the full-screen 2D map for a country.
     * @param {string} countryName
     */
    async show(countryName) {
        if (!countryName) return;
        const rec = this.globeManager.getCountryByName(countryName);
        if (!rec || !rec.bbox) {
            console.warn('[CountryMap] no bbox for', countryName);
            return;
        }
        this.currentCountry = countryName;
        this._bbox = rec.bbox;
        this._bounds = this._toBounds(rec); // {west,south,east,north,wraps}
        this._capital = this.globeManager.getCapital(countryName); // {name,lat,lng}|null
        if (this.titleEl) this.titleEl.textContent = countryName;

        // Enter map mode: CSS (body.map-mode) shows our view and hides the globe
        // canvas + chrome; we stop the globe loop and suspend idle bookkeeping.
        this._active = true;
        document.body.classList.add('map-mode');
        this.sceneManager.stop();
        this.onEnter();

        const { maplibregl } = await this._loadLibs();
        if (!this._active) return; // user backed out while libs loaded

        if (!this.map) {
            this.map = new maplibregl.Map({
                container: this.canvasEl,
                style: this._buildStyle(),
                attributionControl: { compact: true },
                dragRotate: false,
                pitchWithRotate: false
            });
            this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
            this.map.on('load', () => { this._initLayers(); this._applyCountry(); });
        } else {
            this._applyCountry();
        }

        // The container just became visible — MapLibre must re-measure it.
        this.map.resize();
    }

    /** Return to the globe. */
    hide() {
        if (!this._active) return;
        this._active = false;
        this.currentCountry = null;
        document.body.classList.remove('map-mode');
        this.sceneManager.start();
        this.onExit();
    }

    // ── internals ──────────────────────────────────────────────────────────

    /**
     * Frame + isolate the current country: fit to its bbox, clamp panning,
     * dim everything outside its exact outline (bbox fallback), outline it,
     * and drop a capital marker.
     */
    async _applyCountry() {
        if (!this.map || !this._bbox) return;
        const name = this.currentCountry;
        const b = this._bbox;

        this._frameCountry();
        this._updateCapitalMarker();

        // Prefer the exact polygon; fall back to the bbox rectangle if the
        // outline asset is missing or the country isn't in it (e.g. a dependency).
        const geom = await this._countryGeometry(name);
        if (this.currentCountry !== name || !this._active) return; // switched/closed mid-fetch
        const maskSrc = this.map.getSource('cm-mask');
        const outlineSrc = this.map.getSource('cm-outline');
        if (geom) {
            if (maskSrc) maskSrc.setData(this._maskFromGeometry(geom));
            if (outlineSrc) outlineSrc.setData({ type: 'Feature', properties: {}, geometry: geom });
        } else {
            if (maskSrc) maskSrc.setData(this._maskFromBbox(b));
            if (outlineSrc) outlineSrc.setData(this._bboxOutline(b));
        }
    }

    /** Framing bounds for a country: precomputed fullBounds, or bbox fallback. */
    _toBounds(rec) {
        const fb = rec.fullBounds;
        if (fb && isFinite(fb.west)) {
            return { west: fb.west, south: fb.south, east: fb.east, north: fb.north, wraps: !!fb.wraps };
        }
        const b = rec.bbox;
        return { west: b.minLng, south: b.minLat, east: b.maxLng, north: b.maxLat, wraps: false };
    }

    /**
     * Fit the whole country with the tighter axis ~95% covered (per-side padding
     * = 2.5% of each viewport dimension, so coverage is consistent across aspect
     * ratios). Then set a zoom-out floor at this whole-country view, and — for
     * non-wrapping countries — clamp panning to the fitted viewport so it can
     * never crop. Re-runnable on resize/orientation change.
     */
    _frameCountry() {
        if (!this.map || !this._bounds) return;
        const m = this.map;
        const cv = m.getCanvas();
        const padX = cv.clientWidth * 0.025;
        const padY = cv.clientHeight * 0.025;
        const b = this._bounds;
        // For antimeridian-wrapping bounds, push east past +180 so west < east and
        // the framing goes the short way across the dateline.
        const east = b.wraps ? b.east + 360 : b.east;

        m.setMaxBounds(null);
        m.setMinZoom(0);
        m.fitBounds([[b.west, b.south], [east, b.north]], {
            padding: { top: padY, bottom: padY, left: padX, right: padX },
            animate: false
        });
        // Whole-country view is the most zoomed-out the user can go.
        m.setMinZoom(m.getZoom());
        // Pan clamp from the fitted viewport (⊇ country → never crops). Skip for
        // wrapping bounds: antimeridian maxBounds is unreliable in MapLibre.
        if (!b.wraps) m.setMaxBounds(m.getBounds());
    }

    /** Add the mask + outline sources/layers once (called on first style load). */
    _initLayers() {
        if (this.map.getSource('cm-mask')) return;
        const empty = { type: 'FeatureCollection', features: [] };
        this.map.addSource('cm-mask', { type: 'geojson', data: empty });
        this.map.addSource('cm-outline', { type: 'geojson', data: empty });
        this.map.addLayer({
            id: 'cm-mask-fill',
            type: 'fill',
            source: 'cm-mask',
            paint: { 'fill-color': '#0a0a12', 'fill-opacity': 0.72 }
        });
        this.map.addLayer({
            id: 'cm-outline-line',
            type: 'line',
            source: 'cm-outline',
            paint: { 'line-color': '#4da3ff', 'line-width': 1.5, 'line-opacity': 0.9 }
        });
        this._buildToggles();
    }

    /**
     * Build the feature-toggle checkboxes from the live style — one per group
     * that actually has layers (skips the sample style, which has none). Each
     * checkbox flips visibility on every Protomaps layer in its group.
     */
    _buildToggles() {
        if (!this.togglesEl || !this.map.getStyle) return;
        this.togglesEl.innerHTML = '';
        const styleLayers = this.map.getStyle().layers || [];
        for (const group of TOGGLE_GROUPS) {
            const ids = styleLayers
                .filter(l => l.source === 'protomaps' && group.sourceLayers.includes(l['source-layer']))
                .map(l => l.id);
            if (!ids.length) continue;

            const label = document.createElement('label');
            label.className = 'cm-toggle';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = true;
            cb.addEventListener('change', () => {
                const vis = cb.checked ? 'visible' : 'none';
                for (const id of ids) {
                    if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', vis);
                }
            });
            label.appendChild(cb);
            label.appendChild(document.createTextNode(' ' + group.label));
            this.togglesEl.appendChild(label);
        }
    }

    /** Fetch + index the per-country outlines once (name → geometry). */
    _loadCountries() {
        if (!this._countriesPromise) {
            this._countriesPromise = fetch(COUNTRIES_GEOJSON_URL)
                .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
                .then(fc => {
                    const idx = new Map();
                    for (const f of fc.features) idx.set(f.properties.name, f.geometry);
                    return idx;
                })
                .catch(err => {
                    console.warn('[CountryMap] countries.geojson unavailable, using bbox mask:', err.message);
                    return new Map();
                });
        }
        return this._countriesPromise;
    }

    async _countryGeometry(name) {
        const idx = await this._loadCountries();
        return idx.get(name) || null;
    }

    /**
     * World rectangle with the country's exterior rings punched out as holes —
     * the fill renders everywhere except inside the country's true borders.
     */
    _maskFromGeometry(geom) {
        const outer = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
        const polys = geom.type === 'MultiPolygon' ? geom.coordinates
            : geom.type === 'Polygon' ? [geom.coordinates] : [];
        const holes = [];
        for (const poly of polys) {
            if (poly[0] && poly[0].length >= 4) holes.push(poly[0]); // exterior ring
        }
        return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [outer, ...holes] } };
    }

    /** Bbox-hole fallback mask (when no exact outline is available). */
    _maskFromBbox(b) {
        const outer = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
        const hole = [
            [b.minLng, b.minLat], [b.maxLng, b.minLat],
            [b.maxLng, b.maxLat], [b.minLng, b.maxLat], [b.minLng, b.minLat]
        ];
        return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [outer, hole] } };
    }

    /** Bbox rectangle outline (fallback). */
    _bboxOutline(b) {
        return {
            type: 'Feature', properties: {},
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [b.minLng, b.minLat], [b.maxLng, b.minLat],
                    [b.maxLng, b.maxLat], [b.minLng, b.maxLat], [b.minLng, b.minLat]
                ]]
            }
        };
    }

    /**
     * Place/update the capital city marker. Uses a DOM Marker (no glyph/font
     * dependency, so it works on any basemap style).
     */
    _updateCapitalMarker() {
        if (!this._capital) {
            if (this._capitalMarker) { this._capitalMarker.remove(); this._capitalMarker = null; }
            return;
        }
        const { name, lat, lng } = this._capital;
        if (!this._capitalMarker) {
            const el = document.createElement('div');
            el.className = 'cm-capital';
            el.innerHTML = '<span class="cm-capital-dot"></span><span class="cm-capital-label"></span>';
            this._capitalMarker = new this.maplibregl.Marker({ element: el, anchor: 'left' });
        }
        this._capitalMarker.getElement().querySelector('.cm-capital-label').textContent = name;
        this._capitalMarker.setLngLat([lng, lat]).addTo(this.map);
    }

    /** Resolve the MapLibre style: real Protomaps PMTiles source, or the sample fallback. */
    _buildStyle() {
        if (!PMTILES_URL || !this._themeLayers) return SAMPLE_STYLE;
        // protomaps-themes-base v4: layers(source, themeObject) — the theme is an
        // object from namedTheme(name), not the bare name string.
        const theme = this._namedTheme ? this._namedTheme(PM_THEME) : PM_THEME;
        // { lang } is required to include the place/label (symbol) layers —
        // without it the basemap renders no city/country/water names.
        return {
            version: 8,
            glyphs: PM_GLYPHS,
            sprite: PM_SPRITE,
            sources: {
                protomaps: { type: 'vector', url: PMTILES_URL, attribution: PM_ATTRIB }
            },
            layers: this._themeLayers('protomaps', theme, { lang: 'en' })
        };
    }

    /** Dynamically import MapLibre + PMTiles + theme; register pmtiles:// protocol. */
    async _loadLibs() {
        if (this._libs) return this._libs;
        this._injectCss();
        const [mlMod, pmMod, themeMod] = await Promise.all([
            import(MAPLIBRE_ESM),
            import(PMTILES_ESM),
            PMTILES_URL ? import(THEME_ESM) : Promise.resolve(null)
        ]);
        const maplibregl = mlMod.default || mlMod;
        maplibregl.addProtocol('pmtiles', new pmMod.Protocol().tile);
        this.maplibregl = maplibregl;
        if (themeMod) {
            this._themeLayers = themeMod.layers || themeMod.default;
            this._namedTheme = themeMod.namedTheme;
        }
        this._libs = { maplibregl, pmtiles: pmMod };
        return this._libs;
    }

    _injectCss() {
        if (document.getElementById('maplibre-gl-css')) return;
        const link = document.createElement('link');
        link.id = 'maplibre-gl-css';
        link.rel = 'stylesheet';
        link.href = MAPLIBRE_CSS;
        document.head.appendChild(link);
    }

    _buildView() {
        const view = document.createElement('div');
        view.id = 'country-map-view';

        const canvas = document.createElement('div');
        canvas.id = 'country-map-canvas';

        const back = document.createElement('button');
        back.id = 'country-map-back';
        back.type = 'button';
        back.textContent = '◂ Back to Globe';

        const title = document.createElement('div');
        title.id = 'country-map-title';

        const toggles = document.createElement('div');
        toggles.id = 'country-map-toggles';

        view.appendChild(canvas);
        view.appendChild(back);
        view.appendChild(title);
        view.appendChild(toggles);
        document.body.appendChild(view);

        this.viewEl = view;
        this.canvasEl = canvas;
        this.backBtn = back;
        this.titleEl = title;
        this.togglesEl = toggles;
    }

    _buildPanelButton() {
        // Append to the outer panel (not #flag-container-content, which is a flex
        // row) so the button stacks full-width below the flag + info.
        const panel = document.getElementById('flag-container');
        if (!panel) return;
        const btn = document.createElement('button');
        btn.id = 'view-map-btn';
        btn.type = 'button';
        btn.textContent = '🗺 View 2D Map';
        panel.appendChild(btn);
        this.viewMapBtn = btn;
    }

    _attachListeners() {
        if (this.viewMapBtn) {
            this.viewMapBtn.addEventListener('click', () => {
                const name = this.currentCountry || this.flagRenderer.getCurrentCountry();
                this.show(name);
            });
        }
        if (this.backBtn) {
            this.backBtn.addEventListener('click', () => this.hide());
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._active) this.hide();
        });
        // Re-measure and re-frame on resize / orientation change (the tighter
        // axis flips, so the fit must be recomputed). Debounced.
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            if (!this._active || !this.map) return;
            this.map.resize();
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (this._active && this.map) this._frameCountry();
            }, 150);
        });
    }
}
