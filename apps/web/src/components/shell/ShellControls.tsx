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
import { useEffect, useState } from 'react';
import { quizStore } from '@terragotcha/quiz-core';
import { getGlobeHandle, onGlobeReady, type GlobeHandle } from '../../lib/globe';
import {
    closeOverlay,
    getOverlay,
    onOverlayChange,
    setOverlay,
    type OverlayName,
} from '../../lib/overlay';
import Icon from '../quiz/Icon';
import SettingsSheet from './SettingsSheet';
import StatsSheet from './StatsSheet';
import WeakSpots from './WeakSpots';

export default function ShellControls() {
    const [handle, setHandle] = useState<GlobeHandle | null>(getGlobeHandle);
    const [overlay, setOpen] = useState<OverlayName | null>(getOverlay);

    useEffect(() => onGlobeReady(setHandle), []);
    useEffect(() => onOverlayChange(setOpen), []);

    // Nothing here can do anything useful without a globe to act on.
    if (!handle) return null;

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

            <WeakSpots
                globe={handle.globe}
                isoOf={(name) => handle.countries.byName(name)?.iso}
            />

            {overlay === 'settings' && <SettingsSheet appearance={handle.appearance} />}
            {overlay === 'stats' && <StatsSheet />}

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
