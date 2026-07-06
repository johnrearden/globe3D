# Camera Zoom & Framing

How the camera's target zoom distance is chosen (a) when a user clicks a country to
focus it, and (b) when a country is the subject of a quiz question.

Both cases run through the **same core framing engine**, just with different inputs.
The key idea: zoom distance is **not** a fixed constant and **not** a country
"size category" — it's computed on the fly so the country's bounding box fills a
chosen fraction of the screen, given the live camera FOV. The A–H size levels only
survive as a fallback.

## The shared engine

### `framingDistance()` — `js/core/focus-zoom.js:112`

```js
export function framingDistance(width, fraction, halfFovRad) {
    if (!(width > 0)) return null;
    const allowedHalfAngle = fraction * halfFovRad;
    return 1 + (width / 2) / Math.tan(allowedHalfAngle);
}
```

- `width` = the country's bounding box projected onto the unit sphere:
  `max(Δx, Δz)` over its 4 bbox corners (`bboxWidth()`, `js/core/focus-zoom.js:78`).
  Bigger country → bigger width → larger distance (further out).
- `fraction` = what share of the screen the country should occupy along the
  limiting axis.
- `halfFovRad` = half the *smaller* of the vertical/horizontal field of view.
- The `1 +` accounts for the globe surface sitting one radius nearer than the globe
  centre (derivation in the comment at `js/core/focus-zoom.js:96`).

### `framingDistanceFor()` — `js/core/camera-controls.js:166`

This is the wrapper everything actually calls. It reads the **live** camera FOV and
aspect ratio, picks the limiting half-FOV, calls `framingDistance()`, and clamps the
result to the zoom limits `[1.14, 10]`:

```js
const vHalf  = (this.camera.fov || 75) * Math.PI / 360;       // half vertical FOV
const aspect = this.camera.aspect || innerWidth / innerHeight;
const hHalf  = Math.atan(Math.tan(vHalf) * aspect);           // half horizontal FOV
const halfFov = Math.min(vHalf, hHalf);
const d = framingDistance(reg.widthOf(name), fraction, halfFov);
return Math.max(minDistance, Math.min(maxDistance, d));        // clamp to [1.14, 10]
```

Because it uses the *smaller* of vertical/horizontal FOV, a **portrait phone zooms
out further** than a wide desktop for the same country — the country stays fully
framed on the narrow axis.

Two things it deliberately does **not** depend on:

- **Current zoom** — the target distance is absolute; the camera's current position
  only sets the *start* of the 1000 ms ease animation, not the destination.
- **Country area** — only the bbox *width* matters, not the polygon area.

The only fallback path: if the focus registry or width is unavailable, it falls back
to the country's **A–H level distance** (`LEVEL_DISTANCES` = `1.14 … 2.43`,
`js/core/focus-zoom.js:20`), and ultimately to a hardcoded `1.55`. Those A–H levels
otherwise now only drive label-appearance thresholds, not framing.

## 1) Clicking a country to focus + show its info

**Path:** `pointer-controls.js:onPointerUp` picks the country by raycast, then in the
non-quiz branch (`js/features/pointer-controls.js:204`) calls:

```js
this.rotateGlobeToCountry(pickedName, false, pickResult.point);   // camera focus
this.flagRenderer.show(pickedName, ...);                          // info panel
```

`rotateGlobeToCountry` is wired in `index.html` to
`cameraController.rotateToCountry(name, isQuizMode = false, aimPoint)`. Note the two
click-specific inputs:

- **`isQuizMode = false`** → the fraction used is
  **`CLICK_SCREEN_FRACTION = 0.40`** (`js/core/focus-zoom.js:36`). The country is
  framed to fill ~40% of the limiting screen axis — big enough to read, with local
  context around it.
- **`aimPoint = the exact point you clicked`** → the camera aims at where your
  finger/cursor landed (converted to phi/theta at `js/core/camera-controls.js:114`),
  not necessarily the country centroid. (Search and the weak-spots widget reach the
  same `rotateToCountry` but with no aim point, so they aim at the centroid.)

So: **distance = `1 + (bboxWidth/2) / tan(0.40 · halfFov)`, clamped to `[1.14, 10]`**,
animated over 1 s. A tiny country like Liechtenstein zooms right in to the 1.14 floor;
a large one like Russia settles much further out.

## 2) A country chosen as a quiz subject

Here it splits into **standard client quizzes** (country picked randomly in the
browser) and the **daily challenge** (country picked by the server).

### Standard client quizzes

The subject is picked by `Math.random()` over
`globeManager.getCentroidsByRegion(scope)`, filtered to exclude already-used
countries/dependencies. Camera behavior then **differs sharply by quiz type**:

| Quiz mode | Camera behavior |
|---|---|
| **Name the country** | Zooms *to the country* via `rotateGlobeToCountry(record, true)` (`js/features/quiz/name-flag-quiz.js:283`). `true` = quiz mode → **`QUIZ_SUBJECT_SCREEN_FRACTION = 0.20`**. Same formula as a click but with **half the fill fraction**, so the country appears smaller with *more surrounding countries visible* — you can see neighbours as clues without the label giving it away. |
| **Capital cities — forward** ("capital of X?") | `rotateToCountry(countryObj, true, aimPoint)` aimed at the capital's lat/lng, again at 20% framing (`js/features/quiz/capital-cities-quiz.js:288`). |
| **Capital cities — reverse** ("X is the capital of…?") | Deliberately does **not** frame the country (that would reveal the answer). Instead `frameWholeGlobe({ widthFraction: 0.25 })` → `framingDistance(2, 0.25, hHalf)` (`js/core/camera-controls.js:197`), zooming *far out* to show the whole globe with just the capital marker. |
| **Identify the flag** | Globe camera is **not moved at all** — it renders a separate 3D waving-flag scene with its own camera at `z = 9.5` (`js/features/quiz/identify-flag-quiz.js:162`). |
| **Find the country** (click) | Globe camera is **left wherever it is**; the question only disables auto-rotate and updates the prompt (`js/features/quiz/click-quiz.js:52`). No per-question zoom. |

So for the two "zoom to subject" modes, the distance formula is identical to the click
case but with `fraction = 0.20` instead of `0.40` — roughly **double the distance**,
intentionally, to keep neighbours in frame.

### Daily challenge (server-provided country)

The client (`js/features/daily-quiz/daily-quiz.js`) never picks a country; it fetches
a fully-formed question payload and `question-renderer.js:_setupMap`
(`js/features/daily-quiz/question-renderer.js:145`) decides framing based on what the
server sends:

```js
let distance = map.zoom;                                    // server value wins if present
if (!distance && map.focusCountry) {
    distance = camera.framingDistanceFor(map.focusCountry, QUIZ_SUBJECT_SCREEN_FRACTION); // 0.20
}
camera.frameView({ lat: map.center.lat, lng: map.center.lng, distance,
                   focalAnchor: map.focalAnchor, lockRotation: !!map.lockRotation });
```

There are two sub-cases, determined by the backend generators in
`backend/quiz/generation/`:

- **Single-subject daily questions** (e.g. daily "name the country", `gen_name_country`)
  send **`zoom: null`**. The client then computes the distance itself with
  `framingDistanceFor(focusCountry, 0.20)` — i.e. **exactly the same 20%-fill framing
  as the standard "Name the country" quiz**. Flag / text-only daily questions send no
  map block at all → the globe just zooms out to the full view.

- **Multi-country daily questions** (e.g. "which countries border X", region-click)
  can't be framed client-side because the client doesn't know the hidden answer set.
  So the **server sends an explicit `zoom`** computed from the angular spread of the
  answer countries (`backend/quiz/generation/base.py`, `frame_distance`):

  ```py
  radius = max(great_circle(center, c) for c in countries)   # degrees
  dist   = 1.2 + (radius / 90.0) * 3.2
  return round(max(1.3, min(dist, 6.0)), 3)                  # clamp [1.3, 6.0]
  ```

  This maps how spread-out the answers are onto a distance in the 1.3–6.0 range. The
  server also supplies a **`focalAnchor`** (e.g. `{x:0.5, y:0.30}`) that shifts the
  globe upward so it doesn't sit under the options grid, plus `lockRotation: true`.

Unlike standard quizzes, the daily path always goes through **`frameView`**
(`js/core/camera-controls.js:246` — explicit lat/lng + focal-anchor offset + optional
rotation lock), rather than `rotateToCountry` aiming from a picked point.

## Summary

| Scenario | Fraction / source | Distance |
|---|---|---|
| **Click a country** | `CLICK_SCREEN_FRACTION = 0.40`, aimed at click point | `1 + (bboxWidth/2)/tan(0.40·halfFov)`, clamp `[1.14, 10]` |
| **Quiz subject** (name-country, capital-forward, daily single-subject) | `QUIZ_SUBJECT_SCREEN_FRACTION = 0.20` | same formula, fraction 0.20 → ~2× further out |
| **Capital reverse** | whole-globe, `widthFraction 0.25` | `framingDistance(2, 0.25, halfFov)` |
| **Daily multi-country** | server `zoom` from answer spread | `1.2 + (radius°/90)·3.2`, clamp `[1.3, 6.0]` |
| **Identify-flag / Find-the-country** | — | camera not moved |

The unifying principle for cases 1 and 2 is the same one line —
`distance = 1 + (width/2)/tan(fraction·halfFov)` — where the **country's bbox width**
and the **screen fraction** (0.40 for a click, 0.20 for a quiz subject) are the only
things that change.

## Key files

- `js/core/focus-zoom.js` — `framingDistance()`, `bboxWidth()`, `FocusZoomRegistry`,
  the `CLICK_SCREEN_FRACTION` / `QUIZ_SUBJECT_SCREEN_FRACTION` constants, and the A–H
  `LEVEL_DISTANCES` fallback.
- `js/core/camera-controls.js` — `framingDistanceFor()`, `rotateToCountry()`,
  `frameWholeGlobe()`, `frameView()`, and the `[1.14, 10]` clamp limits.
- `js/features/pointer-controls.js` — click → focus path (`onPointerUp`).
- `js/features/quiz/*` — per-mode subject selection and camera behavior.
- `js/features/daily-quiz/question-renderer.js` — daily-quiz framing dispatch.
- `backend/quiz/generation/` — server-side subject selection and `frame_distance`.
