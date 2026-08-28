/**
 * The count-up clock on a quiz.
 *
 * The one genuine gap in the package layer: elapsed time is not in quiz-core.
 * `toHistoryRecord(state, durationMs)` takes the duration as an argument
 * precisely because measuring it is a platform job — `performance.now()` on the
 * web, something else under Metro.
 *
 * Replaces `QuizTimer` (`js/features/quiz/quiz-timer.js`), which kept a
 * `setInterval` writing `textContent` into a `<span>` it created — and which
 * fought the question chrome over ownership of that span badly enough that the
 * chrome deletes stale ones by query on every show. None of that survives a
 * component that simply renders the number it is given.
 *
 * The timer is display only. The duration actually filed in history is measured
 * once at completion in `useQuizSession`, from the same clock, so a dropped
 * frame or a backgrounded tab cannot make the recorded time disagree with the
 * ticks the player saw.
 */
import { useEffect, useRef, useState } from 'react';

/** Format a duration in milliseconds as "M:SS" — 67000 → "1:07". */
export function formatDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Milliseconds since the hook first ran with `running` true.
 *
 * Ticks once a second, which is all a "M:SS" display can show — a rAF loop here
 * would re-render 60× for the same string.
 *
 * @param running pass false to freeze the clock (the reveal after the last
 *   question, so the results screen and the final tick agree).
 */
export function useElapsed(running = true): number {
    const startedAt = useRef<number | null>(null);
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!running) return;
        // Set on the first running render and never reset: pausing and resuming
        // must not restart the clock, and a quiz has exactly one start.
        startedAt.current ??= performance.now();
        const tick = () => setElapsed(performance.now() - startedAt.current!);
        tick();
        const id = window.setInterval(tick, 1000);
        return () => window.clearInterval(id);
    }, [running]);

    return elapsed;
}
