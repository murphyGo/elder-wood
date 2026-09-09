import { CHAPTERS, gainXp, type SaveState, type Zone, type ItemId } from './state';
import { STORY_SITES, MATERIALS, addMaterials, RECIPES, JOURNEY, flagName, type StoryId, type StoryFlag, type RecipeId, type MaterialId, type Rune } from './journey-data';
import { distance, type Point } from './geometry';
import { FINALE } from './finale-data';
export * from './journey-data';

export const currentQuest = (s: SaveState) => s.chapter === 6 ? s.journey.step === 7 && s.finale.step > 0 ? FINALE[s.finale.step] : s.journey.step === 7 ? { ...JOURNEY[7], zone: 'village' as const, description: '새벽을 되찾은 바다를 뒤로하고, 마을의 엘리온에게 마지막 여정을 받으세요.' } : JOURNEY[s.journey.step] : CHAPTERS[s.chapter];
export const journeyReady = (s: SaveState) => s.chapter === 6 && JOURNEY[s.journey.step].objectives.length > 0 && JOURNEY[s.journey.step].objectives.every(f => s.journey.flags.includes(f));
export const journeyRows = (s: SaveState) => JOURNEY[s.journey.step].objectives.map(flag => ({ name: flagName(flag), done: s.journey.flags.includes(flag) }));
export function beginJourney(s: SaveState, position: Point) {
  if (s.chapter !== 6 || s.journey.step !== 0 || s.zone !== 'village' || distance(position, { x: -2.8, z: 5.7 }) > 4.4) return false;
  s.journey.step = 1; return true;
}
export function completeJourney(s: SaveState) {
  if (!journeyReady(s)) return false;
  const q = JOURNEY[s.journey.step]; gainXp(s, q.xp); s.gold += q.gold; s.potions += 2;
  if (s.journey.step === 1) addMaterials(s.materials, { wood: 3, iron: 3, star: 2 });
  s.journey.step++; return true;
}
export const recipeOwned = (s: SaveState, id: RecipeId) => id === 'lantern' ? s.journey.flags.includes('lantern') : s.ownedItems.includes(id);
export function craftingProblem(s: SaveState, id: RecipeId): string | null {
  if (!Object.hasOwn(RECIPES, id)) return '알 수 없는 제작품입니다.';
  const recipe = RECIPES[id];
  if (s.zone !== 'harbor') return '항구의 도란 작업대에서 제작할 수 있습니다.';
  if (s.journey.step < recipe.step) return `${recipe.step === 2 ? '항구 조사를 마친 뒤' : '네리스를 해방한 뒤'} 제작할 수 있습니다.`;
  if (recipeOwned(s, id)) return '이미 보유한 제작품입니다.';
  if (s.gold < recipe.gold) return '제작비가 부족합니다.';
  for (const [key, amount] of Object.entries(recipe.materials)) if (s.materials[key as MaterialId] < amount) return `${MATERIALS[key as MaterialId].name} 재료가 부족합니다.`;
  return null;
}
export function craft(s: SaveState, id: RecipeId, position: Point) {
  if (craftingProblem(s, id) || distance(position, STORY_SITES.doran) > 4.4) return false;
  const recipe = RECIPES[id]; s.gold -= recipe.gold;
  for (const [key, amount] of Object.entries(recipe.materials)) s.materials[key as MaterialId] -= amount;
  if (id === 'lantern') s.journey.flags.push('lantern'); else s.ownedItems.push(id as ItemId);
  return true;
}
export function buyMaterial(s: SaveState, id: MaterialId, position: Point) {
  if (!Object.hasOwn(MATERIALS, id) || s.zone !== 'harbor' || distance(position, STORY_SITES.doran) > 4.4) return false;
  const price = MATERIALS[id].price;
  if (!price || s.gold < price || s.materials[id] >= 999999) return false;
  s.gold -= price; s.materials[id]++; return true;
}

export interface StoryContext { zone: Zone; position: Point; enemies: { hp: number; pos: Point }[] }
export interface StoryResult { ok: boolean; changed: boolean; title: string; text: string[]; workshop?: boolean }
export function interactStory(s: SaveState, id: StoryId, context: StoryContext): StoryResult {
  const site = STORY_SITES[id];
  const result = (text: string[], ok = false, changed = false): StoryResult => ({ ok, changed, title: site?.name ?? '알 수 없는 흔적', text });
  if (!site || context.zone !== site.zone || s.zone !== site.zone || distance(context.position, site) > 3.5) return result(['가까이 다가가 F로 살펴보세요.']);
  const flags = s.journey.flags;
  const grant = (flag: StoryFlag) => { if (!flags.includes(flag)) flags.push(flag); };
  if (id === 'captain' && s.journey.step === 7) return result(['등대가 다시 배를 인도하고 있어요. 이안과 세라도 다음 항해를 준비하고 있죠.', '미라는 새 지도에 한 줄을 적습니다. “숲과 바다의 수호자가 머물렀던 항구.”'], true);
  if (site.kind === 'workshop') return { ...result([...site.text], true), workshop: true };
  if (['herb', 'camp', 'lyra'].includes(id)) {
    if (s.chapter < 1) return result(['장로에게 숲의 이야기를 먼저 들어보세요.']);
    if (id === 'lyra' && (!flags.includes('herb') || !flags.includes('camp'))) return result(['약초 주머니와 야영지의 쪽지를 먼저 조사해 리라가 이곳에 남은 이유를 알아보세요.']);
  } else if ('step' in site && s.journey.step < site.step) return result(['아직 이 흔적을 이해할 단서가 부족합니다. 모험 일지의 현재 목표를 따라가세요.']);
  if (site.kind === 'tide') {
    if (!flags.includes('lantern')) return result(['도란에게 별빛 등불을 제작해야 조수륜이 깨어납니다.']);
    // Never flood the passage while the player is standing on it.
    if (s.journey.tide === 'low' && Math.abs(context.position.z) < 4) return result(['통로에서 벗어난 뒤 밀물로 바꿀 수 있습니다.']);
    s.journey.tide = s.journey.tide === 'high' ? 'low' : 'high';
    return result([s.journey.tide === 'low' ? '썰물 · 가운데 돌길이 드러났습니다. 북쪽 난파선으로 건너가세요.' : '밀물 · 물길이 닫혔습니다. 조수륜을 다시 작동하면 언제든 길을 열 수 있습니다.'], true, true);
  }
  if (site.kind === 'rune') {
    if (flags.includes('beacon')) return result(['등대의 불빛이 바다를 비추고 있습니다.'], true);
    if (!flags.includes('inscription') || !flags.includes('lantern')) return result(['비문에서 순서를 읽고 별빛 등불로 문양을 깨우세요.']);
    const order: Rune[] = ['shell', 'moon', 'star'];
    if (id !== order[s.journey.runes.length]) { s.journey.runes = []; return result(['문양의 빛이 사그라듭니다. 조개 → 달 → 별 순서로 처음부터 다시 작동하세요.'], true, true); }
    s.journey.runes.push(id as Rune);
    if (s.journey.runes.length === 3) grant('beacon');
    return result([...site.text, flags.includes('beacon') ? '등대 복구 완료 · 일지에서 이야기 보상을 받으세요.' : `공명 ${s.journey.runes.length} / 3 · 다음은 ${s.journey.runes.length === 1 ? '달' : '별'} 문양입니다.`], true, true);
  }
  if (id === 'rescue_report' && (!flags.includes('ian') || !flags.includes('sera'))) return result(['이안과 세라를 모두 구조한 뒤 미라에게 돌아오세요.']);
  if (id === 'memory' && !flags.includes('leviathan_freed')) return result(['수호자를 먼저 저주에서 해방해야 기억을 읽을 수 있습니다.']);
  if (id === 'harbor_return' && !flags.includes('memory')) return result(['제단에서 수호자가 남긴 기억을 먼저 읽으세요.']);
  if (flags.includes(id)) return result([...site.text, site.kind === 'rescue' ? '이미 안전한 곳으로 돌아갔습니다.' : '일지에 기록한 흔적입니다.'], true);
  if (site.kind === 'rescue' && context.enemies.some(e => e.hp > 0 && distance(e.pos, site) < 6)) return result(['주변 6m 안의 몬스터를 먼저 해방해야 안전하게 구조할 수 있습니다.']);
  grant(id);
  if (id === 'wood_cache') addMaterials(s.materials, { wood: 5 });
  if (id === 'iron_cache') addMaterials(s.materials, { iron: 5, star: 2 });
  if (id === 'lyra') { gainXp(s, 140); s.gold += 90; addMaterials(s.materials, { wood: 2, star: 1 }); }
  return result([...site.text, ...(id === 'lyra' ? ['선택 이야기 완료 · 140 EXP · 90 G · 표류목 2 · 별의 가루 1'] : [])], true, true);
}

export function activeSite(s: SaveState, id: StoryId) {
  if (id === 'captain') return s.journey.step <= 2 || s.journey.step === 4 || s.journey.step === 5 || s.journey.step === 7;
  if (id === 'rescue_report') return s.journey.step === 3;
  if (id === 'harbor_return') return s.journey.step === 6;
  if (['ian', 'sera', 'lyra'].includes(id)) return !s.journey.flags.includes(id);
  return true;
}
