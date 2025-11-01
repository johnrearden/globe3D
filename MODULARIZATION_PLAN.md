# Globe3D JavaScript Modularization Plan

**Goal:** Extract remaining JavaScript from index.html into logical, maintainable modules.

**Current State (Post-Phases 1-4):**
- **index.html:** 3,805 lines (including ~3,500 lines of JavaScript)
- **Functions:** 107 total
- **Global Variables:** 82
- **Inline Utilities:** DOM, Flag Animation, Quiz Celebration (already refactored)

---

## Architecture Overview

### Module Structure
```
js/
├── utils/              (✅ Already created - Phase 2)
│   ├── dom.js         (139 lines - currently unused)
│   └── camera.js      (147 lines - currently unused)
├── core/              (NEW - Core 3D engine)
│   ├── scene.js       (~300 lines)
│   ├── globe.js       (~250 lines)
│   ├── labels.js      (~200 lines)
│   └── camera-controls.js (~150 lines)
├── features/          (NEW - User-facing features)
│   ├── quiz/
│   │   ├── quiz-manager.js (~200 lines)
│   │   ├── name-flag-quiz.js (~150 lines)
│   │   ├── identify-flag-quiz.js (~150 lines)
│   │   └── click-quiz.js (~150 lines)
│   ├── flags/
│   │   ├── flag-renderer.js (~200 lines)
│   │   └── flag-animator.js (~100 lines)
│   ├── search.js      (~100 lines)
│   └── label-editor.js (~400 lines)
├── events/            (NEW - Event handling)
│   └── event-manager.js (~150 lines)
└── data/              (NEW - Data management)
    ├── country-data.js (existing data)
    └── state.js       (~100 lines - centralized state)
```

---

## Phased Implementation Plan

### **Phase 5: Core 3D Engine** ⭐ **START HERE**
**Priority:** HIGH | **Risk:** MEDIUM | **Effort:** 3-4 hours

Extract foundational 3D rendering code into `core/` modules.

#### 5.1 - Scene Management (`core/scene.js`)
**Lines:** ~300 | **Functions:** 13

**Exports:**
```javascript
class SceneManager {
  constructor(container)
  init()                    // Initialize Three.js scene
  setupLights()             // Add lighting
  animate()                 // Main render loop
  onResize()                // Handle window resize
  destroy()                 // Cleanup
}
```

**Extracted Functions:**
- `init()`
- `setupLights()`
- `animate()` (main loop)
- `onWindowResize()`
- `updateLoadingProgress()`
- Rendering utilities

**Global Variables Managed:**
- `scene`, `camera`, `renderer`
- `controls`

---

#### 5.2 - Globe Management (`core/globe.js`)
**Lines:** ~250 | **Functions:** 11

**Exports:**
```javascript
class GlobeManager {
  constructor(scene)
  loadGlobe(onProgress, onComplete)
  getCountries()
  getCountryByName(name)
  highlightCountry(country, color)
  resetCountryColors()
  rotateTo(position, duration)
  getCentroids()
}
```

**Extracted Functions:**
- Globe loading logic
- `latLngToVector3()`
- `addLatLongLines()`
- Country mesh management
- Country highlighting
- Centroid calculation

**Global Variables Managed:**
- `globe`, `countries`, `countryCentroids`

---

#### 5.3 - Label System (`core/labels.js`)
**Lines:** ~200 | **Functions:** 10

**Exports:**
```javascript
class LabelManager {
  constructor(scene, camera)
  createLabels(countries)
  updateVisibility()
  loadConfig(config)
  saveConfig()
  resetLabel(countryName)
}
```

**Extracted Functions:**
- `createTextLabel()`
- `createCountryLabels()`
- `updateLabelVisibility()`
- `loadLabelConfig()`
- `saveLabelConfig()`
- `applyLabelConfig()`

**Global Variables Managed:**
- `countryLabels`, `labelDefaults`, `labelConfig`

---

#### 5.4 - Camera Controls (`core/camera-controls.js`)
**Lines:** ~150 | **Functions:** 8

**Exports:**
```javascript
class CameraController {
  constructor(camera, controls, scene)
  setupControls()
  rotateToCountry(country, isQuiz)
  zoomToDistance(distance, duration)
  enableAutoRotation()
  disableAutoRotation()
  resetIdleTimer()
}
```

**Extracted Functions:**
- `setupControls()`
- `rotateGlobeToCountry()`
- `zoomOutToDefault()`
- Auto-rotation logic
- Idle timer management

**Global Variables Managed:**
- `autoRotationEnabled`, `idleTimer`, `lastInteractionTime`

---

### **Phase 6: Quiz System** ⭐ **RECOMMENDED NEXT**
**Priority:** HIGH | **Risk:** MEDIUM-HIGH | **Effort:** 4-5 hours

Modularize the quiz system (currently 27 functions, most complex feature).

#### 6.1 - Quiz Manager (`features/quiz/quiz-manager.js`)
**Lines:** ~200 | **Functions:** Core quiz logic

**Exports:**
```javascript
class QuizManager {
  constructor(globeManager, uiElements)

  // Common quiz methods
  start(mode)               // Start quiz (name-flag, identify-flag, click)
  end()                     // End current quiz
  nextQuestion()            // Advance to next question
  handleAnswer(isCorrect)   // Process answer
  updateScore()             // Update score display
  showCelebration(score, total, extra)  // Already have helper!

  // Mode-specific quiz instances
  modes = {
    'name-flag': NameFlagQuiz,
    'identify-flag': IdentifyFlagQuiz,
    'click-country': ClickQuiz
  }
}
```

**Extracted Global State:**
- `quizActive`, `currentQuizMode`
- `quizScore`, `quizQuestionsAnswered`
- `usedQuizCountries`, `currentQuizQuestion`

---

#### 6.2 - Quiz Modes (Separate Files)

**`features/quiz/name-flag-quiz.js`**
```javascript
class NameFlagQuiz {
  generateQuestion()
  displayQuestion()
  checkAnswer(answer)
}
```

**`features/quiz/identify-flag-quiz.js`**
```javascript
class IdentifyFlagQuiz {
  constructor(flagRenderer)
  generateQuestion()
  displayQuestion()
  checkAnswer(answer)
}
```

**`features/quiz/click-quiz.js`**
```javascript
class ClickQuiz {
  constructor(globeManager)
  start()
  showQuestion()
  updateTimer()
  handleAnswer(countryName)
  showFeedback(message, isCorrect)
  end(completed)
}
```

**Benefits:**
- Each quiz mode is self-contained
- Easy to add new quiz types
- Shared logic in QuizManager base
- ~650 lines extracted

---

### **Phase 7: Flag System**
**Priority:** MEDIUM | **Risk:** LOW | **Effort:** 2-3 hours

Separate flag rendering from quiz system.

#### 7.1 - Flag Renderer (`features/flags/flag-renderer.js`)
**Lines:** ~200 | **Functions:** 8

**Exports:**
```javascript
class FlagRenderer {
  constructor(container, width, height)
  init()                    // Setup Three.js scene for flags
  createFlag(isoCode)       // Create flag mesh
  displayFlag(countryName, container)
  hide()
  destroy()
}
```

**Extracted:**
- `initFlagRenderer()` (hover flags)
- `initFlagQuizRenderer()` (quiz flags)
- `createWavingFlag()`
- `showWavingFlag()`
- `hideWavingFlag()`
- `displayFlagForQuiz()`

**Global Variables:**
- `flagScene`, `flagCamera`, `flagRenderer`, `flagMesh`
- `flagQuizScene`, `flagQuizCamera`, `flagQuizRenderer`, `flagQuizMesh`

---

#### 7.2 - Flag Animator (`features/flags/flag-animator.js`)
**Lines:** ~100 (already mostly done!)

**Exports:**
```javascript
// Already have animateFlagWave() - just needs extraction
class FlagAnimator {
  constructor()
  animate(mesh, originalPositions, time)  // Use existing animateFlagWave
  updateHoverFlag()
  updateQuizFlag()
}
```

**Benefits:**
- Unified flag animation (already achieved in Phase 3)
- Reusable for both quiz and hover contexts
- ~300 lines extracted total

---

### **Phase 8: Label Editor**
**Priority:** MEDIUM | **Risk:** MEDIUM | **Effort:** 3-4 hours

Extract the label editing feature into its own module.

#### 8.1 - Label Editor (`features/label-editor.js`)
**Lines:** ~400 | **Functions:** 15

**Exports:**
```javascript
class LabelEditor {
  constructor(labelManager, camera, controls)

  toggleEditMode()
  selectLabel(label)
  deselectLabel()
  resizeLabel(multiplier)
  resetLabel()

  // Modal controls
  openModal()
  closeModal()
  updateOffsets()
  updateScale()

  // Persistence
  save()
  load()
  export()
}
```

**Extracted Functions:**
- All `*EditMode` functions
- All label manipulation functions
- Modal management
- Config save/load

**Global Variables:**
- `editMode`, `selectedLabel`
- `selectionHelper`

**Benefits:**
- Self-contained editing feature
- Can be lazy-loaded if needed
- ~400 lines extracted

---

### **Phase 9: Search Feature**
**Priority:** LOW | **Risk:** LOW | **Effort:** 1-2 hours

Simple extraction of search functionality.

#### 9.1 - Search (`features/search.js`)
**Lines:** ~100 | **Functions:** 5

**Exports:**
```javascript
class SearchManager {
  constructor(countries, globeManager)
  onInput(event)
  onKeyDown(event)
  updateSelection(items)
  selectCountry(name)
  focusOnCountry(name)
  updateVisibilityOnMobile()
}
```

**Extracted:**
- `onSearchInput()`
- `onSearchKeyDown()`
- `updateSearchSelection()`
- `selectCountryFromSearch()`
- `focusOnCountryByName()`

**Global Variables:**
- `selectedSearchCountry`

---

### **Phase 10: Event Management**
**Priority:** LOW | **Risk:** MEDIUM | **Effort:** 2-3 hours

Centralize all event handling.

#### 10.1 - Event Manager (`events/event-manager.js`)
**Lines:** ~150 | **Functions:** 12

**Exports:**
```javascript
class EventManager {
  constructor(scene, camera, renderer, handlers)

  setupListeners()
  onPointerDown(event)
  onPointerMove(event)
  onPointerUp(event)
  onClick(event)
  onKeyDown(event)
  onWheel(event)
  destroy()
}
```

**Extracted:**
- `setupEventListeners()`
- All `on*` event handlers
- Mouse/touch interaction logic
- Raycasting

**Global Variables:**
- `mouse`, `raycaster`
- `isDragging`, `mouseDownPos`

---

### **Phase 11: State Management**
**Priority:** HIGH (Do Early) | **Risk:** HIGH | **Effort:** 2-3 hours

**NOTE:** Should be done EARLY to support other modules.

#### 11.1 - State Manager (`data/state.js`)
**Lines:** ~100

**Exports:**
```javascript
class StateManager {
  // Centralized global state
  state = {
    scene: { scene, camera, renderer, globe },
    countries: { list, centroids, selected },
    quiz: { active, mode, score, questions },
    flags: { hover, quiz },
    labels: { config, editMode, selected },
    search: { selected, results },
    ui: { loading, seoHidden, editMode }
  }

  get(path)
  set(path, value)
  subscribe(path, callback)  // For reactive updates
  reset()
}
```

**Benefits:**
- Single source of truth
- Easier debugging
- Supports module communication
- Enables future features (undo/redo, state persistence)

---

## Implementation Strategy

### Recommended Order:

1. **Phase 11 (State Manager)** - Do FIRST as foundation
2. **Phase 5 (Core 3D Engine)** - Critical infrastructure
3. **Phase 7 (Flag System)** - Low risk, good practice
4. **Phase 6 (Quiz System)** - Largest benefit
5. **Phase 9 (Search)** - Quick win
6. **Phase 8 (Label Editor)** - Self-contained feature
7. **Phase 10 (Events)** - Final cleanup

---

## Migration Approach

### Option A: Inline First (Recommended)
Keep using inline code with better organization (like Phases 1-4):

**Pros:**
- No module loading issues
- Works with file:// protocol
- Incremental refactoring
- Lower risk

**Cons:**
- Still in one file (but organized into sections)
- Can't lazy-load features

### Option B: ES6 Modules (Future-Proof)
Extract to separate .js files with ES6 imports:

**Pros:**
- True modularization
- Lazy loading possible
- Better IDE support
- Industry standard

**Cons:**
- Requires web server
- More complex setup
- Need bundler for production (optional)

### Option C: Hybrid Approach (Best of Both)
1. Refactor inline first (like Phases 1-4)
2. Group code into clear sections with comments:
   ```javascript
   // ========================================
   // SCENE MANAGEMENT
   // ========================================
   class SceneManager { ... }

   // ========================================
   // QUIZ SYSTEM
   // ========================================
   class QuizManager { ... }
   ```
3. Later extract to files when ready

---

## Expected Outcomes

### After Complete Modularization:

**File Structure:**
```
index.html         (~500 lines - just HTML + bootstrap)
styles.css         (1,702 lines)
js/main.js         (~200 lines - initialization)
js/core/*.js       (~900 lines total)
js/features/*.js   (~1,700 lines total)
js/events/*.js     (~150 lines)
js/data/*.js       (~100 lines)
js/utils/*.js      (~300 lines)
```

**Total:** ~5,550 lines across 20+ files

**Benefits:**
- ✅ Each file < 400 lines
- ✅ Clear separation of concerns
- ✅ Easy to test individual modules
- ✅ Easy to add new features
- ✅ Reduced cognitive load
- ✅ Better collaboration potential

---

## Risk Assessment

| Phase | Risk | Reason | Mitigation |
|-------|------|--------|------------|
| 5 (Core) | MEDIUM | Affects everything | Test thoroughly, incremental |
| 6 (Quiz) | MEDIUM-HIGH | Complex logic, many functions | Extract one quiz mode at a time |
| 7 (Flags) | LOW | Already partially unified | Easy extraction |
| 8 (Label Editor) | MEDIUM | Self-contained, but lots of state | Keep state management clear |
| 9 (Search) | LOW | Simple, isolated feature | Quick win |
| 10 (Events) | MEDIUM | Central to interactions | Careful testing needed |
| 11 (State) | HIGH | Foundation for other modules | Do first, design carefully |

---

## Next Steps

1. **Review this plan** - Ensure it aligns with project goals
2. **Choose approach** - Inline vs. Modules vs. Hybrid
3. **Start with Phase 11** - State management foundation
4. **Then Phase 5** - Core 3D engine
5. **Incremental implementation** - One phase at a time
6. **Test between phases** - Ensure nothing breaks
7. **Document as you go** - Update README with new structure

---

## Estimated Timeline

- **Phase 11 (State):** 2-3 hours
- **Phase 5 (Core):** 3-4 hours
- **Phase 7 (Flags):** 2-3 hours
- **Phase 6 (Quiz):** 4-5 hours
- **Phase 9 (Search):** 1-2 hours
- **Phase 8 (Label Editor):** 3-4 hours
- **Phase 10 (Events):** 2-3 hours

**Total:** ~17-24 hours of focused work

**With testing and debugging:** ~25-30 hours

---

*Created: 2025-11-01*
*Status: Planning - Ready for implementation*
*Next: Choose approach and start with Phase 11*
