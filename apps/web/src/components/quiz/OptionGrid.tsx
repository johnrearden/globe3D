/**
 * The answer grid — one component for all three pick-an-option modes.
 *
 * It renders `payload.grid` and colours itself from `reveal`, both of which come
 * straight from quiz-core (`singleChoicePayload` and `gradeLocally`). Nothing
 * here decides what is right; it is told.
 *
 * `display: 'flag'` swaps the label for flag art. That is the reverse
 * identify-the-flag question — "which of these flags is Peru's" — and it is the
 * only difference between the three modes' grids, which is why there is one
 * component rather than three.
 */
import Icon from './Icon';
import { cellState } from '../../lib/quiz/reveal';
import type { Reveal } from '../../lib/quiz/useQuizSession';

export interface Option {
    value: string;
    label: string;
    iso: string | null;
}

/**
 * Flag art. `flagcdn` is the same source the vanilla app used, at the same
 * width — a cached URL either way.
 */
const flagSrc = (iso: string) => `https://flagcdn.com/w320/${iso.toLowerCase()}.png`;

export default function OptionGrid({
    options,
    cols,
    display = 'name',
    reveal,
    onPick,
}: {
    options: Option[];
    cols: number;
    display?: string;
    reveal: Reveal | null;
    onPick: (value: string) => void;
}) {
    return (
        <ul
            className={`qz-answers ${display === 'flag' ? 'qz-answers-flag' : ''}`}
            style={{ '--qz-cols': cols } as React.CSSProperties}
        >
            {options.map((option) => {
                const state = cellState(option.value, reveal);
                return (
                    <li key={option.value}>
                        <button
                            type="button"
                            className={`quiz-option ${state}`}
                            // After the reveal the grid is a display, not a
                            // control: disabling it is what stops a second
                            // answer, rather than a flag the handler checks.
                            disabled={!!reveal}
                            onClick={() => onPick(option.value)}
                        >
                            {display === 'flag' && option.iso ? (
                                <img
                                    src={flagSrc(option.iso)}
                                    alt={option.label}
                                    loading="lazy"
                                    width={320}
                                    height={213}
                                />
                            ) : (
                                <span>{option.label}</span>
                            )}

                            {state === 'correct' && (
                                <span className="qz-mark qz-mark-correct">
                                    <Icon name="check" size={16} />
                                </span>
                            )}
                            {state === 'incorrect' && (
                                <span className="qz-mark qz-mark-wrong">
                                    <Icon name="x" size={16} />
                                </span>
                            )}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
