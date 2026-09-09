import { expect, it } from 'vitest';
import * as T from 'three';
import { character, weaponModel, type HumanRig } from '../src/game/actors';
import { animateHuman, type HeroPose } from '../src/game/animation';
import type { Cast } from '../src/game/combat';

function dispose(root: T.Object3D) { root.traverse(o => { if (o instanceof T.Mesh || o instanceof T.Line) o.geometry.dispose(); if (o instanceof T.Line) (o.material as T.Material).dispose(); }); }
const base: HeroPose = { weapon: 'sword', distance: 0, time: 0, attack: .2, action: 'attack', parry: false, dodge: false, jump: 0, landed: false };

it.each(['sword', 'spear'] as const)('%s attacks point the blade forward in the same direction as combat', weapon => {
  const root = character(); const rig = root.userData as HumanRig; const model = weaponModel(weapon); rig.hand.add(model); rig.weapon = model;
  for (let i = 0; i < 60; i++) animateHuman(root, 1 / 60, { ...base, weapon });
  root.updateMatrixWorld(true);
  const direction = new T.Vector3(0, 1, 0).transformDirection(model.matrixWorld);
  expect(direction.z).toBeGreaterThan(weapon === 'spear' ? .95 : .5); dispose(root);
});

it('releases the drawn bowstring when a charge is canceled and uses actual travel for steps', () => {
  const root = character(); const rig = root.userData as HumanRig; const model = weaponModel('bow'); rig.hand.add(model); rig.weapon = model;
  const cast: Cast = { type: 'charge', elapsed: .6, duration: .75, yaw: 0, origin: { x: 0, z: 0 }, power: 10, item: 'ranger_bow', hits: new Set(), strikes: 0 };
  animateHuman(root, .05, { ...base, weapon: 'bow', cast });
  const string = (model.userData.string as T.Line).geometry.attributes.position;
  expect(string.getZ(1)).toBeLessThan(-.25);
  animateHuman(root, .05, { ...base, weapon: 'bow', attack: 0 }); expect(string.getZ(1)).toBeCloseTo(0); expect(rig.stride).toBe(0);
  animateHuman(root, .05, { ...base, weapon: 'bow', distance: .2 }); expect(rig.stride).toBeGreaterThan(0); dispose(root);
});
