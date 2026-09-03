/**
 * TypeScript's view of `GlobeBridge`.
 *
 * The contract itself lives in `packages/globe-bridge/src/interface.js` as JSDoc
 * plus the `GLOBE_BRIDGE_METHODS` name list, and that stays the source of truth —
 * the package is plain JS so that Node, the browser's import map and Metro can
 * all load it without a build step, and adding a `.d.ts` build to it would buy
 * types for one consumer at the cost of a compile step for four.
 *
 * So this restates the shape, and `tests/globe-bridge-types.test.js` fails if the
 * two disagree: it parses the method names out of this file and asserts they are
 * exactly `GLOBE_BRIDGE_METHODS` and `GLOBE_MARKER_METHODS`. A restatement that
 * nothing checks is just a copy waiting to rot.
 *
 * The governing rule, repeated because it is the one that matters: **nothing
 * platform-specific crosses this interface.** No `THREE.Vector3`, no DOM node,
 * no engine object — only names and plain values.
 */

/** Normalized screen position; `{x: 0.5, y: 0.5}` is the centre. */
export interface FocalAnchor {
    x: number;
    y: number;
}

export interface GlobeMarkers {
    place(lat: number, lng: number): void;
    setLabel(text: string): void;
    showLabel(): void;
    clear(): void;
}

export interface GlobeBridge {
    /** Tint one country as the selection, replacing any previous one. */
    highlight(name: string): void;
    /** Drop the highlight, any flash, and any reveal decoration, together. */
    clearSelection(): void;
    /** Briefly overlay a colour on one country — the quiz reveal. */
    flash(name: string, color: number, durationMs: number): void;
    /** Show only these countries; everything else reads as ocean. */
    showOnly(names: string[]): void;
    showAll(): void;

    /**
     * Move the camera to frame a country. `quizFraming` frames it smaller so
     * neighbours give context without giving the answer away; `aim` points at a
     * coordinate (a capital) rather than the centroid.
     */
    focusCountry(
        name: string,
        opts?: { quizFraming?: boolean; aim?: { lat: number; lng: number } },
    ): void;
    /**
     * Declare that something covers part of the viewport, so everything framed
     * afterwards lands in what is left. Null restores the full viewport.
     */
    setVisibleRegion(
        region: { focalAnchor: FocalAnchor; visibleFraction: number } | null,
    ): void;
    /**
     * Frame the whole globe, optionally rotating a coordinate into view. Every
     * field is optional including the lat/lng pair — "show me the whole globe"
     * names no point, and the implementation keeps the current heading rather
     * than aiming at an undefined one.
     */
    frameGlobe(opts?: {
        lat?: number;
        lng?: number;
        widthFraction?: number;
        focalAnchor?: FocalAnchor;
    }): void;
    /** Explicit framing from a server-supplied map block (Daily Challenge). */
    frameView(opts: {
        lat: number;
        lng: number;
        distance?: number;
        focalAnchor?: FocalAnchor;
        lockRotation?: boolean;
    }): void;
    /** Camera distance at which `name` fills `fraction` of the screen. */
    framingDistanceFor(name: string, fraction: number): number;
    /** Back to the neutral overview: zoom out and clear any view offset. */
    resetView(): void;

    /** Whether the user may rotate the globe. */
    setInteractive(enabled: boolean): void;
    /**
     * Whether idle auto-rotation may resume. Distinct from `setInteractive`:
     * during a click-to-answer quiz the player must be able to rotate while the
     * globe must not drift on its own.
     */
    setAutoRotateAllowed(allowed: boolean): void;

    /** Subscribe to country taps. @returns unsubscribe */
    onPick(cb: (name: string) => void): () => void;

    markers: GlobeMarkers;
}

/** Persisted preferences, as `SETTINGS_DEFAULTS` shapes them. */
export interface GlobeSettings {
    scheme?: string;
    showCountries?: boolean;
    showLabels?: boolean;
    borders?: boolean;
    borderOpacity?: number;
    selGradient?: boolean;
    autoRotate?: { enabled?: boolean; delayMs?: number; speed?: number };
    lighting?: Lighting | null;
}

export interface Lighting {
    ambient: number;
    diffuse: number;
    specStrength: number;
    shininess: number;
    oceanSpecBoost: number;
}

/**
 * The globe's themed colours: the space behind it, the ink its outlines and
 * graticule share, and the water. The resolved values of `--globe-space`,
 * `--globe-border` and `--ocean` — read from the cascade by
 * `lib/theme-colors.ts`, never recomputed in JS.
 */
export interface ThemeColors {
    space?: string;
    border?: string;
    ocean?: string;
}

/**
 * How the globe LOOKS, as opposed to where it is pointing.
 *
 * Separate from `GlobeBridge` on purpose — see
 * `packages/globe-bridge/src/appearance.js` for why, and note that
 * `tests/globe-bridge-types.test.js` checks this list against
 * `GLOBE_APPEARANCE_METHODS` the same way it checks the bridge.
 */
export interface GlobeAppearance {
    /** Apply a whole persisted settings object. The boot call. */
    applyAll(settings: GlobeSettings): void;
    /** The colour schemes this globe can render, in display order. */
    schemes(): Array<{ key: string; label: string }>;
    /** Recolour every country. A scheme KEY, never colours. */
    setCountryScheme(key: string): void;
    setCountriesVisible(visible: boolean): void;
    setLabelsVisible(visible: boolean): void;
    setBordersVisible(visible: boolean): void;
    /** 0–1. Set before enabling borders, or they draw at the wrong strength. */
    setBorderOpacity(opacity: number): void;
    setSelectionGradient(enabled: boolean): void;
    /**
     * The user's standing preference. Distinct from
     * `GlobeBridge.setAutoRotateAllowed`, which is a quiz suppressing drift for
     * the duration of a question and must not overwrite this.
     */
    setAutoRotate(opts: { enabled?: boolean; delayMs?: number; speed?: number }): void;
    /**
     * The three globe surfaces a theme owns — backdrop, outline ink, water — as
     * plain CSS colour strings. An omitted field is left alone, not reset.
     */
    setThemeColors(colors: ThemeColors): void;
    /** Null restores the defaults. */
    setLighting(lighting: Lighting | null): void;
    lightingDefaults(): Lighting;
}
