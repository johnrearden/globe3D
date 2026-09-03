/**
 * Settings — how the globe looks, and whether it drifts.
 *
 * A rewrite of `js/features/settings-panel.js`, whose 524 lines were mostly
 * `document.createElement` scaffolding for rows, checkboxes and sliders. The
 * substance is small: every control writes one key and calls one method.
 *
 * **It never touches the engine.** The vanilla panel held `globeManager`,
 * `cameraController`, `labelManager` and raw shader uniforms, which is why it
 * could not have been ported to native. Everything here goes through
 * `GlobeAppearance` (`packages/globe-bridge/src/appearance.js`), so the only
 * thing crossing is names and plain numbers.
 *
 * **The store is the single writer of truth, and the globe follows it.** Each
 * control saves the setting and applies it; on reload `GlobeIsland` replays the
 * lot through `applyAll`. There is no separate "current" state here to drift.
 *
 * ## What is deliberately not here yet
 *
 * - **UI theme** and the remote-theme picker. They need the backend cutover
 *   (B9); offering a theme control against the legacy 24-knob vocabulary would
 *   style nothing. The *knobs* are editable today through the dev-only Theme
 *   Lab, which needs no backend.
 * - **The dev editors** (labels, colours, zoom, audit). Not being ported;
 *   `index.html` keeps them.
 *
 * "Country info panel" has now arrived (`CountryInfo.tsx`), and its switch is
 * the one control here that drives no globe method: the panel is React, so
 * enabling it is a component reading `showInfoPanel` and rendering. That is why
 * `GlobeAppearance` did not have to grow for it.
 */
import { useEffect, useState } from 'react';
import { useSettings } from '../../lib/settings';
import { closeOverlay } from '../../lib/overlay';
import type { GlobeAppearance, Lighting } from '../../lib/globe-types';

/**
 * True when a superuser arrived via `/audit/launch`.
 *
 * Lighting is optics rather than palette — a value here can make the globe
 * unreadable — so it stays behind the same gate the vanilla panel used.
 */
function hasAuditToken(): boolean {
    try {
        return !!sessionStorage.getItem('tg-audit-token');
    } catch {
        // Private mode, or storage blocked. Not a superuser, then.
        return false;
    }
}

function Toggle({
    label,
    checked,
    onChange,
}: {
    label: string;
    checked: boolean;
    onChange: (next: boolean) => void;
}) {
    return (
        <label className="ctl-row ctl-toggle">
            <span className="ctl-label">{label}</span>
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.currentTarget.checked)}
            />
            <span className="ctl-switch" aria-hidden="true" />
        </label>
    );
}

function Slider({
    label,
    value,
    min,
    max,
    step,
    format,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    format?: (v: number) => string;
    onChange: (next: number) => void;
}) {
    return (
        <label className="ctl-row ctl-slider">
            <span className="ctl-label">{label}</span>
            <span className="ctl-value">{format ? format(value) : value}</span>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.currentTarget.value))}
            />
        </label>
    );
}

export default function SettingsSheet({ appearance }: { appearance: GlobeAppearance }) {
    const [settings, save] = useSettings();

    // Read once: the set a renderer offers cannot change during a session, and
    // calling it per render would rebuild the array every time.
    const [schemes] = useState(() => appearance.schemes());
    const [showLighting] = useState(hasAuditToken);

    // Escape closes, as it does for every sheet.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeOverlay();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    /** Save and apply together — the two must never disagree. */
    // `apply` is optional because not every setting drives the engine: the
    // country info panel is a React component that reads `showInfoPanel`, so
    // saving it IS applying it. Every setting that does touch the globe still
    // passes its call here, so the store and the renderer cannot disagree.
    const set = <K extends keyof typeof settings>(
        key: K,
        value: (typeof settings)[K],
        apply?: () => void,
    ) => {
        save({ [key]: value } as never);
        apply?.();
    };

    const rotate = settings.autoRotate ?? {};
    const lighting: Lighting = settings.lighting ?? appearance.lightingDefaults();

    return (
        <div
            className="sheet-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-heading"
        >
            <button
                type="button"
                className="sheet-scrim"
                onClick={closeOverlay}
                aria-label="Close settings"
            />

            <div className="sheet">
                <div className="sheet-grabber" aria-hidden="true" />
                <h2 id="settings-heading" className="sheet-title">Settings</h2>

                <p className="sheet-section-label">Appearance</p>

                <fieldset className="ctl-fieldset">
                    <legend className="ctl-label">Colour scheme</legend>
                    <div className="ctl-chips">
                        {schemes.map((s) => (
                            <label key={s.key} className="ctl-chip">
                                <input
                                    type="radio"
                                    name="country-scheme"
                                    value={s.key}
                                    checked={settings.scheme === s.key}
                                    onChange={() =>
                                        set('scheme', s.key, () => appearance.setCountryScheme(s.key))
                                    }
                                />
                                <span>{s.label}</span>
                            </label>
                        ))}
                    </div>
                </fieldset>

                <Toggle
                    label="Show countries"
                    checked={settings.showCountries !== false}
                    onChange={(v) =>
                        set('showCountries', v, () => appearance.setCountriesVisible(v))
                    }
                />
                <Toggle
                    label="Country names"
                    checked={settings.showLabels !== false}
                    onChange={(v) => set('showLabels', v, () => appearance.setLabelsVisible(v))}
                />
                <Toggle
                    label="Country info panel"
                    checked={settings.showInfoPanel !== false}
                    onChange={(v) => set('showInfoPanel', v)}
                />
                <Toggle
                    label="Country borders"
                    checked={!!settings.borders}
                    onChange={(v) => set('borders', v, () => appearance.setBordersVisible(v))}
                />
                <Slider
                    label="Border strength"
                    value={settings.borderOpacity ?? 0.2}
                    min={0.1}
                    max={1}
                    step={0.05}
                    format={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) =>
                        set('borderOpacity', v, () => appearance.setBorderOpacity(v))
                    }
                />
                <Toggle
                    label="Selection gradient"
                    checked={!!settings.selGradient}
                    onChange={(v) =>
                        set('selGradient', v, () => appearance.setSelectionGradient(v))
                    }
                />

                <p className="sheet-section-label">Rotation</p>

                <Toggle
                    label="Spin when idle"
                    checked={rotate.enabled !== false}
                    onChange={(v) => {
                        save({ autoRotate: { enabled: v } });
                        appearance.setAutoRotate({ enabled: v });
                    }}
                />
                <Slider
                    label="Idle delay"
                    value={(rotate.delayMs ?? 120000) / 1000}
                    min={5}
                    max={300}
                    step={5}
                    format={(v) => `${v}s`}
                    onChange={(v) => {
                        save({ autoRotate: { delayMs: v * 1000 } });
                        appearance.setAutoRotate({ delayMs: v * 1000 });
                    }}
                />
                <Slider
                    label="Spin speed"
                    value={rotate.speed ?? 1}
                    min={0.2}
                    max={3}
                    step={0.1}
                    format={(v) => `${v.toFixed(1)}×`}
                    onChange={(v) => {
                        save({ autoRotate: { speed: v } });
                        appearance.setAutoRotate({ speed: v });
                    }}
                />

                {showLighting && (
                    <>
                        <p className="sheet-section-label">Lighting</p>
                        {([
                            ['ambient', 'Ambient', 0, 1.5, 0.05],
                            ['diffuse', 'Diffuse', 0, 1.5, 0.05],
                            ['specStrength', 'Specular', 0, 1, 0.02],
                            ['shininess', 'Shininess', 2, 120, 1],
                            ['oceanSpecBoost', 'Ocean glint', 0, 3, 0.1],
                        ] as Array<[keyof Lighting, string, number, number, number]>).map(
                            ([key, label, min, max, step]) => (
                                <Slider
                                    key={key}
                                    label={label}
                                    value={lighting[key]}
                                    min={min}
                                    max={max}
                                    step={step}
                                    onChange={(v) => {
                                        // The whole block every time: the store
                                        // merges one level deep, and applying a
                                        // partial block would reset the other
                                        // four uniforms to their defaults.
                                        const next = { ...lighting, [key]: v };
                                        save({ lighting: next });
                                        appearance.setLighting(next);
                                    }}
                                />
                            ),
                        )}
                        <button
                            type="button"
                            className="ctl-button"
                            onClick={() => {
                                save({ lighting: null });
                                appearance.setLighting(null);
                            }}
                        >
                            Reset lighting
                        </button>
                    </>
                )}

                <button type="button" className="sheet-dismiss" onClick={closeOverlay}>
                    Done
                </button>
            </div>
        </div>
    );
}
