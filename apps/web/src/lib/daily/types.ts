/**
 * The Daily Challenge's wire shapes.
 *
 * These describe what the Django backend sends, which is deliberately NOT the
 * same as quiz-core's client-side payload. Both carry a `map` block and a
 * `grid`, but the server's map is `{center, zoom, focusCountry, lockRotation}`
 * — an explicit camera — while quiz-core's is `{focus, marker, lock}`, a
 * description the client turns into one. Keeping the two apart is why there are
 * two appliers (`lib/daily/server-map.ts` and `lib/quiz/globe-choreography.ts`)
 * rather than one that guesses which shape it has.
 *
 * The server never sends the answer with the question. It arrives in the
 * `reveal` of the response to submitting one, which is the whole reason grading
 * is server-side.
 */

export interface DailyOption {
    value: string;
    label?: string;
}

/** How an answer is given. Four methods; two are grids, two are globe taps. */
export type AnswerMethod =
    | 'grid-single'
    | 'grid-multi'
    | 'map-click-single'
    | 'map-click-multi';

export interface ServerMapBlock {
    /** Where to point the camera. Always present when `map` is. */
    center: { lat: number; lng: number };
    /** An explicit camera distance. Absent for a single-subject question. */
    zoom?: number;
    /** Frame this country instead, when `zoom` is absent. */
    focusCountry?: string;
    /** Tint these; the first is the subject. */
    highlight?: string[];
    /** Stop the player spinning the subject out of frame. Ignored for map clicks. */
    lockRotation?: boolean;
    focalAnchor?: { x: number; y: number };
}

export interface DailyQuestion {
    index: number;
    prompt: string;
    answer: { method: AnswerMethod };
    grid?: {
        options: DailyOption[];
        cols?: number;
        multiSelect?: boolean;
        display?: string;
    };
    /** An ISO-2 code, for a "whose flag is this" question. */
    flag?: string | null;
    map?: ServerMapBlock | null;
}

/** The grade, same shape the client-side `gradeLocally` produces. */
export interface DailyReveal {
    correct: boolean;
    correctOptions?: string[];
    yourSelections?: string[];
    rightPicks?: string[];
    wrongPicks?: string[];
    missed?: string[];
}

export interface StartResponse {
    attemptId: string;
    questionCount: number;
    runningScore: number;
    question: DailyQuestion | null;
}

export interface AnswerResponse {
    runningScore: number;
    reveal: DailyReveal;
    done: boolean;
    next: DailyQuestion | null;
}

export interface TodayResponse {
    attempt?: { status?: string } | null;
}

export interface LeaderboardEntry {
    rank: number;
    nickname: string;
    country: string;
    score: number;
    timeMs: number;
}

export interface LeaderboardData {
    quizDate?: string;
    entries?: LeaderboardEntry[];
    you?: { rank: number; score: number; timeMs: number; country: string } | null;
}

/** Only the methods the Daily Challenge uses; the client has more. */
export interface ApiClient {
    readonly isRegistered: boolean;
    readonly profile: { nickname?: string; country?: string };
    getToday(): Promise<TodayResponse>;
    startDaily(): Promise<StartResponse>;
    submitAnswer(
        attemptId: string,
        index: number,
        answer: string | string[],
        elapsedMs: number,
    ): Promise<AnswerResponse>;
    getLeaderboard(date?: string): Promise<LeaderboardData>;
    registerPlayer(nickname: string, country: string): Promise<unknown>;
}
