import { describe, expect, it } from 'vitest';
import { Combat, SEALS, type Enemy } from '../src/game/combat';
import { newGame, maxHp, maxMp, attackPower, ITEMS, equipItem, buyItem, getSkill, setDifficulty, mitigatedDamage, type Weapon, type ItemId, type Species } from '../src/game/state';
import { moveBody, clearLine } from '../src/game/geometry';

function arena(weapon: Weapon = 'sword', species: Species = 'hippo') {
  const s = newGame(); s.level = 8; s.chapter = 4; s.weapon = weapon; s.hp = maxHp(s); s.mp = maxMp(s);
  const c = new Combat(s, species === 'dragon' ? 'sanctum' : 'plains', []);
  const e = c.enemies.find(e => e.species === species) ?? c.enemies[0];
  e.species = species; e.hp = e.maxHp = 2000; e.pos = { x: 0, z: 3 }; e.spawn = { ...e.pos }; e.mode = 'recover'; e.timer = 100;
  c.enemies = [e]; c.player = { x: 0, z: 0 }; c.facing = 0; c.targetId = e.id;
  return { c, e, s };
}
function tick(c: Combat, seconds: number) { for (let t = 0; t < seconds - 1e-6; t += .05) { c.tick(.05); c.drainEvents(); } }
function item(id: ItemId) { const a = arena(ITEMS[id].weapon); a.s.ownedItems.push(id); equipItem(a.s, id); return a; }

 describe('weapon actions and resource boundaries', () => {
  it('provides nine distinct weapon skills, with one shared heal', () => {
    const ids = new Set<string>();
    for (const weapon of ['sword','spear','bow'] as Weapon[]) { for (const k of ['q','e','r'] as const) ids.add(getSkill({ weapon }, k).id); expect(getSkill({ weapon }, 't').id).toBe('forest-heal'); }
    expect(ids.size).toBe(9);
  });
  it('triple strike checks each hit separately, locks direction, and snapshots attack power', () => {
    const { c, e, s } = arena(); const power = attackPower(s); c.skill('q');
    c.tick(.05); expect(e.hp).toBe(2000 - Math.round(power * .8));
    e.pos.x = 12; s.level = 40; tick(c, .25); expect(e.hp).toBe(2000 - Math.round(power * .8));
    e.pos.x = 0; tick(c, .4); expect(e.hp).toBe(2000 - 2 * Math.round(power * .8));
  });
  it('rejects overlapping casts and keeps spent mana and cooldown when dodging a charge', () => {
    const { c, s } = arena('bow'); const mp = s.mp;
    expect(c.skill('r')).toBe(true); expect(c.skill('q')).toBe(false); expect(s.mp).toBe(mp - 28);
    c.dodge({ x: 1, z: 0 }); tick(c, 1); expect(c.projectiles).toHaveLength(0); expect(c.cooldowns.r).toBeGreaterThan(8); expect(c.cast).toBeUndefined();
  });
  it('weapon changes preserve shared slots and cancel prepared shots', () => {
    const { c, s } = arena('bow'); c.skill('r'); const cooldown = c.cooldowns.r;
    c.cancelAction(); s.weapon = 'sword'; expect(c.skill('r')).toBe(false); expect(c.cooldowns.r).toBe(cooldown); tick(c, 1); expect(c.projectiles).toHaveLength(0);
  });
  it('bow arrows keep their launch direction rather than homing', () => {
    const { c, e } = arena('bow'); e.pos.z = 8; c.attack(); e.pos.x = 7; tick(c, .8); expect(e.hp).toBe(2000);
  });
  it('charged arrows pierce each enemy once and expire', () => {
    const { c, e, s } = arena('bow'); e.pos.z = 5;
    const second: Enemy = { ...e, id: 99, pos: { x: 0, z: 10 } }; c.enemies.push(second);
    c.skill('r'); tick(c, 2); expect(e.hp).toBe(2000 - Math.round(attackPower(s) * 3.4)); expect(second.hp).toBe(e.hp); expect(c.projectiles).toHaveLength(0);
  });
  it('T heals on every weapon, while E on a bow does not heal', () => {
    for (const weapon of ['sword','spear','bow'] as Weapon[]) { const { c, s } = arena(weapon); s.hp = 1; c.skill('t'); expect(s.hp).toBeCloseTo(1 + maxHp(s) * .45); }
    const { c, s } = arena('bow'); s.hp = 1; c.skill('e'); expect(s.hp).toBe(1);
  });
 });

describe('geometry and collision', () => {
  it('stops fast bodies and projectiles at obstacles', () => {
    const obstacles = [{ x: 0, z: 4, radius: 2 }];
    expect(moveBody({ x: 0, z: 0 }, { x: 0, z: 20 }, .4, obstacles).z).toBeLessThanOrEqual(1.61);
    const { c, e } = arena('bow'); c.obstacles = obstacles; e.pos.z = 8;
    c.skill('r'); tick(c, 2); expect(e.hp).toBe(2000);
  });
  it('does not damage through a wall with melee, dash, or spear piercing', () => {
    for (const action of ['attack','q','r'] as const) {
      const { c, e } = arena('spear'); c.obstacles = [{ x: 0, z: 1.5, radius: .5 }];
      if (action === 'attack') c.attack(); else c.skill(action); tick(c, .7);
      expect(e.hp, action).toBe(2000); expect(c.player.z).toBeLessThanOrEqual(.61);
    }
  });
  it('sweeps enemies in front and blocks knockback at a wall', () => {
    const { c, e } = arena('spear'); e.pos.z = 2; c.obstacles = [{ x: 0, z: 4.5, radius: 1 }];
    const behind = { ...e, id: 90, pos: { x: 0, z: -3 } }; c.enemies.push(behind);
    c.skill('e'); expect(e.hp).toBeLessThan(2000); expect(e.pos.z).toBeLessThanOrEqual(3.5 - c.radius('hippo')); expect(behind.hp).toBe(2000);
  });
  it('blocks the stream except at the village bridge and clamps world bounds', () => {
    expect(moveBody({ x: -15, z: 0 }, { x: -15, z: 0 }, .4, []).x).toBeCloseTo(-16.7);
    expect(moveBody({ x: -15, z: 5 }, { x: -15, z: 0 }, .4, [], true).x).toBeLessThan(-25);
    expect(moveBody({ x: 30, z: 0 }, { x: 100, z: 0 }, .4, []).x).toBe(30.6);
    expect(clearLine({ x: 0, z: 0 }, { x: 0, z: 5 }, [{ x: 0, z: 2, radius: 1 }])).toBe(false);
  });
});

describe('six unique equipment effects', () => {
  it('burn refreshes duration without stacking and ticks three times after switching', () => {
    const { c, e, s } = item('ember_sword'); const power = attackPower(s);
    c.skill('r'); c.hit(e, 1, 'burn', power); const hp = e.hp; s.weapon = 'bow'; tick(c, 3.1);
    expect(e.hp).toBe(hp - 3 * Math.round(power * .25)); expect(e.burn).toBeUndefined();
  });
  it('parry blocks a single frontal strike and creates a temporary shield', () => {
    const { c, e, s } = item('ward_sword'); const hp = s.hp; c.skill('e');
    expect(c.hurt(30, e.pos, true, e)).toBe(0); expect(c.metrics.parries).toBe(1); expect(e.hp).toBeLessThan(2000);
    expect(c.shield).toBeCloseTo(maxHp(s) * .2); c.hurt(200, e.pos, true, e); expect(s.hp).toBeLessThan(hp); expect(c.metrics.parries).toBe(1);
    tick(c, 5); expect(c.shield).toBe(0);
  });
  it('rear attacks and ground attacks bypass a parry; dodge cancels it', () => {
    const { c } = arena(); c.skill('e'); expect(c.hurt(30, { x: 0, z: -3 })).toBeGreaterThan(0); expect(c.hurt(30, { x: 0, z: 3 }, false)).toBeGreaterThan(0);
    c.dodge(); expect(c.parryTime).toBe(0); expect(c.hurt(1000, { x: 0, z: 0 }, false)).toBe(0);
  });
  it('earth sweep slows and interrupts normal enemies', () => {
    const { c, e } = item('earth_spear'); c.skill('e'); expect(e.slow).toBe(3); expect(e.mode).toBe('recover'); expect(e.pos.z).toBeGreaterThan(3);
  });
  it('dragon spear applies non-stacking vulnerability', () => {
    const { c, e } = item('dragon_spear'); c.skill('r'); expect(e.weakened).toBe(4); const hp = e.hp;
    c.hit(e, 100, 'weaken'); expect(e.hp).toBe(hp - 120); c.hit(e, 100); expect(e.hp).toBe(hp - 240);
  });
  it('frost retreat slows the hit target and moves backwards', () => {
    const { c, e } = item('frost_bow'); e.pos.z = 8; c.skill('e'); tick(c, .5);
    expect(e.slow).toBeGreaterThan(2); expect(c.player.z).toBeCloseTo(-4);
  });
  it('storm chain hits at most two nearby enemies without recursive effects', () => {
    const { c, e, s } = item('storm_bow'); e.pos.z = 6;
    c.enemies.push(...[2, 3, 4].map((x, i) => ({ ...e, id: i + 20, pos: { x, z: 6 } })));
    c.skill('r'); tick(c, 1.6);
    expect(c.enemies[1].hp).toBe(2000 - Math.round(attackPower(s) * .7)); expect(c.enemies[2].hp).toBe(c.enemies[1].hp); expect(c.enemies[3].hp).toBe(2000);
  });
  it('purchases are gated, unique, persistent per weapon and never spend twice', () => {
    const s = newGame(); s.gold = 2000; expect(buyItem(s, 'ember_sword')).toBe(false);
    s.chapter = 2; expect(buyItem(s, 'ember_sword')).toBe(true); const gold = s.gold; expect(buyItem(s, 'ember_sword')).toBe(false); expect(s.gold).toBe(gold);
    expect(buyItem(s, 'ward_sword')).toBe(false); expect(equipItem(s, 'ember_sword')).toBe(true); equipItem(s, 'ranger_bow'); expect(s.equipment.sword).toBe('ember_sword');
    s.zone = 'forest'; expect(buyItem(s, 'frost_bow')).toBe(false); expect(equipItem(s, 'ward_sword')).toBe(false);
  });
});

describe('enemy attacks, difficulty and boss transitions', () => {
  it.each(['squirrel','rabbit','cow','horse','hippo','tiger','shark','dragon'] as Species[])('%s commits a telegraph that does not track the player', species => {
    const { c, e } = arena('sword', species); e.mode = 'idle'; e.cooldown = 0; c.tick(.05);
    const t = e.telegraph!; expect(t).toBeDefined(); const original = JSON.stringify({ origin: t.origin, yaw: t.yaw });
    c.player.x = 14; tick(c, .2); expect(JSON.stringify({ origin: t.origin, yaw: t.yaw })).toBe(original);
    tick(c, 1.7); expect(c.metrics.damageTaken).toBe(0);
  });
  it('deaths clear pending attacks and grant rewards exactly once', () => {
    const { c, e, s } = arena(); e.mode = 'idle'; e.cooldown = 0; c.tick(.05); const kills = s.totalKills;
    c.hit(e, 5000, 'burn'); c.hit(e, 5000); tick(c, 2); expect(s.totalKills).toBe(kills + 1); expect(e.telegraph).toBeUndefined(); expect(c.metrics.damageTaken).toBe(0);
  });
  it('difficulty independently changes HP, warning time, recovery, damage, and healing', () => {
    const results = ['story','adventure','veteran'].map(difficulty => {
      const { c, e, s } = arena(); setDifficulty(s, difficulty as typeof s.difficulty); const fresh = new Combat(s, 'plains', []);
      e.mode = 'idle'; e.cooldown = 0; c.tick(.05); const warning = e.timer; const damage = c.hurt(30, e.pos, false);
      s.hp = 1; c.potion(); return { hp: fresh.enemies[0].hp, warning, damage, healing: s.hp };
    });
    expect(results[0].hp).toBeLessThan(results[1].hp); expect(results[1].hp).toBeLessThan(results[2].hp);
    expect(results[0].warning).toBeGreaterThan(results[1].warning); expect(results[1].warning).toBeGreaterThan(results[2].warning);
    expect(results[0].damage).toBeLessThan(results[2].damage); expect(results[0].healing).toBeGreaterThan(results[2].healing);
    expect(mitigatedDamage(42, 28.5)).toBeGreaterThan(20);
    const s = newGame(); s.zone = 'forest'; expect(setDifficulty(s, 'story')).toBe(false);
  });
  it('dragon cannot skip phases; melee gets landing windows; seals expose phase three', () => {
    const { c, e, s } = arena('sword', 'dragon'); c.hit(e, 10000); expect(e.bossPhase).toBe(2); expect(e.hp).toBe(1400);
    c.tick(.05); expect(e.airborne).toBe(true); const hp = e.hp; c.attack(); expect(e.hp).toBe(hp);
    e.mode = 'recover'; e.timer = 100; tick(c, 5); expect(e.airborne).toBe(false); c.attack(); expect(e.hp).toBeLessThan(hp);
    c.hit(e, 10000); expect(e.bossPhase).toBe(3); expect(c.hit(e, 10000)).toBe(false);
    expect(c.activateSeal(0)).toBe(false); Object.assign(c.player, SEALS[0]); expect(c.activateSeal(0)).toBe(true); expect(c.activateSeal(0)).toBe(false);
    c.hit(e, 10000); expect(s.kills.dragon).toBe(1); expect(c.activateSeal(1)).toBe(false);
  });
  it('practice dragon completion leaves all progression and rewards intact', () => {
    const { c, e, s } = arena('bow', 'dragon'); c.practice = true; s.chapter = 6; const before = { gold: s.gold, xp: s.xp, kills: s.totalKills, chapter: s.chapter };
    c.hit(e, 10000); tick(c, 1.85); c.hit(e, 10000); Object.assign(c.player, SEALS[0]); c.activateSeal(0); c.hit(e, 10000); c.hit(e, 10000);
    expect({ gold: s.gold, xp: s.xp, kills: s.totalKills, chapter: s.chapter }).toEqual(before); expect(c.metrics.kills).toBe(1);
  });
});
