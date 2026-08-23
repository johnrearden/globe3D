const fs = require('fs');
const path = require('path');
const earcutModule = require('earcut');
const earcut = earcutModule.default || earcutModule;
const simplify = require('simplify-js');
const { DEPENDENCIES, pointInBboxes } = require('./dependencies');
const { areaForCountry } = require('./area-data');

const COUNTRIES_DIR = './node_modules/world-geojson/countries/';
const OUTPUT_PALETTE = './assets/country-palette.bin';
const OUTPUT_MESH = './assets/world-mesh.bin';
const OUTPUT_ID = './assets/world-id.bin';
const OUTPUT_META = './assets/country-meta.json';
// Country border line edges: a Uint32 list of vertex-index pairs into the
// world-mesh.bin vertex array, naming the mesh's boundary edges (each country's
// outline + coastlines). Drawn at runtime as a line that shares the fill mesh's
// exact vertices, so it sits perfectly on the fills with no parallax.
const OUTPUT_BORDER_LINES = './assets/world-border-lines.bin';

const ID_W = 4096;
const ID_H = 2048;
const MAX_COUNTRIES = 256;

// Connected-components cleanup: drop fragments smaller than this, except
// always preserve each country's largest fragment so tiny countries
// (Vatican, Monaco) keep their only rasterized pixel.
const MIN_FRAGMENT_PX = 4;
const FRAGDEBUG = process.env.FRAGDEBUG === '1';

const SIMPLIFICATION_TOLERANCE = 0.006;
// Antimeridian-aware framing bounds: region-grow from the main landmass, absorbing any ring
// within this gap (degrees) of the growing cluster. Chains spread archipelagos
// (Indonesia) together while leaving isolated overseas territories (Réunion,
// Easter Island, Hawaii) out, so the main country fills the screen.
const CLUSTER_GAP_DEG = 6;
const OCEAN_COLOR = [0x08, 0x1E, 0x39]; // lightened ocean; original was [0x06, 0x1A, 0x33]

// Maximum chord-vs-arc sag: how far a flat triangle's interior dips below the
// unit sphere. The runtime country mesh sits at scale ~1.002, so anything under
// 0.0015 stays comfortably above the ocean sphere at radius 1.0 and no ocean
// bleeds through a country's interior.
//
// This is no longer a subdivision trigger — it is the BUDGET that justifies the
// graticule cell size below, asserted against at the end of the build.
const MAX_CHORD_SAG = 0.0015;

// Rings are clipped to a lat/lng grid of this pitch before triangulation, so no
// triangle can span more than this and chord sag is bounded by construction.
//
// Replaces a uniform post-triangulation subdivision pass that was gated on each
// ring's single WORST triangle, so 54 of 5,936 rings (0.9%) dragged the whole
// mesh up 10.4x in triangles. Measured max sag per cell size:
//
//     3 deg -> 6.09e-4   safe, but more triangles than needed
//     4 deg -> 1.08e-3   chosen: comfortable margin under MAX_CHORD_SAG
//     5 deg -> 1.69e-3   exceeds the budget
//     6 deg -> 2.43e-3   exceeds the budget
const GRATICULE_CELL_DEG = 4;

// Match the existing build-globe.js convention exactly so saved label-config.json
// positions remain on their countries. The runtime shader and CPU picker derive
// UV from local position using the inverse formula (theta = atan2(-z, x)).
function latLngToVector3(lat, lng) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = -(lng + 180) * Math.PI / 180;
    return [
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
    ];
}

function simplifyCoordinates(coords, tolerance) {
    const points = coords.map(([lng, lat]) => ({ x: lng, y: lat }));
    const simplified = simplify(points, tolerance, true);
    return simplified.map(p => [p.x, p.y]);
}

// Walk a closed ring; if any consecutive |Δlng| > 180 we shift the later vertex
// by ±360 to keep the ring continuous. Allows triangles to span the antimeridian
// — the rasterizer renders triangles three times (offset −W/0/+W) and clips to
// texture bounds, which correctly handles wrap.
function unfoldRing(ring) {
    if (ring.length === 0) return ring;
    const out = [[ring[0][0], ring[0][1]]];
    for (let i = 1; i < ring.length; i++) {
        const [lng, lat] = ring[i];
        const prevLng = out[i - 1][0];
        let adj = lng;
        while (adj - prevLng > 180) adj -= 360;
        while (prevLng - adj > 180) adj += 360;
        out.push([adj, lat]);
    }
    return out;
}

function ringSignedArea(ring) {
    let sum = 0;
    for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        sum += x1 * y2 - x2 * y1;
    }
    return sum * 0.5;
}

function ringCentroid(ring) {
    let area = 0, cx = 0, cy = 0;
    for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        const cross = x1 * y2 - x2 * y1;
        area += cross;
        cx += (x1 + x2) * cross;
        cy += (y1 + y2) * cross;
    }
    area *= 0.5;
    if (Math.abs(area) < 1e-10) {
        let sx = 0, sy = 0;
        for (const [x, y] of ring) { sx += x; sy += y; }
        return [sx / ring.length, sy / ring.length];
    }
    return [cx / (6 * area), cy / (6 * area)];
}

function ringBbox(ring) {
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
    }
    return { minLng, maxLng, minLat, maxLat };
}

// Build a country-meta row from a largest-ring accumulator (the wrapping /
// clamping the per-file loop used to do inline). `extra` carries dependency-only
// fields (iso, parent, info). Shared by parents and dependencies.
function buildMetaRow(id, name, accum, extra) {
    const ll = (accum && accum.centroidLngLat) || [0, 0];
    let centroidLng = ll[0];
    while (centroidLng > 180) centroidLng -= 360;
    while (centroidLng < -180) centroidLng += 360;
    const centroidLat = Math.max(-90, Math.min(90, ll[1]));
    const centroid = latLngToVector3(centroidLat, centroidLng);

    let bbox = (accum && accum.bbox) || { minLng: 0, maxLng: 0, minLat: 0, maxLat: 0 };
    bbox = {
        minLng: Math.max(-180, Math.min(180, bbox.minLng)),
        maxLng: Math.max(-180, Math.min(180, bbox.maxLng)),
        minLat: Math.max(-90, Math.min(90, bbox.minLat)),
        maxLat: Math.max(-90, Math.min(90, bbox.maxLat))
    };

    // Antimeridian-aware framing bounds (the largest-ring `bbox` above is
    // kept unchanged for the globe focus/labels). Antimeridian-aware:
    //  - Wrapping countries (Russia/Fiji/NZ): use the full shifted extent — their
    //    territories cluster near the antimeridian, so this frames them tightly.
    //  - Non-wrapping countries: cluster around the main landmass and drop distant
    //    overseas territories (France→Réunion, Chile→Easter Island), so the main
    //    country fills the screen. Nearby islands (Corsica, Sicily) are kept.
    const clampLng = l => Math.max(-180, Math.min(180, l));
    const clampLat = l => Math.max(-90, Math.min(90, l));
    let fullBounds = null;
    if (accum && accum.fb && isFinite(accum.fb.nMinLng)) {
        const fb = accum.fb;
        const wrap = l => ((l + 180) % 360 + 360) % 360 - 180;
        if (fb.sMaxLng - fb.sMinLng < fb.nMaxLng - fb.nMinLng) {
            fullBounds = { west: clampLng(wrap(fb.sMinLng)), south: clampLat(fb.minLat), east: clampLng(wrap(fb.sMaxLng)), north: clampLat(fb.maxLat), wraps: true };
        } else {
            // Region-grow from the largest ring, absorbing rings within
            // CLUSTER_GAP_DEG of the growing cluster bbox. Isolated far territories
            // never get reached and are dropped.
            const rings = accum.rings || [];
            let mainIdx = 0;
            for (let i = 1; i < rings.length; i++) if (rings[i].area > rings[mainIdx].area) mainIdx = i;
            const m0 = rings[mainIdx];
            const cl = { minLng: m0.minLng, maxLng: m0.maxLng, minLat: m0.minLat, maxLat: m0.maxLat };
            const used = new Array(rings.length).fill(false);
            used[mainIdx] = true;
            const G = CLUSTER_GAP_DEG;
            let added = true;
            while (added) {
                added = false;
                for (let i = 0; i < rings.length; i++) {
                    if (used[i]) continue;
                    const r = rings[i];
                    if (r.minLng <= cl.maxLng + G && r.maxLng >= cl.minLng - G &&
                        r.minLat <= cl.maxLat + G && r.maxLat >= cl.minLat - G) {
                        used[i] = true;
                        cl.minLng = Math.min(cl.minLng, r.minLng); cl.maxLng = Math.max(cl.maxLng, r.maxLng);
                        cl.minLat = Math.min(cl.minLat, r.minLat); cl.maxLat = Math.max(cl.maxLat, r.maxLat);
                        added = true;
                    }
                }
            }
            fullBounds = { west: clampLng(cl.minLng), south: clampLat(cl.minLat), east: clampLng(cl.maxLng), north: clampLat(cl.maxLat), wraps: false };
        }
    }

    // Authoritative land area (km²) from world-countries, used at runtime to size-
    // filter quiz targets (e.g. excluding tiny islands). null when unmatched.
    const area = areaForCountry(name, extra && extra.iso);
    return Object.assign({ id, name, centroid, bbox, fullBounds }, extra || {}, area != null ? { area } : {});
}

const COLOR_PALETTES = [
    [0.15, 0.5, 0.2], [0.1, 0.4, 0.15], [0.2, 0.45, 0.25],
    [0.15, 0.45, 0.15], [0.2, 0.5, 0.15],
    [0.5, 0.5, 0.15], [0.45, 0.45, 0.1], [0.5, 0.4, 0.1],
    [0.5, 0.35, 0.15], [0.45, 0.3, 0.1], [0.5, 0.3, 0.1],
    [0.3, 0.15, 0.5], [0.25, 0.1, 0.45], [0.35, 0.2, 0.5],
    [0.15, 0.4, 0.45], [0.1, 0.35, 0.4], [0.2, 0.45, 0.5],
    [0.15, 0.45, 0.5], [0.1, 0.4, 0.45],
    [0.15, 0.45, 0.4], [0.2, 0.4, 0.35], [0.15, 0.5, 0.45],
    [0.4, 0.3, 0.2], [0.35, 0.25, 0.15], [0.45, 0.35, 0.2]
];

// Deterministic palette pick keyed on country name. Same name = same colour on every
// rebuild, so unedited countries stay stable instead of reshuffling each bake.
function stableColorRGB01(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    }
    return COLOR_PALETTES[Math.abs(hash) % COLOR_PALETTES.length];
}

function lookupColorOverride(displayName, fileName, colorConfig) {
    const b = fileName.toLowerCase().replace(/\s+/g, '');
    const c = displayName.toLowerCase().replace(/\s+/g, '');
    // Exact (whitespace-insensitive) match only. Substring matching conflates names
    // where one is a substring of another (e.g. "Sudan" ⊂ "South Sudan"), causing an
    // override to bleed onto the wrong country. Config keys are full country names, so
    // an exact match is always available.
    for (const configName in colorConfig) {
        const a = configName.toLowerCase().replace(/\s+/g, '');
        if (a === b || a === c) {
            return colorConfig[configName];
        }
    }
    return null;
}

// Display names that title-casing would mangle (acronyms, etc.).
const DISPLAY_NAME_OVERRIDES = {
    usa: 'USA'
};

function fileNameToDisplayName(fileName) {
    if (DISPLAY_NAME_OVERRIDES[fileName]) return DISPLAY_NAME_OVERRIDES[fileName];
    return fileName.replace(/_/g, ' ').split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

// Edge-function rasterizer for one triangle into one buffer at one offset.
// Coords in pixel space. Out-of-bounds pixels are clipped.
function rasterTri(x0, y0, x1, y1, x2, y2, W, H, writePixel) {
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (minX > maxX || minY > maxY) return;
    const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(det) < 1e-9) return;
    const positive = det > 0;
    for (let y = minY; y <= maxY; y++) {
        const py = y + 0.5;
        for (let x = minX; x <= maxX; x++) {
            const px = x + 0.5;
            const e0 = (px - x0) * (y1 - y0) - (py - y0) * (x1 - x0);
            const e1 = (px - x1) * (y2 - y1) - (py - y1) * (x2 - x1);
            const e2 = (px - x2) * (y0 - y2) - (py - y2) * (x0 - x2);
            if (positive) {
                if (e0 > 0 || e1 > 0 || e2 > 0) continue;
            } else {
                if (e0 < 0 || e1 < 0 || e2 < 0) continue;
            }
            writePixel(x, y);
        }
    }
}

function rasterizeRingToBuffer(ring, W, H, writePixel) {
    if (ring.length < 3) return;
    const flat = [];
    for (const [lng, lat] of ring) flat.push(lng, lat);
    const indices = earcut(flat, null, 2);
    if (indices.length === 0) return;

    const px = ring.map(([lng]) => (lng + 180) / 360 * W);
    const py = ring.map(([, lat]) => (90 - lat) / 180 * H);

    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i], b = indices[i + 1], c = indices[i + 2];
        // Three offsets so antimeridian-spanning triangles render on both sides.
        for (const off of [0, -W, W]) {
            rasterTri(
                px[a] + off, py[a],
                px[b] + off, py[b],
                px[c] + off, py[c],
                W, H, writePixel
            );
        }
    }
}

// Sutherland–Hodgman polygon clip against an axis-aligned box, in the UNFOLDED
// lng/lat plane produced by unfoldRing(). Clipping there (rather than in
// wrapped [-180,180]) is what keeps antimeridian countries correct: Russia
// continues past lng 180, so `Math.floor(lng / CELL)` buckets its eastern rings
// contiguously instead of splitting them at the seam.
//
// Returns null for anything that degenerates to fewer than 3 points, or whose
// absolute area falls under `minArea` — box clipping routinely produces
// zero-width slivers at cell corners, and feeding those to earcut yields
// degenerate triangles that contribute nothing but still cost vertices.
function clipRingToCell(ring, x0, y0, x1, y1, minArea = 1e-12) {
    // Each pass keeps the half-plane on the inside of one box edge. `inside`
    // and `intersect` are paired per edge so the cut coordinate is set
    // LITERALLY to the boundary value — that exactness is what makes two
    // adjacent cells emit bit-identical points on their shared edge, which in
    // turn is what lets the weld step below fuse them and stops a T-junction
    // (or a fake border) appearing along every grid line.
    const edges = [
        { inside: p => p[0] >= x0, cut: (a, b) => [x0, a[1] + (b[1] - a[1]) * ((x0 - a[0]) / (b[0] - a[0]))] },
        { inside: p => p[0] <= x1, cut: (a, b) => [x1, a[1] + (b[1] - a[1]) * ((x1 - a[0]) / (b[0] - a[0]))] },
        { inside: p => p[1] >= y0, cut: (a, b) => [a[0] + (b[0] - a[0]) * ((y0 - a[1]) / (b[1] - a[1])), y0] },
        { inside: p => p[1] <= y1, cut: (a, b) => [a[0] + (b[0] - a[0]) * ((y1 - a[1]) / (b[1] - a[1])), y1] },
    ];

    let poly = ring;
    for (const { inside, cut } of edges) {
        if (poly.length === 0) return null;
        const out = [];
        for (let i = 0; i < poly.length; i++) {
            const cur = poly[i];
            const prev = poly[(i + poly.length - 1) % poly.length];
            const curIn = inside(cur);
            const prevIn = inside(prev);
            if (curIn) {
                if (!prevIn) out.push(cut(prev, cur));
                out.push(cur);
            } else if (prevIn) {
                out.push(cut(prev, cur));
            }
        }
        poly = out;
    }

    if (poly.length < 3) return null;
    if (Math.abs(ringSignedArea(poly)) < minArea) return null;
    return poly;
}

// Two-pass connected-components cleanup. Pass 1 BFS-labels every same-id
// 4-connected region; pass 2 erases regions smaller than MIN_FRAGMENT_PX,
// EXCEPT each country's largest region is always kept (so tiny countries
// like Vatican/Monaco — whose only fragment is sub-pixel — are preserved).
// Removes the visible "floating pixel off the coast" artifact at its source.
function cleanupFragments(idBuf, idW, idH, idToName) {
    const W = idW, H = idH;
    const N = W * H;

    const labels = new Int32Array(N);     // 0 = unlabeled
    const queue = new Int32Array(N);      // BFS scratch
    const compId = [0];
    const compSize = [0];
    let nextLabel = 1;

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const i = y * W + x;
            if (labels[i] !== 0) continue;
            const id = idBuf[i];
            if (id === 0) continue;

            const label = nextLabel++;
            labels[i] = label;
            queue[0] = i;
            let qHead = 0, qTail = 1;
            let count = 0;

            while (qHead < qTail) {
                const pi = queue[qHead++];
                count++;
                const py = (pi / W) | 0;
                const px = pi - py * W;

                // Inlined 4-neighbor walk for speed.
                if (py > 0) {
                    const ni = pi - W;
                    if (labels[ni] === 0) {
                        if (idBuf[ni] === id) { labels[ni] = label; queue[qTail++] = ni; }
                    }
                }
                if (py < H - 1) {
                    const ni = pi + W;
                    if (labels[ni] === 0) {
                        if (idBuf[ni] === id) { labels[ni] = label; queue[qTail++] = ni; }
                    }
                }
                if (px > 0) {
                    const ni = pi - 1;
                    if (labels[ni] === 0) {
                        if (idBuf[ni] === id) { labels[ni] = label; queue[qTail++] = ni; }
                    }
                }
                if (px < W - 1) {
                    const ni = pi + 1;
                    if (labels[ni] === 0) {
                        if (idBuf[ni] === id) { labels[ni] = label; queue[qTail++] = ni; }
                    }
                }
            }

            compId.push(id);
            compSize.push(count);
        }
    }

    // Largest component per country id.
    const largestForId = new Map();
    for (let lbl = 1; lbl < compId.length; lbl++) {
        const id = compId[lbl];
        const sz = compSize[lbl];
        const cur = largestForId.get(id);
        if (!cur || sz > cur.size) largestForId.set(id, { label: lbl, size: sz });
    }

    // Mark drops.
    const drop = new Uint8Array(compId.length);
    const dropPerCountry = new Map();
    let droppedComponents = 0;
    let droppedPixels = 0;
    for (let lbl = 1; lbl < compId.length; lbl++) {
        const id = compId[lbl];
        const sz = compSize[lbl];
        if (lbl === largestForId.get(id).label) continue; // never drop the largest
        if (sz >= MIN_FRAGMENT_PX) continue;
        drop[lbl] = 1;
        droppedComponents++;
        droppedPixels += sz;
        const cur = dropPerCountry.get(id) || { count: 0, pixels: 0 };
        cur.count++;
        cur.pixels += sz;
        dropPerCountry.set(id, cur);
    }

    if (FRAGDEBUG) {
        console.log(`[fragdebug] total components: ${compId.length - 1}`);
        console.log(`[fragdebug] would drop: ${droppedComponents} components / ${droppedPixels} pixels (NOT erasing)`);
        const top = [...dropPerCountry.entries()]
            .sort((a, b) => b[1].pixels - a[1].pixels)
            .slice(0, 30);
        for (const [id, info] of top) {
            const name = idToName ? idToName[id] : `id=${id}`;
            console.log(`  ${name}: ${info.count} fragments / ${info.pixels} px`);
        }
        return { droppedComponents: 0, droppedPixels: 0 };
    }

    // Erase: zero id bytes for dropped fragments.
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const i = y * W + x;
            const lbl = labels[i];
            if (lbl === 0 || !drop[lbl]) continue;
            idBuf[i] = 0;
        }
    }

    return { droppedComponents, droppedPixels };
}

// One pass: any id=0 pixel with at least one non-zero 4-neighbor takes the
// neighbor's id. Eliminates seam ambiguity at country borders.
function dilateIds(idBuf, idW, idH) {
    const src = new Uint8Array(idBuf);
    for (let y = 0; y < idH; y++) {
        for (let x = 0; x < idW; x++) {
            const idx = y * idW + x;
            if (src[idx] !== 0) continue;
            const tries = [
                [x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]
            ];
            for (const [tx, ty] of tries) {
                if (tx < 0 || tx >= idW || ty < 0 || ty >= idH) continue;
                const ti = ty * idW + tx;
                if (src[ti] !== 0) {
                    idBuf[idx] = src[ti];
                    break;
                }
            }
        }
    }
}

// Extract the boundary edges of a triangle mesh: edges used by exactly one
// triangle. Because the country mesh is triangulated per-country (neighbouring
// countries don't share vertices), every country's outline — its coastlines and
// its borders with neighbours — is a set of count-1 edges, while interior
// (triangulation) edges are shared by two triangles (count 2). The returned
// edges therefore trace the exact fill outlines, already subdivided to follow
// the sphere, so a line drawn from them sits perfectly on the fills.
//
// Returns a Uint32Array of vertex-index pairs [a0,b0, a1,b1, ...] into the mesh
// vertex array. Pure + deterministic so it's unit-testable.
function extractBorderEdges(indices, vertexCount) {
    const V = vertexCount;
    // key = min*V + max (unique per undirected edge; safe < V*V < 2^53).
    const count = new Map();
    for (let t = 0; t + 2 < indices.length; t += 3) {
        const a = indices[t], b = indices[t + 1], c = indices[t + 2];
        const keys = [
            a < b ? a * V + b : b * V + a,
            b < c ? b * V + c : c * V + b,
            c < a ? c * V + a : a * V + c
        ];
        for (const k of keys) count.set(k, (count.get(k) || 0) + 1);
    }
    const out = [];
    for (const [k, n] of count) {
        if (n === 1) {
            const i = Math.floor(k / V);
            out.push(i, k - i * V);
        }
    }
    return Uint32Array.from(out);
}

function build() {
    console.log('Starting texture build...');

    let colorConfig = {};
    const colorConfigPath = './country-colors.json';
    if (fs.existsSync(colorConfigPath)) {
        try {
            colorConfig = JSON.parse(fs.readFileSync(colorConfigPath, 'utf8'));
            console.log(`Loaded color overrides for ${Object.keys(colorConfig).length} countries`);
        } catch (e) {
            console.log(`Failed to read color config: ${e.message}`);
        }
    }

    const countryFiles = fs.readdirSync(COUNTRIES_DIR)
        .filter(f => f.endsWith('.json'))
        .filter(f => path.basename(f, '.json') !== 'czech') // dedupe with czechia
        .sort();
    console.log(`Found ${countryFiles.length} country files`);

    // Allocate buffers
    // One byte per pixel. Ids are bounded by MAX_COUNTRIES (256) and
    // `aCountryId` is already a u8 vertex attribute, so a second byte could only
    // ever hold zero — see the guard below, which makes that implicit invariant
    // explicit rather than leaving a future MAX_COUNTRIES bump to truncate ids
    // silently.
    const idBuf = new Uint8Array(ID_W * ID_H);
    // Country-color palette: index by id, RGBA. id=0 reserved for ocean (alpha=0).
    const palette = new Uint8Array(MAX_COUNTRIES * 4);
    // Merged country mesh accumulators. Vertex positions are unit-sphere xyz;
    // each ring's earcut indices are offset to the global vertex layout.
    const meshPositions = []; // flat [x,y,z, x,y,z, ...]
    const meshIds = [];       // [id, id, ...] (uint8)
    const meshIndices = [];   // [a,b,c, a,b,c, ...]
    let meshTriangles = 0;

    const countriesMeta = [];
    const nameToId = {};
    const idToName = {};

    let nextId = 1;

    // Pre-assign each curated dependency its own country ID, after the parent
    // files (which take 1..countryFiles.length). Routing in the per-file loop
    // reassigns a parent's far-flung rings to these IDs by bounding box.
    const depBaseId = countryFiles.length + 1;
    const depsByFile = {};
    let depCursor = depBaseId;
    for (const dep of DEPENDENCIES) {
        dep.id = depCursor++;
        dep._matched = 0;
        (depsByFile[dep.parentFile] = depsByFile[dep.parentFile] || []).push(dep);
        if (dep.id < MAX_COUNTRIES) {
            const rgb = lookupColorOverride(dep.name, dep.name, colorConfig) || stableColorRGB01(dep.name);
            palette[dep.id * 4] = Math.max(0, Math.min(255, Math.round(rgb[0] * 255)));
            palette[dep.id * 4 + 1] = Math.max(0, Math.min(255, Math.round(rgb[1] * 255)));
            palette[dep.id * 4 + 2] = Math.max(0, Math.min(255, Math.round(rgb[2] * 255)));
            palette[dep.id * 4 + 3] = 255;
        } else {
            console.warn(`  ⚠ dependency "${dep.name}" id ${dep.id} exceeds palette size ${MAX_COUNTRIES}`);
        }
    }
    console.log(`Assigned ${DEPENDENCIES.length} dependency IDs (${depBaseId}..${depCursor - 1})`);

    // world-id.bin stores one byte per pixel, so an id above 255 would be
    // truncated into a DIFFERENT country's id — silently mis-attributing every
    // pick in that territory. Fail the build instead. (Same ceiling the 256-entry
    // palette and the u8 aCountryId attribute already impose; this just states it
    // where a future MAX_COUNTRIES bump would trip over it.)
    const highestId = depCursor - 1;
    if (highestId > 255) {
        console.error(
            `\n  ✗ Highest country id is ${highestId}, above the 255 that one byte ` +
            `per pixel can hold in ${OUTPUT_ID}. Widen the ID buffer (and the ` +
            `runtime picker in js/core/globe.js) before raising MAX_COUNTRIES.`);
        process.exit(1);
    }

    for (const file of countryFiles) {
        const filePath = path.join(COUNTRIES_DIR, file);
        const fileName = path.basename(file, '.json');
        const displayName = fileNameToDisplayName(fileName);
        const id = nextId++;

        let geo;
        try {
            geo = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
            console.error(`Failed to read ${file}: ${e.message}`);
            continue;
        }

        const colorOverride = lookupColorOverride(displayName, fileName, colorConfig);
        const colorRGB01 = colorOverride || stableColorRGB01(displayName);
        const colorBytes = [
            Math.max(0, Math.min(255, Math.round(colorRGB01[0] * 255))),
            Math.max(0, Math.min(255, Math.round(colorRGB01[1] * 255))),
            Math.max(0, Math.min(255, Math.round(colorRGB01[2] * 255)))
        ];

        // Write into the country palette: alpha=255 means "visible at this color".
        if (id < MAX_COUNTRIES) {
            palette[id * 4] = colorBytes[0];
            palette[id * 4 + 1] = colorBytes[1];
            palette[id * 4 + 2] = colorBytes[2];
            palette[id * 4 + 3] = 255;
        }

        // Dependencies hosted in this file (Greenland in denmark.json, etc.).
        const fileDeps = depsByFile[fileName] || [];

        // Largest-ring accumulator per target ID (parent + each of its deps), so
        // every entity gets a centroid/bbox from its OWN largest ring.
        const accumById = new Map();

        // Weld maps, one per target ID. Adjacent graticule cells each emit their
        // own copy of the shared cut edge; fusing them here is what keeps those
        // cuts from registering as country boundaries. Scoped per target (parent
        // and each hosted dependency get their own) so two entities never share
        // a vertex and the real coastline between them survives.
        const weldByTarget = new Map();

        let ringCount = 0;
        for (const feat of geo.features) {
            const polys = feat.geometry.type === 'Polygon'
                ? [feat.geometry.coordinates]
                : feat.geometry.type === 'MultiPolygon'
                    ? feat.geometry.coordinates
                    : [];

            for (const poly of polys) {
                const outer = poly[0];
                if (!outer || outer.length < 3) continue;

                const simplified = simplifyCoordinates(outer, SIMPLIFICATION_TOLERANCE);
                if (simplified.length < 3) continue;

                const unfolded = unfoldRing(simplified);

                // Route this ring to a dependency (own ID) or the parent. Match
                // the ring's centroid against each dependency's bbox set; wrap
                // lng into [-180,180] first (unfolding can push it out of range).
                const ringC = ringCentroid(unfolded);
                let routeLng = ringC[0];
                while (routeLng > 180) routeLng -= 360;
                while (routeLng < -180) routeLng += 360;
                let targetId = id;
                for (const dep of fileDeps) {
                    if (pointInBboxes(routeLng, ringC[1], dep.bboxes)) {
                        targetId = dep.id;
                        dep._matched++;
                        break;
                    }
                }
                const writeId = (px, py) => {
                    idBuf[py * ID_W + px] = targetId;
                };

                // Largest-ring tracking, per target ID.
                const area = Math.abs(ringSignedArea(unfolded));
                let acc = accumById.get(targetId);
                if (!acc) { acc = { area: 0, centroidLngLat: null, bbox: null }; accumById.set(targetId, acc); }
                if (area > acc.area) {
                    acc.area = area;
                    acc.centroidLngLat = ringC;
                    acc.bbox = ringBbox(unfolded);
                }

                // Framing data, per target ID. Track overall extent in both the
                // normal [-180,180] frame and a shifted (lng<0 → +360) frame (to
                // detect antimeridian wrap), plus each ring's own raw bbox + area so
                // buildMetaRow can cluster around the main landmass and drop far
                // overseas territories. Uses raw simplified lng/lat.
                if (!acc.fb) acc.fb = { nMinLng: Infinity, nMaxLng: -Infinity, sMinLng: Infinity, sMaxLng: -Infinity, minLat: Infinity, maxLat: -Infinity };
                const fb = acc.fb;
                let rMinLng = Infinity, rMaxLng = -Infinity, rMinLat = Infinity, rMaxLat = -Infinity;
                for (const [lng, lat] of simplified) {
                    if (lng < fb.nMinLng) fb.nMinLng = lng;
                    if (lng > fb.nMaxLng) fb.nMaxLng = lng;
                    const sl = lng < 0 ? lng + 360 : lng;
                    if (sl < fb.sMinLng) fb.sMinLng = sl;
                    if (sl > fb.sMaxLng) fb.sMaxLng = sl;
                    if (lat < fb.minLat) fb.minLat = lat;
                    if (lat > fb.maxLat) fb.maxLat = lat;
                    if (lng < rMinLng) rMinLng = lng;
                    if (lng > rMaxLng) rMaxLng = lng;
                    if (lat < rMinLat) rMinLat = lat;
                    if (lat > rMaxLat) rMaxLat = lat;
                }
                (acc.rings || (acc.rings = [])).push({ minLng: rMinLng, maxLng: rMaxLng, minLat: rMinLat, maxLat: rMaxLat, area });

                // Clip the ring against the graticule, then triangulate each
                // piece. Because no piece exceeds GRATICULE_CELL_DEG across,
                // chord sag is bounded BY CONSTRUCTION — which is what replaces
                // the old post-triangulation subdivision pass. Coastal detail is
                // untouched; only the vast empty interiors stop being
                // carpet-bombed with triangles to satisfy one oversized earcut
                // triangle somewhere else in the ring.
                //
                // Projection to the unit sphere uses the runtime's convention.
                // Antimeridian wrapping is automatic: lng=185 and lng=-175 map
                // to the same 3D point (sin/cos are periodic).
                const weld = weldByTarget.get(targetId)
                    || (weldByTarget.set(targetId, new Map()), weldByTarget.get(targetId));

                // Vertex index for a lng/lat, creating and projecting it on first
                // sight. The weld is what stops every grid cut becoming a fake
                // border: extractBorderEdges() calls an edge used by exactly one
                // triangle a boundary, so two cells each emitting their own copy
                // of a shared cut edge would paint a lattice across the globe.
                // Scoped per targetId so countries still never share vertices and
                // real coastlines survive.
                const vertexFor = (lng, lat) => {
                    const key = `${Math.round(lng * 1e6)},${Math.round(lat * 1e6)}`;
                    const hit = weld.get(key);
                    if (hit !== undefined) return hit;
                    const phi = (90 - lat) * Math.PI / 180;
                    const theta = -(lng + 180) * Math.PI / 180;
                    const sphi = Math.sin(phi);
                    const idx = meshPositions.length / 3;
                    meshPositions.push(sphi * Math.cos(theta));
                    meshPositions.push(Math.cos(phi));
                    meshPositions.push(sphi * Math.sin(theta));
                    meshIds.push(targetId);
                    weld.set(key, idx);
                    return idx;
                };

                const rb = ringBbox(unfolded);
                const cx0 = Math.floor(rb.minLng / GRATICULE_CELL_DEG);
                const cx1 = Math.floor(rb.maxLng / GRATICULE_CELL_DEG);
                const cy0 = Math.floor(rb.minLat / GRATICULE_CELL_DEG);
                const cy1 = Math.floor(rb.maxLat / GRATICULE_CELL_DEG);

                for (let cy = cy0; cy <= cy1; cy++) {
                    for (let cx = cx0; cx <= cx1; cx++) {
                        const piece = clipRingToCell(
                            unfolded,
                            cx * GRATICULE_CELL_DEG, cy * GRATICULE_CELL_DEG,
                            (cx + 1) * GRATICULE_CELL_DEG, (cy + 1) * GRATICULE_CELL_DEG
                        );
                        if (!piece) continue;

                        const flat = new Array(piece.length * 2);
                        for (let vi = 0; vi < piece.length; vi++) {
                            flat[vi * 2] = piece[vi][0];
                            flat[vi * 2 + 1] = piece[vi][1];
                        }
                        const triIdx = earcut(flat, null, 2);
                        if (triIdx.length === 0) continue;

                        const local = piece.map(pt => vertexFor(pt[0], pt[1]));
                        for (let ti = 0; ti < triIdx.length; ti += 3) {
                            const a = local[triIdx[ti]];
                            const b = local[triIdx[ti + 1]];
                            const c = local[triIdx[ti + 2]];
                            // The weld can collapse a sliver's corners onto one
                            // another; drop the degenerate triangle rather than
                            // emitting a zero-area face.
                            if (a === b || b === c || c === a) continue;
                            meshIndices.push(a, b, c);
                            meshTriangles++;
                        }
                    }
                }

                // The ID rasteriser works on the UNCLIPPED ring, in lng/lat,
                // where triangles are already exact — so world-id.bin comes out
                // byte-identical and picking is unaffected by this stage.
                rasterizeRingToBuffer(unfolded, ID_W, ID_H, writeId);
                ringCount++;
            }
        }

        const parentAccum = accumById.get(id);
        if (!parentAccum) {
            console.log(`  ! ${displayName}: no rings (after dependency routing)`);
        }
        countriesMeta.push(buildMetaRow(id, displayName, parentAccum));
        nameToId[displayName] = id;
        idToName[id] = displayName;

        const depRingCount = fileDeps.reduce((s, d) => s + d._matched, 0);
        console.log(`  ✓ ${displayName} (id=${id}): ${ringCount} rings (${ringCount - depRingCount} kept, ${depRingCount} → dependencies)`);

        // Emit a meta row for each dependency that captured geometry; carry its
        // iso / parent / info so the runtime can flag it and label its parent.
        for (const dep of fileDeps) {
            const acc = accumById.get(dep.id);
            if (!acc) {
                console.warn(`    ⚠ dependency "${dep.name}" (iso=${dep.iso}) matched 0 rings in ${fileName}.json — not emitted`);
                continue;
            }
            countriesMeta.push(buildMetaRow(dep.id, dep.name, acc, {
                iso: dep.iso,
                parent: dep.parentName,
                info: dep.info || null
            }));
            nameToId[dep.name] = dep.id;
            idToName[dep.id] = dep.name;
            console.log(`    ↳ ${dep.name} (id=${dep.id}, iso=${dep.iso}): ${dep._matched} rings`);
        }
    }

    console.log(FRAGDEBUG ? 'Analyzing fragments (FRAGDEBUG=1, no erase)...' : 'Cleaning up tiny isolated fragments...');
    const cleanup = cleanupFragments(idBuf, ID_W, ID_H, idToName);
    console.log(`Removed ${cleanup.droppedComponents} fragments / ${cleanup.droppedPixels} pixels`);

    console.log('Dilating ID buffer (1px)...');
    dilateIds(idBuf, ID_W, ID_H);

    console.log(`Writing ${OUTPUT_PALETTE}...`);
    fs.writeFileSync(OUTPUT_PALETTE, Buffer.from(palette.buffer));

    console.log(`Writing ${OUTPUT_MESH}...`);
    const vertCount = meshIds.length;
    const idxCount = meshIndices.length;
    if (vertCount === 0 || idxCount === 0) {
        throw new Error(`empty country mesh: vertCount=${vertCount}, idxCount=${idxCount}`);
    }
    // Layout: [u32 vertCount][u32 idxCount][f32 xyz × vertCount][u8 ids × vertCount, padded to 4][u32 indices × idxCount]
    const idsPadded = (vertCount + 3) & ~3;
    const meshBytes = 8 + vertCount * 12 + idsPadded + idxCount * 4;
    const meshBuf = Buffer.alloc(meshBytes);
    meshBuf.writeUInt32LE(vertCount, 0);
    meshBuf.writeUInt32LE(idxCount, 4);
    let mOff = 8;
    const positionsView = new Float32Array(meshBuf.buffer, meshBuf.byteOffset + mOff, vertCount * 3);
    for (let i = 0; i < vertCount * 3; i++) positionsView[i] = meshPositions[i];
    mOff += vertCount * 12;
    for (let i = 0; i < vertCount; i++) meshBuf[mOff + i] = meshIds[i];
    mOff += idsPadded;
    const indicesView = new Uint32Array(meshBuf.buffer, meshBuf.byteOffset + mOff, idxCount);
    for (let i = 0; i < idxCount; i++) indicesView[i] = meshIndices[i];
    fs.writeFileSync(OUTPUT_MESH, meshBuf);

    console.log(`Writing ${OUTPUT_ID}...`);
    fs.writeFileSync(OUTPUT_ID, Buffer.from(idBuf.buffer));

    // --- Stage 1 invariants ------------------------------------------------
    // Graticule clipping bounds chord sag by construction rather than by
    // iterating until it is small enough, so the build has to prove it rather
    // than assume it. A regression here shows up in the app as ocean bleeding
    // through country interiors at max zoom — the exact failure the old
    // subdivision pass existed to prevent.
    let worstSag = 0;
    let worstAt = -1;
    for (let t = 0; t < meshIndices.length; t += 3) {
        const a = meshIndices[t] * 3, b = meshIndices[t + 1] * 3, c = meshIndices[t + 2] * 3;
        const cx = (meshPositions[a] + meshPositions[b] + meshPositions[c]) / 3;
        const cy = (meshPositions[a + 1] + meshPositions[b + 1] + meshPositions[c + 1]) / 3;
        const cz = (meshPositions[a + 2] + meshPositions[b + 2] + meshPositions[c + 2]) / 3;
        const sag = 1 - Math.sqrt(cx * cx + cy * cy + cz * cz);
        if (sag > worstSag) { worstSag = sag; worstAt = t / 3; }
    }
    console.log(`Max chord sag: ${worstSag.toExponential(3)} (budget ${MAX_CHORD_SAG.toExponential(3)})`);
    if (worstSag > MAX_CHORD_SAG) {
        console.error(
            `\n  ✗ Triangle ${worstAt} sags ${worstSag.toExponential(3)}, over the ` +
            `${MAX_CHORD_SAG.toExponential(3)} budget. Lower GRATICULE_CELL_DEG ` +
            `(currently ${GRATICULE_CELL_DEG}) and rebuild.`);
        process.exit(1);
    }

    console.log('Extracting border edges...');
    const borderEdges = extractBorderEdges(meshIndices, vertCount);

    // The other Stage 1 invariant: grid cuts must NOT read as country borders.
    //
    // An unwelded cut leaves each adjacent cell holding its own copy of the
    // shared edge, and since each copy is then used by exactly one triangle,
    // BOTH register as boundaries — so a welding failure shows up as two
    // coincident boundary edges belonging to the SAME country. Two coincident
    // edges from DIFFERENT countries is the opposite: that is a shared
    // political border, and it is correct precisely because countries never
    // share vertices.
    //
    // Checked this way rather than by edge count, because a count-based bound
    // only catches gross failure — a handful of unwelded vertices would slip
    // through it and paint stray lines in the middle of a country.
    const vkey = i => `${meshPositions[i * 3].toFixed(6)},${meshPositions[i * 3 + 1].toFixed(6)},${meshPositions[i * 3 + 2].toFixed(6)}`;
    const edgeOwner = new Map();
    let fakeBorders = 0;
    let sharedBorders = 0;
    let firstFake = null;
    for (let e = 0; e < borderEdges.length; e += 2) {
        const a = borderEdges[e], b = borderEdges[e + 1];
        const ka = vkey(a), kb = vkey(b);
        const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        const prev = edgeOwner.get(ek);
        if (prev === undefined) { edgeOwner.set(ek, meshIds[a]); continue; }
        if (prev === meshIds[a]) {
            fakeBorders++;
            if (!firstFake) firstFake = idToName[meshIds[a]] || `id ${meshIds[a]}`;
        } else {
            sharedBorders++;
        }
    }
    console.log(
        `Boundary edges: ${borderEdges.length / 2} ` +
        `(${sharedBorders} coincident across a shared border)`);
    if (fakeBorders > 0) {
        console.error(
            `\n  ✗ ${fakeBorders} boundary edges are duplicated WITHIN one country ` +
            `(first: ${firstFake}). Graticule cuts are leaking into the border set — ` +
            `the per-target weld in the ring loop is not fusing them, and the globe ` +
            `will show a ${GRATICULE_CELL_DEG}° lattice across country interiors.`);
        process.exit(1);
    }
    console.log(`Writing ${OUTPUT_BORDER_LINES}...`);
    fs.writeFileSync(OUTPUT_BORDER_LINES, Buffer.from(borderEdges.buffer));

    console.log(`Writing ${OUTPUT_META}...`);
    const meta = {
        idWidth: ID_W,
        idHeight: ID_H,
        oceanId: 0,
        oceanColor: OCEAN_COLOR,
        paletteCountries: MAX_COUNTRIES,
        countries: countriesMeta,
        nameToId,
        idToName
    };
    // Minified, with floats rounded to 6 decimals. The precision is far finer
    // than the data warrants: 1e-6 on a unit-sphere centroid is ~6 m, and 1e-6
    // of a degree is ~11 cm, against a 668 m simplification tolerance. Raw
    // JSON.stringify emits 17 significant digits for every one of them.
    const round6 = (_key, value) =>
        typeof value === 'number' && !Number.isInteger(value)
            ? Math.round(value * 1e6) / 1e6
            : value;
    fs.writeFileSync(OUTPUT_META, JSON.stringify(meta, round6));

    const paletteSize = fs.statSync(OUTPUT_PALETTE).size;
    const meshSize = fs.statSync(OUTPUT_MESH).size;
    const idSize = fs.statSync(OUTPUT_ID).size;
    const borderSize = fs.statSync(OUTPUT_BORDER_LINES).size;
    const metaSize = fs.statSync(OUTPUT_META).size;
    console.log(`\nDone.`);
    console.log(`  ${OUTPUT_PALETTE}: ${paletteSize} bytes`);
    console.log(`  ${OUTPUT_MESH}: ${(meshSize / 1024 / 1024).toFixed(2)} MB (${vertCount} vertices, ${meshTriangles} triangles)`);
    console.log(`  ${OUTPUT_ID}: ${(idSize / 1024 / 1024).toFixed(2)} MB (gzip recommended)`);
    console.log(`  ${OUTPUT_BORDER_LINES}: ${(borderSize / 1024 / 1024).toFixed(2)} MB (${borderEdges.length / 2} edges, gzip recommended)`);
    console.log(`  ${OUTPUT_META}: ${(metaSize / 1024).toFixed(1)} KB`);
    console.log(`  ${countriesMeta.length} countries`);
}

if (require.main === module) build();

module.exports = { extractBorderEdges, dilateIds };
