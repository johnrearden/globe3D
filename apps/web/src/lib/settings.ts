/**
 * React's view of the persisted settings.
 *
 * The store itself is `@terragotcha/storage`'s, reached through the web binding
 * (`js/data/settings-store.js`) so both apps read and write one localStorage
 * key. Nothing is re-implemented here; this is the subscription.
 *
 * **Why the snapshot is a version number.** `settingsStore.get()` returns a LIVE
 * reference — documented, and depended on by `settings-panel.js` and
 * `scene-appearance.js` — so its identity never changes. `useSyncExternalStore`
 * compares snapshots with `Object.is`, so returning the object would mean React
 * never re-rendered on a write. The store therefore exposes `getVersion()`,
 * which changes on every save, and components read the values separately.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { settingsStore } from '../../../../js/data/settings-store.js';
import type { GlobeSettings } from './globe-types';

/** Everything `SETTINGS_DEFAULTS` defines. */
export interface Settings extends GlobeSettings {
    theme?: string;
    showInfoPanel?: boolean;
}

const subscribe = (fn: () => void) => settingsStore.subscribe(fn);
const getVersion = () => settingsStore.getVersion();

/**
 * The current settings, re-rendering the caller whenever any are saved.
 *
 * @returns the values and a patcher. The patch is shallow-merged, one level deep
 *   for `autoRotate` and `lighting`, by the store — so
 *   `save({autoRotate: {speed: 2}})` keeps `enabled` and `delayMs`.
 */
export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
    // The server has no localStorage, so the third argument returns the same
    // version every time and the first render matches the client's. The values
    // read below come from the store's in-memory defaults there.
    useSyncExternalStore(subscribe, getVersion, () => 0);
    const save = useCallback((patch: Partial<Settings>) => {
        settingsStore.save(patch);
    }, []);
    return [settingsStore.get() as Settings, save];
}

/** Read once, without subscribing — for effects and one-shot boot work. */
export function readSettings(): Settings {
    return settingsStore.get() as Settings;
}
