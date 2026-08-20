/**
 * The two persisted stores, against a memory adapter.
 *
 * Weighted toward the things real user data depends on: the on-disk key and
 * record shape (people already have history under `globe3d-quiz-history`), the
 * per-mode×scope "best" comparison the celebration overlay shows, and the
 * one-level-deep settings merge that settings-panel.js relies on.
 */
import { describe, it, expect } from 'vitest';
import { createMemoryStorage } from '../src/adapter.js';
import { createSettingsStore, SETTINGS_KEY, SETTINGS_DEFAULTS } from '../src/settings-store.js';
import {
    createQuizHistoryStore, QUIZ_HISTORY_KEY, MODE_LABELS, formatBestSuffix
} from '../src/quiz-history-store.js';

describe('settings store', () => {
    it('starts at the defaults with empty storage', () => {
        const s = createSettingsStore(createMemoryStorage());
        expect(s.get()).toEqual(SETTINGS_DEFAULTS);
    });

    it('merges nested autoRotate one level deep rather than replacing it', () => {
        const s = createSettingsStore(createMemoryStorage());
        s.save({ autoRotate: { speed: 2.5 } });
        // enabled/delayMs must survive — the settings panel patches one field.
        expect(s.get().autoRotate).toEqual({ enabled: true, delayMs: 120000, speed: 2.5 });
    });

    it('replaces arrays and scalars rather than merging them', () => {
        const s = createSettingsStore(createMemoryStorage());
        s.save({ scheme: 'blues', borderOpacity: 0.8 });
        expect(s.get().scheme).toBe('blues');
        expect(s.get().borderOpacity).toBe(0.8);
    });

    it('persists under the stable key and reloads', () => {
        const storage = createMemoryStorage();
        createSettingsStore(storage).save({ scheme: 'purples' });
        expect(JSON.parse(storage.get(SETTINGS_KEY)).scheme).toBe('purples');
        expect(createSettingsStore(storage).get().scheme).toBe('purples');
    });

    it('backfills newly added defaults into an older stored payload', () => {
        // A user on an old build has no `selGradient` key; it must not be undefined.
        const storage = createMemoryStorage({ [SETTINGS_KEY]: JSON.stringify({ scheme: 'greys' }) });
        const s = createSettingsStore(storage);
        expect(s.get().selGradient).toBe(true);
        expect(s.get().autoRotate).toEqual(SETTINGS_DEFAULTS.autoRotate);
    });

    it('falls back to defaults on a corrupt payload', () => {
        const storage = createMemoryStorage({ [SETTINGS_KEY]: 'not json at all' });
        expect(createSettingsStore(storage).get()).toEqual(SETTINGS_DEFAULTS);
    });
});

const session = (over = {}) => ({
    ts: 1000, mode: 'name-flag', scope: 'globe', score: 5, total: 10, durationMs: 30000,
    questions: [{ country: 'France', correct: true }, { country: 'Chad', correct: false }],
    ...over,
});

describe('quiz history store', () => {
    it('keeps the four mode ids user records already use', () => {
        // Changing these silently orphans every existing record.
        expect(Object.keys(MODE_LABELS).sort())
            .toEqual(['capital', 'click-country', 'identify-flag', 'name-flag']);
    });

    it('records a session under the stable key', () => {
        const storage = createMemoryStorage();
        createQuizHistoryStore(storage).record(session());
        const raw = JSON.parse(storage.get(QUIZ_HISTORY_KEY));
        expect(raw.sessions).toHaveLength(1);
        expect(raw.sessions[0]).toMatchObject({ mode: 'name-flag', score: 5, total: 10 });
    });

    it('reports no best on the first-ever game', () => {
        const s = createQuizHistoryStore(createMemoryStorage());
        const summary = s.record(session());
        expect(summary.isNewBest).toBe(false);
        expect(summary.gamesPlayed).toBe(1);
        expect(formatBestSuffix(summary)).toBe('');
    });

    it('flags a new best only against the same mode AND scope', () => {
        const s = createQuizHistoryStore(createMemoryStorage());
        s.record(session({ score: 5 }));
        // Different scope — not comparable, so still not a "best".
        expect(s.record(session({ score: 9, scope: 'Europe' })).isNewBest).toBe(false);
        // Same mode+scope and higher — a genuine best.
        const better = s.record(session({ score: 7 }));
        expect(better.isNewBest).toBe(true);
        expect(formatBestSuffix(better)).toBe(' · 🎉 New best!');
    });

    it('does not flag a tie as a new best', () => {
        const s = createQuizHistoryStore(createMemoryStorage());
        s.record(session({ score: 5 }));
        expect(s.record(session({ score: 5 })).isNewBest).toBe(false);
    });

    it('accumulates per-country tallies across sessions', () => {
        const s = createQuizHistoryStore(createMemoryStorage());
        s.record(session());
        s.record(session({ questions: [{ country: 'Chad', correct: false }] }));
        const chad = s.getCountryStats().find(c => c.country === 'Chad');
        expect(chad).toEqual({ country: 'Chad', asked: 2, correct: 0, pct: 0 });
    });

    it('sorts country stats worst-first, breaking ties by most asked', () => {
        const s = createQuizHistoryStore(createMemoryStorage());
        s.record(session({ questions: [
            { country: 'Chad', correct: false },
            { country: 'Chad', correct: false },
            { country: 'Peru', correct: false },
            { country: 'France', correct: true },
        ] }));
        expect(s.getCountryStats().map(c => c.country)).toEqual(['Chad', 'Peru', 'France']);
    });

    it('rolls up per mode×scope for the stats screen', () => {
        const s = createQuizHistoryStore(createMemoryStorage());
        s.record(session({ score: 4, durationMs: 40000 }));
        s.record(session({ score: 8, durationMs: 20000, ts: 2000 }));
        const [row] = s.getModeStats();
        expect(row).toMatchObject({
            mode: 'name-flag', scope: 'globe', games: 2,
            bestScore: 8, bestPct: 80, avgPct: 60,
            bestTimeMs: 20000, avgTimeMs: 30000, lastTs: 2000,
        });
    });

    it('returns sessions newest-first and filters by mode', () => {
        const s = createQuizHistoryStore(createMemoryStorage());
        s.record(session({ ts: 1 }));
        s.record(session({ ts: 2, mode: 'capital' }));
        expect(s.getSessions().map(x => x.ts)).toEqual([2, 1]);
        expect(s.getSessions({ mode: 'capital' }).map(x => x.ts)).toEqual([2]);
    });

    it('prunes sessions past the cap but keeps the permanent country tally', () => {
        const s = createQuizHistoryStore(createMemoryStorage());
        for (let i = 0; i < 205; i++) s.record(session({ ts: i }));
        expect(s.getTotalGames()).toBe(200);
        // 205 sessions × 1 Chad question each — the tally outlives the pruning.
        expect(s.getCountryStats().find(c => c.country === 'Chad').asked).toBe(205);
    });

    it('survives a corrupt payload rather than throwing on the next quiz', () => {
        const storage = createMemoryStorage({ [QUIZ_HISTORY_KEY]: '{"sessions": "not an array"}' });
        const s = createQuizHistoryStore(storage);
        expect(s.getTotalGames()).toBe(0);
        expect(() => s.record(session())).not.toThrow();
    });

    it('clear() wipes sessions and tallies', () => {
        const s = createQuizHistoryStore(createMemoryStorage());
        s.record(session());
        s.clear();
        expect(s.getTotalGames()).toBe(0);
        expect(s.getCountryStats()).toEqual([]);
    });
});
