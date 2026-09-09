import * as T from 'three';
import type { HumanRig, AnimalRig } from './actors';
import type { Cast, Enemy } from './combat';
import type { Weapon } from './catalog';

const damp = (from: number, to: number, dt: number, rate = 12) => T.MathUtils.damp(from, to, rate, dt);
export interface HeroPose { weapon: Weapon; distance: number; time: number; attack: number; action: string; cast?: Cast; parry: boolean; dodge: boolean; jump: number; landed: boolean }
export function animateHuman(root: T.Group, dt: number, pose: HeroPose) {
  const r = root.userData as HumanRig;
  r.motion = damp(r.motion, Math.min(1, pose.distance / Math.max(.001, dt) / 4), dt);
  r.stride += pose.distance * 2.3;
  r.landing = pose.landed ? 1 : Math.max(0, r.landing - dt * 6);
  const gait = Math.sin(r.stride) * .62 * r.motion;
  r.body.position.y = Math.abs(Math.sin(r.stride)) * .045 * r.motion + Math.sin(pose.time * 2) * .012 - r.landing * .12;
  r.body.rotation.set(pose.dodge ? -.7 : r.motion * .04, 0, 0);
  r.head.rotation.y = Math.sin(pose.time * .6) * .04 * (1 - r.motion);
  r.cape.rotation.x = -.08 - r.motion * .32 + Math.sin(pose.time * 4) * .05;
  r.cape.rotation.z = Math.sin(r.stride * .5) * .06 * r.motion;
  r.legs.forEach((leg, i) => { leg.rotation.x = (i ? -gait : gait) - (pose.jump ? .3 : 0); r.knees[i].rotation.x = Math.max(0, i ? gait : -gait) * 1.15 + r.landing * .25 + (pose.jump ? .55 : 0); });
  const swing = Math.sin(Math.min(1, Math.max(0, 1 - pose.attack / .4)) * Math.PI);
  let ax = gait * .4, ay = 0, az = -.08, ex = -.14, bx = -gait * .6, by = 0, bz = .08, be = -.15;
  let wx = -.15, wy = 0, wz = 0;
  if (pose.weapon === 'sword') {
    ax = -.25 + gait * .25; wx = 1.85 - ax - ex;
    if (pose.attack > 0 || pose.cast?.type === 'triple') {
      const strike = pose.cast?.type === 'triple' ? Math.sin(pose.cast.elapsed / pose.cast.duration * Math.PI * 3) : swing;
      ax = -1.5 + strike * 1.6; ay = -.8 + strike * 1.4; az = -.45; ex = -.3;
      r.body.rotation.y = -.3 + strike * .6;
      wx = 1.1 + strike * .8 - ax - ex;
      if (pose.action === 'r') r.body.rotation.y = (1 - pose.attack / .5) * Math.PI * 2;
    }
    if (pose.parry) { ax = -1.15; ay = .45; az = -.7; ex = -.6; wx = -ax - ex; wz = -.7; bx = -.8; be = -1; }
  } else if (pose.weapon === 'spear') {
    ax = -.6; ex = -.3; wx = .4 - ax - ex;
    if (pose.attack > 0 || pose.cast?.type === 'dash') {
      ax = -1.5; ay = -.1; ex = -.3 + swing * .25; wx = Math.PI / 2 - ax - ex; bx = -1.2; by = -.55; be = -.4;
      r.body.rotation.x = .12; r.body.rotation.y = pose.action === 'e' ? Math.sin(pose.attack * 8) * .9 : -.15;
    }
  } else {
    const draw = pose.cast?.type === 'charge' ? Math.min(1, pose.cast.elapsed / pose.cast.duration) : pose.attack > 0 ? .65 : 0;
    ax = -.85 - draw * .45; ay = -.12; az = -.1; ex = -.12;
    bx = -.9 - draw * .2; by = -.8; bz = .12; be = -.55 - draw * .6;
    // Keep the bow upright as the shoulder raises; draw the middle string vertex toward the archer.
    wx = -ax - ex; wy = .12;
    const bow = r.weapon;
    if (bow?.userData.string) {
      const positions = (bow.userData.string as T.Line).geometry.attributes.position;
      positions.setZ(1, -draw * .38); positions.needsUpdate = true;
      const arrow = bow.userData.arrow as T.Group; arrow.position.z = -draw * .38; arrow.visible = pose.attack <= .18 || !!pose.cast;
    }
  }
  // Every channel is rewritten, so canceled actions and weapon switches cannot leave a stale pose.
  [[r.arms[0], ax, ay, az], [r.arms[1], bx, by, bz], [r.elbows[0], ex, 0, 0], [r.elbows[1], be, 0, 0], [r.hand, wx, wy, wz]].forEach(([joint, x, y, z]) => {
    const part = joint as T.Group; part.rotation.set(damp(part.rotation.x, x as number, dt, 18), damp(part.rotation.y, y as number, dt, 18), damp(part.rotation.z, z as number, dt, 18));
  });
}

export function animateAnimal(root: T.Group, enemy: Enemy, dt: number, time: number, traveled: number) {
  const r = root.userData as AnimalRig;
  const moving = Math.min(1, traveled / Math.max(.001, dt) / 2);
  r.motion = damp(r.motion, moving, dt); r.stride += traveled * (enemy.species === 'horse' ? 2.3 : 3.4);
  const preparing = enemy.mode === 'prepare', attacking = enemy.mode === 'attack';
  const windup = preparing && enemy.telegraph ? 1 - enemy.telegraph.remaining / enemy.telegraph.duration : 0;
  const gait = Math.sin(r.stride) * .55 * r.motion;
  r.legs.forEach((leg, i) => {
    const diagonal = i === 0 || i === 3 ? 1 : -1;
    leg.rotation.x = gait * diagonal;
    r.knees[i].rotation.x = Math.max(0, -gait * diagonal) * .9 + (preparing ? .2 : 0);
  });
  r.body.position.y = Math.abs(Math.sin(r.stride)) * .04 * r.motion - windup * .07;
  r.body.rotation.x = damp(r.body.rotation.x, preparing ? -.06 - windup * .08 : attacking ? .12 : 0, dt);
  r.head.rotation.x = damp(r.head.rotation.x, preparing ? -.15 : attacking ? .18 : Math.sin(time * 1.3) * .025, dt);
  r.jaw.rotation.x = damp(r.jaw.rotation.x, preparing ? .1 + windup * .35 : attacking ? .5 : 0, dt);
  r.tail.rotation.y = Math.sin(time * 2.5 + r.stride * .5) * .2;
  r.ears.forEach((ear, i) => { ear.rotation.z = Math.sin(time * 1.5 + i) * .06; });
  if (enemy.species === 'rabbit' || enemy.species === 'squirrel') {
    r.body.position.y += Math.max(0, Math.sin(r.stride)) * .23 * r.motion;
    r.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(r.stride + (i < 2 ? Math.PI : 0)) * .5 * r.motion; });
    r.tail.rotation.x = Math.sin(time * 3) * .08;
  }
  if (enemy.species === 'hippo' || enemy.species === 'cow') r.body.rotation.z = Math.sin(r.stride) * .045 * r.motion;
  if (enemy.species === 'tiger') r.body.position.y -= preparing ? .12 : 0;
  if (['shark', 'reef_shark', 'leviathan'].includes(enemy.species)) {
    r.tail.rotation.y = Math.sin(time * (moving ? 8 : 3)) * .38;
    r.body.rotation.z = Math.sin(time * 2) * .08;
    r.wings.forEach((wing, i) => { wing.rotation.z = Math.sin(time * 2) * .12 * (i ? -1 : 1); });
  }
  if (enemy.species === 'dragon') {
    r.wings.forEach((wing, i) => {
      const side = i ? -1 : 1;
      wing.rotation.y = damp(wing.rotation.y, side * (enemy.airborne ? Math.sin(time * 7) * .6 : 1.1 + Math.sin(time * 1.7) * .05), dt, 9);
      wing.rotation.z = damp(wing.rotation.z, side * (enemy.airborne ? .2 + Math.sin(time * 7) * .28 : .4), dt);
    });
    r.neck.rotation.x = damp(r.neck.rotation.x, preparing ? -.2 : attacking ? .18 : 0, dt);
    r.tail.rotation.y = Math.sin(time * 1.4) * .25;
  }
  r.altitude = damp(r.altitude, enemy.airborne ? 3.5 : ['shark', 'reef_shark', 'leviathan'].includes(enemy.species) ? preparing && enemy.telegraph?.kind === 'eruption' ? -2.2 : .6 : 0, dt, ['shark', 'reef_shark', 'leviathan'].includes(enemy.species) ? 9 : 3);
  return r.altitude;
}
