import { describe, expect, it } from 'vitest';
import { newGame, canTravel, buyItem, maxHp, maxMp, getSkill, SAVE_KEY, PREVIOUS_SAVE_KEY, type SaveState, type Weapon, type Difficulty, type Skill } from '../src/game/state';
import { beginJourney, interactStory, completeJourney, journeyReady, craft, buyMaterial, STORY_SITES, JOURNEY, type StoryId } from '../src/game/journey';
import { SaveRepository } from '../src/game/persistence';
import { createEnvironment, refreshCoast, disposeEnvironment } from '../src/game/world';
import { Combat } from '../src/game/combat';
import { moveBody, clearLine, distance, direction, angleTo, inCone, addPoint, segmentDistance, type Point } from '../src/game/geometry';

function ending() { const s = newGame(); s.chapter = 6; s.level = 8; s.armor = 3; s.hp = maxHp(s); s.mp = maxMp(s); return s; }
function inspect(s: SaveState, id: StoryId, enemies: { hp: number; pos: Point }[] = []) {
  const site = STORY_SITES[id]; s.zone = site.zone;
  return interactStory(s, id, { zone: s.zone, position: site, enemies });
}
function claim(s: SaveState) { expect(journeyReady(s)).toBe(true); expect(completeJourney(s)).toBe(true); }
function prepareSea(s: SaveState) {
  expect(beginJourney(s, { x: -2.8, z: 5.7 })).toBe(true);
  for (const id of ['captain', 'net', 'log', 'shard'] as const) expect(inspect(s, id).ok).toBe(true);
  claim(s); expect(inspect(s, 'chart').ok).toBe(true);
  expect(craft(s, 'lantern', STORY_SITES.doran)).toBe(true); claim(s);
}
function repairLighthouse(s: SaveState) {
  expect(inspect(s, 'tide').ok).toBe(true);
  expect(inspect(s, 'ian').ok).toBe(true); expect(inspect(s, 'sera').ok).toBe(true);
  expect(inspect(s, 'rescue_report').ok).toBe(true); claim(s);
  for (const id of ['inscription', 'shell', 'moon', 'star'] as const) expect(inspect(s, id).ok).toBe(true);
  claim(s);
}

describe('Black Tide story rules', () => {
  it('caps additive investigation rewards so its own save remains readable', () => {
    const s = ending(); prepareSea(s); s.materials.wood = 999999; s.materials.iron = 999998; s.materials.star = 999999;
    inspect(s, 'wood_cache'); inspect(s, 'iron_cache');
    expect(s.materials).toEqual({ wood: 999999, iron: 999999, star: 999999, heart: 0 });
    const raw = JSON.stringify(s), repo = new SaveRepository({ getItem: k => k === SAVE_KEY ? raw : null, setItem: () => {} });
    expect(repo.load().status).toBe('loaded');
  });
  it('unlocks through investigation, crafting, rescue and the lighthouse with guaranteed resources', () => {
    const s = ending(); expect(canTravel(s, 'harbor')).toBe(false);
    expect(beginJourney(s, { x: 20, z: 20 })).toBe(false);
    prepareSea(s); expect(s.journey.step).toBe(3); expect(canTravel(s, 'wreck')).toBe(true); expect(canTravel(s, 'abyss')).toBe(false);
    repairLighthouse(s); expect(s.level).toBeGreaterThanOrEqual(10); expect(canTravel(s, 'abyss')).toBe(true);
    expect(s.totalKills).toBe(0); expect(s.materials).toEqual({ wood: 1, iron: 1, star: 1, heart: 0 });
    expect(completeJourney(s)).toBe(false); expect(inspect(s, 'memory').ok).toBe(false);
  });
  it('rejects remote interactions, rescue before clues, and rescue with living threats', () => {
    const s = ending(); s.zone = 'forest';
    expect(interactStory(s, 'herb', { zone: 'forest', position: { x: 30, z: 25 }, enemies: [] }).ok).toBe(false);
    expect(inspect(s, 'lyra').ok).toBe(false); inspect(s, 'herb'); inspect(s, 'camp');
    expect(inspect(s, 'lyra', [{ hp: 1, pos: STORY_SITES.lyra }]).ok).toBe(false);
    const before = { gold: s.gold, xp: s.xp }; expect(inspect(s, 'lyra', [{ hp: 0, pos: STORY_SITES.lyra }]).changed).toBe(true);
    expect(s.gold).toBe(before.gold + 90); expect(s.xp).toBe(before.xp + 140);
    const saved = JSON.stringify(s); expect(inspect(s, 'lyra').changed).toBe(false); expect(JSON.stringify(s)).toBe(saved);
  });
  it('keeps crafting atomic, checks proximity and prevents buying or crafting duplicate quest rewards', () => {
    const s = ending(); prepareSea(s); const snapshot = JSON.stringify(s);
    expect(craft(s, 'lantern', STORY_SITES.doran)).toBe(false); expect(JSON.stringify(s)).toBe(snapshot);
    expect(buyItem(s, 'tide_bow')).toBe(false); expect(buyMaterial(s, 'heart', STORY_SITES.doran)).toBe(false);
    expect(buyMaterial(s, 'wood', { x: -25, z: 25 })).toBe(false);
    s.materials.wood = 999999; expect(buyMaterial(s, 'wood', STORY_SITES.doran)).toBe(false);
    s.materials.wood = 0; const gold = s.gold; expect(buyMaterial(s, 'wood', STORY_SITES.doran)).toBe(true); expect(s.gold).toBe(gold - 12);
    expect(craft(s, 'tide_bow', STORY_SITES.doran)).toBe(false);
  });
  it('allows a wrong rune to be retried and grants caches and chapter rewards once', () => {
    const s = ending(); prepareSea(s); inspect(s, 'ian'); inspect(s, 'sera'); inspect(s, 'rescue_report'); claim(s);
    const rewards = { gold: s.gold, potions: s.potions }; expect(completeJourney(s)).toBe(false); expect({ gold: s.gold, potions: s.potions }).toEqual(rewards);
    expect(inspect(s, 'moon').ok).toBe(false); inspect(s, 'inscription'); inspect(s, 'shell'); inspect(s, 'star');
    expect(s.journey.runes).toEqual([]); expect(s.journey.flags).not.toContain('beacon');
    for (const id of ['shell', 'moon', 'star'] as const) inspect(s, id);
    expect(s.journey.flags.filter(f => f === 'beacon')).toHaveLength(1); expect(inspect(s, 'star').changed).toBe(false);
    inspect(s, 'iron_cache'); const mats = { ...s.materials }; inspect(s, 'iron_cache'); expect(s.materials).toEqual(mats);
  });
});

describe('Neris combat promises', () => {
  it('limits a burst at half health, transitions once and awards no duplicate heart', () => {
    const s = ending(); prepareSea(s); repairLighthouse(s); s.zone = 'abyss'; const c = new Combat(s, 'abyss', []), e = c.enemies[0];
    c.hit(e, e.maxHp * 10); expect(e.hp).toBe(e.maxHp / 2); expect(e.bossPhase).toBe(2); expect(e.mode).toBe('recover');
    expect(c.drainEvents().filter(e => e.kind === 'phase')).toHaveLength(1);
    c.hit(e, e.maxHp); const gold = s.gold; expect(s.materials.heart).toBe(3); expect(c.hit(e, e.maxHp)).toBe(false);
    expect(s.gold).toBe(gold); expect(s.kills.leviathan).toBe(1); expect(s.journey.flags.filter(f => f === 'leviathan_freed')).toHaveLength(1);
  });
  it('commits the dive to its visible circle, resists damage while submerged, then exposes a recovery window', () => {
    const s = ending(); prepareSea(s); repairLighthouse(s); const c = new Combat(s, 'abyss', []), e = c.enemies[0];
    let committed: Point | undefined;
    for (let t = 0; t < 30 && !committed; t += .05) {
      c.tick(.05, direction(angleTo(c.player, e.pos))); c.drainEvents();
      if (e.telegraph?.kind === 'eruption') committed = { ...e.telegraph.origin };
    }
    expect(committed).toBeDefined(); const hp = e.hp; expect(c.hit(e, 100)).toBe(false); expect(e.hp).toBe(hp);
    const away = direction(angleTo(committed!, { x: c.player.x + 10, z: c.player.z }));
    for (let t = 0; t < .4; t += .05) c.tick(.05, away);
    expect(e.telegraph?.origin).toEqual(committed);
    for (let t = 0; t < 3 && e.mode !== 'recover'; t += .05) c.tick(.05, away);
    expect(e.mode).toBe('recover'); expect(c.hit(e, 100)).toBe(true); expect(e.hp).toBe(hp - 100);
  });
});

describe('coastal traversal and durable progress', () => {
  it('blocks movement and dashes at high tide, opens the central crossing at low tide, and restores both banks', () => {
    const s = ending(); prepareSea(s); const env = createEnvironment('wreck', s.journey); const obstacles = env.obstacles;
    const cross = (x: number, z: number, dz: number) => moveBody({ x, z }, { x: 0, z: dz }, .4, obstacles);
    expect(cross(0, 6, -12).z).toBeGreaterThan(0);
    inspect(s, 'tide'); refreshCoast(env, s.journey); expect(env.obstacles).toBe(obstacles);
    expect(cross(0, 6, -12).z).toBeLessThan(-5); expect(cross(0, -6, 12).z).toBeGreaterThan(5);
    expect(cross(10, 6, -12).z).toBeGreaterThan(0); expect(cross(29, 6, -12).z).toBeGreaterThan(0);
    inspect(s, 'tide_north'); refreshCoast(env, s.journey); expect(cross(0, -6, 12).z).toBeLessThan(0);
    disposeEnvironment(env);
  });
  it('migrates v2 without modifying its bytes and round trips partial puzzle, tide, tools and materials', () => {
    const data = new Map<string, string>(), storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
    const old = { ...ending(), version: 2, journey: undefined, materials: undefined, difficulty: 'veteran', hp: 37, ownedItems: [...ending().ownedItems, 'frost_bow'], equipment: { ...ending().equipment, bow: 'frost_bow' } };
    const raw = JSON.stringify(old); data.set(PREVIOUS_SAVE_KEY, raw); const repo = new SaveRepository(storage), result = repo.load();
    expect(result.status).toBe('migrated'); expect(data.size).toBe(1); expect(result.state.hp).toBe(37); expect(result.state.equipment.bow).toBe('frost_bow');
    const s = result.state; prepareSea(s); inspect(s, 'tide'); inspect(s, 'ian'); inspect(s, 'sera'); inspect(s, 'rescue_report'); claim(s); inspect(s, 'inscription'); inspect(s, 'shell');
    expect(repo.save(s)).toBe(true); expect(new SaveRepository(storage).load().state).toEqual(s); expect(data.get(PREVIOUS_SAVE_KEY)).toBe(raw);
    data.set(SAVE_KEY, 'broken latest'); const recovery = new SaveRepository(storage); expect(recovery.load().status).toBe('blocked'); expect(recovery.save(s)).toBe(false);
    expect(recovery.recover(s)).toBe(true); expect([...data.values()]).toContain('broken latest'); expect(data.get(PREVIOUS_SAVE_KEY)).toBe(raw);
  });
  it.each([
    (s: SaveState) => { s.journey.step = 5; },
    (s: SaveState) => { s.journey.runes = ['moon']; },
    (s: SaveState) => { s.journey.tide = 'low'; },
    (s: SaveState) => { s.materials.star = -1; },
    (s: SaveState) => { s.materials.heart = 1.5; },
  ])('locks inconsistent story data instead of overwriting it', change => {
    const s = ending(); change(s); const raw = JSON.stringify(s); const data = new Map([[SAVE_KEY, raw]]);
    const repo = new SaveRepository({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } });
    expect(repo.load().status).toBe('blocked'); expect(repo.save(newGame())).toBe(false); expect(data.get(SAVE_KEY)).toBe(raw);
  });
});

// This driver uses only actual controls and the telegraphs visible to players. No health or damage overrides.
function fight(c: Combat, done: () => boolean) {
  const s = c.state, weapon = s.weapon; let elapsed = 0, stuck = 0, last = { ...c.player }; const phases = new Set<number>();
  while (s.hp > 0 && !done() && elapsed < 300) {
    const e = c.nearest(100); let input: Point = { x: 0, z: 0 };
    if (e) {
      phases.add(e.bossPhase); c.targetId = e.id; const gap = distance(c.player, e.pos), toward = direction(angleTo(c.player, e.pos));
      if (gap > (weapon === 'bow' ? 8 : weapon === 'spear' ? 3.7 : 2.7)) input = toward;
      if (weapon === 'bow' && gap < 4) input = { x: -toward.x, z: -toward.z };
      if (!clearLine(c.player, e.pos, c.obstacles, .2)) input = direction(angleTo(c.player, e.pos) + Math.PI / 2);
      for (const foe of c.enemies) {
        const t = foe.telegraph; if (!t) continue;
        const end = addPoint(t.origin, direction(t.yaw), t.range);
        const danger = t.shape === 'circle' ? distance(c.player, t.origin) < t.range + .6 : t.shape === 'cone' ? inCone(t.origin, c.player, t.yaw, t.range, t.angle, .6) : segmentDistance(c.player, t.origin, end) < t.width + .6;
        if (danger && (t.remaining < .4 || foe.mode === 'attack')) {
          input = t.shape === 'circle' ? direction(angleTo(t.origin, c.player)) : direction(t.yaw + Math.PI / 2); c.dodge(input); break;
        }
      }
      if (s.hp < maxHp(s) * .5 && !c.busy && !c.cooldowns.t && s.mp >= 22) c.skill('t');
      if (s.hp < maxHp(s) * .4) c.potion();
      if (!c.busy) {
        const keys: Skill[] = weapon === 'sword' ? ['r', 'q'] : weapon === 'spear' ? ['r', 'e', 'q'] : ['r', 'q', 'e'];
        for (const key of keys) {
          const skill = getSkill(s, key), useful = key === 'q' && weapon === 'spear' ? gap > 3.5 && gap < 6 : key === 'e' && weapon === 'bow' ? gap < 5 : gap < skill.range + c.radius(e.species);
          if (useful && s.level >= skill.level && !c.cooldowns[key] && s.mp >= skill.mana + 10 && c.skill(key)) break;
        }
        if (gap <= (weapon === 'bow' ? 16 : weapon === 'spear' ? 4.8 : 3.2) + c.radius(e.species)) c.attack();
      }
    }
    if (distance(last, c.player) < .01 && Math.hypot(input.x, input.z) > 0) stuck += .05; else stuck = 0;
    if (stuck > .4) input = direction(angleTo(c.player, e?.pos ?? c.player) + Math.PI / 2);
    last = { ...c.player }; c.tick(.05, input); c.drainEvents(); elapsed += .05;
  }
  return { player: { ...c.player }, enemies: c.enemies.filter(e => e.hp > 0).map(e => ({pos:e.pos, hp:e.hp, mode:e.mode})), seconds: Math.round(elapsed), hp: Math.round(s.hp), phases: [...phases], ...c.metrics };
}

it.each((['story', 'adventure', 'veteran'] as Difficulty[]).flatMap(difficulty => (['sword', 'spear', 'bow'] as Weapon[]).map(weapon => ({ weapon, difficulty }))))('finishes Black Tide with $weapon/$difficulty, starter equipment and earned supplies', ({ weapon, difficulty }) => {
  const s = ending(); s.weapon = weapon; s.difficulty = difficulty; prepareSea(s);
  inspect(s, 'tide'); s.zone = 'wreck'; const wreck = createEnvironment('wreck', s.journey), battle = new Combat(s, 'wreck', wreck.obstacles);
  // Cross the opened central passage, then free the areas around both actual rescue sites.
  for (let t = 0; t < 2.8; t += .05) battle.tick(.05, { x: 0, z: -1 });
  const rescued = () => ['ian', 'sera'].every(id => !battle.enemies.some(e => e.hp > 0 && distance(e.pos, STORY_SITES[id as 'ian' | 'sera']) < 6));
  const skirmish = fight(battle, rescued); expect(s.hp, JSON.stringify(skirmish)).toBeGreaterThan(0); expect(rescued(), JSON.stringify(skirmish)).toBe(true);
  for (const id of ['ian', 'sera'] as const) expect(inspect(s, id, battle.enemies).ok).toBe(true);
  disposeEnvironment(wreck); inspect(s, 'rescue_report'); claim(s);
  for (const id of ['inscription', 'shell', 'moon', 'star'] as const) inspect(s, id); claim(s);
  expect(canTravel(s, 'abyss')).toBe(true); s.zone = 'harbor'; const rest = new Combat(s, 'harbor', []); for (let t = 0; t < 30; t += .05) rest.tick(.05);
  s.zone = 'abyss'; const env = createEnvironment('abyss', s.journey), boss = new Combat(s, 'abyss', env.obstacles);
  const outcome = fight(boss, () => journeyReady(s)); disposeEnvironment(env);
  expect(s.hp, JSON.stringify(outcome)).toBeGreaterThan(0); expect(journeyReady(s), JSON.stringify(outcome)).toBe(true); expect(outcome.phases).toEqual([1, 2]);
  expect(s.materials.heart).toBe(3); const kills = s.totalKills;
  for (let t = 0; t < 35; t += .05) boss.tick(.05); expect(s.totalKills).toBe(kills); expect(s.materials.heart).toBe(3);
  expect(new Combat(s, 'abyss', []).enemies).toHaveLength(0); claim(s); inspect(s, 'memory'); inspect(s, 'harbor_return'); claim(s);
  expect(s.journey.step).toBe(7); expect(completeJourney(s)).toBe(false);
  inspect(s, 'wood_cache'); inspect(s, 'iron_cache'); s.zone = 'harbor';
  for (const id of ['tide_sword', 'tide_spear', 'tide_bow'] as const) {
    // Buy any shortage using gold earned during this story.
    while (s.materials.wood < 5) expect(buyMaterial(s, 'wood', STORY_SITES.doran)).toBe(true);
    while (s.materials.iron < 5) expect(buyMaterial(s, 'iron', STORY_SITES.doran)).toBe(true);
    while (s.materials.star < 3) expect(buyMaterial(s, 'star', STORY_SITES.doran)).toBe(true);
    expect(craft(s, id, STORY_SITES.doran)).toBe(true);
  }
  expect(s.materials.heart).toBe(0); console.log(`BLACK_TIDE ${weapon}/${difficulty}`, JSON.stringify({ skirmish, boss: outcome, level: s.level, gold: s.gold }));
});
