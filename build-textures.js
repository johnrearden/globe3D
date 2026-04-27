const fs = require('fs');
const path = require('path');
const earcutModule = require('earcut');
const earcut = earcutModule.default || earcutModule;
const simplify = require('simplify-js');

const COUNTRIES_DIR = './node_modules/world-geojson/countries/';
const OUTPUT_PALETTE = './assets/country-palette.bin';
const OUTPUT_MESH = './assets/world-mesh.bin';
const OUTPUT_ID = './assets/world-id.bin';
const OUTPUT_META = './assets/country-meta.json';

const ID_W = 4096;
const ID_H = 2048;
const MAX_COUNTRIES = 256;

// Connected-components cleanup: drop fragments smaller than this, except
// always preserve each country's largest fragment so tiny countries
// (Vatican, Monaco) keep their only rasterized pixel.
const MIN_FRAGMENT_PX = 4;
const FRAGDEBUG = process.env.FRAGDEBUG === '1';

const SIMPLIFICATION_TOLERANCE = 0.006;
const OCEAN_COLOR = [0x06, 0x1A, 0x33];

// Maximum chord-vs-arc sag (depth that a flat triangle's interior dips below
// the unit sphere). Anything above this gets recursively subdivided. The
// runtime country mesh sits at scale ~1.002, so threshold 0.0015 keeps every
// triangle's interior comfortably above the ocean sphere at radius 1.0.
const MAX_CHORD_SAG = 0.0015;

const VERY_LARGE_COUNTRIES_FILES = ['russia', 'canada'];
const LARGE_COUNTRIES_FILES = ['china', 'usa', 'brazil', 'australia', 'india', 'argentina', 'kazakhstan', 'algeria'];

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

function randomColorRGB01() {
    return COLOR_PALETTES[Math.floor(Math.random() * COLOR_PALETTES.length)];
}

function lookupColorOverride(displayName, fileName, colorConfig) {
    for (const configName in colorConfig) {
        const a = configName.toLowerCase().replace(/\s+/g, '');
        const b = fileName.toLowerCase().replace(/\s+/g, '');
        const c = displayName.toLowerCase().replace(/\s+/g, '');
        if (a === b || a === c || a.includes(b) || b.includes(a) || a.includes(c) || c.includes(a)) {
            return colorConfig[configName];
        }
    }
    return null;
}

function fileNameToDisplayName(fileName) {
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

// Subdivide a single ring's triangulation until every triangle's chord-arc
// sag is below `threshold`. Each iteration splits every triangle 1-to-4 using
// great-circle midpoints on the three edges. Adjacent triangles share their
// midpoints via memoization, so no T-junctions appear within a ring. Different
// rings are independent (they don't share edges with other rings), so per-ring
// uniform subdivision is enough — neighboring rings stay watertight by virtue
// of having no shared geometry.
//
// We can't subdivide selectively: if one triangle splits and its neighbor
// doesn't, the neighbor's straight chord edge and the subdivided triangle's
// bulged sphere-midpoint edge diverge by ~chord-arc sag, leaving a visible
// gap that exposes whatever's drawn behind. Uniform subdivision avoids this.
function subdivideTriangles(positions, indices, threshold) {
    let verts = positions.map(p => [p[0], p[1], p[2]]);
    let inds = Array.from(indices);

    const sag = (a, b, c) => {
        const cx = (a[0] + b[0] + c[0]) / 3;
        const cy = (a[1] + b[1] + c[1]) / 3;
        const cz = (a[2] + b[2] + c[2]) / 3;
        return 1 - Math.sqrt(cx * cx + cy * cy + cz * cz);
    };

    const maxSag = () => {
        let m = 0;
        for (let i = 0; i < inds.length; i += 3) {
            const s = sag(verts[inds[i]], verts[inds[i + 1]], verts[inds[i + 2]]);
            if (s > m) m = s;
        }
        return m;
    };

    // Hard cap on subdivision passes — each pass quadruples the triangle count,
    // so 5 passes = 1024×. In practice we converge in 0–3 passes.
    let safety = 5;
    while (safety-- > 0 && maxSag() > threshold) {
        const next = [];
        const midCache = new Map();
        const getMid = (i, j) => {
            const key = i < j ? `${i},${j}` : `${j},${i}`;
            const cached = midCache.get(key);
            if (cached !== undefined) return cached;
            const a = verts[i], b = verts[j];
            let mx = (a[0] + b[0]) * 0.5;
            let my = (a[1] + b[1]) * 0.5;
            let mz = (a[2] + b[2]) * 0.5;
            const len = Math.sqrt(mx * mx + my * my + mz * mz);
            mx /= len; my /= len; mz /= len;
            verts.push([mx, my, mz]);
            const idx = verts.length - 1;
            midCache.set(key, idx);
            return idx;
        };
        for (let i = 0; i < inds.length; i += 3) {
            const a = inds[i], b = inds[i + 1], c = inds[i + 2];
            const ab = getMid(a, b);
            const bc = getMid(b, c);
            const ca = getMid(c, a);
            next.push(a, ab, ca);
            next.push(ab, b, bc);
            next.push(ca, bc, c);
            next.push(ab, bc, ca);
        }
        inds = next;
    }

    return { positions: verts, indices: inds };
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
            const bi = i * 2;
            const id = idBuf[bi] * 256 + idBuf[bi + 1];
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
                        const nbi = ni * 2;
                        if (idBuf[nbi] * 256 + idBuf[nbi + 1] === id) { labels[ni] = label; queue[qTail++] = ni; }
                    }
                }
                if (py < H - 1) {
                    const ni = pi + W;
                    if (labels[ni] === 0) {
                        const nbi = ni * 2;
                        if (idBuf[nbi] * 256 + idBuf[nbi + 1] === id) { labels[ni] = label; queue[qTail++] = ni; }
                    }
                }
                if (px > 0) {
                    const ni = pi - 1;
                    if (labels[ni] === 0) {
                        const nbi = ni * 2;
                        if (idBuf[nbi] * 256 + idBuf[nbi + 1] === id) { labels[ni] = label; queue[qTail++] = ni; }
                    }
                }
                if (px < W - 1) {
                    const ni = pi + 1;
                    if (labels[ni] === 0) {
                        const nbi = ni * 2;
                        if (idBuf[nbi] * 256 + idBuf[nbi + 1] === id) { labels[ni] = label; queue[qTail++] = ni; }
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
            const bi = i * 2;
            idBuf[bi] = 0;
            idBuf[bi + 1] = 0;
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
            const idx = (y * idW + x) * 2;
            if (src[idx] !== 0 || src[idx + 1] !== 0) continue;
            const tries = [
                [x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]
            ];
            for (const [tx, ty] of tries) {
                if (tx < 0 || tx >= idW || ty < 0 || ty >= idH) continue;
                const ti = (ty * idW + tx) * 2;
                if (src[ti] !== 0 || src[ti + 1] !== 0) {
                    idBuf[idx] = src[ti];
                    idBuf[idx + 1] = src[ti + 1];
                    break;
                }
            }
        }
    }
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
    const idBuf = new Uint8Array(ID_W * ID_H * 2);
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
        const colorRGB01 = colorOverride || randomColorRGB01();
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

        const idHi = (id >> 8) & 0xff;
        const idLo = id & 0xff;

        let largestRingArea = 0;
        let largestRingCentroidLngLat = null;
        let largestRingBbox = null;

        const writeId = (px, py) => {
            const i = (py * ID_W + px) * 2;
            idBuf[i] = idHi;
            idBuf[i + 1] = idLo;
        };

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

                // Largest-ring tracking
                const area = Math.abs(ringSignedArea(unfolded));
                if (area > largestRingArea) {
                    largestRingArea = area;
                    largestRingCentroidLngLat = ringCentroid(unfolded);
                    largestRingBbox = ringBbox(unfolded);
                }

                // Triangulate (earcut, 2D lng/lat space) then project each
                // vertex onto the unit sphere using the runtime's convention.
                // Antimeridian wrapping is automatic: lng=185 and lng=-175 map
                // to the same 3D point (sin/cos are periodic).
                const flat = new Array(unfolded.length * 2);
                for (let vi = 0; vi < unfolded.length; vi++) {
                    flat[vi * 2] = unfolded[vi][0];
                    flat[vi * 2 + 1] = unfolded[vi][1];
                }
                const triIdx = earcut(flat, null, 2);
                if (triIdx.length > 0) {
                    const ringPositions = new Array(unfolded.length);
                    for (let vi = 0; vi < unfolded.length; vi++) {
                        const lng = unfolded[vi][0];
                        const lat = unfolded[vi][1];
                        const phi = (90 - lat) * Math.PI / 180;
                        const theta = -(lng + 180) * Math.PI / 180;
                        const sphi = Math.sin(phi);
                        ringPositions[vi] = [
                            sphi * Math.cos(theta),
                            Math.cos(phi),
                            sphi * Math.sin(theta)
                        ];
                    }
                    // Subdivide oversized interior triangles so their centroids
                    // clear the ocean sphere at radius 1.0 once scaled by 1.002.
                    const sub = subdivideTriangles(ringPositions, Array.from(triIdx), MAX_CHORD_SAG);
                    const baseVert = meshPositions.length / 3;
                    for (const p of sub.positions) {
                        meshPositions.push(p[0]);
                        meshPositions.push(p[1]);
                        meshPositions.push(p[2]);
                        meshIds.push(id);
                    }
                    for (let ti = 0; ti < sub.indices.length; ti++) {
                        meshIndices.push(baseVert + sub.indices[ti]);
                    }
                    meshTriangles += sub.indices.length / 3;
                }

                rasterizeRingToBuffer(unfolded, ID_W, ID_H, writeId);
                ringCount++;
            }
        }

        if (!largestRingCentroidLngLat) {
            console.log(`  ! ${displayName}: no rings, skipping`);
            // still record the country at the assigned id to keep ids contiguous
        }

        const centroidLngLat = largestRingCentroidLngLat || [0, 0];
        // Wrap centroid lng back into [-180, 180] (unfolding may have moved it out)
        let centroidLng = centroidLngLat[0];
        while (centroidLng > 180) centroidLng -= 360;
        while (centroidLng < -180) centroidLng += 360;
        const centroidLat = Math.max(-90, Math.min(90, centroidLngLat[1]));
        const centroid = latLngToVector3(centroidLat, centroidLng);

        let bbox = largestRingBbox || { minLng: 0, maxLng: 0, minLat: 0, maxLat: 0 };
        // Clamp bbox to valid lat range; clamp lng wraps below
        bbox = {
            minLng: Math.max(-180, Math.min(180, bbox.minLng)),
            maxLng: Math.max(-180, Math.min(180, bbox.maxLng)),
            minLat: Math.max(-90, Math.min(90, bbox.minLat)),
            maxLat: Math.max(-90, Math.min(90, bbox.maxLat))
        };

        countriesMeta.push({
            id,
            name: displayName,
            centroid,
            bbox
        });
        nameToId[displayName] = id;
        idToName[id] = displayName;

        console.log(`  ✓ ${displayName} (id=${id}): ${ringCount} rings`);
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
    fs.writeFileSync(OUTPUT_META, JSON.stringify(meta, null, 2));

    const paletteSize = fs.statSync(OUTPUT_PALETTE).size;
    const meshSize = fs.statSync(OUTPUT_MESH).size;
    const idSize = fs.statSync(OUTPUT_ID).size;
    const metaSize = fs.statSync(OUTPUT_META).size;
    console.log(`\nDone.`);
    console.log(`  ${OUTPUT_PALETTE}: ${paletteSize} bytes`);
    console.log(`  ${OUTPUT_MESH}: ${(meshSize / 1024 / 1024).toFixed(2)} MB (${vertCount} vertices, ${meshTriangles} triangles)`);
    console.log(`  ${OUTPUT_ID}: ${(idSize / 1024 / 1024).toFixed(2)} MB (gzip recommended)`);
    console.log(`  ${OUTPUT_META}: ${(metaSize / 1024).toFixed(1)} KB`);
    console.log(`  ${countriesMeta.length} countries`);
}

build();
