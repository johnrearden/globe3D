/**
 * Backend artefact: the knob list → the allow-list half of
 * `backend/themes/tokens.py`.
 *
 * Only the allow-list is generated. The validation logic below it (the value
 * charset, the length cap, the exception types) is security-relevant Python that
 * a JS template has no business owning — and it does not change when a knob is
 * added. So the generator emits a marked region and the rest of the file is
 * hand-maintained, which is also what makes the "did anyone edit the generated
 * part by hand" check below possible.
 */

import { KNOBS, KNOB_NAMES } from './tokens.js';

export const GENERATED_BEGIN = '# --- BEGIN GENERATED: @terragotcha/design-tokens ---';
export const GENERATED_END = '# --- END GENERATED ---';

const pyTuple = (names) => names.length === 1
    ? `('${names[0]}',)`
    : `(\n${names.map(n => `    '${n}',`).join('\n')}\n)`;

/**
 * The generated block: the three token tuples plus the frozenset the validator
 * checks against. Token ids gain the `--` prefix here, because that is how they
 * appear on the wire and in stored themes.
 *
 * @returns {string}
 */
export function toPythonAllowList() {
    const byType = type => KNOBS.filter(k => k.type === type).map(k => `--${k.name}`);
    const all = KNOB_NAMES.map(n => `--${n}`);

    return [
        GENERATED_BEGIN,
        '# Regenerate with: npm run build:tokens',
        '# Source of truth: packages/design-tokens/src/tokens.js',
        '#',
        `# ${KNOBS.length} authorable knobs. Everything else in the design system is`,
        '# either fixed (type/spacing scales, elevation, status colours, pill/circle',
        '# radii) or derived in JS from these — see that file for which and why.',
        '',
        `FONT_TOKENS = ${pyTuple(byType('font'))}`,
        '',
        `RADIUS_TOKENS = ${pyTuple(byType('length'))}`,
        '',
        `COLOR_TOKENS = ${pyTuple(byType('color'))}`,
        '',
        `EDITABLE_TOKENS = frozenset((`,
        ...all.map(n => `    '${n}',`),
        '))',
        GENERATED_END,
    ].join('\n');
}

/**
 * Splice the generated block into an existing file, replacing whatever is
 * currently between the markers.
 *
 * @param {string} existing  current file contents
 * @returns {string}
 * @throws if the markers are missing or malformed — better to fail loudly than
 *   to append a second allow-list that silently shadows the first.
 */
export function spliceGeneratedBlock(existing) {
    const start = existing.indexOf(GENERATED_BEGIN);
    const end = existing.indexOf(GENERATED_END);
    if (start === -1 || end === -1) {
        throw new Error(
            `tokens.py is missing the generated-block markers ` +
            `(${GENERATED_BEGIN} … ${GENERATED_END})`);
    }
    if (end < start) {
        throw new Error('tokens.py generated-block markers are out of order');
    }
    return existing.slice(0, start)
        + toPythonAllowList()
        + existing.slice(end + GENERATED_END.length);
}
