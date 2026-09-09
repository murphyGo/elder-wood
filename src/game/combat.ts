import { MONSTERS, ZONES, DIFFICULTIES, WEAPONS, ITEMS, getSkill, equippedItem, attackPower, defense, mitigatedDamage, maxHp, maxMp, recordKill, questReady, useSkill, usePotion, isSafeZone, isSeaShark, isBoss, type SaveState, type Species, type Zone, type Skill, type ItemId, type ItemEffect, type Weapon } from './state';
import { journeyReady, DROPS, MATERIALS, type MaterialId } from './journey';
import { finaleReady, ROOT_ANCHORS } from './finale';
import { addPoint, angleTo, clearLine, copyPoint, direction, distance, inCone, moveBody, segmentDistance, segmentHitTime, type Point, type Obstacle } from './geometry';

export type EnemyMode = 'idle' | 'approach' | 'prepare' | 'attack' | 'recover' | 'dead';
export interface Telegraph { shape: 'circle' | 'cone' | 'line'; origin: Point; yaw: number; range: number; angle: number; width: number; label: string; kind: 'melee' | 'charge' | 'shot' | 'eruption' | 'fire'; duration: number; remaining: number }
export interface Enemy {
  id: number; species: Species; pos: Point; spawn: Point; hp: number; maxHp: number; facing: number;
  mode: EnemyMode; timer: number; cooldown: number; windup: number; dead: number; phase: number; flash: number;
  telegraph?: Telegraph; chargeHit: boolean; attackIndex: number; slow: number; weakened: number;
  burn?: { ttl: number; tick: number; power: number }; bossPhase: number; phaseTime: number; airborne: boolean;
}
export interface Projectile { id: number; pos: Point; yaw: number; speed: number; remaining: number; width: number; damage: number; friendly: boolean; owner: number; pierce: boolean; effect: ItemEffect; power: number; hits: Set<number>; chainUsed: boolean }
export interface CombatEvent { kind: 'float' | 'fx' | 'toast' | 'sound' | 'kill' | 'level' | 'quest' | 'death' | 'save' | 'phase' | 'practice'; text?: string; pos?: Point; color?: string; sound?: 'hit' | 'swing' | 'level' | 'heal' | 'click' | 'hurt'; radius?: number; yaw?: number; shape?: 'ring' | 'slash' | 'line'; }
export interface Cast { type: 'triple' | 'dash' | 'retreat' | 'charge'; elapsed: number; duration: number; yaw: number; origin: Point; power: number; item: ItemId; hits: Set<number>; strikes: number }
export const SEALS: Point[] = [{ x: -6, z: -6 }, { x: 6, z: -6 }, { x: 0, z: 3 }];
export interface Encounter { roster: Species[]; hp: number; attack: number; trial: boolean }

export class Combat {
  player: Point = { x: 1.4, z: 8 };
  facing = Math.PI;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  events: CombatEvent[] = [];
  targetId?: number;
  lockedTargetId?: number;
  cast?: Cast;
  parryTime = 0; parryItem: ItemId = 'traveler_sword'; parryPower = 0;
  dodgeTime = 0; dodgeYaw = 0; shield = 0; shieldTime = 0; combatTime = 0;
  exposure = 0; sealCooldowns = [0, 0, 0]; time = 0; questNotified = false;
  metrics = { damageDealt: 0, damageTaken: 0, potionUses: 0, skillUses: 0, parries: 0, kills: 0, sealUses: 0 };
  private projectileId = 0;
  constructor(public state: SaveState, public zone: Zone, public obstacles: Obstacle[], public practice = false, public encounter?: Encounter) {
    const species = encounter?.roster ?? ZONES[zone].creatures;
    const count = encounter ? species.length : isSafeZone(zone) || zone === 'trial' ? 0 : zone === 'sanctum' ? (practice || state.chapter <= 4 ? 1 : 0) : zone === 'abyss' ? (state.journey.step === 5 && !state.journey.flags.includes('leviathan_freed') ? 1 : 0) : zone === 'roots' ? (state.finale.step === 4 && !state.finale.flags.includes('aster_freed') ? 1 : 0) : zone === 'ruins' ? 4 : 7;
    for (let i = 0; i < count; i++) {
      const type = species[i % species.length], data = MONSTERS[type];
      const point = isBoss(type) ? { x: 0, z: -7 } : { x: (i % 2 ? -1 : 1) * (4 + (i * 1.7 % 6)), z: (zone === 'wreck' || zone === 'ruins' || zone === 'trial' ? -8 : 2) - Math.floor(i / 2) * (zone === 'wreck' || zone === 'ruins' ? 4 : 6) };
      const spawn = moveBody(point, { x: 0, z: 0 }, this.radius(type), obstacles);
      const hp = Math.round(data.hp * DIFFICULTIES[state.difficulty].hp * (encounter?.hp ?? 1));
      this.enemies.push({ id: i, species: type, pos: copyPoint(spawn), spawn, hp, maxHp: hp, facing: 0, mode: 'idle', timer: 0, cooldown: 1 + i * 0.1, windup: 0, dead: 0, phase: i * 2.4, flash: 0, chargeHit: false, attackIndex: 0, slow: 0, weakened: 0, bossPhase: 1, phaseTime: 0, airborne: false });
    }
  }
  get cooldowns() { return this.state.cooldowns; }
  get boss() { return this.enemies.find(e => isBoss(e.species) && e.hp > 0); }
  get busy() { return !!this.cast || this.parryTime > 0 || this.dodgeTime > 0; }
  get alive() { return this.state.hp > 0; }
  radius(species: Species) { return MONSTERS[species].size * 0.48; }
  drainEvents() { return this.events.splice(0); }
  private emit(event: CombatEvent) { this.events.push(event); }
  private toast(text: string) { this.emit({ kind: 'toast', text }); }
  private fx(pos: Point, color: string, radius: number, shape: CombatEvent['shape'] = 'ring', yaw = this.facing) { this.emit({ kind: 'fx', pos: copyPoint(pos), color, radius, shape, yaw }); }
  private persist() { this.emit({ kind: 'save' }); }
  nearest(range: number) { return this.enemies.filter(e => e.hp > 0 && distance(e.pos, this.player) <= range + this.radius(e.species)).sort((a, b) => distance(a.pos, this.player) - distance(b.pos, this.player))[0]; }
  private aim(range: number): number {
    const selected = this.enemies.find(e => e.id === this.targetId && e.hp > 0 && distance(e.pos, this.player) <= range + this.radius(e.species));
    const locked = this.enemies.find(e => e.id === this.lockedTargetId && e.hp > 0 && distance(e.pos, this.player) <= 26);
    const target = locked ?? selected ?? this.nearest(range);
    if (target) { this.targetId = target.id; this.facing = angleTo(this.player, target.pos); }
    return this.facing;
  }
  cancelAction() { this.cast = undefined; this.parryTime = 0; }
  private move(point: Point, dx: number, dz: number, radius: number) {
    Object.assign(point, moveBody(point, { x: dx, z: dz }, radius, this.obstacles, this.zone === 'village'));
  }
  private wallDistance(origin: Point, yaw: number, range: number, width = 0): number {
    const end = addPoint(origin, direction(yaw), range);
    let t = 1;
    for (const o of this.obstacles) { const hit = segmentHitTime(origin, end, o, o.radius + width); if (hit !== null) t = Math.min(t, hit); }
    return Math.max(0, range * t - 0.02);
  }
  attack(): boolean {
    if (!this.alive || this.busy || this.cooldowns.attack > 0) return false;
    const w = WEAPONS[this.state.weapon]; const yaw = this.aim(w.range);
    this.cooldowns.attack = w.delay;
    const power = attackPower(this.state);
    this.emit({ kind: 'sound', sound: 'swing' });
    if (this.state.weapon === 'bow') this.shoot(this.player, yaw, power, w.range, 0.16, false, 'none', power);
    else {
      const target = this.enemies.filter(e => this.canMelee(e) && inCone(this.player, e.pos, yaw, w.range, this.state.weapon === 'sword' ? 110 : 45, this.radius(e.species)) && clearLine(this.player, e.pos, this.obstacles)).sort((a, b) => distance(a.pos, this.player) - distance(b.pos, this.player))[0];
      if (target) this.hit(target, power);
      this.fx(this.player, '#ecd69f', w.range, this.state.weapon === 'sword' ? 'slash' : 'line', yaw);
    }
    this.persist(); return true;
  }
  skill(key: Skill): boolean {
    if (!this.alive) return false;
    if (this.busy) { this.toast('현재 동작이 끝난 뒤 사용할 수 있습니다. 회피로 취소할 수 있습니다.'); return false; }
    const skill = getSkill(this.state, key); const error = useSkill(this.state, key, this.cooldowns[key]);
    if (error) { this.toast(error); return false; }
    this.cooldowns[key] = skill.cooldown; this.metrics.skillUses++;
    const power = attackPower(this.state), item = this.state.equipment[this.state.weapon];
    const yaw = key === 't' ? this.facing : this.aim(skill.range);
    this.emit({ kind: 'sound', sound: key === 't' ? 'heal' : 'swing' });
    if (key === 't') { this.fx(this.player, '#b7e5ac', 2.5); this.emit({ kind: 'float', text: '체력 회복', pos: copyPoint(this.player), color: '#b7e5ac' }); }
    else if (skill.id === 'sword-triple' || skill.id === 'spear-dash' || skill.id === 'bow-retreat' || skill.id === 'bow-charge') {
      const type = skill.id === 'sword-triple' ? 'triple' : skill.id === 'spear-dash' ? 'dash' : skill.id === 'bow-retreat' ? 'retreat' : 'charge';
      this.cast = { type, elapsed: 0, duration: skill.duration!, yaw, origin: copyPoint(this.player), power, item, hits: new Set(), strikes: 0 };
      if (type === 'charge') this.fx(this.player, '#b3d5ed', 1.5);
      if (type === 'retreat') this.shoot(this.player, yaw, power * skill.multiplier, skill.range, 0.2, false, ITEMS[item].effect === 'frost' ? 'frost' : 'none', power);
    } else if (skill.id === 'sword-parry') {
      this.parryTime = skill.duration!; this.parryItem = item; this.parryPower = power;
      this.fx(this.player, '#d4e8a8', 1.2);
    } else if (skill.id === 'sword-whirl') {
      for (const e of this.enemies) if (this.canMelee(e) && distance(e.pos, this.player) <= skill.range + this.radius(e.species) && clearLine(this.player, e.pos, this.obstacles)) this.hit(e, power * skill.multiplier, ITEMS[item].effect === 'burn' ? 'burn' : 'none', power);
      this.fx(this.player, ITEMS[item].effect === 'burn' ? '#edac73' : '#ecd69f', skill.range);
    } else if (skill.id === 'spear-sweep') {
      for (const e of this.enemies) if (this.canMelee(e) && inCone(this.player, e.pos, yaw, skill.range, skill.angle!, this.radius(e.species)) && clearLine(this.player, e.pos, this.obstacles)) {
        if (this.hit(e, power * skill.multiplier, ITEMS[item].effect === 'earth' ? 'earth' : 'none', power) && !isBoss(e.species)) {
          const d = direction(angleTo(this.player, e.pos)); this.move(e.pos, d.x * 2.4, d.z * 2.4, this.radius(e.species));
          if (e.hp > 0) { e.mode = 'recover'; e.timer = 0.55; e.telegraph = undefined; e.windup = 0; }
        }
      }
      this.fx(this.player, '#d7d0a0', skill.range, 'slash', yaw);
    } else if (skill.id === 'spear-pierce') {
      const range = this.wallDistance(this.player, yaw, skill.range); const end = addPoint(this.player, direction(yaw), range);
      for (const e of this.enemies) if (this.canMelee(e) && segmentDistance(e.pos, this.player, end) <= skill.width! + this.radius(e.species) && clearLine(this.player, e.pos, this.obstacles)) this.hit(e, power * skill.multiplier, ITEMS[item].effect === 'weaken' ? 'weaken' : 'none', power);
      this.fx(this.player, '#d7bded', range, 'line', yaw);
    } else if (skill.id === 'bow-fan') for (const offset of [-12, 0, 12]) this.shoot(this.player, yaw + offset * Math.PI / 180, power * skill.multiplier, skill.range, 0.19, false, 'none', power);
    this.persist(); return true;
  }
  potion(): boolean {
    if (!this.alive || this.cooldowns.potion > 0) return false;
    if (!usePotion(this.state)) { this.toast(this.state.potions ? '이미 체력이 가득 찼습니다.' : '물약이 없습니다. 마을 상점에서 구입하세요.'); return false; }
    this.cooldowns.potion = 4; this.metrics.potionUses++; this.fx(this.player, '#e7a59a', 2);
    this.emit({ kind: 'sound', sound: 'heal' }); this.persist(); return true;
  }
  dodge(input?: Point): boolean {
    if (!this.alive || this.cooldowns.dodge > 0) return false;
    this.cancelAction(); this.dodgeYaw = input && Math.hypot(input.x, input.z) > 0.01 ? Math.atan2(input.x, input.z) : this.facing;
    this.dodgeTime = 0.32; this.cooldowns.dodge = 1.8; this.fx(this.player, '#c2d4be', 1.5); this.persist(); return true;
  }
  activateSeal(index: number): boolean {
    const boss = this.boss;
    if (!this.alive || !boss || boss.species !== 'dragon' || boss.bossPhase !== 3 || !SEALS[index] || distance(this.player, SEALS[index]) > 3.2) return false;
    if (this.sealCooldowns[index] > 0) { this.toast(`봉인 장치 재충전 ${Math.ceil(this.sealCooldowns[index])}초`); return false; }
    this.exposure = 8; this.sealCooldowns[index] = 12; this.metrics.sealUses++;
    boss.mode = 'recover'; boss.timer = 2; boss.telegraph = undefined; boss.windup = 0;
    this.projectiles = this.projectiles.filter(p => p.owner !== boss.id || p.friendly);
    this.fx(SEALS[index], '#cee8b5', 4); this.toast('봉인이 공명합니다! 8초 동안 용의 보호막이 해제됩니다.'); this.emit({ kind: 'sound', sound: 'level' }); return true;
  }
  activateRoot(index: number): boolean {
    const boss = this.boss, choice = this.state.finale.choice;
    if (!this.alive || !choice || boss?.species !== 'starwarden' || boss.bossPhase !== 2 || !ROOT_ANCHORS[index] || distance(this.player, ROOT_ANCHORS[index]) > 3.2) return false;
    if (this.sealCooldowns[index] > 0) { this.toast(`공명 장치 재충전 ${Math.ceil(this.sealCooldowns[index])}초`); return false; }
    this.exposure = choice === 'renew' ? 10 : 8; this.sealCooldowns[index] = 12; this.metrics.sealUses++;
    if (choice === 'renew') { this.shield = Math.max(this.shield, maxHp(this.state) * .2); this.shieldTime = this.exposure; }
    else { this.state.hp = Math.min(maxHp(this.state), this.state.hp + maxHp(this.state) * .18); this.state.mp = Math.min(maxMp(this.state), this.state.mp + 15); }
    boss.mode = 'recover'; boss.timer = 2.5; boss.telegraph = undefined; boss.windup = 0;
    this.projectiles = this.projectiles.filter(p => p.owner !== boss.id || p.friendly);
    this.fx(ROOT_ANCHORS[index], choice === 'renew' ? '#e4ca87' : '#9fd8c2', 4);
    this.toast(`${choice === 'renew' ? '함께 지키는 빛 · 보호막' : '나누어진 별빛 · 체력과 마력 회복'}! ${this.exposure}초 동안 뿌리의 보호막이 해제됩니다.`);
    this.emit({ kind: 'sound', sound: 'level' }); this.persist(); return true;
  }
  private diving(e: Enemy) { return isSeaShark(e.species) && e.mode === 'prepare' && (e.species !== 'leviathan' || e.telegraph?.kind === 'eruption'); }
  private canMelee(e: Enemy) { return e.hp > 0 && !e.airborne && !this.diving(e); }
  private vulnerable(e: Enemy): boolean { return e.hp > 0 && !(e.species === 'dragon' && e.bossPhase === 2 && e.phaseTime < 1.8) && !this.diving(e) && !(e.species === 'dragon' && e.bossPhase === 3 && this.exposure <= 0) && !(e.species === 'starwarden' && e.bossPhase === 2 && this.exposure <= 0); }
  hit(e: Enemy, raw: number, effect: ItemEffect = 'none', power = raw): boolean {
    if (!this.vulnerable(e)) return false;
    const damage = Math.max(1, Math.round(raw * (e.weakened > 0 ? 1.2 : 1)));
    // A single burst cannot skip flight or the seal mechanic, even on a high-level replay.
    const floor = e.species === 'starwarden' && e.bossPhase < 3 ? e.maxHp * (e.bossPhase === 1 ? .65 : .3) : e.species === 'leviathan' && e.bossPhase === 1 ? e.maxHp * .5 : e.species === 'dragon' && e.bossPhase < 3 ? e.maxHp * (e.bossPhase === 1 ? 0.7 : 0.35) : 0;
    const applied = Math.min(Math.max(0, e.hp - floor), damage); e.hp -= applied; e.flash = 0.18; this.metrics.damageDealt += applied; this.combatTime = 5;
    this.emit({ kind: 'float', text: String(Math.round(applied)), pos: copyPoint(e.pos), color: effect === 'burn' ? '#f0b077' : '#ffedbe' }); this.emit({ kind: 'sound', sound: 'hit' });
    if (e.hp <= 0) { this.kill(e); return true; }
    if (effect === 'burn') e.burn = { ttl: 3, tick: e.burn?.tick ?? 0, power: power * 0.25 };
    if (effect === 'earth' || effect === 'frost') e.slow = 3;
    if (effect === 'weaken') e.weakened = 4;
    if (e.species === 'dragon') this.updateBossPhase(e);
    if (e.species === 'leviathan') this.updateSeaBossPhase(e);
    if (e.species === 'starwarden') this.updateRootBossPhase(e);
    return true;
  }
  private kill(e: Enemy) {
    if (e.mode === 'dead') return;
    e.hp = 0; e.mode = 'dead'; e.dead = 16; e.telegraph = undefined; e.windup = 0; e.burn = undefined; e.airborne = false;
    this.projectiles = this.projectiles.filter(p => p.friendly || p.owner !== e.id);
    if (this.targetId === e.id) this.targetId = undefined;
    this.fx(e.pos, '#dccd9e', 1.8); this.metrics.kills++;
    if (this.encounter?.trial) return; // The run grants its reward once, after the final wave.
    if (this.practice) { this.emit({ kind: 'practice', text: '연습전 완료 · 이야기와 보상은 그대로 유지됩니다.' }); return; }
    const levels = recordKill(this.state, e.species); const data = MONSTERS[e.species];
    this.emit({ kind: 'kill', text: `${data.name} 해방 · +${data.xp} EXP · +${data.gold} G` });
    this.emit({ kind: 'toast', text: Object.entries(DROPS[e.species]).map(([key, amount]) => `${MATERIALS[key as MaterialId].name} +${amount}`).join(' · ') });
    if (levels) { this.emit({ kind: 'level', text: `레벨 ${this.state.level}` }); this.emit({ kind: 'sound', sound: 'level' }); this.fx(this.player, '#f0dda6', 3); }
    if ((questReady(this.state) || journeyReady(this.state) || finaleReady(this.state)) && !this.questNotified) { this.questNotified = true; this.emit({ kind: 'quest' }); }
    this.persist();
  }
  hurt(raw: number, origin: Point, direct = true, attacker?: Enemy): number {
    if (!this.alive || this.dodgeTime > 0) return 0;
    if (direct && this.parryTime > 0 && inCone(this.player, origin, this.facing, 100, 140)) {
      this.parryTime = 0; this.metrics.parries++; this.emit({ kind: 'float', text: '받아치기!', pos: copyPoint(this.player), color: '#d2e8a8' }); this.fx(this.player, '#e5edbc', 2.4);
      if (ITEMS[this.parryItem].effect === 'shield') { this.shield = maxHp(this.state) * 0.2; this.shieldTime = 5; }
      if (attacker?.hp && distance(this.player, attacker.pos) <= 4 + this.radius(attacker.species) && clearLine(this.player, attacker.pos, this.obstacles)) {
        this.hit(attacker, this.parryPower * 2.4);
        if (attacker.hp > 0 && !isBoss(attacker.species)) { attacker.mode = 'recover'; attacker.timer = 1; attacker.telegraph = undefined; attacker.windup = 0; }
      }
      return 0;
    }
    const damage = mitigatedDamage(raw * DIFFICULTIES[this.state.difficulty].damage, defense(this.state));
    const absorbed = Math.min(damage, this.shield); this.shield -= absorbed;
    const actual = Math.min(this.state.hp, damage - absorbed); this.state.hp -= actual; this.metrics.damageTaken += actual; this.combatTime = 6;
    this.emit({ kind: 'float', text: actual ? `−${actual}` : `흡수 ${absorbed}`, pos: copyPoint(this.player), color: actual ? '#ffada0' : '#c9e4b1' });
    if (actual) this.emit({ kind: 'sound', sound: 'hurt' });
    if (!this.alive) { this.cancelAction(); this.projectiles = []; this.emit({ kind: 'death' }); }
    this.persist(); return actual;
  }
  private shoot(origin: Point, yaw: number, damage: number, range: number, width: number, pierce: boolean, effect: ItemEffect, power: number, owner = -1) {
    this.projectiles.push({ id: ++this.projectileId, pos: copyPoint(origin), yaw, speed: owner < 0 ? 27 : 8, remaining: range, width, damage, friendly: owner < 0, owner, pierce, effect, power, hits: new Set(), chainUsed: false });
  }
  tick(dt: number, input: Point = { x: 0, z: 0 }) {
    if (!this.alive) return;
    dt = Math.max(0, Math.min(dt, 0.05)); this.time += dt; this.state.playTime += dt;
    for (const key of Object.keys(this.cooldowns) as (keyof typeof this.cooldowns)[]) this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
    this.combatTime = Math.max(0, this.combatTime - dt); this.parryTime = Math.max(0, this.parryTime - dt); this.shieldTime = Math.max(0, this.shieldTime - dt); if (!this.shieldTime) this.shield = 0;
    this.exposure = Math.max(0, this.exposure - dt); this.sealCooldowns = this.sealCooldowns.map(t => Math.max(0, t - dt));
    if (this.dodgeTime > 0) { const d = direction(this.dodgeYaw); const elapsed = Math.min(dt, this.dodgeTime); this.move(this.player, d.x * 15 * elapsed, d.z * 15 * elapsed, 0.4); this.dodgeTime = Math.max(0, this.dodgeTime - dt); }
    else if (!this.cast || this.cast.type === 'triple') {
      const length = Math.hypot(input.x, input.z);
      if (length > 0) { const speed = this.cast ? 2 : 5.3; this.move(this.player, input.x / length * speed * dt, input.z / length * speed * dt, 0.4); if (!this.cast && !this.parryTime) this.facing = Math.atan2(input.x, input.z); }
    }
    this.updateCast(dt);
    for (const e of this.enemies) { if (!this.alive) break; this.updateEnemy(e, dt); }
    if (!this.alive) return;
    this.updateProjectiles(dt);
    if (!this.alive) return;
    this.state.mp = Math.min(maxMp(this.state), this.state.mp + dt * (this.combatTime ? 1.5 : 4));
    if (!this.combatTime) this.state.hp = Math.min(maxHp(this.state), this.state.hp + dt * (isSafeZone(this.zone) ? 12 : 2.5) * DIFFICULTIES[this.state.difficulty].healing);
  }
  private updateCast(dt: number) {
    const c = this.cast; if (!c) return;
    const step = Math.min(dt, c.duration - c.elapsed); c.elapsed += step;
    const skill = getSkill({ weapon: ITEMS[c.item].weapon }, c.type === 'retreat' ? 'e' : c.type === 'charge' ? 'r' : 'q');
    if (c.type === 'triple') {
      while (c.strikes < 3 && c.elapsed >= c.strikes * 0.22) {
        c.strikes++;
        for (const e of this.enemies) if (this.canMelee(e) && inCone(this.player, e.pos, c.yaw, skill.range, skill.angle!, this.radius(e.species)) && clearLine(this.player, e.pos, this.obstacles)) this.hit(e, c.power * skill.multiplier);
        this.fx(this.player, '#e9d0a0', skill.range, 'slash', c.yaw);
      }
    } else if (c.type === 'dash' || c.type === 'retreat') {
      const old = copyPoint(this.player); const d = direction(c.yaw); const travel = (c.type === 'dash' ? 5 : -4) / c.duration * step;
      this.move(this.player, d.x * travel, d.z * travel, 0.4);
      if (c.type === 'dash') {
        for (const e of this.enemies) if (this.canMelee(e) && !c.hits.has(e.id) && segmentDistance(e.pos, old, this.player) <= 0.9 + this.radius(e.species) && clearLine(old, e.pos, this.obstacles)) { c.hits.add(e.id); this.hit(e, c.power * skill.multiplier); }
        this.fx(this.player, '#cddcb2', 0.8);
      }
    }
    if (c.elapsed >= c.duration - 1e-6) {
      if (c.type === 'charge') this.shoot(this.player, c.yaw, c.power * skill.multiplier, skill.range, skill.width!, true, ITEMS[c.item].effect === 'chain' ? 'chain' : 'none', c.power);
      this.cast = undefined;
    }
  }
  private updateProjectiles(dt: number) {
    for (const p of [...this.projectiles]) {
      if (!this.projectiles.includes(p)) continue;
      if (!this.alive) break;
      const travel = Math.min(p.remaining, p.speed * dt), end = addPoint(p.pos, direction(p.yaw), travel);
      let wall = 2;
      for (const o of this.obstacles) { const t = segmentHitTime(p.pos, end, o, o.radius + p.width); if (t !== null) wall = Math.min(wall, t); }
      let remove = wall <= 1;
      if (p.friendly) {
        const hits = this.enemies.filter(e => this.vulnerable(e) && !p.hits.has(e.id)).map(e => ({ e, t: segmentHitTime(p.pos, end, e.pos, this.radius(e.species) + p.width) })).filter(h => h.t !== null && h.t < wall).sort((a, b) => a.t! - b.t!);
        for (const { e } of hits) {
          p.hits.add(e.id); this.hit(e, p.damage, p.effect === 'chain' ? 'none' : p.effect, p.power);
          if (p.effect === 'chain' && !p.chainUsed) {
            p.chainUsed = true;
            const neighbors = this.enemies.filter(other => other.id !== e.id && this.vulnerable(other) && distance(other.pos, e.pos) <= 5 && clearLine(e.pos, other.pos, this.obstacles)).sort((a, b) => distance(a.pos, e.pos) - distance(b.pos, e.pos)).slice(0, 2);
            for (const other of neighbors) { this.hit(other, p.power * 0.7); this.fx(e.pos, '#b3d7f5', distance(e.pos, other.pos), 'line', angleTo(e.pos, other.pos)); }
          }
          if (!p.pierce) { remove = true; break; }
        }
      } else {
        const t = segmentHitTime(p.pos, end, this.player, 0.4 + p.width);
        if (t !== null && t < wall) { this.hurt(p.damage, p.pos, true, this.enemies.find(e => e.id === p.owner)); remove = true; }
      }
      p.pos = end; p.remaining -= travel;
      if (remove || p.remaining <= 0) this.projectiles = this.projectiles.filter(other => other.id !== p.id);
    }
  }

  // Enemy state machines and their committed attack shapes follow below.
  private updateSeaBossPhase(e: Enemy) {
    if (e.hp > e.maxHp * .5 || e.bossPhase === 2) return;
    e.bossPhase = 2; e.phaseTime = 0; e.mode = 'recover'; e.timer = 2; e.telegraph = undefined; e.windup = 0;
    this.projectiles = this.projectiles.filter(p => p.friendly || p.owner !== e.id);
    this.emit({ kind: 'phase', text: '네리스 2단계 · 깊어진 검은 조수! 잠행 범위를 피하고 수면 위로 돌아올 때 공격하세요.' });
  }
  private updateBossPhase(e: Enemy) {
    const phase = e.hp / e.maxHp <= 0.35 ? 3 : e.hp / e.maxHp <= 0.7 ? 2 : 1;
    if (phase === e.bossPhase) return;
    e.bossPhase = phase; e.phaseTime = 0; e.mode = 'recover'; e.timer = 1.8; e.telegraph = undefined; e.windup = 0; e.airborne = false;
    this.projectiles = this.projectiles.filter(p => p.friendly || p.owner !== e.id);
    this.emit({ kind: 'phase', text: phase === 2 ? '2단계 · 화염의 날개 — 착지할 때를 노리세요.' : '3단계 · 별의 봉인 — 빛나는 장치 근처에서 F를 누르세요.' });
  }
  private updateRootBossPhase(e: Enemy) {
    const phase = e.hp <= e.maxHp * .3 ? 3 : e.hp <= e.maxHp * .65 ? 2 : 1;
    if (phase === e.bossPhase) return;
    e.bossPhase = phase; e.phaseTime = 0; e.mode = 'recover'; e.timer = 2.5; e.telegraph = undefined; e.windup = 0; this.exposure = 0;
    this.projectiles = this.projectiles.filter(p => p.friendly || p.owner !== e.id);
    this.emit({ kind: 'phase', text: phase === 2 ? '아스테르 2단계 · 세 공명 장치 가까이에서 F! 동료들의 힘으로 뿌리의 보호막을 해제하세요.' : '아스테르 3단계 · 보호막이 무너졌습니다. 별빛 폭풍을 피하고 마지막 짐을 덜어주세요.' });
  }
  private enemyAttack(e: Enemy) { return MONSTERS[e.species].attack * (this.encounter?.attack ?? 1); }
  private updateEnemy(e: Enemy, dt: number) {
    const data = MONSTERS[e.species];
    if (e.mode === 'dead') {
      e.dead -= dt;
      if (e.dead <= 0 && !isBoss(e.species) && !this.encounter?.trial) { e.hp = e.maxHp; Object.assign(e.pos, e.spawn); e.mode = 'idle'; e.cooldown = 2; e.slow = 0; e.weakened = 0; e.timer = 0; }
      return;
    }
    e.flash = Math.max(0, e.flash - dt); e.slow = Math.max(0, e.slow - dt); e.weakened = Math.max(0, e.weakened - dt);
    if (e.burn) {
      const burn = e.burn; burn.tick += Math.min(dt, burn.ttl); burn.ttl = Math.max(0, burn.ttl - dt);
      while (burn.tick >= 1 - 1e-6 && e.hp > 0) { burn.tick -= 1; this.hit(e, burn.power); }
      if (!burn.ttl) e.burn = undefined;
      if (e.hp <= 0) return;
    }
    e.phaseTime += dt;
    if (e.species === 'dragon') { this.updateBossPhase(e); e.airborne = e.bossPhase === 2 && e.phaseTime % 12 < 5; }
    if (e.species === 'leviathan') this.updateSeaBossPhase(e);
    if (e.species === 'starwarden') this.updateRootBossPhase(e);
    const gap = distance(e.pos, this.player); const speed = data.speed * (e.slow ? isBoss(e.species) ? 0.85 : 0.6 : 1);
    e.cooldown = Math.max(0, e.cooldown - dt);
    if (e.mode === 'prepare') {
      e.timer = Math.max(0, e.timer - dt); e.windup = e.timer;
      if (e.telegraph) e.telegraph.remaining = e.timer;
      if (e.timer <= 0) this.executeEnemyAttack(e);
      return;
    }
    if (e.mode === 'attack' && e.telegraph?.kind === 'charge') {
      const old = copyPoint(e.pos); const remaining = Math.min(dt, e.timer); const d = direction(e.telegraph.yaw);
      this.move(e.pos, d.x * e.telegraph.range / 0.55 * remaining, d.z * e.telegraph.range / 0.55 * remaining, this.radius(e.species));
      if (!e.chargeHit && segmentDistance(this.player, old, e.pos) <= e.telegraph.width + 0.4 && clearLine(old, this.player, this.obstacles)) { e.chargeHit = true; this.hurt(this.enemyAttack(e), old, true, e); }
      e.timer -= dt;
      if (e.timer <= 0 || distance(old, e.pos) < 0.01) this.recoverEnemy(e);
      return;
    }
    if (e.mode === 'recover') { e.timer -= dt; if (e.timer <= 0) { e.mode = 'idle'; e.cooldown = 0.3; } return; }
    const aggro = isBoss(e.species) ? 25 : 10.5;
    if (gap < aggro) {
      this.combatTime = Math.max(this.combatTime, 1); e.mode = 'approach'; e.facing = angleTo(e.pos, this.player);
      const desired = e.species === 'squirrel' ? 8 : e.species === 'starwarden' ? 6 : e.species === 'dragon' ? (e.airborne ? 11 : 4) : e.species === 'leviathan' ? 9 : e.species === 'cow' || e.species === 'horse' ? 5 : e.species === 'tiger' || isSeaShark(e.species) || e.species === 'rabbit' ? 4.5 : 2.8;
      if (gap <= desired + 1 && e.cooldown <= 0 && clearLine(e.pos, this.player, this.obstacles)) { this.prepareEnemy(e); return; }
      let yaw = e.facing;
      if (e.species === 'squirrel' && gap < 4) yaw += Math.PI;
      else if (gap <= desired) {
        if (e.species === 'tiger' || e.species === 'horse' || e.species === 'rabbit') yaw += (e.id % 2 ? 1 : -1) * Math.PI / 2;
        else return;
      }
      const d = direction(yaw); this.move(e.pos, d.x * speed * dt, d.z * speed * dt, this.radius(e.species));
    } else {
      e.mode = 'idle'; const destination = addPoint(e.spawn, direction(this.time * 0.2 + e.phase), 1.5); const yaw = angleTo(e.pos, destination);
      if (distance(e.pos, destination) > 0.3) { e.facing = yaw; const d = direction(yaw); this.move(e.pos, d.x * dt * 0.5, d.z * dt * 0.5, this.radius(e.species)); }
    }
  }
  private prepareEnemy(e: Enemy) {
    const index = e.attackIndex++; const yaw = angleTo(e.pos, this.player);
    let shape: Telegraph['shape'] = 'cone', kind: Telegraph['kind'] = 'melee', range = 2.8, angle = 110, width = 0.8, prep = 0.8, label = '물기';
    let origin = copyPoint(e.pos);
    if (e.species === 'squirrel') { shape = 'line'; kind = 'shot'; range = 13; width = 0.23; prep = 0.85; label = '도토리 투척'; }
    if (['rabbit', 'cow', 'horse', 'tiger'].includes(e.species)) {
      shape = 'line'; kind = 'charge'; range = e.species === 'cow' ? 9 : e.species === 'horse' ? 6 : 5; width = e.species === 'cow' ? 1.1 : 0.7; prep = e.species === 'tiger' ? 0.9 : 1.0;
      label = e.species === 'tiger' ? '그림자 도약' : e.species === 'rabbit' ? '도약 돌진' : '돌진';
    }
    if (e.species === 'hippo') { if (index % 2) { shape = 'circle'; range = 4.8; prep = 1.15; label = '대지 충격파'; } else { range = 3.8; prep = 0.85; } }
    if (isSeaShark(e.species)) { shape = 'circle'; kind = 'eruption'; range = 2.4; origin = copyPoint(this.player); prep = 1.1; label = '심연의 돌출'; }
    if (e.species === 'leviathan') {
      if (index % 3 === 0) { shape = 'line'; kind = 'charge'; origin = copyPoint(e.pos); range = 11; width = 1.5; prep = 1.35; label = '흑조 돌진'; }
      else if (index % 3 === 1) { shape = 'circle'; kind = 'eruption'; range = e.bossPhase === 2 ? 4.2 : 3.2; prep = e.bossPhase === 2 ? 1.1 : 1.4; label = '검은 조수 · 잠행'; }
      else { shape = 'cone'; kind = 'melee'; origin = copyPoint(e.pos); range = 7; angle = 160; prep = 1.1; label = '수호자의 꼬리'; }
    }
    if (e.species === 'dragon') {
      if (e.airborne || (e.bossPhase >= 2 && index % 2)) { shape = 'line'; kind = 'fire'; range = 16; width = 1.9; prep = 1.3; label = '화염 숨결'; }
      else if (index % 2) { shape = 'circle'; range = 6; prep = 1.2; label = '꼬리 휩쓸기'; }
      else { range = 5.5; angle = 110; prep = 0.9; label = '용의 발톱'; }
    }
    if (e.species === 'thornbeast') { shape = 'line'; kind = 'charge'; range = 6; width = 1; prep = 1.15; label = '가시뿌리 돌진'; }
    if (e.species === 'starwarden') {
      if (index % 3 === 0) { shape = 'circle'; kind = 'melee'; origin = copyPoint(this.player); range = e.bossPhase === 3 ? 4 : 3; prep = 1.45; label = '별뿌리 개화'; }
      else if (index % 3 === 1) { shape = 'line'; kind = 'fire'; range = 18; width = e.bossPhase === 3 ? 2.3 : 1.6; prep = 1.4; label = '첫 별의 광선'; }
      else { shape = 'cone'; range = 6.5; angle = 140; prep = 1.1; label = '수호목의 가지'; }
      if (e.bossPhase === 3) prep *= .85;
    }
    if (shape === 'line') range = this.wallDistance(origin, yaw, range, kind === 'charge' ? this.radius(e.species) : width);
    prep *= DIFFICULTIES[this.state.difficulty].telegraph;
    e.mode = 'prepare'; e.timer = prep; e.windup = prep; e.facing = yaw; e.chargeHit = false;
    e.telegraph = { shape, kind, origin, yaw, range, angle, width, duration: prep, remaining: prep, label };
  }
  private executeEnemyAttack(e: Enemy) {
    const t = e.telegraph; if (!t || e.hp <= 0) return;
    e.windup = 0;
    if (t.kind === 'charge') { e.mode = 'attack'; e.timer = 0.55; return; }
    const attack = this.enemyAttack(e);
    if (t.kind === 'shot') this.shoot(t.origin, t.yaw, attack, t.range, t.width, false, 'none', attack, e.id);
    else {
      const end = addPoint(t.origin, direction(t.yaw), t.range);
      const hit = t.shape === 'circle' ? distance(t.origin, this.player) <= t.range + 0.4 : t.shape === 'cone' ? inCone(t.origin, this.player, t.yaw, t.range, t.angle, 0.4) : segmentDistance(this.player, t.origin, end) <= t.width + 0.4;
      if (hit && clearLine(t.origin, this.player, this.obstacles)) this.hurt(attack * (t.kind === 'fire' ? 1.2 : 1), t.origin, t.kind !== 'fire' && t.shape !== 'circle', e);
      this.fx(t.origin, t.kind === 'fire' ? '#f1a27a' : '#d79094', t.range, t.shape === 'line' ? 'line' : 'ring', t.yaw);
      if (t.kind === 'eruption' && e.hp > 0) Object.assign(e.pos, moveBody(t.origin, { x: 0, z: 0 }, this.radius(e.species), this.obstacles));
    }
    if (e.hp > 0) this.recoverEnemy(e);
  }
  private recoverEnemy(e: Enemy) {
    if (e.hp <= 0) return;
    const chained = this.state.difficulty === 'veteran' && ['horse', 'tiger', 'dragon'].includes(e.species) && e.attackIndex % 2 === 1;
    e.mode = 'recover'; e.timer = (e.species === 'starwarden' ? 2.2 : e.species === 'leviathan' ? 2.8 : chained ? 0.35 : e.species === 'dragon' ? 1.65 : 1.5) * DIFFICULTIES[this.state.difficulty].recovery;
    e.telegraph = undefined; e.windup = 0; e.cooldown = 0;
  }
}
