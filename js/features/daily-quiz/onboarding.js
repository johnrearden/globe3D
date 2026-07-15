/**
 * Post-run onboarding for the Daily Challenge: after a player finishes their
 * first run (or from the leaderboard's "Add your name" CTA), collect a nickname
 * and home country to save their result to the board. Self-contained modal;
 * resolves with {nickname, country} or null if cancelled. Country options are the
 * globe's own country names.
 */

import { countryData } from '../../data/country-data.js';

/** ISO-2 region codes from the browser locale(s), most-preferred first. */
function localeRegionCodes() {
    const tags = (navigator.languages && navigator.languages.length)
        ? navigator.languages
        : [navigator.language];
    const codes = [];
    for (const tag of tags) {
        if (!tag) continue;
        try {
            const region = new Intl.Locale(tag).region;
            if (region) codes.push(region.toLowerCase());
        } catch (_) { /* malformed tag — skip */ }
    }
    return codes;
}

/** Best guess at the player's country (a name present in `countryNames`), or ''. */
function guessCountryName(countryNames) {
    const codes = localeRegionCodes();
    if (!codes.length) return '';
    // ISO-2 -> dropdown option name, using the globe's own country reference data.
    const isoToName = new Map();
    for (const name of countryNames) {
        const iso = countryData[name] && countryData[name].iso;
        if (iso && !isoToName.has(iso)) isoToName.set(iso, name);
    }
    for (const code of codes) {
        if (isoToName.has(code)) return isoToName.get(code);
    }
    // Fallback: match the locale's English region name against the option names.
    try {
        const dn = new Intl.DisplayNames(['en'], { type: 'region' });
        const byLower = new Map(countryNames.map((n) => [n.toLowerCase(), n]));
        for (const code of codes) {
            const en = dn.of(code.toUpperCase());
            if (en && byLower.has(en.toLowerCase())) return byLower.get(en.toLowerCase());
        }
    } catch (_) { /* Intl.DisplayNames unsupported — skip */ }
    return '';
}

export function showOnboarding(countryNames, existing = null) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'dq-modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'dq-modal';
        modal.innerHTML = `
            <h2 class="dq-modal-title">Join the leaderboard</h2>
            <p class="dq-modal-sub">Pick a name and country to save your result to the leaderboard.</p>
            <label class="dq-field">
                <span>Nickname</span>
                <input type="text" class="dq-nick" maxlength="40" placeholder="e.g. GlobeTrotter" />
            </label>
            <label class="dq-field">
                <span>Country</span>
                <select class="dq-country"></select>
            </label>
            <div class="dq-modal-actions">
                <button type="button" class="dq-btn-secondary dq-cancel">Cancel</button>
                <button type="button" class="dq-btn-primary dq-save">Save</button>
            </div>
            <p class="dq-modal-err" hidden></p>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const nick = modal.querySelector('.dq-nick');
        const country = modal.querySelector('.dq-country');
        const err = modal.querySelector('.dq-modal-err');

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '— select —';
        country.appendChild(placeholder);
        [...countryNames].sort((a, b) => a.localeCompare(b)).forEach((name) => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            country.appendChild(opt);
        });

        if (existing) {
            nick.value = existing.nickname || '';
            if (existing.country) country.value = existing.country;
        }
        // Pre-fill from the browser locale when nothing is already selected.
        if (!country.value) {
            const guess = guessCountryName(countryNames);
            if (guess) country.value = guess;
        }
        setTimeout(() => nick.focus(), 50);

        const close = (result) => {
            document.body.removeChild(overlay);
            resolve(result);
        };

        modal.querySelector('.dq-cancel').addEventListener('click', () => close(null));
        modal.querySelector('.dq-save').addEventListener('click', () => {
            const name = nick.value.trim();
            if (name.length < 2) {
                err.textContent = 'Please enter a nickname (2+ characters).';
                err.hidden = false;
                return;
            }
            close({ nickname: name, country: country.value });
        });
        nick.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') modal.querySelector('.dq-save').click();
        });
    });
}
