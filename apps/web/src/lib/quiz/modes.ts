/**
 * The four practice modes and the eight scopes, as data.
 *
 * Lifted from `js/features/quiz/quiz-mode-picker.js:9-54`, with one change that
 * removes a whole class of bug: **these are keyed by quiz-core's `MODES`**
 * (`name-flag`, `identify-flag`, `click-country`, `capital`) rather than the
 * picker's private ids (`name`, `flag`, `find`, `capital`). The vanilla app kept
 * a four-arm translation switch at `index.html:738-752` to bridge the two
 * vocabularies, and those ids are also the localStorage history keys — so a
 * mistranslation would not throw, it would silently file a session under the
 * wrong mode. One vocabulary, no switch.
 *
 * Copy is presentation, so it lives here rather than in the package: quiz-core
 * knows what a mode *is*, not what to call it in English.
 */
import { MODES } from '@terragotcha/quiz-core';

/**
 * The eight balanced quiz regions, alphabetical for the UI.
 *
 * North America and the Caribbean share one region — see
 * `js/data/country-regions.js`. The string must match
 * `AREA_FILTER_EXEMPT_REGION` in `packages/quiz-core/src/filters.js` exactly,
 * because the Caribbean's small islands are exempted from the area filter by
 * name.
 */
export const REGIONS = [
    'Africa',
    'Asia',
    'Europe',
    'Latin America',
    'Middle East',
    'N. America & Caribbean',
    'Oceania',
] as const;

/** A quiz runs over the whole globe or over one region. */
export type Scope = 'globe' | (typeof REGIONS)[number];

export type ModeId = (typeof MODES)[keyof typeof MODES];

export interface ModeDescriptor {
    id: ModeId;
    /** Key into the Icon component's set. */
    icon: 'globe' | 'flag' | 'pin' | 'bank';
    title: string;
    description: string;
}

export const QUIZ_MODES: readonly ModeDescriptor[] = [
    {
        id: MODES.NAME_FLAG,
        icon: 'globe',
        title: 'Name the country',
        description: 'Find a highlighted country and pick its name',
    },
    {
        id: MODES.IDENTIFY_FLAG,
        icon: 'flag',
        title: 'Identify the flag',
        description: 'See a flag and choose which country it belongs to',
    },
    {
        id: MODES.CLICK_COUNTRY,
        icon: 'pin',
        title: 'Find the country',
        description: 'Tap the right country — 10 to find, no clock',
    },
    {
        id: MODES.CAPITAL,
        icon: 'bank',
        title: 'Capital cities',
        description: 'Match countries to capitals — direction flips',
    },
];

/** How a scope reads in a heading or a results line. */
export function scopeLabel(scope: Scope): string {
    return scope === 'globe' ? 'the whole globe' : scope;
}
