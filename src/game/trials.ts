import { gainXp, isSafeZone, WEAPONS, type SaveState, type Weapon } from './state';
import { TRIALS, TIERS, FORGE_COSTS, type TrialRun, type TrialKind } from './trial-data';
import type { Combat } from './combat';
export * from './trial-data';

export function trialProblem(s: SaveState, kind: TrialKind, tier: number): string | null {
  if (!Object.hasOwn(TRIALS, kind) || !Number.isInteger(tier) || tier < 1 || tier > TIERS.length) return '알 수 없는 도전입니다.';
  if (s.finale.step !== 6) return '마지막 이야기의 귀환을 마치면 열립니다.';
  if (!isSafeZone(s.zone)) return '마을이나 항구에서 도전을 준비하세요.';
  if (tier > s.trials.best[kind] + 1) return '이전 등급을 먼저 완료하세요.';
  if (s.level < TIERS[tier - 1].level) return `레벨 ${TIERS[tier - 1].level}부터 도전할 수 있습니다.`;
  if (s.hp <= 0) return '먼저 마을에서 다시 일어나세요.';
  return null;
}
export function beginTrial(s: SaveState, kind: TrialKind, tier: number): TrialRun | null {
  if (trialProblem(s, kind, tier)) return null;
  return { kind, tier, wave: 0, status: 'active', difficulty: s.difficulty, elapsed: 0 };
}
export function trialEncounter(run: TrialRun) {
  const tier = TIERS[run.tier - 1]; return { roster: [...TRIALS[run.kind].waves[run.wave]], hp: tier.hp, attack: tier.attack, trial: true };
}
export function finishTrialWave(run: TrialRun, battle: Combat) {
  if (run.status !== 'active' || !battle.encounter?.trial || !battle.alive || !battle.enemies.length || battle.enemies.some(e => e.hp > 0)) return false;
  run.status = run.wave + 1 < TRIALS[run.kind].waves.length ? 'between' : 'won'; return true;
}
export function nextTrialWave(run: TrialRun) {
  if (run.status !== 'between') return false;
  run.wave++; run.status = 'active'; return true;
}
export function trialReward(s: SaveState, run: TrialRun) {
  const first = run.tier > s.trials.best[run.kind]; return { first, marks: first ? 6 + run.tier * 4 + (run.kind === 'gauntlet' ? 4 : 0) : 2, xp: run.tier * 240, gold: run.tier * 100 };
}
export function claimTrial(s: SaveState, run: TrialRun) {
  if (s.finale.step !== 6 || run.status !== 'won') return null;
  const reward = trialReward(s, run); run.status = 'claimed';
  s.trials.best[run.kind] = Math.max(s.trials.best[run.kind], run.tier); s.trials.clears[run.kind] = Math.min(999999, s.trials.clears[run.kind] + 1);
  s.trials.marks = Math.min(999999, s.trials.marks + reward.marks); gainXp(s, reward.xp); s.gold = Math.min(9999999, s.gold + reward.gold);
  return reward;
}
export function forgeWeapon(s: SaveState, weapon: Weapon) {
  if (!Object.hasOwn(WEAPONS, weapon) || s.finale.step !== 6 || !isSafeZone(s.zone)) return false;
  const rank = s.trials.forge[weapon]; if (rank >= 3 || s.trials.marks < FORGE_COSTS[rank]) return false;
  s.trials.marks -= FORGE_COSTS[rank]; s.trials.forge[weapon]++; return true;
}
