import { describe, it, expect } from 'vitest';
import * as T from 'three';
import { defaultSettings, readSettings, writeSettings, resolveQuality, SETTINGS_KEY } from '../src/game/settings';
import { FollowCamera } from '../src/game/camera';
import { Combat } from '../src/game/combat';
import { newGame } from '../src/game/state';

describe('display preferences and character preservation', () => {
  it('reads conservatively and changes only its own storage key', () => {
    const data = new Map([['elderwood-save-v1', 'legacy'], ['elderwood-save-v2', 'current']]);
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    expect(readSettings(storage)).toEqual(defaultSettings()); expect(data.size).toBe(2);
    const selected = { ...defaultSettings(), quality: 'low' as const, shake: 0, ambientMotion: false };
    expect(writeSettings(storage, selected)).toBe(true); expect(readSettings(storage)).toEqual(selected);
    expect(data.get('elderwood-save-v1')).toBe('legacy'); expect(data.get('elderwood-save-v2')).toBe('current');
    data.set(SETTINGS_KEY, '{broken'); expect(readSettings(storage, true)).toEqual(defaultSettings(true));
    expect(data.get(SETTINGS_KEY)).toBe('{broken');
  });
  it('rejects malformed fields, inherited keys and unsupported effect strengths', () => {
    const storage = { getItem: () => JSON.stringify({ quality: '__proto__', shake: 999, aimZoom: 'false', ambientMotion: null }) };
    expect(readSettings(storage, true)).toEqual({ quality: 'auto', shake: 0, aimZoom: false, ambientMotion: false });
  });
  it('contains read and write failures without losing current preferences', () => {
    const storage = { getItem: () => { throw Error('read'); }, setItem: () => { throw Error('quota'); } };
    expect(readSettings(storage)).toEqual(defaultSettings()); expect(writeSettings(storage, defaultSettings())).toBe(false);
    expect(writeSettings(undefined, defaultSettings())).toBe(false);
  });
  it('chooses a conservative automatic profile and respects an explicit choice', () => {
    const device = { width: 1440, coarse: false, pixelRatio: 2, reducedMotion: false };
    expect(resolveQuality(defaultSettings(), device)).toBe('high');
    expect(resolveQuality(defaultSettings(), { ...device, width: 390 })).toBe('low');
    expect(resolveQuality(defaultSettings(), { ...device, coarse: true })).toBe('medium');
    expect(resolveQuality(defaultSettings(), { ...device, coarse: true, pixelRatio: 3 })).toBe('low');
    expect(resolveQuality({ ...defaultSettings(), quality: 'high' }, { ...device, width: 390 })).toBe('high');
  });
});

describe('camera visibility and explicit aim', () => {
  it('moves above a nearby wall and rechecks the smoothed position', () => {
    const follow = new FollowCamera(), camera = new T.PerspectiveCamera();
    const wall = new T.Mesh(new T.BoxGeometry(12, 5, 1), new T.MeshBasicMaterial()); wall.position.set(0, 2.5, 4); wall.updateMatrixWorld(true);
    const focus = new T.Vector3(0, 1.35, 0); camera.position.set(0, 2, 10);
    for (let i = 0; i < 180; i++) {
      follow.update(camera, focus, 0, .2, 16, [wall], 1 / 60, new T.Vector3(.08, 0, 0));
      expect(follow.clearDistance(focus, camera.position, [wall]) + .001).toBeGreaterThanOrEqual(camera.position.distanceTo(focus));
    }
    expect(camera.position.distanceTo(focus)).toBeGreaterThan(6); expect(camera.position.y).toBeGreaterThan(5);
    wall.geometry.dispose(); wall.material.dispose();
  });
  it('does not snap a locked melee attack to a different nearby enemy or extend its reach', () => {
    const state = newGame(); const c = new Combat(state, 'forest', []); c.player = { x: 0, z: 0 };
    const [locked, close] = c.enemies; c.enemies = [locked, close];
    locked.pos = { x: 0, z: 12 }; close.pos = { x: 1, z: 0 }; c.lockedTargetId = locked.id;
    const hp = [locked.hp, close.hp]; c.attack();
    expect(c.targetId).toBe(locked.id); expect(c.facing).toBe(0); expect([locked.hp, close.hp]).toEqual(hp);
    c.lockedTargetId = undefined; c.cooldowns.attack = 0; c.attack(); expect(close.hp).toBeLessThan(hp[1]);
  });
});
