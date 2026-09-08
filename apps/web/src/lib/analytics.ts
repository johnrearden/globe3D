/**
 * GA4 events. The tag itself is static in the head (`lib/site-head.ts`); this
 * is only the `gtag('event', …)` side.
 *
 * `gtag` is the function the consent snippet defines, and it exists only on a
 * production build — so every call here is a no-op in dev and never throws.
 * Analytics must not be able to break the app.
 */
import { quizStore } from '@terragotcha/quiz-core';

type Gtag = (...args: unknown[]) => void;

export function track(name: string, params: Record<string, unknown> = {}): void {
    try {
        (window as unknown as { gtag?: Gtag }).gtag?.('event', name, params);
    } catch {
        // swallow
    }
}

let wired = false;

/**
 * The events already observable from a store, wired once. `onActiveChange`
 * rather than `subscribe`: the store mirrors the session on every dispatch, so
 * a raw subscription would fire an event per answered question.
 */
export function installAutoEvents(): void {
    if (wired) return;
    wired = true;
    quizStore.onActiveChange((active: boolean, mode?: string) => {
        if (active) track('quiz_start', { mode: mode || 'unknown' });
    });
}
