/**
 * The quiz layer's contracts with the things around it.
 *
 * Three of these are behavioural (pure modules, run for real); the last two are
 * structural, guarding the AdSense invariant the same way
 * `tests/country-page-static.test.js` does — one word (`client:load` instead of
 * `client:idle`, or markup where there should be none) would put quiz chrome
 * into the initial HTML response of every article on the site.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MODES } from '../packages/quiz-core/src/index.js';
import { cellState } from '../apps/web/src/lib/quiz/reveal.ts';
import { formatDuration } from '../apps/web/src/lib/quiz/useElapsed.ts';
import { QUIZ_MODES, REGIONS, scopeLabel } from '../apps/web/src/lib/quiz/modes.ts';
import { AREA_FILTER_EXEMPT_REGION } from '../packages/quiz-core/src/filters.js';

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/**
 * Strip comments so the "never touches the engine" checks read CODE, not prose.
 * Without this, a docstring explaining WHY the engine is off-limits fails the
 * test that enforces it — which is exactly what happened when these were
 * written. Same crude approach as tests/country-page-static.test.js.
 */
const stripComments = src => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');

describe('mode table', () => {
    it('covers every quiz-core mode exactly once', () => {
        // The vanilla picker used its own ids (name/flag/find/capital) and a
        // translation switch. These ARE the history keys, so a mode the table
        // misses is a quiz that cannot be started, and a duplicate is one that
        // files results under the wrong name.
        expect(QUIZ_MODES.map(m => m.id).sort())
            .toEqual(Object.values(MODES).sort());
    });

    it('gives every mode copy and an icon', () => {
        for (const mode of QUIZ_MODES) {
            expect(mode.title, mode.id).toBeTruthy();
            expect(mode.description, mode.id).toBeTruthy();
            expect(mode.icon, mode.id).toBeTruthy();
        }
    });

    it('spells the Caribbean region exactly as the area filter expects', () => {
        // filters.js exempts this region from the minimum-area rule BY NAME, so
        // a stray "and" here would silently drop every small Caribbean island
        // out of the region's quizzes.
        expect(REGIONS).toContain(AREA_FILTER_EXEMPT_REGION);
    });

    it('reads a scope in a sentence', () => {
        expect(scopeLabel('globe')).toBe('the whole globe');
        expect(scopeLabel('Africa')).toBe('Africa');
    });
});

describe('reveal → grid state', () => {
    const reveal = {
        correct: false,
        correctOptions: ['Zambia'],
        yourSelections: ['Zimbabwe'],
        rightPicks: [],
        wrongPicks: ['Zimbabwe'],
        missed: ['Zambia'],
    };

    it('leaves every cell live before an answer', () => {
        expect(cellState('Zambia', null)).toBe('');
        expect(cellState('Zimbabwe', null)).toBe('');
    });

    it('marks the right answer even though it was not picked', () => {
        expect(cellState('Zambia', reveal)).toBe('correct');
    });

    it('marks the wrong pick', () => {
        expect(cellState('Zimbabwe', reveal)).toBe('incorrect');
    });

    it('dims everything untouched', () => {
        expect(cellState('Malawi', reveal)).toBe('dimmed');
    });

    it('prefers correct over incorrect for the same option', () => {
        // Defensive: if an option ever appears in both lists, the player must
        // see the teaching signal, not the scolding one.
        const both = { ...reveal, wrongPicks: ['Zambia'] };
        expect(cellState('Zambia', both)).toBe('correct');
    });
});

describe('formatDuration', () => {
    it('formats M:SS', () => {
        expect(formatDuration(0)).toBe('0:00');
        expect(formatDuration(9_000)).toBe('0:09');
        expect(formatDuration(67_000)).toBe('1:07');
        expect(formatDuration(600_000)).toBe('10:00');
    });

    it('floors rather than rounds, so the clock never runs ahead', () => {
        expect(formatDuration(1_999)).toBe('0:01');
    });

    it('clamps a negative duration instead of printing one', () => {
        expect(formatDuration(-5_000)).toBe('0:00');
    });
});

describe('the quiz must not reach the static document', () => {
    const layout = read('../apps/web/src/layouts/AppLayout.astro');
    const layer = read('../apps/web/src/components/quiz/QuizLayer.tsx');

    it('mounts the layer as client:idle, never client:load', () => {
        // client:load would hydrate before the page is interactive on every
        // article on the site, for a control nobody has asked for yet.
        expect(layout).toMatch(/<QuizLayer client:idle \/>/);
    });

    it('renders nothing until the globe exists', () => {
        // This is what keeps the island's build-time output empty: on the
        // server there is no globe, so the component returns null and Astro
        // emits an empty island rather than quiz chrome.
        expect(layer).toMatch(/if \(!globe\) return null;/);
    });
});

describe('the shell controls must not reach the static document either', () => {
    const layout = read('../apps/web/src/layouts/AppLayout.astro');
    const shell = read('../apps/web/src/components/shell/ShellControls.tsx');

    it('mounts as client:idle, never client:load', () => {
        expect(layout).toMatch(/<ShellControls client:idle \/>/);
    });

    it('renders nothing until the globe exists', () => {
        // Same guarantee as QuizLayer: on the server there is no globe, so the
        // island's build-time output is empty and the article is untouched.
        expect(shell).toMatch(/if \(!handle\) return null;/);
    });
});

describe('settings never touch the engine', () => {
    const settings = stripComments(read('../apps/web/src/components/shell/SettingsSheet.tsx'));
    const weak = stripComments(read('../apps/web/src/components/shell/WeakSpots.tsx'));

    it('goes through GlobeAppearance, not globeManager', () => {
        // The vanilla panel held globeManager, cameraController, labelManager
        // and raw shader uniforms, which is exactly why it could never have been
        // carried to native.
        expect(settings).not.toMatch(/globeManager|cameraController|labelManager|uniforms/);
        expect(settings).toMatch(/appearance\./);
    });

    it('reproduces a globe tap through the bridge, not by hand', () => {
        // weak-spots-widget.js copied PointerControls.onPointerUp's four-call
        // sequence, with a comment admitting it. A copied sequence drifts.
        expect(weak).not.toMatch(/setSelectedCountry|rotateToCountry/);
        expect(weak).toMatch(/globe\.highlight/);
        expect(weak).toMatch(/globe\.focusCountry/);
    });
});
