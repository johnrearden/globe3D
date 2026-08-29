/**
 * The icon set, as inline SVG.
 *
 * Inline rather than an icon font, per the project rule: no webfont `<link>`,
 * no `<i class="…">` glyphs. These are the Phosphor regular glyphs the vanilla
 * UI already used, ported from the markup strings in `quiz-mode-picker.js` and
 * `quiz-question-chrome.js` — same art, no `innerHTML`.
 *
 * `fill="currentColor"` is what makes them theme-able: colour comes from the CSS
 * `color` of whatever contains them, so an icon inside a primary button is
 * `--on-primary` without this file knowing that token exists.
 */

export type IconName =
    | 'globe' | 'flag' | 'pin' | 'bank' | 'arrowRight'
    | 'x' | 'clock' | 'checkCircle' | 'check' | 'plus'
    | 'faders';

/**
 * Phosphor regular, 256×256 viewBox — except `faders`, which is drawn here.
 *
 * A value may be several path strings, because not every glyph is one stroke:
 * `faders` is three tracks and three knobs. They share one `fill`, so the knob
 * reads as a knob by being taller than its track rather than by contrast.
 */
const PATHS: Record<IconName, string | string[]> = {
    globe: 'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24ZM62.29,186.47l2.52-1.65A16,16,0,0,0,72,171.53l.21-36.23L93.17,104a3.62,3.62,0,0,0,.32.22l19.67,12.87a15.94,15.94,0,0,0,11.35,2.77L156,115.59a16,16,0,0,0,10-5.41l22.17-25.76A16,16,0,0,0,192,74V67.67A87.87,87.87,0,0,1,211.77,155l-16.14-14.76a16,16,0,0,0-16.93-3l-30.46,12.65a16.08,16.08,0,0,0-9.68,12.45l-2.39,16.19a16,16,0,0,0,11.77,17.81L169.4,202l2.36,2.37A87.88,87.88,0,0,1,62.29,186.47ZM40,128a87.78,87.78,0,0,1,9.64-40.1L73,104.51,52.13,135.82a8,8,0,0,0-1.29,3.78l-.22,38.77a88.1,88.1,0,0,1-10.62-50.37Zm136-64V74l-22.17,25.76-31.54,4.27L102.62,91.16a19.93,19.93,0,0,0-10.12-3.14l-32.14.21A88,88,0,0,1,128,40a87.44,87.44,0,0,1,48,14.24Z',
    flag: 'M42.76,50A8,8,0,0,0,40,56V224a8,8,0,0,0,16,0V179.77c26.79-21.16,49.87-9.75,76.45,3.41,16.4,8.11,34.06,16.85,53,16.85,13.93,0,28.54-4.75,43.82-18a8,8,0,0,0,2.76-6V56a8,8,0,0,0-13.27-6c-28,24.23-51.72,12.49-79.21-1.12C111.07,34.76,78.78,18.79,42.76,50ZM216,172.25c-26.79,21.16-49.87,9.74-76.45-3.41-25-12.35-52.81-26.13-83.55-8.4V59.79c26.79-21.16,49.87-9.75,76.45,3.4,25,12.35,52.82,26.13,83.55,8.4Z',
    pin: 'M128,64a40,40,0,1,0,40,40A40,40,0,0,0,128,64Zm0,64a24,24,0,1,1,24-24A24,24,0,0,1,128,128Zm0-112a88.1,88.1,0,0,0-88,88c0,31.4,14.51,64.68,42,96.25a254.19,254.19,0,0,0,41.45,38.3,8,8,0,0,0,9.18,0A254.19,254.19,0,0,0,174,200.25c27.45-31.57,42-64.85,42-96.25A88.1,88.1,0,0,0,128,16Zm0,206c-16.53-13-72-60.75-72-118a72,72,0,0,1,144,0C200,161.23,144.53,209,128,222Z',
    bank: 'M24,104H48v64H32a8,8,0,0,0,0,16H224a8,8,0,0,0,0-16H208V104h24a8,8,0,0,0,4.19-14.81l-104-64a8,8,0,0,0-8.38,0l-104,64A8,8,0,0,0,24,104Zm40,0H96v64H64Zm80,0v64H112V104Zm48,64H160V104h32ZM128,41.39,203.74,88H52.26ZM248,208a8,8,0,0,1-8,8H16a8,8,0,0,1,0-16H240A8,8,0,0,1,248,208Z',
    arrowRight: 'M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69l-58.35-58.34a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z',
    x: 'M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z',
    clock: 'M128,40a88,88,0,1,0,88,88A88.1,88.1,0,0,0,128,40Zm0,160a72,72,0,1,1,72-72A72.08,72.08,0,0,1,128,200Zm64-72a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z',
    checkCircle: 'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm45.66,85.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z',
    check: 'M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z',
    faders: [
        'M40 56h176v16H40zM104 44a20 20 0 1 0 0 40a20 20 0 1 0 0 -40z', 'M40 120h176v16H40zM168 108a20 20 0 1 0 0 40a20 20 0 1 0 0 -40z', 'M40 184h176v16H40zM88 172a20 20 0 1 0 0 40a20 20 0 1 0 0 -40z',
    ],
    plus: 'M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z',
};

export default function Icon({
    name,
    size = 18,
    className,
}: {
    name: IconName;
    size?: number;
    className?: string;
}) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 256 256"
            width={size}
            height={size}
            fill="currentColor"
            className={className}
            // Decorative: every icon here sits beside its own text label, so a
            // screen reader announcing it would only repeat the label.
            aria-hidden="true"
            focusable="false"
        >
            {(Array.isArray(PATHS[name]) ? PATHS[name] : [PATHS[name]]).map((d, i) => (
                <path key={i} d={d as string} />
            ))}
        </svg>
    );
}
