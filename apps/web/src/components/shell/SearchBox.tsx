/**
 * Find a country by name and fly to it.
 *
 * A rewrite of `js/features/search.js`, not a port. The old one was a text input
 * whose results were rebuilt with `innerHTML` on every keystroke and whose
 * visibility was toggled by five other modules writing to its `style.display`.
 * Here it is a combobox that owns its own state and hides itself by reading
 * `quizStore`.
 *
 * ## What changed, and why
 *
 * **It is a real combobox.** The original had no label, no roles, no
 * `aria-activedescendant`, and marked the cursor with an inline background
 * colour — so a screen reader was told nothing at all. Search is the one control
 * in the app a keyboard user is most likely to reach for.
 *
 * **Arrow keys no longer overwrite what you typed.** `search.js:144-155` wrote
 * the highlighted country's name into the input, so arrowing past your query
 * destroyed it with no way back. The cursor is separate state here.
 *
 * **Matching moved out.** Diacritic folding and prefix-first ranking — the two
 * things the old implementation got wrong — are in `lib/search.ts`, pure and
 * tested. This file is the input, the listbox and the three bridge calls.
 *
 * **It starts as a button.** The globe is the application; a text field across
 * the top of it on a phone was chrome over the subject. So search is a round
 * toggle beside the gear, the same size and look, and the field appears only
 * when it is pressed — focused at once, so one tap starts typing. It closes on
 * a choice, on Escape with nothing typed, on the toggle, or when focus leaves it
 * with nothing typed; a typed query survives a stray tap elsewhere.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildIndex, rank, resolveEnter } from '../../lib/search';
import type { CountryTable } from '../../lib/globe';
import type { GlobeBridge } from '../../lib/globe-types';
import Icon from '../quiz/Icon';

export default function SearchBox({
    globe,
    countries,
    onSelect,
}: {
    globe: GlobeBridge;
    countries: CountryTable;
    /** Told what was chosen, so the info panel can open on it. */
    onSelect?: (name: string) => void;
}) {
    const [term, setTerm] = useState('');
    const [cursor, setCursor] = useState(-1);
    const [open, setOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus the field the moment it appears: the toggle press is the user
    // gesture, so the mobile keyboard is allowed to come up on it.
    useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

    const close = useCallback(() => { setTerm(''); setOpen(false); }, []);

    const entries = useMemo(
        () => buildIndex(countries.all.map((c) => c.name)),
        [countries],
    );

    const results = useMemo(() => rank(entries, term), [entries, term]);

    // A new query invalidates the cursor. Kept as an effect rather than folded
    // into the change handler so it also covers Escape and a programmatic clear.
    useEffect(() => setCursor(-1), [term]);

    const choose = useCallback((name: string) => {
        // The order the bridge docs bless and WeakSpots already uses: clear the
        // last selection (which also drops the small-country indicator), then
        // highlight, then fly. Selecting before clearing leaves a stale marker
        // riding along through the flight — the bug the vanilla search had.
        globe.clearSelection();
        globe.highlight(name);
        globe.focusCountry(name);
        close();
        onSelect?.(name);
        inputRef.current?.blur();
    }, [globe, onSelect, close]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            // Clear if there is something to clear, otherwise close the field
            // and let the press reach whatever else is listening.
            e.preventDefault();
            if (term) setTerm(''); else close();
            return;
        }
        if (!results.length) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setCursor((c) => (c + 1) % results.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setCursor((c) => (c <= 0 ? results.length - 1 : c - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const pick = resolveEnter(results, term, cursor);
            if (pick) choose(pick);
        }
    };

    const listOpen = results.length > 0;

    return (
        <div
            className="cs-box"
            data-open={open ? 'true' : 'false'}
            // Focus leaving the whole box with nothing typed puts the button
            // back; a query in progress is kept, since a stray tap on the globe
            // should not cost the reader what they typed.
            onBlur={(e) => {
                if (!term && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
            }}
        >
            <div className="cs-row">
                <button
                    type="button"
                    className="shell-btn cs-toggle"
                    onClick={() => (open ? close() : setOpen(true))}
                    aria-label={open ? 'Close search' : 'Search countries'}
                    aria-expanded={open}
                    aria-controls="cs-field"
                >
                    <Icon name="search" size={20} />
                </button>
                {open && (
                <div className="cs-field" id="cs-field">
                <input
                    ref={inputRef}
                    type="text"
                    className="cs-input"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Search countries…"
                    aria-label="Search countries"
                    autoComplete="off"
                    spellCheck={false}
                    role="combobox"
                    aria-expanded={listOpen}
                    aria-controls="cs-results"
                    aria-autocomplete="list"
                    aria-activedescendant={
                        cursor >= 0 ? `cs-option-${cursor}` : undefined}
                />
                {term && (
                    <button
                        type="button"
                        className="cs-clear"
                        onClick={() => { setTerm(''); inputRef.current?.focus(); }}
                        aria-label="Clear search"
                    >
                        <Icon name="x" size={14} />
                    </button>
                )}
                </div>
                )}
            </div>

            {open && term.trim() && (
                <ul className="cs-results" id="cs-results" role="listbox" aria-label="Countries">
                    {results.map((name, i) => (
                        <li key={name} id={`cs-option-${i}`} role="option" aria-selected={i === cursor}>
                            <button
                                type="button"
                                className={`cs-result${i === cursor ? ' cs-cursor' : ''}`}
                                // onMouseDown, not onClick: the input's blur would
                                // otherwise fire first and unmount the row before
                                // the click landed on it.
                                onMouseDown={(e) => { e.preventDefault(); choose(name); }}
                            >
                                {name}
                            </button>
                        </li>
                    ))}
                    {!results.length && <li className="cs-empty">No countries match</li>}
                </ul>
            )}
        </div>
    );
}
