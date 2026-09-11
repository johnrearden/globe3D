/**
 * Search starts as a button, the gear's twin.
 *
 * The globe is the application; a text field across the top of it on a phone
 * was chrome over the subject. So the field appears only when the round toggle
 * beside the gear is pressed, and the two buttons share one look so they read
 * as a pair. Source-level: the component's states and the stylesheet split.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');
const search = read('apps/web/src/components/shell/SearchBox.tsx');
const shellCtl = read('apps/web/src/components/shell/ShellControls.tsx');
const shell = read('apps/web/src/styles/shell.css');
const controls = read('apps/web/src/styles/controls.css');
const discover = read('apps/web/src/styles/discover.css');

describe('the toggle', () => {
    it('is always rendered; the field only while open', () => {
        expect(search).toMatch(/className="shell-btn cs-toggle"/);
        expect(search).toMatch(/\{open && \(\s*<div className="cs-field"/);
        expect(search).toMatch(/aria-expanded=\{open\}/);
    });

    it('focuses the field as soon as it opens, and closes on a choice', () => {
        expect(search).toMatch(/useEffect\(\(\) => \{ if \(open\) inputRef\.current\?\.focus\(\); \}, \[open\]\)/);
        expect(search).toMatch(/globe\.focusCountry\(name\);\s*close\(\);/);
    });

    it('closes on Escape with nothing typed, and when focus leaves with nothing typed', () => {
        expect(search).toMatch(/if \(term\) setTerm\(''\); else close\(\);/);
        expect(search).toMatch(/if \(!term && !e\.currentTarget\.contains\(e\.relatedTarget as Node \| null\)\) setOpen\(false\);/);
    });
});

describe('one look for the two shell buttons', () => {
    it('the gear and the toggle both wear .shell-btn, defined once in shell.css', () => {
        expect(shellCtl).toMatch(/className="shell-btn shell-gear"/);
        expect(shell).toMatch(/^\.shell-btn \{/m);
        expect(shell).toMatch(/--shell-btn: 2\.75rem;/);
        // controls.css keeps only the gear's seat: no size, no colour, no border.
        const gear = controls.slice(controls.indexOf('.shell-gear {'), controls.indexOf('}', controls.indexOf('.shell-gear {')));
        expect(gear).toMatch(/position: fixed/);
        expect(gear).not.toMatch(/width|background|border/);
    });

    it('seats search one step right of the gear and grows it only when open', () => {
        const seat = shell.slice(shell.indexOf('.cs-box {'), shell.indexOf("[data-open='true']"));
        expect(seat).toMatch(/left: calc\(var\(--space-4\) \+ var\(--shell-btn\) \+ var\(--space-2\)\)/);
        expect(seat).toMatch(/width: var\(--shell-btn\)/);
        expect(shell).toMatch(/\.cs-box\[data-open='true'\] \{\s*width: min\(20rem/);
        expect(shell).not.toMatch(/translateX\(-50%\)/);
        // The field takes the toggle's height by stretching, not by restating it.
        expect(discover).toMatch(/\.cs-row \{[^}]*align-items: stretch/);
        expect(discover).not.toMatch(/--shell-btn/);
    });
});
