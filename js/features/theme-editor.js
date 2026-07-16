/**
 * Live theme editor (admin-only).
 *
 * A right-anchored sheet (deliberately NOT a dimming modal) so the real globe +
 * UI stay visible and re-theme as you drag sliders. Edits the ~44 curated knob
 * tokens (js/data/theme-tokens.js), previewing live via inline :root overrides,
 * and saves to the backend through the audit-gated ApiClient theme endpoints.
 * Lazy-loaded from the settings gear only when an audit token is present, so
 * players never download it.
 */

import { cssToken, THEME_EVENT } from '../utils/theme.js';
import { TOKEN_GROUPS, FONT_TOKEN_NAMES } from '../data/theme-tokens.js';
import {
    THEMES, getApi, getSelection, previewTheme, setToken, restoreSelection,
    refreshRemoteThemes, applyTheme,
} from './theme-switcher.js';
import { parseColor, toHex, formatColor } from '../utils/color.js';

const FONT_SUGGESTIONS = [
    'system-ui, sans-serif', 'Arial, sans-serif', 'Georgia, serif',
    "'Times New Roman', serif", "'Courier New', monospace", 'ui-monospace, monospace',
    "'Inter', system-ui, sans-serif", "'Archivo', sans-serif", "'Fredoka', system-ui, sans-serif",
];
const WEIGHTS = ['300', '400', '500', '600', '700', '800', '900'];

let _instance = null;

/** Open (building on first use) the theme editor. opts.onSaved fires after CRUD. */
export function openThemeEditor(opts = {}) {
    if (!_instance) _instance = new ThemeEditor();
    _instance.open(opts);
}

function el(tag, className, props = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    Object.assign(node, props);
    return node;
}

class ThemeEditor {
    constructor() {
        this.working = {};       // token -> value (only tokens the admin touched)
        this.baseValues = {};    // token -> base preset value (untouched rows show this)
        this.rows = new Map();   // token -> { refresh() }
        this.editingId = null;
        this.prevSelection = null;
        this.onSaved = null;
        this._fontTimer = null;
        this._build();
    }

    // ---- DOM -----------------------------------------------------------------

    _build() {
        this.root = el('div', 'theme-editor hidden');

        const head = el('div', 'te-head');
        head.appendChild(el('span', 'te-title', { textContent: 'Theme editor' }));
        const close = el('button', 'te-close', { textContent: '×', title: 'Close' });
        close.addEventListener('click', () => this.close());
        head.appendChild(close);
        this.root.appendChild(head);

        const body = el('div', 'te-body');

        // Theme picker (New + existing, incl. drafts).
        this.picker = el('select', 'te-select');
        this.picker.addEventListener('change', () => this._onPick());
        body.appendChild(this._field('Theme', this.picker));

        // Name + base + published.
        this.nameInput = el('input', 'te-input', { type: 'text', placeholder: 'Theme name' });
        body.appendChild(this._field('Name', this.nameInput));

        this.baseSelect = el('select', 'te-select');
        for (const t of THEMES) this.baseSelect.appendChild(el('option', null, { value: t.key, textContent: t.label }));
        this.baseSelect.addEventListener('change', () => this._onBaseChange());
        body.appendChild(this._field('Base preset', this.baseSelect));

        this.publishedInput = el('input', null, { type: 'checkbox', checked: true });
        const pubLabel = el('label', 'te-check');
        pubLabel.appendChild(this.publishedInput);
        pubLabel.appendChild(document.createTextNode(' Published (visible to test users)'));
        const pubRow = el('div', 'te-field'); pubRow.appendChild(pubLabel);
        body.appendChild(pubRow);

        // Live preview strip.
        body.appendChild(this._buildPreview());

        // Token groups.
        for (const group of TOKEN_GROUPS) {
            const g = el('div', 'te-group');
            g.appendChild(el('div', 'te-group-title', { textContent: group.title }));
            for (const tok of group.tokens) g.appendChild(this._buildRow(tok));
            body.appendChild(g);
        }

        this.root.appendChild(body);

        // Footer.
        const foot = el('div', 'te-foot');
        this.status = el('div', 'te-status');
        foot.appendChild(this.status);
        const actions = el('div', 'te-actions');
        this.revertBtn = el('button', 'te-btn', { textContent: 'Revert' });
        this.revertBtn.addEventListener('click', () => this._revert());
        this.deleteBtn = el('button', 'te-btn te-btn-danger', { textContent: 'Delete' });
        this.deleteBtn.addEventListener('click', () => this._delete());
        this.updateBtn = el('button', 'te-btn', { textContent: 'Update' });
        this.updateBtn.addEventListener('click', () => this._save(false));
        this.saveNewBtn = el('button', 'te-btn te-btn-primary', { textContent: 'Save as new' });
        this.saveNewBtn.addEventListener('click', () => this._save(true));
        actions.append(this.revertBtn, this.deleteBtn, this.updateBtn, this.saveNewBtn);
        foot.appendChild(actions);
        this.root.appendChild(foot);

        document.body.appendChild(this.root);
    }

    _field(label, control) {
        const row = el('div', 'te-field');
        row.appendChild(el('label', 'te-label', { textContent: label }));
        row.appendChild(control);
        return row;
    }

    _buildPreview() {
        const wrap = el('div', 'te-preview');
        wrap.appendChild(el('div', 'te-pv-heading', { textContent: 'Heading' }));
        wrap.appendChild(el('div', 'te-pv-body', { textContent: 'Body text sample.' }));
        const btnRow = el('div', 'te-pv-row');
        btnRow.appendChild(el('button', 'te-pv-btn', { textContent: 'Button', type: 'button' }));
        btnRow.appendChild(el('span', 'te-pv-chip', { textContent: 'chip' }));
        wrap.appendChild(btnRow);
        return wrap;
    }

    _buildRow(tok) {
        const row = el('div', 'te-row');
        row.appendChild(el('span', 'te-row-label', { textContent: tok.label, title: tok.name }));
        const ctrl = el('div', 'te-row-ctrl');
        let refresh;

        if (tok.type === 'color') {
            const swatch = el('input', 'te-swatch', { type: 'color' });
            const alpha = el('input', 'te-alpha', { type: 'range', min: '0', max: '1', step: '0.01' });
            const text = el('input', 'te-val', { type: 'text' });
            const recompose = () => {
                const rgb = parseColor(swatch.value) || { r: 0, g: 0, b: 0 };
                const v = formatColor({ ...rgb, a: parseFloat(alpha.value) });
                text.value = v; this._set(tok, v);
            };
            swatch.addEventListener('input', recompose);
            alpha.addEventListener('input', recompose);
            text.addEventListener('change', () => {
                const c = parseColor(text.value);
                if (c) { swatch.value = toHex(c); alpha.value = String(c.a); }
                this._set(tok, text.value.trim());
            });
            ctrl.append(swatch, alpha, text);
            refresh = (value) => {
                const c = parseColor(value);
                if (c) { swatch.value = toHex(c); alpha.value = String(c.a); }
                text.value = value;
            };
        } else if (tok.type === 'length') {
            const range = el('input', 'te-range', { type: 'range', min: '0', max: '48', step: '1' });
            const text = el('input', 'te-val te-val-sm', { type: 'text' });
            range.addEventListener('input', () => { const v = range.value + 'px'; text.value = v; this._set(tok, v); });
            text.addEventListener('change', () => {
                const px = parseFloat(text.value);
                if (!Number.isNaN(px)) range.value = String(Math.min(48, Math.max(0, px)));
                this._set(tok, text.value.trim());
            });
            ctrl.append(range, text);
            refresh = (value) => {
                text.value = value;
                const px = parseFloat(value);
                if (!Number.isNaN(px) && /px$/.test(value)) range.value = String(Math.min(48, Math.max(0, px)));
            };
        } else if (tok.type === 'weight') {
            const select = el('select', 'te-select te-select-sm');
            for (const w of WEIGHTS) select.appendChild(el('option', null, { value: w, textContent: w }));
            select.addEventListener('change', () => this._set(tok, select.value));
            ctrl.append(select);
            refresh = (value) => { select.value = String(parseInt(value, 10) || 400); };
        } else { // font
            const text = el('input', 'te-val te-val-wide', { type: 'text' });
            text.setAttribute('list', 'te-font-list');  // `list` is a read-only property
            text.addEventListener('change', () => this._set(tok, text.value.trim()));
            ctrl.append(text);
            refresh = (value) => { text.value = value; };
        }

        const reset = el('button', 'te-reset', { textContent: '↺', title: 'Reset to base', type: 'button' });
        reset.addEventListener('click', () => this._resetToken(tok));
        ctrl.appendChild(reset);
        row.appendChild(ctrl);

        // One shared font datalist.
        if (tok.type === 'font' && !document.getElementById('te-font-list')) {
            const dl = el('datalist', null, { id: 'te-font-list' });
            for (const f of FONT_SUGGESTIONS) dl.appendChild(el('option', null, { value: f }));
            this.root.appendChild(dl);
        }

        this.rows.set(tok.name, { refresh, mark: () => row.classList.toggle('te-row--set', tok.name in this.working) });
        return row;
    }

    // ---- token edits ---------------------------------------------------------

    _set(tok, value) {
        this.working[tok.name] = value;
        setToken(tok.name, value);
        this.rows.get(tok.name).mark();
        if (FONT_TOKEN_NAMES.has(tok.name)) this._debouncedFontEvent();
    }

    _resetToken(tok) {
        delete this.working[tok.name];
        document.documentElement.style.removeProperty(tok.name);
        const r = this.rows.get(tok.name);
        r.refresh(this.baseValues[tok.name] || '');
        r.mark();
        if (FONT_TOKEN_NAMES.has(tok.name)) this._debouncedFontEvent();
    }

    _debouncedFontEvent() {
        clearTimeout(this._fontTimer);
        this._fontTimer = setTimeout(
            () => document.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { preview: true } })), 250);
    }

    // ---- load / preview ------------------------------------------------------

    _currentBase() { return this.baseSelect.value || 'default'; }

    /** Recompute base-preset values for every token, then re-apply the working overrides. */
    _recomputeBase() {
        previewTheme(this._currentBase(), {});          // pure base, no overrides
        for (const group of TOKEN_GROUPS)
            for (const tok of group.tokens) this.baseValues[tok.name] = cssToken(tok.name).trim();
        previewTheme(this._currentBase(), this.working); // restore the working preview
        this._refreshRows();
    }

    _refreshRows() {
        for (const group of TOKEN_GROUPS) for (const tok of group.tokens) {
            const r = this.rows.get(tok.name);
            r.refresh((tok.name in this.working) ? this.working[tok.name] : (this.baseValues[tok.name] || ''));
            r.mark();
        }
    }

    _loadTheme(theme) {
        this.editingId = theme ? theme.id : null;
        this.nameInput.value = theme ? theme.name : '';
        this.baseSelect.value = (theme && theme.base) || this._selectionBase();
        this.publishedInput.checked = theme ? theme.isPublished !== false : true;
        this.working = theme ? { ...(theme.tokens || {}) } : {};
        this._recomputeBase();
        this._syncFooter();
    }

    /** Base preset implied by the currently active selection (for a fresh theme). */
    _selectionBase() {
        const sel = getSelection();
        return (sel === 'soft' || sel === 'sharp' || sel === 'mono') ? sel : 'default';
    }

    _onBaseChange() { this._recomputeBase(); }

    _onPick() {
        const val = this.picker.value;
        if (val === '__new__') { this._loadTheme(null); return; }
        const theme = this._allThemes.find(t => String(t.id) === val);
        this._loadTheme(theme || null);
    }

    _syncFooter() {
        const existing = this.editingId != null;
        this.updateBtn.style.display = existing ? '' : 'none';
        this.deleteBtn.style.display = existing ? '' : 'none';
    }

    _populatePicker(selectedId) {
        this.picker.innerHTML = '';
        this.picker.appendChild(el('option', null, { value: '__new__', textContent: '＋ New theme' }));
        for (const t of this._allThemes) {
            const label = t.isPublished === false ? `${t.name} (draft)` : t.name;
            this.picker.appendChild(el('option', null, { value: String(t.id), textContent: label }));
        }
        this.picker.value = selectedId != null ? String(selectedId) : '__new__';
    }

    // ---- open / close --------------------------------------------------------

    async open(opts = {}) {
        this.onSaved = opts.onSaved || null;
        this.prevSelection = getSelection();
        this.root.classList.remove('hidden');
        this._flash('');
        this._allThemes = [];
        this._loadTheme(null);          // start in New mode with current base
        this._populatePicker(null);
        // Fetch all themes (incl. drafts) for the picker.
        const api = getApi();
        if (api) {
            try {
                this._allThemes = await api.listAllThemes();
                this._populatePicker(this.editingId);
            } catch (err) { this._flashError(err); }
        }
    }

    close() {
        this.root.classList.add('hidden');
        restoreSelection();             // clears inline overrides + re-applies the real selection
    }

    _revert() {
        // Drop edits back to the loaded theme's saved tokens (or empty for New).
        const saved = this.editingId != null
            ? (this._allThemes.find(t => t.id === this.editingId) || {}).tokens || {}
            : {};
        this.working = { ...saved };
        this._recomputeBase();
        this._flash('Reverted');
    }

    // ---- persistence ---------------------------------------------------------

    _payload() {
        return {
            name: this.nameInput.value.trim(),
            base: this._currentBase(),
            tokens: this.working,
            isPublished: this.publishedInput.checked,
        };
    }

    async _save(asNew) {
        const api = getApi();
        const payload = this._payload();
        if (!api) { this._flash('No backend connection.', true); return; }
        if (!payload.name) { this._flash('Give the theme a name.', true); return; }
        try {
            const saved = (asNew || this.editingId == null)
                ? await api.createTheme(payload)
                : await api.updateTheme(this.editingId, payload);
            this.editingId = saved.id;
            await refreshRemoteThemes();
            // Refresh the picker (incl. drafts).
            try { this._allThemes = await api.listAllThemes(); } catch (_) { /* keep old */ }
            this._populatePicker(this.editingId);
            this._syncFooter();
            // If it's published it's now selectable — make it the active selection so
            // it persists after close; drafts stay as a live preview only.
            if (saved.isPublished) applyTheme(`remote:${saved.id}`);
            if (this.onSaved) this.onSaved();
            this._flash('Saved ✓');
        } catch (err) { this._flashError(err); }
    }

    async _delete() {
        const api = getApi();
        if (!api || this.editingId == null) return;
        if (!window.confirm('Delete this theme?')) return;
        try {
            const deletedId = this.editingId;
            await api.deleteTheme(deletedId);
            await refreshRemoteThemes();
            if (getSelection() === `remote:${deletedId}`) applyTheme('default');
            try { this._allThemes = await api.listAllThemes(); } catch (_) { this._allThemes = []; }
            this.prevSelection = getSelection();
            this._loadTheme(null);
            this._populatePicker(null);
            if (this.onSaved) this.onSaved();
            this._flash('Deleted');
        } catch (err) { this._flashError(err); }
    }

    _flash(msg, isError = false) {
        this.status.textContent = msg;
        this.status.classList.toggle('te-status--error', isError);
    }

    _flashError(err) {
        const s = err && err.status;
        if (s === 401 || s === 403) {
            this._flash('Session expired — revisit /audit/launch for a fresh token.', true);
        } else {
            this._flash((err && err.message) || 'Request failed.', true);
        }
    }
}
