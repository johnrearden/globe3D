/**
 * The Daily Challenge's pure pieces.
 *
 * The flow itself needs a server and a globe, so it is verified in the browser
 * against a stub backend speaking the real endpoint shapes. What is testable
 * here is the part with rules rather than plumbing: how a server map block
 * becomes camera commands, and two formatters with edge cases the backend can
 * legitimately produce.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createFakeGlobeBridge, callNames } from '../packages/globe-bridge/src/index.js';
import { applyServerMap, isMapClick } from '../apps/web/src/lib/daily/server-map.ts';
import { formatQuizDate, formatTime } from '../apps/web/src/lib/daily/format.ts';
import { errorText, isAlreadyPlayed } from '../apps/web/src/lib/daily/api.ts';

const gridQuestion = (map) => ({
    index: 0,
    prompt: 'q',
    answer: { method: 'grid-single' },
    grid: { options: [], cols: 2 },
    map,
});

const mapClickQuestion = (map) => ({
    index: 0,
    prompt: 'Click Zambia.',
    answer: { method: 'map-click-single' },
    map,
});

describe('the invite on a phone', () => {
    // Source-level: the compact variant, its delay, and where it sits.
    const src = readFileSync(fileURLToPath(new URL('../apps/web/src/components/daily/DailyLayer.tsx', import.meta.url)), 'utf8');
    const css = readFileSync(fileURLToPath(new URL('../apps/web/src/styles/daily.css', import.meta.url)), 'utf8');

    it('is one question and two words', () => {
        expect(src).toContain("'Ready for today’s 10 questions?'");
        expect(src).toMatch(/className="dq-invite-go" onClick=\{start\}>Go</);
        expect(src).toMatch(/className="dq-invite-later" onClick=\{\(\) => setDismissed\(true\)\}>\s*Later\s*</);
    });

    it('waits five seconds after the globe is ready, on the shell breakpoint', () => {
        expect(src).toMatch(/export const INVITE_DELAY_MS = 5000;/);
        expect(src).toMatch(/if \(compact\) \{\s*if \(!waited\) return null;/);
        expect(src).toMatch(/import \{ useCompact \} from '\.\.\/\.\.\/lib\/compact'/);
        const compact = readFileSync(fileURLToPath(new URL('../apps/web/src/lib/compact.ts', import.meta.url)), 'utf8');
        expect(compact).toMatch(/export const COMPACT_QUERY = '\(max-width: 899px\)';/);
    });

    it('fades in, and steps aside after a minute as "Later" does', () => {
        expect(src).toMatch(/export const INVITE_TIMEOUT_MS = 60_000;/);
        expect(src).toMatch(/window\.setTimeout\(\(\) => setDismissed\(true\), INVITE_TIMEOUT_MS\)/);
        expect(css).toMatch(/\.dq-invite \{[^}]*animation: dq-fade-in/);
        // Dismissed, it is the third round button in the top row, seated by shell.css.
        expect(src).toMatch(/className="shell-btn dq-pill"/);
        const shell = readFileSync(fileURLToPath(new URL('../apps/web/src/styles/shell.css', import.meta.url)), 'utf8');
        expect(shell).toMatch(/\.dq-pill \{[^}]*left: calc\(var\(--space-4\) \+ \(var\(--shell-btn\) \+ var\(--space-2\)\) \* 2\)/);
        expect(css).not.toMatch(/\.dq-pill \{[^}]*(position|left|width)/);
    });

    it('sits just above the panel sheet, measured from the live rect', () => {
        expect(src).toMatch(/window\.innerHeight - sheet\.getBoundingClientRect\(\)\.top/);
        expect(src).toMatch(/style=\{\{ '--dq-invite-bottom': `\$\{clearance\}px` \}/);
        expect(css).toMatch(/\.dq-invite--compact \{[^}]*bottom: calc\(var\(--dq-invite-bottom\) \+ var\(--space-2\)\)/);
    });
});

describe('isMapClick', () => {
    it('is true for both map methods and false for both grid methods', () => {
        const of = method => isMapClick({ answer: { method } });
        expect(of('map-click-single')).toBe(true);
        expect(of('map-click-multi')).toBe(true);
        expect(of('grid-single')).toBe(false);
        expect(of('grid-multi')).toBe(false);
    });
});

describe('applyServerMap', () => {
    it('resets to a neutral globe for a question with no map', () => {
        const globe = createFakeGlobeBridge();
        applyServerMap(globe, { index: 0, prompt: 'q', answer: { method: 'grid-single' } });
        // Notably clearSelection: a highlight left over from the previous
        // question would otherwise sit under a text-only one.
        expect(callNames(globe)).toEqual(['showAll', 'clearSelection', 'resetView']);
    });

    it("uses the server's explicit zoom when it sends one", () => {
        const globe = createFakeGlobeBridge();
        applyServerMap(globe, gridQuestion({ center: { lat: 51, lng: 10 }, zoom: 3 }));
        expect(globe.view).toMatchObject({ lat: 51, lng: 10, distance: 3 });
    });

    it('frames the subject country when the server sends no zoom', () => {
        const globe = createFakeGlobeBridge({ framingDistance: () => 2.25 });
        applyServerMap(globe, gridQuestion({ center: { lat: 15, lng: 19 }, focusCountry: 'Chad' }));
        expect(globe.view.distance).toBe(2.25);
    });

    it('leaves the distance unset when the server names neither', () => {
        const globe = createFakeGlobeBridge();
        applyServerMap(globe, gridQuestion({ center: { lat: 0, lng: 0 } }));
        expect(globe.view.distance).toBeUndefined();
    });

    it('honours a lock on a grid question', () => {
        const globe = createFakeGlobeBridge();
        applyServerMap(globe, gridQuestion({ center: { lat: 0, lng: 0 }, lockRotation: true }));
        expect(globe.view.lockRotation).toBe(true);
    });

    it('NEVER locks a map-click question, whatever the server says', () => {
        // The player has to be able to rotate to reach the country they mean;
        // PointerControls' drag-vs-tap threshold is what stops that registering
        // as an answer. A locked globe makes the question unanswerable.
        const globe = createFakeGlobeBridge();
        applyServerMap(globe, mapClickQuestion({ center: { lat: 0, lng: 0 }, lockRotation: true }));
        expect(globe.view.lockRotation).toBe(false);
    });

    it('highlights the subject, and only after clearing the last one', () => {
        const globe = createFakeGlobeBridge();
        applyServerMap(globe, gridQuestion({ center: { lat: 0, lng: 0 }, highlight: ['Germany'] }));
        const names = callNames(globe);
        expect(globe.selected).toBe('Germany');
        expect(names.indexOf('clearSelection')).toBeLessThan(names.indexOf('highlight'));
    });
});

describe('formatQuizDate', () => {
    it('reads an ISO date as a day', () => {
        expect(formatQuizDate('2026-03-25')).toBe('25 March 26');
        expect(formatQuizDate('2026-12-01')).toBe('1 December 26');
    });

    it('passes anything else through rather than printing NaN', () => {
        expect(formatQuizDate('tomorrow')).toBe('tomorrow');
        expect(formatQuizDate(undefined)).toBe('today');
        expect(formatQuizDate('')).toBe('today');
    });
});

describe('formatTime', () => {
    it('drops the minutes below one', () => {
        expect(formatTime(41_000)).toBe('41s');
        expect(formatTime(999)).toBe('1s');
    });

    it('splits minutes and seconds above one', () => {
        expect(formatTime(70_000)).toBe('1m 10s');
        expect(formatTime(120_000)).toBe('2m 0s');
    });
});

describe('error text', () => {
    it('treats a 409 as "already played", not as a failure', () => {
        const conflict = { status: 409, message: 'Conflict' };
        expect(isAlreadyPlayed(conflict)).toBe(true);
        expect(errorText(conflict)).toMatch(/already completed/i);
    });

    it("passes an ApiError's own message through, since it is written for players", () => {
        expect(errorText({ status: 503, message: 'The daily quiz is being generated.' }))
            .toBe('The daily quiz is being generated.');
    });

    it('says something actionable for a fault the player cannot read', () => {
        expect(errorText(new TypeError('undefined is not a function')))
            .toBe('Something went wrong. Please try again.');
        expect(errorText(null)).toBe('Something went wrong. Please try again.');
    });
});
