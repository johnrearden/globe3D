/**
 * Web binding for the settings store.
 *
 * The store itself lives in @terragotcha/storage so React Native can share it;
 * this file exists only to construct the singleton against localStorage, which
 * keeps every existing `import { settingsStore }` call site working unchanged.
 */

import { createSettingsStore } from '@terragotcha/storage';
import { webStorage } from './storage.js';

export const settingsStore = createSettingsStore(webStorage);
