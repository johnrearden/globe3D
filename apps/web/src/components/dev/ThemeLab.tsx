/**
 * Theme Lab — the 13 knobs, live, in dev.
 *
 * `packages/design-tokens/src/tokens.js` fans 13 authorable values out to 47
 * emitted properties through `derive()`, which makes the result of a knob change
 * genuinely hard to predict by reading. So: edit them against the running app,
 * and persist what you like.
 *
 * ## Almost none of this is new machinery
 *
 * The package was built for a theme switcher that never got written.
 * `applyCssVariables` writes a resolved theme onto `<html>`; `KNOB_GROUPS`
 * carries the labels and widget types; `contrastRatio` and `pickKnobs` are
 * there. This component is the caller they were waiting for, which is why a
 * fourteenth knob needs no change here — it appears as a row on its own.
 *
 * ## Dev only
 *
 * Mounted from `AppLayout.astro` behind `import.meta.env.DEV`, so it is absent
 * from a production build rather than hidden in one. That matters beyond bundle
 * size: `/app` and `/country/*` are held to a static-content baseline (words,
 * links, zero app chrome) that a stray panel would break.
 *
 * ## Two things worth knowing
 *
 * The panel is styled in the very tokens it is editing — deliberately, since
 * that is the fastest way to see a palette fail. Escape resets, which is the way
 * back out of a combination that renders the panel unreadable.
 *
 * Saving writes `theme.json`, which the build reads. It does NOT change what a
 * hard reload shows until `npm run build:tokens` bakes it into the artefact, so
 * the panel says so rather than letting a reload look like data loss.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    KNOB_GROUPS, KNOB_NAMES, defaultTheme,
    applyCssVariables, contrastRatio, parseColor, toHex,
} from '@terragotcha/design-tokens';
import { cssToken, THEME_EVENT } from '../../../../../js/utils/theme.js';
import { getGlobeHandle } from '../../lib/globe';
import { readThemeColors } from '../../lib/theme-colors';
import '../../styles/dev-theme.css';

type Knobs = Record<string, string>;

/**
 * Contrast pairs worth warning about. `on-primary` is a knob rather than a
 * derivation precisely because there is no shipped `color-contrast()` and an
 * author picking a pale primary would otherwise ship an unreadable CTA
 * (`tokens.js`), so it is the first pair to check.
 */
const PAIRS: Array<[string, string, string]> = [
    ['text-primary', 'bg-panel', 'Body text on a panel'],
    ['text-secondary', 'bg-panel', 'Secondary text on a panel'],
    ['on-primary', 'primary', 'Label on a primary button'],
];

/** WCAG AA for body text. Advisory here — nothing is blocked. */
const AA = 4.5;

/**
 * Seed from the live cascade, not from `defaultTheme()`.
 *
 * The generated stylesheet already has `theme.json` layered in, so the cascade
 * is what the reader is actually looking at. Seeding from the defaults would
 * silently discard a committed theme the moment the first knob was touched,
 * because `applyCssVariables` writes a *complete* resolved set.
 */
function knobsFromCascade(): Knobs {
    const defaults = defaultTheme();
    return Object.fromEntries(
        KNOB_NAMES.map((name) => [name, cssToken(`--${name}`) || defaults[name]]),
    );
}

/** `<input type="color">` speaks #rrggbb only; anything else needs converting. */
function asHex(value: string): string {
    const parsed = parseColor(value);
    return parsed ? toHex(parsed) : '#000000';
}

/**
 * Is this value usable as a knob of this type?
 *
 * The colour maths in the package **throws** on an unparseable value —
 * `mix()`, `alpha()` and `luminance()` all do, correctly, since passing garbage
 * to a colour function is a caller bug rather than a value to guess at. But a
 * text field is unparseable on the way to being parseable: typing `#3b1020`
 * passes through `#`, `#3`, `#3b`. Feeding those to `applyCssVariables` throws
 * inside an effect and unmounts the island — the panel vanishes mid-keystroke.
 */
function usable(type: string, value: string): boolean {
    if (!value.trim()) return false;
    return type === 'color' ? parseColor(value) !== null : true;
}

export default function ThemeLab() {
    const [open, setOpen] = useState(false);
    /** Always complete and always valid — this is what gets applied. */
    const [knobs, setKnobs] = useState<Knobs>(knobsFromCascade);
    /**
     * Raw text for knobs being typed into, held separately so a half-finished
     * value can be displayed without being applied. An entry is dropped once it
     * matches what was applied.
     */
    const [drafts, setDrafts] = useState<Knobs>({});
    const [saved, setSaved] = useState<string | null>(null);

    const edit = useCallback((name: string, type: string, value: string) => {
        setDrafts((d) => ({ ...d, [name]: value }));
        if (usable(type, value)) {
            setKnobs((k) => ({ ...k, [name]: value }));
            setDrafts(({ [name]: _dropped, ...rest }) => rest);
        }
    }, []);

    // Push the whole resolved theme at every edit. Three consumers, because a
    // theme reaches the page by three different routes:
    //   1. CSS custom properties — everything the DOM wears.
    //   2. THEME_EVENT — canvas label textures, which cannot read a var().
    //   3. GlobeAppearance — the backdrop, outline ink and water, each read
    //      once at boot by the engine and otherwise frozen.
    useEffect(() => {
        applyCssVariables(knobs);
        document.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { preview: true } }));
        // Read back out of the cascade rather than recomputing: the values just
        // written are the authority, and one path serves boot and preview alike.
        getGlobeHandle()?.appearance.setThemeColors(readThemeColors());
    }, [knobs]);

    const reset = useCallback(() => {
        setKnobs(defaultTheme());
        setDrafts({});
        setSaved(null);
    }, []);

    // Escape resets rather than closing. The panel wears the theme it is
    // editing, so the failure worth designing for is a palette that has made
    // this panel unreadable — and a closed panel would not fix that.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') reset(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, reset]);

    /** Only what differs from the defaults — theme.json is the deviation. */
    const overrides = useMemo(() => {
        const defaults = defaultTheme();
        return Object.fromEntries(
            Object.entries(knobs).filter(([name, value]) => value !== defaults[name]),
        );
    }, [knobs]);

    const warnings = useMemo(
        () => PAIRS
            .map(([fg, bg, what]) => ({ what, ratio: contrastRatio(knobs[fg], knobs[bg]) }))
            .filter((w) => Number.isFinite(w.ratio) && w.ratio < AA),
        [knobs],
    );

    const save = useCallback(async () => {
        try {
            const res = await fetch('/__theme/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(overrides),
            });
            const body = await res.json();
            setSaved(body.ok
                ? `Saved ${Object.keys(body.written).length} knob(s). Run npm run build:tokens to bake it in.`
                : `Save failed: ${body.error}`);
        } catch (err) {
            setSaved(`Save failed: ${(err as Error).message}`);
        }
    }, [overrides]);

    if (!open) {
        return (
            <button
                type="button"
                className="tl-open"
                onClick={() => setOpen(true)}
                aria-label="Open the theme lab"
                title="Theme Lab (dev only)"
            >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path
                        fill="currentColor"
                        d="M12 3a9 9 0 0 0 0 18 2 2 0 0 0 2-2 2 2 0 0 0-.5-1.3 2 2 0 0 1 1.5-3.3H17a4 4 0 0 0 4-4c0-4-4-7.4-9-7.4Zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3.5 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"
                    />
                </svg>
            </button>
        );
    }

    return (
        <aside className="tl-panel" aria-label="Theme Lab">
            <header className="tl-bar">
                <p className="tl-title">Theme Lab</p>
                <span className="tl-count">
                    {Object.keys(overrides).length
                        ? `${Object.keys(overrides).length} changed`
                        : 'defaults'}
                </span>
                <button
                    type="button"
                    className="tl-close"
                    onClick={() => setOpen(false)}
                    aria-label="Close the theme lab"
                >
                    ×
                </button>
            </header>

            <div className="tl-scroll">
                {KNOB_GROUPS.map((group) => (
                    <section className="tl-group" key={group.title}>
                        <p className="tl-group-title">{group.title}</p>
                        {group.knobs.map((knob) => (
                            <label className="tl-row" key={knob.name}>
                                <span className="tl-label" title={knob.note || knob.name}>
                                    {knob.label}
                                </span>
                                {knob.type === 'color' && (
                                    <input
                                        type="color"
                                        className="tl-swatch"
                                        value={asHex(knobs[knob.name])}
                                        onChange={(e) =>
                                            edit(knob.name, knob.type, e.target.value)}
                                        aria-label={`${knob.label} colour`}
                                    />
                                )}
                                <input
                                    type="text"
                                    className={`tl-value${
                                        knob.name in drafts ? ' tl-pending' : ''}`}
                                    value={drafts[knob.name] ?? knobs[knob.name]}
                                    spellCheck={false}
                                    onChange={(e) =>
                                        edit(knob.name, knob.type, e.target.value)}
                                    aria-label={`${knob.label} value`}
                                />
                            </label>
                        ))}
                    </section>
                ))}

                {warnings.length > 0 && (
                    <section className="tl-group">
                        <p className="tl-group-title">Contrast below AA</p>
                        {warnings.map((w) => (
                            <p className="tl-warn" key={w.what}>
                                {w.what} — {w.ratio.toFixed(1)}:1
                            </p>
                        ))}
                    </section>
                )}

                {/* The one knob→asset dependency the panel cannot honour: the
                    font files are a hand-written <link> in AppLayout.astro. */}
                <p className="tl-note">
                    Changing a font here restyles the app but loads no new webfont — add it to the
                    Google Fonts <code>&lt;link&gt;</code> in <code>AppLayout.astro</code>.
                </p>
            </div>

            <footer className="tl-actions">
                <button type="button" className="tl-btn" onClick={reset}>Reset (Esc)</button>
                <button
                    type="button"
                    className="tl-btn"
                    onClick={() => navigator.clipboard?.writeText(
                        JSON.stringify(overrides, null, 4))}
                >
                    Copy JSON
                </button>
                <button type="button" className="tl-btn tl-save" onClick={save}>
                    Save to theme.json
                </button>
            </footer>

            {saved && <p className="tl-saved">{saved}</p>}
        </aside>
    );
}
