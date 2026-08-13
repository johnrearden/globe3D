#!/usr/bin/env node
/**
 * compress-assets.mjs — pre-compress the baked globe assets for R2 upload.
 *
 * The `.bin` assets live on Cloudflare R2 rather than Pages, because
 * world-mesh.bin exceeds Pages' 25 MiB-per-file cap. `_headers` — which carries
 * the note that "compression is applied automatically by the platform" — governs
 * Pages only, and the R2 upload recipe sets nothing but Cache-Control. The edge
 * does not compress application/octet-stream by default, so visitors have been
 * pulling ~51 MB of raw bytes where ~12 MB would do.
 *
 * R2 stores object bytes verbatim and returns whatever metadata was set on them,
 * and browsers transparently decompress a response carrying Content-Encoding. So
 * the fix is entirely in the upload: compress here, upload with the header, and
 * NOTHING in js/ changes. In particular the object keys keep their original
 * names (world-mesh.bin, not world-mesh.bin.br) so js/data/asset-base.js is
 * untouched.
 *
 * Brotli over gzip: every browser that supports WebGL2 and ES modules — which
 * this app already requires — supports `br` over HTTPS, and it buys ~30%.
 * Pass --gzip to fall back.
 *
 * Usage:
 *   node compress-assets.mjs [--out DIR] [--gzip] [--quality N]
 *
 * Then (a human, not the assistant — see CLAUDE.md):
 *   rclone copy dist-assets r2:terragotcha-assets \
 *     --header-upload "Cache-Control: public, max-age=86400" \
 *     --header-upload "Content-Encoding: br"
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
    const i = args.indexOf(name);
    return i === -1 ? fallback : args[i + 1];
};
const useGzip = args.includes('--gzip');
const outDir = flag('--out', 'dist-assets');
const quality = Number(flag('--quality', useGzip ? 9 : 11));

// Every file js/core/globe.js fetches through assetUrl(). Deliberately derived
// from a list rather than a glob: an unexpected file appearing in assets/ should
// not silently start being deployed.
const ASSETS = [
    'world-mesh.bin',
    'world-id.bin',
    'world-border-lines.bin',
    'country-palette.bin',
    'country-meta.json',
    'capitals.json',
];

mkdirSync(outDir, { recursive: true });

const fmt = n => n.toLocaleString().padStart(12);
const pct = (a, b) => `${((1 - b / a) * 100).toFixed(1)}%`.padStart(7);

console.log(`${useGzip ? 'gzip' : 'brotli'} -${quality} → ${outDir}/\n`);
console.log('file                          raw       compressed    saved     ms');
console.log('─'.repeat(72));

let rawTotal = 0;
let outTotal = 0;

for (const name of ASSETS) {
    const src = join('assets', name);
    let raw;
    try {
        raw = readFileSync(src);
    } catch {
        console.log(`${name.padEnd(26)} MISSING — skipped`);
        continue;
    }

    const t0 = Date.now();
    const out = useGzip
        ? gzipSync(raw, { level: quality })
        : brotliCompressSync(raw, {
            params: {
                [constants.BROTLI_PARAM_QUALITY]: quality,
                // 16 MB window: the mesh has long-range structure (whole
                // countries repeat similar vertex patterns) that the default
                // 4 MB window cannot reach across.
                [constants.BROTLI_PARAM_LGWIN]: 24,
                [constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
            },
        });
    const ms = Date.now() - t0;

    writeFileSync(join(outDir, name), out);
    rawTotal += raw.length;
    outTotal += out.length;
    console.log(`${name.padEnd(24)}${fmt(raw.length)}${fmt(out.length)}  ${pct(raw.length, out.length)}  ${String(ms).padStart(6)}`);
}

console.log('─'.repeat(72));
console.log(`${'total'.padEnd(24)}${fmt(rawTotal)}${fmt(outTotal)}  ${pct(rawTotal, outTotal)}`);

// Sanity check: a stale or partial run is worse than no run, because the header
// would then declare an encoding the bytes do not have.
const written = readdirSync(outDir).filter(f => ASSETS.includes(f));
if (written.length !== ASSETS.length) {
    console.error(`\nWARNING: ${written.length}/${ASSETS.length} assets written — do not upload a partial set.`);
    process.exit(1);
}
for (const name of written) {
    if (statSync(join(outDir, name)).size === 0) {
        console.error(`\nWARNING: ${name} is empty — do not upload.`);
        process.exit(1);
    }
}

console.log(`\nUpload with (keeps the original object keys):
  rclone copy ${outDir} r2:terragotcha-assets \\
    --header-upload "Cache-Control: public, max-age=86400" \\
    --header-upload "Content-Encoding: ${useGzip ? 'gzip' : 'br'}"

Then purge the cache, and verify with a GET (a HEAD may not reflect
edge compression):
  curl -s -o /dev/null -w '%{size_download} bytes, encoding=%{content_type}\\n' \\
    -H 'Accept-Encoding: br,gzip' https://assets.terragotcha.com/world-mesh.bin`);
