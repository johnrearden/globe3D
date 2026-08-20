/**
 * StorageAdapter contract.
 *
 * The interesting cases are all failure cases: storage that throws is the norm
 * in Safari private mode and in embedded webviews, and a store that lets those
 * escape takes the app down on a preference write.
 */
import { describe, it, expect } from 'vitest';
import {
    createMemoryStorage, createWebStorage, createNativeStorage, readJson, writeJson
} from '../src/adapter.js';

/** Minimal Web Storage stand-in whose methods can be made to throw. */
function fakeWebStorage({ throwOn = [] } = {}) {
    const map = new Map();
    const guard = (op, fn) => (...args) => {
        if (throwOn.includes(op)) throw new DOMException('QuotaExceededError');
        return fn(...args);
    };
    return {
        getItem: guard('get', k => (map.has(k) ? map.get(k) : null)),
        setItem: guard('set', (k, v) => { map.set(k, String(v)); }),
        removeItem: guard('remove', k => { map.delete(k); }),
    };
}

describe.each([
    ['memory', () => createMemoryStorage()],
    ['web', () => createWebStorage(fakeWebStorage())],
    ['native (mmkv)', () => {
        const m = new Map();
        return createNativeStorage({
            getString: k => (m.has(k) ? m.get(k) : undefined),
            set: (k, v) => m.set(k, v),
            delete: k => m.delete(k),
        });
    }],
])('%s adapter', (_name, make) => {
    it('returns null for an absent key', () => {
        expect(make().get('nope')).toBe(null);
    });

    it('round-trips a value', () => {
        const s = make();
        s.set('k', 'v');
        expect(s.get('k')).toBe('v');
    });

    it('removes a value', () => {
        const s = make();
        s.set('k', 'v');
        s.remove('k');
        expect(s.get('k')).toBe(null);
    });
});

describe('createWebStorage failure handling', () => {
    it('falls back to memory when the probe write throws', () => {
        // Safari private mode: localStorage exists, and setItem throws.
        const s = createWebStorage(fakeWebStorage({ throwOn: ['set'] }));
        s.set('k', 'v');
        expect(s.get('k')).toBe('v');   // memory fallback took over
    });

    it('falls back to memory when there is no localStorage at all', () => {
        const s = createWebStorage(undefined);
        s.set('k', 'v');
        expect(s.get('k')).toBe('v');
    });

    it('never throws on a read that throws', () => {
        const backing = fakeWebStorage();
        const s = createWebStorage(backing);
        backing.getItem = () => { throw new Error('boom'); };
        expect(() => s.get('k')).not.toThrow();
        expect(s.get('k')).toBe(null);
    });
});

describe('readJson', () => {
    it('returns the fallback for an absent key', () => {
        expect(readJson(createMemoryStorage(), 'k', { a: 1 })).toEqual({ a: 1 });
    });

    it('returns the fallback for corrupt JSON', () => {
        const s = createMemoryStorage({ k: '{not json' });
        expect(readJson(s, 'k', { a: 1 })).toEqual({ a: 1 });
    });

    it.each([['null', 'null'], ['a number', '7'], ['an array', '[1,2]'], ['a string', '"hi"']])(
        'returns the fallback when the stored value is %s',
        (_label, raw) => {
            // These all parse successfully, and all of them would break the
            // `{ ...DEFAULTS, ...parsed }` spread the stores do.
            expect(readJson(createMemoryStorage({ k: raw }), 'k', { a: 1 })).toEqual({ a: 1 });
        }
    );

    it('returns the parsed object when it is one', () => {
        expect(readJson(createMemoryStorage({ k: '{"a":2}' }), 'k', { a: 1 })).toEqual({ a: 2 });
    });
});

describe('writeJson', () => {
    it('round-trips through readJson', () => {
        const s = createMemoryStorage();
        writeJson(s, 'k', { a: [1, 2], b: 'x' });
        expect(readJson(s, 'k', null)).toEqual({ a: [1, 2], b: 'x' });
    });
});
