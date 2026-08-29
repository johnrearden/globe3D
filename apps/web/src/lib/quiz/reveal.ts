/**
 * How one answer option should look once the answer is in.
 *
 * Pure, and separate from the component, because this is the one piece of the
 * grid with a right answer worth testing: a grade arrives as four overlapping
 * lists (`rightPicks`, `wrongPicks`, `missed`, `correctOptions`), and getting
 * the mapping wrong shows the player a green tick on the option they did not
 * choose. Everything else in `OptionGrid` is markup.
 *
 * The same shape comes from two places — `gradeLocally` for the practice
 * quizzes and the Daily Challenge's server response — which is why one function
 * serves both.
 */
import type { Reveal } from './useQuizSession';

export type CellState = '' | 'correct' | 'incorrect' | 'missed' | 'dimmed';

/**
 * @param value the option's value
 * @param reveal null while the question is still open — every cell is live
 * @param multiSelect changes what "a correct answer you did not pick" means.
 *   With several right answers the player needs to know WHICH ones they found,
 *   so an unpicked correct option gets its own cue. With one right answer there
 *   is nothing to distinguish, and showing the answer plainly as correct is the
 *   teaching moment — this is the vanilla app's distinction, kept deliberately.
 */
export function cellState(
    value: string,
    reveal: Reveal | null,
    multiSelect = false,
): CellState {
    // No grade yet: nothing is right or wrong, and nothing should look it.
    if (!reveal) return '';

    if (reveal.rightPicks?.includes(value)) return 'correct';
    if (reveal.wrongPicks?.includes(value)) return 'incorrect';
    if (reveal.missed?.includes(value)) return multiSelect ? 'missed' : 'correct';

    // Fallback for a grade that reports only the answer — the right answer is
    // always shown, whether or not it was picked.
    if (reveal.correctOptions?.includes(value)) return 'correct';

    // Everything untouched recedes, so the eye goes to the cells that carry the
    // answer rather than to five equal boxes.
    return 'dimmed';
}
