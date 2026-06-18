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

import { settingsStore } from '../data/settings-store.js';
import { assetUrl } from '../data/asset-base.js';

// ── Tile configuration ────────────────────────────────────────────────────
// pmtiles:// + the resolved asset base. Local dev → 'pmtiles://./assets/...'
// (resolves under /globe/ and against localhost:8000). Production → the
// Cloudflare R2 endpoint via window.GLOBE3D_ASSET_BASE (see js/data/asset-base.js),
// because the 1.5 GB tileset can't live on Cloudflare Pages.
const PMTILES_URL = `pmtiles://${assetUrl('planet-z9.pmtiles')}`;

// Protomaps basemap shared font/sprite assets (matched to the pre-generated
// 'light' theme layers in assets/pmtiles-layers.json).
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

// Per-country outline polygons (built by build-textures.js). Resolved against the
// asset base (relative in dev, R2 in production). Used for the exact mask.
const COUNTRIES_GEOJSON_URL = assetUrl('countries.geojson');

// Mapping libs are vendored and served same-origin (page-relative paths, no
// leading slash, so they resolve under any deploy sub-path). Avoids depending on
// a third-party ESM CDN at runtime. Loaded on first use (UMD → window globals).
const MAPLIBRE_JS = './js/vendor/maplibre-gl.js';
const MAPLIBRE_CSS = './js/vendor/maplibre-gl.css';
const PMTILES_JS = './js/vendor/pmtiles.js';
// Pre-generated Protomaps theme layers (protomaps-themes-base, light, lang en).
const PM_LAYERS_URL = assetUrl('pmtiles-layers.json');

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
     * @param {Object} [opts]
     * @param {('capital'|'shape')} [opts.quiz] - quiz display: 'capital' shows the
     *   country with a red dot + "?" for the capital (place labels suppressed);
     *   'shape' shows ONLY the country outline (no basemap/mask/markings). When
     *   set, the map is non-interactive. See showForQuiz / revealQuizAnswer.
     */
    async show(countryName, opts = {}) {
        if (!countryName) return;
        const rec = this.globeManager.getCountryByName(countryName);
        if (!rec || !rec.bbox) {
            console.warn('[CountryMap] no bbox for', countryName);
            return;
        }
        this.currentCountry = countryName;
        this._quizMode = opts.quiz || null;
        this._bbox = rec.bbox;
        this._bounds = this._toBounds(rec); // {west,south,east,north,wraps}
        this._capital = this.globeManager.getCapital(countryName); // {name,lat,lng}|null
        // Hide the title in quiz mode (the question carries the prompt; for the
        // "which country" direction it would reveal the answer). :empty hides it.
        if (this.titleEl) this.titleEl.textContent = this._quizMode ? '' : countryName;

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

        // Quiz views are non-interactive clue images; normal views are explorable.
        this._setInteractive(!this._quizMode);

        // The container just became visible — MapLibre must re-measure it.
        this.map.resize();
    }

    /** Open the map as a quiz clue: 'capital' (dot + "?") or 'shape' (outline only). */
    showForQuiz(countryName, mode) {
        document.body.classList.add('map-quiz');
        return this.show(countryName, { quiz: mode });
    }

    /** Reveal the full map after a quiz answer (basemap, named capital, title). */
    revealQuizAnswer() {
        if (!this.map) return;
        this._quizMode = null;
        this._showBasemap(true);
        if (this.map.getLayer('cm-outline-line')) this.map.setLayoutProperty('cm-outline-line', 'visibility', 'visible');
        this._updateCapitalMarker(); // label is now the real capital name
        this._refreshLabelMode();
        if (this.titleEl) this.titleEl.textContent = this.currentCountry || '';
    }

    /** Return to the globe. */
    hide() {
        if (!this._active) return;
        this._active = false;
        this.currentCountry = null;
        this._quizMode = null;
        document.body.classList.remove('map-mode', 'map-quiz');
        this.sceneManager.start();
        this.onExit();
    }

    /** Enable/disable user map interactions (off during quiz clue views). */
    _setInteractive(on) {
        if (!this.map) return;
        for (const h of ['scrollZoom', 'boxZoom', 'dragPan', 'keyboard', 'doubleClickZoom', 'touchZoomRotate']) {
            const handler = this.map[h];
            if (handler) on ? handler.enable() : handler.disable();
        }
    }

    /** Toggle the basemap (all Protomaps layers + background + the dim mask). */
    _showBasemap(visible) {
        if (!this.map || !this.map.getStyle) return;
        const v = visible ? 'visible' : 'none';
        for (const l of (this.map.getStyle().layers || [])) {
            if (l.id === 'cm-outline-line') continue; // outline shown in every mode
            if (l.source === 'protomaps' || l.id === 'background' || l.id === 'cm-mask-fill') {
                if (this.map.getLayer(l.id)) this.map.setLayoutProperty(l.id, 'visibility', v);
            }
        }
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
        // 'shape' quiz mode shows ONLY the outline; everything else shows the basemap.
        this._showBasemap(this._quizMode !== 'shape');
        this._refreshLabelMode(); // marker at default zoom; place labels when zoomed in

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
        // Ensure MapLibre's transform matches the live container before fitting,
        // so the fit never runs against a stale size (subsequent opens / resize).
        m.resize();
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
        // Whole-country view is the most zoomed-out the user can go; remember it
        // as the "default" zoom for the label-mode swap.
        this._fitZoom = m.getZoom();
        m.setMinZoom(this._fitZoom);
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
        // Re-evaluate the capital label side on pan, and the label mode (our
        // marker vs basemap place labels) on zoom.
        this.map.on('move', () => this._updateCapitalSide());
        this.map.on('zoom', () => this._refreshLabelMode());
    }

    /**
     * At the default (whole-country) zoom, show our own capital marker and hide
     * the basemap place labels for clarity. Once the user zooms in, hide our
     * marker and reveal the place labels (subject to the Place-labels toggle).
     */
    _refreshLabelMode() {
        if (!this.map) return;
        // Quiz: never reveal basemap place labels (they'd give away the answer).
        // Our marker shows only in 'capital' mode (the "?" dot), never in 'shape'.
        if (this._quizMode) {
            if (this._placeLabelLayers) {
                for (const id of this._placeLabelLayers) {
                    if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', 'none');
                }
            }
            if (this._capitalMarker) {
                this._capitalMarker.getElement().style.display = (this._quizMode === 'capital' && this._capital) ? '' : 'none';
            }
            return;
        }
        const atDefault = this._fitZoom == null || this.map.getZoom() <= this._fitZoom + 0.1;
        if (this._capitalMarker) {
            this._capitalMarker.getElement().style.display = (atDefault && this._capital) ? '' : 'none';
        }
        if (this._placeLabelLayers) {
            const vis = (!atDefault && this._placeLabelsOn !== false) ? 'visible' : 'none';
            for (const id of this._placeLabelLayers) {
                if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', vis);
            }
        }
    }

    /**
     * Build the feature-toggle checkboxes from the live style — one per group
     * that actually has layers (skips the sample style, which has none). Each
     * checkbox flips visibility on every Protomaps layer in its group.
     */
    _buildToggles() {
        if (!this.togglesEl || !this.map.getStyle) return;
        this.togglesEl.innerHTML = '';
        // Initial checked-state comes from the settings panel's saved defaults.
        const defaults = settingsStore.getMapToggleDefaults();
        const styleLayers = this.map.getStyle().layers || [];
        for (const group of TOGGLE_GROUPS) {
            const ids = styleLayers
                .filter(l => l.source === 'protomaps' && group.sourceLayers.includes(l['source-layer']))
                .map(l => l.id);
            if (!ids.length) continue;

            const on = defaults[group.key] !== false;
            const label = document.createElement('label');
            label.className = 'cm-toggle';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = on;
            if (group.key === 'labels') {
                // Place labels are zoom-managed (hidden at the default zoom, shown
                // when zoomed in) — see _refreshLabelMode. The toggle just enables
                // or disables them; don't set visibility directly here.
                this._placeLabelLayers = ids;
                this._placeLabelsOn = on;
                cb.addEventListener('change', () => {
                    this._placeLabelsOn = cb.checked;
                    this._refreshLabelMode();
                });
            } else {
                const applyVis = (visible) => {
                    const vis = visible ? 'visible' : 'none';
                    for (const id of ids) {
                        if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', vis);
                    }
                };
                if (!on) applyVis(false); // honor a saved "off" default on first build
                cb.addEventListener('change', () => applyVis(cb.checked));
            }
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
            // Dot is anchored on the point; the label is absolutely positioned
            // beside it (CSS), so it can flip sides without moving the dot.
            el.innerHTML = '<span class="cm-capital-dot"></span><span class="cm-capital-label"></span>';
            this._capitalMarker = new this.maplibregl.Marker({ element: el, anchor: 'center' });
        }
        // In 'capital' quiz mode the label is a big "?" instead of the name.
        const quizCapital = this._quizMode === 'capital';
        const labelEl = this._capitalMarker.getElement().querySelector('.cm-capital-label');
        labelEl.textContent = quizCapital ? '?' : name;
        labelEl.classList.toggle('cm-capital-q', quizCapital);
        this._capitalLngLat = [lng, lat];
        this._capitalMarker.setLngLat([lng, lat]).addTo(this.map);
        this._updateCapitalSide();
    }

    /**
     * Keep the capital label on-screen: if the dot sits near the right edge,
     * render the label to the LEFT of the dot (else to the right). Recomputed on
     * pan/zoom too.
     */
    _updateCapitalSide() {
        if (!this.map || !this._capitalMarker || !this._capitalLngLat) return;
        const el = this._capitalMarker.getElement();
        const label = el.querySelector('.cm-capital-label');
        if (!label) return;
        const x = this.map.project(this._capitalLngLat).x;
        const w = this.map.getCanvas().clientWidth;
        const labelW = label.offsetWidth || 80;
        const GAP = 15, MARGIN = 6;
        // Default to the right of the dot; flip left only when the right side
        // would overflow and the left side has room (measures the real label).
        const fitsRight = x + GAP + labelW + MARGIN <= w;
        const fitsLeft = x - GAP - labelW - MARGIN >= 0;
        el.classList.toggle('flip', !fitsRight && fitsLeft);
    }

    /** Resolve the MapLibre style: real Protomaps PMTiles source, or the sample fallback. */
    _buildStyle() {
        if (!PMTILES_URL || !this._themeLayers) return SAMPLE_STYLE;
        // _themeLayers is the pre-generated layer array (protomaps-themes-base,
        // light, lang en), loaded from a static JSON in _loadLibs.
        return {
            version: 8,
            glyphs: PM_GLYPHS,
            sprite: PM_SPRITE,
            sources: {
                protomaps: { type: 'vector', url: PMTILES_URL, attribution: PM_ATTRIB }
            },
            layers: this._themeLayers
        };
    }

    /**
     * Load the vendored MapLibre + PMTiles (same-origin UMD → window globals) and
     * the pre-generated theme layers JSON. Vendored to avoid depending on a
     * third-party ESM CDN at runtime (esm.sh was failing on the deploy).
     */
    async _loadLibs() {
        if (this._libs) return this._libs;
        this._injectCss();
        await this._loadScript(MAPLIBRE_JS);
        await this._loadScript(PMTILES_JS);
        const maplibregl = window.maplibregl;
        const pmtiles = window.pmtiles;
        maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile);
        this.maplibregl = maplibregl;
        if (PMTILES_URL) {
            try {
                const r = await fetch(PM_LAYERS_URL);
                if (r.ok) this._themeLayers = await r.json();
            } catch (e) {
                console.warn('[CountryMap] theme layers load failed, using sample style:', e.message);
            }
        }
        this._libs = { maplibregl, pmtiles };
        return this._libs;
    }

    /** Inject a same-origin <script> (UMD), resolving once loaded. Deduped. */
    _loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[data-cm-src="${src}"]`)) return resolve();
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.dataset.cmSrc = src;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('failed to load ' + src));
            document.head.appendChild(s);
        });
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
