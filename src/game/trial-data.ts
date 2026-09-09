import type { Species, Difficulty } from './state';
export const TRIALS = {
  dragon: { name: '모르가스의 기억', description: '지상·비행·별의 봉인을 다시 넘어서는 용의 시련', waves: [['dragon']] },
  leviathan: { name: '네리스의 기억', description: '돌진과 잠행을 견디는 바다의 시련', waves: [['leviathan']] },
  starwarden: { name: '아스테르의 기억', description: '공명 장치와 세 단계를 사용하는 뿌리의 시련', waves: [['starwarden']] },
  gauntlet: { name: '세 갈래 수호자의 길', description: '가시짐승과 호랑이 → 암초상어와 가시짐승 → 아스테르, 3연속 전투', waves: [['thornbeast', 'tiger'], ['reef_shark', 'thornbeast'], ['starwarden']] },
} as const satisfies Record<string, { name: string; description: string; waves: readonly (readonly Species[])[] }>;
export type TrialKind = keyof typeof TRIALS;
export const TIERS = [{ name: '첫 공명', hp: 1, attack: 1, level: 13 }, { name: '깊은 공명', hp: 1.25, attack: 1.12, level: 14 }, { name: '완전한 공명', hp: 1.55, attack: 1.25, level: 15 }] as const;
export interface TrialProgress { marks: number; best: Record<TrialKind, number>; clears: Record<TrialKind, number>; forge: { sword: number; spear: number; bow: number } }
export const newTrials = (): TrialProgress => ({ marks: 0, best: { dragon: 0, leviathan: 0, starwarden: 0, gauntlet: 0 }, clears: { dragon: 0, leviathan: 0, starwarden: 0, gauntlet: 0 }, forge: { sword: 0, spear: 0, bow: 0 } });
export interface TrialRun { kind: TrialKind; tier: number; wave: number; status: 'active' | 'between' | 'won' | 'claimed' | 'abandoned'; difficulty: Difficulty; elapsed: number }
export const FORGE_COSTS = [8, 14, 20];
