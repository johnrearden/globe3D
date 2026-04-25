const fs = require('fs');
const path = require('path');
const earcutModule = require('earcut');
const earcut = earcutModule.default || earcutModule;
const simplify = require('simplify-js');
const { PNG } = require('pngjs');

const COUNTRIES_DIR = './node_modules/world-geojson/countries/';
const OUTPUT_COLOR = './assets/world-color.png';
const OUTPUT_ID = './assets/world-id.bin';
const OUTPUT_META = './assets/country-meta.json';

const COLOR_W = 4096;
const COLOR_H = 2048;
const ID_W = 2048;
const ID_H = 1024;

const SIMPLIFICATION_TOLERANCE = 0.006;
const OCEAN_COLOR = [0x06, 0x1A, 0x33];

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

// One pass: any id=0 pixel with at least one non-zero 4-neighbor takes the
// neighbor's id and copies the neighbor's color from colorBuf at its scaled
// coords. Eliminates seam ambiguity at country borders and lets us run the ID
// texture at half resolution without picking precision loss.
function dilateIds(idBuf, idW, idH, colorBuf, colorW, colorH) {
    const src = new Uint8Array(idBuf);
    const sx = colorW / idW;
    const sy = colorH / idH;
    for (let y = 0; y < idH; y++) {
        for (let x = 0; x < idW; x++) {
            const idx = (y * idW + x) * 2;
            if (src[idx] !== 0 || src[idx + 1] !== 0) continue;
            let nx = -1, ny = -1;
            const tries = [
                [x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]
            ];
            for (const [tx, ty] of tries) {
                if (tx < 0 || tx >= idW || ty < 0 || ty >= idH) continue;
                const ti = (ty * idW + tx) * 2;
                if (src[ti] !== 0 || src[ti + 1] !== 0) {
                    idBuf[idx] = src[ti];
                    idBuf[idx + 1] = src[ti + 1];
                    nx = tx; ny = ty;
                    break;
                }
            }
            if (nx >= 0) {
                // Copy color from the corresponding color-buffer pixel.
                const cx = Math.min(colorW - 1, Math.floor((nx + 0.5) * sx));
                const cy = Math.min(colorH - 1, Math.floor((ny + 0.5) * sy));
                const srcCi = (cy * colorW + cx) * 3;
                const dstCx = Math.min(colorW - 1, Math.floor((x + 0.5) * sx));
                const dstCy = Math.min(colorH - 1, Math.floor((y + 0.5) * sy));
                const dstCi = (dstCy * colorW + dstCx) * 3;
                colorBuf[dstCi] = colorBuf[srcCi];
                colorBuf[dstCi + 1] = colorBuf[srcCi + 1];
                colorBuf[dstCi + 2] = colorBuf[srcCi + 2];
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
    const colorBuf = new Uint8Array(COLOR_W * COLOR_H * 3);
    const idBuf = new Uint8Array(ID_W * ID_H * 2);
    // Initialize color buffer to ocean
    for (let i = 0; i < COLOR_W * COLOR_H; i++) {
        colorBuf[i * 3] = OCEAN_COLOR[0];
        colorBuf[i * 3 + 1] = OCEAN_COLOR[1];
        colorBuf[i * 3 + 2] = OCEAN_COLOR[2];
    }

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

        const idHi = (id >> 8) & 0xff;
        const idLo = id & 0xff;

        let largestRingArea = 0;
        let largestRingCentroidLngLat = null;
        let largestRingBbox = null;

        const writeColor = (px, py) => {
            const i = (py * COLOR_W + px) * 3;
            colorBuf[i] = colorBytes[0];
            colorBuf[i + 1] = colorBytes[1];
            colorBuf[i + 2] = colorBytes[2];
        };
        const writeId = (px, py) => {
            const i = (py * ID_W + px) * 2;
            idBuf[i] = idHi;
            idBuf[i + 1] = idLo;
        };

        let totalPixels = 0;
        const colorWriteCounting = (px, py) => { writeColor(px, py); totalPixels++; };

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

                rasterizeRingToBuffer(unfolded, COLOR_W, COLOR_H, colorWriteCounting);
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

        console.log(`  ✓ ${displayName} (id=${id}): ${ringCount} rings, ~${totalPixels} color px`);
    }

    console.log('Dilating ID buffer (1px)...');
    dilateIds(idBuf, ID_W, ID_H, colorBuf, COLOR_W, COLOR_H);

    // Encode color buffer to PNG
    console.log(`Encoding ${OUTPUT_COLOR}...`);
    const png = new PNG({ width: COLOR_W, height: COLOR_H, colorType: 2 /* RGB */ });
    // pngjs expects RGBA in png.data; for colorType=2 (RGB), we provide RGB only
    // Actually pngjs always uses RGBA internally; we set colorType=2 in the output.
    // The simplest path: build an RGBA buffer with alpha=255.
    const rgba = Buffer.alloc(COLOR_W * COLOR_H * 4);
    for (let i = 0; i < COLOR_W * COLOR_H; i++) {
        rgba[i * 4] = colorBuf[i * 3];
        rgba[i * 4 + 1] = colorBuf[i * 3 + 1];
        rgba[i * 4 + 2] = colorBuf[i * 3 + 2];
        rgba[i * 4 + 3] = 255;
    }
    png.data = rgba;
    fs.writeFileSync(OUTPUT_COLOR, PNG.sync.write(png));

    console.log(`Writing ${OUTPUT_ID}...`);
    fs.writeFileSync(OUTPUT_ID, Buffer.from(idBuf.buffer));

    console.log(`Writing ${OUTPUT_META}...`);
    const meta = {
        colorWidth: COLOR_W,
        colorHeight: COLOR_H,
        idWidth: ID_W,
        idHeight: ID_H,
        oceanId: 0,
        oceanColor: OCEAN_COLOR,
        countries: countriesMeta,
        nameToId,
        idToName
    };
    fs.writeFileSync(OUTPUT_META, JSON.stringify(meta, null, 2));

    const colorSize = fs.statSync(OUTPUT_COLOR).size;
    const idSize = fs.statSync(OUTPUT_ID).size;
    const metaSize = fs.statSync(OUTPUT_META).size;
    console.log(`\nDone.`);
    console.log(`  ${OUTPUT_COLOR}: ${(colorSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  ${OUTPUT_ID}: ${(idSize / 1024 / 1024).toFixed(2)} MB (gzip recommended)`);
    console.log(`  ${OUTPUT_META}: ${(metaSize / 1024).toFixed(1)} KB`);
    console.log(`  ${countriesMeta.length} countries`);
}

build();
