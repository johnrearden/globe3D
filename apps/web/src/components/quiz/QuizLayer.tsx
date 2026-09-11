/**
 * The quiz, as a layer over whatever route is on screen.
 *
 * A quiz is not a route: it does not change the URL, it is not linkable, and a
 * crawler must never see one. So this is an island that renders **nothing at
 * build time** and, until the reader asks for a quiz, nothing but a launch
 * button afterwards. The article underneath is untouched static markup
 * throughout, which is the invariant the whole `apps/web` effort exists to hold.
 *
 * It replaces `BackButtonGuard` (`js/features/back-button-guard.js`) rather than
 * porting it. That module watched `document.body`'s class attribute with a
 * MutationObserver to notice a quiz starting, because in the vanilla app there
 * was no other signal it could reach. Here the component that starts the quiz
 * pushes the guard entry itself.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getGlobeHandle, onGlobeReady, type GlobeHandle } from '../../lib/globe';
import { getPanelSnap, setPanelSnap, type Snap } from '../../lib/panel';
import { useCompact } from '../../lib/compact';
import { QUIZ_MODES, type ModeId, type Scope } from '../../lib/quiz/modes';
import type { BestSummary, SessionState } from '../../lib/quiz/useQuizSession';
import Icon from './Icon';
import ModePicker from './ModePicker';
import QuizRunner from './QuizRunner';
import ResultsScreen from './ResultsScreen';

type Choice = { mode: ModeId; scope: Scope };
type Finished = {
    choice: Choice;
    state: SessionState;
    durationMs: number;
    best: BestSummary | null;
};

export default function QuizLayer() {
    const [globe, setGlobe] = useState<GlobeHandle | null>(getGlobeHandle);
    const [picking, setPicking] = useState(false);
    // Hooks before any early return: the launcher's phone label reads this.
    const compact = useCompact();
    const [choice, setChoice] = useState<Choice | null>(null);
    const [finished, setFinished] = useState<Finished | null>(null);

    // What the panel was doing before the quiz, so ending one puts the reader
    // back where they were rather than somewhere arbitrary.
    const priorSnap = useRef<Snap>('expanded');

    useEffect(() => onGlobeReady(setGlobe), []);

    const start = useCallback((next: Choice) => {
        priorSnap.current = getPanelSnap();
        // The globe is the question in three of the four modes, so the panel has
        // to move. GlobeIsland re-frames off this same signal, so nothing here
        // needs to know where the globe should go.
        setPanelSnap('collapsed');
        setPicking(false);
        setFinished(null);
        setChoice(next);
        // The guard entry. Back now means "leave the quiz", not "leave the page"
        // — on a country page the reader would otherwise be thrown out of an
        // article they never navigated away from. AppRouter ignores this entry:
        // it carries no route, so its popstate handler resolves the same route
        // and returns.
        history.pushState({ quizGuard: true }, '', location.href);
    }, []);

    const leave = useCallback(() => {
        setChoice(null);
        setFinished(null);
        setPicking(false);
        setPanelSnap(priorSnap.current);
    }, []);

    // Back cancels the quiz instead of navigating.
    useEffect(() => {
        if (!choice && !finished) return;
        const onPop = () => leave();
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, [choice, finished, leave]);

    const onFinished = useCallback(
        (state: SessionState, durationMs: number, best: BestSummary | null) => {
            if (!choice) return;
            setFinished({ choice, state, durationMs, best });
            setChoice(null);
        },
        [choice],
    );

    if (!globe) return null;   // No globe yet: nothing here can run.

    if (finished) {
        const name = QUIZ_MODES.find((m) => m.id === finished.choice.mode)?.title ?? 'Quiz';
        return (
            <ResultsScreen
                score={finished.state.score}
                total={finished.state.answered}
                durationMs={finished.durationMs}
                quizName={name}
                scope={finished.choice.scope}
                best={finished.best}
                onPlayAgain={() => start(finished.choice)}
                onChooseQuiz={() => { setFinished(null); setPicking(true); }}
                onGlobe={leave}
            />
        );
    }

    if (choice) {
        return (
            <QuizRunner
                // Remounts on a new choice, which is what makes the session
                // build-once rather than accidentally shared between quizzes.
                key={`${choice.mode}:${choice.scope}`}
                mode={choice.mode}
                scope={choice.scope}
                handle={globe}
                onFinished={onFinished}
                onCancel={leave}
            />
        );
    }

    if (picking) {
        return <ModePicker onStart={start} onCancel={() => setPicking(false)} />;
    }

    return (
        <button type="button" className="qz-launch" onClick={() => setPicking(true)}>
            <Icon name="globe" size={22} />
            {compact ? (
                // One short label in the phone's top row (shell.css seats it).
                <span className="qz-launch-title">Quiz me</span>
            ) : (
                <span className="qz-launch-text">
                    <span className="qz-launch-title">Quiz me</span>
                    <span className="qz-launch-sub">10 questions</span>
                </span>
            )}
        </button>
    );
}
