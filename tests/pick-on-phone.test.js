/**
 * A tap on a country, on a phone.
 *
 * The reader has turned from the text to the globe, and the globe has half the
 * screen: the sheet collapses, the globe centres, and the Daily invite steps
 * aside. Three islands, three source-level checks — they share no root, so the
 * tap reaches each through the bridge and the panel store.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8');
const shell = read('apps/web/src/components/shell/ShellControls.tsx');
const island = read('apps/web/src/components/GlobeIsland.tsx');
const daily = read('apps/web/src/components/daily/DailyLayer.tsx');

describe('the sheet', () => {
    it('collapses on a pick on a phone, and only on a phone', () => {
        expect(shell).toMatch(/import \{ useCompact \} from '\.\.\/\.\.\/lib\/compact'/);
        expect(shell).toMatch(/setSelected\(name\);\s*if \(compact\) setPanelSnap\('collapsed'\);/);
    });

    it('never collapses on a quiz answer', () => {
        expect(shell).toMatch(/if \(quizStore\.isActive\(\)\) return;\s*setSelected\(name\);/);
    });
});

describe('the globe', () => {
    it('re-frames on the snap without clearing the tapped country', () => {
        // Navigation clears (what was highlighted belongs to the last page);
        // a re-frame — snap, resize — keeps it.
        expect(island).toMatch(/const reframe = \(\) => show\(getScreen\(\), \{ clear: false \}\);/);
        expect(island).toMatch(/onPanelSnapChange\(reframe\)/);
        expect(island).toMatch(/onResize = reframe;/);
        expect(island).toMatch(/onScreenChange\(\(screen\) => show\(screen, \{ clear: true \}\)\)/);
        expect(island).toMatch(/if \(clear\) globe\.clearSelection\(\);/);
    });
});

describe('the invite', () => {
    it('steps aside on a pick while it is showing, at every width', () => {
        expect(daily).toMatch(/if \(!showing\) return;\s*return globe\.onPick\(\(\) => setDismissed\(true\)\);/);
    });
});
