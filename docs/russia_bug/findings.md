# Russia Arctic-coast fill bug — diagnostic findings (2026-07-12)

## Symptom

Selecting Russia highlights its fill white, but the northern boundary renders as a
straight chord from ~Taymyr (77.7N, 104E) to ~Chukotka/Bering (65N, 180), excluding
the Arctic coastal strip (Lena delta, Indigirka, Kolyma lowlands). The true coastline
is still visible as a faint outline. Screenshot: 2026-07-12 15:44, localhost:8001.

## TL;DR

**The mesh data is correct. This is a WebGL primitive-drop bug in the browser stack
(Chrome/ANGLE — reproduces on the real GPU and on SwiftShader): in large indexed
draws, triangles whose three vertex indices span a wide range (~146k ids apart) are
silently not rasterized. The affected triangles are exactly the coastal-strip
triangles, which stitch original ring vertices (ids ~703k) to subdivision midpoints
appended at the end of the ring block (ids ~849k).**

## Verified facts (each independently tested)

1. **Render path**: selection sets shader uniform `uSelectedId`; the white shape is
   the baked triangulation from `assets/world-mesh.bin` (built by `build-textures.js`,
   mesh path at lines ~715-753). No runtime triangulation. The fragment shader
   recolors fragments whose `aCountryId` matches the selected id (`js/core/globe.js:126`).

2. **The asset is correct** (decoded directly in Node, multiple times):
   - Russia (id 146): 206,830 verts / 363,276 triangles; max triangle edge 4.7 deg.
   - Winding-aware ray-coverage traces the true coastline: Taymyr covered by
     front-facing triangles; Laptev/East-Siberian sea not covered.
   - earcut `deviation()` on the build pipeline output: 0.00%; the ring has no
     self-intersections; `unfoldRing` antimeridian handling is correct (in place
     since Apr 2026, before the mesh renderer existed).
   - Every git-committed version of the bin (Apr 27, Jun 3 x2) has identical counts
     and clean coverage. Today's rebuilds (15:45, 18:57) reproduced HEAD exactly.
   - A **software rasterizer** (Node: z-buffer + backface culling, same camera)
     renders the file correctly — the fill hugs the coastline ring exactly.

3. **Console counts match the clean build**: the browser logged
   `974451 vertices, 1574451 triangles` — a no-unfold (broken) build produces
   974367/1574232. The browser had the good data when the bug was photographed.

4. **Reproduced headlessly** with clean data, fresh Chrome profile (no cache, no
   service worker), forced `uSelectedId=146`, camera over (70N, 120E): the
   straight-chord cut appears. An **in-scene overlay** of the true ring
   (THREE.Points, green) arcs clearly north of the white fill edge.

5. **GPU state is correct**:
   - THREE's actual GL element buffer (captured via a `gl.drawElements` hook +
     `getBufferSubData` readback) is byte-identical to the CPU index array.
   - The draw call is `drawElements(TRIANGLES, 4723353, UNSIGNED_INT, 0)`, no GL
     errors, full triangle count reported by `renderer.info`.
   - The position buffer is proven good: working overlays share the same GL buffer.

6. **The dropped triangles are healthy**: extracting the ~16,342 strip triangles
   (same index values, same shared position attribute) into a small fresh geometry
   renders the strip perfectly — with MeshBasicMaterial AND with the app's own
   ShaderMaterial, with depthTest on or off.

7. **The discriminator is draw size — not buffer, not material, not shader**
   (strip-zone red-pixel scores, same scene, same camera, flat red material):

   | Draw                                              | Strip renders? |
   |---------------------------------------------------|----------------|
   | full buffer, drawRange [4159998, 21000] (strip)    | YES (162/451)  |
   | fresh small buffer, same 21000 indices             | YES (162/451)  |
   | full buffer, drawRange [3000000, 1723353]          | NO  (267/451)  |
   | fresh full-size copied buffer, same range          | NO  (267/451)  |
   | full buffer, [0, 4172082] or [0, all]              | NO             |
   | geometry.groups split into 2 draws (3M + 1.7M)     | NO             |

   Also: Alaska (indices AFTER the strip, ~4.3M+) renders in the full draw while
   the strip (~4.16M) does not — so it is not truncation of the draw tail; a
   *specific set of primitives* is dropped whenever the draw is large.

8. **What distinguishes the dropped triangles**: their vertex indices span
   ~146,000 ids (e.g. triangle {703457, 849446, 849447}) — they stitch original
   ring vertices to subdivision midpoints appended at the end of the ring's
   vertex block by `subdivideTriangles` (`build-textures.js:305`). Interior
   triangles reference only nearby ids and render fine.

## Ruled out (each with a concrete test)

- Stale asset / browser cache / CDN (localhost uses `./assets`; fresh-profile repro)
- Service workers (none registered)
- Antimeridian/earcut folding (deviation 0.00%; counts match the unfolded build)
- Vertex welding (none exists in the pipeline)
- Clipping planes (ocean sphere renders uncut through the dead zone)
- A depth-occluder object (full-scene ray sweep: only the ocean at r=0.9999 and the
  country mesh at r=1.0015 cover the dead zone)
- Backface culling of bad winding (DoubleSide unchanged; software raster correct)
- Shader logic (flat `gl_FragColor = red` still shows the cut)
- Depth precision / depth state (depthTest on/off identical for the small geometry)
- Index/position upload corruption (byte-perfect readbacks of THREE's own buffers)
- earcut sliver "blister" theory (a 2D pre-subdivision POC did not change the
  render; the software raster proves the file's coverage is correct as-is)

## Red herrings encountered

- Asset mtimes changed at 15:45:47 and 18:57:35 (external/manual rebuilds); output
  was byte-identical to HEAD both times — irrelevant.
- An early "coverage vs screen pixel" georef test suffered camera drift (the app's
  camera controller keeps animating); its per-cell classifications were unreliable.
- drawRange probes with starts not divisible by 3 rendered re-phased garbage
  triangles — those results were discarded.

## Environment

- three.js **r128** (2021, CDN global `window.THREE`), WebGL2.
- Reproduces identically on the user's real GPU (Chrome/Linux → ANGLE) and in
  headless SwiftShader (`--enable-unsafe-swiftshader`) → the defect lives in the
  shared ANGLE frontend (likely internal draw splitting / vertex-stream batching
  that breaks primitives whose vertex-id range straddles a batch boundary in very
  large draws). The exact internal mechanism was not confirmed before research
  was stopped.

## Proposed fix (not yet implemented)

**Reindex vertices for triangle locality in the builder** so no triangle spans a
wide vertex-id range: in `build-textures.js`, after the mesh arrays are built
(or per ring block), remap vertex ids by first use in triangle order
(meshoptimizer-style). ~20 lines; no runtime changes; asset format unchanged.

Cheap pre-validation (in-page, no rebuild): apply the same first-use remap to the
live geometry's arrays in the browser console and confirm the strip appears in the
full draw. Then implement in the builder, `npm run build:globe`, and verify:

1. Node software-raster of the new bin (coverage unchanged).
2. Headless browser: select Russia; the fill hugs the in-scene coastline overlay.
3. Spot-check other large/dateline countries (Canada, USA/Aleutians, NZ, Fiji).
4. Re-upload `world-mesh.bin` (+ siblings) to R2 (`assets.terragotcha.com`) for
   production — Cloudflare Pages cannot serve the 31 MB file.

Secondary hardening (optional): upgrade three.js r128 → current; split the merged
mesh into a few sub-meshes; add a build-time assert on max triangle vertex-id span.

## Repro/analysis techniques worth re-using

The session's throwaway scripts lived in a temp scratchpad and may be gone
(`/tmp/claude-1000/-home-john-dev-personal-globe/ee051054-.../scratchpad/`), but the
techniques are easy to recreate:

- Headless puppeteer against `localhost:8001` using `window.globe3dState` and the
  CDN global `window.THREE`; force selection via
  `material.uniforms.uSelectedId.value = 146`.
- Atomic render + `gl.readPixels` inside a single `page.evaluate` (the app's camera
  controller keeps animating, so screenshots taken after an await race with it).
- In-scene ground truth: add the simplified ring as `THREE.Points` at r=1.004 with
  `depthTest:false`.
- `gl.drawElements` hook to capture the live element-buffer binding, then
  `getBufferSubData` readback diff against the CPU array.
- Binary decode of `world-mesh.bin`: header `[u32 vertexCount][u32 indexCount]`,
  f32 positions ×3, u8 country ids (padded to 4 bytes), u32 indices.
