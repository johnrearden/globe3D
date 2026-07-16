import { describe, it, expect } from 'vitest';
import {
    TOKEN_GROUPS, EDITABLE_TOKENS, EDITABLE_TOKEN_NAMES, FONT_TOKEN_NAMES,
} from '../js/data/theme-tokens.js';

describe('theme-tokens (frontend mirror of backend/themes/tokens.py)', () => {
    it('exposes the 26 curated knobs (radii collapsed to button + panel)', () => {
        expect(EDITABLE_TOKEN_NAMES).toHaveLength(26);
    });

    it('exposes exactly the two editable radius knobs', () => {
        const radii = EDITABLE_TOKEN_NAMES.filter(n => n.startsWith('--radius-'));
        expect(radii).toEqual(['--radius-btn', '--radius-panel']);
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

    it('has exactly 4 font tokens (need canvas re-bake on change)', () => {
        expect(FONT_TOKEN_NAMES.size).toBe(4);
    });

    it('the flat lists are derived from the groups', () => {
        const fromGroups = TOKEN_GROUPS.flatMap(g => g.tokens.map(t => t.name));
        expect(fromGroups).toEqual(EDITABLE_TOKEN_NAMES);
    });
});
