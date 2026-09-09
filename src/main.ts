import './style.css';
import { Vector3 } from 'three';
import { Game, type GameEvent } from './game/engine';
import { CHAPTERS, WEAPONS, SKILL_KEYS, getSkill, ITEMS, DIFFICULTIES, equippedItem, buyItem, setDifficulty, ZONES, MONSTERS, maxHp, maxMp, xpRequired, attackPower, defense, canTravel, questReady, completeQuest, buyPotion, upgradeArmor, newGame, type Zone, type Weapon, type Skill, type Species, type ItemId, type Difficulty } from './game/state';
import { QUALITY_NAMES, type Quality } from './game/settings';
import { icon, portrait } from './icons';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div id="world"></div><div class="world-vignette"></div>
  <header class="topbar">
    <a class="brand" href="#" aria-label="엘더우드 모험 화면">${icon('leaf')}<span>ELDERWOOD<small>잊힌 숲의 부름</small></span></a>
    <nav aria-label="메인 메뉴"><button class="nav-item active" data-panel="adventure">${icon('compass')}<span>모험</span></button><button class="nav-item" data-panel="character">${icon('shield')}<span>캐릭터</span><kbd>C</kbd></button><button class="nav-item" data-panel="inventory">${icon('bag')}<span>가방</span><kbd>I</kbd></button><button class="nav-item" data-panel="map">${icon('map')}<span>세계 지도</span><kbd>M</kbd></button></nav>
    <div class="top-actions"><span class="live-badge"><i></i> 싱글 플레이</span><button id="sound-btn" class="icon-button" aria-label="소리 끄기">${icon('sound')}</button><button id="fullscreen-btn" class="icon-button" aria-label="전체 화면">${icon('fullscreen')}</button><button class="icon-button" data-panel="help" aria-label="조작 방법">${icon('help')}</button></div>
  </header>
  <main id="hud" aria-label="게임 상태">
    <section class="player-card"><button class="portrait" data-panel="character" aria-label="캐릭터 정보">${portrait}<span id="level-badge">1</span></button><div class="player-vitals"><div class="player-name">여행자 <span id="player-title">새로운 모험가</span></div><div class="vital hp"><span>${icon('heart')}</span><div class="meter"><i id="hp-fill"></i><span id="hp-text">100 / 100</span></div></div><div class="vital mp"><span>${icon('drop')}</span><div class="meter"><i id="mp-fill"></i><span id="mp-text">60 / 60</span></div></div><div class="player-meta"><span>Lv. <b id="player-level">1</b></span><span>${icon('coin')} <b id="gold">60</b></span></div></div></section>
    <div class="compass-strip"><span>W</span><i></i><span>NW</span><i></i><b id="compass-heading">N</b><i></i><span>NE</span><i></i><span>E</span><div class="compass-pointer">◆</div></div>
    <div id="target-card" class="target-card hidden"></div><button id="target-lock" class="target-lock" data-action="lock" aria-pressed="false"><kbd>X</kbd><span>대상 고정</span></button>
    <aside class="right-hud"><button class="minimap" data-panel="map" aria-label="세계 지도 열기"><span class="map-north">N</span><canvas id="minimap-canvas" width="360" height="360"></canvas><span class="map-expand">${icon('fullscreen')}</span><span class="map-time">${icon('sun')} 09:41</span></button><div class="map-caption"><i class="safe-dot"></i><span id="zone-short">그린헤이븐</span><kbd>M</kbd></div>
    <section class="quest-tracker"><div class="section-eyebrow">${icon('book')} 메인 이야기 <button class="icon-button" data-panel="journal" aria-label="퀘스트 일지">${icon('chevron')}</button></div><div id="quest-content"></div></section></aside>
    <section class="region-caption"><div class="region-eyebrow"><span id="region-type">평화로운 안식처</span><i></i><span id="region-level">권장 Lv. 1</span></div><h1 id="region-title">그린헤이븐 마을</h1><p id="region-subtitle">모든 모험에는, 돌아올 곳이 필요하다.</p><div class="region-weather">${icon('sun')} 맑음 <span>·</span> 엘더우드 동부</div></section>
    <div id="welcome-card" class="welcome-card"><span class="welcome-mark">${icon('leaf')}</span><div><div class="section-eyebrow">당신의 이야기가 시작됩니다</div><h2>숲이 당신을 부릅니다.</h2><p>장로 엘리온에게 다가가 첫 이야기를 들어보세요.</p><button id="begin-btn">모험 시작하기 ${icon('arrow')}</button></div><button id="welcome-close" class="icon-button" aria-label="안내 닫기">${icon('close')}</button></div>
    <div id="interaction" class="interaction hidden"><kbd>F</kbd><span></span>${icon('chevron')}</div>
    <div id="level-up" class="level-up hidden"><span>LEVEL UP</span><h2></h2><p>체력과 마력, 공격력이 증가했습니다.</p></div>
    <div id="zone-announcement" class="zone-announcement hidden"><span></span><h2></h2></div>
    <div id="nameplate-layer" class="nameplate-layer"></div><div id="float-layer" class="float-layer"></div><div id="toasts" class="toasts" role="status" aria-live="polite"></div>
    <section class="combat-hud"><div class="weapon-indicator">${icon('sword')}<span id="weapon-name">여행자의 검</span><span class="weapon-switch">1 / 2 / 3 <span>무기 전환</span></span></div><div class="skillbar"><button class="skill-slot basic" data-action="attack" aria-label="기본 공격 J"><kbd>J</kbd><span class="skill-symbol">${icon('sword')}</span><span class="skill-name">기본 공격</span></button><span class="slot-divider"></span>${SKILL_KEYS.map(k => `<button class="skill-slot" data-skill="${k}" aria-label="${getSkill(newGame(), k).name} ${k.toUpperCase()}"><kbd>${k.toUpperCase()}</kbd><span class="skill-symbol">${icon(getSkill(newGame(), k).icon)}</span><span class="skill-name">${getSkill(newGame(), k).name}</span><span class="skill-overlay" id="cooldown-${k}"></span><span class="skill-lock" id="lock-${k}">Lv. ${getSkill(newGame(), k).level}</span></button>`).join('')}<span class="slot-divider"></span><button class="skill-slot potion-slot" data-action="potion" aria-label="회복 물약 H"><kbd>H</kbd><span class="skill-symbol">${icon('potion')}</span><span id="potion-count" class="item-count">5</span><span class="skill-name">회복 물약</span></button></div><div class="xp-row"><span id="xp-level">Lv. 1</span><div class="xp-track"><i id="xp-fill"></i></div><span id="xp-text">0 / 60 EXP</span></div></section>
    <div class="quick-actions"><button data-panel="graphics">${icon('sun')}<span>화면 설정</span></button><button data-panel="journal">${icon('book')}<span>퀘스트 일지</span><kbd>L</kbd></button><button data-panel="help">${icon('help')}<span>조작 방법</span><kbd>?</kbd></button></div>
  </main>
  <div id="save-warning" class="save-warning hidden" role="status"></div>
  <footer class="bottom-bar"><div class="controls-hint"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 이동</span><i></i><span>마우스 우클릭 드래그 <em>시점 회전</em></span><i></i><span><kbd>Shift</kbd> 회피</span><span><kbd>Space</kbd> 점프</span><span><kbd>F</kbd> 상호작용</span></div><span id="save-status">${icon('check')} 자동 저장됨</span></footer>
  <div id="touch-controls"><div class="touch-dpad"><button data-hold="KeyW" aria-label="앞으로 이동">↑</button><button data-hold="KeyA" aria-label="왼쪽으로 이동">←</button><button data-hold="KeyS" aria-label="뒤로 이동">↓</button><button data-hold="KeyD" aria-label="오른쪽으로 이동">→</button></div><button data-action="interact">대화 F</button><button data-action="dodge">회피</button></div>
  <div id="modal-backdrop" class="modal-backdrop hidden"><section id="modal" class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"></section></div>
  <div id="loading"><div class="loading-leaf">${icon('leaf')}</div><h1>ELDERWOOD</h1><p>숲으로 가는 길을 찾고 있습니다<span>…</span></p></div>
`;

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
let game: Game; let activePanel = ''; let ready = false; let previousFocus: HTMLElement | null = null; let questSignature = ''; let levelTimer: ReturnType<typeof setTimeout>; let zoneTimer: ReturnType<typeof setTimeout>;
const mm = $('#minimap-canvas') as HTMLCanvasElement; const ctx = mm.getContext('2d')!;
const floats: { element: HTMLElement; position: Vector3; start: number }[] = [];
const controls = [['W A S D / 방향키', '캐릭터 이동'], ['마우스 우클릭 드래그', '카메라 회전'], ['마우스 휠', '화면 확대 / 축소'], ['J / 마우스 좌클릭', '기본 공격 (누르고 있으면 연속 공격)'], ['Tab / X', '공격 대상 변경 / 대상 고정·해제'], ['터치 화면 드래그', '카메라 회전 · 이동과 공격은 화면 버튼'], ['Q / E / R', '장착 무기의 전용 스킬 · Lv. 2 / 3 / 5 해금'], ['T', '숲의 치유 · Lv. 3 해금'], ['1 / 2 / 3', '검 / 창 / 활 장착'], ['Shift', '이동 방향으로 회피 · 회피 중 무적'], ['Space', '점프'], ['H', '회복 물약'], ['F', 'NPC 대화 / 차원문 이동 / 용의 봉인 작동'], ['C / I / M / L', '캐릭터 / 가방 / 지도 / 일지'], ['Esc', '메뉴 · 일시 정지 / 창 닫기']];

function render() {
  if (!ready) return;
  const s = game.state;
  $('#level-badge').textContent = String(s.level); $('#player-level').textContent = String(s.level); $('#gold').textContent = s.gold.toLocaleString();
  $('#player-title').textContent = s.chapter === 6 ? '숲의 수호자' : s.level >= 5 ? '별빛의 추적자' : s.level >= 3 ? '숲의 탐험가' : '새로운 모험가';
  $('#hp-fill').style.width = `${s.hp / maxHp(s) * 100}%`; $('#mp-fill').style.width = `${s.mp / maxMp(s) * 100}%`;
  $('#hp-text').textContent = `${Math.ceil(s.hp)} / ${maxHp(s)}`; $('#mp-text').textContent = `${Math.floor(s.mp)} / ${maxMp(s)}`;
  $('#xp-level').textContent = `Lv. ${s.level}`; $('#xp-fill').style.width = `${s.xp / xpRequired(s.level) * 100}%`; $('#xp-text').textContent = `${s.xp} / ${xpRequired(s.level)} EXP`;
  $('#potion-count').textContent = String(s.potions);
  if ($('#weapon-name').textContent !== equippedItem(s).name) {
    $('#weapon-name').textContent = equippedItem(s).name;
    $('.weapon-indicator>.icon').outerHTML = icon(WEAPONS[s.weapon].icon);
    $('.skill-slot.basic .skill-symbol').innerHTML = icon(WEAPONS[s.weapon].icon);
  }
  const heading = ((game.yaw * 180 / Math.PI) % 360 + 360) % 360; $('#compass-heading').textContent = ['N', 'NW', 'W', 'SW', 'S', 'SE', 'E', 'NE'][Math.round(heading / 45) % 8];
  for (const k of SKILL_KEYS) {
    const definition = getSkill(s, k); const slot = $(`[data-skill="${k}"]`);
    if (slot.dataset.definition !== definition.id) {
      slot.dataset.definition = definition.id; slot.querySelector('.skill-name')!.textContent = definition.name;
      slot.querySelector('.skill-symbol')!.innerHTML = icon(definition.icon); slot.setAttribute('aria-label', `${definition.name} ${k.toUpperCase()}`);
      $(`#lock-${k}`).textContent = `Lv. ${definition.level}`;
    }
    const locked = s.level < getSkill(s, k).level; const cooldown = game.cooldowns[k]; const btn = $(`[data-skill="${k}"]`);
    btn.classList.toggle('locked', locked); btn.classList.toggle('on-cooldown', cooldown > 0); btn.classList.toggle('low-mana', s.mp < getSkill(s, k).mana);
    $(`#lock-${k}`).classList.toggle('hidden', !locked); $(`#cooldown-${k}`).textContent = cooldown > 0 ? `${Math.ceil(cooldown)}` : ''; btn.title = `${getSkill(s, k).name}: ${getSkill(s, k).description} · MP ${getSkill(s, k).mana} · 재사용 ${getSkill(s, k).cooldown}초`;
  }
  const target = game.target ?? game.enemies.find(e => e.species === 'dragon' && e.hp > 0); $('#target-card').classList.toggle('hidden', !target || target.hp <= 0);
  if (target && target.hp > 0) { const data = MONSTERS[target.species]; $('#target-card').innerHTML = `<span>Lv. ${data.level}</span><b>${data.name}</b><div class="enemy-health"><i style="width:${target.hp / target.maxHp * 100}%"></i></div><small>${Math.ceil(target.hp)} / ${target.maxHp}</small><p class="enemy-status">${target.species === 'dragon' ? `${game.battle.practice ? '연습전 · ' : ''}${target.bossPhase}단계 · ${target.bossPhase === 3 ? game.battle.exposure > 0 ? `보호막 해제 ${Math.ceil(game.battle.exposure)}초` : '봉인 근처에서 F' : target.airborne ? '비행 중 · 착지 대기' : '지상 전투'}` : target.telegraph?.label ?? (target.mode === 'recover' ? '빈틈 · 공격 기회' : '')}${target.slow > 0 ? ' · 둔화' : ''}${target.burn ? ' · 화상' : ''}${target.weakened > 0 ? ' · 약화' : ''}</p>`; }
  $('#target-lock').setAttribute('aria-pressed', String(!!game.lockedTarget));
  $('#target-lock span').textContent = game.lockedTarget ? '고정 해제' : '대상 고정';
  $('#target-lock').classList.toggle('hidden', game.state.zone === 'village');
  $('#interaction').classList.toggle('hidden', !game.nearby || game.paused);
  if (game.nearby) $('#interaction span').textContent = game.nearby.kind === 'portal' ? `${ZONES[game.nearby.destination!].name} 이동` : game.nearby.kind === 'seal' ? `${game.nearby.name} 작동${game.battle.sealCooldowns[game.nearby.index!] > 0 ? ` · ${Math.ceil(game.battle.sealCooldowns[game.nearby.index!])}초` : ''}` : `${game.nearby.name}와 대화`;
  const signature = `${s.chapter}:${JSON.stringify(s.kills)}:${s.zone}`;
  if (signature !== questSignature) { questSignature = signature; renderQuest(); }
  drawMinimap(); updateFloats(); updateNameplates();
}

function updateNameplates() {
  const rect = game.renderer.domElement.getBoundingClientRect();
  const occupied = ['.player-card', '.target-card', '.region-caption', '.right-hud'].map(selector => $(selector)).filter(el => el.getClientRects().length).map(el => el.getBoundingClientRect());
  document.querySelectorAll<HTMLElement>('.world-nameplate').forEach((label, index) => {
    const landmark = game.environment.landmarks[index]; if (!landmark) return;
    const p = new Vector3(landmark.x, landmark.kind === 'portal' ? 5.5 : 3.2, landmark.z).project(game.camera);
    const distance = Math.hypot(game.hero.position.x - landmark.x, game.hero.position.z - landmark.z);
    const x = rect.left + (p.x * .5 + .5) * rect.width, y = rect.top + (-p.y * .5 + .5) * rect.height;
    const covered = occupied.some(r => x + 65 > r.left && x - 65 < r.right && y > r.top && y - 30 < r.bottom);
    label.style.display = !covered && p.z < 1 && p.z > -1 && Math.abs(p.x) < 0.85 && Math.abs(p.y) < 0.85 && distance < 28 ? '' : 'none';
    label.style.left = `${(p.x * 0.5 + 0.5) * rect.width}px`;
    label.style.top = `${(-p.y * 0.5 + 0.5) * rect.height}px`;
    label.style.opacity = `${Math.min(1, (30 - distance) / 10)}`;
  });
}

function objectiveRows() {
  const s = game.state; const q = CHAPTERS[s.chapter];
  if (s.chapter === 0 || s.chapter === 5) return `<div class="objective"><span class="objective-dot"></span><span>장로 엘리온과 대화</span><span>${icon('pin')}</span></div>`;
  if (s.chapter === 6) return `<div class="objective complete">${icon('check')}<span>엘더우드에 평화 되찾기</span></div>`;
  return Object.entries(q.objectives).map(([type, count]) => { const n = Math.min(s.kills[type as Species] ?? 0, count!); return `<div class="objective ${n >= count! ? 'complete' : ''}"><span class="objective-dot">${n >= count! ? icon('check') : ''}</span><span>${MONSTERS[type as Species].name} 해방</span><b>${n}<em> / ${count}</em></b></div>`; }).join('');
}
function renderQuest() {
  const s = game.state; const q = CHAPTERS[s.chapter];
  $('#quest-content').innerHTML = `<p class="chapter-label">${q.subtitle}</p><h2>${q.title}</h2><p class="quest-description">${q.description}</p><div class="objectives">${objectiveRows()}</div>${questReady(s) ? `<button class="quest-reward" data-action="claim">보상 받고 이야기 이어가기 ${icon('arrow')}</button>` : `<button class="quest-location" data-panel="map">${icon('pin')} ${ZONES[q.zone].name}<span>${icon('chevron')}</span></button>`}`;
}
function drawMinimap() {
  if (!game) return;
  const c = ctx; c.clearRect(0, 0, 360, 360); c.save(); c.translate(180, 180);
  c.fillStyle = game.environment.dark ? '#2b373b' : '#344a36'; c.fillRect(-180, -180, 360, 360);
  c.strokeStyle = '#75816340'; c.lineWidth = 1;
  for (let i = -160; i <= 160; i += 40) { c.beginPath(); c.moveTo(i, -180); c.lineTo(i, 180); c.stroke(); c.beginPath(); c.moveTo(-180, i); c.lineTo(180, i); c.stroke(); }
  c.strokeStyle = '#658d8960'; c.lineWidth = 26; c.beginPath(); c.moveTo(-110, -190); c.bezierCurveTo(-140, -80, -82, 50, -115, 200); c.stroke();
  c.strokeStyle = '#b5a87b65'; c.lineWidth = 14; c.beginPath(); c.moveTo(16, 190); c.bezierCurveTo(15, 75, -12, -5, 8, -75); c.lineTo(0, -160); c.stroke();
  for (let i = 0; i < 48; i++) { const a = i * 2.399; const r = 60 + (i % 9) * 14; c.fillStyle = ['#556a42', '#415b3c', '#657548'][i % 3]; c.beginPath(); c.arc(Math.sin(a) * r, Math.cos(a) * r, 8 + i % 7, 0, 6.28); c.fill(); }
  if (game.state.zone === 'village') for (const [x, y] of [[-63, -26], [-102, -50], [-35, -80]]) { c.save(); c.translate(x, y); c.rotate(0.2); c.fillStyle = '#c4b286'; c.fillRect(-10, -8, 20, 16); c.strokeStyle = '#857348'; c.strokeRect(-10, -8, 20, 16); c.restore(); }
  for (const l of game.environment.landmarks) { const x = l.x * 4.7; const z = l.z * 4.7; c.fillStyle = l.kind === 'portal' ? '#acd4c0' : '#ebcf85'; c.save(); c.translate(x, z); c.rotate(Math.PI / 4); c.fillRect(-3.5, -3.5, 7, 7); c.restore(); }
  for (const e of game.enemies) if (e.hp > 0) { c.fillStyle = e.species === 'dragon' ? '#e8a2bb' : '#dc947b'; c.beginPath(); c.arc(e.model.position.x * 4.7, e.model.position.z * 4.7, e.species === 'dragon' ? 6 : 3, 0, 6.28); c.fill(); }
  const p = game.hero.position; c.translate(p.x * 4.7, p.z * 4.7); c.rotate(-game.hero.rotation.y + Math.PI);
  c.fillStyle = '#f2e6c5'; c.shadowColor = '#f5e7b8'; c.shadowBlur = 10; c.beginPath(); c.moveTo(0, -9); c.lineTo(-6, 7); c.lineTo(0, 4); c.lineTo(6, 7); c.closePath(); c.fill(); c.restore();
}
function floating(text: string, position: Vector3, color: string) {
  const element = document.createElement('span'); element.className = 'damage-float'; element.textContent = text; element.style.color = color; $('#float-layer').append(element); floats.push({ element, position, start: performance.now() });
}
function updateFloats() {
  const rect = game.renderer.domElement.getBoundingClientRect();
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; const age = (performance.now() - f.start) / 1000; if (age > 1.3) { f.element.remove(); floats.splice(i, 1); continue; }
    const p = f.position.clone().project(game.camera); f.element.style.left = `${rect.left + (p.x * 0.5 + 0.5) * rect.width}px`; f.element.style.top = `${rect.top + (-p.y * 0.5 + 0.5) * rect.height - age * 45}px`; f.element.style.opacity = `${Math.min(1, (1.3 - age) * 2)}`;
  }
}
function toast(text: string, good = false) {
  const element = document.createElement('div'); element.className = `toast ${good ? 'good' : ''}`; element.innerHTML = `${icon(good ? 'check' : 'spark')}<span></span>`; element.querySelector('span')!.textContent = text; $('#toasts').append(element);
  while ($('#toasts').children.length > 4) $('#toasts').firstElementChild?.remove(); setTimeout(() => element.remove(), 4200);
}
function handleEvent(e: GameEvent) {
  if (!ready) return;
  if (e.type === 'toast' || e.type === 'kill' || e.type === 'phase' || e.type === 'practice') toast(e.text!, e.good || e.type === 'kill');
  if (e.type === 'level') { $('#level-up h2').textContent = e.text!; $('#level-up').classList.remove('hidden'); clearTimeout(levelTimer); levelTimer = setTimeout(() => $('#level-up').classList.add('hidden'), 3300); }
  if (e.type === 'quest') toast('이야기 목표 달성! 오른쪽 퀘스트에서 보상을 받으세요.', true);
  if (e.type === 'interact') { if (e.landmark?.kind === 'shop') openPanel('shop'); else openPanel('dialogue'); }
  if (e.type === 'death') openPanel('death');
  if (e.type === 'zone') updateZone();
  if (e.type === 'saved') { $('#save-warning').classList.toggle('hidden', game.saveAvailable); $('#save-warning').textContent = game.repository.locked && game.loadResult.status === 'blocked' ? '원본 보존 중 · 임시 플레이는 저장되지 않습니다' : '저장 불가 · 현재 모험은 임시 플레이입니다'; $('#save-status').innerHTML = `${icon(game.saveAvailable ? 'check' : 'help')} ${game.saveAvailable ? '자동 저장됨' : '저장 불가 · 임시 플레이'}`; }
}
function updateZone(announce = true) {
  const z = ZONES[game.state.zone]; $('#zone-short').textContent = z.name.replace(' 마을', ''); $('#region-title').textContent = z.name; $('#region-subtitle').textContent = z.subtitle; $('#region-level').textContent = `권장 Lv. ${z.level}`;
  $('#region-type').textContent = game.state.zone === 'village' ? '평화로운 안식처' : game.state.zone === 'sanctum' ? '고대의 봉인지' : '모험 지역';
  $('.safe-dot').classList.toggle('danger', game.state.zone !== 'village');
  $('#nameplate-layer').innerHTML = game.environment.landmarks.map(l => `<div class="world-nameplate ${l.kind === 'portal' ? 'portal-label' : ''}"><span>${l.kind === 'elder' ? '◆ 마을의 장로' : l.kind === 'shop' ? '◆ 여행자의 상인' : l.kind === 'seal' ? '◇ F · 봉인 장치' : '◇ 차원문'}</span><b>${l.kind === 'portal' ? ZONES[l.destination!].name : l.name}</b></div>`).join('');
  if (announce) { $('#zone-announcement span').textContent = z.english; $('#zone-announcement h2').textContent = z.name; $('#zone-announcement').classList.remove('hidden'); clearTimeout(zoneTimer); zoneTimer = setTimeout(() => $('#zone-announcement').classList.add('hidden'), 2800); }
}

const modal = $('#modal');
function shell(eyebrow: string, title: string, content: string, wide = false) {
  modal.classList.toggle('wide', wide); modal.innerHTML = `<button class="modal-close icon-button" data-close aria-label="창 닫기">${icon('close')}</button><div class="modal-eyebrow">${eyebrow}</div><h2 id="modal-title">${title}</h2>${content}`;
}
function closePanel() {
  if (activePanel === 'death' || activePanel === 'recovery') return;
  activePanel = ''; $('#modal-backdrop').classList.add('hidden'); game.setPaused(false); document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.panel === 'adventure')); previousFocus?.focus({ preventScroll: true });
}
function openPanel(panel: string) {
  if (!ready) return;
  if ((activePanel === 'death' || activePanel === 'recovery') && panel !== activePanel) return;
  if (panel === 'adventure') { closePanel(); return; }
  if (!activePanel) previousFocus = document.activeElement as HTMLElement;
  const previousPanel = activePanel;
  activePanel = panel; game.setPaused(true); $('#modal-backdrop').classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.panel === panel));
  const s = game.state;
  if (panel === 'character') shell('YOUR ADVENTURER', '나의 캐릭터', `<div class="character-layout"><div class="character-portrait">${portrait}<span>Lv. ${s.level}</span></div><div><p class="character-class">${s.chapter === 6 ? '숲의 수호자' : '엘더우드의 여행자'}</p><h3>여행자</h3><p class="muted">작은 발걸음이, 숲의 운명을 바꿉니다.</p><div class="stats-grid"><div>${icon('heart')}<span>최대 체력</span><b>${maxHp(s)}</b></div><div>${icon('drop')}<span>최대 마력</span><b>${maxMp(s)}</b></div><div>${icon('sword')}<span>공격력</span><b>${attackPower(s)}</b></div><div>${icon('shield')}<span>방어력</span><b>${defense(s)}</b></div></div></div></div><div class="modal-section-title">배운 스킬 <span>레벨을 달성하면 자동으로 습득합니다</span></div><div class="skill-list">${SKILL_KEYS.map(k => [k, getSkill(s, k)] as const).map(([k, skill]) => `<div class="skill-detail ${s.level < skill.level ? 'unlearned' : ''}"><div class="detail-icon">${icon(skill.icon)}</div><div><b>${skill.name}</b><p>${skill.description}</p><small>MP ${skill.mana} · 재사용 ${skill.cooldown}초</small></div><span>${s.level < skill.level ? `Lv. ${skill.level} 해금` : `<kbd>${k.toUpperCase()}</kbd> 습득 완료`}</span></div>`).join('')}</div><p class="modal-footnote">다음 레벨까지 ${xpRequired(s.level) - s.xp} EXP · 총 ${s.totalKills}마리 해방 · 모험 시간 ${Math.floor(s.playTime / 60)}분</p>`, true);
  else if (panel === 'inventory') shell('EQUIPMENT & INVENTORY', '장비와 가방', `<div class="inventory-summary"><span>${icon('bag')} 여행자의 소지품</span><b>${icon('coin')} ${s.gold.toLocaleString()} G</b></div><div class="equipment-grid">${s.ownedItems.map(id => {
    const item = ITEMS[id], w = WEAPONS[item.weapon], equipped = s.equipment[item.weapon] === id;
    const delta = item.attack - ITEMS[s.equipment[item.weapon]].attack;
    return `<button class="equipment-card ${equipped ? 'equipped' : ''}" data-item="${id}"><span class="equipment-type">${w.type}<kbd>${['sword','spear','bow'].indexOf(item.weapon) + 1}</kbd></span><div class="equipment-art" style="color:${item.color}">${icon(w.icon)}</div><h3>${item.name}</h3><p>공격력 +${item.attack} · ${w.range}m${delta ? ` · ${delta > 0 ? '▲ +' : '▼ '}${delta}` : ''}</p><p class="item-effect">${item.description}</p><span class="equipment-status">${equipped ? `${icon('check')} ${s.weapon === item.weapon ? '사용 중' : '전환 시 장착'}` : '장착하기'}</span></button>`;
  }).join('')}</div><div class="inventory-item"><span class="detail-icon">${icon('shield')}</span><div><b>${['여행자의 옷', '숲지기의 가죽 갑옷', '수호자의 사슬 갑옷', '별빛 기사 갑옷'][s.armor]}</b><p>체력 +${s.armor * 20} · 방어력 +${s.armor * 6}</p></div><span class="tag">장착 중</span></div><div class="inventory-item"><span class="detail-icon rose">${icon('potion')}</span><div><b>회복 물약 × ${s.potions}</b><p>최대 체력의 ${Math.round(60 * DIFFICULTIES[s.difficulty].healing)}% 회복 · 재사용 4초</p></div><kbd>H</kbd></div><div class="panel-footer"><p>무기별로 장착한 아이템을 기억합니다. 고유 무기는 마을 상점에서 구입하세요.</p><button class="secondary-button" data-shop-visit>마을 상점 ${icon('arrow')}</button></div>`, true);
  else if (panel === 'map') shell('EXPLORE ELDERWOOD', '세계 지도', `<p class="modal-intro">저마다의 이야기가 잠든 다섯 곳. 다음 발걸음을 정해보세요.</p><div class="world-map-art"><svg viewBox="0 0 760 260" role="img" aria-label="그린헤이븐 마을에서 숲, 들판, 신전, 용의 안식처로 이어지는 지도"><defs><pattern id="mapgrid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0v28" fill="none" stroke="#c6ba9220" stroke-width="0.5"/></pattern></defs><rect width="760" height="260" fill="#253e34"/><rect width="760" height="260" fill="url(#mapgrid)"/><path d="M0 210q80-60 170-110t170 10 210-30 210-40" fill="none" stroke="#718e7850" stroke-width="56"/><path d="M130 0q130 70 70 130t100 130" fill="none" stroke="#79a6ab50" stroke-width="19"/><path d="m82 180 151-70 139 52 163-70 146-41" fill="none" stroke="#c5b885" stroke-width="2" stroke-dasharray="5 7"/>${[[82,180,'village'],[233,110,'forest'],[372,162,'plains'],[535,92,'depths'],[681,51,'sanctum']].map(([x,y,id], i) => `<g class="map-node ${canTravel(s, id as Zone) ? 'unlocked' : ''}" data-travel="${id}" role="button" tabindex="0" aria-label="${ZONES[id as Zone].name} 이동"><circle cx="${x}" cy="${y}" r="${s.zone === id ? 22 : 17}" fill="#22382e" stroke="${canTravel(s, id as Zone) ? '#dac48d' : '#7b887a'}" stroke-width="2"/><text x="${x}" y="${Number(y)+5}" text-anchor="middle" fill="#ded3ad" font-size="13">${i + 1}</text><text x="${x}" y="${Number(y)+38}" text-anchor="middle" fill="#d5d9c8" font-size="12">${ZONES[id as Zone].name}</text></g>`).join('')}</svg></div><div class="zone-list">${Object.entries(ZONES).map(([key, z]) => `<button data-travel="${key}" class="zone-card ${s.zone === key ? 'current' : ''}" ${canTravel(s, key as Zone) ? '' : 'disabled'}><div class="zone-number">${canTravel(s, key as Zone) ? icon(key === 'village' ? 'camp' : key === 'sanctum' ? 'spark' : 'compass') : icon('lock')}</div><div><h3>${z.name}${key === 'sanctum' && s.chapter >= 5 ? ' · 보스 연습' : ''}</h3><p>Lv. ${z.level}${key === 'village' ? ' · 안전 지역' : ` · ${z.creatures.map(c => MONSTERS[c].name.replace(/물든 |안개 |성난 |그림자 |바위등 |흑월의 |심연의 |고대룡 /g, '')).join(', ')}`}</p></div><span>${s.zone === key ? '현재 위치' : canTravel(s, key as Zone) ? icon('arrow') : `${z.chapter}장 해금`}</span></button>`).join('')}</div><p class="modal-footnote">지역을 선택하면 즉시 이동합니다. 메인 이야기와 권장 레벨을 달성하면 다음 지역이 열립니다. 용을 해방한 후 안식처에 재입장하면 보상 없는 연습전을 시작합니다.</p>`, true);
  else if (panel === 'journal') {
    const q = CHAPTERS[s.chapter]; shell('THE STORY SO FAR', '모험 일지', `<p class="journal-prologue">별이 떨어진 밤, 숲은 노래를 잃었습니다.<br>평범한 여행자였던 당신에게, 숲이 다시 말을 걸어옵니다.</p><div class="journal-current"><span class="chapter-label">${q.subtitle}</span><h3>${q.title}</h3><p>${q.description}</p><div class="objectives">${objectiveRows()}</div>${q.xp ? `<div class="reward-line">이야기 보상 <b>${q.xp} EXP</b><b>${q.gold} G</b><b>물약 × 2</b></div>` : ''}${questReady(s) ? '<button class="primary-button" data-action="claim">보상 받고 다음 이야기로</button>' : ''}</div><div class="chapter-timeline">${CHAPTERS.slice(0, 6).map((q, i) => `<div class="${i < s.chapter ? 'done' : i === s.chapter ? 'current' : ''}"><span>${i < s.chapter ? icon('check') : String(i).padStart(2, '0')}</span><div><small>${q.subtitle}</small><b>${q.title}</b></div>${i > s.chapter ? icon('lock') : ''}</div>`).join('')}</div>`);
  }
  else if (panel === 'graphics') shell('MAKE YOURSELF AT HOME', '화면과 카메라', `<p class="modal-intro">플레이 환경에 맞게 숲의 풍경과 시점을 조절하세요.</p><div class="modal-section-title">그래픽 품질 <span>현재 적용: ${QUALITY_NAMES[game.quality]}</span></div><div class="quality-options">${Object.entries(QUALITY_NAMES).map(([id, name]) => `<button data-quality="${id}" aria-pressed="${game.settings.quality === id}" class="${game.settings.quality === id ? 'selected' : ''}"><b>${name}</b><small>${({auto:'화면에 맞춰 선택',high:'선명한 그림자와 풍성한 풀',medium:'화질과 부드러움의 균형',low:'가벼운 화면과 간결한 풍경'} as Record<string,string>)[id]}</small></button>`).join('')}</div><div class="modal-section-title">피격 시 화면 흔들림</div><div class="shake-options">${[[0,'끔'],[.35,'약하게'],[.7,'보통']].map(([value,label]) => `<button data-shake="${value}" aria-pressed="${game.settings.shake === value}" class="${game.settings.shake === value ? 'selected' : ''}">${label}</button>`).join('')}</div><label class="display-toggle"><span><b>활 조준 확대</b><small>활 공격과 충전 중 대상을 조금 크게 보여줍니다.</small></span><input type="checkbox" data-display="aimZoom" ${game.settings.aimZoom ? 'checked' : ''}></label><label class="display-toggle"><span><b>풍경의 움직임</b><small>풀과 나뭇잎, 물결, 떠다니는 빛을 움직입니다.</small></span><input type="checkbox" data-display="ambientMotion" ${game.settings.ambientMotion ? 'checked' : ''}></label><p class="modal-footnote">화면 설정은 즉시 적용됩니다. 자동 품질은 작은 화면에서 낮음, 터치 화면에서 보통 또는 낮음을 선택합니다.</p><div class="panel-footer"><button class="text-button" data-reset-display>화면 설정 초기화</button><button class="primary-button" data-close>모험으로 돌아가기 ${icon('arrow')}</button></div>`);
  else if (panel === 'help' || panel === 'pause') shell('TAKE A BREATH', panel === 'pause' ? '잠시, 모닥불 곁에서' : '모험가 안내서', `<p class="modal-intro">메뉴를 여는 동안 모험은 잠시 멈춥니다.</p><div class="controls-list">${controls.map(([k, label]) => `<div><kbd>${k}</kbd><span>${label}</span></div>`).join('')}</div><p class="help-tip">${icon('leaf')} 붉은 원·부채꼴·직선은 실제 공격 범위입니다. Shift로 피하고, 위험할 때는 H로 물약을 사용하세요. 상어가 사라지면 푸른 물결 밖으로 피하세요. 활 R은 자동으로 모아 발사하며 회피나 무기 전환으로 취소됩니다. 취소해도 마력과 재사용 대기시간은 돌아오지 않습니다.</p><div class="modal-section-title">모험 난이도 <span>${s.zone === 'village' ? '마을에서 변경할 수 있습니다' : '마을로 돌아가면 변경할 수 있습니다'}</span></div><div class="difficulty-options">${Object.entries(DIFFICULTIES).map(([id, d]) => `<button data-difficulty="${id}" class="${s.difficulty === id ? 'selected' : ''}" ${s.zone !== 'village' ? 'disabled' : ''}><b>${d.name}</b><small>${d.description}</small></button>`).join('')}</div><p class="modal-footnote">경험치와 골드 보상은 모든 난이도에서 같습니다. 현재: ${DIFFICULTIES[s.difficulty].name}</p><button class="secondary-button display-menu" data-panel="graphics">${icon('sun')} 화면과 카메라 설정</button><div class="panel-footer"><button class="text-button" data-new-game>새 게임</button><button class="primary-button" data-close>모험으로 돌아가기 ${icon('arrow')}</button></div>`);
  else if (panel === 'shop') {
    if (s.zone !== 'village') { closePanel(); game.toast('그린헤이븐 마을에서 상인을 만나세요.'); return; }
    shell('ROWAN’S TRADING POST', '로웬의 작은 상점', `<p class="dialogue-quote">“좋은 장비와 따뜻한 물약이면, 어떤 숲도 두렵지 않지.”</p><div class="inventory-summary"><span>소지금</span><b>${icon('coin')} ${s.gold} G</b></div><div class="shop-item"><div class="detail-icon rose">${icon('potion')}</div><div><h3>회복 물약</h3><p>체력 ${Math.round(60 * DIFFICULTIES[s.difficulty].healing)}% 회복 · 현재 ${s.potions}개</p></div><button class="secondary-button" data-buy-potion ${s.gold < 20 ? 'disabled' : ''}>20 G · 구입</button></div><div class="shop-item"><div class="detail-icon">${icon('shield')}</div><div><h3>${s.armor === 3 ? '별빛 기사 갑옷' : ['숲지기의 가죽 갑옷', '수호자의 사슬 갑옷', '별빛 기사 갑옷'][s.armor]}</h3><p>${s.armor === 3 ? '최고 단계의 갑옷을 장착하고 있습니다.' : '갑옷 강화 · 체력 +20, 방어력 +6'}</p></div><button class="secondary-button" data-buy-armor ${s.armor >= 3 || s.gold < 80 * (s.armor + 1) ? 'disabled' : ''}>${s.armor >= 3 ? '강화 완료' : `${80 * (s.armor + 1)} G · 장착`}</button></div><div class="modal-section-title">별의 파편으로 벼린 무기 <span>이야기 보상 수령 후 입고됩니다</span></div>${Object.entries(ITEMS).filter(([, item]) => item.price > 0).map(([id, item]) => {
      const owned = s.ownedItems.includes(id as ItemId), locked = s.chapter < item.chapter;
      const delta = item.attack - ITEMS[s.equipment[item.weapon]].attack;
      return `<div class="shop-item"><div class="detail-icon" style="color:${item.color}">${icon(WEAPONS[item.weapon].icon)}</div><div><h3>${item.name}</h3><p>공격력 +${item.attack} · 현재 장비 대비 ${delta >= 0 ? '+' : ''}${delta}<br>${item.description}</p></div><button class="secondary-button" data-buy-item="${id}" ${owned || locked || s.gold < item.price ? 'disabled' : ''}>${owned ? '보유 중' : locked ? `${item.chapter - 1}장 완료 후` : `${item.price} G · 구입`}</button></div>`;
    }).join('')}<p class="modal-footnote">구입한 무기는 가방에서 장착하세요. 물약은 H로 사용합니다. 구입한 갑옷은 즉시 장착됩니다.</p>`);
  }
  else if (panel === 'dialogue') {
    const text = s.chapter === 0 ? '어서 오게, 여행자. 얼마 전 별 하나가 숲 깊은 곳에 떨어졌지. 그날 이후 온순하던 동물들이 낯선 힘에 물들었다네.<br><br>먼저 <strong>속삭임의 숲</strong>으로 가보게. 다람쥐와 토끼를 저주에서 풀어주면, 숲도 자네에게 길을 보여줄 걸세.<br><br>자네의 검과 창, 활은 이미 가방에 넣어두었다네. 지도 <kbd>M</kbd>을 열면 숲으로 바로 갈 수 있지.' : s.chapter === 5 ? '돌아왔군, 숲의 수호자여. 바람에 다시 새들의 노래가 실려오는구나.<br><br>모르가스는 숲을 파괴하려던 것이 아니었어. 떨어지는 별의 저주를 홀로 막아내다가 그 자신이 물들고 말았던 거지.<br><br>자네가 구한 건 우리 마을만이 아니라네. 숲의 모든 생명, 그리고 마지막 용의 마음이라네. 고맙네.' : s.chapter === 6 ? '숲이 자네의 발걸음을 기억하고 있다네. 언제든 쉬어가게. 그린헤이븐은 늘 자네의 집이니.' : `자네가 걸어온 길에서 조금씩 생명이 돌아오고 있네.<br><br>지금은 <strong>${ZONES[CHAPTERS[s.chapter].zone].name}</strong>에서 남은 흔적을 찾아주게. 위험하면 언제든 돌아오게나. 마을에서 쉬면 체력과 마력이 회복된다네.`;
    shell('ELION · ELDER OF GREENHAVEN', '장로 엘리온', `<div class="dialogue-symbol">${icon('leaf')}</div><div class="dialogue-text">${text}</div><div class="dialogue-footer"><span>${s.chapter === 0 ? '별의 흔적을 따라, 첫걸음' : '숲은 언제나 당신과 함께합니다'}</span><button class="primary-button" data-dialogue-continue>${s.chapter === 0 ? '숲을 도울게요' : s.chapter === 5 ? '이야기 마치기' : '다시 만나요'} ${icon('arrow')}</button></div>`);
  }
  else if (panel === 'death') { shell('A NEW DAWN AWAITS', '잠시 쉬어가도 괜찮아요', `<div class="death-symbol">${icon('camp')}</div><p class="dialogue-quote">숲의 정령이 당신을 마을로 데려다줍니다.<br>레벨과 장비, 퀘스트 진행 상황은 그대로 유지됩니다.</p><button class="primary-button centered" data-revive>마을에서 다시 일어나기 ${icon('arrow')}</button>`); $('.modal-close').classList.add('hidden'); }
  else if (panel === 'recovery') {
    shell('YOUR JOURNEY IS SAFE', '저장 기록 복구', `<p class="modal-intro">${game.loadResult.message}</p><p class="help-tip">복구 전에 읽을 수 없는 기록의 사본을 보관합니다. 이전 버전의 저장은 그대로 유지됩니다.</p><div class="recovery-options">${game.loadResult.legacy ? '<button class="primary-button" data-recover="legacy">이전 버전의 모험 복구</button>' : ''}<button class="secondary-button" data-recover="new">원본 보관 후 새 모험 시작</button><button class="text-button" data-recover="temporary">저장 없이 임시 플레이</button></div>`); $('.modal-close').classList.add('hidden');
  }
  else if (panel === 'new-game') shell('BEGIN AGAIN', '새로운 여행을 시작할까요?', `<p class="dialogue-quote">현재 캐릭터의 레벨, 장비, 이야기와 저장 기록이 초기화됩니다.</p><div class="panel-footer"><button class="secondary-button" data-panel="pause">돌아가기</button><button class="primary-button" data-confirm-new>새 게임 시작</button></div>`);
  if (previousPanel !== panel) modal.scrollTop = 0;
  modal.focus({ preventScroll: true });
}

const chapterNarration = [ '', '동물들의 눈에 서려 있던 보랏빛이 걷혔습니다. 풀잎 사이에서 발견한 별의 파편이 거인의 들판을 향해 떨립니다.', '거인들이 다시 평온을 찾았습니다. 마지막 대지의 파편에 잠긴 신전으로 가는 길이 새겨져 있습니다. 물 아래에서 오래된 노래가 들려옵니다.', '물과 그림자의 봉인이 풀렸습니다. 모든 파편이 하나가 되어 고대 용의 안식처를 비춥니다. 저주의 중심에, 상처 입은 용이 기다립니다.', '모르가스를 감싸던 어둠이 흩어지고, 고대 용이 조용히 고개를 숙입니다. 잊힌 숲에 처음으로 햇살이 내려앉습니다. 이제 마을로 돌아갈 시간입니다.' ];
function claimQuest() {
  const old = game.state.chapter; const beforeLevel = game.state.level;
  if (!completeQuest(game.state)) return;
  game.killNotice = false; game.save(); render(); game.sound.play('level');
  if (game.state.level > beforeLevel) handleEvent({ type: 'level', text: `레벨 ${game.state.level}` });
  activePanel = 'reward'; game.setPaused(true); $('#modal-backdrop').classList.remove('hidden');
  shell('CHAPTER COMPLETE', '숲이 당신을 기억합니다', `<div class="reward-symbol">${icon('spark')}</div><p class="dialogue-quote">${chapterNarration[old]}</p><div class="reward-prizes"><div><b>+${CHAPTERS[old].xp}</b><span>경험치</span></div><div><b>+${CHAPTERS[old].gold}</b><span>골드</span></div><div><b>+2</b><span>회복 물약</span></div></div><button class="primary-button centered" data-next-chapter>다음 여정으로 ${icon('arrow')}</button>`); modal.focus();
}

document.addEventListener('click', event => {
  const target = (event.target as Element).closest<HTMLElement>('button, a.brand, [data-travel]'); if (!target || !ready || (target instanceof HTMLButtonElement && target.disabled)) return;
  if (target.matches('a.brand')) { event.preventDefault(); closePanel(); }
  if (target.dataset.panel) openPanel(target.dataset.panel);
  if (target.dataset.quality) { game.setDisplay({ quality: target.dataset.quality as Quality }); openPanel('graphics'); }
  if (target.dataset.shake !== undefined) { game.setDisplay({ shake: Number(target.dataset.shake) }); openPanel('graphics'); }
  if (target.hasAttribute('data-reset-display')) { game.resetDisplay(); openPanel('graphics'); }
  if (target.dataset.action === 'lock') game.toggleTargetLock();
  if (target.hasAttribute('data-close')) closePanel();
  if (target.dataset.item) { game.equip(target.dataset.item as ItemId); openPanel('inventory'); }
  if (target.dataset.travel) { const zone = target.dataset.travel as Zone; if (!canTravel(game.state, zone)) { game.toast('이야기를 진행하고 권장 레벨을 달성하면 열립니다.'); return; } closePanel(); game.travel(zone); $('#welcome-card').classList.add('hidden'); }
  if (target.dataset.skill) game.skill(target.dataset.skill as Skill);
  if (target.dataset.action === 'attack') game.attack(); if (target.dataset.action === 'potion') game.potion(); if (target.dataset.action === 'interact') game.interact(); if (target.dataset.action === 'dodge') game.dodge(); if (target.dataset.action === 'claim') claimQuest();
  if (target.id === 'begin-btn') { $('#welcome-card').classList.add('hidden'); openPanel('dialogue'); }
  if (target.id === 'welcome-close') $('#welcome-card').classList.add('hidden');
  if (target.hasAttribute('data-dialogue-continue')) {
    if (game.state.chapter === 0) { game.state.chapter = 1; game.save(); toast('제1장 시작 · M 지도를 열어 속삭임의 숲으로 이동하세요.', true); }
    else if (game.state.chapter === 5) { game.state.chapter = 6; game.save(); toast('이야기 완료 · 숲의 수호자가 되었습니다!', true); }
    closePanel(); render();
  }
  if (target.hasAttribute('data-next-chapter')) { closePanel(); openPanel('map'); }
  if (target.hasAttribute('data-shop-visit')) { closePanel(); if (game.state.zone !== 'village') game.travel('village'); game.hero.position.set(-10, 0, 2.7); openPanel('shop'); }
  if (target.dataset.buyItem) { if (buyItem(game.state, target.dataset.buyItem as ItemId)) { game.save(); game.sound.play('click'); render(); openPanel('shop'); toast('구입 완료 · 가방에서 장착하세요.', true); } }
  if (target.dataset.difficulty) { if (setDifficulty(game.state, target.dataset.difficulty as Difficulty)) { game.save(); openPanel(activePanel); } }
  if (target.dataset.recover) {
    if (target.dataset.recover === 'temporary' || game.restore(target.dataset.recover === 'legacy' ? game.loadResult.legacy! : newGame())) { activePanel = ''; closePanel(); if (game.state.hp <= 0) openPanel('death'); render(); }
  }
  if (target.hasAttribute('data-buy-potion')) { if (buyPotion(game.state)) { game.save(); game.sound.play('click'); render(); openPanel('shop'); } }
  if (target.hasAttribute('data-buy-armor')) { if (upgradeArmor(game.state)) { game.save(); game.sound.play('level'); render(); openPanel('shop'); } }
  if (target.hasAttribute('data-revive')) { activePanel = ''; $('#modal-backdrop').classList.add('hidden'); game.revive(); }
  if (target.hasAttribute('data-new-game')) openPanel('new-game');
  if (target.hasAttribute('data-confirm-new')) {
    if (game.restore(newGame())) { $('#sound-btn').innerHTML = icon('sound'); $('#sound-btn').setAttribute('aria-label', '소리 끄기'); closePanel(); $('#welcome-card').classList.remove('hidden'); render(); }
  }
  if (target.id === 'sound-btn') { game.state.muted = !game.state.muted; game.sound.muted = game.state.muted; target.innerHTML = icon(game.state.muted ? 'muted' : 'sound'); target.setAttribute('aria-label', game.state.muted ? '소리 켜기' : '소리 끄기'); game.save(); if (!game.state.muted) game.sound.play('click'); }
  if (target.id === 'fullscreen-btn') { const action = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); action?.catch(() => toast('이 브라우저에서는 전체 화면을 사용할 수 없습니다.')); }
});
document.addEventListener('change', e => {
  const input = e.target; if (!(input instanceof HTMLInputElement) || !ready) return;
  if (input.dataset.display === 'aimZoom' || input.dataset.display === 'ambientMotion') game.setDisplay({ [input.dataset.display]: input.checked });
});
$('#modal-backdrop').addEventListener('click', e => { if (e.target === $('#modal-backdrop')) closePanel(); });
document.addEventListener('keydown', e => {
  if (!ready || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement) return;
  if (e.code === 'Escape') { if (activePanel) closePanel(); else openPanel('pause'); return; }
  if (activePanel) {
    if (e.code === 'Tab') { const focusable = [...modal.querySelectorAll<HTMLElement>('button:not([disabled]):not(.hidden), [tabindex="0"]')]; if (!focusable.length) return; const index = focusable.indexOf(document.activeElement as HTMLElement); e.preventDefault(); focusable[(index + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus(); }
    if (e.code === 'Enter' && (e.target as HTMLElement).dataset.travel) (e.target as HTMLElement).click();
    return;
  }
  const panel = ({ KeyC: 'character', KeyI: 'inventory', KeyM: 'map', KeyL: 'journal', Slash: 'help' } as Record<string, string>)[e.code];
  if (panel) { e.preventDefault(); openPanel(panel); }
});
for (const button of document.querySelectorAll<HTMLElement>('[data-hold]')) {
  button.addEventListener('pointerdown', e => { e.preventDefault(); if (ready && !game.paused) { game.keys.add(button.dataset.hold!); button.setPointerCapture(e.pointerId); } });
  const release = () => { if (ready) game.keys.delete(button.dataset.hold!); }; button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release);
}

// Defer scene creation by one frame so the loading view paints immediately.
requestAnimationFrame(() => {
  try {
    game = new Game($('#world'), { update: render, event: handleEvent, float: floating }); ready = true;
    $('#welcome-card').classList.toggle('hidden', game.state.chapter > 0); $('#sound-btn').innerHTML = icon(game.state.muted ? 'muted' : 'sound'); $('#sound-btn').setAttribute('aria-label', game.state.muted ? '소리 켜기' : '소리 끄기');
    updateZone(false); render(); game.save(); if (game.loadResult.status === 'blocked') openPanel('recovery'); else if (game.state.hp <= 0) openPanel('death'); if (game.loadResult.message && game.loadResult.status !== 'blocked') toast(game.loadResult.message, game.loadResult.status === 'migrated'); $('#loading').classList.add('finished'); setTimeout(() => $('#loading').remove(), 600);
    if (import.meta.env.DEV) (window as unknown as { __ELDERWOOD__: Game }).__ELDERWOOD__ = game;
  } catch (error) {
    console.error(error); $('#loading').innerHTML = `${icon('leaf')}<h1>숲을 불러오지 못했습니다</h1><p>WebGL 2를 지원하는 브라우저와 하드웨어 가속이 필요합니다.</p><button class="primary-button" id="reload-btn">다시 불러오기</button>`; $('#reload-btn').onclick = () => location.reload();
  }
});
if (import.meta.hot) import.meta.hot.dispose(() => { ready = false; game?.dispose(); });
