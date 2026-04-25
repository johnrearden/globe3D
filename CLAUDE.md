# Globe3D - Interactive 3D Globe Project

## Project Overview

Globe3D is an interactive 3D web application that displays a rotating globe with all countries baked into a single textured sphere. The project features country selection, quizzes, and an advanced label editor for manually positioning country name labels.

## Technology Stack

- **Three.js** (r128) - 3D rendering library
- **OrbitControls** - Camera control
- **Custom ShaderMaterial** - Globe rendering (color + ID texture)
- **Vanilla JavaScript** - No frameworks
- **HTML5/CSS3** - UI and styling

## Project Structure

```
globe3d/
├── index.html              # Main application (all-in-one file)
├── build-textures.js       # Node.js script to bake GeoJSON → globe textures
├── assets/
│   ├── world-color.png    # Equirectangular RGB color texture (4096×2048)
│   ├── world-id.bin       # Equirectangular country-ID texture (2048×1024, raw RG bytes)
│   └── country-meta.json  # Country IDs, centroids, bboxes, name↔id maps
├── package.json           # Build dependencies
├── country-colors.json    # (Optional) Per-country color overrides
└── label-config.json      # (Optional) Custom label positions/sizes
```

## Key Features

### 1. Interactive 3D Globe
- **Zoom range:** 1.13 (closest) to 10.00 (farthest)
- **Controls:** Drag to rotate, scroll/pinch to zoom
- **Surface:** Single SphereGeometry with custom ShaderMaterial — one draw call
- **Country identification:** Per-country ID baked into a parallel texture; the fragment shader samples both color and ID textures.
- **Picking:** Ray-sphere intersection + lookup into a CPU-side ID buffer (O(1) per pick)

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
- **Globe surface:** Radius 1.0 (single textured sphere)
- **Labels:** Positioned at radius 1.02
- **Lat/long line set:** Radius 1.001

## Build Process

The globe textures are pre-built using `build-textures.js`:

1. **Input:** GeoJSON files from `world-geojson` npm package
2. **Process:**
   - Simplify polygons (`simplify-js`, tolerance 0.006)
   - Antimeridian split (edges with |Δlng| > 180 split at ±180)
   - Compute centroid + bbox from each country's largest ring
   - Triangulate split rings with `earcut`
   - Edge-function scanline rasterizer fills color (4096×2048 RGB) and ID (2048×1024 RG) buffers
   - 1-pixel ID dilation eliminates seam ambiguity at country borders
3. **Output:**
   - `assets/world-color.png` (~250 KB)
   - `assets/world-id.bin` (~4 MB raw, ~250 KB gzipped)
   - `assets/country-meta.json` (~75 KB)

Run build: `node build-textures.js` (or `npm run build:globe`)

## State Management

### Global Variables
- `editMode` - Whether label editing is active
- `selectedLabel` - Currently selected label mesh
- `labelConfig` - Custom positions/scales (persisted)
- `labelDefaults` - Original positions (for reset)
- `globeManager` - Owns the textured-sphere mesh, ID buffer, and country lookups (`pick`, `setSelectedCountry`, `flashCountry`, `setCountryColor`, `getCountryByName`, `getCountryNames`, `getCentroids`)
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

- **Single draw call** for the entire globe surface (vs. ~195 in the previous per-country mesh era)
- **O(1) picking** via CPU-side ID texture lookup (replaces linear `intersectObjects(countries)`)
- **Highlighting via uniform write** — no buffer mutation, no `material.needsUpdate` cost
- **Color overrides via 256×1 DataTexture** — `country-colors.json` updates one pixel per country
- **Mipmapped color texture** with anisotropy for low fragment-shader bandwidth at far zoom
- **Selective rendering:** Labels hidden when not facing camera
- **Deferred loading:** Textures + meta JSON fetched in parallel

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

## Known Limitations

- Most code in single HTML file (modules under `js/` for the larger systems)
- Country borders not currently drawn (could be re-added via shader neighbor sampling on the ID texture)
- No search index (linear search through country names)
- Label font is fixed (Arial, gray text)
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

## Credits

- Country geometry from `world-geojson` npm package
- Flag icons from `flag-icons` library
- 3D rendering by Three.js
- Label editor and textured-globe migration developed with Claude Code assistance
