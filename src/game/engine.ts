import * as T from 'three';
import { character, animal, weaponModel, material } from './models';
import { createEnvironment, disposeEnvironment, terrainHeight, type Environment, type Landmark } from './world';
import { MONSTERS, ZONES, equippedItem, equipItem, maxHp, maxMp, canTravel, type SaveState, type Zone, type Skill, type Weapon, type ItemId } from './state';
import { Combat, SEALS, type Enemy as CombatEnemy, type Telegraph } from './combat';
import { SaveRepository, type LoadResult } from './persistence';
import { type Point } from './geometry';

export interface Enemy extends CombatEnemy { model: T.Group; ring: T.Mesh }
export type GameEvent = { type: 'toast' | 'level' | 'kill' | 'death' | 'zone' | 'interact' | 'quest' | 'saved' | 'phase' | 'practice'; text?: string; landmark?: Landmark; good?: boolean };
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
  battle!: Combat; nearby?: Landmark; repository: SaveRepository; loadResult: LoadResult;
  get target() { return this.enemies.find(e => e.id === this.battle?.targetId); }
  set target(e: Enemy | undefined) { if (this.battle) this.battle.targetId = e?.id; }
  get cooldowns() { return this.state.cooldowns; }
  get killNotice() { return this.battle.questNotified; }
  set killNotice(value: boolean) { this.battle.questNotified = value; }
  yaw = 0.22; elevation = 0.43; distance = 16; time = 0; attackAnimation = 0; dodgeTime = 0; jumpVelocity = 0; jumpHeight = 0;
  saveAvailable = true; moving = false;
  private hooks: Hooks; private last = 0; private uiTimer = 0; private saveTimer = 0;
  private sunlight = new T.DirectionalLight(0xffe9b5, 3.1); private ambient = new T.HemisphereLight(0xc3e0d6, 0x666345, 2.2);
  private projectileViews = new Map<number, T.Mesh>();
  private telegraphViews = new Map<number, { source: Telegraph; mesh: T.Mesh }>();
  private seals: T.Group[] = [];
  private cameraOccluders: T.Mesh[] = [];
  private shieldView = new T.Mesh(new T.SphereGeometry(1.2, 16, 12), new T.MeshBasicMaterial({ color: 0xc8e5a8, transparent: true, opacity: 0.17, wireframe: true }));
  private effects: { mesh: T.Mesh; ttl: number; duration: number; expand: number }[] = [];
  private pointer = new T.Vector2(); private raycaster = new T.Raycaster(); private heldAttack = false; private dragging = false; private lastPointer = { x: 0, y: 0 };
  private armorAppearance = -1;
  private disposers: (() => void)[] = [];
  constructor(container: HTMLElement, hooks: Hooks) {
    this.hooks = hooks;
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Restricted browser storage. */ }
    this.repository = new SaveRepository(storage); this.loadResult = this.repository.load(); this.state = this.loadResult.state;
    this.saveAvailable = this.loadResult.status !== 'unavailable' && this.loadResult.status !== 'blocked';
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
    this.scene.add(this.sunlight, this.sunlight.target, this.ambient, this.hero, this.shieldView);
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
    const available = this.repository.save(this.state);
    if (!available && this.saveAvailable) this.toast('저장하지 못했습니다. 저장 공간을 확인해주세요. 현재 게임은 계속할 수 있습니다.');
    this.saveAvailable = available; this.hooks.event({ type: 'saved' }); return available;
  }
  restore(state: SaveState) {
    if (!this.repository.recover(state)) { this.saveAvailable = false; this.toast('복구 내용을 저장하지 못했습니다. 원본은 유지됩니다. 임시 플레이를 선택할 수 있습니다.'); return false; }
    this.loadResult.status = 'loaded'; this.state = state; this.sound.muted = state.muted; this.setWeapon(state.weapon, false); this.loadZone(state.zone); this.save(); return true;
  }
  setWeapon(weapon: Weapon, notify = true) {
    this.battle?.cancelAction(); this.state.weapon = weapon; const hand = this.hero.userData.hand as T.Group;
    for (const child of [...hand.children]) this.removeModel(child);
    const model = weaponModel(weapon); const item = equippedItem(this.state);
    if (item.effect !== 'none') {
      const gem = new T.Mesh(new T.OctahedronGeometry(0.13), new T.MeshBasicMaterial({ color: item.color }));
      gem.position.y = 0.25; model.add(gem);
    }
    hand.add(model);
    if (notify) { this.toast(`${item.name} 장착`, true); this.sound.play('click'); this.save(); this.hooks.update(); }
  }
  equip(id: ItemId) { if (!equipItem(this.state, id)) return false; this.setWeapon(this.state.weapon); return true; }
  private removeModel(model: T.Object3D) { model.traverse(o => { if (o instanceof T.Mesh) { o.geometry.dispose(); if (o.material instanceof T.MeshBasicMaterial) o.material.dispose(); } }); model.removeFromParent(); }
  loadZone(zone: Zone) {
    if (this.environment) disposeEnvironment(this.environment);
    this.enemies.forEach(e => this.removeModel(e.model)); this.npcs.forEach(n => this.removeModel(n));
    this.projectileViews.forEach(m => this.removeModel(m)); this.projectileViews.clear();
    this.telegraphViews.forEach(v => this.removeModel(v.mesh)); this.telegraphViews.clear();
    this.effects.forEach(e => this.removeModel(e.mesh)); this.effects = []; this.enemies = []; this.npcs = []; this.seals.forEach(m => this.removeModel(m)); this.seals = [];
    this.environment = createEnvironment(zone); this.scene.add(this.environment.group);
    this.cameraOccluders = []; this.environment.group.traverse(o => { if (o instanceof T.Mesh && !Array.isArray(o.material) && !o.material.transparent) this.cameraOccluders.push(o); });
    this.environment.group.updateMatrixWorld(true);
    this.state.zone = zone; this.nearby = undefined; this.hero.position.set(1.4, 0, 8); this.hero.rotation.y = Math.PI;
    this.battle = new Combat(this.state, zone, this.environment.obstacles, zone === 'sanctum' && this.state.chapter >= 5);
    this.battle.player = this.hero.position;
    this.jumpHeight = 0; this.jumpVelocity = 0; this.dodgeTime = 0; this.clearInput();
    const dark = this.environment.dark;
    this.scene.background = new T.Color(dark ? (zone === 'sanctum' ? 0x555263 : 0x6b9299) : 0xc4d7c5);
    this.scene.fog = new T.Fog(dark ? (zone === 'sanctum' ? 0x555263 : 0x6b9299) : 0xc4d7c5, dark ? 28 : 40, dark ? 91 : 118);
    this.ambient.intensity = dark ? 1.65 : 2.2; this.ambient.color.set(dark ? 0xb1c9e3 : 0xc3e0d6); this.sunlight.intensity = dark ? 1.8 : 3.1;
    this.sunlight.color.set(dark ? 0xc5c0ec : 0xffe9b5);
    this.enemies = this.battle.enemies.map(e => {
      const data = MONSTERS[e.species]; const model = animal(e.species); model.scale.setScalar(data.size);
      model.position.set(e.pos.x, terrainHeight(e.pos.x, e.pos.z), e.pos.z); e.pos = model.position; this.scene.add(model);
      const ring = new T.Mesh(new T.RingGeometry(0.7, 0.78, 32), new T.MeshBasicMaterial({ color: 0xcbaa72, transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; model.add(ring);
      return Object.assign(e, { model, ring });
    });
    if (zone === 'sanctum') SEALS.forEach((p, index) => {
      this.environment.landmarks.push({ ...p, kind: 'seal', name: `별의 봉인 ${index + 1}`, index });
      const seal = new T.Group(); seal.position.set(p.x, terrainHeight(p.x, p.z), p.z);
      const base = new T.Mesh(new T.CylinderGeometry(0.9, 1.1, 0.3, 6), material(0x828c8a)); base.position.y = 0.15;
      const crystal = new T.Mesh(new T.OctahedronGeometry(0.65), new T.MeshBasicMaterial({ color: 0xc1e1b5, transparent: true, opacity: 0.6 })); crystal.position.y = 1.2;
      seal.add(base, crystal); this.scene.add(seal); this.seals.push(seal);
    });
    for (const landmark of this.environment.landmarks) if (landmark.kind === 'elder' || landmark.kind === 'shop') {
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
    if (code === 'KeyQ') this.skill('q'); if (code === 'KeyE') this.skill('e'); if (code === 'KeyR') this.skill('r'); if (code === 'KeyT') this.skill('t');
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
  nearest(range: number) { return this.enemies.find(e => e.id === this.battle.nearest(range)?.id); }
  attack() { if (!this.paused && this.battle.attack()) this.attackAnimation = 0.4; this.flushEvents(); }
  skill(skill: Skill) { if (!this.paused && this.battle.skill(skill)) this.attackAnimation = 0.5; this.flushEvents(); }
  potion() { if (!this.paused) this.battle.potion(); this.flushEvents(); }
  dodge() { if (!this.paused) this.battle.dodge(this.movement()); this.flushEvents(); }
  private landmarkNearby() {
    return this.environment.landmarks.find(l => Math.hypot(l.x - this.hero.position.x, l.z - this.hero.position.z) < (l.kind === 'seal' ? 3.2 : 4.4) && (l.kind !== 'seal' || this.battle.boss?.bossPhase === 3));
  }
  interact() {
    if (this.paused) return;
    this.nearby = this.landmarkNearby();
    if (!this.nearby) { this.toast('NPC나 차원문, 활성화된 봉인에 가까이 다가가세요.'); return; }
    if (this.nearby.kind === 'portal') this.travel(this.nearby.destination!);
    else if (this.nearby.kind === 'seal') { this.battle.activateSeal(this.nearby.index!); this.flushEvents(); }
    else { this.hooks.event({ type: 'interact', landmark: this.nearby }); this.sound.play('click'); }
  }
  private flushEvents() {
    let save = false;
    for (const event of this.battle.drainEvents()) {
      const p = event.pos ? new T.Vector3(event.pos.x, terrainHeight(event.pos.x, event.pos.z), event.pos.z) : this.hero.position.clone();
      if (event.kind === 'sound') this.sound.play(event.sound!);
      else if (event.kind === 'float') this.hooks.float(event.text!, p.add(new T.Vector3(0, 2.5, 0)), event.color!);
      else if (event.kind === 'fx') this.effect(p, new T.Color(event.color).getHex(), 0.55, event.radius ?? 2, event.shape === 'slash', event.shape === 'line', event.yaw);
      else if (event.kind === 'save') save = true;
      else { if (event.kind === 'death') this.setPaused(true); this.hooks.event({ type: event.kind, text: event.text }); }
    }
    if (save) this.save();
  }
  revive() { this.state.hp = maxHp(this.state); this.state.mp = maxMp(this.state); this.loadZone('village'); this.setPaused(false); this.save(); this.hooks.update(); }
  private effect(position: T.Vector3, color: number, duration: number, expand: number, slash = false, line = false, yaw = this.battle.facing) {
    const geometry = line ? new T.PlaneGeometry(0.3, expand) : slash ? new T.TorusGeometry(1, 0.045, 4, 24, Math.PI * 1.3) : new T.RingGeometry(0.85, 1, 48);
    const m = new T.Mesh(geometry, new T.MeshBasicMaterial({ color, side: T.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false, blending: T.AdditiveBlending }));
    m.position.copy(position); m.position.y += slash ? 1 : 0.12; m.rotation.set(-Math.PI / 2, slash ? 0.3 : 0, yaw); if (line) { m.position.x += Math.sin(yaw) * expand / 2; m.position.z += Math.cos(yaw) * expand / 2; expand = 0.2; } this.scene.add(m); this.effects.push({ mesh: m, ttl: duration, duration, expand });
  }
  private movement(): Point {
    const dx = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const dz = Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) - Number(this.keys.has('KeyW') || this.keys.has('ArrowUp'));
    return { x: dx * Math.cos(this.yaw) + dz * Math.sin(this.yaw), z: -dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw) };
  }
  private updateCamera(dt: number) {
    const height = Math.sin(this.elevation) * this.distance; const horizontal = Math.cos(this.elevation) * this.distance;
    const destination = this.hero.position.clone().add(new T.Vector3(Math.sin(this.yaw) * horizontal, height + 1.6, Math.cos(this.yaw) * horizontal));
    const focus = this.hero.position.clone().add(new T.Vector3(0, 1.35, 0));
    const clearDistance = (point: T.Vector3) => {
      const ray = point.clone().sub(focus); this.raycaster.set(focus, ray.clone().normalize()); this.raycaster.near = 0.2; this.raycaster.far = ray.length();
      const hit = this.raycaster.intersectObjects(this.cameraOccluders, false)[0]; return hit ? Math.max(0.5, hit.distance - 0.45) : ray.length();
    };
    let available = clearDistance(destination); const blocked = available < destination.distanceTo(focus) - .01;
    // Near a tall wall, look over it instead of filling the screen with the hero's back.
    if (blocked && available < 6) {
      for (const elevation of [.8, 1.05, 1.3]) {
        if (elevation <= this.elevation) continue;
        const horizontal = Math.cos(elevation) * this.distance;
        const candidate = this.hero.position.clone().add(new T.Vector3(Math.sin(this.yaw) * horizontal, Math.sin(elevation) * this.distance + 1.6, Math.cos(this.yaw) * horizontal));
        const clear = clearDistance(candidate);
        if (clear > available) { destination.copy(candidate); available = clear; }
        if (clear >= candidate.distanceTo(focus) - .01) break;
      }
    }
    const sight = destination.clone().sub(focus).normalize();
    destination.copy(focus).addScaledVector(sight, available);
    if (blocked) this.camera.position.copy(destination);
    else this.camera.position.lerp(destination, Math.min(1, dt * 7));
    this.raycaster.near = 0; this.raycaster.far = Infinity;
    this.camera.lookAt(this.hero.position.x, this.hero.position.y + 1.35, this.hero.position.z);
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
    this.time += dt; this.attackAnimation = Math.max(0, this.attackAnimation - dt);
    const input = this.movement(); this.moving = input.x !== 0 || input.z !== 0;
    this.battle.tick(dt, input); this.flushEvents(); this.dodgeTime = this.battle.dodgeTime;
    this.hero.rotation.y = this.battle.cast?.yaw ?? this.battle.facing;
    if (this.jumpVelocity !== 0 || this.jumpHeight > 0) { this.jumpHeight = Math.max(0, this.jumpHeight + this.jumpVelocity * dt); this.jumpVelocity -= dt * 14; if (this.jumpHeight === 0) this.jumpVelocity = 0; }
    this.hero.position.y = terrainHeight(this.hero.position.x, this.hero.position.z) + this.jumpHeight;
    const gait = this.moving ? Math.sin(this.time * 12) * 0.65 : Math.sin(this.time * 2) * 0.025;
    const { legs, arms, body, cape } = this.hero.userData;
    legs[0].rotation.x = gait; legs[1].rotation.x = -gait; arms[1].rotation.x = -gait * 0.65;
    arms[0].rotation.x = this.battle.cast?.type === 'charge' || this.battle.parryTime > 0 ? -1.4 : this.attackAnimation > 0 ? -1.5 + Math.sin((0.4 - this.attackAnimation) * 11) * 1.4 : gait * 0.4;
    if (this.state.weapon === 'bow') { arms[1].rotation.x = -1.2; arms[0].rotation.x = this.battle.cast?.type === 'charge' ? -1.6 : this.attackAnimation > 0 ? -1.3 : -0.65; }
    if (this.state.weapon === 'spear' && (this.attackAnimation > 0 || this.battle.cast?.type === 'dash')) arms[0].rotation.x = -1.5 + Math.sin(this.attackAnimation * 12) * 0.25;
    body.rotation.x = this.dodgeTime > 0 ? -0.7 : 0; body.position.y = this.moving ? Math.abs(Math.sin(this.time * 12)) * 0.045 : Math.sin(this.time * 2) * 0.025;
    cape.rotation.x = Math.sin(this.time * 4) * 0.07 + (this.moving ? 0.2 : 0);
    if (this.heldAttack || this.keys.has('KeyJ')) this.attack();
    this.nearby = this.landmarkNearby();
    this.updateBattleViews();
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]; e.ttl -= dt; e.mesh.scale.setScalar(0.35 + (1 - e.ttl / e.duration) * e.expand); (e.mesh.material as T.MeshBasicMaterial).opacity = Math.max(0, e.ttl / e.duration * 0.8);
      if (e.ttl <= 0) { this.removeModel(e.mesh); this.effects.splice(i, 1); }
    }
    const particles = this.environment.particles.geometry.attributes.position;
    for (let i = 0; i < particles.count; i++) { particles.setY(i, (particles.getY(i) + dt * 0.13) % 11); particles.setX(i, particles.getX(i) + Math.sin(this.time * 0.4 + i) * dt * 0.04); } particles.needsUpdate = true;
    this.environment.portal.children[0].rotation.z = Math.sin(this.time * 0.4) * 0.1;
    (this.environment.portal.children[1] as T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>).material.opacity = 0.15 + Math.sin(this.time * 2) * 0.05;
    this.saveTimer += dt; if (this.saveTimer > 8) { this.saveTimer = 0; this.save(); }
  }
  private telegraphMesh(t: Telegraph) {
    // Vertices follow the ground and are generated from the same committed shape as collision.
    const points: number[] = [];
    const put = (x: number, z: number) => points.push(x, terrainHeight(x, z) + 0.095, z);
    const at = (x: number, z: number) => ({ x: t.origin.x + x * Math.cos(t.yaw) + z * Math.sin(t.yaw), z: t.origin.z - x * Math.sin(t.yaw) + z * Math.cos(t.yaw) });
    if (t.shape === 'line') {
      const corners = [at(-t.width, 0), at(t.width, 0), at(-t.width, t.range), at(t.width, t.range)];
      for (const i of [0, 1, 2, 2, 1, 3]) put(corners[i].x, corners[i].z);
    } else {
      const angle = t.shape === 'circle' ? Math.PI * 2 : t.angle * Math.PI / 180;
      for (let i = 0; i < 64; i++) {
        put(t.origin.x, t.origin.z);
        for (const step of [i, i + 1]) { const yaw = t.yaw - angle / 2 + step / 64 * angle; put(t.origin.x + Math.sin(yaw) * t.range, t.origin.z + Math.cos(yaw) * t.range); }
      }
    }
    const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(points, 3));
    const mesh = new T.Mesh(geometry, new T.MeshBasicMaterial({ color: t.kind === 'eruption' ? 0x93bfdf : 0xf78866, side: T.DoubleSide, transparent: true, opacity: 0.4, depthWrite: false }));
    mesh.renderOrder = 2; this.scene.add(mesh); return mesh;
  }
  private updateBattleViews() {
    for (const e of this.enemies) {
      const data = MONSTERS[e.species]; const live = e.hp > 0;
      e.model.visible = live || e.dead > 15;
      e.model.scale.setScalar(data.size * (live ? e.flash > 0 ? 1.06 : 1 : Math.max(0, e.dead - 15)));
      e.model.position.y = terrainHeight(e.pos.x, e.pos.z) + (e.airborne ? 3.5 : e.species === 'shark' ? e.mode === 'prepare' ? -2.2 : 0.6 : 0);
      e.model.rotation.y = e.facing; e.ring.visible = live && this.target === e;
      (e.ring.material as T.MeshBasicMaterial).color.set(e.bossPhase === 3 && !this.battle.exposure ? 0xba9fea : e.slow ? 0x9dcde1 : 0xe6ce94);
      const walking = e.mode === 'approach' || e.mode === 'attack';
      (e.model.userData.legs as T.Mesh[]).forEach((leg, i) => { leg.rotation.x = walking ? Math.sin(this.time * 9 + (i % 2) * Math.PI) * 0.5 : 0; });
      (e.model.userData.wings as T.Group[]).forEach((wing, i) => { wing.rotation.y = Math.sin(this.time * (e.airborne ? 6 : 2)) * (e.airborne ? 0.6 : 0.27) * (i ? -1 : 1); });
      e.model.userData.body.rotation.x = e.mode === 'prepare' ? Math.sin(this.time * 8) * 0.09 : 0;
      if (e.species === 'rabbit') e.model.userData.body.position.y = walking ? Math.abs(Math.sin(this.time * 7)) * 0.2 : 0;
      const view = this.telegraphViews.get(e.id);
      if (view && view.source !== e.telegraph) { this.removeModel(view.mesh); this.telegraphViews.delete(e.id); }
      if (live && e.telegraph && !this.telegraphViews.has(e.id)) this.telegraphViews.set(e.id, { source: e.telegraph, mesh: this.telegraphMesh(e.telegraph) });
      const active = this.telegraphViews.get(e.id);
      if (active) (active.mesh.material as T.MeshBasicMaterial).opacity = 0.2 + (1 - active.source.remaining / active.source.duration) * 0.35;
    }
    const ids = new Set(this.battle.projectiles.map(p => p.id));
    this.projectileViews.forEach((m, id) => { if (!ids.has(id)) { this.removeModel(m); this.projectileViews.delete(id); } });
    for (const p of this.battle.projectiles) {
      let mesh = this.projectileViews.get(p.id);
      if (!mesh) {
        mesh = new T.Mesh(p.friendly ? new T.ConeGeometry(p.pierce ? 0.13 : 0.07, 0.85, 4) : new T.IcosahedronGeometry(0.18), new T.MeshBasicMaterial({ color: p.friendly ? p.effect === 'frost' ? 0xafdced : 0xe7d5a7 : 0xe6a56f }));
        // Aim the visual trajectory at the launch-time target height, including a flying dragon.
        const target = p.friendly ? this.target : undefined;
        mesh.userData.start = { x: p.pos.x, z: p.pos.z }; mesh.userData.height = terrainHeight(p.pos.x, p.pos.z) + 1.25;
        mesh.userData.slope = target ? (target.model.position.y + MONSTERS[target.species].size * .8 - mesh.userData.height) / Math.max(1, Math.hypot(target.pos.x - p.pos.x, target.pos.z - p.pos.z)) : 0;
        this.scene.add(mesh); this.projectileViews.set(p.id, mesh);
      }
      const traveled = Math.hypot(p.pos.x - mesh.userData.start.x, p.pos.z - mesh.userData.start.z);
      mesh.position.set(p.pos.x, Math.max(terrainHeight(p.pos.x, p.pos.z) + .2, mesh.userData.height + traveled * mesh.userData.slope), p.pos.z);
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(Math.sin(p.yaw), mesh.userData.slope, Math.cos(p.yaw)).normalize());
    }
    this.seals.forEach((seal, i) => { const crystal = seal.children[1] as T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>; crystal.rotation.y = this.time * 0.6; crystal.position.y = 1.2 + Math.sin(this.time * 2 + i) * 0.1; crystal.material.opacity = this.battle.boss?.bossPhase === 3 && !this.battle.sealCooldowns[i] ? 1 : 0.3; });
    this.shieldView.visible = this.battle.shield > 0 || this.battle.parryTime > 0;
    this.shieldView.position.copy(this.hero.position).add(new T.Vector3(0, 1.2, 0));
  }
  dispose() {
    this.save(); this.running = false; this.renderer.setAnimationLoop(null); this.disposers.forEach(fn => fn());
    disposeEnvironment(this.environment); this.enemies.forEach(e => this.removeModel(e.model)); this.npcs.forEach(n => this.removeModel(n));
    this.removeModel(this.hero); this.removeModel(this.shieldView); this.seals.forEach(m => this.removeModel(m));
    this.projectileViews.forEach(m => this.removeModel(m)); this.telegraphViews.forEach(v => this.removeModel(v.mesh)); this.effects.forEach(e => this.removeModel(e.mesh));
    this.renderer.dispose(); void this.sound.context?.close();
  }
}
