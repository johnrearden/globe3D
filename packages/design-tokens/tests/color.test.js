import { describe, it, expect } from 'vitest';
import { parseColor, toHex, formatColor } from '../src/color.js';

describe('parseColor', () => {
    it('parses 6-digit hex', () => expect(parseColor('#3b82f6')).toEqual({ r: 59, g: 130, b: 246, a: 1 }));
    it('parses 3-digit hex', () => expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 }));
    it('parses 8-digit hex with alpha', () => {
        const c = parseColor('#00000080');
        expect(c.r).toBe(0);
        expect(c.a).toBeCloseTo(0.5, 1);
    });
    it('parses rgb()', () => expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 }));
    it('parses rgba()', () => expect(parseColor('rgba(255, 140, 0, 0.2)')).toEqual({ r: 255, g: 140, b: 0, a: 0.2 }));
    it('returns null for a font stack / junk', () => {
        expect(parseColor("'Archivo', sans-serif")).toBeNull();
        expect(parseColor('')).toBeNull();
    });
});

describe('toHex', () => {
    it('formats and clamps', () => {
        expect(toHex({ r: 255, g: 140, b: 0 })).toBe('#ff8c00');
        expect(toHex({ r: 300, g: -5, b: 128 })).toBe('#ff0080');
    });
});

describe('formatColor', () => {
    it('opaque → hex', () => expect(formatColor({ r: 255, g: 140, b: 0, a: 1 })).toBe('#ff8c00'));
    it('translucent → rgba', () => expect(formatColor({ r: 255, g: 140, b: 0, a: 0.2 })).toBe('rgba(255, 140, 0, 0.2)'));
});

describe('round-trip', () => {
    it('hex → parse → format is stable', () => expect(formatColor(parseColor('#0a84ff'))).toBe('#0a84ff'));
    it('rgba → parse → format is stable', () => expect(formatColor(parseColor('rgba(1, 2, 3, 0.5)'))).toBe('rgba(1, 2, 3, 0.5)'));
});
