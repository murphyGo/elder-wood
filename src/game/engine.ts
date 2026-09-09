import * as T from 'three';
import { character, animal, weaponModel, dressArmor, material } from './models';
import { createEnvironment, disposeEnvironment, animateEnvironment, refreshCoast, refreshSkytree, terrainHeight, type Environment, type Landmark } from './world';
import { STORY_SITES, activeSite, interactStory, beginJourney, craft, buyMaterial, craftingProblem, journeyReady, type RecipeId, type MaterialId, type StoryId, type StoryResult } from './journey';
import { animateHuman, animateAnimal } from './animation';
import { FollowCamera } from './camera';
import { ImpactParticles, contactShadow } from './effects';
import { readSettings, writeSettings, defaultSettings, resolveQuality, PROFILES, type DisplaySettings, type DisplayDevice } from './settings';
import { MONSTERS, ZONES, equippedItem, equipItem, maxHp, maxMp, canTravel, type SaveState, type Zone, type Skill, type Weapon, type ItemId } from './state';
import { Combat, SEALS, type Enemy as CombatEnemy, type Telegraph } from './combat';
import { SaveRepository, type LoadResult } from './persistence';
import { type Point } from './geometry';
import { FINAL_SITES, ROOT_ANCHORS, beginFinale, chooseEnding, interactFinale, finalHomecoming, type EndingChoice } from './finale';
import { beginTrial, trialProblem, trialEncounter, finishTrialWave, nextTrialWave, claimTrial, forgeWeapon, type TrialRun, type TrialKind } from './trials';

export interface Enemy extends CombatEnemy { model: T.Group; ring: T.Mesh; shadow: T.Group; previous: Point }
export type GameEvent = { type: 'toast' | 'level' | 'kill' | 'death' | 'zone' | 'interact' | 'quest' | 'saved' | 'phase' | 'practice' | 'story' | 'choice' | 'trial'; text?: string; landmark?: Landmark; good?: boolean };
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
  storyResult?: StoryResult;
  activeTrial?: TrialRun;
  get target() { return this.enemies.find(e => e.id === this.battle?.targetId); }
  set target(e: Enemy | undefined) { if (this.battle) { this.battle.targetId = e?.id; if (this.battle.lockedTargetId !== undefined) this.battle.lockedTargetId = e?.id; } }
  get lockedTarget() { return this.enemies.find(e => e.id === this.battle?.lockedTargetId && e.hp > 0); }
  get cooldowns() { return this.state.cooldowns; }
  get killNotice() { return this.battle.questNotified; }
  set killNotice(value: boolean) { this.battle.questNotified = value; }
  yaw = 0.22; elevation = 0.43; distance = 16; time = 0; attackAnimation = 0; dodgeTime = 0; jumpVelocity = 0; jumpHeight = 0;
  saveAvailable = true; moving = false;
  settings: DisplaySettings; quality: 'high' | 'medium' | 'low' = 'high';
  private displayStorage?: Storage;
  private followCamera = new FollowCamera(); private impacts = new ImpactParticles(); private heroShadow = contactShadow(.55);
  private shakeEnergy = 0; private lastAction = '';
  private cameraLift = 0; private framingDistance = 0;
  private hooks: Hooks; private last = 0; private uiTimer = 0; private saveTimer = 0;
  private sunlight = new T.DirectionalLight(0xffe9b5, 3.1); private ambient = new T.HemisphereLight(0xc3e0d6, 0x666345, 2.2);
  private projectileViews = new Map<number, T.Mesh>();
  private telegraphViews = new Map<number, { source: Telegraph; mesh: T.Mesh }>();
  private seals: T.Group[] = [];
  private cameraOccluders: T.Mesh[] = [];
  private shieldView = new T.Mesh(new T.SphereGeometry(1.2, 16, 12), new T.MeshBasicMaterial({ color: 0xc8e5a8, transparent: true, opacity: 0.17, wireframe: true }));
  private effects: { mesh: T.Mesh; ttl: number; duration: number; expand: number }[] = [];
  private pointer = new T.Vector2(); private raycaster = new T.Raycaster(); private heldAttack = false; private dragging = false; private cameraPointer?: number; private attackPointer?: number; private lastPointer = { x: 0, y: 0 };
  private armorAppearance = -1;
  private disposers: (() => void)[] = [];
  constructor(container: HTMLElement, hooks: Hooks) {
    this.hooks = hooks;
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Restricted browser storage. */ }
    this.displayStorage = storage; this.settings = readSettings(storage, this.device().reducedMotion);
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
    this.scene.add(this.sunlight, this.sunlight.target, this.ambient, this.hero, this.shieldView, this.impacts.mesh, this.heroShadow);
    this.setWeapon(this.state.weapon, false); this.loadZone(this.state.zone);
    const resize = () => { this.camera.aspect = container.clientWidth / container.clientHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(container.clientWidth, container.clientHeight); this.applyDisplay(); };
    this.listen(window, 'resize', resize);
    this.listen(window, 'blur', () => this.clearInput());
    this.listen(document, 'visibilitychange', () => { if (document.hidden) { this.clearInput(); this.save(); } this.last = performance.now(); });
    this.listen(window, 'pagehide', () => this.save());
    this.listen(document, 'keydown', e => this.keydown(e as KeyboardEvent));
    this.listen(document, 'keyup', e => this.keys.delete((e as KeyboardEvent).code));
    this.listen(this.renderer.domElement, 'contextmenu', e => e.preventDefault());
    this.listen(this.renderer.domElement, 'pointerdown', e => {
      const event = e as PointerEvent; if (this.paused) return; this.renderer.domElement.focus();
      if (event.pointerType === 'touch' || event.button === 2) {
        if (this.cameraPointer !== undefined) return;
        this.lastPointer = { x: event.clientX, y: event.clientY }; this.cameraPointer = event.pointerId; this.dragging = true; this.renderer.domElement.setPointerCapture(event.pointerId);
      } else if (event.button === 0) { this.attackPointer = event.pointerId; this.selectTarget(event); this.heldAttack = true; this.attack(); }
    });
    const release = (e: Event) => { const id = (e as PointerEvent).pointerId; if (id === this.attackPointer) { this.heldAttack = false; this.attackPointer = undefined; } if (id === this.cameraPointer) { this.dragging = false; this.cameraPointer = undefined; } };
    this.listen(window, 'pointerup', release); this.listen(window, 'pointercancel', release); this.listen(this.renderer.domElement, 'lostpointercapture', release);
    this.listen(window, 'pointermove', e => { const event = e as PointerEvent; if (event.pointerId !== this.cameraPointer) return; if (this.dragging && !this.paused) { this.yaw -= (event.clientX - this.lastPointer.x) * 0.005; this.elevation = T.MathUtils.clamp(this.elevation + (event.clientY - this.lastPointer.y) * 0.003, 0.18, 0.9); } this.lastPointer = { x: event.clientX, y: event.clientY }; });
    this.listen(this.renderer.domElement, 'wheel', e => { const event = e as WheelEvent; event.preventDefault(); this.distance = T.MathUtils.clamp(this.distance + event.deltaY * 0.012, 7, 24); });
    this.last = performance.now(); this.renderer.setAnimationLoop(now => this.frame(now));
  }
  private listen(target: EventTarget, event: string, callback: EventListener) { target.addEventListener(event, callback, { passive: false }); this.disposers.push(() => target.removeEventListener(event, callback)); }
  clearInput() { this.keys.clear(); this.heldAttack = false; this.dragging = false; this.cameraPointer = undefined; this.attackPointer = undefined; }
  private device(): DisplayDevice { return { width: window.innerWidth, coarse: window.matchMedia('(pointer: coarse)').matches, pixelRatio: window.devicePixelRatio, reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches }; }
  setDisplay(patch: Partial<DisplaySettings>) {
    this.settings = { ...this.settings, ...patch }; this.applyDisplay();
    if (!writeSettings(this.displayStorage, this.settings)) this.toast('화면 설정을 저장하지 못했습니다. 현재 선택은 이번 플레이에 적용됩니다.');
  }
  resetDisplay() { this.setDisplay(defaultSettings(this.device().reducedMotion)); }
  private applyDisplay() {
    this.quality = resolveQuality(this.settings, this.device()); const profile = PROFILES[this.quality];
    const ratio = Math.min(window.devicePixelRatio, profile.pixelRatio);
    if (this.renderer.getPixelRatio() !== ratio) this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = profile.shadow > 0;
    if (this.sunlight.shadow.mapSize.x !== Math.max(512, profile.shadow)) {
      this.sunlight.shadow.map?.dispose(); this.sunlight.shadow.map = null; this.sunlight.shadow.mapSize.setScalar(Math.max(512, profile.shadow)); this.sunlight.shadow.needsUpdate = true;
    }
    this.impacts.setLimit(profile.sparks); this.shakeEnergy = 0;
    if (this.environment) { this.environment.grass.count = Math.min(profile.grass, this.environment.grassCount); this.environment.particles.geometry.setDrawRange(0, profile.particles); this.environment.particles.visible = this.settings.ambientMotion; }
  }
  toggleTargetLock() {
    if (this.paused) return;
    if (this.battle.lockedTargetId !== undefined) { this.battle.lockedTargetId = undefined; return; }
    const target = this.target && this.target.hp > 0 && Math.hypot(this.target.pos.x - this.hero.position.x, this.target.pos.z - this.hero.position.z) <= 26 ? this.target : this.nearest(24);
    if (!target) { this.toast('가까운 몬스터가 있을 때 대상을 고정할 수 있습니다.'); return; }
    this.battle.lockedTargetId = target.id; this.battle.targetId = target.id;
  }
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
    const item = equippedItem(this.state); const model = weaponModel(weapon, this.state.equipment[weapon]);
    hand.add(model); this.hero.userData.weapon = model; this.attackAnimation = 0; this.lastAction = '';
    if (notify) { this.toast(`${item.name} 장착`, true); this.sound.play('click'); this.save(); this.hooks.update(); }
  }
  equip(id: ItemId) { if (!equipItem(this.state, id)) return false; this.setWeapon(this.state.weapon); return true; }
  private removeModel(model: T.Object3D) { model.traverse(o => { if (o instanceof T.Mesh || o instanceof T.Line) { o.geometry.dispose(); if (o.material instanceof T.MeshBasicMaterial || o.material instanceof T.LineBasicMaterial) o.material.dispose(); } }); model.removeFromParent(); }
  loadZone(zone: Zone) {
    if (zone !== 'trial') this.activeTrial = undefined;
    if (this.environment) disposeEnvironment(this.environment);
    this.enemies.forEach(e => { this.removeModel(e.model); this.removeModel(e.ring); this.removeModel(e.shadow); }); this.npcs.forEach(n => this.removeModel(n));
    this.projectileViews.forEach(m => this.removeModel(m)); this.projectileViews.clear();
    this.telegraphViews.forEach(v => this.removeModel(v.mesh)); this.telegraphViews.clear();
    this.effects.forEach(e => this.removeModel(e.mesh)); this.effects = []; this.enemies = []; this.npcs = []; this.seals.forEach(m => this.removeModel(m)); this.seals = [];
    this.environment = createEnvironment(zone, this.state.journey, this.state.finale); this.scene.add(this.environment.group);
    this.cameraOccluders = []; this.environment.group.traverse(o => { if (o instanceof T.Mesh && !(o instanceof T.InstancedMesh) && !Array.isArray(o.material) && !o.material.transparent) this.cameraOccluders.push(o); });
    this.environment.group.updateMatrixWorld(true);
    this.state.zone = zone; this.nearby = undefined; this.hero.position.set(1.4, 0, 8); this.hero.rotation.y = Math.PI;
    this.battle = new Combat(this.state, zone, this.environment.obstacles, zone === 'sanctum' && this.state.chapter >= 5, zone === 'trial' && this.activeTrial ? trialEncounter(this.activeTrial) : undefined);
    this.battle.player = this.hero.position;
    this.jumpHeight = 0; this.jumpVelocity = 0; this.dodgeTime = 0; this.clearInput();
    const dark = this.environment.dark;
    this.scene.background = new T.Color(dark ? (zone === 'sanctum' ? 0x555263 : 0x6b9299) : 0xc4d7c5);
    this.scene.fog = new T.Fog(dark ? (zone === 'sanctum' ? 0x555263 : 0x6b9299) : 0xc4d7c5, dark ? 28 : 40, dark ? 91 : 118);
    if (this.environment.coast) { const sky = dark ? 0x61788a : zone === 'wreck' ? 0x9fb9bd : 0xbacfc9; this.scene.background = new T.Color(sky); this.scene.fog = new T.Fog(sky, 40, 125); }
    this.ambient.intensity = dark ? 1.65 : 2.2; this.ambient.color.set(dark ? 0xb1c9e3 : 0xc3e0d6); this.sunlight.intensity = dark ? 1.8 : 3.1;
    this.sunlight.color.set(dark ? 0xc5c0ec : 0xffe9b5);
    if (this.environment.skytree) {
      const sky = zone === 'trial' ? 0x9a9eb7 : zone === 'ruins' ? 0xc5d3c0 : this.state.finale.choice === 'release' ? 0xa5c9c0 : 0xd3c7ab;
      this.scene.background = new T.Color(sky); this.scene.fog = new T.Fog(sky, 46, 135);
      this.ambient.intensity = 2; this.sunlight.intensity = 2.5; this.sunlight.color.set(0xffead0);
    }
    this.enemies = this.battle.enemies.map(e => {
      const data = MONSTERS[e.species]; const model = animal(e.species); model.scale.setScalar(data.size);
      model.position.set(e.pos.x, terrainHeight(e.pos.x, e.pos.z), e.pos.z); e.pos = model.position; this.scene.add(model);
      const ring = new T.Mesh(new T.RingGeometry(0.7, 0.78, 32), new T.MeshBasicMaterial({ color: 0xcbaa72, transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.scale.setScalar(data.size); this.scene.add(ring);
      const shadow = contactShadow(data.size * .55); this.scene.add(shadow);
      return Object.assign(e, { model, ring, shadow, previous: { x: e.pos.x, z: e.pos.z } });
    });
    const rootBoss = this.battle.boss?.species === 'starwarden';
    if (zone === 'sanctum' || this.battle.boss?.species === 'dragon' || rootBoss) (rootBoss ? ROOT_ANCHORS : SEALS).forEach((p, index) => {
      this.environment.landmarks.push({ ...p, kind: rootBoss ? 'root' : 'seal', name: `${rootBoss ? '뿌리의 공명' : '별의 봉인'} ${index + 1}`, index });
      const seal = new T.Group(); seal.position.set(p.x, terrainHeight(p.x, p.z), p.z);
      const base = new T.Mesh(new T.CylinderGeometry(0.9, 1.1, 0.3, 6), material(0x828c8a)); base.position.y = 0.15;
      const crystal = new T.Mesh(new T.OctahedronGeometry(0.65), new T.MeshBasicMaterial({ color: 0xc1e1b5, transparent: true, opacity: 0.6 })); crystal.position.y = 1.2;
      seal.add(base, crystal); this.scene.add(seal); this.seals.push(seal);
    });
    if (zone === 'ruins') {
      const site = FINAL_SITES.elion_ally, npc = character(true, 0x8c9971);
      npc.position.set(site.x, terrainHeight(site.x, site.z), site.z); npc.userData.finalId = 'elion_ally'; this.npcs.push(npc); this.scene.add(npc);
    }
    for (const landmark of this.environment.landmarks) if (landmark.kind === 'elder' || landmark.kind === 'shop') {
      const npc = character(landmark.kind === 'elder', landmark.kind === 'elder' ? 0x6c7b5b : 0x9b7945);
      npc.position.set(landmark.x, terrainHeight(landmark.x, landmark.z), landmark.z); npc.rotation.y = 0.5; this.npcs.push(npc); this.scene.add(npc);
    }
    for (const landmark of this.environment.landmarks) if (landmark.storyId) {
      const site = STORY_SITES[landmark.storyId];
      if (!['npc', 'rescue', 'workshop'].includes(site.kind)) continue;
      const tint = site.kind === 'rescue' ? 0x789574 : site.kind === 'workshop' ? 0xaa7c4f : 0x567e95;
      const npc = character(false, tint, tint);
      npc.userData.storyId = landmark.storyId; npc.position.set(landmark.x, terrainHeight(landmark.x, landmark.z), landmark.z); this.npcs.push(npc); this.scene.add(npc);
    }
    if (zone === 'harbor' || zone === 'village') {
      const residents = zone === 'harbor' ? [{ id: 'ian', x: -9, z: 13, name: '돌아온 이안', text: '이안은 다음 항해에 쓸 그물을 손질하고 있습니다. “이번엔 돌아올 등대가 있네요.”' }, { id: 'sera', x: -12, z: 4, name: '돌아온 세라', text: '세라는 새 항해일지를 펼칩니다. “수호자도, 당신도 잊지 않을 거예요.”' }] : [{ id: 'lyra', x: 3, z: 5, name: '돌아온 리라', text: '리라는 숲에서 구한 토끼를 돌보고 있습니다. “다치면 언제든 찾아오세요. 이제 혼자 숲에 들어가지 않을게요.”' }];
      for (const r of residents) {
        if (!this.state.journey.flags.includes(r.id as StoryId)) continue;
        const npc = character(false, 0x6a947f); npc.position.set(r.x, terrainHeight(r.x, r.z), r.z); this.npcs.push(npc); this.scene.add(npc);
        const text = this.state.finale.step === 6 ? this.state.finale.choice === 'renew' ? `${r.name}도 마을의 수호석을 돌보는 일을 맡았습니다. “다음 세대에도 함께 지키는 법을 알려 줄 거예요.”` : `${r.name}는 빛나는 씨앗을 담은 주머니를 건넵니다. “당신이 열어 준 길을 따라, 이 빛도 멀리 여행하겠죠.”` : r.text;
        this.environment.landmarks.push({ ...r, text, kind: 'resident' });
      }
    }
    this.hero.position.y = terrainHeight(this.hero.position.x, this.hero.position.z);
    this.refreshStory(); this.applyDisplay(); this.updateCamera(1); this.hooks.event({ type: 'zone' });
  }
  refreshStory() {
    refreshCoast(this.environment, this.state.journey);
    refreshSkytree(this.environment, this.state.finale);
    this.npcs.forEach(n => { if (n.userData.storyId) n.visible = activeSite(this.state, n.userData.storyId); });
    this.npcs.forEach(n => { if (n.userData.finalId) n.visible = this.state.finale.step >= FINAL_SITES[n.userData.finalId as keyof typeof FINAL_SITES].step; });
    this.environment.group.updateMatrixWorld(true);
    this.cameraOccluders = []; this.environment.group.traverseVisible(o => { if (o instanceof T.Mesh && !(o instanceof T.InstancedMesh) && !Array.isArray(o.material) && !o.material.transparent) this.cameraOccluders.push(o); });
    this.hooks.update();
  }
  beginJourney() { if (!beginJourney(this.state, this.hero.position)) return false; this.save(); this.refreshStory(); return true; }
  beginFinale() { if (!beginFinale(this.state, this.hero.position)) return false; this.save(); this.refreshStory(); return true; }
  chooseEnding(choice: EndingChoice) { if (!chooseEnding(this.state, choice, this.hero.position)) return false; this.save(); this.refreshStory(); return true; }
  startTrial(kind: TrialKind, tier: number) {
    if (this.activeTrial) return false;
    const run = beginTrial(this.state, kind, tier);
    if (!run) { this.toast(trialProblem(this.state, kind, tier)!); return false; }
    this.activeTrial = run; this.loadZone('trial'); this.save(); this.setPaused(false); return true;
  }
  nextTrialWave() {
    if (!this.activeTrial || !nextTrialWave(this.activeTrial)) return false;
    this.loadZone('trial'); this.save(); this.setPaused(false); return true;
  }
  claimTrial() {
    if (!this.activeTrial) return null;
    const level = this.state.level, reward = claimTrial(this.state, this.activeTrial); if (!reward) return null;
    this.loadZone('village'); this.save(); this.hooks.update();
    if (this.state.level > level) this.hooks.event({ type: 'level', text: `레벨 ${this.state.level}` });
    return reward;
  }
  forge(weapon: Weapon) { if (!forgeWeapon(this.state, weapon)) return false; this.save(); this.sound.play('level'); this.hooks.update(); return true; }
  craft(id: RecipeId) {
    if (!craft(this.state, id, this.hero.position)) { this.toast(craftingProblem(this.state, id) ?? '도란의 작업대 가까이에서 제작하세요.'); return false; }
    this.save(); this.sound.play('level'); this.toast('제작 완료 · 가방과 모험 일지를 확인하세요.', true); this.refreshStory(); return true;
  }
  buyMaterial(id: MaterialId) { if (!buyMaterial(this.state, id, this.hero.position)) return false; this.save(); this.hooks.update(); return true; }
  siteActive(l: Landmark) {
    if (l.ending) return this.state.finale.step === 6;
    if (l.finalId) return this.state.finale.step >= FINAL_SITES[l.finalId].step;
    return !l.storyId || activeSite(this.state, l.storyId);
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
    if (code === 'KeyX') this.toggleTargetLock();
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
  attack() { if (!this.paused && this.battle.attack()) { this.attackAnimation = 0.4; this.lastAction = 'attack'; } this.flushEvents(); }
  skill(skill: Skill) { if (!this.paused && this.battle.skill(skill)) { this.attackAnimation = 0.5; this.lastAction = skill; } this.flushEvents(); }
  potion() { if (!this.paused) this.battle.potion(); this.flushEvents(); }
  dodge() { if (!this.paused) { this.battle.dodge(this.movement()); if (this.battle.dodgeTime > 0) this.attackAnimation = 0; } this.flushEvents(); }
  private landmarkNearby() {
    return this.environment.landmarks.filter(l => this.siteActive(l) && Math.hypot(l.x - this.hero.position.x, l.z - this.hero.position.z) < (l.kind === 'seal' || l.kind === 'root' ? 3.2 : l.kind === 'story' || l.kind === 'finale' ? 3.5 : 4.4) && (l.kind !== 'seal' || this.battle.boss?.species === 'dragon' && this.battle.boss.bossPhase === 3) && (l.kind !== 'root' || this.battle.boss?.species === 'starwarden' && this.battle.boss.bossPhase === 2)).sort((a, b) => Math.hypot(a.x - this.hero.position.x, a.z - this.hero.position.z) - Math.hypot(b.x - this.hero.position.x, b.z - this.hero.position.z))[0];
  }
  interact() {
    if (this.paused) return;
    this.nearby = this.landmarkNearby();
    if (!this.nearby) { this.toast('NPC나 차원문, 활성화된 봉인에 가까이 다가가세요.'); return; }
    if (this.nearby.kind === 'portal') this.travel(this.nearby.destination!);
    else if (this.nearby.kind === 'seal') { this.battle.activateSeal(this.nearby.index!); this.flushEvents(); }
    else if (this.nearby.kind === 'root') { this.battle.activateRoot(this.nearby.index!); this.flushEvents(); }
    else if (this.nearby.finalId) {
      const result = interactFinale(this.state, this.nearby.finalId, this.state.zone, this.hero.position); this.storyResult = result;
      if (!result.ok) { this.toast(result.text.join(' ')); return; }
      if (result.changed) { this.save(); this.refreshStory(); }
      this.hooks.event({ type: result.choose ? 'choice' : 'story' }); this.sound.play('click');
    }
    else if (this.nearby.storyId) {
      const before = this.state.level; this.storyResult = interactStory(this.state, this.nearby.storyId, { zone: this.state.zone, position: this.hero.position, enemies: this.enemies });
      if (!this.storyResult.ok) { this.toast(this.storyResult.text.join(' ')); return; }
      if (this.storyResult.changed) { this.save(); this.refreshStory(); if (this.state.level > before) this.hooks.event({ type: 'level', text: `레벨 ${this.state.level}` }); }
      this.hooks.event({ type: 'story' }); this.sound.play('click');
    }
    else if (this.nearby.kind === 'resident') { this.storyResult = { ok: true, changed: false, title: this.nearby.name, text: [this.nearby.text!] }; this.hooks.event({ type: 'story' }); }
    else { if (this.nearby.kind === 'elder' && finalHomecoming(this.state, this.hero.position)) { this.save(); this.refreshStory(); } this.hooks.event({ type: 'interact', landmark: this.nearby }); this.sound.play('click'); }
  }
  private flushEvents() {
    let save = false;
    for (const event of this.battle.drainEvents()) {
      const p = event.pos ? new T.Vector3(event.pos.x, terrainHeight(event.pos.x, event.pos.z), event.pos.z) : this.hero.position.clone();
      if (event.kind === 'sound') this.sound.play(event.sound!);
      else if (event.kind === 'float') {
        if (/^[0-9−]/.test(event.text!)) { this.impacts.burst(p, new T.Color(event.color), event.text!.startsWith('−')); this.shakeEnergy = Math.min(1, this.shakeEnergy + (event.text!.startsWith('−') ? .7 : .24)); }
        this.hooks.float(event.text!, p.add(new T.Vector3(0, 2.5, 0)), event.color!);
      }
      else if (event.kind === 'fx') this.effect(p, new T.Color(event.color).getHex(), 0.55, event.radius ?? 2, event.shape === 'slash', event.shape === 'line', event.yaw);
      else if (event.kind === 'save') save = true;
      else { if (event.kind === 'death') { this.setPaused(true); if (this.activeTrial) this.activeTrial.status = 'abandoned'; } this.hooks.event({ type: event.kind, text: event.text }); }
    }
    if (save) this.save();
  }
  revive() { this.state.hp = maxHp(this.state); this.state.mp = maxMp(this.state); this.loadZone(this.environment.coast ? 'harbor' : 'village'); this.setPaused(false); this.save(); this.hooks.update(); }
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
    const locked = this.lockedTarget;
    if (this.battle.lockedTargetId !== undefined && (!locked || Math.hypot(locked.pos.x - this.hero.position.x, locked.pos.z - this.hero.position.z) > 26 || this.state.hp <= 0)) this.battle.lockedTargetId = undefined;
    if (this.lockedTarget && !this.dragging && !this.paused) {
      const desired = Math.atan2(this.hero.position.x - this.lockedTarget.pos.x, this.hero.position.z - this.lockedTarget.pos.z);
      this.yaw += Math.atan2(Math.sin(desired - this.yaw), Math.cos(desired - this.yaw)) * (1 - Math.exp(-dt * 3));
    }
    const aiming = this.settings.aimZoom && this.state.weapon === 'bow' && (this.attackAnimation > 0 || this.battle.cast?.type === 'charge');
    const fov = T.MathUtils.damp(this.camera.fov, aiming ? 42 : 49, 8, dt);
    if (Math.abs(this.camera.fov - fov) > .001) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    const focus = this.hero.position.clone().add(new T.Vector3(0, 1.35, 0));
    const size = this.lockedTarget ? MONSTERS[this.lockedTarget.species].size : 0;
    const lift = this.lockedTarget ? Math.max(0, this.lockedTarget.model.position.y + size * .9 - focus.y) * .32 : 0;
    this.cameraLift = T.MathUtils.damp(this.cameraLift, Math.min(2.8, lift), 5, dt);
    this.framingDistance = T.MathUtils.damp(this.framingDistance, Math.max(0, size - 1.5) * 2, 5, dt);
    focus.y += this.cameraLift;
    this.shakeEnergy = Math.max(0, this.shakeEnergy - dt * 3);
    const strength = this.paused ? 0 : this.shakeEnergy * this.settings.shake * .16;
    const shake = new T.Vector3(Math.sin(this.time * 83) * strength, Math.cos(this.time * 97) * strength * .6, 0);
    this.followCamera.update(this.camera, focus, this.yaw, this.elevation, this.distance + this.framingDistance, this.cameraOccluders, dt, shake);
    this.sunlight.position.set(this.hero.position.x - 18, 32, this.hero.position.z + 17); this.sunlight.target.position.copy(this.hero.position);
  }
  private frame(now: number) {
    if (!this.running) return;
    const dt = Math.min((now - this.last) / 1000, 0.05); this.last = now;
    if (this.armorAppearance !== this.state.armor) { this.armorAppearance = this.state.armor; dressArmor(this.hero, this.state.armor); }
    if (!this.paused && !document.hidden) this.update(dt);
    this.updateCamera(dt); this.renderer.render(this.scene, this.camera);
    this.uiTimer += dt; if (this.uiTimer >= 0.1) { this.uiTimer = 0; this.hooks.update(); }
  }
  private update(dt: number) {
    this.time += dt; this.attackAnimation = Math.max(0, this.attackAnimation - dt);
    const input = this.movement(); this.moving = input.x !== 0 || input.z !== 0;
    const before = this.hero.position.clone(); const wasJumping = this.jumpHeight > 0;
    this.battle.tick(dt, input); this.flushEvents(); this.dodgeTime = this.battle.dodgeTime;
    this.hero.rotation.y = this.battle.cast?.yaw ?? this.battle.facing;
    if (this.jumpVelocity !== 0 || this.jumpHeight > 0) { this.jumpHeight = Math.max(0, this.jumpHeight + this.jumpVelocity * dt); this.jumpVelocity -= dt * 14; if (this.jumpHeight === 0) this.jumpVelocity = 0; }
    this.hero.position.y = terrainHeight(this.hero.position.x, this.hero.position.z) + this.jumpHeight;
    animateHuman(this.hero, dt, { weapon: this.state.weapon, distance: Math.min(1, Math.hypot(this.hero.position.x - before.x, this.hero.position.z - before.z)), time: this.time, attack: this.attackAnimation, action: this.lastAction, cast: this.battle.cast, parry: this.battle.parryTime > 0, dodge: this.dodgeTime > 0, jump: this.jumpHeight, landed: wasJumping && !this.jumpHeight });
    this.heroShadow.position.set(this.hero.position.x, terrainHeight(this.hero.position.x, this.hero.position.z), this.hero.position.z);
    this.heroShadow.scale.setScalar(1 / (1 + this.jumpHeight * .3));
    this.npcs.forEach(npc => animateHuman(npc, dt, { weapon: 'spear', distance: 0, time: this.time, attack: 0, action: '', parry: false, dodge: false, jump: 0, landed: false }));
    if (this.heldAttack || this.keys.has('KeyJ')) this.attack();
    if (this.activeTrial?.status === 'active') {
      this.activeTrial.elapsed += dt;
      if (finishTrialWave(this.activeTrial, this.battle)) { this.setPaused(true); this.save(); this.hooks.event({ type: 'trial' }); }
    }
    this.nearby = this.landmarkNearby();
    this.updateBattleViews(dt); this.impacts.update(dt);
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]; e.ttl -= dt; e.mesh.scale.setScalar(0.35 + (1 - e.ttl / e.duration) * e.expand); (e.mesh.material as T.MeshBasicMaterial).opacity = Math.max(0, e.ttl / e.duration * 0.8);
      if (e.ttl <= 0) { this.removeModel(e.mesh); this.effects.splice(i, 1); }
    }
    if (this.settings.ambientMotion) animateEnvironment(this.environment, dt);
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
  private updateBattleViews(dt: number) {
    for (const e of this.enemies) {
      const data = MONSTERS[e.species]; const live = e.hp > 0;
      e.model.visible = live || e.dead > 15;
      e.model.scale.setScalar(data.size * (live ? e.flash > 0 ? 1.06 : 1 : Math.max(0, e.dead - 15)));
      const traveled = Math.min(1, Math.hypot(e.pos.x - e.previous.x, e.pos.z - e.previous.z));
      const altitude = animateAnimal(e.model, e, dt, this.time, traveled);
      e.previous = { x: e.pos.x, z: e.pos.z };
      e.model.position.y = terrainHeight(e.pos.x, e.pos.z) + altitude;
      e.ring.position.set(e.pos.x, terrainHeight(e.pos.x, e.pos.z) + .10, e.pos.z);
      e.shadow.position.set(e.pos.x, terrainHeight(e.pos.x, e.pos.z), e.pos.z); e.shadow.visible = live; e.shadow.scale.setScalar(1 / (1 + Math.max(0, altitude) * .2));
      e.model.rotation.y = e.facing; e.ring.visible = live && this.target === e;
      (e.ring.material as T.MeshBasicMaterial).color.set(((e.species === 'dragon' && e.bossPhase === 3) || (e.species === 'starwarden' && e.bossPhase === 2)) && !this.battle.exposure ? 0xba9fea : e.slow ? 0x9dcde1 : 0xe6ce94);
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
    this.seals.forEach((seal, i) => { const crystal = seal.children[1] as T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>; crystal.rotation.y = this.time * 0.6; crystal.position.y = 1.2 + Math.sin(this.time * 2 + i) * 0.1; const boss = this.battle.boss; crystal.material.opacity = boss?.bossPhase === (boss?.species === 'starwarden' ? 2 : 3) && !this.battle.sealCooldowns[i] ? 1 : 0.3; });
    this.shieldView.visible = this.battle.shield > 0 || this.battle.parryTime > 0;
    this.shieldView.position.copy(this.hero.position).add(new T.Vector3(0, 1.2, 0));
  }
  dispose() {
    this.save(); this.running = false; this.renderer.setAnimationLoop(null); this.disposers.forEach(fn => fn());
    disposeEnvironment(this.environment); this.enemies.forEach(e => { this.removeModel(e.model); this.removeModel(e.ring); this.removeModel(e.shadow); }); this.npcs.forEach(n => this.removeModel(n));
    this.removeModel(this.hero); this.removeModel(this.shieldView); this.seals.forEach(m => this.removeModel(m));
    this.projectileViews.forEach(m => this.removeModel(m)); this.telegraphViews.forEach(v => this.removeModel(v.mesh)); this.effects.forEach(e => this.removeModel(e.mesh));
    this.impacts.dispose(); this.removeModel(this.heroShadow); this.sunlight.shadow.map?.dispose();
    this.renderer.dispose(); void this.sound.context?.close();
  }
}
