/**
 * What actually differs between the four practice modes.
 *
 * In the vanilla app they are four classes totalling ~1,750 lines. Almost all of
 * that is the same sequence written four times, because each one hand-wrote its
 * own DOM and its own camera choreography. Once the globe is driven from
 * `payload.map` and the grid from `payload.grid`, what is genuinely per-mode
 * fits here:
 *
 *   - which generator produces a question
 *   - whether the answer arrives from the grid or from a tap on the globe
 *   - the eyebrow label above the prompt
 *   - whether the globe is part of the question at all
 *
 * So there is one runner, not four. A fifth mode is an entry in this table.
 */
import {
    MODES,
    buildFlagDirectionSchedule,
    fromPlan,
    generateCapital,
    generateClickCountrySession,
    generateIdentifyFlag,
    generateNameCountry,
    systemRng,
} from '@terragotcha/quiz-core';
import type { CountryRow } from '../globe';
import type { ModeId, Scope } from './modes';
import type { Question } from './useQuizSession';

type NextQuestion = (ctx: {
    countries: CountryRow[];
    scope: Scope;
    used: Set<string>;
    rng: () => number;
    index: number;
}) => Question | null;

export interface ModeSpec {
    /**
     * Build the per-question generator for one session. A factory rather than a
     * plain function because two modes carry session-level state: find-the-
     * country plans every target up front, and identify-the-flag pre-rolls a
     * balanced five-forward/five-reverse schedule it then consumes by index.
     */
    plan(countries: CountryRow[], scope: Scope): { nextQuestion: NextQuestion; total?: number };
    /** Where the answer comes from. */
    answerFrom: 'grid' | 'globe';
    /** Whether the globe is part of the question. */
    usesGlobe: boolean;
    /** The label above the prompt. */
    eyebrow(question: Question): string;
}

export const MODE_SPECS: Record<ModeId, ModeSpec> = {
    [MODES.NAME_FLAG]: {
        plan: () => ({
            nextQuestion: (ctx) => generateNameCountry(ctx) as Question | null,
        }),
        answerFrom: 'grid',
        usesGlobe: true,
        eyebrow: () => 'Which country',
    },

    [MODES.IDENTIFY_FLAG]: {
        plan: () => {
            // Five forward, five reverse, shuffled — rolled once so the mix is
            // balanced across the session rather than per-question luck.
            const schedule = buildFlagDirectionSchedule(systemRng);
            return {
                nextQuestion: (ctx) =>
                    generateIdentifyFlag({
                        ...ctx,
                        direction: schedule[ctx.index] ?? 'forward',
                    }) as Question | null,
            };
        },
        answerFrom: 'grid',
        // The flag is the whole question; a globe behind it is a distraction.
        usesGlobe: false,
        eyebrow: (q) => (q.meta.direction === 'reverse' ? 'Which flag' : 'Which country'),
    },

    [MODES.CLICK_COUNTRY]: {
        plan: (countries, scope) => {
            // The whole session is planned up front: there are no options to
            // generate, only targets to pick. A small region can yield fewer
            // than ten, so the plan's length is the total — assuming ten would
            // show "Question 8 of 10" on a quiz that ends at 8.
            const questions = generateClickCountrySession({
                countries,
                scope,
                rng: systemRng,
            }) as Question[];
            return { nextQuestion: fromPlan(questions) as NextQuestion, total: questions.length };
        },
        answerFrom: 'globe',
        usesGlobe: true,
        eyebrow: () => 'Find on the globe',
    },

    [MODES.CAPITAL]: {
        plan: () => ({
            nextQuestion: (ctx) => generateCapital(ctx) as Question | null,
        }),
        answerFrom: 'grid',
        usesGlobe: true,
        eyebrow: (q) => (q.meta.direction === 'reverse' ? 'Which country' : 'Which capital'),
    },
};
