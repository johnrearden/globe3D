/**
 * The Daily Challenge: the invite that offers it, and the panel that runs it.
 *
 * A sibling island to the quiz and the shell controls, and like both it renders
 * **nothing at build time** — there is no globe on the server, so it returns
 * null and Astro emits an empty island. The article a crawler sees is untouched.
 *
 * The flow lives in `useDailyAttempt`; this is what it looks like. The one piece
 * of orchestration kept here is registration, because it is a *dialog* the flow
 * has to await: `onNeedsName` returns a promise the hook holds while the player
 * fills the form in, so the board renders with their row already on it.
 *
 * The vanilla invite morphed into a docked pill with a FLIP transform animation
 * (`daily-quiz.js:_dock`). That is not carried over — it existed to move a
 * hand-built DOM node between two positions, and here the two states are just
 * two renders of the same component.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getGlobeHandle, onGlobeReady, type GlobeHandle } from '../../lib/globe';
import { getPanelSnap, setPanelSnap, type Snap } from '../../lib/panel';
import { getApi } from '../../lib/daily/api';
import { useDailyAttempt } from '../../lib/daily/useDailyAttempt';
import Icon from '../quiz/Icon';
import DailyQuestion from './DailyQuestion';
import Leaderboard from './Leaderboard';
import Onboarding from './Onboarding';

/** Resolves the pending `onNeedsName` promise once the player is done with it. */
type NameResolver = (() => void) | null;

export default function DailyLayer() {
    const [handle, setHandle] = useState<GlobeHandle | null>(getGlobeHandle);
    useEffect(() => onGlobeReady(setHandle), []);
    if (!handle) return null;
    return <DailyChallenge handle={handle} />;
}

function DailyChallenge({ handle }: { handle: GlobeHandle }) {
    const { globe, countries } = handle;

    /** null = not asking; a resolver = the form is up and the flow is waiting. */
    const [nameResolver, setNameResolver] = useState<NameResolver>(null);
    const [registered, setRegistered] = useState(true);
    const [dismissed, setDismissed] = useState(false);
    const [playedToday, setPlayedToday] = useState<boolean | null>(null);
    const priorSnap = useRef<Snap>('expanded');

    const onNeedsName = useCallback(async () => {
        const api = await getApi();
        setRegistered(api.isRegistered);
        if (api.isRegistered) return;
        // Hold the flow open until the form is answered either way. Declining is
        // fine — the board's own CTA offers another chance.
        await new Promise<void>((resolve) => setNameResolver(() => resolve));
    }, []);

    const attempt = useDailyAttempt({ globe, onNeedsName });
    const { phase } = attempt;
    const open = phase.k !== 'idle';

    // Has today already been played? Asked once, so the invite can say "see the
    // board" rather than "play" for someone coming back. A failure here is not
    // worth surfacing: the invite simply offers the challenge, and starting it
    // will report the real problem.
    useEffect(() => {
        let live = true;
        getApi()
            .then((api) => Promise.all([api.getToday(), api.isRegistered] as const))
            .then(([today, isRegistered]) => {
                if (!live) return;
                setPlayedToday(today.attempt?.status === 'completed');
                setRegistered(isRegistered);
            })
            .catch(() => { if (live) setPlayedToday(false); });
        return () => { live = false; };
    }, []);

    const start = useCallback(() => {
        priorSnap.current = getPanelSnap();
        // The globe is part of several daily questions, so the panel has to move.
        setPanelSnap('collapsed');
        void attempt.start();
    }, [attempt]);

    const close = useCallback(() => {
        attempt.close();
        setPanelSnap(priorSnap.current);
    }, [attempt]);

    // Escape closes, as it does for every surface in the app.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, close]);

    const finishNaming = useCallback((info?: { nickname: string; country: string }) => {
        const resolve = nameResolver;
        setNameResolver(null);
        if (!info) { resolve?.(); return; }
        void getApi()
            .then((api) => api.registerPlayer(info.nickname, info.country))
            .then(() => setRegistered(true))
            // A failed registration leaves them unregistered on purpose: the
            // board's CTA is then still offered, so they can simply try again.
            .catch(() => {})
            .finally(() => resolve?.());
    }, [nameResolver]);

    if (nameResolver) {
        return (
            <Onboarding
                countryNames={countries.all.map((c) => c.name)}
                onSubmit={finishNaming}
                onCancel={() => finishNaming()}
            />
        );
    }

    if (!open) {
        // Nothing to offer until we know whether today has been played — and
        // nothing to offer afterwards either, unless they finished anonymously
        // and might still want to put a name to it.
        if (playedToday === null) return null;
        if (playedToday && registered) return null;
        if (dismissed) {
            return (
                <button
                    type="button"
                    className="dq-pill"
                    onClick={start}
                    aria-label="Daily Challenge"
                >
                    <Icon name="calendar" size={18} />
                </button>
            );
        }
        return (
            <aside className="dq-invite">
                <p className="dq-invite-title">
                    {playedToday ? 'Add your name to today’s board' : 'Up for today’s challenge?'}
                </p>
                <p className="dq-invite-sub">
                    {playedToday
                        ? 'You played anonymously — claim your spot.'
                        : '10 questions against the world, once a day.'}
                </p>
                <button type="button" className="dq-invite-go" onClick={start}>
                    {playedToday ? 'See the board' : 'Start today’s challenge'}
                </button>
                <button
                    type="button"
                    className="dq-invite-later"
                    onClick={() => setDismissed(true)}
                >
                    Maybe later
                </button>
            </aside>
        );
    }

    return (
        <section className="dq-panel" aria-label="Daily Challenge">
            <header className="qz-bar">
                <p className="qz-progress-label">
                    {phase.k === 'question' || phase.k === 'revealed'
                        ? `Question ${attempt.index + 1} of ${attempt.total}`
                        : 'Daily Challenge'}
                </p>
                <div className="qz-chips">
                    <span className="qz-stat">
                        <Icon name="checkCircle" size={16} />
                        {attempt.score}
                    </span>
                </div>
                <button type="button" className="qz-close" onClick={close} aria-label="Close">
                    <Icon name="x" size={18} />
                </button>
            </header>

            {attempt.total > 0 && (
                <progress className="qz-progress" max={attempt.total} value={attempt.index}>
                    {attempt.index} of {attempt.total}
                </progress>
            )}

            {phase.k === 'loading' && <p className="sheet-empty">Loading today’s challenge…</p>}

            {phase.k === 'error' && (
                <>
                    <p className="dq-message">{phase.text}</p>
                    <button type="button" className="sheet-dismiss" onClick={close}>
                        Back to the globe
                    </button>
                </>
            )}

            {(phase.k === 'question' || phase.k === 'revealed') && (
                <DailyQuestion
                    question={phase.question}
                    reveal={phase.k === 'revealed' ? phase.reveal : null}
                    isLast={phase.k === 'revealed' && phase.done}
                    globe={globe}
                    onAnswer={(given) => void attempt.answer(given)}
                    onNext={() => void attempt.next()}
                />
            )}

            {phase.k === 'leaderboard' && (
                <Leaderboard
                    data={phase.data}
                    message={phase.message}
                    canRegister={!registered}
                    onRegister={() => {
                        void onNeedsName().then(() => attempt.refreshLeaderboard(phase.message));
                    }}
                    onDismiss={close}
                />
            )}
        </section>
    );
}
