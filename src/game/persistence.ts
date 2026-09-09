import { newGame, parseSave, SAVE_KEY, PREVIOUS_SAVE_KEY, LEGACY_SAVE_KEY, ITEMS, WEAPONS, ZONES, DIFFICULTIES, type Weapon, type ItemId, type SaveState } from './state';
import { MATERIALS, STORY_FLAGS, JOURNEY } from './journey-data';

export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export type LoadStatus = 'new' | 'loaded' | 'migrated' | 'blocked' | 'unavailable';
export interface LoadResult { state: SaveState; status: LoadStatus; legacy: SaveState | null; message: string }
const validSave = (raw: string | null, version: number): SaveState | null => {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || value.version !== version) return null;
    for (const key of ['level', 'xp', 'hp', 'mp', 'gold', 'potions', 'armor', 'chapter', 'totalKills', 'playTime']) {
      if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < 0) return null;
    }
    if (!Number.isInteger(value.level) || value.level < 1 || value.level > 50 || !Number.isInteger(value.chapter) || value.chapter > 6) return null;
    if (!Object.hasOwn(WEAPONS, value.weapon) || !Object.hasOwn(ZONES, value.zone) || typeof value.muted !== 'boolean' || !value.kills || typeof value.kills !== 'object' || Array.isArray(value.kills)) return null;
    if (version >= 2) {
      if (!Array.isArray(value.ownedItems) || !value.equipment || !value.cooldowns || !Object.hasOwn(DIFFICULTIES, value.difficulty)) return null;
      if (value.ownedItems.some((id: unknown) => typeof id !== 'string' || !Object.hasOwn(ITEMS, id))) return null;
      for (const weapon of Object.keys(WEAPONS) as Weapon[]) {
        const id = value.equipment[weapon] as ItemId;
        if (!value.ownedItems.includes(id) || !Object.hasOwn(ITEMS, id) || ITEMS[id].weapon !== weapon) return null;
      }
      for (const key of Object.keys(newGame().cooldowns)) if (typeof value.cooldowns[key] !== 'number' || !Number.isFinite(value.cooldowns[key]) || value.cooldowns[key] < 0) return null;
    }
    if (version === 3) {
      const j = value.journey;
      if (!j || !Number.isInteger(j.step) || j.step < 0 || j.step >= JOURNEY.length || (j.step > 0 && value.chapter !== 6) || !Array.isArray(j.flags) || j.flags.some((f: unknown) => typeof f !== 'string' || !STORY_FLAGS.includes(f)) || !Array.isArray(j.runes) || j.runes.length > 3 || !['high', 'low'].includes(j.tide)) return null;
      if (j.runes.some((r: unknown, i: number) => r !== ['shell', 'moon', 'star'][i]) || (j.tide === 'low' && !j.flags.includes('lantern'))) return null;
      if (JOURNEY.slice(1, j.step).some(q => q.objectives.some(f => !j.flags.includes(f)))) return null;
      for (const key of Object.keys(MATERIALS)) if (!Number.isInteger(value.materials?.[key]) || value.materials[key] < 0 || value.materials[key] > 999999) return null;
    }
    return parseSave(raw);
  } catch { return null; }
};

/** Loading never writes. Corrupt saves lock writes until an explicit recovery choice. */
export class SaveRepository {
  locked = false;
  constructor(private storage?: StoragePort) {}
  load(): LoadResult {
    if (!this.storage) return this.unavailable();
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      const previousRaw = this.storage.getItem(PREVIOUS_SAVE_KEY);
      const old = this.storage.getItem(LEGACY_SAVE_KEY);
      const current = validSave(raw, 3); const previous = validSave(previousRaw, 2); const original = validSave(old, 1); const legacy = previous ?? original;
      if (current) return { state: current, status: 'loaded', legacy, message: '' };
      if (raw !== null || (previousRaw !== null && !previous) || (previousRaw === null && old !== null && !original)) {
        this.locked = true;
        return { state: legacy ?? newGame(), legacy, status: 'blocked', message: '저장 기록을 읽을 수 없습니다. 원본은 보존되어 있습니다. 복구 방법을 선택해주세요.' };
      }
      if (legacy) return { state: legacy, legacy, status: 'migrated', message: previous ? '기존 장비와 진행을 그대로 이어갑니다. 1막 완료 후 엘리온에게 말을 걸면 항구 이야기가 시작됩니다.' : '기존 모험을 이어갑니다. 무기마다 Q/E/R이 달라지고 숲의 치유는 T로 이동했습니다.' };
      return { state: newGame(), legacy: null, status: 'new', message: '' };
    } catch { return this.unavailable(); }
  }
  private unavailable(): LoadResult { this.locked = true; return { state: newGame(), legacy: null, status: 'unavailable', message: '브라우저 저장 공간을 사용할 수 없습니다. 현재 모험은 임시로 플레이합니다.' }; }
  save(state: SaveState): boolean {
    if (!this.storage || this.locked) return false;
    try { this.storage.setItem(SAVE_KEY, JSON.stringify(state)); return true; } catch { return false; }
  }
  recover(state: SaveState): boolean {
    if (!this.storage) return false;
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      if (raw !== null) this.storage.setItem(`${SAVE_KEY}-backup-${Date.now()}`, raw);
      this.storage.setItem(SAVE_KEY, JSON.stringify(state));
      this.locked = false; return true;
    } catch { return false; }
  }
}
