import { describe, it, expect } from 'vitest';
import { newGame, canTravel, maxHp, maxMp, parseSave, SAVE_KEY, THIRD_SAVE_KEY, type SaveState, type Weapon, type Difficulty } from '../src/game/state';
import { FINALE, FINAL_SITES, ROOT_ANCHORS, beginFinale, completeFinale, finaleReady, chooseEnding, interactFinale, finalHomecoming, type FinalSiteId, type EndingChoice } from '../src/game/finale';
import { Combat } from '../src/game/combat';
import { createEnvironment, refreshSkytree, disposeEnvironment } from '../src/game/world';
import { SaveRepository } from '../src/game/persistence';
import { moveBody } from '../src/game/geometry';
import { fight } from './helpers/fight';
import { secondEnding, finalState } from './helpers/finale-state';

function inspect(s: SaveState, id: FinalSiteId) { s.zone = FINAL_SITES[id].zone; return interactFinale(s, id, s.zone, FINAL_SITES[id]); }
function claim(s: SaveState) { expect(finaleReady(s)).toBe(true); expect(completeFinale(s)).toBe(true); }
function prepare(s: SaveState, choice: EndingChoice) {
  expect(beginFinale(s, { x: -2.8, z: 5.7 })).toBe(true); expect(canTravel(s, 'ruins')).toBe(true);
  for (const id of ['past', 'sky_echo', 'sea_echo'] as const) expect(inspect(s, id).changed).toBe(true);
  claim(s); for (const id of ['elion_ally', 'earth_song', 'sea_song'] as const) expect(inspect(s, id).changed).toBe(true);
  claim(s); expect(chooseEnding(s, choice, FINAL_SITES.covenant)).toBe(true); claim(s); expect(canTravel(s, 'roots')).toBe(true);
}

describe('the final promise', () => {
  it('requires the second ending, proximity, each memory and an explicit irreversible choice', () => {
    const fresh = newGame(); expect(beginFinale(fresh, { x: -2.8, z: 5.7 })).toBe(false);
    const s = secondEnding(); expect(beginFinale(s, { x: 20, z: 20 })).toBe(false);
    expect(canTravel(s, 'ruins')).toBe(false); expect(beginFinale(s, { x: -2.8, z: 5.7 })).toBe(true);
    expect(beginFinale(s, { x: -2.8, z: 5.7 })).toBe(false); expect(completeFinale(s)).toBe(false);
    expect(inspect(s, 'seed').ok).toBe(false); s.zone = 'ruins';
    expect(interactFinale(s, 'past', 'ruins', {x: 25, z: 25}).changed).toBe(false);
    for (const id of ['past', 'sky_echo', 'sea_echo'] as const) inspect(s, id);
    expect(inspect(s, 'past').changed).toBe(false); const gold = s.gold; claim(s); expect(completeFinale(s)).toBe(false); expect(s.gold).toBe(gold + 180);
    expect(chooseEnding(s, 'renew', FINAL_SITES.covenant)).toBe(false);
    for (const id of ['elion_ally', 'earth_song', 'sea_song'] as const) inspect(s, id); claim(s);
    expect(chooseEnding(s, 'release', { x: 20, z: 20 })).toBe(false); expect(chooseEnding(s, 'release', FINAL_SITES.covenant)).toBe(true);
    expect(chooseEnding(s, 'renew', FINAL_SITES.covenant)).toBe(false); expect(s.finale.choice).toBe('release');
  });
  it('opens an actual shared collision path only after all three allies have contributed', () => {
    const s = finalState(2), env = createEnvironment('ruins', s.journey, s.finale), obstacles = env.obstacles;
    const cross = () => { let p = { x: 0, z: 5 }; for (let i = 0; i < 100; i++) p = moveBody(p, { x: 0, z: -.12 }, .4, obstacles); return p.z; };
    expect(cross()).toBeGreaterThan(1);
    inspect(s, 'earth_song'); inspect(s, 'elion_ally'); refreshSkytree(env, s.finale); expect(cross()).toBeGreaterThan(1);
    inspect(s, 'sea_song'); refreshSkytree(env, s.finale); expect(env.obstacles).toBe(obstacles); expect(cross()).toBeLessThan(-4); expect(env.skytree?.crossing.visible).toBe(true);
    disposeEnvironment(env);
  });
  it.each(['renew', 'release'] as EndingChoice[])('keeps the %s ending visible in both returning settlements', choice => {
    const s = finalState(6, choice);
    for (const zone of ['village', 'harbor'] as const) {
      const env = createEnvironment(zone, s.journey, s.finale);
      expect(env.ending?.renew.visible).toBe(choice === 'renew'); expect(env.ending?.release.visible).toBe(choice === 'release');
      expect(env.landmarks.find(l => l.ending)?.text).toContain(choice === 'renew' ? '수호석' : '꽃'); disposeEnvironment(env);
    }
  });
  it.each(['renew', 'release'] as EndingChoice[])('enforces all boss phases and the %s resonance effect', choice => {
    const s = finalState(4, choice), c = new Combat(s, 'roots', []), boss = c.boss!;
    c.hit(boss, 999999); expect(boss.bossPhase).toBe(2); expect(boss.hp).toBe(boss.maxHp * .65); expect(c.hit(boss, 999999)).toBe(false);
    expect(c.activateSeal(0)).toBe(false); expect(c.activateRoot(0)).toBe(false); Object.assign(c.player, ROOT_ANCHORS[0]); s.hp = 100; s.mp = 10;
    expect(c.activateRoot(0)).toBe(true); expect(c.activateRoot(0)).toBe(false);
    if (choice === 'renew') { expect(c.exposure).toBe(10); expect(c.shield).toBe(maxHp(s) * .2); expect(s.hp).toBe(100); }
    else { expect(c.exposure).toBe(8); expect(s.hp).toBe(100 + maxHp(s) * .18); expect(s.mp).toBe(25); }
    c.hit(boss, 999999); expect(boss.bossPhase).toBe(3); expect(boss.hp).toBeCloseTo(boss.maxHp * .3);
    c.hit(boss, 999999); expect(s.finale.flags).toContain('aster_freed'); expect(c.metrics.kills).toBe(1);
    expect(new Combat(s, 'roots', []).enemies).toHaveLength(0); expect(c.hit(boss, 999999)).toBe(false);
  });
});

const combinations = (['renew', 'release'] as EndingChoice[]).flatMap(choice => (['story','adventure','veteran'] as Difficulty[]).flatMap(difficulty => (['sword','spear','bow'] as Weapon[]).map(weapon => ({ choice, difficulty, weapon }))));
it.each(combinations)('completes the final story with $weapon/$difficulty/$choice and earned resources', ({ choice, difficulty, weapon }) => {
  const s = secondEnding(); s.difficulty = difficulty; s.weapon = weapon; prepare(s, choice);
  s.zone = 'roots'; const env = createEnvironment('roots', s.journey, s.finale), c = new Combat(s, 'roots', env.obstacles);
  const outcome = fight(c, () => finaleReady(s)); disposeEnvironment(env);
  expect(s.hp, JSON.stringify(outcome)).toBeGreaterThan(0); expect(finaleReady(s), JSON.stringify(outcome)).toBe(true);
  expect(outcome.phases).toEqual([1,2,3]); expect(outcome.sealUses).toBeGreaterThan(0); claim(s);
  expect(finalHomecoming(s, { x: -2.8, z: 5.7 })).toBe(false); inspect(s, 'seed'); s.zone = 'village';
  expect(finalHomecoming(s, { x: -2.8, z: 5.7 })).toBe(true); expect(finalHomecoming(s, { x: -2.8, z: 5.7 })).toBe(false); claim(s);
  expect(s.finale.step).toBe(6); expect(completeFinale(s)).toBe(false); expect(s.level).toBeGreaterThanOrEqual(14);
  expect(parseSave(JSON.stringify(s))).toEqual(s);
  console.log(`FINALE ${weapon}/${difficulty}/${choice}`, JSON.stringify({ seconds: outcome.seconds, damage: outcome.damageTaken, potions: outcome.potionUses, anchors: outcome.sealUses, level: s.level }));
});

describe('v4 migration and corruption protection', () => {
  const storage = (data: Map<string, string>) => ({ getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k,v); } });
  it('migrates v3 without changing its original bytes, equipment, material, resources or cooldowns', () => {
    const s = secondEnding(); s.hp = 51; s.mp = 14; s.cooldowns.r = 5; s.materials.heart = 2; s.ownedItems.push('tide_bow'); s.equipment.bow = 'tide_bow';
    const raw = JSON.stringify({ ...s, version: 3, finale: undefined, trials: undefined }), data = new Map([[THIRD_SAVE_KEY,raw]]), repo = new SaveRepository(storage(data));
    const loaded = repo.load(); expect(loaded.status).toBe('migrated'); expect(loaded.state).toEqual(s); expect(data.size).toBe(1);
    repo.save(loaded.state); expect(data.get(THIRD_SAVE_KEY)).toBe(raw); expect(repo.load().status).toBe('loaded');
  });
  it('round trips each earned step and sends an interrupted trial to town without refilling', () => {
    for (const choice of ['renew', 'release'] as EndingChoice[]) for (let step = 1; step <= 6; step++) {
      const s = finalState(step, choice), data = new Map([[SAVE_KEY, JSON.stringify(s)]]);
      expect(new SaveRepository(storage(data)).load()).toMatchObject({ status:'loaded', state:s });
    }
    const s = finalState(); s.zone = 'trial'; s.hp = 37; s.mp = 12; s.cooldowns.q = 4; s.trials.best.dragon = 1; s.trials.clears.dragon = 1; s.trials.marks = 2; s.trials.forge.bow = 1;
    const result = new SaveRepository(storage(new Map([[SAVE_KEY,JSON.stringify(s)]]))).load();
    expect(result.status).toBe('loaded'); expect(result.state).toEqual({ ...s, zone:'village' });
  });
  it.each([
    (s: SaveState) => { s.finale.step = 1; s.finale.choice = null; s.finale.flags = ['seed']; },
    (s: SaveState) => { s.finale.choice = null; },
    (s: SaveState) => { s.finale.flags = s.finale.flags.filter(f => f !== 'past'); },
    (s: SaveState) => { s.journey.step = 6; },
    (s: SaveState) => { s.trials.marks = -1; },
    (s: SaveState) => { s.trials.forge.bow = 4; },
    (s: SaveState) => { s.trials.best.dragon = 3; },
  ])('preserves malformed v4 and recovers from the intact v3 copy', change => {
    const s = finalState(); change(s); const raw = JSON.stringify(s), legacy = JSON.stringify({ ...secondEnding(), version:3 });
    const data = new Map([[SAVE_KEY,raw],[THIRD_SAVE_KEY,legacy]]), repo = new SaveRepository(storage(data)), result = repo.load();
    expect(result.status).toBe('blocked'); expect(repo.save(newGame())).toBe(false); expect(data.get(SAVE_KEY)).toBe(raw);
    expect(repo.recover(result.legacy!)).toBe(true); expect(data.get(THIRD_SAVE_KEY)).toBe(legacy); expect([...data].some(([k,v]) => k.startsWith(`${SAVE_KEY}-backup-`) && v === raw)).toBe(true);
  });
});
