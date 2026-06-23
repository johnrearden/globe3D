/**
 * Vendored icons — a small local subset of Phosphor Icons (MIT, v2.1.1), the
 * Terragotcha design system's chosen icon set. We bundle only the individual
 * glyphs we actually use as inline SVG strings rather than pulling the whole
 * Phosphor webfont. Each SVG uses `fill="currentColor"` so it themes via CSS
 * `color`; size it by setting `width`/`height` (or `font-size` on a wrapper).
 *
 * To add an icon: copy its raw SVG from
 *   https://unpkg.com/@phosphor-icons/core@2.1.1/assets/<weight>/<name>.svg
 * keeping `viewBox="0 0 256 256"` and `fill="currentColor"`.
 */

// `calendar-dots` (regular) — the design system's "daily" icon.
export const calendarDots =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false"><path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Zm-68-76a12,12,0,1,1-12-12A12,12,0,0,1,140,132Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,184,132ZM96,172a12,12,0,1,1-12-12A12,12,0,0,1,96,172Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,140,172Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,184,172Z"/></svg>';
