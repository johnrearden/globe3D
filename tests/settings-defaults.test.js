/**
 * The defaults and the controls that edit them have to agree.
 *
 * `SETTINGS_DEFAULTS` is the one source of truth, and the way it goes wrong is
 * never a crash: a control that restates a default drifts from it silently, and
 * the reader sees a setting that "does not stick". That is exactly what happened
 * to `scheme` in B10b — `'vibrant'` in scene-appearance.js, `'greys'` in the
 * store and again in GlobeIsland, three answers to one question.
 *
 * So these check the *relationships*, not the values. Lowering a default is a
 * product decision and no test should have an opinion on it; a default the
 * slider cannot produce is a bug either way.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SETTINGS_DEFAULTS } from '../packages/storage/src/settings-store.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');

const sheet = read('apps/web/src/components/shell/SettingsSheet.tsx');
const vanillaPanel = read('js/features/settings-panel.js');

/** `min={0.1} max={1}` in the React sheet. */
function sheetSlider(label) {
    const block = sheet.slice(sheet.indexOf(`label="${label}"`));
    const num = (prop) => Number(block.match(new RegExp(`${prop}=\\{([\\d.]+)\\}`))[1]);
    return { min: num('min'), max: num('max') };
}

describe('border strength', () => {
    it('has a default the slider can actually produce', () => {
        // A default below `min` shows a value the control cannot return to
        // once moved — the setting appears to have no way back.
        const { min, max } = sheetSlider('Border strength');
        expect(SETTINGS_DEFAULTS.borderOpacity).toBeGreaterThanOrEqual(min);
        expect(SETTINGS_DEFAULTS.borderOpacity).toBeLessThanOrEqual(max);
    });

    it('offers the same range in both apps', () => {
        // The vanilla panel and the React sheet edit ONE stored value; different
        // bounds would mean a value one app can set and the other cannot.
        const { min, max } = sheetSlider('Border strength');
        const vanilla = vanillaPanel.match(
            /'Border opacity',\s*\{\s*min:\s*([\d.]+),\s*max:\s*([\d.]+)/);
        expect(Number(vanilla[1])).toBe(min);
        expect(Number(vanilla[2])).toBe(max);
    });

    it('is read from the store, never restated in the sheet', () => {
        // The `?? 0.2` this replaced was harmless only because the store always
        // supplies the key. It is the shape of the scheme bug, not its scale,
        // that matters.
        expect(sheet).toContain('settings.borderOpacity ?? SETTINGS_DEFAULTS.borderOpacity');
        expect(sheet).not.toMatch(/borderOpacity \?\? [\d.]+/);
    });
});

describe('the settings the globe replays at boot', () => {
    it('are all present in the defaults, so a fresh reader gets every one', () => {
        // applyAll reads these off the settings object; a key missing from the
        // defaults would be `undefined` on a first visit and silently skipped.
        for (const key of [
            'scheme', 'showCountries', 'showLabels', 'showInfoPanel',
            'borders', 'borderOpacity', 'selGradient', 'autoRotate',
        ]) {
            expect(SETTINGS_DEFAULTS, key).toHaveProperty(key);
            expect(SETTINGS_DEFAULTS[key], key).not.toBeUndefined();
        }
    });

    it('leaves lighting null, which means "keep the build-time fade targets"', () => {
        // Not an oversight: a number here would override the fade-in targets on
        // every load for a reader who never touched a lighting slider.
        expect(SETTINGS_DEFAULTS.lighting).toBe(null);
    });
});
