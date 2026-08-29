/**
 * "Join the leaderboard" — nickname and home country.
 *
 * Shown **after** a completed run, never before it. The vanilla app moved it
 * there deliberately: opening a game with a form is how you lose the player who
 * only wanted to see what it was. Their finished attempt is already tied to this
 * device's anonymous row, so registering just names it.
 *
 * Cancelling is a normal outcome, not a failure — the board keeps offering the
 * CTA, so a player can claim their spot later the same day.
 */
import { useMemo, useState } from 'react';
import { countryData } from '../../../../../js/data/country-data.js';

/** ISO-2 region codes from the browser's locales, most-preferred first. */
function localeRegions(): string[] {
    const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
    const codes: string[] = [];
    for (const tag of tags) {
        if (!tag) continue;
        try {
            const region = new Intl.Locale(tag).region;
            if (region) codes.push(region.toLowerCase());
        } catch {
            // Malformed tag. Not worth reporting — it just means one fewer guess.
        }
    }
    return codes;
}

/**
 * Best guess at the player's country, so the common case is one tap.
 *
 * Tried by ISO code first because that is exact; the English-name match is a
 * fallback for regions the globe's data keys differently.
 */
function guessCountry(names: string[]): string {
    const codes = localeRegions();
    if (!codes.length) return '';

    const byIso = new Map<string, string>();
    for (const name of names) {
        const iso = (countryData as Record<string, { iso?: string }>)[name]?.iso;
        if (iso && !byIso.has(iso)) byIso.set(iso, name);
    }
    for (const code of codes) {
        const hit = byIso.get(code);
        if (hit) return hit;
    }

    try {
        const display = new Intl.DisplayNames(['en'], { type: 'region' });
        const byLower = new Map(names.map((n) => [n.toLowerCase(), n]));
        for (const code of codes) {
            const english = display.of(code.toUpperCase())?.toLowerCase();
            const hit = english && byLower.get(english);
            if (hit) return hit;
        }
    } catch {
        // Intl.DisplayNames unsupported. The dropdown still works unguessed.
    }
    return '';
}

export default function Onboarding({
    countryNames,
    existing,
    onSubmit,
    onCancel,
}: {
    countryNames: string[];
    existing?: { nickname?: string; country?: string };
    onSubmit: (info: { nickname: string; country: string }) => void;
    onCancel: () => void;
}) {
    const [nickname, setNickname] = useState(existing?.nickname ?? '');
    const [country, setCountry] = useState(
        () => existing?.country || guessCountry(countryNames),
    );
    const sorted = useMemo(() => [...countryNames].sort(), [countryNames]);
    const canSubmit = nickname.trim().length > 0 && country.length > 0;

    return (
        <div className="sheet-overlay" role="dialog" aria-modal="true" aria-labelledby="dq-join">
            <button type="button" className="sheet-scrim" onClick={onCancel} aria-label="Not now" />
            <form
                className="sheet"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (canSubmit) onSubmit({ nickname: nickname.trim(), country });
                }}
            >
                <h2 id="dq-join" className="sheet-title">Join the leaderboard</h2>
                <p className="dq-join-lede">
                    Add a name so today’s score shows up on the board.
                </p>

                <label className="ctl-row dq-field">
                    <span className="ctl-label">Name</span>
                    <input
                        type="text"
                        value={nickname}
                        maxLength={24}
                        autoComplete="nickname"
                        onChange={(e) => setNickname(e.currentTarget.value)}
                        /* The first thing to do here, so a keyboard user does not
                           tab past the only field that needs filling in. */
                        autoFocus
                    />
                </label>

                <label className="ctl-row dq-field">
                    <span className="ctl-label">Country</span>
                    <select value={country} onChange={(e) => setCountry(e.currentTarget.value)}>
                        <option value="">Choose…</option>
                        {sorted.map((name) => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                </label>

                <button type="submit" className="ctl-button dq-join-submit" disabled={!canSubmit}>
                    Save
                </button>
                <button type="button" className="sheet-dismiss" onClick={onCancel}>
                    Not now
                </button>
            </form>
        </div>
    );
}
