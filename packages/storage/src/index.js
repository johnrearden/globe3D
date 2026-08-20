/**
 * @terragotcha/storage — sync key-value persistence and the stores built on it.
 *
 * No DOM, no React. Runs unchanged in Node (vitest), the browser (via
 * index.html's import map), Astro/Vite, and React Native via Metro — the
 * platform difference is confined to which StorageAdapter gets injected.
 */

export {
    createMemoryStorage,
    createWebStorage,
    createNativeStorage,
    readJson,
    writeJson
} from './adapter.js';

export {
    createSettingsStore,
    SETTINGS_KEY,
    SETTINGS_DEFAULTS
} from './settings-store.js';

export {
    createQuizHistoryStore,
    QUIZ_HISTORY_KEY,
    MODE_LABELS,
    formatBestSuffix
} from './quiz-history-store.js';
