/**
 * First-run onboarding for the Daily Challenge: collect a nickname and home
 * country. Self-contained modal; resolves with {nickname, country} or null if
 * cancelled. Country options are the globe's own country names.
 */

export function showOnboarding(countryNames, existing = null) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'dq-modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'dq-modal';
        modal.innerHTML = `
            <h2 class="dq-modal-title">Daily Challenge</h2>
            <p class="dq-modal-sub">Pick a name and country to appear on the leaderboard.</p>
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
                <button type="button" class="dq-btn-primary dq-save">Start</button>
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
