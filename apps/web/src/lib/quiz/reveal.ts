/**
 * How one answer option should look once the answer is in.
 *
 * Pure, and separate from the component, because this is the one piece of the
 * grid with a right answer worth testing: `gradeLocally` reports the grade as
 * three disjoint lists (`correctOptions`, `wrongPicks`, `missed`), and getting
 * the mapping wrong shows the player a green tick on the option they did not
 * choose. Everything else in `OptionGrid` is markup.
 */
import type { Reveal } from './useQuizSession';

export type CellState = '' | 'correct' | 'incorrect' | 'dimmed';

/**
 * @param value the option's value
 * @param reveal null while the question is still open — every cell is live
 */
export function cellState(value: string, reveal: Reveal | null): CellState {
    // No grade yet: nothing is right or wrong, and nothing should look it.
    if (!reveal) return '';
    // The right answer is always shown, whether or not it was picked. That is
    // the teaching moment, and it must win over `wrongPicks` for the case where
    // a player somehow picks the correct option and another.
    if (reveal.correctOptions.includes(value)) return 'correct';
    if (reveal.wrongPicks.includes(value)) return 'incorrect';
    // Everything untouched recedes, so the eye goes to the two cells that carry
    // the answer rather than to five equal boxes.
    return 'dimmed';
}
