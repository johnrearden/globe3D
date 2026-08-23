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
Stages 0 and 1 are shipped and reached **1.73 MB**; Stage 2 would take it to ~1.2 MB.

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

**The format costs nothing to decode.** Measured during the C0 spike
([`c0-expo-gl-spike.md`](./c0-expo-gl-spike.md)): 974k vertices in **2 ms**, because the three arrays
are `Float32Array`/`Uint8Array`/`Uint32Array` **views onto the fetched `ArrayBuffer`** — no copy, no
parse loop. That is worth stating explicitly because it is the property every alternative here is
implicitly trading away, and it is the reason the file is this big in the first place. It is a good
trade at 30 MB; it will still be a good trade at 3.9 MB.

The true geometric floor — the simplified country outlines at the current 0.006° tolerance — is only
**170,443 vertices across 6,486 rings**. Everything above that number is subdivision.

---

## Stage 0 — Serve Compressed

**No code change. 51.3 MB → 12.3 MB.** The highest return in this document by a wide margin, and it
should ship independently of everything else.

> **Diagnosis confirmed, 2026-08-13.** The `curl` below returns **~31 MB** for `world-mesh.bin` — the
> full raw size, no `content-encoding`. Visitors have been pulling the whole 51 MB. This stage is no
> longer conditional.
>
> ```
> curl -sI -H 'Accept-Encoding: br,gzip' https://assets.terragotcha.com/world-mesh.bin \
>   | grep -i 'content-encoding\|content-length'
> ```
>
> (Remote checks are a human's to run — per `CLAUDE.md` the assistant does not touch remote hosts.
> Re-verify with a **GET** rather than a HEAD after deploying: a HEAD does not always reflect edge
> compression, so it can only ever prove the *bad* case, which is what it did here.)

The tooling is in the repo: **`npm run build:assets`** (`compress-assets.mjs`) writes brotli -11
copies of all six fetched assets into `dist-assets/` under their **original names**, so
`js/data/asset-base.js` and `js/core/globe.js` need no edit. R2 stores object bytes verbatim and
returns whatever metadata you set on them, and browsers decompress transparently.

Measured output (brotli -11, `BROTLI_PARAM_LGWIN: 24`; ~2 min, one-off):

| file | raw | brotli | saved |
|---|---|---|---|
| `world-mesh.bin` | 31,561,284 | 11,661,798 | 63.1% |
| `world-id.bin` | 16,777,216 | 63,574 | 99.6% |
| `world-border-lines.bin` | 2,838,040 | 537,801 | 81.1% |
| `country-meta.json` | 150,179 | 24,852 | 83.5% |
| `capitals.json` | 14,014 | 3,811 | 72.8% |
| `country-palette.bin` | 1,024 | 383 | 62.6% |
| **total** | **51,341,757** | **12,292,219** | **76.1%** |

Slightly better than the estimate in *Measured Baseline* (12.29 vs 12.39 MB) because of the 16 MB
brotli window — the mesh has long-range structure the default 4 MB window cannot reach across.

Three things to get right:

- **Never set `Content-Encoding` on `planet-z9.pmtiles`.** It is read by **HTTP Range request** —
  that is the entire point of the format, and `DEPLOYMENT_GUIDE.md` §6.7 verifies it with a `206`. A
  ranged read of a brotli-encoded object returns a slice of the *compressed* stream, which no client
  can decode: **the map would break completely while every status-code check still passed.** This is
  the one way Stage 0 can go badly wrong, and the existing upload recipe — `rclone copy ./assets` for
  the whole directory — is exactly the shape that would do it. Hence the two-pass upload now in the
  guide. The globe's `.bin` files are always fetched whole, never ranged, which is what makes
  compressing *them* safe.
- **Keep the object keys unchanged** (`world-mesh.bin`, *not* `world-mesh.bin.br`).
- **Brotli vs gzip.** Every browser that supports WebGL2 and ES modules supports `br` over HTTPS, so
  brotli is safe here and buys ~30% over gzip. `npm run build:assets -- --gzip` is the drop-in
  fallback.

Purge the R2 cache afterwards per `DEPLOYMENT_GUIDE.md`. The upload recipe there has been updated so
the header isn't lost on the next deploy.

---

## Stage 1 — Replace Uniform Subdivision With Graticule Clipping

**Build-time only. Visually lossless. Mesh 31.56 MB → 3.85 MB.**

> **Shipped 2026-08-23.** Measured against the prototype's predictions, which held:
>
> | | predicted | actual |
> |---|---|---|
> | vertices | 166,250 | **165,646** |
> | triangles | 157,334 | **156,732** |
> | max chord sag | 1.08e-3 | **1.083e-3** |
> | boundary edges | 165,214 | **164,610** |
> | `world-mesh.bin` | 3.86 MB | **3.85 MB** |
> | `world-border-lines.bin` | 1.26 MB | **1.26 MB** |
>
> Over the wire with Stage 0: **12.29 MB → 1.73 MB**. `world-id.bin` is
> byte-identical (verified by sha256), so picking is provably unaffected. Build
> time also fell to ~2s, since nothing iterates subdivision passes any more.

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
   cell, asserted against at the end of the build. *(Done. The assertion was verified by widening the
   cell to 6°, which produced 2.434e-3 against the predicted 2.43e-3 and exited 1.)*

4. **Weld vertices per country — this is required, not an optimisation.** Adjacent cells each emit
   their own copy of the shared cut edge. `extractBorderEdges` (`:517-548`) defines a border as *"an
   edge used by exactly one triangle"*, so without welding **every grid cut would render as a fake
   border**, painting a 4° lattice across the globe. Weld with a `Map` keyed on the rounded lng/lat
   (`Math.round(v * 1e6)` ≈ 0.11 m, against a 668 m simplification tolerance), scoped to the
   **current country** so countries still never share vertices and border extraction keeps working
   exactly as designed.

   Verified in the prototype: welded boundary edges came to **165,214** against a 170,443
   outline-vertex count — i.e. grid cuts are correctly excluded and only true outlines survive.

   *In the shipped build this is asserted directly rather than by edge count, which only catches
   gross failure. An unwelded cut leaves each adjacent cell holding its own copy of the shared edge,
   and since each copy is then used by exactly one triangle, both register as boundaries — so the
   build fails if any boundary edge is duplicated **within one country**. Duplication across
   **different** countries is the opposite signal: that is a shared political border, correct
   precisely because countries never share vertices (34,447 of them). Measured on the real build:
   0 same-country duplicates. Verified by disabling the weld, which produced 3,889.*

   T-junctions between neighbouring cells are not a risk: Sutherland–Hodgman sets the cut coordinate
   *literally* to the boundary value and interpolates the other from the same edge with the same `t`,
   so two adjacent cells produce bit-identical intersection points.

5. **Leave the ID rasteriser alone.** `rasterizeRingToBuffer` (`:273-295`) works in lng/lat on the
   *unclipped* simplified ring, where triangles are already exact. `world-id.bin` comes out
   byte-identical, so **picking is completely unaffected** by this stage.

   **Holes are a non-issue** — worth confirming rather than discovering mid-implementation. The build
   calls `earcut(flat, null, 2)` (`:728`): the holes argument is always `null`, so every ring is
   triangulated independently as a solid polygon and enclaves (Lesotho, Vatican, San Marino) are
   resolved by draw order and the ID buffer, not by holes. Clipping ring-by-ring therefore cannot
   desynchronise an outer ring from its holes, because there is no such relationship to break.

6. **Keep per-country vertex contiguity** (rings are already appended in country order). Stage 2
   depends on it.

7. Remove the dead `VERY_LARGE_COUNTRIES_FILES` / `LARGE_COUNTRIES_FILES` constants (`:44-45`) —
   declared, never referenced.

The wire format is **untouched** in this stage — still
`[u32 vertCount][u32 idxCount][f32 xyz][u8 ids][u32 indices]` — so `js/core/globe.js:313-338` and
`tests/world-mesh-format.test.js` need no changes.

**Cumulative after Stages 0+1: 1.73 MB brotli** (measured, vs. the ≈1.9 MB estimated).

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

   This is the one step that **gives up the zero-copy property** — the indices stop being a view and
   become a fresh 1.9 MB allocation filled by a 472k-iteration loop. At post-Stage-1 sizes that is a
   few milliseconds and ~2 MB, so it is affordable; it is called out because it is a real change in
   kind, not degree, and because it is what would make a Draco/meshopt decoder no longer a
   *categorical* regression if the mesh ever grew enough to justify one.

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

> **Shipped 2026-08-23**, except the loading-progress item — see below.
>
> | | before | after |
> |---|---|---|
> | `world-id.bin` | 16,777,216 | **8,388,608** (−50%) |
> | `country-meta.json` | 150,179 | **75,217** (−49.9%) |
> | `country-meta.json` brotli | 24,852 | **15,942** (−35.9%) |
>
> The ID halving is **provably lossless**: reconstructing the old two-byte layout
> from the new file matches the previous asset byte-for-byte, and all 8.4M high
> bytes in the old file were zero. Total wire cost is now **~1.72 MB** — the ID
> map barely moves it (53 KB → ~52 KB brotli), which was the point: this item is
> an **8 MB resident-memory** win, not a bandwidth one.

- **`world-id.bin` to 1 byte/pixel: 16.78 MB → 8.39 MB raw.** The high byte is *provably* always
  zero: `MAX_COUNTRIES = 256` and `aCountryId` is already a `u8` vertex attribute, so ids can never
  exceed 255 (current max is 237). Touches the writer (`build-textures.js:678-684`), the picker
  (`js/core/globe.js:628-629`, `id = hi*256 + lo` → a single byte read) and the length assertion at
  `:464`. Near-zero wire impact — it brotlis to 64 KB either way — but it saves **8 MB of resident
  memory** on every session and halves that file's contribution to the repo.
- **`country-meta.json`**: drop the 2-space indent from `JSON.stringify(meta, null, 2)` (`:845`) and
  round coordinates. ~150 KB → ~100 KB.
- ~~**Real loading progress.**~~ **Moot — the bar this describes no longer exists.** The
  splash was redesigned to the Terragotcha lockup at some point, and its `.tg-bar` is an
  **indeterminate CSS keyframe sweep** (`tg-loadbar`, `styles.css:3485`), not a determinate
  fill. Meanwhile `SceneManager.updateLoadingProgress()` still writes to
  `loading-progress-fill` / `loading-progress-text` — **ids that are not in the DOM** — so
  the whole `onProgress` chain from `loadGlobe` has been dead code since that redesign.
  Nothing reads the percentages it computes.

  Making progress real is therefore a **UI decision** (replace an intentionally
  indeterminate sweep with a determinate bar), not an asset cleanup — and the UI is being
  rebuilt from scratch in Phase B regardless. Two things to do there rather than here:
  wire the new splash to real progress if wanted, and delete `updateLoadingProgress` and
  its three call sites in `index.html` if not.

  (An attempt at this landed and was reverted. Worth recording *why*: streaming via
  `response.body.getReader()` means concatenating chunks into a new `ArrayBuffer` — an
  extra full copy of the mesh — where `.arrayBuffer()` hands back one allocation the typed
  arrays view directly. That zero-copy decode is why the mesh parses in ~2 ms, and it is
  worth more than bar smoothness. Weighting by per-asset completion avoids the copy, but
  the mesh is 83% of the transfer, so the bar stays mesh-dominated either way.)
- ~~Fix the stale `~3.8 MB country mesh` comment at `js/core/globe.js:240`.~~ **No longer
  stale.** It was written when the mesh really was ~3.8 MB, went wrong when the mesh grew to
  31 MB, and Stage 1 has made it accurate again (3.85 MB). Left alone deliberately — do not
  "fix" it from the old plan text.

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
quantisation, but for a marginal gain over Stage 2's ~1.2 MB.

The stated reason — *"they add a decoder dependency (the app currently parses raw binary directly,
with Three r128 loaded as a plain CDN global)"* — **no longer holds** as of `bcc7c0f`. `three` is now
imported by bare specifier through an importmap, so adding a decoder is one importmap entry and an
`import`, not a new `<script>` tag. The rejection still stands, but on the remaining grounds alone:
the gain is small, and a decoder costs main-thread time on a device that currently spends **2 ms**
turning 30 MB into a mesh (see below). Those two facts pull in opposite directions from the ones
originally cited, and the second is the stronger one.

---

## Relationship to the React Migration

Nothing here depends on React, and nothing here is invalidated by it. `GlobeManager` is mounted once
into a ref and driven imperatively either way; Stages 1 and 3 are pure build-pipeline work, and
Stage 2 touches ~25 lines of `_buildCountryMesh`. **Stage 0 should ship immediately and separately**
— it is a deploy-config change with no code in it at all.

The one genuine interaction: a persistent in-memory globe makes the first-load cost even more
prominent, because it is paid exactly once and everything after it is instant. Getting it from ~51 MB
to ~1 MB is what makes that architecture feel the way it is supposed to.

## Relationship to the Expo app

This document was written as a **bandwidth** plan, before the C0 spike ran. That spike changed what
Stage 1 is worth, in two ways this section exists to record.

**Stage 1 is now also the memory plan.** C0 established that expo-gl can render the real mesh, and
left exactly one question open: memory. The globe added ~164 MB of PSS on an emulator against 63 MB
predicted, confounded by the Expo Go dev client and the emulator's GL translator, and needing a
release build on physical hardware to resolve. Stage 1 cuts vertices 83% and triangles 90% — so it
takes the *predicted* native footprint from ~63 MB to ~8 MB and shrinks whatever the *unexplained*
component turns out to be by roughly the same factor. **Stage 1 is the cheapest way to stop caring
about the answer.** If the physical-device measurement comes back bad, this is the fix; doing it
first means possibly never needing the measurement at all.

**It removes the "lite mesh for mobile" branch entirely.** The migration plan reasoned that a
decimated mesh was justified for mobile web regardless of the native outcome (~16 MB gzipped over
cellular, paid by every visitor, on the exact pages AdSense judges). Stage 1 delivers a **larger**
reduction than decimation would, **losslessly** — so there is no lite variant to build, no second
asset to keep in sync, and no divergence between what a phone sees and what a desktop sees. That is a
whole workstream deleted, and it is a stronger argument for Stage 1 than anything in the bandwidth
case above.

The native app also inherits Stage 3's `world-id.bin` halving directly: 8 MB of resident memory
matters considerably more inside an Android app's budget than it does in a browser tab.

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
   and after). After Stage 3, the same ids at half the width. *(Confirmed byte-identical, and
   search-select still resolves France / Brazil / Japan / Egypt / Greenland correctly in the app.)*
5. **Browser check** — drive the real module in headless `google-chrome` via `puppeteer-core` from
   the scratchpad (no Playwright/jsdom in this project). Verify: globe renders; borders stay crisp
   all the way to the limb with no fade; **no ocean bleed-through through country interiors at max
   zoom (1.13) over Russia, Canada and Brazil** — the specific failure the old subdivision existed to
   prevent, and the thing most likely to regress; click/hover picking still resolves correct country
   names; selection highlight and gradient intact.

   **Do not diff whole screenshots.** Learned the hard way while verifying `bcc7c0f`: the 1px borders
   and graticule lines jitter sub-pixel between two runs of *identical* code under SwiftShader, giving
   a **3.6% differing-pixel noise floor** that swamped the 2.1% signal being looked for. Fills do not
   jitter. So sample fill colour at fixed points — background, two ocean points, several large country
   interiors — and compare exact RGB; those came back byte-identical across runs. The diff image is
   still worth generating, but read it for *where* the red is (line work vs. interiors), not for the
   count. For this stage that discipline is doubly apt: ocean bleed-through and a leaked 4° border
   lattice are both changes to fills and line work respectively, so the two signals stay separable.
6. **Wire check** after redeploy — re-run the Stage 0 `curl -sI` and confirm `content-encoding: br`
   with a `content-length` in the low hundreds of KB.

---

## Documents to Update Alongside

Per `CLAUDE.md`, `docs/senior_dev/implementation-plan.md` is the single source of truth for
refactor/deployment work and **must** be updated by any change that renders it stale:

- `CLAUDE.md` — the asset size table (lines 133-137) and the Build Process / Performance sections
  that describe subdivision
- `docs/senior_dev/implementation-plan.md` — the Stage 5 gzip item (`:440`) and the "354k edges"
  border note (`:476`)
- `DEPLOYMENT_GUIDE.md` — the R2 upload recipe gains `Content-Encoding`
- `docs/react_migration/c0-expo-gl-spike.md` — its memory section is written against a 30 MB mesh;
  Stage 1 changes the arithmetic it reasons from
- The migration plan's "a lite mesh remains justified for mobile web" conclusion, which Stage 1
  retires (see *Relationship to the Expo app*)

Line references in this document were correct at `ba235bd`. `bcc7c0f` shifted `CLAUDE.md` by +3 and
`implementation-plan.md` by +2 below their edit points; `build-textures.js` and `js/core/globe.js`
line numbers are unaffected.

---

## Summary of Decisions

1. **Serve the R2 assets compressed** — one deploy-config change, 51.3 MB → 12.3 MB, ships first and
   independently. **Confirmed broken 2026-08-13**; tooling is `npm run build:assets`. Upload in two
   passes — brotli on the pmtiles would break the map's range requests silently.
2. **Replace uniform subdivision with 4° graticule pre-clipping** — bounds chord sag by construction,
   removes a 10.4× triangle multiplier, and is visually lossless. Mesh 31.56 MB → 3.86 MB.
3. **Weld vertices per country** as a hard requirement of (2), or grid cuts render as fake borders.
4. **Quantise the wire format** — `int16` normalized positions and per-country `u16` indices — for a
   further halving to ~2 MB, at the cost of a small loader change.
5. **Trim `world-id.bin` to one byte per pixel** for 8 MB of memory and repo weight; it is not a
   bandwidth problem. **Shipped**, and verified byte-for-byte lossless.
6. **Do not loosen simplification tolerance** — it's the only lossy lever and isn't needed.
7. Net target: **~51 MB → ~1.2 MB**, no visual change.
8. **Stage 1 is also the native-memory fix and the reason no lite mesh is needed** — added after the
   C0 spike; see *Relationship to the Expo app*.

---

## Revisions

**2026-08-13**, after the A8 (`bcc7c0f`) and C0 (`f31f6c6`) work. The plan's structure, staging and
numbers all survived; what changed:

- One factual claim was falsified — three is no longer "a plain CDN global", which removes the stated
  reason for rejecting Draco/meshopt. The rejection was re-argued on grounds that do hold.
- Two new facts were folded in: the format decodes in 2 ms because it is zero-copy (which Stage 2
  partially spends), and holes are never passed to `earcut`, which retires a risk Stage 1 would
  otherwise have had to handle.
- The plan gained a dimension it did not have: it was a bandwidth document, and Stage 1 turns out to
  be the lever on the native app's one unresolved risk, and to delete the lite-mesh workstream.
- Stale line references were corrected and the verification section gained the screenshot-diffing
  lesson from A8.
- **Stage 0's diagnosis was confirmed** (~31 MB, uncompressed) and the stage was implemented as far
  as it can be locally: `compress-assets.mjs` / `npm run build:assets`, with measured output replacing
  the estimate. Implementing it surfaced a hazard the plan had not: the existing upload recipe copies
  all of `assets/` in one pass, and adding `Content-Encoding` to that command would silently break
  the pmtiles map, which depends on range requests. The upload is now two passes.

Nothing in Stages 0–3 was reordered or dropped. The priority ordering is unchanged, with one
strengthening: Stage 1's case is now materially better than when it was written.
