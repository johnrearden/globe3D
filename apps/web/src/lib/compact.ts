/**
 * "Is this the phone layout?" — the shell's breakpoint, as a hook.
 *
 * `shell.css` switches the panel from a side column to a bottom sheet at
 * 899px, and everything placed around the globe (the top row of round buttons,
 * the Daily invite, the quiz launcher) changes shape with it. Components that
 * render differently on a phone ask here rather than reading `innerWidth`, so
 * there is one number and it is the stylesheet's; a reading that disagreed with
 * the CSS would put a control in a layout it was not designed for.
 */
import { useEffect, useState } from 'react';

export const COMPACT_QUERY = '(max-width: 899px)';

export function useCompact(): boolean {
    const [compact, setCompact] = useState(() =>
        typeof window !== 'undefined' && window.matchMedia(COMPACT_QUERY).matches);
    useEffect(() => {
        const mq = window.matchMedia(COMPACT_QUERY);
        const onChange = () => setCompact(mq.matches);
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);
    return compact;
}
