# C0 — expo-gl spike: can React Native render the real globe?

**Verdict: yes, with one known workaround. The native-globe plan is viable.**

Run on 2026-08-13 against the tree at `bcc7c0f`. The rig is `spikes/expo-gl-mesh/`;
re-run it before trusting any of these numbers on new hardware.

This spike existed because Phase C's whole shape depends on the answer. If the real
mesh could not be rendered natively, the Expo app would need either a decimated
globe (a second asset pipeline, a second visual identity) or a 2D map, and
`GlobeBridge` would have to abstract over two genuinely different things rather
than two implementations of the same thing. None of that is now necessary.

## What was tested

The rig loads the **same three asset files the web app loads**, builds the **same**
`BufferGeometry`, and compiles the **same GLSL** — the custom `aCountryId`
attribute, the 256-pixel palette texture lookup, the border shader's horizon-cull
`discard`, and the specular lighting. A simplified stand-in would have proved
nothing; every one of those is a place expo-gl could have fallen short.

| | |
|---|---|
| Device | Android emulator, API 36, `-gpu host` (NVIDIA GT 1030) |
| Expo | SDK 57.0.12, React Native 0.86.2, Expo Go |
| expo-gl | 57.0.2 |
| three | r185.1 |
| Mesh | 974,451 vertices · 1,574,451 triangles · 30.1 MB |

## Results

```
GL                  OpenGL ES 3.1
uint32 indices      supported
WebGL2 API          present (15/15 probed)
fetch 30.1 MB       948 ms   (expo/fetch)
decode              2 ms     (zero-copy typed-array views)
scene assembly      73 ms
first frame         259 ms   (shader compile + all bufferData)
context → 1st pixel 1393 ms
steady state        60 fps   (vsync-capped)
```

### 1. expo-gl really is WebGL2, but three rejects it anyway

three dropped WebGL1 in r163 and now calls WebGL2 entry points unconditionally.
Its guard is `context instanceof WebGLRenderingContext` — and expo-gl's context
class descends from that global while being ES 3.1 underneath, so a perfectly
capable context is refused:

```
Error: THREE.WebGLRenderer: WebGL 1 is not supported since r163.
```

It is a false positive, not a capability gap: all fifteen WebGL2-only methods
three needs (`createVertexArray`, `texStorage2D`, `drawElementsInstanced`,
`blitFramebuffer`, …) are present and working.

That line is the **only** use of `WebGLRenderingContext` in the whole of three, so
the narrowest fix is to hide the global for the duration of the constructor:

```js
const Real = globalThis.WebGLRenderingContext;
globalThis.WebGLRenderingContext = undefined;
try { renderer = new THREE.WebGLRenderer({ context: gl, canvas: canvasShim }); }
finally { globalThis.WebGLRenderingContext = Real; }
```

No fork, no `patch-package`. Worth an upstream issue against either project, but
not worth blocking on.

### 2. Getting 30 MB into JS is not a problem

The plan flagged this as a risk on the grounds that React Native's `fetch` has
historically round-tripped binary bodies as base64 over the bridge. **That is no
longer true in RN 0.86**: on the same 2.7 MB file, RN's built-in fetch took 23 ms
against `expo/fetch`'s 73 ms. So the shared loader does *not* need `expo/fetch`,
and binary asset loading is not a constraint on the design.

### 3. The plan's parse-memory concern was wrong

The plan said to expect "~2–3× file size while raw buffer and typed arrays
coexist". That is true of formats that need parsing; `world-mesh.bin` does not.
Its three arrays are `Float32Array`/`Uint8Array`/`Uint32Array` **views onto the
fetched `ArrayBuffer`** — no copy, no parse loop. Hence 2 ms for 974k vertices.

The theoretical footprint is therefore 30.1 MB raw + 32.8 MB of GPU buffers
≈ 63 MB, not 60–90 MB of transient parse garbage.

### 4. Measured memory is inconclusive, and deliberately reported as such

PSS went from 176 MB before the mesh landed to ~372 MB steady, i.e. **+164 MB
attributable to the globe** — well above the 63 MB the arithmetic predicts.

Three things confound that number, and all three inflate it:

- **Expo Go is a dev client.** 176 MB was resident before a single globe byte
  arrived. A release build carries none of that.
- **The emulator's GL translator keeps host-side shadow copies** of every buffer,
  which land in the process's native heap. Real GPU memory usually does not.
- Releasing the JS-side arrays after upload (three's `attribute.onUpload(function
  () { this.array = null })`, plus dropping the closure's own views onto the
  `ArrayBuffer`) moved the number **not at all** — 211.6 MB either way. On a real
  device that should be worth ~30 MB; here it is invisible, which is itself
  evidence the figure is dominated by the emulator's own copies rather than ours.

**So: memory is the one open question, and it needs a release build on a physical
low-end Android device.** Everything else in this document is hardware-independent
and settled. The `onUpload` release above is a real 30 MB lever if it turns out to
be needed — the app never raycasts the mesh (picking goes through the separate
`world-id.bin` ID buffer) and sets `boundingSphere` by hand, so nothing needs the
CPU-side copy.

Frame rate is likewise not proven: 60 fps here is vsync on a desktop GPU. 1.57M
triangles in one draw call is a lot for a low-end mobile GPU, though the draw-call
count — the thing that actually hurts mobile — is trivially small.

### 5. One warning to keep an eye on

```
EXGL: gl.pixelStorei() doesn't support this parameter yet!
```

Emitted twice while uploading the palette `DataTexture`; three sets
`UNPACK_FLIP_Y_WEBGL` / `UNPACK_PREMULTIPLY_ALPHA_WEBGL` and expo-gl ignores both.
Harmless for the palette (nearest-filtered, orientation-agnostic), but the flag
renderer and the canvas-based country labels *do* care about flip-Y. Expect to
flip those in the shader or in the source canvas on native.

## Consequences for the plan

- **Phase C's native globe proceeds as designed.** Ship the full mesh; do not
  build a decimation pipeline on spec.
- **three r185 works on both platforms**, which unblocks converging the web app
  onto it (the A8 follow-up). The spike also confirms the compatibility shim that
  keeps rendering identical to r128: `THREE.ColorManagement.enabled = false` plus
  `renderer.outputColorSpace = THREE.LinearSRGBColorSpace`.
- **Remaining gate:** run the rig from a release build on a physical low-end
  Android device and record PSS and sustained fps here. Until then, treat the
  memory column as unmeasured, not as measured-and-fine.
- **Or make the gate irrelevant.** Stage 1 of
  [`asset-size-reduction-plan.md`](./asset-size-reduction-plan.md) — replacing
  `build-textures.js`'s uniform subdivision with graticule pre-clipping — cuts the
  mesh 83% in vertices and 90% in triangles, losslessly and at build time only. It
  takes the predicted native footprint from ~63 MB to ~8 MB and shrinks the
  unexplained component by about the same factor. Doing it first is cheaper than
  measuring, and it also settles the frame-rate question (157k triangles instead of
  1.57M). The same change removes the migration plan's separate "lite mesh for
  mobile web" workstream, since it beats decimation without losing detail.
- Every number above is against the **current** 30 MB mesh. Re-run the rig after
  Stage 1 rather than scaling these figures by hand.
