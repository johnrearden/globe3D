# Globe3D - Interactive 3D Globe Project

## Project Overview

Globe3D is an interactive 3D web application that displays a rotating globe with all countries baked into a single textured sphere. The project features country selection, quizzes, and an advanced label editor for manually positioning country name labels.

## Technology Stack

- **Three.js** (r128, pinned in `package.json`) - 3D rendering library. Imported by bare specifier
  (`import * as THREE from 'three'`), resolved by the `<script type="importmap">` in `index.html` to
  a pinned CDN ESM build — not a `window.THREE` global. `tests/cdn-pinning.test.js` fails if the
  importmap URL and the `package.json` pin drift apart.
- **OrbitControls** - Camera control
- **Custom ShaderMaterial** - Vector country fills driven by per-vertex country ID + palette texture
- **Vanilla JavaScript** - No frameworks
- **HTML5/CSS3** - UI and styling

## Forbidden Actions

- You are forbidden from running any ssh or scp commands, and from accessing remote servers in any way

## Project Structure

```
globe3d/
├── index.html               # Main application (all-in-one file)
├── build-textures.js        # Node.js script to bake GeoJSON → globe assets
├── assets/
│   ├── world-mesh.bin       # Merged country mesh (vertices + per-vertex country ID + indices, ~30 MB)
│   ├── world-id.bin         # Equirectangular country-ID texture for picking (4096×2048, raw RG bytes)
│   ├── world-border-lines.bin # Country-outline edges as u32 vertex-index pairs into world-mesh.bin (~2.7 MB raw / ~840 KB gzipped)
│   ├── country-palette.bin  # 256×1 RGBA palette indexed by country ID (1 KB)
│   └── country-meta.json    # Country IDs, centroids, bboxes, land areas (km²), name↔id maps
├── packages/                # npm workspaces — platform-neutral code shared with the
│   │                        #   coming Astro/React web app and Expo native app.
│   │                        #   No DOM, no Three.js, no React; runs in Node, the
│   │                        #   browser (via index.html's import map) and Metro.
│   ├── quiz-core/           # Question generation, session reducer, grading. Zero deps
│   ├── storage/             # StorageAdapter + the settings and quiz-history stores
│   └── api-client/          # Quiz backend client (host + storage + fetch injected)
├── spikes/expo-gl-mesh/     # Throwaway React Native rig proving expo-gl renders the
│                            #   real mesh; outside the workspace globs on purpose
├── package.json             # Build dependencies
├── country-colors.json      # (Optional) Per-country color overrides
└── label-config.json        # (Optional) Custom label positions/sizes
```

**Workspace packages are imported by bare specifier** (`@terragotcha/quiz-core`,
`@terragotcha/storage`, `@terragotcha/api-client`), resolved in the browser by the
`<script type="importmap">` in `index.html` and in Node/vitest by the npm-workspace symlink — so the
same import statement works buildless today and under Vite/Metro later. **Adding a package means
adding an importmap entry**, or the browser gets a bare-specifier resolution error while `npm test`
stays green.

Anything platform-specific stays in `js/`, reduced to a thin binding: `js/data/storage.js` picks
localStorage/sessionStorage, and `js/data/settings-store.js`, `js/data/quiz-history-store.js` and
`js/data/api-client.js` are now ~15-line files that construct the shared implementation and
re-export it, so no call site had to change. Follow that pattern rather than importing a package
directly from a feature module.

## Key Features

### 1. Interactive 3D Globe
- **Zoom range:** 1.13 (closest) to 10.00 (farthest)
- **Controls:** Drag to rotate, scroll/pinch to zoom
- **Surface:** Two meshes sharing one ShaderMaterial: an ocean SphereGeometry at radius 1.0 (uniform aCountryId=0 → ocean color) plus a merged country mesh at radius 1.0008 (each vertex tagged with its country ID, fragment shader looks up the color in a 256-pixel palette texture). Vector polygon edges — mathematically crisp at any zoom, no rasterization staircase.
- **Country borders:** An optional line that **shares the fill mesh's exact vertices** — `world-border-lines.bin` lists the mesh's boundary edges (edges used by one triangle = every country's outline + coastlines), drawn as a `THREE.LineSegments` child of the country mesh from the same `position` attribute. Because the line is co-radial with the fills, there's no parallax. It renders with **depthTest off** (so the fill's slope-scaled polygon offset can't win the depth race and occlude the line near the limb — the old cause of borders fading toward the globe's edge) plus a per-vertex **horizon cull** in the border shader — `discard` where the vertex faces away from the camera — to hide the far hemisphere that `depthTest` used to hide. A small clip-space depth bias is retained as a belt-and-braces nudge. Constant 1px (WebGL line-width cap) so it's the same width at every zoom. Toggle/opacity/color via `globeManager.setBorderVisible/setBorderOpacity/setBorderColor` and the settings gear.
- **Country identification:** Per-vertex `aCountryId` attribute; the same ID is also rasterized into a CPU-side ID buffer (`world-id.bin`) for fast picking.
- **Picking:** Ray-sphere intersection + lookup into the CPU-side ID buffer (O(1) per pick)
- **Subgroup display:** `globeManager.showOnly([names])`, `showAll()`, `hideCountry(name)`, `fadeOthers([names], dimAlpha)` — each is a few-byte mutation of the palette texture.

### 2. Country Labels
- **Auto-generated:** Canvas-based text textures
- **3 size tiers:** Large, medium, small countries
- **Smart visibility:** Based on zoom level and camera direction
- **Position:** Placed at country centroids at radius 1.02
- **Configurable:** Manual positioning via label editor

### 3. Interactive Label Editor
- **Edit mode:** Toggle with 'E' key or "Edit Labels" button
- **Selection:** Click labels to select (green wireframe indicator)
- **Positioning:**
  - Drag labels or selection rectangle to reposition
  - Fine-tune modal with X/Y/Z offset sliders
- **Sizing:**
  - Double-tap to increase (mobile)
  - Long-press to decrease (mobile)
  - Mouse wheel to adjust (desktop)
  - Scale slider in fine-tune modal
- **Reset:** Restore labels to default positions
- **Persistence:** Save/load configuration via JSON

### 4. Quiz System
- **Name the Flag:** Identify highlighted countries
- **Find the Country:** Click correct country within time limit
- **Scoring:** Track correct/incorrect answers
- **Adaptive zoom:** Auto-zooms to clicked countries

### 5. Zoom Level Widget
- **Visual indicator:** Vertical progress bar (right side)
- **Numeric display:** Shows exact camera distance
- **Real-time:** Updates every frame
- **Range:** 1.13 - 10.00 units

## Important Code Sections

### Zoom Thresholds (for label visibility)
```javascript
const ZOOM_FAR = 6.0;      // Show only large country labels
const ZOOM_MEDIUM = 3.5;   // Show large + medium labels
const ZOOM_CLOSE = 2.2;    // Show all labels
```

### Camera Setup
```javascript
controls.minDistance = 1.13;  // Closest zoom
controls.maxDistance = 10;     // Farthest zoom
controls.enablePan = false;    // No panning
```

### Label Configuration Format
```json
{
  "United States": {
    "position": { "x": 0.85, "y": 0.45, "z": 0.25 },
    "fontSize": 32,
    "scale": 1.2
  }
}
```

### Globe Sphere Radius
- **Ocean sphere:** Radius 1.0 (background)
- **Country mesh:** Radius 1.0008 (vector polygons, scaled at runtime)
- **Lat/long line set:** Radius 1.001
- **Labels:** Positioned at radius 1.02

## Build Process

The globe assets are pre-built using `build-textures.js`:

1. **Input:** GeoJSON files from `world-geojson` npm package
2. **Process:**
   - Simplify polygons (`simplify-js`, tolerance 0.006)
   - Antimeridian unfolding (edges with |Δlng| > 180 are continued past ±180 to keep rings continuous)
   - Compute centroid + bbox from each country's largest ring
   - Attach each country's land area (km², from the `world-countries` package via `area-data.js`) to its meta row — used at runtime to size-filter quiz targets (e.g. the "Find the country" quiz skips anything smaller than Guadeloupe). `node -e "require('./area-data').backfillMeta()"` re-derives it into the committed `country-meta.json` without a full mesh rebuild
   - Triangulate each unfolded ring with `earcut`; project each vertex to the unit sphere; accumulate into one merged vertex/index/country-id arrays for `world-mesh.bin`
   - Edge-function scanline rasterizer also fills the 4096×2048 ID buffer (used at runtime only for picking)
   - Connected-components cleanup drops tiny isolated fragments from the ID buffer (preserves each country's largest)
   - 1-pixel ID dilation eliminates seam ambiguity at country borders
   - Country-outline edges (`extractBorderEdges`) are extracted from the merged mesh: edges used by exactly one triangle are each country's boundary (outline + coastlines), since countries don't share vertices. Written as u32 vertex-index pairs into `world-border-lines.bin` for the runtime border line
   - Per-country chosen RGB (from `country-colors.json` or random palette) is written into a 256×1 RGBA palette
3. **Output:**
   - `assets/world-mesh.bin` (~30 MB raw, ~16 MB gzipped — vertex positions, per-vertex IDs, uint32 indices)
   - `assets/world-id.bin` (~16 MB raw, ~90 KB gzipped — picking only)
   - `assets/world-border-lines.bin` (~2.7 MB raw, ~840 KB gzipped — boundary-edge index pairs for the border line)
   - `assets/country-palette.bin` (1 KB)
   - `assets/country-meta.json` (~75 KB)

Run build: `node build-textures.js` (or `npm run build:globe`)
Set `FRAGDEBUG=1` to log per-country fragment counts without erasing.

## State Management

### Quiz state — `quizStore` (`@terragotcha/quiz-core`)

The single observable answer to "is a quiz on screen, and which one". A module
singleton, not an injected instance, because React Context cannot cross Astro
islands — separate React roots can only share a module-level store.

- `isActive()` / `getState()` → `{active, mode, scope, session}`. `session` is the
  live reducer state, mirrored on every dispatch; null for the Daily Challenge and
  audit mode, which are active quizzes without being reducer sessions
  (`startForeign(FOREIGN_MODES.DAILY|AUDIT)`).
- `onActiveChange(cb)` fires **only on the start/end flip**. Use it rather than
  `subscribe` for anything per-quiz: the store changes ~30 times during one quiz,
  so a raw subscription would fire an analytics event per answered question.
- A quiz mode calls `quizStore.startSession(this.session)` after `createSession`
  and `quizStore.end()` from both `end()` and `cancel()`. Nothing else writes it.

`js/data/state.js` is **not** the place for new application state — it holds live
Three.js references and editor bookkeeping, and is destined to become internal to
the globe engine. The `quiz.*` slice was removed in stage A5.

The `quiz-active` body class stays: it is a CSS hook (and the MutationObserver
signal `BackButtonGuard` watches), i.e. presentation, not state.

### Global Variables
- `editMode` - Whether label editing is active
- `selectedLabel` - Currently selected label mesh
- `labelConfig` - Custom positions/scales (persisted)
- `labelDefaults` - Original positions (for reset)
- `globeManager` - Owns the textured-sphere mesh, coastline overlay, ID buffer, palette texture, and country lookups (`pick`, `setSelectedCountry`, `flashCountry`, `setHighlightColor`, `setSelectionGradient`, `setCountryColor`, `resetCountryColor`, `showOnly`, `showAll`, `hideCountry`, `fadeOthers`, `getCountryByName`, `getCountryNames`, `getCentroids`)
- `countryLabels[]` - Array of label meshes

### Event Flow
1. User interaction (click/drag/wheel)
2. Raycasting to detect intersections
3. Update state (position/scale)
4. Store in `labelConfig`
5. Save to JSON on demand

## Mobile Optimizations

- **Touch gestures:** Pointer events (not mouse events)
- **Haptic feedback:** Vibration on double-tap/long-press
- **Responsive UI:** Different button positions for mobile/desktop
- **Tap detection:** Threshold-based drag vs. tap differentiation

## UI Components

### Buttons (Mobile & Desktop)
- **Edit Labels** (green) - Toggle edit mode
- **Save Config** (blue) - Download label-config.json
- **Fine Tune** (purple) - Open slider modal (when label selected)
- **Take Quiz** (orange) - Start quiz mode

### Modals
- **Label Editor Modal** - Position/scale sliders with reset button
- **Quiz Mode Selector** - Choose quiz type
- **Quiz Results** - Display final score

### Widgets
- **Zoom Widget** - Vertical progress bar + numeric value
- **Tooltip** - Country name on hover
- **Flag Container** - Country info panel

## Development Workflow

1. **Edit labels:** Use edit mode to position labels
2. **Save config:** Download `label-config.json`
3. **Deploy:** Place JSON file alongside `index.html`
4. **Auto-load:** Labels load custom positions on page load

## Performance Considerations

- **Two draw calls** for the entire globe: ocean sphere + merged country mesh (vs. ~195 in the per-country mesh era). Mobile GL pain comes from per-draw-call setup, not vertex throughput; 150k triangles is well under any modern GPU's per-frame vertex budget.
- **Vector polygon fills** — country edges are mathematical polygon edges, sharp at any zoom. No rasterization staircase, no bulk color texture.
- **O(1) picking** via CPU-side ID buffer lookup (the GPU never sees the ID texture in this build)
- **Highlighting / subgroup display via 1-byte palette mutation** — `setCountryColor`, `showOnly`, `fadeOthers` all rewrite a few bytes of the 1 KB palette texture and flip `needsUpdate`. No frame cost, no shader recompile.
- **Selection highlight is a flat fill (`uSelectedId`/`uSelectedColor`) with one opt-in embellishment** applied to the selected country only, driven by uniforms in the fill shader (no geometry): **gradient** (`setSelectionGradient`, `uSelGradient` — a radial tonal ramp, bright centre → shaded edge, `color *= mix(1.12, 0.28, gradT)` (mostly edge-darkening, so it doesn't blow out into a hotspot under the globe's lighting), using `uSelectedCentroid`/`uSelectedRadius` set on select). On by default (`selGradient` in `settings-store.js`), toggled by a settings-panel checkbox. It modulates around the per-scheme highlight colour (`setHighlightColor`); the default greys-scheme highlight + the settings swatch are a **mid-gray** (`0x9e9e9e`, not white) so the gradient has headroom to *brighten* the centre as well as darken the edges (a white highlight can only darken). The green quiz `flashCountry` overlay is a separate, unaffected path.
- **Polygon offset** on the country material prevents flicker where neighboring countries share borders.
- **Selective rendering:** Labels hidden when not facing camera
- **Deferred loading:** ID buffer, palette, mesh, and meta JSON fetched in parallel

## Key Coordinates

### Country Size Categories
- **Large:** Russia, Canada, USA, China, Brazil, etc. (50 countries)
- **Small:** Vatican, Monaco, Singapore, etc. (30 countries)
- **Medium:** Everything else (default)

### Rotation Animation
- **Idle timer:** 30 seconds of inactivity
- **Rotation speed:** 0.001 radians/frame
- **Auto-stop:** On user interaction

## Browser Compatibility

- **Chrome/Edge:** Full support
- **Firefox:** Full support
- **Safari:** Full support
- **Mobile browsers:** Touch gestures supported

## Code Organization (IMPORTANT for new work)

`index.html` is gigantic and is slated for a refactor before final deployment. **New features must
minimize what they add to `index.html`:**

- **No new CSS in `index.html`** — put all new rules in the external `styles.css`.
- **Use design tokens, not literals.** `styles.css` opens with a `:root` control panel of design
  tokens (semantic: `--accent`, `--bg-app/-panel/-elevated` (+ `--scrim`), `--text-heading/-body/-muted`,
  `--radius-btn/-panel/-pill`, `--weight-*`, `--font-display/-ui`, `--shadow-low/-mid/-high/-dock`,
  `--glow-cta/-accent`; plus primitive family
  ramps). New rules must reference `var(--…)` for colours, radii, weights, font-families, and
  shadows/glows — never hardcode a hex/rgba/px-radius/weight/family/box-shadow — so the UI theme switcher
  (`js/features/theme-switcher.js`, `<html data-theme>`) keeps working. Canvas surfaces read tokens
  via `js/utils/theme.js` (`cssToken`/`canvasFont`) and re-bake on the `globe3d:theme-changed` event.
  Beyond the built-in presets, admins author **remote themes** (backend `themes` app; superuser-gated
  CRUD via the audit token) that test users pick from the settings selector; the ~24 editable "knob"
  tokens are listed in `js/data/theme-tokens.js` (frontend mirror of `backend/themes/tokens.py` — keep
  the two in sync; `tests/theme-tokens.test.js` asserts the count and shape). One of them is
  `--accent-secondary`, the violet used only by the docked Daily Challenge pill (`#dq-today`); the
  pill's `--violet-fill/-fill-hover/-border/-border-hover/-label/-icon` are **derived** from it via
  `color-mix()` (same idiom as `--accent-soft`) and are deliberately not knobs, so one swatch
  recolours the whole pill. Prefer that pattern — derive from a knob rather than adding knobs — the
  editor is already busy. The in-app live editor is `js/features/theme-editor.js`,
  which renders rows straight from `TOKEN_GROUPS` — adding a knob needs no editor change. Roundness is two editable
  knobs — `--radius-btn` (all buttons + controls) and `--radius-panel` (containers); `--radius-pill`
  (999px) and `--radius-circle` (50%) are fixed shapes. A global `button { border-radius:
  var(--radius-btn) !important }` rule unifies button roundness — round/pill `<button>`s (close/swatch
  icons, the segmented control) re-assert their shape with a `!important` override.
  Shadows/glows are likewise a **fixed** token set (like `--radius-pill/-circle`, *not* theme-editor
  knobs): a `--shadow-low/-mid/-high` elevation scale (thumbnails / controls / modals+containers),
  `--shadow-dock` for bottom-docked sheets (same weight, cast upward), `--glow-cta` for primary accent
  CTA buttons, and `--glow-accent` for the pulsing radial halos. Each references a themed colour token,
  so the whole shadow system adapts per theme with no per-theme redefinition — every `box-shadow` and
  accent glow in the app must resolve to one of these (no ad-hoc offsets/blurs). **The two glow
  tokens are currently disabled** (`--glow-cta: none`, `--glow-accent: transparent`) — the effect is
  off app-wide but the tokens and all `var(--glow-*)` usage sites remain; restore the `was:` values in
  the `:root` block to re-enable.
- **No new inline `<script>` logic** — all new JS goes in separate ES modules under `js/`
  (e.g. `js/features/<feature>.js`), imported from the main module block.
- **Prefer self-contained feature modules** that create their own DOM and attach their own
  listeners at runtime (as `js/features/flag-renderer.js` does with its canvas), rather than adding
  static markup to `index.html`. Pull third-party libs via ESM `import` from a CDN where practical
  instead of new `<script>`/`<link>` tags.
- Net effect: a new feature should touch `index.html` by roughly an `import` + one instantiation
  call, and nothing more.
- **Icons: use inline SVG everywhere.** Do not add icon-font `<link>`s (e.g. Phosphor/Font
  Awesome webfonts) or `<i class="...">` glyphs. Define the needed SVG markup as constants in the
  feature's module and inject it at runtime. This keeps `index.html` free of new `<link>` tags and
  avoids a webfont dependency. When recreating a design that specifies an icon font (e.g. Phosphor),
  port the individual glyphs to inline SVG.

**`docs/senior_dev/implementation-plan.md` is the single source of truth** for the refactor and all
prospective code-quality/modularization/deployment improvements (it includes an `index.html`
anatomy review with per-chunk line ranges). Any change that renders it out of date — extracting a
module, shifting line ranges, completing a stage, or altering the structure it describes — must
update that document accordingly in the same change.

## Known Limitations

- `index.html` is bootstrap + glue + (shrinking) inline UI logic; core systems live in modules under `js/` (scene, globe, labels, camera, quiz, flags, search, animations). See `docs/senior_dev/implementation-plan.md` for the modularization roadmap.
- Country borders are a 1px line sharing the fill mesh's exact vertices (`world-border-lines.bin` = boundary-edge index pairs), co-radial with the fills (no radial lift → no parallax). Rendered with `depthTest` off + a shader horizon cull (discard back-facing vertices) so the line stays crisp all the way to the limb without being occluded by the fill's slope-scaled polygon offset; a small clip-space depth bias is kept as a nudge. Toggle/opacity/color via `globeManager.setBorder*` and the settings gear. WebGL caps line width at 1px, so thickness isn't adjustable without a fat-line implementation.
- No search index (linear search through country names)
- Country name labels are canvas-rendered white textures tinted at runtime via `material.color`; the font follows the `--font-base` token (re-baked on theme change), but per-label colour/font styling beyond the tint isn't exposed.
- Per-country mesh manipulation (e.g., scale or move a single country) is no longer supported — the globe is one mesh.

## Future Enhancement Ideas

- Multi-language label support
- Custom label fonts/colors
- Animated country transitions
- Data visualization overlays
- More quiz modes
- Label clustering for small countries

## Git Branch Strategy

- **main** - Stable releases
- **ui** - Current development branch (label editor, quizzes)
- **Don't create new git branches** - commit to the current branch.

## Credits

- Country geometry from `world-geojson` npm package
- Flag icons from `flag-icons` library
- 3D rendering by Three.js
- Label editor and textured-globe migration developed with Claude Code assistance
