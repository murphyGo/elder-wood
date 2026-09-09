import { Combat, SEALS } from '../../src/game/combat';
import { ROOT_ANCHORS } from '../../src/game/finale';
import { maxHp, getSkill, type Skill } from '../../src/game/state';
import { clearLine, distance, direction, angleTo, inCone, addPoint, segmentDistance, type Point } from '../../src/game/geometry';

// Drives movement, dodges, skills and nearby anchors through the same rules as player input.
// It never sets health, damage, cooldowns, enemy positions or progress during a fight.
export function fight(c: Combat, done: () => boolean) {
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
      const needsAnchor = (e.species === 'starwarden' && e.bossPhase === 2 || e.species === 'dragon' && e.bossPhase === 3) && c.exposure < 1;
      if (needsAnchor) {
        const points = e.species === 'dragon' ? SEALS : ROOT_ANCHORS;
        const anchor = points.map((p,i) => ({p,i})).filter(a => c.sealCooldowns[a.i] === 0).sort((a,b) => distance(a.p,c.player)-distance(b.p,c.player))[0];
        if (anchor) { input = direction(angleTo(c.player,anchor.p)); if (e.species === 'dragon') c.activateSeal(anchor.i); else c.activateRoot(anchor.i); }
      }
      if (s.hp < maxHp(s) * .5 && !c.busy && !c.cooldowns.t && s.mp >= 22) c.skill('t');
      if (s.hp < maxHp(s) * .4) c.potion();
      if (!needsAnchor && !c.busy) {
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
