# Globe3D - Interactive 3D Globe Project

## Project Overview

Globe3D is an interactive 3D web application that displays a rotating globe with all countries as separate, clickable meshes. The project features country selection, quizzes, and an advanced label editor for manually positioning country name labels.

## Technology Stack

- **Three.js** (r128) - 3D rendering library
- **OrbitControls** - Camera control
- **GLTFLoader** - 3D model loading
- **DRACOLoader** - Mesh compression/decompression
- **Vanilla JavaScript** - No frameworks
- **HTML5/CSS3** - UI and styling

## Project Structure

```
globe3d/
├── index.html              # Main application (all-in-one file)
├── build-globe.js          # Node.js script to generate globe GLB from GeoJSON
├── assets/
│   └── world.glb          # Pre-built 3D globe model (5.1 MB, Draco compressed)
├── package.json           # Build dependencies
└── label-config.json      # (Optional) Custom label positions/sizes
```

## Key Features

### 1. Interactive 3D Globe
- **Zoom range:** 1.13 (closest) to 10.00 (farthest)
- **Controls:** Drag to rotate, scroll/pinch to zoom
- **Country meshes:** ~195 separate, clickable 3D objects
- **Vertex colors:** Random darker colors per country
- **Raycasting:** Click detection for countries and labels

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
- **Country meshes:** Radius ~1.0 (with 0.02 extrusion)
- **Labels:** Positioned at radius 1.02
- **Inner sphere:** Adjustable radius (default 1.014)

## Build Process

The globe is pre-built using `build-globe.js`:

1. **Input:** GeoJSON files from `world-geojson` npm package
2. **Process:**
   - Convert lat/lng to 3D sphere coordinates
   - Triangulate polygons with earcut
   - Subdivide large countries to prevent dipping
   - Apply random vertex colors
   - Extrude by 0.02 units
3. **Output:** Draco-compressed GLB file (~5.1 MB)

Run build: `node build-globe.js`

## State Management

### Global Variables
- `editMode` - Whether label editing is active
- `selectedLabel` - Currently selected label mesh
- `labelConfig` - Custom positions/scales (persisted)
- `labelDefaults` - Original positions (for reset)
- `countries[]` - Array of country meshes
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

- **Draco compression:** Reduces GLB size by ~80%
- **Selective rendering:** Labels hidden when not facing camera
- **Deferred loading:** GLB loaded asynchronously
- **Border rendering:** Disabled by default (performance)

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

- All code in single HTML file (intentional design choice)
- Country borders disabled for performance
- No search index (linear search through countries)
- Label font is fixed (Arial, black text)

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

- Globe geometry from `world-geojson` npm package
- Flag icons from `flag-icons` library
- 3D rendering by Three.js
- Label editor developed with Claude Code assistance
