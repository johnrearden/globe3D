# Terragotcha — Globe Asset Size Reduction Plan

## Context / Problem

The globe downloads **~51 MB of binary assets** before it can render a single frame. This is the
dominant cost of first load, it pins the loading bar at 5% for the whole download, and it is the
one thing a React migration will *not* fix on its own — the assets are the same bytes regardless of
what framework mounts them.

There are two independent causes, and they compound.

**1. The assets are probably being served uncompressed.**

The `.bin` files were moved from Cloudflare Pages to **Cloudflare R2** (`assets.terragotcha.com`)
because `world-mesh.bin` exceeds Pages' 25 MiB-per-file cap (`build-pages.mjs:5-9`, with a hard
abort at `:59-63` if `assets/` leaks into `dist/`). The note in `_headers:1-2` — *"Compression
(gzip/br) is applied automatically by the platform — do not set Content-Encoding here"* — is true,
but **`_headers` only governs Pages**. R2 objects are uploaded with only a cache header:

```
rclone copy ./assets r2:terragotcha-assets --header-upload "Cache-Control: public, max-age=86400"
```
(`DEPLOYMENT_GUIDE.md:816-834`)

Cloudflare's edge does not compress `application/octet-stream` by default, no `.gz`/`.br` variants
are generated, and nothing sets `Content-Encoding` anywhere in the repo.
`docs/senior_dev/implementation-plan.md:438` still lists *"Confirm gzip in production… without it,
mobile users eat the full 16 MB"* as **Pending**. This needs one `curl` to confirm (below), but the
evidence points at users pulling the full raw 51 MB where compression alone would give 12.4 MB.

**2. The mesh is ~10× larger than the geometry requires.**

`subdivideTriangles` (`build-textures.js:309-364`) splits **every** triangle in a ring 1→4,
repeatedly, gated on the ring's **single worst** triangle (`maxSag()`, `:320-327`, `:332`). It exists
for a real reason — a flat triangle's interior dips below the ocean sphere at radius 1.0, so large
triangles let the ocean bleed through the land — and the comment at `:304-308` correctly explains why
it can't simply be made adaptive: a partially-subdivided ring develops T-junction cracks at the
boundary between split and unsplit triangles.

But because it is uniform and worst-triangle-gated, **54 of 5,936 rings (0.9%)** drag the entire mesh
up by **10.4× in triangles and 5.8× in vertices**. Per-country triangle counts, measured from the
shipped `world-mesh.bin`:

| country | triangles | vertices |
|---|---|---|
| Russia | 363,276 | 206,830 |
| China | 259,689 | 146,871 |
| Canada | 232,850 | 133,998 |
| Brazil | 182,744 | 102,936 |
| USA | 125,855 | 73,286 |

**Five countries are 74% of the whole mesh.** By contrast Indonesia — many small rings, none of them
with a huge earcut triangle — sits at 9,873 triangles / 9,828 vertices, a ratio of 1.0. It is never
subdivided at all. That contrast is the whole diagnosis.

**Target outcome:** ~51 MB → **~1.2–1.9 MB** over the wire, with **no visual change to the globe**.

---

## Measured Baseline

| file | raw | gzip -9 | brotli q11 |
|---|---|---|---|
| `world-mesh.bin` | 31,561,284 | 16,600,946 | 11,760,049 |
| `world-id.bin` | 16,777,216 | 87,361 | 63,657 |
| `world-border-lines.bin` | 2,838,040 | 854,156 | 537,801 |
| `country-meta.json` | 150,179 | 33,915 | 24,852 |
| `capitals.json` | 14,014 | 4,806 | 3,811 |
| `country-palette.bin` | 1,024 | 433 | 383 |
| **total** | **51,341,757** | **17,581,617** | **12,390,553** |

`world-mesh.bin` breaks down as: header 8 B · positions 11,693,412 B (`f32` ×3) · country ids
974,452 B (`u8`) · indices 18,893,412 B (`u32`). That is **974,451 vertices / 1,574,451 triangles**.
Note the indices alone are 18 MB — more than half the file.

`world-id.bin` is a red herring for bandwidth: it compresses 192× (mostly constant runs) and costs
64 KB brotli. It is a **memory and repo-weight** issue, not a wire issue.

The true geometric floor — the simplified country outlines at the current 0.006° tolerance — is only
**170,443 vertices across 6,486 rings**. Everything above that number is subdivision.

---

## Stage 0 — Serve Compressed

**No code change. 51 MB → 12.4 MB.** The highest return in this document by a wide margin, and it
should ship independently of everything else.

First confirm the diagnosis:

```
curl -sI -H 'Accept-Encoding: br,gzip' https://assets.terragotcha.com/world-mesh.bin \
  | grep -i 'content-encoding\|content-length'
```

If no `content-encoding` comes back, pre-compress at upload time. R2 stores object bytes verbatim and
returns whatever metadata you set on them, and browsers transparently decompress a response carrying
`Content-Encoding` — so **nothing in `js/core/globe.js` changes**:

```
# compress into a scratch dir, keeping the original file names
for f in world-mesh world-border-lines world-id country-palette; do
  brotli -q 11 -c assets/$f.bin > /tmp/r2/$f.bin
done
rclone copy /tmp/r2 r2:terragotcha-assets \
  --header-upload "Cache-Control: public, max-age=86400" \
  --header-upload "Content-Encoding: br"
```

Two things to get right:

- **Keep the object keys unchanged** (`world-mesh.bin`, *not* `world-mesh.bin.br`), so
  `js/data/asset-base.js` needs no edit.
- **Brotli vs gzip.** Every browser that supports WebGL2 and ES modules supports `br` over HTTPS, so
  brotli is safe here and buys ~30% over gzip. If that assumption ever needs relaxing, gzip is the
  drop-in fallback.

Purge the R2 cache afterwards per `DEPLOYMENT_GUIDE.md:836-846`, and update the upload recipe in that
guide so the header isn't lost on the next deploy.

---

## Stage 1 — Replace Uniform Subdivision With Graticule Clipping

**Build-time only. Visually lossless. Mesh 31.56 MB → 3.86 MB.**

Rather than subdividing *after* triangulation and fighting T-junctions, **clip each ring against a 4°
lat/lng grid before `earcut`**. Every resulting piece is at most 4° across, so chord sag is bounded
**by construction** and no subdivision pass is needed at all. Fine coastal detail stays exactly as
detailed as it is today; only the vast empty interiors of Russia, Canada and Brazil stop being
carpet-bombed with triangles.

This was prototyped and validated over all 200 country files before writing this document:

| | today | graticule 4° | change |
|---|---|---|---|
| vertices | 974,451 | **166,250** | −83% |
| triangles | 1,574,451 | **157,334** | −90% |
| max chord sag | — | **1.08e-3** | limit is 1.5e-3 ✓ |
| boundary edges | 354,755 | **165,214** | −53% |
| `world-mesh.bin` | 31.56 MB | **3.86 MB** | −88% |
| `world-border-lines.bin` | 2.84 MB | **1.26 MB** | −56% |

Cell size is chosen against the existing `MAX_CHORD_SAG = 1.5e-3` budget (`build-textures.js:42`):

| cell | max sag | verdict |
|---|---|---|
| 3° | 6.09e-4 | safe, but more triangles than needed |
| **4°** | **1.08e-3** | **chosen** — comfortable margin |
| 5° | 1.69e-3 | ✗ exceeds budget |
| 6° | 2.43e-3 | ✗ |

Russia alone goes from **363,276 triangles to ~10,055**.

### Changes in `build-textures.js`

1. **Add `clipRingToCell(poly, x0, y0, x1, y1)`** — Sutherland–Hodgman against an axis-aligned box.
   Clip in the **unfolded** lng/lat space produced by `unfoldRing` (`:70-82`), so antimeridian
   countries (Russia continues past lng 180) bucket correctly under `Math.floor(lng / CELL)`. Return
   `null` below 3 points, and discard pieces whose absolute area is under an epsilon — box clipping
   produces slivers at cell corners.

2. **Rewrite the ring→mesh block (`:723-757`).** Compute the ring's unfolded bbox, iterate the cells
   it spans, clip, `earcut` each piece, and project each piece's vertices to the unit sphere using
   the existing inline formula (`:730-742`). Introduce `GRATICULE_CELL_DEG = 4` alongside the
   existing constants.

3. **Delete `subdivideTriangles`** (`:309-364`) and its call site (`:745`). **Keep `MAX_CHORD_SAG`** —
   it stops being a subdivision trigger and becomes the documented sag budget that justifies the 4°
   cell, asserted against at the end of the build.

4. **Weld vertices per country — this is required, not an optimisation.** Adjacent cells each emit
   their own copy of the shared cut edge. `extractBorderEdges` (`:517-548`) defines a border as *"an
   edge used by exactly one triangle"*, so without welding **every grid cut would render as a fake
   border**, painting a 4° lattice across the globe. Weld with a `Map` keyed on the rounded lng/lat
   (`Math.round(v * 1e6)` ≈ 0.11 m, against a 668 m simplification tolerance), scoped to the
   **current country** so countries still never share vertices and border extraction keeps working
   exactly as designed.

   Verified in the prototype: welded boundary edges came to **165,214** against a 170,443
   outline-vertex count — i.e. grid cuts are correctly excluded and only true outlines survive.

   T-junctions between neighbouring cells are not a risk: Sutherland–Hodgman sets the cut coordinate
   *literally* to the boundary value and interpolates the other from the same edge with the same `t`,
   so two adjacent cells produce bit-identical intersection points.

5. **Leave the ID rasteriser alone.** `rasterizeRingToBuffer` (`:273-295`) works in lng/lat on the
   *unclipped* simplified ring, where triangles are already exact. `world-id.bin` comes out
   byte-identical, so **picking is completely unaffected** by this stage.

6. **Keep per-country vertex contiguity** (rings are already appended in country order). Stage 2
   depends on it.

7. Remove the dead `VERY_LARGE_COUNTRIES_FILES` / `LARGE_COUNTRIES_FILES` constants (`:44-45`) —
   declared, never referenced.

The wire format is **untouched** in this stage — still
`[u32 vertCount][u32 idxCount][f32 xyz][u8 ids][u32 indices]` — so `js/core/globe.js:313-338` and
`tests/world-mesh-format.test.js` need no changes.

**Cumulative after Stages 0+1: ≈1.9 MB brotli.**

---

## Stage 2 — Compact Wire Format

**Build + runtime. Mesh 3.86 MB → 2.01 MB.**

1. **Positions as `int16`, normalized.** Store unit-sphere xyz in an `Int16Array` and hand it to
   Three as `new THREE.BufferAttribute(positions, 3, /* normalized */ true)` — the GPU does the
   conversion in hardware, so there is **no runtime decode cost**. Precision is 1/32767 ≈ 3.05e-5 of
   radius ≈ **194 m**, against the 668 m simplification tolerance already in use. Worst-case radial
   perturbation (~2.6e-5) is negligible against the ~0.002 clearance between the country mesh
   (radius 1.0008, scaled ~1.002) and the ocean sphere (1.0), and stacks safely on the 1.08e-3 sag.
   **12 B/vertex → 6 B/vertex.**

2. **Indices as per-country `uint16`.** After Stage 1 the largest single country is Russia at ~11,746
   vertices — 5× under the 65,535 ceiling. Add a small directory (`[u32 countryCount]`, then
   `[u32 baseVertex][u32 indexCount]` per country, ~1.9 KB total) and store base-relative `u16`
   indices, expanded to one `Uint32Array` at load. **4 B → 2 B per index**, halving the largest
   remaining section.

3. **Add a format version field** to the header, and update `_buildCountryMesh`
   (`js/core/globe.js:313-338`) and `tests/world-mesh-format.test.js` in the same change.

Result: 997,500 (positions) + 166,252 (ids) + 944,004 (indices) ≈ **2.01 MB**.

The border line shares the fill mesh's `position` attribute object verbatim (`js/core/globe.js:357`),
so it inherits the quantised positions automatically and remains exactly co-radial — no parallax
regression at the limb.

**Cumulative after Stages 0+1+2: ≈1.2 MB brotli.**

---

## Stage 3 — Cleanups

Small or non-bandwidth wins, worth doing while the pipeline is open.

- **`world-id.bin` to 1 byte/pixel: 16.78 MB → 8.39 MB raw.** The high byte is *provably* always
  zero: `MAX_COUNTRIES = 256` and `aCountryId` is already a `u8` vertex attribute, so ids can never
  exceed 255 (current max is 237). Touches the writer (`build-textures.js:678-684`), the picker
  (`js/core/globe.js:628-629`, `id = hi*256 + lo` → a single byte read) and the length assertion at
  `:464`. Near-zero wire impact — it brotlis to 64 KB either way — but it saves **8 MB of resident
  memory** on every session and halves that file's contribution to the repo.
- **`country-meta.json`**: drop the 2-space indent from `JSON.stringify(meta, null, 2)` (`:845`) and
  round coordinates. ~150 KB → ~100 KB.
- **Real loading progress.** The bar jumps 5% → 70% with the entire download in between
  (`js/core/globe.js:423` → `:459`). Much less pressing once assets are ~1 MB, but
  `response.body.getReader()` would make it honest.
- Fix the stale `~3.8 MB country mesh` comment at `js/core/globe.js:240`.

---

## Explicitly Not Doing

**Loosening `SIMPLIFICATION_TOLERANCE` (currently 0.006°, ~668 m).** Measured alternatives:

| tolerance | ≈ metres | outline vertices | vs today |
|---|---|---|---|
| 0.006° | 668 | 170,443 | baseline |
| 0.01° | 1,113 | 136,559 | −20% |
| 0.02° | 2,226 | 90,195 | −47% |

It is a genuine lever, but it is the **only change here that is visually lossy** — it softens fjord
and archipelago coastlines (Norway, Greece, Philippines) at the 1.13 max-zoom level, and it would
require a visual review pass that Stages 0–3 do not. Since those stages already reach ~1.2 MB
without touching fidelity, this isn't worth spending. Revisit only against a hard budget.

Also considered and rejected for now: **Draco / meshopt compression**. Both would beat hand-rolled
quantisation, but they add a decoder dependency (the app currently parses raw binary directly, with
Three r128 loaded as a plain CDN global) for a marginal gain over Stage 2's ~1.2 MB. Worth
revisiting only if the mesh grows substantially.

---

## Relationship to the React Migration

Nothing here depends on React, and nothing here is invalidated by it. `GlobeManager` is mounted once
into a ref and driven imperatively either way; Stages 1 and 3 are pure build-pipeline work, and
Stage 2 touches ~25 lines of `_buildCountryMesh`. **Stage 0 should ship immediately and separately**
— it is a deploy-config change with no code in it at all.

The one genuine interaction: a persistent in-memory globe makes the first-load cost even more
prominent, because it is paid exactly once and everything after it is instant. Getting it from ~51 MB
to ~1 MB is what makes that architecture feel the way it is supposed to.

---

## Verification

1. **Build** — `npm run build:globe`. Assert in-build that max chord sag stays under
   `MAX_CHORD_SAG`, and that printed counts land near 166k vertices / 157k triangles.
2. **Format tests** — `npm test` (vitest: `tests/world-mesh-format.test.js`,
   `tests/theme-tokens.test.js`).
3. **No fake borders** — the key Stage 1 regression. Assert in-build that extracted boundary edges
   come to ~165k and **not** roughly double that; a jump means welding failed and grid cuts leaked
   into the border set. Confirm visually that no 4° lattice is visible across country interiors.
4. **Picking unchanged** — `world-id.bin` should be byte-identical after Stage 1 (`sha256sum` before
   and after). After Stage 3, the same ids at half the width.
5. **Browser check** — drive the real module in headless `google-chrome` via `puppeteer-core` from
   the scratchpad (no Playwright/jsdom in this project). Verify: globe renders; borders stay crisp
   all the way to the limb with no fade; **no ocean bleed-through through country interiors at max
   zoom (1.13) over Russia, Canada and Brazil** — the specific failure the old subdivision existed to
   prevent, and the thing most likely to regress; click/hover picking still resolves correct country
   names; selection highlight and gradient intact.
6. **Wire check** after redeploy — re-run the Stage 0 `curl -sI` and confirm `content-encoding: br`
   with a `content-length` in the low hundreds of KB.

---

## Documents to Update Alongside

Per `CLAUDE.md`, `docs/senior_dev/implementation-plan.md` is the single source of truth for
refactor/deployment work and **must** be updated by any change that renders it stale:

- `CLAUDE.md` — the asset size table (lines 130-134) and the Build Process / Performance sections
  that describe subdivision
- `docs/senior_dev/implementation-plan.md` — the Stage 5 gzip item (`:438`) and the "354k edges"
  border note (`:474`)
- `DEPLOYMENT_GUIDE.md` — the R2 upload recipe gains `Content-Encoding`

---

## Summary of Decisions

1. **Serve the R2 assets compressed** — one deploy-config change, 51 MB → 12.4 MB, ships first and
   independently. Confirm with `curl -sI` before assuming it's broken.
2. **Replace uniform subdivision with 4° graticule pre-clipping** — bounds chord sag by construction,
   removes a 10.4× triangle multiplier, and is visually lossless. Mesh 31.56 MB → 3.86 MB.
3. **Weld vertices per country** as a hard requirement of (2), or grid cuts render as fake borders.
4. **Quantise the wire format** — `int16` normalized positions and per-country `u16` indices — for a
   further halving to ~2 MB, at the cost of a small loader change.
5. **Trim `world-id.bin` to one byte per pixel** for 8 MB of memory and repo weight; it is not a
   bandwidth problem.
6. **Do not loosen simplification tolerance** — it's the only lossy lever and isn't needed.
7. Net target: **~51 MB → ~1.2 MB**, no visual change.
