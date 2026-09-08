import { expect, it } from 'vitest';
import { Combat, SEALS } from '../src/game/combat';
import { createEnvironment, disposeEnvironment } from '../src/game/world';
import { angleTo, direction, distance, inCone, segmentDistance, addPoint, type Point } from '../src/game/geometry';
import { CHAPTERS, MONSTERS, newGame, questReady, completeQuest, canTravel, buyItem, equipItem, upgradeArmor, maxHp, getSkill, type Weapon, type Difficulty, type ItemId, type Skill, type Species } from '../src/game/state';

export function campaign(weapon: Weapon, difficulty: Difficulty) {
  const s = newGame(); s.weapon = weapon; s.chapter = 1; s.difficulty = difficulty;
  const results: { chapter: number; level: number; seconds: number; damage: number; potions: number; skills: number; seals: number; hp: number }[] = [];
  for (let chapter = 1; chapter <= 4; chapter++) {
    const zone = CHAPTERS[chapter].zone; expect(canTravel(s, zone)).toBe(true);
    if (chapter > 1) {
      s.zone = 'village';
      const id: ItemId = weapon === 'sword' ? 'ember_sword' : weapon === 'spear' ? chapter < 4 ? 'earth_spear' : 'dragon_spear' : 'frost_bow';
      if (buyItem(s, id)) equipItem(s, id);
      while (upgradeArmor(s)) { /* Spend only gold actually earned by the campaign. */ }
      const rest = new Combat(s, 'village', []); for (let t = 0; t < 30; t += .05) rest.tick(.05);
    }
    s.zone = zone; const env = createEnvironment(zone); const c = new Combat(s, zone, env.obstacles); disposeEnvironment(env);
    let elapsed = 0, stuck = 0, last = { ...c.player };
    while (s.hp > 0 && !questReady(s) && elapsed < 360) {
      const required = (e: typeof c.enemies[0]) => (CHAPTERS[chapter].objectives[e.species] ?? 0) > (s.kills[e.species] ?? 0);
      const e = c.enemies.filter(e => e.hp > 0).sort((a,b) => (required(a) ? 0 : 30) + distance(a.pos,c.player) - (required(b) ? 0 : 30) - distance(b.pos,c.player))[0];
      let input: Point = { x: 0, z: 0 };
      if (e) {
        c.targetId = e.id;
        const gap = distance(c.player, e.pos), desired = weapon === 'bow' ? 8 : weapon === 'spear' ? 3.7 : 2.7;
        const toward = direction(angleTo(c.player, e.pos));
        if (gap > desired) input = toward;
        if (weapon === 'bow' && gap < 4) input = { x: -toward.x, z: -toward.z };
        const needsSeal = e.species === 'dragon' && e.bossPhase === 3 && c.exposure < 1;
        if (needsSeal) {
          const seal = SEALS.map((p, i) => ({ p, i })).filter(v => !c.sealCooldowns[v.i]).sort((a,b) => distance(a.p,c.player)-distance(b.p,c.player))[0];
          if (seal) { input = direction(angleTo(c.player, seal.p)); c.activateSeal(seal.i); }
        }
        // Dodge a committed area or charging body, using only information shown in the game.
        for (const foe of c.enemies) {
          const t = foe.telegraph; if (!t) continue;
          const end = addPoint(t.origin, direction(t.yaw), t.range);
          const danger = t.shape === 'circle' ? distance(c.player,t.origin) < t.range + .6 : t.shape === 'cone' ? inCone(t.origin,c.player,t.yaw,t.range,t.angle,.6) : segmentDistance(c.player,t.origin,end) < t.width + .6;
          if (danger && (t.remaining < .4 || foe.mode === 'attack')) {
            input = t.shape === 'circle' ? direction(angleTo(t.origin,c.player)) : direction(t.yaw + Math.PI / 2);
            if (weapon === 'sword' && t.kind !== 'fire' && t.shape !== 'circle' && !c.busy && !c.cooldowns.e && s.mp >= 12 && s.level >= 3 && gap <= 4) c.skill('e');
            else c.dodge(input);
            break;
          }
        }
        for (const p of c.projectiles) if (!p.friendly && distance(c.player,p.pos) < 2.2) c.dodge(direction(p.yaw + Math.PI/2));
        if (s.hp < maxHp(s) * .5 && !c.busy && !c.cooldowns.t && s.mp >= 22 && s.level >= 3) c.skill('t');
        if (s.hp < maxHp(s) * .4) c.potion();
        if (!needsSeal && !c.busy) {
          const keys: Skill[] = weapon === 'sword' ? ['r','q'] : weapon === 'spear' ? ['r','e','q'] : ['r','q','e'];
          for (const key of keys) {
            const skill = getSkill(s,key);
            const useful = key === 'q' && weapon === 'spear' ? gap > 3.5 && gap < 6 : key === 'e' && weapon === 'bow' ? gap < 5 : gap < skill.range + c.radius(e.species);
            if (useful && s.level >= skill.level && !c.cooldowns[key] && s.mp >= skill.mana + 10 && (!e.airborne || weapon === 'bow') && c.skill(key)) break;
          }
          if (gap <= (weapon === 'bow' ? 16 : weapon === 'spear' ? 4.8 : 3.2) + c.radius(e.species)) c.attack();
        }
      }
      if (distance(last,c.player) < .01 && Math.hypot(input.x,input.z) > 0) stuck += .05; else stuck = 0;
      if (stuck > .4) input = direction(angleTo(c.player, e?.pos ?? c.player) + Math.PI / 2);
      last = { ...c.player }; c.tick(.05, input); c.drainEvents(); elapsed += .05;
    }
    const result = { chapter, level: s.level, seconds: Math.round(elapsed), damage: Math.round(c.metrics.damageTaken), potions: c.metrics.potionUses, skills: c.metrics.skillUses, seals: c.metrics.sealUses, hp: Math.round(s.hp) }; results.push(result);
    expect(s.hp, `${weapon}/${difficulty}: ${JSON.stringify(results)} killed; enemies=${JSON.stringify(c.enemies.map(e => ({ type:e.species,hp:e.hp,pos:e.pos,mode:e.mode })))}`).toBeGreaterThan(0);
    expect(questReady(s), `${weapon}/${difficulty}: ${JSON.stringify(results)} timeout; kills=${JSON.stringify(s.kills)} player=${JSON.stringify(c.player)} enemies=${JSON.stringify(c.enemies.map(e => ({type:e.species,hp:e.hp,pos:e.pos})))}`).toBe(true);
    completeQuest(s);
  }
  expect(s.chapter).toBe(5); expect(canTravel(s,'village')).toBe(true);
  return results;
}

it.each((['story','adventure','veteran'] as Difficulty[]).flatMap(difficulty => (['sword','spear','bow'] as Weapon[]).map(weapon => ({ weapon, difficulty }))))('completes all four story battles using $weapon on $difficulty with earned resources', ({ weapon, difficulty }) => {
  const results = campaign(weapon, difficulty); console.log(`CAMPAIGN ${weapon}/${difficulty}: ${JSON.stringify(results)}`);
});
