/**
 * Theme Lab — the 14 knobs, live, against the running app.
 *
 * `packages/design-tokens/src/tokens.js` fans 14 authorable values out to 47
 * emitted properties through `derive()`, which makes the result of a knob change
 * genuinely hard to predict by reading. So: edit them here, watch the app wear
 * them, and persist what you like.
 *
 * ## Two places a theme can go
 *
 * - **`theme.json`** (dev only) — the committed override map the build reads.
 *   This is how the *product's* look is authored: Save, then
 *   `npm run build:tokens`. The dev server's `/__theme/*` endpoints do the file
 *   I/O; they do not exist in production and the controls are not offered there.
 * - **The backend** (audit token) — a named theme that test users can pick from
 *   settings. `POST /api/admin/themes`, superuser-gated, the same token that
 *   unlocks the lighting sliders. A stored theme is a COMPLETE knob map, for the
 *   reason `lib/theme.ts` gives.
 *
 * Both are the same knobs, so a knob added to `tokens.js` appears here as a row
 * with no change to this file: the rows are generated from `KNOB_GROUPS`.
 *
 * ## Not in the initial bundle, and not in the static HTML
 *
 * `ShellControls` reaches this component through `React.lazy`, so it is its own
 * chunk, fetched only when the sheet is opened — and it can only be opened by a
 * session that can save (`canAuthorThemes`). `/` and `/country/*` are held to
 * a static-content baseline (words, links, zero app chrome); nothing here can
 * reach that document, because the shell island renders null at build time.
 *
 * ## Two things worth knowing
 *
 * The panel is styled in the very tokens it is editing — deliberately, since
 * that is the fastest way to see a palette fail. Escape resets, which is the way
 * back out of a combination that renders the panel unreadable; closing it
 * restores whatever theme the reader had.
 *
 * In dev it seeds from `theme.json` rather than from the built artefact, because
 * the two disagree for exactly as long as it takes to remember to rebuild, and a
 * panel seeded from the artefact once deleted a knob that had been saved but not
 * yet baked.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    KNOB_GROUPS, KNOB_NAMES, defaultTheme,
    contrastRatio, parseColor, toHex,
} from '@terragotcha/design-tokens';
import { cssToken } from '../../../../../js/utils/theme.js';
import { getApi, type RemoteTheme } from '../../lib/api';
import { hasAuditToken } from '../../lib/audit';
import { readSettings } from '../../lib/settings';
import {
    applyRemoteTheme, knobsFromApi, knobsToApi, previewKnobs, restoreAppliedTheme,
    type Knobs,
} from '../../lib/theme';
import type { GlobeAppearance } from '../../lib/globe-types';
// `?inline` on purpose: Astro hoists the CSS of every module a page can reach,
// dynamic imports included, into that page's <style> — so a plain import put
// this panel's rules into every crawler-facing document. As a string it is part
// of this chunk and nothing else.
import labCss from '../../styles/theme-lab.css?inline';

const DEV = import.meta.env.DEV;

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
    // Coastlines are outline ink drawn straight onto water, so this pair is
    // real. It is only half the question: outlines are read mostly against the
    // COUNTRY PALETTE, which is pinned by scheme key rather than by tokens
    // (COUNTRY_SCHEMES), so there is no token to check it against. Judge that
    // half by looking at the globe — which is what this panel is for.
    ['globe-border', 'ocean', 'Coastlines on water'],
];

/** WCAG AA for body text. Advisory here — nothing is blocked. */
const AA = 4.5;

/**
 * Seed from the live cascade: the built artefact plus whatever remote theme is
 * applied inline. Correct for a first paint; in dev, `useStoredTheme` replaces
 * it with `theme.json`.
 */
function knobsFromCascade(): Knobs {
    const defaults = defaultTheme();
    return Object.fromEntries(
        KNOB_NAMES.map((name) => [name, cssToken(`--${name}`) || defaults[name]]),
    );
}

/**
 * Replace the seed with what `theme.json` actually holds.
 *
 * The panel is a view of the STORED theme, not of the last build, and the
 * difference is not academic: those two disagree for exactly as long as it
 * takes to remember `npm run build:tokens`. Seeding from the artefact alone
 * meant a knob that had been saved but not yet baked showed its default, was
 * therefore not counted as an override, and **was deleted by the next save** —
 * which writes the diff against defaults. A save silently dropping a value the
 * reader had already saved is the worst failure this panel can have.
 *
 * Dev only: the endpoint is the dev server's, and in production the cascade
 * seed is already the truth.
 */
function useStoredTheme(apply: (knobs: Knobs) => void) {
    useEffect(() => {
        if (!DEV) return;
        let live = true;
        fetch('/__theme/current')
            .then((r) => (r.ok ? r.json() : null))
            .then((stored: Knobs | null) => {
                if (!live || !stored) return;
                apply({ ...defaultTheme(), ...stored });
            })
            .catch(() => {});
        return () => { live = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount.
    }, []);
}

/** `<input type="color">` speaks #rrggbb only; anything else needs converting. */
function asHex(value: string): string {
    const parsed = parseColor(value);
    return parsed ? toHex(parsed) : '#000000';
}

/**
 * The generic families, as complete stacks. No specific family is named here —
 * a tool that hardcodes "Georgia" is asserting something about the reader's
 * machine that it cannot know.
 */
const SYSTEM_FONTS = [
    { value: 'system-ui, sans-serif', label: 'System default' },
    { value: 'ui-serif, serif', label: 'System serif' },
    { value: 'ui-monospace, monospace', label: 'System monospace' },
];

/** Roundness slider range, in px. 0 is square; past ~32 a panel reads as a pill. */
const RADIUS_MAX = 32;

/**
 * The families actually available to this document, read from `document.fonts`.
 *
 * Deliberately not a hand-written list of what the Google Fonts `<link>` in
 * `SiteHead.astro` requests: that would be a second place to update, and the
 * two would drift the first time a family was swapped. `FontFaceSet` holds one
 * entry per loaded weight, so families repeat and are deduped.
 */
function loadedFamilies(): string[] {
    const set = globalThis.document?.fonts;
    if (!set) return [];
    return [...new Set([...set].map((f) => f.family))].sort((a, b) => a.localeCompare(b));
}

/** A family name as a complete stack, so a missing glyph still falls back sanely. */
const stackFor = (family: string) => `'${family}', system-ui, sans-serif`;

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

/** What the server said, in a form the panel can show. */
function describe(err: unknown): string {
    const e = err as { status?: number; message?: string };
    if (e?.status === 401 || e?.status === 403) {
        return 'Not authorised — visit /audit/launch again; the token expires.';
    }
    return e?.message || 'Something went wrong.';
}

const NEW = 'new';

export default function ThemeLab({
    appearance,
    onClose,
}: {
    appearance: GlobeAppearance;
    onClose: () => void;
}) {
    /** Always complete and always valid — this is what gets applied. */
    const [knobs, setKnobs] = useState<Knobs>(knobsFromCascade);
    /**
     * Raw text for knobs being typed into, held separately so a half-finished
     * value can be displayed without being applied. An entry is dropped once it
     * matches what was applied.
     */
    const [drafts, setDrafts] = useState<Knobs>({});
    /** '' = inherit the reader's own scheme setting. */
    const [scheme, setScheme] = useState('');
    const [status, setStatus] = useState<string | null>(null);
    /** Families this document can actually render, for the font dropdowns. */
    const [families, setFamilies] = useState<string[]>(loadedFamilies);
    const [schemes] = useState(() => appearance.schemes());

    // ---- publishing ----
    const canPublish = hasAuditToken();
    /** Every stored theme, drafts included; null until fetched. */
    const [stored, setStored] = useState<RemoteTheme[] | null>(null);
    /** Which one Save writes to: `NEW`, or an id. */
    const [target, setTarget] = useState<string>(NEW);
    const [name, setName] = useState('');
    const [published, setPublished] = useState(true);
    const [busy, setBusy] = useState(false);
    /** The two-tap delete: first tap arms, second deletes. */
    const [armed, setArmed] = useState(false);

    useStoredTheme(setKnobs);

    useEffect(() => {
        if (!canPublish) return;
        let live = true;
        getApi()
            .then((api) => api.listAllThemes())
            .then((list) => { if (live) setStored(list); })
            .catch((err) => { if (live) setStatus(describe(err)); });
        return () => { live = false; };
    }, [canPublish]);

    // `document.fonts` is empty until the webfonts arrive, so the first read
    // would offer System and nothing else. Re-read once they have landed.
    useEffect(() => {
        let live = true;
        document.fonts?.ready.then(() => { if (live) setFamilies(loadedFamilies()); });
        return () => { live = false; };
    }, []);

    /** Every stack the dropdowns offer, so an unlisted one can be shown as-is. */
    const fontValues = useMemo(
        () => new Set([...families.map(stackFor), ...SYSTEM_FONTS.map((f) => f.value)]),
        [families],
    );

    const edit = useCallback((knob: string, type: string, value: string) => {
        setDrafts((d) => ({ ...d, [knob]: value }));
        if (usable(type, value)) {
            setKnobs((k) => ({ ...k, [knob]: value }));
            setDrafts(({ [knob]: _dropped, ...rest }) => rest);
        }
    }, []);

    // Preview on every edit: CSS properties, the canvas label textures, and the
    // three globe surfaces that read their token once at boot. One call.
    useEffect(() => { previewKnobs(knobs); }, [knobs]);

    // The scheme too — and back to the reader's own when previewing "inherit".
    useEffect(() => {
        appearance.setCountryScheme(scheme || readSettings().scheme || 'greys');
    }, [appearance, scheme]);

    // Leaving the Lab puts the page back into its persisted state. Without
    // this a preview would outlive the panel and look like a saved theme.
    useEffect(() => () => restoreAppliedTheme(), []);

    const reset = useCallback(() => {
        setKnobs(defaultTheme());
        setDrafts({});
        setScheme('');
        setStatus(null);
    }, []);

    // Escape resets rather than closing. The panel wears the theme it is
    // editing, so the failure worth designing for is a palette that has made
    // this panel unreadable — and a closed panel would not fix that.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') reset(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [reset]);

    /** Only what differs from the defaults — theme.json is the deviation. */
    const overrides = useMemo(() => {
        const defaults = defaultTheme();
        return Object.fromEntries(
            Object.entries(knobs).filter(([k, value]) => value !== defaults[k]),
        );
    }, [knobs]);

    const warnings = useMemo(
        () => PAIRS
            .map(([fg, bg, what]) => ({ what, ratio: contrastRatio(knobs[fg], knobs[bg]) }))
            .filter((w) => Number.isFinite(w.ratio) && w.ratio < AA),
        [knobs],
    );

    /** Load a stored theme into the panel, or start a new one. */
    const pick = useCallback((value: string) => {
        setTarget(value);
        setArmed(false);
        const theme = stored?.find((t) => String(t.id) === value);
        if (!theme) { setName(''); setPublished(true); return; }
        setKnobs({ ...defaultTheme(), ...knobsFromApi(theme.tokens) });
        setDrafts({});
        setScheme(theme.countryScheme || '');
        setName(theme.name);
        setPublished(theme.isPublished);
    }, [stored]);

    const saveFile = useCallback(async () => {
        try {
            const res = await fetch('/__theme/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(overrides),
            });
            const body = await res.json();
            if (!body.ok) { setStatus(`Save failed: ${body.error}`); return; }
            // A dropped knob is the failure worth shouting about: the write
            // succeeded, so everything downstream reports success while the
            // value is simply gone. It happened for nine days because a
            // long-lived dev server was filtering against a stale knob list.
            const lost = body.dropped?.length
                ? ` NOT saved: ${body.dropped.join(', ')} — restart the dev server.`
                : '';
            setStatus(
                `Saved ${Object.keys(body.written).length} knob(s) to theme.json.`
                + ' Run npm run build:tokens to bake it in.' + lost);
        } catch (err) {
            setStatus(`Save failed: ${(err as Error).message}`);
        }
    }, [overrides]);

    const publish = useCallback(async () => {
        if (!name.trim()) { setStatus('Give the theme a name.'); return; }
        setBusy(true);
        try {
            const api = await getApi();
            const input = {
                name: name.trim(),
                // The whole map, not the diff — see lib/theme.ts.
                tokens: knobsToApi(knobs),
                countryScheme: scheme,
                isPublished: published,
            };
            const saved = target === NEW
                ? await api.createTheme(input)
                : await api.updateTheme(Number(target), input);
            setStored((list) => {
                const rest = (list ?? []).filter((t) => t.id !== saved.id);
                return [...rest, saved].sort((a, b) => a.name.localeCompare(b.name));
            });
            setTarget(String(saved.id));
            // Wear it: the picker's selection follows what was just saved, and
            // the cache is refreshed for the next load.
            applyRemoteTheme(saved);
            setStatus(`Saved "${saved.name}"${saved.isPublished ? '' : ' as a draft'}.`);
        } catch (err) {
            setStatus(describe(err));
        } finally {
            setBusy(false);
        }
    }, [knobs, name, published, scheme, target]);

    const remove = useCallback(async () => {
        if (!armed) { setArmed(true); return; }
        setBusy(true);
        try {
            const api = await getApi();
            const id = Number(target);
            await api.deleteTheme(id);
            setStored((list) => (list ?? []).filter((t) => t.id !== id));
            // If the reader was wearing it, they are not any more.
            if (readSettings().theme === `remote:${id}`) applyRemoteTheme(null);
            pick(NEW);
            setStatus('Deleted.');
        } catch (err) {
            setStatus(describe(err));
        } finally {
            setBusy(false);
            setArmed(false);
        }
    }, [armed, pick, target]);

    return (
        <aside className="tl-panel" aria-label="Theme Lab">
            <style>{labCss}</style>
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
                    onClick={onClose}
                    aria-label="Close the theme lab"
                >
                    ×
                </button>
            </header>

            <div className="tl-scroll">
                {canPublish && (
                    <section className="tl-group">
                        <p className="tl-group-title">Theme</p>
                        <label className="tl-row">
                            <span className="tl-label">Editing</span>
                            <span className="tl-control">
                                <select
                                    className="tl-select"
                                    value={target}
                                    onChange={(e) => pick(e.target.value)}
                                    aria-label="Theme to edit"
                                >
                                    <option value={NEW}>New theme…</option>
                                    {(stored ?? []).map((t) => (
                                        <option key={t.id} value={String(t.id)}>
                                            {t.name}{t.isPublished ? '' : ' (draft)'}
                                        </option>
                                    ))}
                                </select>
                            </span>
                        </label>
                        <label className="tl-row">
                            <span className="tl-label">Name</span>
                            <span className="tl-control">
                                <input
                                    type="text"
                                    className="tl-value"
                                    value={name}
                                    maxLength={80}
                                    onChange={(e) => setName(e.target.value)}
                                    aria-label="Theme name"
                                />
                            </span>
                        </label>
                        <label className="tl-row">
                            <span className="tl-label">Published</span>
                            <span className="tl-control">
                                <input
                                    type="checkbox"
                                    checked={published}
                                    onChange={(e) => setPublished(e.target.checked)}
                                    aria-label="Visible in the settings picker"
                                />
                            </span>
                        </label>
                    </section>
                )}

                {KNOB_GROUPS.map((group) => (
                    <section className="tl-group" key={group.title}>
                        <p className="tl-group-title">{group.title}</p>
                        {group.knobs.map((knob) => (
                            <label className="tl-row" key={knob.name}>
                                <span className="tl-label" title={knob.note || knob.name}>
                                    {knob.label}
                                </span>
                                <span className="tl-control">
                                    {knob.type === 'color' && (
                                        <>
                                            <input
                                                type="color"
                                                className="tl-swatch"
                                                value={asHex(knobs[knob.name])}
                                                onChange={(e) =>
                                                    edit(knob.name, knob.type, e.target.value)}
                                                aria-label={`${knob.label} colour`}
                                            />
                                            {/* Colours keep a text field: a hex is
                                                often something you paste, and the
                                                native picker cannot express rgba(). */}
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
                                        </>
                                    )}

                                    {knob.type === 'font' && (
                                        <select
                                            className="tl-select"
                                            value={knobs[knob.name]}
                                            onChange={(e) =>
                                                edit(knob.name, knob.type, e.target.value)}
                                            aria-label={`${knob.label} family`}
                                        >
                                            {/* A stack the dropdown does not offer —
                                                from a stored theme, or a family that
                                                has not loaded yet. Listed first so the
                                                select shows the truth rather than
                                                silently reading as something else. */}
                                            {!fontValues.has(knobs[knob.name]) && (
                                                <option value={knobs[knob.name]}>
                                                    {knobs[knob.name]}
                                                </option>
                                            )}
                                            {families.length > 0 && (
                                                <optgroup label="Loaded on this page">
                                                    {families.map((f) => (
                                                        <option key={f} value={stackFor(f)}>{f}</option>
                                                    ))}
                                                </optgroup>
                                            )}
                                            <optgroup label="System">
                                                {SYSTEM_FONTS.map((f) => (
                                                    <option key={f.value} value={f.value}>
                                                        {f.label}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        </select>
                                    )}

                                    {knob.type === 'length' && (
                                        <>
                                            <input
                                                type="range"
                                                className="tl-range"
                                                min={0}
                                                max={RADIUS_MAX}
                                                step={1}
                                                value={parseInt(knobs[knob.name], 10) || 0}
                                                onChange={(e) => edit(
                                                    knob.name, knob.type, `${e.target.value}px`)}
                                                aria-label={`${knob.label} in pixels`}
                                            />
                                            <output className="tl-readout">
                                                {knobs[knob.name]}
                                            </output>
                                        </>
                                    )}
                                </span>
                            </label>
                        ))}
                    </section>
                ))}

                {/* Not a token: the palette is pinned by scheme KEY, never by
                    colours (COUNTRY_SCHEMES), so this is the one row that is
                    not generated from KNOB_GROUPS. */}
                <section className="tl-group">
                    <p className="tl-group-title">Globe palette</p>
                    <label className="tl-row">
                        <span className="tl-label">Country scheme</span>
                        <span className="tl-control">
                            <select
                                className="tl-select"
                                value={scheme}
                                onChange={(e) => setScheme(e.target.value)}
                                aria-label="Country colour scheme"
                            >
                                <option value="">Reader's own setting</option>
                                {schemes.map((s) => (
                                    <option key={s.key} value={s.key}>{s.label}</option>
                                ))}
                            </select>
                        </span>
                    </label>
                </section>

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

                {/* The dropdowns offer only what this document can already
                    render, so a chosen family always resolves. Widening the
                    list is the one knob→asset dependency the panel cannot do
                    for you: the webfonts are a hand-written <link>. */}
                <p className="tl-note">
                    Font options are the families this page has loaded, plus the system stacks.
                    To offer another, add it to the Google Fonts <code>&lt;link&gt;</code> in{' '}
                    <code>SiteHead.astro</code>.
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
                {DEV && (
                    <button type="button" className="tl-btn tl-save" onClick={saveFile}>
                        Save to theme.json
                    </button>
                )}
                {canPublish && (
                    <>
                        <button
                            type="button"
                            className="tl-btn tl-save"
                            onClick={publish}
                            disabled={busy}
                        >
                            {target === NEW ? 'Publish as new theme' : 'Save theme'}
                        </button>
                        {target !== NEW && (
                            <button
                                type="button"
                                className={`tl-btn tl-danger${armed ? ' armed' : ''}`}
                                onClick={remove}
                                disabled={busy}
                            >
                                {armed ? 'Really delete?' : 'Delete'}
                            </button>
                        )}
                    </>
                )}
            </footer>

            {status && <p className="tl-saved">{status}</p>}
        </aside>
    );
}
