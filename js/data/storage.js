/**
 * The web platform's StorageAdapter bindings.
 *
 * This is the entire browser-specific half of @terragotcha/storage: everything
 * else in that package is platform-neutral, and apps/native will have a file
 * exactly this size binding MMKV instead.
 */

import { createWebStorage } from '@terragotcha/storage';

/** Persistent, survives a reload — settings, quiz history, the device token. */
export const webStorage = createWebStorage();

/**
 * Tab-scoped. Holds the signed audit token, which is deliberately NOT persisted:
 * it grants superuser-gated API access and must die with the tab.
 */
export const webSessionStorage = createWebStorage(
    typeof globalThis.sessionStorage !== 'undefined' ? globalThis.sessionStorage : undefined
);
