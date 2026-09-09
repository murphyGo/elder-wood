import { gainXp, type SaveState, type Zone } from './state';
import { distance, type Point } from './geometry';
import { FINALE, CHOICES, FINAL_SITES, type FinalSiteId, type EndingChoice } from './finale-data';
import type { StoryResult } from './journey';
export * from './finale-data';

export const finaleReady = (s: SaveState) => s.journey.step === 7 && FINALE[s.finale.step].objectives.length > 0 && FINALE[s.finale.step].objectives.every(f => s.finale.flags.includes(f));
const atElder = (s: SaveState, pos: Point) => s.zone === 'village' && distance(pos, { x: -2.8, z: 5.7 }) <= 4.4;
export function beginFinale(s: SaveState, pos: Point) {
  if (s.chapter !== 6 || s.journey.step !== 7 || s.finale.step !== 0 || !atElder(s, pos)) return false;
  s.finale.step = 1; return true;
}
export function completeFinale(s: SaveState) {
  if (!finaleReady(s)) return false;
  const q = FINALE[s.finale.step]; gainXp(s, q.xp); s.gold = Math.min(9999999, s.gold + q.gold); s.potions = Math.min(9999, s.potions + 2); s.finale.step++;
  return true;
}
export function finalHomecoming(s: SaveState, pos: Point) {
  if (s.finale.step !== 5 || !s.finale.flags.includes('seed') || !atElder(s, pos) || s.finale.flags.includes('home')) return false;
  s.finale.flags.push('home'); return true;
}
export function chooseEnding(s: SaveState, choice: EndingChoice, pos: Point) {
  if (!Object.hasOwn(CHOICES, choice) || s.chapter !== 6 || s.journey.step !== 7 || s.finale.step !== 3 || s.finale.choice || !s.finale.flags.includes('bridge') || s.zone !== 'ruins' || distance(pos, FINAL_SITES.covenant) > 3.5) return false;
  s.finale.choice = choice; s.finale.flags.push('choice', 'covenant'); return true;
}
export function interactFinale(s: SaveState, id: FinalSiteId, zone: Zone, pos: Point): StoryResult & { choose?: boolean } {
  const site = FINAL_SITES[id];
  const result = (text: string[], ok = false, changed = false) => ({ title: site?.name ?? '기억의 흔적', text, ok, changed });
  if (!Object.hasOwn(FINAL_SITES, id) || zone !== site.zone || s.zone !== site.zone || distance(pos, site) > 3.5) return result(['가까이 다가가 F로 살펴보세요.']);
  if (s.journey.step !== 7 || s.finale.step < site.step) return result(['모험 일지의 현재 목표를 먼저 완료하세요.']);
  if (id === 'covenant') return s.finale.choice ? result([`당신의 선택: ${CHOICES[s.finale.choice].name}`, CHOICES[s.finale.choice].description], true) : { ...result([...site.text], true), choose: true };
  if (s.finale.flags.includes(id)) return result([...site.text], true);
  s.finale.flags.push(id);
  if (['elion_ally', 'earth_song', 'sea_song'].every(f => s.finale.flags.includes(f as FinalSiteId)) && !s.finale.flags.includes('bridge')) s.finale.flags.push('bridge');
  return result([...site.text], true, true);
}
export function endingText(s: SaveState): string[] {
  if (!s.finale.choice) return [];
  return [CHOICES[s.finale.choice].description, s.finale.choice === 'renew' ? '엘리온과 아이들이 수호석을 둘러쌉니다. 이제 숲을 지키는 약속은 누구 한 사람의 짐이 아닙니다.' : '리라가 빛나는 꽃의 씨앗을 건넵니다. 미라의 배가 별빛을 싣고 떠나고, 엘리온은 오래 접어 두었던 지도를 펼칩니다.', '모르가스는 하늘에서, 네리스는 바다에서, 아스테르는 뿌리 아래에서 같은 새벽을 맞이합니다.', '당신에게는 돌아올 곳이 생겼습니다. 그리고 다시 떠날 수 있는 길도 남아 있습니다.'];
}
