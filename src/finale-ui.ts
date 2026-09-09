import { WEAPONS, DIFFICULTIES, isSafeZone, type SaveState, type Weapon } from './game/state';
import { FINALE, FINAL_SITES, CHOICES, finalFlagName, endingText, type EndingChoice } from './game/finale';
import { TRIALS, TIERS, FORGE_COSTS, trialProblem, trialReward, type TrialKind, type TrialRun } from './game/trials';
import { icon } from './icons';

export function finaleObjectivesHTML(s: SaveState) {
  if (s.finale.step === 0) return `<div class="objective">${icon('pin')}<span>마을의 엘리온에게 마지막 여정 받기</span></div>`;
  if (s.finale.step === 6) return `<div class="objective complete">${icon('check')}<span>${CHOICES[s.finale.choice!].ending}</span></div>`;
  return FINALE[s.finale.step].objectives.map(flag => `<div class="objective ${s.finale.flags.includes(flag) ? 'complete' : ''}"><span class="objective-dot">${s.finale.flags.includes(flag) ? icon('check') : ''}</span><span>${finalFlagName(flag)}</span></div>`).join('');
}
export function finaleJournalHTML(s: SaveState) {
  if (s.journey.step < 7) return '';
  return `<div class="modal-section-title">하늘나무의 뿌리 <span>${s.finale.step === 6 ? '최종장 완료' : s.finale.step ? '진행 중' : '마을의 엘리온에게 시작'}</span></div><div class="chapter-timeline">${FINALE.slice(1, 6).map((q, i) => `<div class="${i + 1 < s.finale.step ? 'done' : i + 1 === s.finale.step ? 'current' : ''}"><span>${i + 1 < s.finale.step ? icon('check') : i + 1}</span><div><small>${q.subtitle}</small><b>${q.title}</b></div></div>`).join('')}</div>${s.finale.choice ? `<div class="ending-record"><span class="chapter-label">당신이 남긴 약속</span><h3>${CHOICES[s.finale.choice].name}</h3><p>${CHOICES[s.finale.choice].combat}</p>${s.finale.step === 6 ? endingText(s).map(t => `<p>${t}</p>`).join('') : ''}</div>` : ''}<div class="story-records">${Object.entries(FINAL_SITES).filter(([id]) => s.finale.flags.includes(id as keyof typeof FINAL_SITES)).map(([, site]) => `<details><summary>${site.name}</summary>${site.text.map(t => `<p>${t}</p>`).join('')}</details>`).join('')}</div>${s.finale.step === 6 ? `<button class="primary-button centered" data-panel="trials">${icon('spark')} 메아리의 회랑 · 도전과 강화</button>` : ''}`;
}
export function choiceHTML(selected?: EndingChoice) {
  if (selected) {
    const choice = CHOICES[selected];
    return `<div class="ending-record"><h3>${choice.name}</h3><p>${choice.description}</p><p class="help-tip">${choice.combat}</p></div><p class="modal-footnote">확정하면 이 모험의 선택으로 저장됩니다. 두 길 모두 최종 결말과 같은 이야기 보상을 받을 수 있습니다.</p><div class="panel-footer"><button class="secondary-button" data-panel="choice">두 길 다시 살펴보기</button><button class="primary-button" data-choice-confirm="${selected}">이 약속으로 나아가기 ${icon('arrow')}</button></div>`;
  }
  return `<p class="dialogue-quote">“어떤 길이든 혼자 걷게 하지 않겠네.”</p><p class="modal-intro">한곳에 모인 별빛을 어떻게 돌볼지 결정하세요. 선택은 최종 전투의 공명 효과와 엔딩 후 마을 풍경에 남습니다.</p><div class="ending-choices">${Object.entries(CHOICES).map(([id, choice]) => `<article style="--choice-color:${choice.color}"><span class="choice-symbol">${icon(id === 'renew' ? 'shield' : 'leaf')}</span><h3>${choice.name}</h3><p>${choice.description}</p><small>${choice.combat}</small><button class="secondary-button" data-choice-preview="${id}">이 길 살펴보기 ${icon('arrow')}</button></article>`).join('')}</div>`;
}
export function elionFinaleText(s: SaveState) {
  if (s.finale.step === 0) return '하늘나무의 이름을 들었겠지. 별빛을 한곳에 모아 숲을 지키려 했던 사람이 바로 나였네.<br><br>모르가스와 네리스에게 짐을 맡기고 돌아선 뒤, 마지막 수호자 아스테르가 뿌리 아래에 남았지. 오늘은 그에게 돌아가려 하네.<br><br>자네가 구한 이들의 노래가 길을 열어 줄 걸세. 나와 함께 <strong>하늘나무의 기억</strong>으로 가 주겠나?';
  if (s.finale.step >= 5) return endingText(s).map(t => `<p>${t}</p>`).join('') + (s.finale.step === 5 ? '<p>씨앗을 읽고 돌아왔다면 일지에서 마지막 이야기 보상을 받게. 우리가 걸어온 길을 오래 기억하겠네.</p>' : '<p>새벽에도 모험은 계속되지. L 일지에서 메아리의 회랑에 도전할 수 있네.</p>');
  return '기억의 유적에서 자네를 기다리겠네. 내 기록과 두 수호자의 목소리를 읽고 숲과 바다의 공명석을 깨워 주게.<br><br>아스테르의 보호막은 힘만으로 깨지지 않네. 우리가 이어 놓은 공명 장치 곁에서 <kbd>F</kbd>를 누르게.';
}
export function trialsHTML(s: SaveState, run?: TrialRun) {
  if (run && ['active', 'between', 'won'].includes(run.status)) {
    const trial = TRIALS[run.kind], reward = trialReward(s, run);
    return `<span class="chapter-label">${TIERS[run.tier - 1].name} · ${DIFFICULTIES[run.difficulty].name}</span><h3>${trial.name}</h3><p class="modal-intro">전투 ${run.wave + 1} / ${trial.waves.length} · ${Math.floor(run.elapsed / 60)}분 ${Math.floor(run.elapsed % 60)}초</p>${run.status === 'won' ? `<div class="reward-symbol">${icon('spark')}</div><p class="dialogue-quote">기억 속 수호자가 당신의 성장을 인정합니다.</p><div class="reward-prizes"><div><b>+${reward.marks}</b><span>공명의 인장 · ${reward.first ? '등급 첫 완료' : '재도전'}</span></div><div><b>+${reward.xp}</b><span>경험치</span></div><div><b>+${reward.gold}</b><span>골드</span></div></div><button class="primary-button centered" data-trial-claim>보상 받고 마을로 ${icon('arrow')}</button>` : run.status === 'between' ? '<p class="help-tip">이번 전투를 넘었습니다. 남은 체력·마력·물약으로 다음 전투를 준비하세요. 자동으로 전부 회복되지는 않습니다.</p><button class="primary-button centered" data-trial-next>다음 전투 시작 →</button>' : '<p class="help-tip">모든 전투를 마친 뒤 보상을 받으세요. 몬스터마다 별도 보상은 지급되지 않습니다.</p><button class="primary-button centered" data-close>전투로 돌아가기 →</button>'}<p class="modal-footnote">지역 이동·사망·새로고침으로 도전을 종료하면 미수령 보상과 이번 전투 진행은 사라집니다. 이미 받은 인장과 강화는 유지됩니다.</p><button class="text-button centered" data-travel="village">도전을 그만두고 마을로</button>`;
  }
  if (s.finale.step !== 6) return '<p class="modal-intro">최종장의 귀환을 마치면 기억 속 수호자들이 이 문을 열어 줍니다.</p>';
  return `<p class="modal-intro">수호자와 다시 겨루거나 세 전투를 연속으로 넘으세요. 각 도전은 이전 등급을 완료하면 다음 등급이 열립니다.</p><div class="inventory-summary"><span>공명의 인장</span><b>${icon('spark')} ${s.trials.marks}</b></div>${!isSafeZone(s.zone) ? '<p class="help-tip">마을이나 항구에서 도전을 시작하고 무기를 강화할 수 있습니다.</p><button class="secondary-button" data-travel="village">마을로 돌아가기 →</button>' : ''}<div class="trial-list">${Object.entries(TRIALS).map(([id, trial]) => `<article class="trial-card"><h3>${trial.name}</h3><p>${trial.description}</p><small>최고 ${s.trials.best[id as TrialKind]}등급 · 완료 ${s.trials.clears[id as TrialKind]}회</small><div class="trial-tiers">${TIERS.map((tier, i) => {
    const problem = trialProblem(s, id as TrialKind, i + 1);
    return `<button class="secondary-button" data-trial-start="${id}" data-tier="${i + 1}" ${problem ? 'disabled' : ''} title="${problem ?? `${tier.name} 시작`}"><b>${i + 1}. ${tier.name}</b><small>${problem ?? `Lv. ${tier.level} · 체력 ×${tier.hp} · 공격 ×${tier.attack}`}</small></button>`;
  }).join('')}</div></article>`).join('')}</div><p class="modal-footnote">등급별 첫 완료: 인장 10 / 14 / 18개 (연속 전투는 +4). 반복 완료: 2개. 경험치 240 / 480 / 720, 골드 100 / 200 / 300은 매번 받습니다. 선택한 모험 난이도가 전투에 함께 적용됩니다.</p><div class="modal-section-title">공명 강화 <span>무기 종류마다 최대 +3</span></div><div class="forge-list">${Object.entries(WEAPONS).map(([id, w]) => {
    const rank = s.trials.forge[id as Weapon], cost = FORGE_COSTS[rank];
    return `<div class="shop-item"><div class="detail-icon">${icon(w.icon)}</div><div><h3>${w.type} 공명 +${rank}</h3><p>해당 종류의 모든 무기 공격력 +${rank * 4}</p></div><button class="secondary-button" data-forge="${id}" ${rank >= 3 || !isSafeZone(s.zone) || s.trials.marks < cost ? 'disabled' : ''}>${rank >= 3 ? '최대 강화' : `인장 ${cost} · 강화 +4`}</button></div>`;
  }).join('')}</div><p class="modal-footnote">시작한 도전은 지역 이동·사망·새로고침으로 종료됩니다. 보급을 마친 뒤 입장하세요.</p>`;
}
