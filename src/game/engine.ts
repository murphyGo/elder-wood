import * as T from 'three';
import { character, animal, weaponModel, material } from './models';
import { createEnvironment, disposeEnvironment, terrainHeight, random, type Environment, type Landmark } from './world';
import { MONSTERS, WEAPONS, ZONES, SKILLS, SAVE_KEY, parseSave, maxHp, maxMp, attackPower, defense, recordKill, canTravel, useSkill, usePotion, questReady, type SaveState, type Species, type Zone, type Skill, type Weapon } from './state';

export interface Enemy { id: number; species: Species; model: T.Group; hp: number; origin: T.Vector3; cooldown: number; windup: number; dead: number; phase: number; flash: number; ring: T.Mesh; }
export type GameEvent = { type: 'toast' | 'level' | 'kill' | 'death' | 'zone' | 'interact' | 'quest' | 'saved'; text?: string; landmark?: Landmark; good?: boolean };
export interface Hooks { update: () => void; event: (event: GameEvent) => void; float: (text: string, position: T.Vector3, color: string) => void }

class Sound {
  context?: AudioContext; muted = false;
  play(kind: 'hit' | 'swing' | 'level' | 'heal' | 'click' | 'hurt') {
    if (this.muted) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
      const frequencies = { hit: 155, swing: 300, level: 523.25, heal: 659.25, click: 440, hurt: 85 };
      const notes = kind === 'level' ? [1, 1.25, 1.5, 2] : kind === 'heal' ? [1, 1.25, 1.5] : [1];
      notes.forEach((n, i) => {
        const oscillator = this.context!.createOscillator(); const gain = this.context!.createGain(); const start = this.context!.currentTime + i * 0.1;
        oscillator.type = kind === 'hit' || kind === 'hurt' ? 'triangle' : 'sine'; oscillator.frequency.setValueAtTime(frequencies[kind] * n, start);
        oscillator.frequency.exponentialRampToValueAtTime(frequencies[kind] * n * (kind === 'swing' ? 0.3 : 0.92), start + 0.16);
        gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.045, start + 0.01); gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
        oscillator.connect(gain); gain.connect(this.context!.destination); oscillator.start(start); oscillator.stop(start + 0.25);
      });
    } catch { /* Audio is optional; gameplay does not depend on audio permission. */ }
  }
}

export class Game {
  state: SaveState;
  scene = new T.Scene(); camera = new T.PerspectiveCamera(49, 1, 0.15, 230); renderer: T.WebGLRenderer;
  environment!: Environment; hero = character(); enemies: Enemy[] = []; npcs: T.Group[] = [];
  keys = new Set<string>(); sound = new Sound(); paused = false; running = true;
  target?: Enemy; nearby?: Landmark; cooldowns = { attack: 0, q: 0, e: 0, r: 0, potion: 0, dodge: 0 };
  yaw = 0.22; elevation = 0.43; distance = 16; time = 0; attackAnimation = 0; dodgeTime = 0; jumpVelocity = 0; jumpHeight = 0;
  saveAvailable = true; moving = false; killNotice = false;
  private hooks: Hooks; private last = 0; private uiTimer = 0; private saveTimer = 0; private combatTimer = 0;
  private sunlight = new T.DirectionalLight(0xffe9b5, 3.1); private ambient = new T.HemisphereLight(0xc3e0d6, 0x666345, 2.2);
  private projectiles: { mesh: T.Mesh; target: Enemy; damage: number; ttl: number }[] = [];
  private effects: { mesh: T.Mesh; ttl: number; duration: number; expand: number }[] = [];
  private pointer = new T.Vector2(); private raycaster = new T.Raycaster(); private heldAttack = false; private dragging = false; private lastPointer = { x: 0, y: 0 };
  private armorAppearance = -1;
  private disposers: (() => void)[] = [];
  constructor(container: HTMLElement, hooks: Hooks) {
    this.hooks = hooks;
    try { this.state = parseSave(localStorage.getItem(SAVE_KEY)); } catch { this.state = parseSave(null); this.saveAvailable = false; }
    this.sound.muted = this.state.muted;
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7)); this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace; this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.18;
    this.renderer.domElement.id = 'game-canvas'; this.renderer.domElement.setAttribute('aria-label', '엘더우드 3D 게임 화면. WASD 이동, J 공격, F 대화'); this.renderer.domElement.tabIndex = 0;
    container.append(this.renderer.domElement);
    this.camera.aspect = container.clientWidth / container.clientHeight; this.camera.updateProjectionMatrix();
    this.sunlight.position.set(-18, 32, 17); this.sunlight.castShadow = true; this.sunlight.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sunlight.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 0.5, far: 100 }); this.sunlight.shadow.normalBias = 0.06; this.sunlight.shadow.bias = -0.0001;
    this.scene.add(this.sunlight, this.sunlight.target, this.ambient, this.hero);
    this.setWeapon(this.state.weapon, false); this.loadZone(this.state.zone);
    const resize = () => { this.camera.aspect = container.clientWidth / container.clientHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(container.clientWidth, container.clientHeight); };
    this.listen(window, 'resize', resize);
    this.listen(window, 'blur', () => this.clearInput());
    this.listen(document, 'visibilitychange', () => { if (document.hidden) { this.clearInput(); this.save(); } this.last = performance.now(); });
    this.listen(window, 'pagehide', () => this.save());
    this.listen(document, 'keydown', e => this.keydown(e as KeyboardEvent));
    this.listen(document, 'keyup', e => this.keys.delete((e as KeyboardEvent).code));
    this.listen(this.renderer.domElement, 'contextmenu', e => e.preventDefault());
    this.listen(this.renderer.domElement, 'pointerdown', e => {
      const event = e as PointerEvent; if (this.paused) return; this.renderer.domElement.focus();
      this.lastPointer = { x: event.clientX, y: event.clientY };
      if (event.button === 2) { this.dragging = true; this.renderer.domElement.setPointerCapture(event.pointerId); }
      if (event.button === 0) { this.selectTarget(event); this.heldAttack = true; this.attack(); }
    });
    this.listen(window, 'pointerup', () => { this.heldAttack = false; this.dragging = false; });
    this.listen(window, 'pointermove', e => { const event = e as PointerEvent; if (this.dragging && !this.paused) { this.yaw -= (event.clientX - this.lastPointer.x) * 0.005; this.elevation = T.MathUtils.clamp(this.elevation + (event.clientY - this.lastPointer.y) * 0.003, 0.18, 0.9); } this.lastPointer = { x: event.clientX, y: event.clientY }; });
    this.listen(this.renderer.domElement, 'wheel', e => { const event = e as WheelEvent; event.preventDefault(); this.distance = T.MathUtils.clamp(this.distance + event.deltaY * 0.012, 7, 24); });
    this.last = performance.now(); this.renderer.setAnimationLoop(now => this.frame(now));
  }
  private listen(target: EventTarget, event: string, callback: EventListener) { target.addEventListener(event, callback, { passive: false }); this.disposers.push(() => target.removeEventListener(event, callback)); }
  clearInput() { this.keys.clear(); this.heldAttack = false; this.dragging = false; }
  setPaused(value: boolean) { this.paused = value; this.clearInput(); }
  toast(text: string, good = false) { this.hooks.event({ type: 'toast', text, good }); }
  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.state)); this.saveAvailable = true; }
    catch { if (this.saveAvailable) this.toast('저장 공간을 사용할 수 없습니다. 현재 게임은 계속 플레이할 수 있습니다.'); this.saveAvailable = false; }
    this.hooks.event({ type: 'saved' });
  }
  setWeapon(weapon: Weapon, notify = true) {
    this.state.weapon = weapon; const hand = this.hero.userData.hand as T.Group;
    for (const child of [...hand.children]) { child.traverse(o => { if (o instanceof T.Mesh) o.geometry.dispose(); }); hand.remove(child); }
    hand.add(weaponModel(weapon)); if (notify) { this.toast(`${WEAPONS[weapon].name} 장착`, true); this.sound.play('click'); this.save(); this.hooks.update(); }
  }
  private removeModel(model: T.Object3D) { model.traverse(o => { if (o instanceof T.Mesh) { o.geometry.dispose(); if (o.material instanceof T.MeshBasicMaterial) o.material.dispose(); } }); model.removeFromParent(); }
  loadZone(zone: Zone) {
    if (this.environment) disposeEnvironment(this.environment);
    this.enemies.forEach(e => this.removeModel(e.model)); this.npcs.forEach(n => this.removeModel(n));
    this.projectiles.forEach(p => this.removeModel(p.mesh)); this.effects.forEach(e => this.removeModel(e.mesh)); this.projectiles = []; this.effects = []; this.enemies = []; this.npcs = [];
    this.environment = createEnvironment(zone); this.scene.add(this.environment.group);
    this.state.zone = zone; this.target = undefined; this.nearby = undefined; this.hero.position.set(1.4, 0, 8); this.hero.rotation.y = Math.PI;
    this.jumpHeight = 0; this.jumpVelocity = 0; this.dodgeTime = 0; this.combatTimer = 0; this.clearInput();
    const dark = this.environment.dark;
    this.scene.background = new T.Color(dark ? (zone === 'sanctum' ? 0x555263 : 0x6b9299) : 0xc4d7c5);
    this.scene.fog = new T.Fog(dark ? (zone === 'sanctum' ? 0x555263 : 0x6b9299) : 0xc4d7c5, dark ? 28 : 40, dark ? 91 : 118);
    this.ambient.intensity = dark ? 1.65 : 2.2; this.ambient.color.set(dark ? 0xb1c9e3 : 0xc3e0d6); this.sunlight.intensity = dark ? 1.8 : 3.1;
    this.sunlight.color.set(dark ? 0xc5c0ec : 0xffe9b5);
    const rng = random(15);
    const species = ZONES[zone].creatures;
    const count = zone === 'sanctum' ? (this.state.chapter > 4 ? 0 : 1) : zone === 'village' ? 0 : 7;
    for (let i = 0; i < count; i++) {
      const type = species[i % species.length]; const data = MONSTERS[type]; const model = animal(type); model.scale.setScalar(data.size);
      const x = count === 1 ? 0 : (i % 2 ? -1 : 1) * (3.5 + rng() * 8); const z = count === 1 ? -7 : 2 - Math.floor(i / 2) * 6;
      model.position.set(x, terrainHeight(x, z), z); this.scene.add(model);
      const ring = new T.Mesh(new T.RingGeometry(0.7, 0.78, 32), new T.MeshBasicMaterial({ color: 0xcbaa72, transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.visible = false; model.add(ring);
      this.enemies.push({ id: i, species: type, model, hp: data.hp, origin: model.position.clone(), cooldown: 1 + rng(), windup: 0, dead: 0, phase: rng() * 6.28, flash: 0, ring });
    }
    for (const landmark of this.environment.landmarks) if (landmark.kind !== 'portal') {
      const npc = character(landmark.kind === 'elder', landmark.kind === 'elder' ? 0x6c7b5b : 0x9b7945);
      npc.position.set(landmark.x, terrainHeight(landmark.x, landmark.z), landmark.z); npc.rotation.y = 0.5; this.npcs.push(npc); this.scene.add(npc);
    }
    this.hero.position.y = terrainHeight(this.hero.position.x, this.hero.position.z);
    this.updateCamera(1); this.hooks.event({ type: 'zone' });
  }
  travel(zone: Zone) {
    if (!canTravel(this.state, zone)) { this.toast(`${ZONES[zone].name}: 메인 이야기와 레벨 ${ZONES[zone].level} 조건을 달성하세요.`); return false; }
    this.loadZone(zone); this.save(); this.hooks.update(); return true;
  }
  private keydown(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.ctrlKey || event.metaKey || event.altKey) return;
    if (this.paused || document.hidden) return;
    const code = event.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code)) event.preventDefault();
    this.keys.add(code); if (event.repeat) return;
    if (code === 'KeyJ') this.attack();
    if (code === 'KeyQ') this.skill('q'); if (code === 'KeyE') this.skill('e'); if (code === 'KeyR') this.skill('r');
    if (code === 'KeyF') this.interact(); if (code === 'KeyH') this.potion();
    if (code === 'Digit1') this.setWeapon('sword'); if (code === 'Digit2') this.setWeapon('spear'); if (code === 'Digit3') this.setWeapon('bow');
    if (code === 'ShiftLeft' || code === 'ShiftRight') this.dodge();
    if (code === 'Space' && this.jumpHeight === 0) this.jumpVelocity = 5.2;
    if (code === 'Tab') { const live = this.enemies.filter(e => e.hp > 0); if (live.length) this.target = live[(live.indexOf(this.target!) + 1) % live.length]; }
  }
  private selectTarget(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect(); this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.enemies.filter(e => e.hp > 0).map(e => e.model), true);
    if (hits.length) this.target = this.enemies.find(e => { let o: T.Object3D | null = hits[0].object; while (o) { if (o === e.model) return true; o = o.parent; } return false; });
  }
  nearest(range: number) { return this.enemies.filter(e => e.hp > 0 && e.model.position.distanceTo(this.hero.position) < range).sort((a, b) => a.model.position.distanceToSquared(this.hero.position) - b.model.position.distanceToSquared(this.hero.position))[0]; }
  attack() {
    if (this.paused || this.cooldowns.attack > 0 || this.dodgeTime > 0) return;
    const weapon = WEAPONS[this.state.weapon]; const target = this.target?.hp && this.target.model.position.distanceTo(this.hero.position) < weapon.range + MONSTERS[this.target.species].size * 0.4 ? this.target : this.nearest(weapon.range);
    this.cooldowns.attack = weapon.delay; this.attackAnimation = 0.4; this.sound.play('swing');
    if (target) {
      this.target = target; const delta = target.model.position.clone().sub(this.hero.position); this.hero.rotation.y = Math.atan2(delta.x, delta.z);
      const damage = attackPower(this.state);
      if (this.state.weapon === 'bow') {
        const arrow = new T.Mesh(new T.ConeGeometry(0.08, 0.85, 4), new T.MeshBasicMaterial({ color: 0xe4d9a7 })); arrow.position.copy(this.hero.position).add(new T.Vector3(0, 1.4, 0)); this.scene.add(arrow); this.projectiles.push({ mesh: arrow, target, damage, ttl: 2 });
      } else { this.damageEnemy(target, damage); this.effect(this.hero.position, 0xf5db9e, 0.32, 2.2, true); }
    } else if (this.state.weapon !== 'bow') this.effect(this.hero.position, 0xd8cfab, 0.25, 1.5, true);
  }
  skill(skill: Skill) {
    if (this.paused) return;
    const error = useSkill(this.state, skill, this.cooldowns[skill]); if (error) { this.toast(error); return; }
    this.cooldowns[skill] = SKILLS[skill].cooldown;
    if (skill === 'e') { this.effect(this.hero.position, 0xa5e9ae, 1.1, 2.8); this.sound.play('heal'); this.hooks.float('체력 회복', this.hero.position.clone().add(new T.Vector3(0, 2.8, 0)), '#bcf2b1'); }
    else {
      const range = skill === 'q' ? 5 : 12; const multiplier = skill === 'q' ? 2.2 : 3.8;
      for (const enemy of this.enemies) if (enemy.hp > 0 && enemy.model.position.distanceTo(this.hero.position) < range) this.damageEnemy(enemy, Math.round(attackPower(this.state) * multiplier));
      this.effect(this.hero.position, skill === 'q' ? 0xf3deac : 0xbeb1ff, 0.8, range); this.attackAnimation = 0.6;
      if (skill === 'r') for (let i = 0; i < 8; i++) { const p = this.hero.position.clone().add(new T.Vector3(Math.sin(i * 2.4) * 6, 0, Math.cos(i * 2.4) * 6)); this.effect(p, 0xb8c0ff, 1, 2); }
      this.sound.play('level');
    }
    this.hooks.update();
  }
  potion() {
    if (this.paused || this.cooldowns.potion > 0) return;
    if (!usePotion(this.state)) { this.toast(this.state.potions ? '이미 체력이 가득 찼습니다.' : '물약이 없습니다. 마을 상인에게 구입하세요.'); return; }
    this.cooldowns.potion = 4; this.sound.play('heal'); this.effect(this.hero.position, 0xdb8c91, 0.8, 2); this.toast('회복 물약을 사용했습니다.', true); this.save(); this.hooks.update();
  }
  dodge() { if (!this.paused && this.cooldowns.dodge <= 0) { this.dodgeTime = 0.35; this.cooldowns.dodge = 1.8; this.effect(this.hero.position, 0xcde0ca, 0.3, 1); } }
  interact() {
    if (this.paused) return;
    this.nearby = this.environment.landmarks.find(l => Math.hypot(l.x - this.hero.position.x, l.z - this.hero.position.z) < 4.4);
    if (!this.nearby) { this.toast('NPC나 차원문에 가까이 다가가세요.'); return; }
    if (this.nearby.kind === 'portal') this.travel(this.nearby.destination!);
    else { this.hooks.event({ type: 'interact', landmark: this.nearby }); this.sound.play('click'); }
  }
  private damageEnemy(enemy: Enemy, amount: number) {
    if (enemy.hp <= 0) return;
    enemy.hp = Math.max(0, enemy.hp - amount); enemy.flash = 0.17; this.combatTimer = 5; this.sound.play('hit');
    this.hooks.float(String(amount), enemy.model.position.clone().add(new T.Vector3(0, 2 * MONSTERS[enemy.species].size, 0)), '#ffedbe');
    if (enemy.hp === 0) {
      const levels = recordKill(this.state, enemy.species); enemy.dead = 16; enemy.windup = 0;
      this.hooks.event({ type: 'kill', text: `${MONSTERS[enemy.species].name} 해방 · +${MONSTERS[enemy.species].xp} EXP · +${MONSTERS[enemy.species].gold} G` });
      this.effect(enemy.model.position, 0xe6d398, 0.8, 1.8);
      if (levels) { this.sound.play('level'); this.hooks.event({ type: 'level', text: `레벨 ${this.state.level}` }); this.effect(this.hero.position, 0xf5dfa1, 1.3, 3); }
      if (this.target === enemy) this.target = undefined;
      if (questReady(this.state) && !this.killNotice) { this.killNotice = true; this.hooks.event({ type: 'quest' }); }
      this.save(); this.hooks.update();
    }
  }
  private hurt(amount: number) {
    if (this.dodgeTime > 0 || this.state.hp <= 0) return;
    const damage = Math.max(1, Math.round(amount - defense(this.state))); this.state.hp = Math.max(0, this.state.hp - damage); this.combatTimer = 6;
    this.hooks.float(`−${damage}`, this.hero.position.clone().add(new T.Vector3(0, 2.5, 0)), '#ffada0'); this.sound.play('hurt');
    if (this.state.hp <= 0) { this.setPaused(true); this.hooks.event({ type: 'death' }); }
    this.hooks.update();
  }
  revive() { this.state.hp = maxHp(this.state); this.state.mp = maxMp(this.state); this.loadZone('village'); this.setPaused(false); this.save(); this.hooks.update(); }
  private effect(position: T.Vector3, color: number, duration: number, expand: number, slash = false) {
    const geometry = slash ? new T.TorusGeometry(1, 0.045, 4, 24, Math.PI * 1.3) : new T.RingGeometry(0.85, 1, 48);
    const m = new T.Mesh(geometry, new T.MeshBasicMaterial({ color, side: T.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false, blending: T.AdditiveBlending }));
    m.position.copy(position); m.position.y += slash ? 1 : 0.12; m.rotation.set(-Math.PI / 2, slash ? 0.3 : 0, this.hero.rotation.y); this.scene.add(m); this.effects.push({ mesh: m, ttl: duration, duration, expand });
  }
  private movePosition(object: T.Object3D, dx: number, dz: number, radius = 0.4) {
    const p = object.position; let x = T.MathUtils.clamp(p.x + dx, -31, 31); let z = T.MathUtils.clamp(p.z + dz, -30, 30);
    for (const obstacle of this.environment.obstacles) {
      const distance = Math.hypot(x - obstacle.x, z - obstacle.z); const min = radius + obstacle.radius;
      if (distance < min) { const angle = distance > 0.001 ? Math.atan2(x - obstacle.x, z - obstacle.z) : 0; x = obstacle.x + Math.sin(angle) * min; z = obstacle.z + Math.cos(angle) * min; }
    }
    // The stream can only be crossed on the village bridge.
    const bank = -16.7 + Math.sin(z * 0.06) * 2;
    if (x < bank && p.x >= bank && !(this.state.zone === 'village' && z > 3.3 && z < 6.7)) x = bank;
    p.x = T.MathUtils.clamp(x, -31, 31); p.z = T.MathUtils.clamp(z, -30, 30);
  }
  private updateCamera(dt: number) {
    const height = Math.sin(this.elevation) * this.distance; const horizontal = Math.cos(this.elevation) * this.distance;
    const destination = this.hero.position.clone().add(new T.Vector3(Math.sin(this.yaw) * horizontal, height + 1.6, Math.cos(this.yaw) * horizontal));
    this.camera.position.lerp(destination, Math.min(1, dt * 7)); this.camera.lookAt(this.hero.position.x, this.hero.position.y + 1.35, this.hero.position.z);
    this.sunlight.position.set(this.hero.position.x - 18, 32, this.hero.position.z + 17); this.sunlight.target.position.copy(this.hero.position);
  }
  private frame(now: number) {
    if (!this.running) return;
    const dt = Math.min((now - this.last) / 1000, 0.05); this.last = now;
    if (this.armorAppearance !== this.state.armor) { this.armorAppearance = this.state.armor; this.hero.userData.chest.material = material([0x617166, 0x916b46, 0xa3afb0, 0xcac09a][this.state.armor]); }
    if (!this.paused && !document.hidden) this.update(dt);
    this.updateCamera(dt); this.renderer.render(this.scene, this.camera);
    this.uiTimer += dt; if (this.uiTimer >= 0.1) { this.uiTimer = 0; this.hooks.update(); }
  }
  private update(dt: number) {
    this.time += dt; this.state.playTime += dt;
    for (const key of Object.keys(this.cooldowns) as (keyof typeof this.cooldowns)[]) this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
    this.combatTimer = Math.max(0, this.combatTimer - dt); this.dodgeTime = Math.max(0, this.dodgeTime - dt); this.attackAnimation = Math.max(0, this.attackAnimation - dt);
    let dx = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    let dz = Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) - Number(this.keys.has('KeyW') || this.keys.has('ArrowUp'));
    this.moving = dx !== 0 || dz !== 0;
    if (this.moving) {
      const length = Math.hypot(dx, dz); dx /= length; dz /= length;
      const x = dx * Math.cos(this.yaw) + dz * Math.sin(this.yaw); const z = -dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw);
      const speed = this.dodgeTime > 0 ? 17 : 5.3; this.movePosition(this.hero, x * speed * dt, z * speed * dt);
      const targetYaw = Math.atan2(x, z); const diff = Math.atan2(Math.sin(targetYaw - this.hero.rotation.y), Math.cos(targetYaw - this.hero.rotation.y)); this.hero.rotation.y += diff * Math.min(1, dt * 16);
    } else if (this.dodgeTime > 0) this.movePosition(this.hero, Math.sin(this.hero.rotation.y) * 17 * dt, Math.cos(this.hero.rotation.y) * 17 * dt);
    if (this.jumpVelocity !== 0 || this.jumpHeight > 0) { this.jumpHeight = Math.max(0, this.jumpHeight + this.jumpVelocity * dt); this.jumpVelocity -= dt * 14; if (this.jumpHeight === 0) this.jumpVelocity = 0; }
    this.hero.position.y = terrainHeight(this.hero.position.x, this.hero.position.z) + this.jumpHeight;
    const gait = this.moving ? Math.sin(this.time * 12) * 0.65 : Math.sin(this.time * 2) * 0.025;
    const { legs, arms, body, cape } = this.hero.userData;
    legs[0].rotation.x = gait; legs[1].rotation.x = -gait; arms[1].rotation.x = -gait * 0.65;
    arms[0].rotation.x = this.attackAnimation > 0 ? -1.5 + Math.sin((0.4 - this.attackAnimation) * 11) * 1.4 : gait * 0.4;
    body.rotation.x = this.dodgeTime > 0 ? -0.7 : 0; body.position.y = this.moving ? Math.abs(Math.sin(this.time * 12)) * 0.045 : Math.sin(this.time * 2) * 0.025;
    cape.rotation.x = Math.sin(this.time * 4) * 0.07 + (this.moving ? 0.2 : 0);
    if (this.heldAttack || this.keys.has('KeyJ')) this.attack();
    this.nearby = this.environment.landmarks.find(l => Math.hypot(l.x - this.hero.position.x, l.z - this.hero.position.z) < 4.4);
    for (const enemy of this.enemies) this.updateEnemy(enemy, dt);
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]; p.ttl -= dt;
      const destination = p.target.model.position.clone().add(new T.Vector3(0, MONSTERS[p.target.species].size, 0)); const delta = destination.sub(p.mesh.position);
      if (delta.length() < 1 || p.ttl <= 0 || p.target.hp <= 0) { if (p.target.hp > 0 && p.ttl > 0) this.damageEnemy(p.target, p.damage); this.removeModel(p.mesh); this.projectiles.splice(i, 1); }
      else { const step = Math.min(27 * dt, delta.length()); p.mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.clone().normalize()); p.mesh.position.addScaledVector(delta.normalize(), step); }
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]; e.ttl -= dt; e.mesh.scale.setScalar(0.35 + (1 - e.ttl / e.duration) * e.expand); (e.mesh.material as T.MeshBasicMaterial).opacity = Math.max(0, e.ttl / e.duration * 0.8);
      if (e.ttl <= 0) { this.removeModel(e.mesh); this.effects.splice(i, 1); }
    }
    const particles = this.environment.particles.geometry.attributes.position;
    for (let i = 0; i < particles.count; i++) { particles.setY(i, (particles.getY(i) + dt * 0.13) % 11); particles.setX(i, particles.getX(i) + Math.sin(this.time * 0.4 + i) * dt * 0.04); } particles.needsUpdate = true;
    this.environment.portal.children[0].rotation.z = Math.sin(this.time * 0.4) * 0.1;
    (this.environment.portal.children[1] as T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>).material.opacity = 0.15 + Math.sin(this.time * 2) * 0.05;
    this.state.mp = Math.min(maxMp(this.state), this.state.mp + dt * (this.combatTimer ? 1.5 : 4));
    if (this.combatTimer === 0) this.state.hp = Math.min(maxHp(this.state), this.state.hp + dt * (this.state.zone === 'village' ? 12 : 2.5));
    this.saveTimer += dt; if (this.saveTimer > 8) { this.saveTimer = 0; this.save(); }
  }
  private updateEnemy(enemy: Enemy, dt: number) {
    const data = MONSTERS[enemy.species];
    if (enemy.hp <= 0) {
      enemy.dead -= dt; enemy.model.scale.multiplyScalar(Math.pow(0.01, dt)); enemy.ring.visible = false;
      if (enemy.dead < 15) enemy.model.visible = false;
      if (enemy.dead <= 0 && enemy.species !== 'dragon') { enemy.hp = data.hp; enemy.model.visible = true; enemy.model.scale.setScalar(data.size); enemy.model.position.copy(enemy.origin); enemy.cooldown = 2; }
      return;
    }
    enemy.flash = Math.max(0, enemy.flash - dt);
    enemy.model.scale.setScalar(data.size * (enemy.flash > 0 ? 1.06 : 1));
    const delta = this.hero.position.clone().sub(enemy.model.position); delta.y = 0; const distance = delta.length();
    enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    enemy.ring.visible = this.target === enemy || enemy.windup > 0;
    (enemy.ring.material as T.MeshBasicMaterial).color.set(enemy.windup > 0 ? 0xf58965 : 0xe6ce94);
    const hitRadius = enemy.species === 'dragon' ? 7 : 2.2 * data.size + 0.7;
    enemy.ring.scale.setScalar(enemy.windup > 0 ? hitRadius / (0.78 * data.size) : 1);
    let walking = false;
    if (enemy.windup > 0) {
      enemy.windup -= dt; enemy.model.userData.body.rotation.x = Math.sin(enemy.windup * 8) * 0.12;
      if (enemy.windup <= 0) { if (distance < (enemy.species === 'dragon' ? 7 : 2.2 * data.size + 0.7)) this.hurt(data.attack); enemy.cooldown = enemy.species === 'dragon' ? 2.2 : 1.5; enemy.model.userData.body.rotation.x = 0; }
    } else if (distance < (enemy.species === 'dragon' ? 19 : 9) && this.state.hp > 0) {
      this.combatTimer = Math.max(this.combatTimer, 1); enemy.model.rotation.y = Math.atan2(delta.x, delta.z);
      if (distance > (enemy.species === 'dragon' ? 4.8 : data.size * 1.25 + 0.6)) { const v = delta.normalize().multiplyScalar(data.speed * dt); this.movePosition(enemy.model, v.x, v.z, data.size * 0.45); walking = true; }
      else if (enemy.cooldown <= 0) { enemy.windup = enemy.species === 'dragon' ? 1.05 : 0.65; }
    } else {
      const destination = enemy.origin.clone().add(new T.Vector3(Math.sin(this.time * 0.17 + enemy.phase) * 2, 0, Math.cos(this.time * 0.15 + enemy.phase) * 2));
      const v = destination.sub(enemy.model.position); v.y = 0;
      if (v.length() > 0.2) { enemy.model.rotation.y = Math.atan2(v.x, v.z); v.normalize().multiplyScalar(dt * 0.65); this.movePosition(enemy.model, v.x, v.z, data.size * 0.45); walking = true; }
    }
    enemy.model.position.y = terrainHeight(enemy.model.position.x, enemy.model.position.z) + (enemy.species === 'shark' ? 0.6 + Math.sin(this.time * 2 + enemy.phase) * 0.13 : 0);
    const legs = enemy.model.userData.legs as T.Mesh[];
    legs.forEach((leg, i) => { leg.rotation.x = walking ? Math.sin(this.time * 9 + (i % 2) * Math.PI) * 0.5 : 0; });
    (enemy.model.userData.wings as T.Group[]).forEach((wing, i) => wing.rotation.y = Math.sin(this.time * 2) * 0.27 * (i ? -1 : 1));
    if (enemy.species === 'rabbit' && walking) enemy.model.userData.body.position.y = Math.abs(Math.sin(this.time * 7)) * 0.14;
  }
  dispose() { this.save(); this.running = false; this.renderer.setAnimationLoop(null); this.disposers.forEach(fn => fn()); disposeEnvironment(this.environment); this.enemies.forEach(e => this.removeModel(e.model)); this.npcs.forEach(n => this.removeModel(n)); this.removeModel(this.hero); this.projectiles.forEach(p => this.removeModel(p.mesh)); this.effects.forEach(e => this.removeModel(e.mesh)); this.renderer.dispose(); void this.sound.context?.close(); }
}
