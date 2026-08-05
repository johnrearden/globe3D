import { describe, it, expect } from 'vitest';
import {
    TOKEN_GROUPS, EDITABLE_TOKENS, EDITABLE_TOKEN_NAMES, FONT_TOKEN_NAMES,
} from '../js/data/theme-tokens.js';

describe('theme-tokens (frontend mirror of backend/themes/tokens.py)', () => {
    it('exposes the 24 curated knobs', () => {
        expect(EDITABLE_TOKEN_NAMES).toHaveLength(24);
    });

    it('exposes --accent-secondary as the single Daily-pill knob', () => {
        expect(EDITABLE_TOKEN_NAMES).toContain('--accent-secondary');
        // The pill's fill/border/label/icon are color-mix()'d off it in
        // styles.css — derived, deliberately not editable in their own right.
        expect(EDITABLE_TOKEN_NAMES.filter(n => n.startsWith('--violet-'))).toEqual([]);
    });

    it('exposes exactly the two font knobs (display + UI/body)', () => {
        const fonts = EDITABLE_TOKEN_NAMES.filter(n => n.startsWith('--font-'));
        expect(fonts).toEqual(['--font-display', '--font-ui']);
        expect(EDITABLE_TOKEN_NAMES).not.toContain('--font-base');
        expect(EDITABLE_TOKEN_NAMES).not.toContain('--font-mono');
    });

    it('exposes exactly the three accent knobs', () => {
        const accents = EDITABLE_TOKEN_NAMES.filter(
            n => n.startsWith('--accent') || n === '--on-accent',
        );
        expect(accents).toEqual(['--accent', '--on-accent', '--accent-secondary']);
        // --accent-soft is derived from --accent via color-mix, and --accent-amber
        // is a primitive; neither is editable.
        expect(EDITABLE_TOKEN_NAMES).not.toContain('--accent-amber');
        expect(EDITABLE_TOKEN_NAMES).not.toContain('--accent-soft');
    });

    it('exposes exactly the two editable radius knobs', () => {
        const radii = EDITABLE_TOKEN_NAMES.filter(n => n.startsWith('--radius-'));
        expect(radii).toEqual(['--radius-btn', '--radius-panel']);
    });

    it('exposes exactly the three surface backgrounds (+ scrim)', () => {
        const bg = EDITABLE_TOKEN_NAMES.filter(n => n.startsWith('--bg-'));
        expect(bg).toEqual(['--bg-app', '--bg-panel', '--bg-elevated']);
        expect(EDITABLE_TOKEN_NAMES).toContain('--scrim');
    });

    it('every token is a CSS custom property with a known widget type', () => {
        for (const t of EDITABLE_TOKENS) {
            expect(t.name.startsWith('--')).toBe(true);
            expect(['font', 'weight', 'length', 'color']).toContain(t.type);
            expect(typeof t.label).toBe('string');
        }
    });

    it('token names are unique', () => {
        expect(new Set(EDITABLE_TOKEN_NAMES).size).toBe(EDITABLE_TOKEN_NAMES.length);
    });

    it('has exactly 2 font tokens (need canvas re-bake on change)', () => {
        expect(FONT_TOKEN_NAMES.size).toBe(2);
    });

    it('the flat lists are derived from the groups', () => {
        const fromGroups = TOKEN_GROUPS.flatMap(g => g.tokens.map(t => t.name));
        expect(fromGroups).toEqual(EDITABLE_TOKEN_NAMES);
    });
});
