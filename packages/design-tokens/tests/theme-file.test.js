/**
 * `theme.json` — the committed knob overrides the build layers over the defaults.
 *
 * The rules worth pinning are the ones that keep a *dev tool* from corrupting
 * the design system: what gets written is filtered to real knobs, and what gets
 * read back never throws, because a build must not fail on a half-written file
 * when the defaults are a complete theme on their own.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readTheme, writeTheme, THEME_FILE } from '../src/theme-file.js';
import { defaultTheme, KNOB_NAMES } from '../src/tokens.js';
import { toCss } from '../src/css.js';
import { artefacts } from '../bin/build-tokens.mjs';

let dir;
let file;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tg-theme-'));
    file = join(dir, 'theme.json');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('readTheme', () => {
    it('reads a partial knob map', () => {
        writeFileSync(file, JSON.stringify({ primary: '#5ec8d8' }));
        expect(readTheme(file)).toEqual({ primary: '#5ec8d8' });
    });

    it('drops names that are not knobs', () => {
        // A stale file naming a token that has since been removed, or a derived
        // value someone tried to pin by hand.
        writeFileSync(file, JSON.stringify({
            primary: '#5ec8d8',
            '--accent': '#ff0000',   // legacy vocabulary
            'border-subtle': '#333', // derived, not authorable
            'space-1': '10px',       // fixed scale
        }));
        expect(readTheme(file)).toEqual({ primary: '#5ec8d8' });
    });

    it('returns no overrides rather than throwing, whatever the file holds', () => {
        // The defaults are a complete theme, so falling back to them beats
        // failing a build because a dev tool left a partial write behind.
        expect(readTheme(join(dir, 'absent.json'))).toEqual({});
        writeFileSync(file, '{ "primary": ');
        expect(readTheme(file)).toEqual({});
        writeFileSync(file, '[]');
        expect(readTheme(file)).toEqual({});
        writeFileSync(file, 'null');
        expect(readTheme(file)).toEqual({});
    });
});

describe('writeTheme', () => {
    it('writes only real knobs, and reads back identically', () => {
        const written = writeTheme({ primary: '#5ec8d8', nonsense: '#000' }, file);
        expect(written).toEqual({ primary: '#5ec8d8' });
        expect(readTheme(file)).toEqual({ primary: '#5ec8d8' });
    });

    it('drops empty values instead of writing a knob that resolves to nothing', () => {
        expect(writeTheme({ primary: '   ', 'bg-app': '#101a24' }, file))
            .toEqual({ 'bg-app': '#101a24' });
    });

    it('sorts keys so an edit is a one-line diff', () => {
        writeTheme({ primary: '#5ec8d8', 'bg-app': '#101a24', ocean: '#08324f' }, file);
        expect(Object.keys(JSON.parse(readFileSync(file, 'utf8'))))
            .toEqual(['bg-app', 'ocean', 'primary']);
        expect(readFileSync(file, 'utf8').endsWith('\n')).toBe(true);
    });
});

describe('the build reads it', () => {
    it('layers overrides onto the defaults, deriving from the new values', () => {
        const themed = artefacts({ 'bg-app': '#ffffff' })['tokens.css'];
        expect(themed).toContain('--bg-app: #ffffff;');
        // scrim is alpha(bg-app, .72) — a derived value must track the override,
        // not the default it was generated from.
        expect(themed).toContain('--scrim: rgba(255, 255, 255, 0.72);');
    });

    it('leaves the Python allow-list alone — names are the system, not a theme', () => {
        expect(artefacts({ primary: '#ff0000' })['tokens.py'])
            .toBe(artefacts({})['tokens.py']);
    });

    it('builds the artefact from whatever the committed theme holds', () => {
        // Deliberately not "theme.json is empty": it starts that way, but the
        // file exists precisely so it need not stay that way, and an assertion
        // that it does would fail the first time anyone authored a theme.
        const stored = readTheme(THEME_FILE);
        expect(artefacts()['tokens.css']).toContain(toCss(stored).split('\n')[1]);
        for (const [name, value] of Object.entries(stored)) {
            expect(KNOB_NAMES, `${name} is not a knob`).toContain(name);
            expect(artefacts()['tokens.css']).toContain(`--${name}: ${value};`);
        }
    });

    it('falls back to a knob default for anything the theme leaves unset', () => {
        const stored = readTheme(THEME_FILE);
        const defaults = defaultTheme();
        for (const name of KNOB_NAMES.filter(n => !(n in stored))) {
            expect(artefacts()['tokens.css']).toContain(`--${name}: ${defaults[name]};`);
        }
    });
});
