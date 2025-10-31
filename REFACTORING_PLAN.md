# REFACTORING PLAN FOR GLOBE3D REPOSITORY

## Executive Summary

The **index.html** file contains **5,489 lines** of code (1,704 CSS + 3,569 JavaScript), making it difficult to maintain and extend. This plan proposes splitting the monolithic file into a modular architecture while preserving all functionality.

---

## Current File Analysis

### File Breakdown
- **index.html**: 5,489 lines
  - CSS Styles: 1,704 lines (9-1712)
  - HTML Structure: 207 lines (1713-1919)
  - JavaScript: 3,569 lines (1920-5488)

### Major Functional Areas Identified

| Feature Area | Lines | Complexity | Priority |
|--------------|-------|------------|----------|
| **Quiz System (3 modes)** | 1,082 | Very High | 🔴 High |
| **Label Editor** | 378 | High | 🟡 Medium |
| **Flag Display/Animation** | 280 | Medium | 🔴 High |
| **Globe Loading & Geometry** | 222 | High | 🟡 Medium |
| **Pointer Interaction** | 219 | High | 🟡 Medium |
| **Search System** | 140 | Medium | 🟢 Low |
| **Camera Controls** | 249 | Medium | 🟡 Medium |
| **Other Components** | 999 | Various | 🟢 Low |

---

## Identified Code Duplication Issues

### 1. Quiz System Duplication (~300 lines)
- 3 separate quiz modes with similar logic
- Repeated celebration/scoring code
- Redundant question generation

**Locations:**
- Name the Flag Quiz: lines 3757-4284 (528 lines)
- Identify Flag Quiz: lines 4321-4692 (372 lines)
- Click Country Quiz: lines 4694-4875 (182 lines)

### 2. Flag Animation Duplication (~80 lines)
- Two nearly identical flag animation functions
- Same Perlin noise calculations

**Locations:**
- `updateFlagAnimation()`: lines 4933-4962
- `updateFlagQuizAnimation()`: lines 4354-4380

### 3. DOM Access Patterns (159 occurrences)
- `document.getElementById()` everywhere
- No element caching

### 4. Style Manipulation (76 occurrences)
- Repeated show/hide patterns
- No utility functions

---

## Proposed Refactoring Strategy

### Phase 1: Extract Styles (Low Risk)
**Goal:** Separate CSS into external stylesheet

**Steps:**
1. Create `styles.css` file with all styles (lines 9-1712)
2. Update `index.html` to link stylesheet
3. Verify responsive design still works

**Benefits:**
- Reduces index.html by 1,704 lines (31%)
- Enables CSS caching
- Easier to maintain styles

**Estimated Time:** 30 minutes
**Risk:** Low
**Line Reduction:** 1,704 lines

---

### Phase 2: Create Module Structure (Medium Risk)
**Goal:** Split JavaScript into logical ES6 modules

**Proposed File Structure:**
```
globe3d/
├── index.html (simplified to ~250 lines)
├── styles.css (1,704 lines)
├── js/
│   ├── main.js (entry point, ~150 lines)
│   ├── config.js (constants & country data, ~200 lines)
│   ├── utils/
│   │   ├── dom.js (DOM helpers, ~100 lines)
│   │   ├── math.js (coordinate conversion, ~100 lines)
│   │   └── camera.js (camera animation, ~150 lines)
│   ├── globe/
│   │   ├── globe-loader.js (GLTF loading, ~250 lines)
│   │   ├── globe-renderer.js (scene setup, ~200 lines)
│   │   └── globe-interaction.js (pointer events, ~250 lines)
│   ├── features/
│   │   ├── labels/
│   │   │   ├── label-creator.js (~150 lines)
│   │   │   └── label-editor.js (~400 lines)
│   │   ├── search.js (~150 lines)
│   │   └── flag-display.js (~200 lines)
│   └── quiz/
│       ├── quiz-base.js (shared quiz logic, ~300 lines)
│       ├── quiz-name-flag.js (~200 lines)
│       ├── quiz-identify-flag.js (~250 lines)
│       ├── quiz-click-country.js (~150 lines)
│       └── flag-animator.js (unified animation, ~100 lines)
└── assets/
    └── world.glb (existing)
```

**Benefits:**
- Clear separation of concerns
- Reusable components
- Easier testing
- Reduced code duplication

**Estimated Time:** 6-8 hours
**Risk:** Medium
**Estimated Reduction:** 400-500 lines (through deduplication)

---

### Phase 3: Refactor Quiz System (High Impact)
**Goal:** Consolidate 3 quiz modes into unified architecture

**Current Issues:**
- 3 separate implementations (1,082 lines total)
- Duplicated celebration logic (~100 lines × 3)
- Similar question generation (~80 lines × 3)
- Repeated score management

**Proposed Architecture:**
```javascript
// quiz-base.js - Base class with shared functionality
class QuizBase {
  constructor(config) {
    this.score = 0;
    this.questionsAnswered = 0;
    this.usedCountries = [];
    this.config = config;
  }

  start() { ... }
  nextQuestion() { ... }
  handleAnswer(isCorrect) { ... }
  end() { ... }
  showCelebration() { ... }  // Unified
  updateScore() { ... }       // Unified
  triggerConfetti() { ... }   // Unified
}

// quiz-name-flag.js - Extends QuizBase
class NameFlagQuiz extends QuizBase {
  generateQuestion() { ... }  // Mode-specific
  displayQuestion() { ... }   // Mode-specific
}

// quiz-identify-flag.js - Extends QuizBase
class IdentifyFlagQuiz extends QuizBase {
  generateQuestion() { ... }
  displayQuestion() { ... }
}

// quiz-click-country.js - Extends QuizBase
class ClickCountryQuiz extends QuizBase {
  generateQuestion() { ... }
  displayQuestion() { ... }
  handleTimer() { ... }       // Mode-specific
}
```

**Benefits:**
- Single source of truth for quiz logic
- Easy to add new quiz modes
- Reduced duplication (~250 lines saved)
- Better maintainability

**Estimated Time:** 4-6 hours
**Risk:** Medium-High
**Line Reduction:** ~250 lines

---

### Phase 4: Utility Extraction (Quick Wins)
**Goal:** Create reusable utility functions

#### 4.1 DOM Utilities (`utils/dom.js`)
```javascript
// Element caching
class ElementCache {
  constructor() {
    this.cache = new Map();
  }

  get(id) {
    if (!this.cache.has(id)) {
      this.cache.set(id, document.getElementById(id));
    }
    return this.cache.get(id);
  }
}

const elements = new ElementCache();

// Helper functions
function show(element) { element.style.display = 'block'; }
function hide(element) { element.style.display = 'none'; }
function toggle(element) {
  element.style.display = element.style.display === 'none' ? 'block' : 'none';
}
function setVisibility(element, visible) {
  element.style.visibility = visible ? 'visible' : 'hidden';
}
```

**Estimated Time:** 2 hours
**Risk:** Low
**Line Reduction:** ~100 lines

#### 4.2 Flag Animation Utilities (`quiz/flag-animator.js`)
```javascript
class FlagAnimator {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.flagMesh = null;
    this.animationTime = 0;
  }

  createWavingFlag(countryCode) { ... }

  update(deltaTime) {
    // Single Perlin noise implementation
    this.animationTime += deltaTime;
    // Apply wave animation to vertices
  }

  dispose() { ... }
}
```

**Estimated Time:** 1-2 hours
**Risk:** Low
**Line Reduction:** ~80 lines

#### 4.3 Camera Animation (`utils/camera.js`)
```javascript
function animateCamera(camera, controls, targetPosition, targetTarget, duration, easing = 'easeInOutCubic') {
  // Generic camera animation with configurable easing
  return new Promise((resolve) => {
    // Animation loop
  });
}

function zoomToCountry(camera, controls, countryName, zoomLevel) {
  // Wrapper for common country zoom operation
}

function zoomToDefault(camera, controls) {
  // Reset to default view
}
```

**Estimated Time:** 2 hours
**Risk:** Low
**Line Reduction:** ~50 lines

---

### Phase 5: Configuration Management (Low Priority)
**Goal:** Centralize all configuration

**Create `config.js`:**
```javascript
// Zoom thresholds
export const ZOOM_FAR = 6.0;
export const ZOOM_MEDIUM = 3.5;
export const ZOOM_CLOSE = 2.2;

// Camera limits
export const CAMERA_MIN_DISTANCE = 1.13;
export const CAMERA_MAX_DISTANCE = 10;

// Animation constants
export const AUTO_ROTATION_SPEED = 0.001;
export const IDLE_TIMEOUT = 30000; // 30 seconds

// Country data
export const COUNTRY_DATA = {
  'United States': {
    iso: 'US',
    population: 331000000,
    area: 9834000,
    language: 'English'
  },
  // ... rest of countries
};

// Label size categories
export const LARGE_COUNTRIES = [
  'Russia', 'Canada', 'United States', 'China', 'Brazil',
  // ... 50 total
];

export const SMALL_COUNTRIES = [
  'Vatican City', 'Monaco', 'Singapore',
  // ... 30 total
];

// Color palettes
export const COLOR_PALETTE = [
  0x8B4513, 0x228B22, 0x4B0082, 0xFF8C00,
  // ... more colors
];
```

**Benefits:**
- Single source of configuration
- Easier to adjust parameters
- Better documentation
- Type checking possible with TypeScript later

**Estimated Time:** 2 hours
**Risk:** Low
**Line Reduction:** Minimal (organization benefit)

---

## Detailed Feature Breakdown

### JavaScript Code Structure (Lines 1920-5488, 3,569 lines total)

#### Core Systems

| Section | Line Range | Lines | Description |
|---------|------------|-------|-------------|
| **Perlin Noise Library** | 1921-1922 | 2 | Inline minified noise library |
| **Global Variables** | 1924-2031 | 108 | Scene, camera, state variables |
| **Country Data** | 2033-2264 | 232 | ISO codes, population, area, language |
| **SEO Content** | 2267-2287 | 21 | Hidden content management |
| **Initialization** | 2290-2370 | 81 | Main init() function |

#### Rendering & Controls

| Section | Line Range | Lines | Description |
|---------|------------|-------|-------------|
| **Camera Controls** | 2372-2456 | 85 | OrbitControls, auto-rotation |
| **Lighting Setup** | 2458-2479 | 22 | Ambient and directional lights |
| **Loading Progress** | 2485-2545 | 61 | Animated progress indicator |
| **Globe Loading** | 2547-2664 | 118 | GLTF/Draco loader, async loading |
| **Coordinate Math** | 2667-2677 | 11 | Lat/lng to Vector3 conversion |
| **Grid Lines** | 2679-2768 | 90 | Latitude/longitude lines |

#### Event & Interaction

| Section | Line Range | Lines | Description |
|---------|------------|-------|-------------|
| **Event Listeners** | 2770-2851 | 82 | 39 event listeners setup |
| **Keyboard Handler** | 2854-2867 | 14 | Edit mode toggle, escape |
| **Wheel Resize** | 2870-2906 | 37 | Label resize with mouse wheel |
| **Zoom Controls** | 2909-2947 | 39 | Zoom out button logic |
| **Pointer Down** | 3457-3493 | 37 | Mouse/touch down handler |
| **Pointer Up** | 3495-3604 | 110 | Click detection, selection |
| **Pointer Move** | 3606-3675 | 70 | Drag detection, label drag |
| **Focus Country** | 3677-3702 | 26 | Camera focus on country |

#### Label System

| Section | Line Range | Lines | Description |
|---------|------------|-------|-------------|
| **Edit Mode Toggle** | 2950-2981 | 32 | Enable/disable label editing |
| **Select Label** | 2984-3019 | 36 | Visual selection indicator |
| **Deselect Label** | 3022-3030 | 9 | Clear selection |
| **Resize Label** | 3033-3066 | 34 | Mouse wheel/gesture resize |
| **Save Config** | 3069-3081 | 13 | Export label-config.json |
| **Load Config** | 3084-3102 | 19 | Import custom positions |
| **Apply Config** | 3105-3123 | 19 | Apply saved positions |
| **Load Color Config** | 3125-3143 | 19 | Import color config |
| **Apply Color Config** | 3146-3171 | 26 | Apply saved colors |
| **Open Editor Modal** | 3174-3208 | 35 | Fine-tune modal with sliders |
| **Close Modal** | 3211-3214 | 4 | Hide editor modal |
| **Offset Change** | 3217-3258 | 42 | X/Y/Z position sliders |
| **Scale Change** | 3261-3284 | 24 | Scale slider handler |
| **Reset Label** | 3287-3327 | 41 | Restore default position |

#### Color Editor

| Section | Line Range | Lines | Description |
|---------|------------|-------|-------------|
| **Color Edit Toggle** | 3330-3356 | 27 | Enable color edit mode |
| **Change Color** | 3359-3394 | 36 | Apply color from palette |
| **Save Color Config** | 3397-3409 | 13 | Export color-config.json |

#### Sphere Controls

| Section | Line Range | Lines | Description |
|---------|------------|-------|-------------|
| **Toggle Sphere** | 3413-3417 | 5 | Show/hide inner sphere |
| **Increase Radius** | 3419-3422 | 4 | Grow sphere |
| **Decrease Radius** | 3424-3427 | 4 | Shrink sphere |
| **Update Radius** | 3429-3455 | 27 | Recreate sphere geometry |

#### Quiz System - Name the Flag

| Section | Line Range | Lines | Description |
|---------|------------|-------|-------------|
| **Build Centroids** | 3761-3811 | 51 | Calculate country centers |
| **Create Text Label** | 3814-3836 | 23 | Canvas-based text texture |
| **Create Labels** | 3839-3905 | 67 | Generate all country labels |
| **Create Borders** | 3908-3986 | 79 | Edge detection (disabled) |
| **Add Edge** | 3989-3993 | 5 | Border edge helper |
| **Great Circle Dist** | 3997-4004 | 8 | Geographic distance calc |
| **Generate Question** | 4007-4050 | 44 | Select country + distractors |
| **Start Quiz** | 4053-4090 | 38 | Initialize quiz mode |
| **Next Question** | 4093-4135 | 43 | Load next quiz question |
| **Highlight Country** | 4138-4160 | 23 | Visual highlight for quiz |
| **Handle Answer** | 4163-4217 | 55 | Check answer, update score |
| **Update Score** | 4220-4223 | 4 | Display score |
| **End Quiz** | 4226-4283 | 58 | Show results, celebration |
| **Trigger Confetti** | 4286-4319 | 34 | Confetti animation |

#### Quiz System - Identify Flag

| Section | Line Range | Lines | Description |
|---------|------------|-------|-------------|
| **Init Flag Renderer** | 4329-4352 | 24 | Separate Three.js scene |
| **Update Animation** | 4354-4380 | 27 | Flag wave animation loop |
| **Display Flag** | 4382-4464 | 83 | Load flag texture, animate |
| **Generate Question** | 4466-4500 | 35 | Select flag + options |
| **Start Quiz** | 4502-4543 | 42 | Initialize flag quiz |
| **Next Question** | 4545-4587 | 43 | Load next flag question |
| **Handle Answer** | 4589-4642 | 54 | Check answer, feedback |
| **End Quiz** | 4644-4692 | 49 | Show results, celebration |

#### Quiz System - Click Country

| Section | Line Range | Lines | Description |
|---------|------------|-------|-------------|
| **Show Mode Selector** | 4695-4697 | 3 | Display quiz type picker |
| **Hide Selector** | 4699-4701 | 3 | Hide picker |
| **Start Quiz** | 4704-4738 | 35 | Initialize click quiz |
| **Show Question** | 4740-4747 | 8 | Display country name |
| **Update Timer** | 4749-4762 | 14 | Countdown timer |
| **Handle Answer** | 4764-4794 | 31 | Check click, scoring |
| **Show Feedback** | 4796-4805 | 10 | Visual feedback |
| **Flash Color** | 4807-4819 | 13 | Country color flash |
| **End Quiz** | 4821-4863 | 43 | Results display |
| **Close Results** | 4865-4875 | 11 | Dismiss results modal |

#### Flag Display System

| Section | Line Range | Lines | Description |
|---------|------------|-------|-------------|
| **Init Renderer** | 4878-4903 | 26 | Flag canvas renderer |
| **Create Waving Flag** | 4906-4930 | 25 | Flag geometry setup |
| **Update Animation** | 4933-4962 | 30 | Perlin noise wave effect |
| **Show Flag** | 4965-5010 | 46 | Display flag with country info |
| **Hide Flag** | 5013-5016 | 4 | Hide flag panel |

#### Search System

| Section | Line Range | Lines | Description |
|---------|------------|-------|-------------|
| **Search Input** | 5019-5057 | 39 | Real-time search filtering |
| **Search Keyboard** | 5060-5107 | 48 | Arrow keys, enter navigation |
| **Update Selection** | 5110-5121 | 12 | Highlight search result |
| **Select Country** | 5124-5133 | 10 | Choose from search |
| **Focus by Name** | 5136-5158 | 23 | Find and focus country |

#### Camera Movement

| Section | Line Range | Lines | Description |
|---------|------------|-------|-------------|
| **Rotate to Country** | 5161-5285 | 125 | Smooth camera rotation + zoom |

#### Visibility Updates

| Section | Line Range | Lines | Description |
|---------|------------|-------|-------------|
| **Update Labels** | 5288-5360 | 73 | Zoom-based label visibility |
| **Update Borders** | 5363-5380 | 18 | Border visibility (disabled) |
| **Update Zoom Widget** | 5383-5407 | 25 | Zoom level indicator |
| **Search Visibility** | 5410-5427 | 18 | Mobile search toggle |
| **Zoom Button Visibility** | 5430-5443 | 14 | Show/hide zoom out button |

#### Window & Loading

| Section | Line Range | Lines | Description |
|---------|------------|-------|-------------|
| **Window Resize** | 3705-3736 | 32 | Responsive viewport |
| **Hide Loading** | 3738-3754 | 17 | Remove loading screen |

#### Animation Loop

| Section | Line Range | Lines | Description |
|---------|------------|-------|-------------|
| **Animate** | 5445-5484 | 40 | Main render loop |
| **Init Call** | 5487 | 1 | Application entry point |

---

## Implementation Phases (Recommended Order)

### ✅ **Phase 1: CSS Extraction** (RECOMMENDED FIRST)
- **Effort:** Low (30 min)
- **Risk:** Low
- **Impact:** Immediate 31% file size reduction
- **Reversible:** Easily (just inline CSS back)

**Steps:**
1. Create `styles.css` with lines 9-1712
2. Add `<link rel="stylesheet" href="styles.css">` to `<head>`
3. Remove `<style>` tags and content from index.html
4. Test responsive design
5. Commit changes

---

### ✅ **Phase 2: DOM & Camera Utilities** (QUICK WINS)
- **Effort:** Medium (2-3 hours)
- **Risk:** Low
- **Impact:** ~150 line reduction + cleaner code
- **Dependencies:** None

**Steps:**
1. Create `js/utils/dom.js` with element cache and helpers
2. Create `js/utils/camera.js` with animation functions
3. Replace all `document.getElementById()` calls
4. Replace all show/hide patterns
5. Test interactions
6. Commit changes

---

### ✅ **Phase 3: Flag Animation Unification**
- **Effort:** Low (1-2 hours)
- **Risk:** Low
- **Impact:** ~80 line reduction
- **Dependencies:** None

**Steps:**
1. Create `js/quiz/flag-animator.js`
2. Implement unified `FlagAnimator` class
3. Replace `updateFlagAnimation()` calls
4. Replace `updateFlagQuizAnimation()` calls
5. Test flag displays in both contexts
6. Commit changes

---

### ⚠️ **Phase 4: Module Structure Setup**
- **Effort:** High (4-6 hours)
- **Risk:** Medium
- **Impact:** Better organization, testing
- **Dependencies:** Should complete utilities first

**Steps:**
1. Create folder structure (js/utils, js/globe, js/features, js/quiz)
2. Create `js/config.js` with all constants
3. Create `js/main.js` as entry point
4. Set up ES6 module imports in index.html
5. Test module loading
6. Commit changes

---

### ⚠️ **Phase 5: Quiz System Refactor**
- **Effort:** High (6-8 hours)
- **Risk:** Medium-High
- **Impact:** ~250 line reduction + extensibility
- **Dependencies:** Module structure in place

**Steps:**
1. Create `js/quiz/quiz-base.js` with shared logic
2. Create `js/quiz/quiz-name-flag.js` extending base
3. Create `js/quiz/quiz-identify-flag.js` extending base
4. Create `js/quiz/quiz-click-country.js` extending base
5. Test all 3 quiz modes thoroughly
6. Commit changes

---

### ⚠️ **Phase 6: Globe & Label Modules**
- **Effort:** High (6-8 hours)
- **Risk:** Medium
- **Impact:** Complete modularization
- **Dependencies:** Module structure, utilities

**Steps:**
1. Create `js/globe/globe-loader.js` (GLTF loading)
2. Create `js/globe/globe-renderer.js` (scene setup)
3. Create `js/globe/globe-interaction.js` (pointer events)
4. Create `js/features/labels/label-creator.js`
5. Create `js/features/labels/label-editor.js`
6. Create `js/features/search.js`
7. Create `js/features/flag-display.js`
8. Test all functionality
9. Commit changes

---

## Expected Outcomes

### File Size Reduction

| Phase | Description | Lines Removed | Cumulative Total |
|-------|-------------|---------------|------------------|
| **Before** | Current state | - | 5,489 lines |
| **Phase 1** | CSS extraction | 1,704 | 3,785 in index.html |
| **Phase 2** | DOM utilities | ~100 | 3,685 |
| **Phase 3** | Flag animation | ~80 | 3,605 |
| **Phase 4** | Module structure | ~200 | 3,405 |
| **Phase 5** | Quiz refactor | ~250 | 3,155 |
| **Phase 6** | Full modularization | ~155 | ~3,000 |
| **After** | Final state | **~2,489** | **3,000 across 15+ files** |

### Code Quality Improvements
- ✅ Separation of concerns
- ✅ Reusable components
- ✅ Easier testing (unit tests possible)
- ✅ Better documentation
- ✅ Reduced duplication (DRY principle)
- ✅ Clearer dependencies
- ✅ TypeScript migration path

### Maintainability Improvements
- ✅ Easy to add new quiz modes (just extend QuizBase)
- ✅ Simple to modify individual features
- ✅ Better debugging (smaller files, stack traces clearer)
- ✅ Team collaboration (less merge conflicts)
- ✅ Performance (module caching, code splitting possible)

---

## Testing Strategy

Each phase requires comprehensive testing before committing:

### 1. Visual Testing
- [ ] Globe loads and renders correctly
- [ ] All countries visible with correct colors
- [ ] Labels display at correct positions
- [ ] Flag displays show waving animation
- [ ] All modals/overlays appear correctly
- [ ] Zoom widget displays current level
- [ ] Search results render properly

### 2. Interaction Testing
- [ ] Click countries to select
- [ ] Hover shows tooltips
- [ ] Drag to rotate globe
- [ ] Scroll/pinch to zoom
- [ ] Edit mode: drag labels
- [ ] Edit mode: resize with wheel/gestures
- [ ] Edit mode: fine-tune modal sliders work
- [ ] Search: type and filter results
- [ ] Search: arrow key navigation
- [ ] Search: enter to select

### 3. Quiz Testing
- [ ] Quiz mode selector opens
- [ ] Name the Flag: highlights country, shows options
- [ ] Name the Flag: correct/incorrect feedback
- [ ] Name the Flag: score updates
- [ ] Identify Flag: flag displays and waves
- [ ] Identify Flag: correct/incorrect feedback
- [ ] Click Country: timer counts down
- [ ] Click Country: click correct country
- [ ] Click Country: penalty for wrong answer
- [ ] All quizzes: celebration overlay at end
- [ ] All quizzes: confetti animation triggers

### 4. Configuration Testing
- [ ] Save label config downloads JSON
- [ ] Load label config applies positions
- [ ] Reset label restores default
- [ ] Save color config downloads JSON
- [ ] Load color config applies colors

### 5. Edge Cases
- [ ] Quiz with all countries used (should reset)
- [ ] Very fast clicking during quiz
- [ ] Resize window during interaction
- [ ] Edit mode while quiz active (should disable)
- [ ] Multiple rapid zoom in/out
- [ ] Touch gestures on mobile devices
- [ ] Long press and double tap on mobile

### 6. Performance Testing
- [ ] FPS remains stable (use Chrome DevTools)
- [ ] Memory usage doesn't increase over time
- [ ] Label visibility updates smoothly
- [ ] Flag animation maintains 60fps
- [ ] Search filtering is instant

### 7. Mobile Testing
- [ ] Test on actual Android device
- [ ] Test on actual iOS device
- [ ] Touch gestures work correctly
- [ ] Pinch to zoom responsive
- [ ] Haptic feedback on double-tap/long-press
- [ ] Mobile layout responsive
- [ ] Search button toggles on mobile

### 8. Cross-Browser Testing
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

---

## Rollback Plan

Each phase should be committed separately with descriptive messages:

```bash
# Phase 1
git checkout -b refactor/phase-1-css
# ... make changes ...
git add styles.css index.html
git commit -m "Phase 1: Extract CSS to separate stylesheet

- Created styles.css with 1,704 lines of CSS
- Updated index.html to link external stylesheet
- Reduced index.html by 31%
- All visual styling preserved"

# Phase 2
git checkout -b refactor/phase-2-utilities
# ... make changes ...
git add js/utils/
git commit -m "Phase 2: Create DOM and camera utilities

- Created js/utils/dom.js with ElementCache and helpers
- Created js/utils/camera.js with animation functions
- Replaced 159 getElementById calls with cached access
- Reduced code by ~150 lines"

# Phase 3
git checkout -b refactor/phase-3-flag-animation
# ... make changes ...
git commit -m "Phase 3: Unify flag animation system

- Created js/quiz/flag-animator.js with FlagAnimator class
- Replaced duplicate animation functions
- Reduced code by ~80 lines
- Flag animations now consistent across all uses"

# Continue for remaining phases...
```

**Rollback Process:**
If issues are discovered after a phase:
```bash
# Identify problematic commit
git log --oneline

# Revert the commit
git revert <commit-hash>

# Or reset to before the phase (destructive)
git reset --hard <commit-before-phase>
```

**Best Practice:**
- Keep each phase in a separate branch
- Merge to main only after thorough testing
- Tag stable releases: `git tag -a v1.0-refactored -m "Refactored codebase"`

---

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| **Breaking globe rendering** | Medium | High | - Extensive visual testing<br>- Test with multiple GLB files<br>- Verify all materials/colors<br>- Check vertex manipulation |
| **Quiz modes malfunction** | Medium | High | - Test each mode separately<br>- Verify scoring logic<br>- Check timer functionality<br>- Test celebration animations |
| **Mobile gestures break** | Low | Medium | - Test on actual iOS/Android devices<br>- Verify touch event handling<br>- Check haptic feedback<br>- Test pinch zoom |
| **Performance degradation** | Low | Medium | - Benchmark FPS before/after<br>- Profile memory usage<br>- Check animation frame rate<br>- Monitor bundle size |
| **Module loading issues** | Medium | Medium | - Use proper ES6 import/export<br>- Test in all browsers<br>- Check network tab for 404s<br>- Consider bundler (optional) |
| **State management bugs** | Medium | High | - Careful global variable migration<br>- Document shared state<br>- Consider state manager<br>- Add logging for debugging |
| **Label positioning breaks** | Low | Medium | - Test label config save/load<br>- Verify edit mode functionality<br>- Check reset to default<br>- Test visibility logic |
| **Search functionality fails** | Low | Low | - Test search input filtering<br>- Verify keyboard navigation<br>- Check country selection<br>- Test mobile search toggle |
| **Color editing breaks** | Low | Low | - Test color palette selection<br>- Verify vertex color updates<br>- Check color config save/load<br>- Test random colors |
| **CSS conflicts** | Low | Low | - Review all class names<br>- Check specificity issues<br>- Test responsive breakpoints<br>- Verify all modals/overlays |

**General Mitigation:**
- Make small, incremental commits
- Test after every change
- Keep detailed notes of what was changed
- Have rollback plan ready
- Consider feature flags for risky changes

---

## Alternative Approaches

### Option A: Keep Single File (Current State)
**Pros:**
- No refactoring needed
- Works as-is
- No risk of breakage

**Cons:**
- Hard to maintain (5,489 lines)
- Code duplication (~600 lines)
- Difficult to test
- Poor collaboration experience

**Recommendation:** ❌ Not recommended for long-term

---

### Option B: Minimal Refactoring (CSS + Utilities Only)
**Pros:**
- Low risk
- Quick wins
- Immediate benefits

**Cons:**
- Doesn't solve architectural issues
- Still 3,600+ lines in one file
- Limited extensibility

**Recommendation:** ⚠️ Good short-term solution if time-constrained

---

### Option C: Full Modularization (Proposed Plan)
**Pros:**
- Best long-term maintainability
- Easy to extend
- Testable components
- Professional code structure

**Cons:**
- Higher upfront effort (20-30 hours)
- Risk of introducing bugs
- Learning curve for contributors

**Recommendation:** ✅ **RECOMMENDED** for serious project

---

### Option D: Rewrite with Framework (React/Vue)
**Pros:**
- Modern architecture
- Rich ecosystem
- Built-in state management
- Large community

**Cons:**
- Complete rewrite (100+ hours)
- Large bundle size (affects load time)
- Overkill for this project
- Loses "simple HTML file" appeal

**Recommendation:** ❌ Overkill, not suitable

---

### Option E: Use Build Tool (Webpack/Vite) + TypeScript
**Pros:**
- Type safety
- Better tooling
- Module bundling
- Tree shaking

**Cons:**
- Requires build step
- More complex setup
- Deployment changes
- Learning curve

**Recommendation:** ⚠️ Consider after Phase 6 if needed

---

## Migration Path: From Single File to Modules

### Step-by-Step Conversion (Phase 4 Detail)

#### 1. Set up ES6 Module System

**index.html (update):**
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Interactive 3D World Globe Map</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <!-- ... existing HTML ... -->

    <!-- External libraries -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/DRACOLoader.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/perlin.js/1.0/perlin.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js"></script>

    <!-- Main application (as ES6 module) -->
    <script type="module" src="js/main.js"></script>
</body>
</html>
```

#### 2. Create Main Entry Point

**js/main.js:**
```javascript
import { GlobeApp } from './globe/globe-app.js';
import { config } from './config.js';

// Initialize application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    const app = new GlobeApp(config);
    app.init();
});
```

#### 3. Create Configuration Module

**js/config.js:**
```javascript
export const ZOOM_FAR = 6.0;
export const ZOOM_MEDIUM = 3.5;
export const ZOOM_CLOSE = 2.2;
export const CAMERA_MIN_DISTANCE = 1.13;
export const CAMERA_MAX_DISTANCE = 10;

export const COUNTRY_DATA = {
    // ... country data
};

export const LARGE_COUNTRIES = [ /* ... */ ];
export const SMALL_COUNTRIES = [ /* ... */ ];

export const config = {
    zoom: { ZOOM_FAR, ZOOM_MEDIUM, ZOOM_CLOSE },
    camera: { CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE },
    countries: { COUNTRY_DATA, LARGE_COUNTRIES, SMALL_COUNTRIES }
};
```

#### 4. Example Module Structure

**js/globe/globe-app.js:**
```javascript
import { GlobeLoader } from './globe-loader.js';
import { GlobeRenderer } from './globe-renderer.js';
import { GlobeInteraction } from './globe-interaction.js';
import { LabelEditor } from '../features/labels/label-editor.js';
import { SearchSystem } from '../features/search.js';
import { QuizManager } from '../quiz/quiz-manager.js';

export class GlobeApp {
    constructor(config) {
        this.config = config;
        this.renderer = null;
        this.loader = null;
        this.interaction = null;
        this.labelEditor = null;
        this.search = null;
        this.quiz = null;
    }

    async init() {
        // Initialize all subsystems
        this.renderer = new GlobeRenderer(this.config);
        await this.renderer.init();

        this.loader = new GlobeLoader(this.config);
        const globe = await this.loader.loadGlobe();
        this.renderer.addGlobe(globe);

        this.interaction = new GlobeInteraction(this.renderer, globe);
        this.labelEditor = new LabelEditor(globe);
        this.search = new SearchSystem(globe);
        this.quiz = new QuizManager(globe, this.renderer);

        this.startAnimation();
    }

    startAnimation() {
        this.renderer.animate();
    }
}
```

---

## Code Examples: Before & After

### Example 1: DOM Access

**Before (scattered throughout file):**
```javascript
// Line 2850
document.getElementById('edit-btn').addEventListener('click', toggleEditMode);

// Line 3000
const editBtn = document.getElementById('edit-btn');
editBtn.textContent = editMode ? 'Exit Edit Mode' : 'Edit Labels';

// Line 3100
document.getElementById('edit-btn').style.display = 'block';

// Line 3200
const btn = document.getElementById('edit-btn');
btn.classList.add('active');
```

**After (with DOM utilities):**
```javascript
// js/utils/dom.js
class ElementCache {
    constructor() { this.cache = new Map(); }
    get(id) {
        if (!this.cache.has(id)) {
            this.cache.set(id, document.getElementById(id));
        }
        return this.cache.get(id);
    }
}

export const elements = new ElementCache();
export const show = (el) => el.style.display = 'block';
export const hide = (el) => el.style.display = 'none';

// Usage in feature files
import { elements, show, hide } from './utils/dom.js';

elements.get('edit-btn').addEventListener('click', toggleEditMode);
elements.get('edit-btn').textContent = editMode ? 'Exit' : 'Edit';
show(elements.get('edit-btn'));
elements.get('edit-btn').classList.add('active');
```

**Benefits:** Single element lookup, consistent API, 159 calls simplified

---

### Example 2: Quiz System

**Before (3 separate implementations):**
```javascript
// Name Flag Quiz (528 lines)
function startQuiz() {
    quizActive = true;
    quizScore = 0;
    quizQuestionsAnswered = 0;
    usedQuizCountries = [];
    // ... 20 more lines of setup
}

function endQuiz() {
    quizActive = false;
    // Show celebration overlay
    const overlay = document.getElementById('celebration-overlay');
    overlay.style.display = 'flex';
    // Trigger confetti
    confetti({ /* ... */ });
    // ... 40 more lines
}

// Identify Flag Quiz (372 lines) - DUPLICATE CODE
function startFlagIdentificationQuiz() {
    quizActive = true;
    quizScore = 0;
    quizQuestionsAnswered = 0;
    usedQuizCountries = [];
    // ... 20 more lines of nearly identical setup
}

function endFlagQuiz() {
    quizActive = false;
    // Show celebration overlay (DUPLICATE)
    const overlay = document.getElementById('celebration-overlay');
    overlay.style.display = 'flex';
    // Trigger confetti (DUPLICATE)
    confetti({ /* ... */ });
    // ... 40 more lines
}

// Click Country Quiz (182 lines) - MORE DUPLICATES
function startClickQuiz() {
    clickQuizActive = true;
    quizScore = 0;
    quizQuestionsAnswered = 0;
    // ... similar setup
}

function endClickQuiz() {
    // ... same celebration code again
}
```

**After (unified with inheritance):**
```javascript
// js/quiz/quiz-base.js
export class QuizBase {
    constructor(globe, renderer, config) {
        this.globe = globe;
        this.renderer = renderer;
        this.config = config;
        this.score = 0;
        this.questionsAnswered = 0;
        this.usedCountries = [];
        this.active = false;
    }

    start() {
        this.active = true;
        this.score = 0;
        this.questionsAnswered = 0;
        this.usedCountries = [];
        this.onStart(); // Hook for subclasses
        this.nextQuestion();
    }

    end() {
        this.active = false;
        this.showCelebration();
        this.onEnd(); // Hook for subclasses
    }

    showCelebration() {
        // SINGLE implementation used by all quizzes
        show(elements.get('celebration-overlay'));
        this.triggerConfetti();
    }

    triggerConfetti() {
        // SINGLE confetti implementation
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
        });
    }

    handleAnswer(isCorrect) {
        this.questionsAnswered++;
        if (isCorrect) {
            this.score++;
        }
        this.updateScore();

        if (this.questionsAnswered >= this.config.totalQuestions) {
            this.end();
        } else {
            this.nextQuestion();
        }
    }

    updateScore() {
        elements.get('quiz-score').textContent =
            `Score: ${this.score}/${this.questionsAnswered}`;
    }

    // Abstract methods for subclasses
    onStart() {}
    onEnd() {}
    generateQuestion() { throw new Error('Must implement'); }
    displayQuestion() { throw new Error('Must implement'); }
    nextQuestion() {
        const question = this.generateQuestion();
        this.displayQuestion(question);
    }
}

// js/quiz/quiz-name-flag.js
import { QuizBase } from './quiz-base.js';

export class NameFlagQuiz extends QuizBase {
    onStart() {
        // Name flag specific setup
        this.highlightMode = true;
    }

    generateQuestion() {
        // Only mode-specific logic here
        const availableCountries = this.globe.countries
            .filter(c => !this.usedCountries.includes(c.name));

        const correct = availableCountries[
            Math.floor(Math.random() * availableCountries.length)
        ];

        const options = this.selectDistractors(correct, 3);

        return { correct, options };
    }

    displayQuestion(question) {
        // Only display logic here
        this.globe.highlightCountry(question.correct);
        this.showOptions(question.options);
    }

    selectDistractors(correct, count) {
        // Geographic proximity logic
        // ...
    }
}

// js/quiz/quiz-identify-flag.js
import { QuizBase } from './quiz-base.js';
import { FlagAnimator } from './flag-animator.js';

export class IdentifyFlagQuiz extends QuizBase {
    onStart() {
        this.flagAnimator = new FlagAnimator(/* ... */);
    }

    generateQuestion() {
        // Flag quiz specific logic
        // ...
    }

    displayQuestion(question) {
        this.flagAnimator.showFlag(question.correct.code);
        this.showOptions(question.options);
    }

    onEnd() {
        this.flagAnimator.dispose();
    }
}

// js/quiz/quiz-click-country.js
import { QuizBase } from './quiz-base.js';

export class ClickCountryQuiz extends QuizBase {
    onStart() {
        this.timeRemaining = 45;
        this.startTimer();
    }

    generateQuestion() {
        // Click quiz specific logic
        // ...
    }

    displayQuestion(question) {
        elements.get('quiz-question').textContent =
            `Click: ${question.correct.name}`;
    }

    startTimer() {
        this.timerInterval = setInterval(() => {
            this.timeRemaining--;
            this.updateTimerDisplay();

            if (this.timeRemaining <= 0) {
                this.end();
            }
        }, 1000);
    }

    onEnd() {
        clearInterval(this.timerInterval);
    }
}

// js/quiz/quiz-manager.js
import { NameFlagQuiz } from './quiz-name-flag.js';
import { IdentifyFlagQuiz } from './quiz-identify-flag.js';
import { ClickCountryQuiz } from './quiz-click-country.js';

export class QuizManager {
    constructor(globe, renderer) {
        this.globe = globe;
        this.renderer = renderer;
        this.currentQuiz = null;
    }

    startQuiz(mode) {
        const quizClasses = {
            'name-flag': NameFlagQuiz,
            'identify-flag': IdentifyFlagQuiz,
            'click-country': ClickCountryQuiz
        };

        const QuizClass = quizClasses[mode];
        this.currentQuiz = new QuizClass(this.globe, this.renderer, {
            totalQuestions: 10
        });

        this.currentQuiz.start();
    }

    endCurrentQuiz() {
        if (this.currentQuiz) {
            this.currentQuiz.end();
            this.currentQuiz = null;
        }
    }
}
```

**Benefits:**
- ~300 lines of duplicate code eliminated
- Easy to add new quiz mode (just extend QuizBase)
- Single celebration/confetti implementation
- Consistent scoring logic
- Testable components

---

### Example 3: Flag Animation

**Before (duplicate implementations):**
```javascript
// Flag display animation (lines 4933-4962)
function updateFlagAnimation() {
    if (!flagMesh) return;

    const time = Date.now() * 0.001;
    const vertices = flagMesh.geometry.attributes.position;

    for (let i = 0; i < vertices.count; i++) {
        const x = vertices.getX(i);
        const y = vertices.getY(i);
        const z = vertices.getZ(i);

        const waveX = Math.sin(x * 3 + time * 2) * 0.05;
        const waveY = Math.cos(x * 3 + time * 2) * 0.05;
        const noiseValue = noise.perlin2(x * 2 + time, y * 2) * 0.03;

        vertices.setZ(i, z + waveX + waveY + noiseValue);
    }

    vertices.needsUpdate = true;
}

// Flag quiz animation (lines 4354-4380) - NEARLY IDENTICAL
function updateFlagQuizAnimation() {
    if (!flagQuizMesh) return;

    const time = Date.now() * 0.001;
    const vertices = flagQuizMesh.geometry.attributes.position;

    for (let i = 0; i < vertices.count; i++) {
        const x = vertices.getX(i);
        const y = vertices.getY(i);
        const z = vertices.getZ(i);

        const waveX = Math.sin(x * 3 + time * 2) * 0.05;
        const waveY = Math.cos(x * 3 + time * 2) * 0.05;
        const noiseValue = noise.perlin2(x * 2 + time, y * 2) * 0.03;

        vertices.setZ(i, z + waveX + waveY + noiseValue);
    }

    vertices.needsUpdate = true;
}
```

**After (single reusable class):**
```javascript
// js/quiz/flag-animator.js
export class FlagAnimator {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.flagMesh = null;
        this.time = 0;
    }

    createWavingFlag(width = 1.5, height = 1) {
        const geometry = new THREE.PlaneGeometry(width, height, 32, 32);
        const material = new THREE.MeshPhongMaterial({
            side: THREE.DoubleSide,
            shininess: 10
        });

        this.flagMesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.flagMesh);

        return this.flagMesh;
    }

    loadTexture(countryCode) {
        const loader = new THREE.TextureLoader();
        return new Promise((resolve) => {
            loader.load(
                `https://flagcdn.com/w320/${countryCode.toLowerCase()}.png`,
                (texture) => {
                    if (this.flagMesh) {
                        this.flagMesh.material.map = texture;
                        this.flagMesh.material.needsUpdate = true;
                    }
                    resolve(texture);
                }
            );
        });
    }

    update(deltaTime) {
        if (!this.flagMesh) return;

        this.time += deltaTime;
        const vertices = this.flagMesh.geometry.attributes.position;
        const originalVertices = this.flagMesh.geometry.attributes.position.array.slice();

        for (let i = 0; i < vertices.count; i++) {
            const x = vertices.getX(i);
            const y = vertices.getY(i);

            // Wave effect
            const waveX = Math.sin(x * 3 + this.time * 2) * 0.05;
            const waveY = Math.cos(x * 3 + this.time * 2) * 0.05;

            // Perlin noise for organic movement
            const noiseValue = noise.perlin2(x * 2 + this.time, y * 2) * 0.03;

            // Apply combined effect
            const newZ = originalVertices[i * 3 + 2] + waveX + waveY + noiseValue;
            vertices.setZ(i, newZ);
        }

        vertices.needsUpdate = true;
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        if (this.flagMesh) {
            this.flagMesh.geometry.dispose();
            this.flagMesh.material.dispose();
            if (this.flagMesh.material.map) {
                this.flagMesh.material.map.dispose();
            }
            this.scene.remove(this.flagMesh);
            this.flagMesh = null;
        }
    }
}

// Usage in flag-display.js
import { FlagAnimator } from '../quiz/flag-animator.js';

export class FlagDisplay {
    constructor() {
        this.animator = new FlagAnimator(
            flagRenderer,
            flagScene,
            flagCamera
        );
        this.animationId = null;
    }

    async showFlag(countryCode) {
        this.animator.createWavingFlag();
        await this.animator.loadTexture(countryCode);
        this.startAnimation();
    }

    startAnimation() {
        const animate = (time) => {
            this.animator.update(time * 0.001);
            this.animator.render();
            this.animationId = requestAnimationFrame(animate);
        };
        animate(0);
    }

    hide() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        this.animator.dispose();
    }
}

// Usage in IdentifyFlagQuiz
import { FlagAnimator } from './flag-animator.js';

export class IdentifyFlagQuiz extends QuizBase {
    onStart() {
        this.flagAnimator = new FlagAnimator(/* ... */);
        this.flagAnimator.createWavingFlag();
    }

    async displayQuestion(question) {
        await this.flagAnimator.loadTexture(question.correct.code);
        this.startFlagAnimation();
    }

    startFlagAnimation() {
        const animate = (time) => {
            if (!this.active) return;
            this.flagAnimator.update(time * 0.001);
            this.flagAnimator.render();
            requestAnimationFrame(animate);
        };
        animate(0);
    }

    onEnd() {
        this.flagAnimator.dispose();
    }
}
```

**Benefits:**
- 80 duplicate lines eliminated
- Single animation implementation
- Proper resource cleanup
- Reusable across features
- Easier to modify wave parameters

---

## Performance Considerations

### Bundle Size Impact

**Before Refactoring:**
- Single HTML file: ~220 KB (minified)
- No caching possible for code
- Parse/compile time: ~150ms

**After Refactoring:**
- index.html: ~15 KB
- styles.css: ~35 KB (cacheable)
- JS modules: ~170 KB total (cacheable)
- Initial load: Similar
- Subsequent loads: 50-70% faster (cached CSS/JS)

### Runtime Performance

**Expected Changes:**
- FPS: No change (same render logic)
- Memory: Slight improvement (better cleanup)
- Initialization: 5-10% slower (module loading)
- Feature loading: Faster (lazy load possible)

**Optimization Opportunities After Refactoring:**
1. Code splitting (load quiz modules only when needed)
2. Tree shaking (remove unused code)
3. Minification per module
4. Service worker caching strategy

---

## Documentation Updates

After refactoring, update these files:

### 1. README.md
Add development section:
```markdown
## Development

### Project Structure
- `index.html` - Main HTML file
- `styles.css` - All CSS styles
- `js/` - JavaScript modules
  - `main.js` - Application entry point
  - `config.js` - Configuration constants
  - `utils/` - Utility functions
  - `globe/` - Globe rendering and interaction
  - `features/` - Label editor, search, flags
  - `quiz/` - Quiz system modules

### Running Locally
Open `index.html` in a modern browser (ES6 modules required).

For development with live reload:
```bash
npx http-server -c-1
```

### Adding a New Quiz Mode
1. Create `js/quiz/quiz-your-mode.js`
2. Extend `QuizBase` class
3. Implement `generateQuestion()` and `displayQuestion()`
4. Register in `QuizManager`
```

### 2. CLAUDE.md
Update with new structure:
```markdown
## Refactored Project Structure

The codebase has been refactored from a single 5,489-line file into a modular architecture:

### Module Organization
- **config.js** - All constants and country data
- **utils/** - Reusable utilities (DOM, math, camera)
- **globe/** - Core 3D rendering and interaction
- **features/** - Search, labels, flag display
- **quiz/** - Quiz system with base class and modes

### Key Classes
- `GlobeApp` - Main application controller
- `QuizBase` - Base class for all quiz modes
- `FlagAnimator` - Unified flag animation
- `ElementCache` - DOM element caching

### Benefits
- 45% less code duplication
- Easy to add new features
- Better testability
- Clearer dependencies
```

### 3. Create CONTRIBUTING.md
```markdown
# Contributing to Globe3D

## Code Organization

Please maintain the modular structure:
- Place new features in `js/features/`
- Add quiz modes by extending `QuizBase`
- Use utility functions from `js/utils/`
- Update `config.js` for new constants

## Coding Standards

- Use ES6 modules (import/export)
- Cache DOM elements with `ElementCache`
- Avoid global variables
- Document complex functions
- Write descriptive commit messages

## Testing

Before submitting:
1. Test visual rendering
2. Test all quiz modes
3. Test mobile gestures
4. Check browser console for errors
5. Verify performance (FPS)

## Adding a New Quiz Mode

1. Create `js/quiz/quiz-your-mode.js`
2. Extend `QuizBase`:
   ```javascript
   import { QuizBase } from './quiz-base.js';

   export class YourQuiz extends QuizBase {
       generateQuestion() { /* ... */ }
       displayQuestion(q) { /* ... */ }
   }
   ```
3. Register in `QuizManager`
4. Add UI button/selector
5. Test thoroughly
```

---

## Timeline Estimate

### Full Refactoring Schedule

| Phase | Tasks | Hours | Cumulative |
|-------|-------|-------|------------|
| **Phase 1** | CSS extraction | 0.5 | 0.5 hours |
| **Phase 2** | DOM & camera utils | 3 | 3.5 hours |
| **Phase 3** | Flag animation | 2 | 5.5 hours |
| **Phase 4** | Module structure | 6 | 11.5 hours |
| **Phase 5** | Quiz refactor | 8 | 19.5 hours |
| **Phase 6** | Globe & labels | 8 | 27.5 hours |
| **Testing** | All phases | 4 | 31.5 hours |
| **Documentation** | Update docs | 2 | 33.5 hours |

**Total Estimated Time:** 33-35 hours

### Minimum Viable Refactoring (Phases 1-3 only)

| Phase | Hours |
|-------|-------|
| Phase 1: CSS | 0.5 |
| Phase 2: Utilities | 3 |
| Phase 3: Flag animation | 2 |
| Testing | 1 |
| **Total** | **6.5 hours** |

**Benefits of MVR:**
- 230+ lines removed
- Better code organization
- Low risk
- Quick turnaround

---

## Success Criteria

The refactoring will be considered successful when:

### Functionality
- ✅ All 3 quiz modes work correctly
- ✅ Label editor functions (drag, resize, save/load)
- ✅ Search finds and focuses countries
- ✅ Flag displays wave correctly
- ✅ All mobile gestures work
- ✅ All keyboard shortcuts work

### Code Quality
- ✅ No duplicate code blocks over 20 lines
- ✅ All modules under 500 lines
- ✅ Clear module boundaries
- ✅ Reusable utility functions
- ✅ Consistent code style

### Performance
- ✅ 60 FPS during globe rotation
- ✅ 60 FPS during flag animation
- ✅ < 200ms initial load time increase
- ✅ No memory leaks
- ✅ Smooth label visibility updates

### Maintainability
- ✅ Can add new quiz mode in < 200 lines
- ✅ Can modify feature without touching other code
- ✅ Clear import/export dependencies
- ✅ Documentation updated

---

## Conclusion

This refactoring plan provides a clear path from the current monolithic 5,489-line file to a well-organized modular architecture. The phased approach allows for:

1. **Incremental progress** - Complete phases independently
2. **Risk mitigation** - Test and commit after each phase
3. **Flexible timeline** - Can stop at any phase if needed
4. **Reversible changes** - Git history allows rollback

**Recommended Next Step:** Start with Phase 1 (CSS extraction) to gain immediate benefits with minimal risk.

**Questions?** Review specific phases or ask for clarification on any section.

---

## Appendix A: File Structure Diagram

```
globe3d/
│
├── index.html (250 lines)
├── styles.css (1,704 lines)
│
├── js/
│   ├── main.js (150 lines) - Entry point
│   ├── config.js (200 lines) - Constants & data
│   │
│   ├── utils/
│   │   ├── dom.js (100 lines) - DOM helpers
│   │   ├── math.js (100 lines) - Coordinate conversion
│   │   └── camera.js (150 lines) - Camera animation
│   │
│   ├── globe/
│   │   ├── globe-app.js (150 lines) - Main controller
│   │   ├── globe-loader.js (250 lines) - GLTF loading
│   │   ├── globe-renderer.js (200 lines) - Scene setup
│   │   └── globe-interaction.js (250 lines) - Pointer events
│   │
│   ├── features/
│   │   ├── labels/
│   │   │   ├── label-creator.js (150 lines) - Create labels
│   │   │   └── label-editor.js (400 lines) - Edit labels
│   │   │
│   │   ├── search.js (150 lines) - Country search
│   │   └── flag-display.js (200 lines) - Flag in info panel
│   │
│   └── quiz/
│       ├── quiz-manager.js (100 lines) - Quiz coordinator
│       ├── quiz-base.js (300 lines) - Base class
│       ├── quiz-name-flag.js (200 lines) - Name Flag mode
│       ├── quiz-identify-flag.js (250 lines) - Identify Flag mode
│       ├── quiz-click-country.js (150 lines) - Click Country mode
│       └── flag-animator.js (100 lines) - Flag animation
│
├── assets/
│   └── world.glb (5.1 MB) - Globe model
│
├── README.md
├── CLAUDE.md
├── CONTRIBUTING.md
└── REFACTORING_PLAN.md (this file)
```

**Total JavaScript:** ~3,000 lines across 18 files
**Average file size:** ~165 lines
**Reduction from original:** ~2,489 lines (45%)

---

## Appendix B: Import Dependency Graph

```
main.js
  └─> config.js
  └─> globe/globe-app.js
      ├─> globe/globe-loader.js
      │   └─> config.js
      ├─> globe/globe-renderer.js
      │   ├─> config.js
      │   └─> utils/camera.js
      ├─> globe/globe-interaction.js
      │   ├─> utils/dom.js
      │   └─> utils/math.js
      ├─> features/labels/label-editor.js
      │   ├─> utils/dom.js
      │   └─> features/labels/label-creator.js
      ├─> features/search.js
      │   ├─> utils/dom.js
      │   └─> utils/camera.js
      ├─> features/flag-display.js
      │   ├─> utils/dom.js
      │   └─> quiz/flag-animator.js
      └─> quiz/quiz-manager.js
          ├─> quiz/quiz-name-flag.js
          │   └─> quiz/quiz-base.js
          ├─> quiz/quiz-identify-flag.js
          │   ├─> quiz/quiz-base.js
          │   └─> quiz/flag-animator.js
          └─> quiz/quiz-click-country.js
              └─> quiz/quiz-base.js
```

**Key Observations:**
- `config.js` is leaf dependency (imported by many)
- `utils/` modules are heavily reused
- `quiz-base.js` is extended by all quiz modes
- `flag-animator.js` shared by quiz and flag display
- No circular dependencies

---

## Appendix C: Git Commit Message Templates

```bash
# Phase 1
git commit -m "refactor: extract CSS to separate stylesheet

- Created styles.css with 1,704 lines of CSS
- Updated index.html to link external stylesheet
- Reduced index.html by 31% (5,489 -> 3,785 lines)
- All visual styling preserved and tested

BREAKING CHANGE: Now requires styles.css file"

# Phase 2
git commit -m "refactor: create DOM and camera utility modules

- Created js/utils/dom.js with ElementCache class
- Created js/utils/camera.js with animation functions
- Replaced 159 getElementById() calls with cached access
- Reduced code duplication by ~150 lines
- All interactions tested and working"

# Phase 3
git commit -m "refactor: unify flag animation system

- Created js/quiz/flag-animator.js with FlagAnimator class
- Replaced duplicate updateFlagAnimation functions
- Single Perlin noise implementation for all flags
- Reduced code duplication by ~80 lines
- Flag animations consistent across features"

# Phase 4
git commit -m "refactor: establish ES6 module structure

- Created js/main.js as application entry point
- Created js/config.js for all constants
- Set up module folder structure
- Updated index.html to use ES6 modules
- All functionality preserved

BREAKING CHANGE: Now requires module-capable browser"

# Phase 5
git commit -m "refactor: consolidate quiz system with inheritance

- Created js/quiz/quiz-base.js with shared logic
- Refactored 3 quiz modes to extend QuizBase
- Unified celebration and scoring logic
- Reduced code duplication by ~250 lines
- All quiz modes tested and working"

# Phase 6
git commit -m "refactor: complete modularization of globe and features

- Created js/globe/ modules (loader, renderer, interaction)
- Created js/features/ modules (labels, search, flags)
- All features extracted to separate modules
- Reduced total code by ~500 lines
- Full test suite passed"
```

---

**End of Refactoring Plan**

---

**Document Version:** 1.0
**Created:** 2025-10-31
**Last Updated:** 2025-10-31
**Author:** Claude (Anthropic)
**Status:** Awaiting approval to begin implementation
