/**
 * The frame around every question: progress, score, clock, close.
 *
 * Replaces `js/features/quiz/quiz-question-chrome.js`. That version rebuilt its
 * whole DOM on each `show()` and opened by deleting stale `#quiz-timer` spans by
 * query, because `QuizTimer` created its own and the two fought over the same
 * id. Rendering from state removes the fight rather than refereeing it.
 *
 * Two variants, as before:
 *   - `floating` — a card over the live globe, for the three modes whose
 *     question IS the globe.
 *   - `fullscreen` — takes the screen, for identify-the-flag, where the globe is
 *     not part of the question and would only distract.
 */
import Icon from './Icon';
import { formatDuration } from '../../lib/quiz/useElapsed';

export default function QuestionChrome({
    variant = 'floating',
    index,
    total,
    score,
    answered,
    elapsedMs,
    eyebrow,
    prompt,
    onClose,
    children,
}: {
    variant?: 'floating' | 'fullscreen';
    /** Zero-based; displayed one-based. */
    index: number;
    total: number;
    score: number;
    answered: number;
    elapsedMs: number;
    /** The small label above the prompt — "WHICH COUNTRY", "CLICK". */
    eyebrow: string;
    prompt: string;
    onClose: () => void;
    children?: React.ReactNode;
}) {
    return (
        <section className={`qz qz-${variant}`} aria-label="Quiz question">
            <header className="qz-bar">
                <p className="qz-progress-label">
                    Question {Math.min(index + 1, total)} of {total}
                </p>

                <div className="qz-chips">
                    <span className="qz-stat" title="Score">
                        <Icon name="checkCircle" size={16} />
                        {score}/{answered}
                    </span>
                    <span className="qz-stat" title="Elapsed">
                        <Icon name="clock" size={16} />
                        {formatDuration(elapsedMs)}
                    </span>
                </div>

                <button type="button" className="qz-close" onClick={onClose} aria-label="End quiz">
                    <Icon name="x" size={18} />
                </button>
            </header>

            {/* Native progress, so assistive tech gets the value without ARIA. */}
            <progress className="qz-progress" max={total} value={index}>
                {index} of {total}
            </progress>

            <div className="qz-prompt">
                <p className="qz-eyebrow">{eyebrow}</p>
                <p className="qz-main">{prompt}</p>
            </div>

            {children}
        </section>
    );
}
