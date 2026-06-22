import { describe, it, expect } from 'vitest';
import { capitalIsSelfEvident } from '../js/utils/self-evident-capital.js';

describe('capitalIsSelfEvident', () => {
    it('excludes containment / equality pairs', () => {
        expect(capitalIsSelfEvident('Mexico', 'Mexico City')).toBe(true);
        expect(capitalIsSelfEvident('Guatemala', 'Guatemala City')).toBe(true);
        expect(capitalIsSelfEvident('Tunisia', 'Tunis')).toBe(true);
        expect(capitalIsSelfEvident('Monaco', 'Monaco')).toBe(true);
        expect(capitalIsSelfEvident('Guinea-Bissau', 'Bissau')).toBe(true);
        expect(capitalIsSelfEvident('São Tomé and Príncipe', 'São Tomé')).toBe(true);
        expect(capitalIsSelfEvident('San Marino', 'City of San Marino')).toBe(true);
    });

    it('does NOT catch shared-root-only pairs (documented limit)', () => {
        expect(capitalIsSelfEvident('Brazil', 'Brasília')).toBe(false);
        expect(capitalIsSelfEvident('Algeria', 'Algiers')).toBe(false);
        expect(capitalIsSelfEvident('Niger', 'Niamey')).toBe(false);
    });

    it('keeps ordinary unrelated pairs', () => {
        expect(capitalIsSelfEvident('France', 'Paris')).toBe(false);
        expect(capitalIsSelfEvident('Japan', 'Tokyo')).toBe(false);
        expect(capitalIsSelfEvident('', 'Paris')).toBe(false);
    });
});
