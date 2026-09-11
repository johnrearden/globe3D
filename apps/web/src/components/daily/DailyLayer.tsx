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
import { getPanelSnap, setPanelSnap, onPanelSnapChange, type Snap } from '../../lib/panel';
import { getApi } from '../../lib/daily/api';
import { useDailyAttempt } from '../../lib/daily/useDailyAttempt';
import Icon from '../quiz/Icon';
import DailyQuestion from './DailyQuestion';
import Leaderboard from './Leaderboard';
import Onboarding from './Onboarding';

/** Resolves the pending `onNeedsName` promise once the player is done with it. */
type NameResolver = (() => void) | null;

/**
 * On a phone the invite is one line — a question and two words — and it waits.
 *
 * The globe is the application, and on a phone it has half the screen; a card
 * over it the moment the mesh lands is an interruption, not an offer. So the
 * compact invite appears INVITE_DELAY_MS after the globe is ready (this
 * component mounts on `onGlobeReady`, so the delay counts from the load
 * completing), and sits just above the panel's top edge — measured from the
 * live rect, so it follows the sheet at 50vh on the apex, 88vh on an article
 * and the grip when collapsed — in the sky under the globe rather than on it.
 * The desktop card is unchanged: there it sits in a free corner.
 *
 * The breakpoint is the shell's (`shell.css`, 899px); a reading here that
 * disagreed with the stylesheet would put the pill in a layout it was not
 * designed for.
 */
const COMPACT_QUERY = '(max-width: 899px)';
export const INVITE_DELAY_MS = 5000;

function useCompact(): boolean {
    const [compact, setCompact] = useState(() =>
        typeof window !== 'undefined' && window.matchMedia(COMPACT_QUERY).matches);
    useEffect(() => {
        const mq = window.matchMedia(COMPACT_QUERY);
        const onChange = () => setCompact(mq.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);
    return compact;
}

/** True once INVITE_DELAY_MS has passed since mount, i.e. since the globe was ready. */
function useWaited(): boolean {
    const [waited, setWaited] = useState(false);
    useEffect(() => {
        const t = window.setTimeout(() => setWaited(true), INVITE_DELAY_MS);
        return () => window.clearTimeout(t);
    }, []);
    return waited;
}

/** Pixels from the viewport bottom to the panel sheet's top edge, kept current. */
function useSheetClearance(): number {
    const measure = () => {
        const sheet = document.querySelector('.panel-sheet');
        return sheet ? Math.max(0, window.innerHeight - sheet.getBoundingClientRect().top) : 0;
    };
    const [clearance, setClearance] = useState(0);
    useEffect(() => {
        const update = () => setClearance(measure());
        update();
        // The sheet animates for 260ms after a snap; measure once it has landed.
        const offSnap = onPanelSnapChange(() => { window.setTimeout(update, 300); });
        window.addEventListener('resize', update);
        return () => { offSnap(); window.removeEventListener('resize', update); };
    }, []);
    return clearance;
}

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
    const compact = useCompact();
    const waited = useWaited();
    const clearance = useSheetClearance();

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
        if (compact) {
            if (!waited) return null;
            return (
                <aside
                    className="dq-invite dq-invite--compact"
                    style={{ '--dq-invite-bottom': `${clearance}px` } as React.CSSProperties}
                >
                    <p className="dq-invite-title">
                        {playedToday ? 'Add your name to today’s board?' : 'Ready for today’s 10 questions?'}
                    </p>
                    <button type="button" className="dq-invite-go" onClick={start}>Go</button>
                    <button type="button" className="dq-invite-later" onClick={() => setDismissed(true)}>
                        Later
                    </button>
                </aside>
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
