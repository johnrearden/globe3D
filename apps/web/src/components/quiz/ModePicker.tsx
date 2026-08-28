/**
 * Choose a quiz: which mode, and over what.
 *
 * A rewrite of `js/features/quiz/quiz-mode-picker.js` (278 lines of
 * `document.createElement` and `classList` juggling), not a port. The data it
 * renders — the modes and the regions — moved to `lib/quiz/modes.ts`, so what
 * is left here really is only the sheet.
 *
 * It is a real `<dialog>`-shaped overlay built from buttons, so keyboard and
 * screen-reader behaviour comes from the elements rather than from ARIA bolted
 * onto divs. The scope control is a radio group in fact as well as in look: the
 * vanilla version used styled buttons, which arrow keys did nothing for.
 */
import { useState } from 'react';
import Icon from './Icon';
import { QUIZ_MODES, REGIONS, type ModeId, type Scope } from '../../lib/quiz/modes';

export default function ModePicker({
    onStart,
    onCancel,
}: {
    onStart: (choice: { mode: ModeId; scope: Scope }) => void;
    onCancel: () => void;
}) {
    // 'globe' or a region. Held here rather than in a store because it dies with
    // the sheet — the chosen scope reaches the quiz through onStart.
    const [scope, setScope] = useState<Scope>('globe');

    return (
        <div className="qmp" role="dialog" aria-modal="true" aria-labelledby="qmp-heading">
            {/* A click on the backdrop cancels, the same as Escape. It is a
                button rather than a div with a handler so that is true for the
                keyboard too. */}
            <button type="button" className="qmp-scrim" onClick={onCancel} aria-label="Close" />

            <div className="qmp-sheet">
                <div className="qmp-grabber" aria-hidden="true" />
                <h2 id="qmp-heading">Take a quiz</h2>

                <fieldset className="qmp-scope">
                    <legend>Where in the world?</legend>
                    <div className="qmp-segmented">
                        {(['globe', ...REGIONS] as Scope[]).map((s) => (
                            <label key={s} className="qmp-segment">
                                <input
                                    type="radio"
                                    name="quiz-scope"
                                    value={s}
                                    checked={scope === s}
                                    onChange={() => setScope(s)}
                                />
                                <span>{s === 'globe' ? 'Whole globe' : s}</span>
                            </label>
                        ))}
                    </div>
                </fieldset>

                <ul className="qmp-cards">
                    {QUIZ_MODES.map((mode) => (
                        <li key={mode.id}>
                            <button
                                type="button"
                                className="qmp-card"
                                onClick={() => onStart({ mode: mode.id, scope })}
                            >
                                <span className="qmp-card-icon">
                                    <Icon name={mode.icon} size={28} />
                                </span>
                                <span className="qmp-card-text">
                                    <span className="qmp-card-title">{mode.title}</span>
                                    <span className="qmp-card-desc">{mode.description}</span>
                                </span>
                                <Icon name="arrowRight" size={20} className="qmp-card-go" />
                            </button>
                        </li>
                    ))}
                </ul>

                <button type="button" className="qmp-cancel" onClick={onCancel}>
                    Not now
                </button>
            </div>
        </div>
    );
}
