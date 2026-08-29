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
 *
 * `multiSelect` is the Daily Challenge's: several answers, toggled, then
 * submitted together. It is here rather than in a second grid component because
 * the two differ only in when the answer is sent — a single-select cell submits
 * on tap, a multi-select cell toggles and waits for the caller's Submit button.
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
    multiSelect = false,
    selected,
    reveal,
    onPick,
}: {
    options: Option[];
    cols: number;
    display?: string;
    reveal: Reveal | null;
    /** Several answers, toggled and submitted together (Daily Challenge). */
    multiSelect?: boolean;
    /** The current multi-select, owned by the caller alongside its Submit. */
    selected?: ReadonlySet<string>;
    /** One value in single-select; a toggle in multi-select. */
    onPick: (value: string) => void;
}) {
    return (
        <ul
            className={`qz-answers ${display === 'flag' ? 'qz-answers-flag' : ''}`}
            style={{ '--qz-cols': cols } as React.CSSProperties}
        >
            {options.map((option) => {
                const state = cellState(option.value, reveal, multiSelect);
                const isSelected = !reveal && !!selected?.has(option.value);
                return (
                    <li key={option.value}>
                        <button
                            type="button"
                            className={`quiz-option ${state} ${isSelected ? 'selected' : ''}`}
                            aria-pressed={multiSelect ? isSelected : undefined}
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
                            {state === 'missed' && (
                                <span className="qz-mark qz-mark-missed">
                                    <Icon name="plus" size={16} />
                                </span>
                            )}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
