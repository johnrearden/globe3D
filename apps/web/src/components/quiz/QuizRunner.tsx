/**
 * Runs a quiz — any of the four.
 *
 * The globe comes from `payload.map`, the grid from `payload.grid`, and what
 * remains per-mode is the table in `lib/quiz/specs.ts`. So this is the whole
 * question loop for every mode, and adding a fifth means adding a spec rather
 * than another component.
 *
 * Mounted with a `key` of mode+scope by QuizLayer, so choosing a different quiz
 * unmounts this and mounts a fresh one. That is what makes `useQuizSession`'s
 * build-once `useMemo` correct rather than a lie.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
    useQuizSession,
    type BestSummary,
    type SessionState,
} from '../../lib/quiz/useQuizSession';
import { useElapsed } from '../../lib/quiz/useElapsed';
import { MODE_SPECS } from '../../lib/quiz/specs';
import {
    applyMapBlock,
    releaseGlobe,
    revealMarkerLabel,
} from '../../lib/quiz/globe-choreography';
import type { GlobeHandle } from '../../lib/globe';
import type { ModeId, Scope } from '../../lib/quiz/modes';
import { toThreeHex } from '@terragotcha/design-tokens';
import { cssToken } from '../../../../../js/utils/theme.js';
import QuestionChrome from './QuestionChrome';
import OptionGrid from './OptionGrid';
import FlagStage from './FlagStage';

/** How long the right/wrong overlay sits on the answered country. */
const FLASH_MS = 1200;

/**
 * The reveal colours, read from the tokens rather than written here.
 *
 * `--status-correct` and `--status-incorrect` are deliberately FIXED tokens, not
 * theme knobs: red/green is the most common colour-vision deficiency and a theme
 * must not be able to break comprehension. Reading them keeps the globe flash
 * and the answer grid the same two colours — WebGL takes a number, CSS takes a
 * string, and this is the one conversion between them.
 *
 * Read lazily, on first use: `getComputedStyle` needs the stylesheet applied,
 * and a module-scope constant would evaluate before that on some paths.
 */
function statusHex(token: '--status-correct' | '--status-incorrect'): number {
    return toThreeHex(cssToken(token, '#808080'));
}

export default function QuizRunner({
    mode,
    scope,
    handle,
    onFinished,
    onCancel,
}: {
    mode: ModeId;
    scope: Scope;
    handle: GlobeHandle;
    onFinished: (state: SessionState, durationMs: number, best: BestSummary | null) => void;
    onCancel: () => void;
}) {
    const spec = MODE_SPECS[mode];
    const { globe, countries } = handle;

    // Planned once, with the session. A re-plan mid-quiz would silently reshuffle
    // the remaining questions.
    const plan = useMemo(() => spec.plan(countries.all, scope), [spec, countries, scope]);

    const session = useQuizSession({
        mode,
        scope,
        countries: countries.all,
        nextQuestion: plan.nextQuestion,
        total: plan.total,
        // Reported from the hook rather than from an effect watching `status`:
        // the personal-best summary exists only at the moment history is
        // written, and an effect would run a render too early to see it.
        onComplete: onFinished,
    });
    const { state } = session;
    const question = state.current;

    // Frozen at completion so the last tick and the results screen agree.
    const elapsedMs = useElapsed(state.status !== 'complete');

    // The globe is the quiz's for its duration: no idle drift underneath a
    // question, and it goes back exactly as it was on the way out.
    useEffect(() => {
        globe.setAutoRotateAllowed(false);
        return () => releaseGlobe(globe);
    }, [globe]);

    // Point the globe at the current question. Skipped entirely for the flag
    // mode, whose questions carry no map block — calling this with null would
    // still reset the view on every question for no reason.
    useEffect(() => {
        if (!spec.usesGlobe || !question) return;
        applyMapBlock(globe, question.payload.map);
    }, [globe, spec.usesGlobe, question]);

    // The reveal, on the globe: flash the subject, and name the capital marker
    // the question deliberately left anonymous.
    useEffect(() => {
        if (state.status !== 'revealed' || !question || !spec.usesGlobe) return;
        const subject = question.meta.country;
        globe.flash(
            subject,
            statusHex(state.reveal?.correct ? '--status-correct' : '--status-incorrect'),
            FLASH_MS,
        );
        if (question.payload.map?.marker) {
            revealMarkerLabel(globe, question.answer.correct[0]);
        }
        // A find-the-country question never showed its target, so show it now.
        if (spec.answerFrom === 'globe') globe.focusCountry(subject, { quizFraming: true });
    }, [state.status, state.reveal, question, globe, spec]);

    // A tap on the globe is the answer in find-the-country. Subscribed for the
    // whole session rather than per question, because `onPick` returns an
    // unsubscribe and re-subscribing every question would drop taps in the gap.
    const answerRef = useRef(session.answer);
    answerRef.current = session.answer;
    useEffect(() => {
        if (spec.answerFrom !== 'globe') return;
        return globe.onPick((name) => answerRef.current(name));
    }, [globe, spec.answerFrom]);

    const close = useCallback(() => {
        session.cancel();
        onCancel();
    }, [session, onCancel]);

    // Between questions — the session has been created but the first question
    // has not landed, or the pool ran dry. Nothing to draw.
    if (!question || state.status === 'complete') return null;

    const grid = question.payload.grid;

    return (
        <QuestionChrome
            variant={spec.usesGlobe ? 'floating' : 'fullscreen'}
            index={state.index}
            total={state.plannedTotal}
            score={state.score}
            answered={state.answered}
            elapsedMs={elapsedMs}
            eyebrow={spec.eyebrow(question)}
            prompt={question.payload.prompt}
            onClose={close}
        >
            {question.payload.flag && (
                <FlagStage
                    // Remount per question: the stage loads one texture and the
                    // effect keys on the iso, so a shared instance would have to
                    // hand-manage swapping meshes mid-animation.
                    key={question.payload.flag.iso}
                    iso={question.payload.flag.iso}
                    label="The flag to identify"
                />
            )}

            {grid && (
                <OptionGrid
                    options={grid.options}
                    cols={grid.cols}
                    display={grid.display}
                    reveal={state.reveal}
                    onPick={session.answer}
                />
            )}

            {state.status === 'revealed' && (
                <button type="button" className="qz-next" onClick={session.advance} autoFocus>
                    {state.index + 1 >= state.plannedTotal ? 'See your score' : 'Next question'}
                </button>
            )}
        </QuestionChrome>
    );
}
