/**
 * Remote themes: applying one, persisting the choice, and wearing it again on
 * the next load.
 *
 * A stored theme is a COMPLETE knob map — all 14, not a diff. That is forced by
 * how `applyCssVariables` works: it resolves the whole system from the knobs it
 * is given and writes every emitted property, so a partial map would silently
 * reset every knob it did not mention to the package default rather than to
 * the built artefact (which has `theme.json` layered in). Complete maps make an
 * applied theme independent of what happens to be baked.
 *
 * "Default" is not a theme. It is the absence of one: every inline property is
 * removed and the cascade — `dist/tokens.css`, `theme.json` included — shows
 * through. `defaultTheme()` from the package would be wrong here for the reason
 * `lib/theme-colors.ts` gives: it does not know about `theme.json`.
 *
 * ## The cache, and the inline script that reads it
 *
 * The chosen theme is applied by an island, which mounts after first paint. So
 * a reader on a remote theme would see the default look for a moment on every
 * load — exactly the flash the vanilla `initTheme()` existed to prevent. The
 * fix is the same: cache what was applied, and re-apply it before paint. Here
 * the cache holds the RESOLVED property map (`themeInline.css`), so the
 * `is:inline` script in `AppLayout.astro` that reads it does no derivation at
 * all — it sets properties from a map and could not drift from this file.
 *
 * ## Where the scheme goes
 *
 * A theme may pin a country colour scheme. Rather than a second place that
 * answers "which scheme", applying such a theme writes `scheme` into the
 * settings store, and the globe's boot `applyAll` reads it from there as it
 * always has. The reader can still change it afterwards; a theme sets the
 * starting point.
 */
import { applyCssVariables, toCssVariables, KNOB_NAMES } from '@terragotcha/design-tokens';
import { THEME_EVENT } from '../../../../js/utils/theme.js';
import { settingsStore } from '../../../../js/data/settings-store.js';
import type { RemoteTheme } from './api';
import { getGlobeHandle } from './globe';
import { readThemeColors } from './theme-colors';

export type Knobs = Record<string, string>;

export const DEFAULT_SELECTION = 'default';
const REMOTE_PREFIX = 'remote:';

export const selectionFor = (theme: RemoteTheme): string => `${REMOTE_PREFIX}${theme.id}`;
export const isRemoteSelection = (sel: unknown): boolean =>
    typeof sel === 'string' && sel.startsWith(REMOTE_PREFIX);
export const remoteIdOf = (sel: string): number => Number(sel.slice(REMOTE_PREFIX.length));

/** The backend speaks `--knob`; the package speaks `knob`. */
export function knobsFromApi(tokens: Record<string, string>): Knobs {
    return Object.fromEntries(
        Object.entries(tokens).map(([k, v]) => [k.replace(/^--/, ''), v]));
}

export function knobsToApi(knobs: Knobs): Record<string, string> {
    return Object.fromEntries(
        KNOB_NAMES.filter((n) => n in knobs).map((n) => [`--${n}`, knobs[n]]));
}

/** Every property the package emits, so "default" can remove exactly those. */
const EMITTED = Object.keys(toCssVariables({}));

function clearInline(el: HTMLElement): void {
    for (const prop of EMITTED) el.style.removeProperty(prop);
}

/** Tell the canvas surfaces and the globe that the cascade changed. */
function notify(): void {
    document.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme: true } }));
    getGlobeHandle()?.appearance.setThemeColors(readThemeColors());
}

/**
 * Preview a complete knob map without persisting anything — the Theme Lab's
 * per-keystroke call. `restoreAppliedTheme` is the way back.
 */
export function previewKnobs(knobs: Knobs): void {
    applyCssVariables(knobs);
    notify();
}

/** Apply a theme and remember it, or `null` for the default look. */
export function applyRemoteTheme(theme: RemoteTheme | null): void {
    const root = document.documentElement;
    clearInline(root);
    if (!theme) {
        settingsStore.save({ theme: DEFAULT_SELECTION, themeInline: null, themeScene: null });
        notify();
        return;
    }
    const knobs = knobsFromApi(theme.tokens);
    applyCssVariables(knobs, root);
    const patch: Record<string, unknown> = {
        theme: selectionFor(theme),
        themeInline: { tokens: knobs, css: toCssVariables(knobs) },
        themeScene: theme.countryScheme ? { countryScheme: theme.countryScheme } : null,
    };
    if (theme.countryScheme) {
        patch.scheme = theme.countryScheme;
        getGlobeHandle()?.appearance.setCountryScheme(theme.countryScheme);
    }
    settingsStore.save(patch);
    notify();
}

/**
 * Put the page back into the persisted state: the cached remote theme, or no
 * inline theme at all. For the Lab closing, and for a preview abandoned.
 */
export function restoreAppliedTheme(): void {
    const root = document.documentElement;
    clearInline(root);
    const saved = settingsStore.get() as { theme?: string; themeInline?: { tokens?: Knobs } | null; scheme?: string };
    if (isRemoteSelection(saved.theme) && saved.themeInline?.tokens) {
        applyCssVariables(saved.themeInline.tokens, root);
    }
    if (saved.scheme) getGlobeHandle()?.appearance.setCountryScheme(saved.scheme);
    notify();
}

/**
 * Bring the persisted choice into line with what the server now says.
 *
 * An admin may have edited the theme since it was cached, or unpublished or
 * deleted it. Re-applying the fresh copy refreshes the cache; a missing one
 * falls back to the default rather than wearing a theme that no longer exists.
 * A no-op when nothing remote is selected, so readers on the default never
 * cause a write.
 */
export function reconcileSelection(published: RemoteTheme[]): void {
    const sel = (settingsStore.get() as { theme?: string }).theme;
    if (!isRemoteSelection(sel)) return;
    const id = remoteIdOf(sel as string);
    applyRemoteTheme(published.find((t) => t.id === id) ?? null);
}
