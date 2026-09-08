/**
 * The app's standing controls: the settings gear, the sheets it opens, and the
 * weak-spots list.
 *
 * A sibling of `QuizLayer` rather than part of it, because none of this is a
 * quiz — but they have to agree about what is on screen, and they are separate
 * React roots. `lib/overlay.ts` is that agreement: the quiz's mode picker can
 * open the progress sheet without either component knowing the other exists.
 *
 * Like `QuizLayer` it renders **nothing at build time** — there is no globe on
 * the server, so it returns null and Astro emits an empty island. The article a
 * crawler sees is untouched.
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import { quizStore } from '@terragotcha/quiz-core';
import { installAutoEvents } from '../../lib/analytics';
import { getApi } from '../../lib/api';
import { captureAuditToken } from '../../lib/audit';
import { getGlobeHandle, onGlobeReady, type GlobeHandle } from '../../lib/globe';
import {
    closeOverlay,
    getOverlay,
    onOverlayChange,
    setOverlay,
    type OverlayName,
} from '../../lib/overlay';
import { readSettings, useSettings } from '../../lib/settings';
import { isRemoteSelection, reconcileSelection } from '../../lib/theme';
import Icon from '../quiz/Icon';
import CountryInfo from './CountryInfo';
import SearchBox from './SearchBox';
import SettingsSheet from './SettingsSheet';
import StatsSheet from './StatsSheet';
import WeakSpots from './WeakSpots';

/**
 * Its own chunk, fetched the first time someone opens it — which only a session
 * that can save a theme can do. A static import would put the knob table, the
 * colour maths and the panel's stylesheet into every reader's shell bundle.
 */
const ThemeLab = lazy(() => import('../theme/ThemeLab'));

export default function ShellControls() {
    const [handle, setHandle] = useState<GlobeHandle | null>(getGlobeHandle);
    const [overlay, setOpen] = useState<OverlayName | null>(getOverlay);

    useEffect(() => onGlobeReady(setHandle), []);
    useEffect(() => onOverlayChange(setOpen), []);

    // `/audit/launch` lands here with `?audit=`. The layout's inline script has
    // normally already kept it and scrubbed the URL — before `AppRouter` rewrote
    // it — so this is the fallback for a document where that did not run.
    useEffect(() => { captureAuditToken(); }, []);

    // quiz_start, off the store. A no-op outside a production build.
    useEffect(() => { installAutoEvents(); }, []);

    // A reader wearing a remote theme is already wearing it — the layout's
    // inline script re-applied the cache before paint. This checks the server
    // still agrees (an admin may have edited or retired it) and is skipped
    // entirely for the default, so most readers never load the API client.
    useEffect(() => {
        if (!isRemoteSelection(readSettings().theme)) return;
        getApi().then((api) => api.listThemes()).then(reconcileSelection).catch(() => {});
    }, []);

    // Nothing here can do anything useful without a globe to act on.
    if (!handle) return null;

    return <Controls handle={handle} overlay={overlay} />;
}

/**
 * Split from the component above only so the hooks below it can run
 * unconditionally: `ShellControls` returns null before the globe exists, and a
 * hook after that early return would break the rules-of-hooks contract.
 */
function Controls({
    handle,
    overlay,
}: {
    handle: GlobeHandle;
    overlay: OverlayName | null;
}) {
    const settings = useSettings();
    /** The country whose info panel is open, or null. */
    const [selected, setSelected] = useState<string | null>(null);
    const [quizActive, setQuizActive] = useState(() => quizStore.isActive());
    const infoEnabled = settings.showInfoPanel !== false;

    // A quiz takes the globe. Search would be aiming a camera the quiz is
    // driving, and the info panel names the country under it — which in several
    // modes IS the answer, the same reason `question-renderer.js:6` refuses to
    // reuse the vanilla panel. Fires only on the start/end flip, not per answer.
    useEffect(() => quizStore.onActiveChange((active: boolean) => {
        setQuizActive(active);
        if (active) setSelected(null);
    }), []);

    // Taps on the globe, and taps that hit nothing. Both are the bridge's to
    // report — this component never sees an engine object. A quiz owns the
    // globe while it runs, so its picks are answers and are not ours to read.
    useEffect(() => {
        if (!infoEnabled) { setSelected(null); return; }
        const offPick = handle.globe.onPick((name: string) => {
            if (!quizStore.isActive()) setSelected(name);
        });
        const offDeselect = handle.globe.onDeselect(() => setSelected(null));
        return () => { offPick(); offDeselect(); };
    }, [handle.globe, infoEnabled]);

    const row = selected ? handle.countries.byName(selected) : undefined;

    return (
        <>
            <button
                type="button"
                className="shell-gear"
                onClick={() => setOverlay(overlay === 'settings' ? null : 'settings')}
                aria-label="Settings"
                aria-expanded={overlay === 'settings'}
            >
                <Icon name="faders" size={20} />
            </button>

            {!quizActive && (
                <SearchBox
                    globe={handle.globe}
                    countries={handle.countries}
                    onSelect={(name) => setSelected(infoEnabled ? name : null)}
                />
            )}

            <WeakSpots
                globe={handle.globe}
                isoOf={(name) => handle.countries.byName(name)?.iso}
            />

            {/* Only when a sheet is not covering it: both dock to the same
                corner on mobile, and the panel is the less important of the
                two once the reader has deliberately opened settings. */}
            {row && infoEnabled && !overlay && !quizActive && (
                <CountryInfo
                    row={row}
                    onClose={() => {
                        setSelected(null);
                        handle.globe.clearSelection();
                    }}
                />
            )}

            {overlay === 'settings' && <SettingsSheet appearance={handle.appearance} />}
            {overlay === 'stats' && <StatsSheet />}
            {overlay === 'theme-lab' && (
                <Suspense fallback={null}>
                    <ThemeLab
                        appearance={handle.appearance}
                        onClose={() => setOverlay('settings')}
                    />
                </Suspense>
            )}

            {/* A quiz starting takes the screen; an open sheet under it would be
                unreachable and would still be there when the quiz ended. */}
            <OverlayCloserOnQuiz />
        </>
    );
}

/**
 * Close any open sheet when a quiz starts.
 *
 * Its own component so the subscription is not entangled with the rendering
 * above — and so it is obvious that this is the only place the two layers
 * interact.
 */
function OverlayCloserOnQuiz() {
    useEffect(() => {
        // Fires only on the start/end flip, not on every answered question —
        // see quizStore's own note on why that distinction exists.
        return quizStore.onActiveChange((active: boolean) => {
            if (active) closeOverlay();
        });
    }, []);
    return null;
}

