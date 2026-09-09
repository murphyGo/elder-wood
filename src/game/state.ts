import { newJourney, addMaterials, emptyMaterials, MATERIALS, STORY_FLAGS, DROPS, CRAFTED_ITEMS, type JourneyState, type MaterialId, type StoryFlag, type Rune } from './journey-data';
import { WEAPONS, ITEMS, STARTER_ITEMS, DIFFICULTIES, getSkill, freshCooldowns, type Weapon, type Skill, type Difficulty, type ItemId, type Cooldowns } from './catalog';
import { newFinale, FINAL_FLAGS, CHOICES, type FinaleState, type FinalFlag } from './finale-data';
import { newTrials, TRIALS, type TrialProgress, type TrialKind } from './trial-data';
export * from './catalog';
export type Zone = 'village' | 'forest' | 'plains' | 'depths' | 'sanctum' | 'harbor' | 'wreck' | 'abyss' | 'ruins' | 'roots' | 'trial';
export type Species = 'squirrel' | 'rabbit' | 'cow' | 'horse' | 'hippo' | 'tiger' | 'shark' | 'dragon' | 'reef_shark' | 'leviathan' | 'thornbeast' | 'starwarden';

export const MONSTERS: Record<Species, { name: string; level: number; hp: number; attack: number; xp: number; gold: number; speed: number; size: number; zone: Zone }> = {
  squirrel: { name: '물든 다람쥐', level: 1, hp: 36, attack: 4, xp: 22, gold: 8, speed: 2.8, size: 0.7, zone: 'forest' },
  rabbit: { name: '안개 토끼', level: 2, hp: 46, attack: 6, xp: 28, gold: 10, speed: 3.4, size: 0.8, zone: 'forest' },
  cow: { name: '성난 들소', level: 3, hp: 120, attack: 12, xp: 65, gold: 24, speed: 2.3, size: 1.4, zone: 'plains' },
  horse: { name: '그림자 야생마', level: 4, hp: 140, attack: 14, xp: 80, gold: 30, speed: 4, size: 1.3, zone: 'plains' },
  hippo: { name: '바위등 하마', level: 5, hp: 230, attack: 20, xp: 140, gold: 42, speed: 1.8, size: 1.7, zone: 'plains' },
  tiger: { name: '흑월의 호랑이', level: 6, hp: 270, attack: 24, xp: 180, gold: 56, speed: 4.2, size: 1.25, zone: 'depths' },
  shark: { name: '심연의 상어', level: 7, hp: 330, attack: 28, xp: 220, gold: 65, speed: 3.2, size: 1.5, zone: 'depths' },
  reef_shark: { name: '별에 물든 암초상어', level: 9, hp: 520, attack: 32, xp: 260, gold: 75, speed: 3.4, size: 1.65, zone: 'wreck' },
  leviathan: { name: '검은 조수의 네리스', level: 12, hp: 3800, attack: 58, xp: 1600, gold: 650, speed: 3, size: 2.8, zone: 'abyss' },
  dragon: { name: '고대룡 모르가스', level: 10, hp: 2800, attack: 48, xp: 800, gold: 500, speed: 2.5, size: 3.2, zone: 'sanctum' },
  thornbeast: { name: '가시뿌리 수호수', level: 12, hp: 720, attack: 42, xp: 340, gold: 90, speed: 3.8, size: 1.5, zone: 'ruins' },
  starwarden: { name: '별을 품은 아스테르', level: 16, hp: 5200, attack: 68, xp: 1900, gold: 800, speed: 2.6, size: 3, zone: 'roots' },
};

export const isSafeZone = (zone: Zone) => zone === 'village' || zone === 'harbor';
export const isSeaShark = (species: Species) => ['shark', 'reef_shark', 'leviathan'].includes(species);
export const isBoss = (species: Species) => species === 'dragon' || species === 'leviathan' || species === 'starwarden';

export const ZONES: Record<Zone, { name: string; english: string; subtitle: string; level: number; chapter: number; color: string; creatures: Species[] }> = {
  village: { name: '그린헤이븐 마을', english: 'GREENHAVEN VILLAGE', subtitle: '모든 모험에는, 돌아올 곳이 필요하다.', level: 1, chapter: 0, color: '#abc4a0', creatures: [] },
  forest: { name: '속삭임의 숲', english: 'THE WHISPERING WOODS', subtitle: '나뭇잎 사이로 오래된 비밀이 흐른다.', level: 1, chapter: 1, color: '#adc394', creatures: ['squirrel', 'rabbit'] },
  plains: { name: '거인의 들판', english: 'FIELDS OF THE GIANTS', subtitle: '대지의 거인들이 평화를 잃은 곳.', level: 3, chapter: 2, color: '#cbb880', creatures: ['cow', 'horse', 'hippo'] },
  depths: { name: '잠긴 신전', english: 'THE DROWNED TEMPLE', subtitle: '가라앉은 신전, 깨어나는 그림자.', level: 5, chapter: 3, color: '#9bbed0', creatures: ['tiger', 'shark'] },
  sanctum: { name: '용의 안식처', english: 'SANCTUM OF THE DRAGON', subtitle: '마지막 별빛이 당신을 기다린다.', level: 8, chapter: 4, color: '#c3a0ce', creatures: ['dragon'] },
  harbor: { name: '새벽물결 항구', english: 'DAWNTIDE HARBOR', subtitle: '돌아오지 않은 배들을 기다리는 불빛.', level: 8, chapter: 6, color: '#b3d4ce', creatures: [] },
  wreck: { name: '별무덤 난파선', english: 'THE STARFALL WRECK', subtitle: '물이 물러나면, 잃어버린 발자국이 드러난다.', level: 8, chapter: 6, color: '#b8b3a0', creatures: ['reef_shark', 'tiger'] },
  abyss: { name: '검은 조수의 제단', english: 'ALTAR OF THE BLACK TIDE', subtitle: '바다의 심장은 아직 약속을 기억한다.', level: 10, chapter: 6, color: '#92c8d1', creatures: ['leviathan'] },
  ruins: { name: '하늘나무의 기억', english: 'MEMORY OF THE SKYTREE', subtitle: '함께 걸어온 길이 마지막 문을 연다.', level: 12, chapter: 6, color: '#cbd7aa', creatures: ['thornbeast', 'tiger'] },
  roots: { name: '별의 뿌리', english: 'ROOTS OF THE FIRST STAR', subtitle: '이제, 혼자 짊어지지 않아도 된다.', level: 13, chapter: 6, color: '#dfc78c', creatures: ['starwarden'] },
  trial: { name: '메아리의 회랑', english: 'HALL OF ECHOES', subtitle: '기억 속 수호자들과 다시 마주하다.', level: 13, chapter: 6, color: '#b9b0d6', creatures: [] },
};

export const CHAPTERS: { title: string; subtitle: string; description: string; zone: Zone; objectives: Partial<Record<Species, number>>; xp: number; gold: number }[] = [
  { title: '숲이 당신을 부를 때', subtitle: '프롤로그', description: '그린헤이븐의 장로 엘리온과 대화하세요.', zone: 'village', objectives: {}, xp: 0, gold: 0 },
  { title: '작은 숲의 이상한 소문', subtitle: '제1장 · 잃어버린 평온', description: '별의 저주에 물든 동물들을 해방하고 숲의 흔적을 찾으세요.', zone: 'forest', objectives: { squirrel: 3, rabbit: 3 }, xp: 140, gold: 80 },
  { title: '잠에서 깨어난 거인들', subtitle: '제2장 · 대지의 기억', description: '거인의 들판에서 날뛰는 동물들을 잠재우고 대지의 파편을 모으세요.', zone: 'plains', objectives: { cow: 2, horse: 2, hippo: 1 }, xp: 260, gold: 150 },
  { title: '물 아래 잠든 별', subtitle: '제3장 · 심연의 속삭임', description: '잠긴 신전의 수호자들을 해방하고 마지막 봉인을 푸세요.', zone: 'depths', objectives: { tiger: 2, shark: 2 }, xp: 1500, gold: 250 },
  { title: '마지막 용의 노래', subtitle: '제4장 · 잊힌 숲의 부름', description: '고대룡 모르가스에게서 별의 저주를 거두세요.', zone: 'sanctum', objectives: { dragon: 1 }, xp: 600, gold: 500 },
  { title: '다시, 푸른 숲으로', subtitle: '에필로그', description: '그린헤이븐으로 돌아가 엘리온에게 숲의 회복을 알리세요.', zone: 'village', objectives: {}, xp: 0, gold: 0 },
  { title: '숲의 수호자', subtitle: '이야기 완료', description: '엘더우드에 평화가 돌아왔습니다. 자유롭게 남은 모험을 즐겨보세요.', zone: 'village', objectives: {}, xp: 0, gold: 0 },
];

export interface SaveState {
  version: 4; name: string; level: number; xp: number; hp: number; mp: number; gold: number;
  weapon: Weapon; armor: number; potions: number; chapter: number;
  kills: Partial<Record<Species, number>>; zone: Zone; totalKills: number;
  journey: JourneyState; materials: Record<MaterialId, number>;
  finale: FinaleState; trials: TrialProgress;
  muted: boolean; playTime: number; difficulty: Difficulty; ownedItems: ItemId[]; equipment: Record<Weapon, ItemId>; cooldowns: Cooldowns;
}
export const LEGACY_SAVE_KEY = 'elderwood-save-v1';
export const PREVIOUS_SAVE_KEY = 'elderwood-save-v2';
export const THIRD_SAVE_KEY = 'elderwood-save-v3';
export const SAVE_KEY = 'elderwood-save-v4';
export const newGame = (): SaveState => ({ version: 4, journey: newJourney(), materials: emptyMaterials(), finale: newFinale(), trials: newTrials(), name: '여행자', level: 1, xp: 0, hp: 100, mp: 60, gold: 60, weapon: 'sword', armor: 0, potions: 5, chapter: 0, kills: {}, zone: 'village', totalKills: 0, muted: false, playTime: 0, difficulty: 'adventure', ownedItems: Object.values(STARTER_ITEMS), equipment: { ...STARTER_ITEMS }, cooldowns: freshCooldowns() });
export const xpRequired = (level: number) => Math.floor(60 * Math.pow(level, 1.4));
export const maxHp = (s: SaveState) => 100 + (s.level - 1) * 28 + s.armor * 20;
export const maxMp = (s: SaveState) => 60 + (s.level - 1) * 12;
export const equippedItem = (s: SaveState) => ITEMS[s.equipment[s.weapon]];
export const attackPower = (s: SaveState) => 10 + (s.level - 1) * 5 + equippedItem(s).attack + s.trials.forge[s.weapon] * 4;
export const mitigatedDamage = (raw: number, armor: number) => Math.max(1, Math.round(Math.max(0, raw) * 80 / (80 + Math.max(0, armor))));
export function equipItem(s: SaveState, id: ItemId): boolean {
  if (!Object.hasOwn(ITEMS, id) || !s.ownedItems.includes(id)) return false;
  const item = ITEMS[id]; s.equipment[item.weapon] = id; s.weapon = item.weapon; return true;
}
export function buyItem(s: SaveState, id: ItemId): boolean {
  if (!Object.hasOwn(ITEMS, id)) return false;
  const item = ITEMS[id];
  if (CRAFTED_ITEMS.includes(id)) return false;
  if (!isSafeZone(s.zone) || s.chapter < item.chapter || s.gold < item.price || s.ownedItems.includes(id)) return false;
  s.gold -= item.price; s.ownedItems.push(id); return true;
}
export function setDifficulty(s: SaveState, difficulty: Difficulty): boolean {
  if (!isSafeZone(s.zone) || !Object.hasOwn(DIFFICULTIES, difficulty)) return false;
  s.difficulty = difficulty; return true;
}
export const defense = (s: SaveState) => (s.level - 1) * 1.5 + s.armor * 6;
export const canTravel = (s: SaveState, zone: Zone) => {
  if (!Object.hasOwn(ZONES, zone) || s.chapter < ZONES[zone].chapter || s.level < ZONES[zone].level) return false;
  if (zone === 'harbor') return s.journey.step >= 1;
  if (zone === 'wreck') return s.journey.step >= 3 && s.journey.flags.includes('lantern');
  if (zone === 'abyss') return s.journey.step >= 5 && s.journey.flags.includes('beacon');
  if (zone === 'ruins') return s.journey.step === 7 && s.finale.step >= 1;
  if (zone === 'roots') return s.finale.step >= 4 && s.finale.choice !== null;
  if (zone === 'trial') return false; // Only a new, validated trial run can enter this instance.
  return true;
};
export const questReady = (s: SaveState) => {
  const objectives = Object.entries(CHAPTERS[s.chapter].objectives);
  return objectives.length > 0 && objectives.every(([id, count]) => (s.kills[id as Species] ?? 0) >= count!);
};

export function gainXp(s: SaveState, amount: number): number {
  s.xp += Math.max(0, Math.floor(amount));
  let levels = 0;
  while (s.xp >= xpRequired(s.level) && s.level < 50) {
    s.xp -= xpRequired(s.level); s.level++; levels++;
  }
  if (s.level === 50) s.xp = Math.min(s.xp, xpRequired(50) - 1);
  if (levels) { s.hp = maxHp(s); s.mp = maxMp(s); }
  return levels;
}
export function recordKill(s: SaveState, species: Species) {
  s.totalKills++; s.kills[species] = (s.kills[species] ?? 0) + 1;
  s.gold += MONSTERS[species].gold;
  addMaterials(s.materials, DROPS[species]);
  if (species === 'leviathan' && s.journey.step === 5 && !s.journey.flags.includes('leviathan_freed')) s.journey.flags.push('leviathan_freed');
  if (species === 'starwarden' && s.finale.step === 4 && !s.finale.flags.includes('aster_freed')) s.finale.flags.push('aster_freed');
  return gainXp(s, MONSTERS[species].xp);
}
export function completeQuest(s: SaveState) {
  if (!questReady(s)) return false;
  const quest = CHAPTERS[s.chapter];
  gainXp(s, quest.xp); s.gold += quest.gold; s.potions += 2;
  s.chapter++; s.kills = {};
  return true;
}
export function usePotion(s: SaveState) {
  if (s.potions < 1 || s.hp >= maxHp(s)) return false;
  s.potions--; s.hp = Math.min(maxHp(s), s.hp + maxHp(s) * 0.6 * DIFFICULTIES[s.difficulty].healing);
  return true;
}
export function useSkill(s: SaveState, skill: Skill, cooldown: number): string | null {
  const data = getSkill(s, skill);
  if (s.level < data.level) return `레벨 ${data.level}에 배울 수 있습니다.`;
  if (cooldown > 0) return '아직 스킬이 준비되지 않았습니다.';
  if (s.mp < data.mana) return '마력이 부족합니다.';
  if (skill === 't' && s.hp >= maxHp(s)) return '이미 체력이 가득 찼습니다.';
  s.mp -= data.mana;
  if (skill === 't') s.hp = Math.min(maxHp(s), s.hp + maxHp(s) * 0.45 * DIFFICULTIES[s.difficulty].healing);
  return null;
}
export function buyPotion(s: SaveState) {
  if (!isSafeZone(s.zone) || s.gold < 20) return false;
  s.gold -= 20; s.potions++; return true;
}
export function upgradeArmor(s: SaveState) {
  const cost = 80 * (s.armor + 1);
  if (!isSafeZone(s.zone) || s.armor >= 3 || s.gold < cost) return false;
  s.gold -= cost; s.armor++; s.hp = Math.min(maxHp(s), s.hp + 20); return true;
}
export function parseSave(raw: string | null): SaveState {
  if (!raw) return newGame();
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || ![1, 2, 3, 4].includes(value.version)) return newGame();
    const s = newGame();
    const number = (key: keyof SaveState, min: number, max: number, fallback: number) => typeof value[key] === 'number' && Number.isFinite(value[key]) ? Math.max(min, Math.min(max, value[key])) : fallback;
    s.level = Math.floor(number('level', 1, 50, 1)); s.armor = Math.floor(number('armor', 0, 3, 0));
    s.xp = Math.floor(number('xp', 0, xpRequired(s.level) - 1, 0));
    s.hp = number('hp', 0, maxHp(s), maxHp(s)); s.mp = number('mp', 0, maxMp(s), maxMp(s));
    s.gold = Math.floor(number('gold', 0, 9999999, 60)); s.potions = Math.floor(number('potions', 0, 9999, 5));
    s.chapter = Math.floor(number('chapter', 0, CHAPTERS.length - 1, 0));
    s.totalKills = Math.floor(number('totalKills', 0, 999999, 0)); s.playTime = number('playTime', 0, 99999999, 0);
    if (Object.hasOwn(WEAPONS, value.weapon)) s.weapon = value.weapon;
    s.muted = value.muted === true;
    if (value.version >= 2) {
      if (Object.hasOwn(DIFFICULTIES, value.difficulty)) s.difficulty = value.difficulty;
      if (Array.isArray(value.ownedItems)) s.ownedItems = [...new Set([...s.ownedItems, ...value.ownedItems.filter((id: unknown): id is ItemId => typeof id === 'string' && Object.hasOwn(ITEMS, id))])];
      for (const weapon of Object.keys(WEAPONS) as Weapon[]) {
        const id = value.equipment?.[weapon];
        if (s.ownedItems.includes(id) && ITEMS[id as ItemId].weapon === weapon) s.equipment[weapon] = id;
      }
      for (const key of Object.keys(s.cooldowns) as (keyof Cooldowns)[]) {
        const time = value.cooldowns?.[key];
        if (typeof time === 'number' && Number.isFinite(time)) s.cooldowns[key] = Math.max(0, Math.min(60, time));
      }
    }
    if (value.version >= 3) {
      const j = value.journey;
      if (j && typeof j === 'object') {
        s.journey.step = s.chapter === 6 && Number.isInteger(j.step) ? Math.max(0, Math.min(7, j.step)) : 0;
        s.journey.flags = Array.isArray(j.flags) ? [...new Set(j.flags.filter((f: unknown): f is StoryFlag => typeof f === 'string' && STORY_FLAGS.includes(f)))] as StoryFlag[] : [];
        s.journey.runes = Array.isArray(j.runes) && j.runes.length <= 3 && j.runes.every((r: unknown, i: number) => r === ['shell', 'moon', 'star'][i]) ? [...j.runes] as Rune[] : [];
        s.journey.tide = j.tide === 'low' && s.journey.flags.includes('lantern') ? 'low' : 'high';
      }
      for (const key of Object.keys(MATERIALS) as MaterialId[]) {
        const amount = value.materials?.[key]; if (typeof amount === 'number' && Number.isFinite(amount)) s.materials[key] = Math.floor(Math.max(0, Math.min(999999, amount)));
      }
    }
    if (value.version === 4 && s.chapter === 6 && s.journey.step === 7) {
      const f = value.finale;
      if (f && Number.isInteger(f.step)) {
        s.finale.step = Math.max(0, Math.min(6, f.step));
        s.finale.flags = Array.isArray(f.flags) ? [...new Set(f.flags.filter((flag: unknown): flag is FinalFlag => typeof flag === 'string' && FINAL_FLAGS.includes(flag as FinalFlag)))] as FinalFlag[] : [];
        s.finale.choice = Object.hasOwn(CHOICES, f.choice) ? f.choice : null;
      }
      if (s.finale.step === 6 && value.trials) {
        const bounded = (v: unknown, cap: number) => typeof v === 'number' && Number.isFinite(v) ? Math.floor(Math.max(0, Math.min(cap, v))) : 0;
        s.trials.marks = bounded(value.trials.marks, 999999);
        for (const key of Object.keys(TRIALS) as TrialKind[]) {
          s.trials.best[key] = bounded(value.trials.best?.[key], 3);
          s.trials.clears[key] = bounded(value.trials.clears?.[key], 999999);
        }
        for (const w of Object.keys(WEAPONS) as Weapon[]) s.trials.forge[w] = bounded(value.trials.forge?.[w], 3);
      }
    }
    if (Object.hasOwn(ZONES, value.zone) && canTravel(s, value.zone)) s.zone = value.zone;
    for (const species of Object.keys(MONSTERS) as Species[]) {
      const count = value.kills?.[species];
      if (typeof count === 'number' && Number.isFinite(count)) s.kills[species] = Math.floor(Math.max(0, Math.min(count, 999999)));
    }
    return s;
  } catch { return newGame(); }
}
