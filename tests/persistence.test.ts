import { describe, expect, it } from 'vitest';
import { SaveRepository, type StoragePort } from '../src/game/persistence';
import { newGame, LEGACY_SAVE_KEY, SAVE_KEY, maxHp, maxMp, parseSave } from '../src/game/state';
class MemoryStore implements StoragePort {
  data = new Map<string, string>(); failReads = false; failWrites = false;
  getItem(key: string) { if (this.failReads) throw Error('SecurityError'); return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failWrites) throw Error('QuotaExceededError'); this.data.set(key, value); }
}
function progressed() { const s = newGame(); s.level = 8; s.chapter = 4; s.zone = 'depths'; s.armor = 3; s.hp = 73; s.mp = 14; s.gold = 832; s.potions = 9; s.kills = { tiger: 2, shark: 1 }; s.totalKills = 28; s.playTime = 532; s.muted = true; return s; }

describe('durable migration and recovery', () => {
  it('migrates v1 without mutating its original bytes and never refills resources', () => {
    const store = new MemoryStore(); const old = { ...progressed(), version: 1 }; const raw = JSON.stringify(old); store.setItem(LEGACY_SAVE_KEY, raw);
    const repo = new SaveRepository(store), result = repo.load(); expect(result.status).toBe('migrated'); expect(store.data.size).toBe(1);
    for (const key of ['level','chapter','gold','hp','mp','armor','potions','totalKills','playTime','muted','zone'] as const) expect(result.state[key]).toEqual(old[key]);
    expect(result.state.difficulty).toBe('adventure'); expect(result.state.ownedItems).toHaveLength(3);
    repo.save(result.state); expect(store.getItem(LEGACY_SAVE_KEY)).toBe(raw); expect(new SaveRepository(store).load().status).toBe('loaded');
  });
  it('round trips equipment, difficulty, cooldowns and zero HP', () => {
    const store = new MemoryStore(), repo = new SaveRepository(store), state = progressed();
    state.ownedItems.push('ember_sword'); state.equipment.sword = 'ember_sword'; state.difficulty = 'veteran'; state.cooldowns = { attack: .4, q: 4.7, e: 3, r: 8, t: 9, dodge: 1.2, potion: 2 }; state.hp = 0;
    repo.save(state); expect(repo.load().state).toEqual(state);
  });
  it.each(['{broken', '{"version":99}', '{"version":2}', JSON.stringify({ ...progressed(), mp: null })])('locks corrupt/unsupported saves until explicit recovery: %s', bad => {
    const store = new MemoryStore(); store.setItem(SAVE_KEY, bad); store.setItem(LEGACY_SAVE_KEY, JSON.stringify({ ...progressed(), version: 1 }));
    const repo = new SaveRepository(store), result = repo.load(); expect(result.status).toBe('blocked'); expect(result.legacy?.level).toBe(8);
    expect(repo.save(newGame())).toBe(false); expect(store.getItem(SAVE_KEY)).toBe(bad);
    expect(repo.recover(result.legacy!)).toBe(true); expect([...store.data].filter(([key]) => key.startsWith(`${SAVE_KEY}-backup-`))[0][1]).toBe(bad);
    expect(repo.load().state.level).toBe(8);
  });
  it('does not overwrite legacy or current saves when backups fail', () => {
    const store = new MemoryStore(); store.setItem(LEGACY_SAVE_KEY, 'broken'); store.setItem(SAVE_KEY, 'original');
    const repo = new SaveRepository(store); repo.load(); store.failWrites = true;
    expect(repo.recover(newGame())).toBe(false); expect(repo.locked).toBe(true); expect(store.getItem(SAVE_KEY)).toBe('original'); expect(store.getItem(LEGACY_SAVE_KEY)).toBe('broken');
  });
  it('reports disabled storage and write quota failures without throwing', () => {
    expect(new SaveRepository().load().status).toBe('unavailable'); const store = new MemoryStore(); store.failReads = true; const repo = new SaveRepository(store);
    expect(repo.load().status).toBe('unavailable'); expect(repo.save(newGame())).toBe(false); expect(store.data.size).toBe(0); store.failReads = false; store.failWrites = true; expect(repo.save(newGame())).toBe(false);
  });
  it('clamps impossible resource values and rejects invalid equipped IDs', () => {
    const raw = { ...progressed(), hp: 9999, mp: 9999, ownedItems: ['ember_sword', '__proto__'], equipment: { sword: 'storm_bow', bow: 'ember_sword', spear: 'missing' } };
    const s = parseSave(JSON.stringify(raw)); expect(s.hp).toBe(maxHp(s)); expect(s.mp).toBe(maxMp(s)); expect(s.equipment.sword).toBe('traveler_sword'); expect(s.equipment.bow).toBe('ranger_bow');
  });
});
