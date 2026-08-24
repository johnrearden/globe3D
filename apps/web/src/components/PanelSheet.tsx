/**
 * The docked content panel: a side panel on desktop, a draggable bottom sheet on
 * mobile.
 *
 * Hydrated (`client:idle`), but it receives the article through `children` as a
 * SLOT. That is the load-bearing detail: Astro renders slotted content to static
 * HTML and passes it through untouched, so the drag behaviour becomes
 * interactive while the prose inside stays plain server-rendered markup that no
 * hydration pass can wipe. Verified in the build output — the article text
 * appears in index.html and in none of the JS bundles.
 *
 * On a country-page cold load it starts EXPANDED — the reader arrived for the
 * text. On the app route it will peek, so the globe is the subject.
 *
 * The snap decision is IMPORTED from the vanilla app rather than reimplemented.
 * `decideSnap` is already a pure function with its behaviour pinned by
 * tests/panel-sheet-snap.test.js, and the surrounding module touches no DOM at
 * import time. Two implementations of a gesture threshold would drift, and the
 * one here would be the untested one.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
// eslint-disable-next-line import/no-relative-packages -- deliberate: see above.
import { decideSnap } from '../../../../js/features/daily-quiz/panel-sheet.js';

type SnapState = 'expanded' | 'collapsed';

export default function PanelSheet({
    children,
    initial = 'expanded',
}: {
    children?: ReactNode;
    initial?: SnapState;
}) {
    const [snap, setSnap] = useState<SnapState>(initial);
    const ref = useRef<HTMLDivElement>(null);
    const drag = useRef<{ startY: number; startT: number } | null>(null);

    // Only after hydration does the sheet become draggable. Before that it is a
    // plain panel showing the same content — which is what a crawler, or a
    // visitor with JS disabled, gets, and it is why the article is readable
    // whether or not this island ever runs.
    const [interactive, setInteractive] = useState(false);
    useEffect(() => setInteractive(true), []);

    const onPointerDown = (e: React.PointerEvent) => {
        if (!interactive) return;
        drag.current = { startY: e.clientY, startT: performance.now() };
        (e.target as Element).setPointerCapture?.(e.pointerId);
    };

    const onPointerUp = (e: React.PointerEvent) => {
        const d = drag.current;
        if (!d || !ref.current) return;
        drag.current = null;

        // decideSnap works in the vanilla sheet's terms: an absolute downward
        // offset against the panel's travel, plus release velocity. Collapsed
        // travel is the panel height less the grip that stays on screen.
        const dy = e.clientY - d.startY;
        const dt = Math.max(1, performance.now() - d.startT);
        const travel = Math.max(0, ref.current.offsetHeight - gripPx(ref.current));
        const offset = snap === 'collapsed' ? travel + dy : dy;
        setSnap(decideSnap(offset, travel, dy / dt) as SnapState);
    };

    return (
        <div
            ref={ref}
            className="panel-sheet"
            data-snap={snap}
            data-interactive={interactive ? 'true' : 'false'}
        >
            <button
                type="button"
                className="panel-grip"
                aria-label={snap === 'expanded' ? 'Collapse panel' : 'Expand panel'}
                aria-expanded={snap === 'expanded'}
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onClick={() => setSnap(snap === 'expanded' ? 'collapsed' : 'expanded')}
            />
            <div className="panel-body">{children}</div>
        </div>
    );
}

/**
 * How much of the panel stays on screen when collapsed, read from the stylesheet
 * rather than restated here.
 *
 * The CSS needs this number for its collapse transform and the drag maths needs
 * the same one; two declarations would drift silently into a sheet that snaps to
 * the wrong place. `--panel-grip` in country.css is the single source, and the
 * fallback only matters if this component is ever mounted without that
 * stylesheet.
 */
function gripPx(el: HTMLElement): number {
    const raw = getComputedStyle(el).getPropertyValue('--panel-grip').trim();
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : 44;
}
