/**
 * One Daily Challenge question: the prompt, whatever it needs to be answered,
 * and the reveal.
 *
 * Four answer methods, and the difference between them is where the answer
 * comes from rather than how the question looks:
 *
 *   grid-single      tap a cell — the tap is the answer
 *   grid-multi       toggle cells, then Submit
 *   map-click-*      tap the globe; no Submit, and no grid at all
 *
 * The grid is `OptionGrid`, shared with the practice quizzes, because the
 * server's reveal has the same shape as `gradeLocally`'s. `multiSelect` is what
 * makes an unpicked right answer read as "missed" rather than simply "correct":
 * with several right answers the player needs to know which ones they found.
 */
import { useEffect, useMemo, useState } from 'react';
import OptionGrid from '../quiz/OptionGrid';
import { isMapClick } from '../../lib/daily/server-map';
import type { GlobeBridge } from '../../lib/globe-types';
import type { DailyQuestion as Question, DailyReveal } from '../../lib/daily/types';

export default function DailyQuestion({
    question,
    reveal,
    isLast,
    globe,
    onAnswer,
    onNext,
}: {
    question: Question;
    /** Null while the question is still open. */
    reveal: DailyReveal | null;
    isLast: boolean;
    globe: GlobeBridge;
    onAnswer: (given: string | string[]) => void;
    onNext: () => void;
}) {
    const mapClick = isMapClick(question);
    const multi = !!question.grid?.multiSelect;
    const [selected, setSelected] = useState<Set<string>>(new Set());

    // A new question is a new selection. Keyed on index rather than identity
    // because the server may legitimately repeat a question object's contents.
    useEffect(() => setSelected(new Set()), [question.index]);

    // A tap on the globe IS the answer. Subscribed only while the question is
    // open, so a stale handler cannot swallow a tap on the reveal.
    useEffect(() => {
        if (!mapClick || reveal) return;
        return globe.onPick((name) => {
            globe.highlight(name);
            onAnswer(name);
        });
    }, [mapClick, reveal, globe, onAnswer]);

    const options = useMemo(
        () => (question.grid?.options ?? []).map((o) => ({
            value: o.value,
            label: o.label ?? o.value,
            iso: null,
        })),
        [question.grid],
    );

    const toggle = (value: string) => {
        if (!multi) { onAnswer(value); return; }
        setSelected((prev) => {
            const next = new Set(prev);
            if (!next.delete(value)) next.add(value);
            return next;
        });
    };

    return (
        <>
            <div className="qz-prompt">
                <p className="qz-main">{question.prompt}</p>
            </div>

            {question.flag && (
                <img
                    className="dq-flag-hero"
                    src={`https://flagcdn.com/w320/${question.flag.toLowerCase()}.png`}
                    alt="The flag in question"
                    width={320}
                    height={213}
                />
            )}

            {mapClick && !reveal && (
                <p className="dq-hint">Drag to spin the globe, then tap the country.</p>
            )}

            {question.grid && (
                <OptionGrid
                    options={options}
                    cols={question.grid.cols ?? 2}
                    display={question.grid.display}
                    multiSelect={multi}
                    selected={selected}
                    reveal={reveal}
                    onPick={toggle}
                />
            )}

            {multi && !reveal && (
                <button
                    type="button"
                    className="qz-next"
                    disabled={selected.size === 0}
                    onClick={() => onAnswer([...selected])}
                >
                    {selected.size ? `Submit (${selected.size})` : 'Submit'}
                </button>
            )}

            {reveal && (
                <>
                    <p className={`dq-feedback ${reveal.correct ? 'correct' : 'wrong'}`}>
                        {reveal.correct
                            ? 'Correct!'
                            : question.grid
                                ? 'Not quite — the answer is highlighted.'
                                : `Answer: ${(reveal.correctOptions ?? []).join(', ')}`}
                    </p>
                    <button type="button" className="qz-next" onClick={onNext} autoFocus>
                        {isLast ? 'See results' : 'Next'}
                    </button>
                </>
            )}
        </>
    );
}
