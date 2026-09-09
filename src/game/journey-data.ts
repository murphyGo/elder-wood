import type { Zone, Species } from './state';
import type { ItemId } from './catalog';

export const MATERIALS = { wood: { name: '표류목', price: 12 }, iron: { name: '녹슬지 않은 철', price: 20 }, star: { name: '별의 가루', price: 40 }, heart: { name: '조수의 심장', price: 0 } } as const;
export type MaterialId = keyof typeof MATERIALS;
export const emptyMaterials = (): Record<MaterialId, number> => ({ wood: 0, iron: 0, star: 0, heart: 0 });
export function addMaterials(materials: Record<MaterialId, number>, reward: Partial<Record<MaterialId, number>>) {
  for (const [key, amount] of Object.entries(reward)) materials[key as MaterialId] = Math.min(999999, materials[key as MaterialId] + amount!);
}
export interface StorySite { name: string; zone: Zone; x: number; z: number; kind: 'clue' | 'npc' | 'rescue' | 'tide' | 'rune' | 'memory' | 'chest' | 'workshop'; text: string[]; step?: number }
export const STORY_SITES = {
  captain: { name: '선장 미라', zone: 'harbor', x: -6, z: 8, kind: 'npc', step: 1, text: ['강물이 검어지던 밤, 세 척의 배가 같은 등대 불빛을 따라 나갔어요. 돌아온 건 빈 구명정뿐이었죠.', '그물 창고와 부두의 항해일지, 해변에 밀려온 파편을 살펴봐 주세요. 바다가 남긴 흔적은 거짓말을 하지 않아요.'] },
  net: { name: '검게 물든 그물', zone: 'harbor', x: 9, z: 10, kind: 'clue', step: 1, text: ['그물은 찢어진 것이 아니라 안쪽에서 녹아 있다. 실 사이에 걸린 검은 결정은 숲에서 본 별의 파편과 닮았다.', '그런데 파편의 빛은 바다 쪽이 아닌, 오래된 등대를 향하고 있다.'] },
  log: { name: '젖은 항해일지', zone: 'harbor', x: -10, z: -6, kind: 'clue', step: 1, text: ['마지막 기록. “등대가 세 번 빛났다. 조개, 달, 별… 아버지가 가르쳐 준 귀항 신호와 순서가 같다.”', '“빛 아래에 커다란 그림자가 있었다. 우리를 공격한 것이 아니라, 배를 바위 밖으로 밀어내려는 것 같았다.”'] },
  shard: { name: '해변의 검은 파편', zone: 'harbor', x: 11, z: -9, kind: 'clue', step: 1, text: ['파편에 손을 대자 모르가스의 목소리가 들린다. “나는 하늘의 상처를 막았지만, 강을 따라 흘러간 조각까지 붙잡지는 못했다.”', '물결 속에서 희미한 사람 목소리가 들린다. 아직 살아 있다.'] },
  chart: { name: '등대지기의 조수표', zone: 'harbor', x: 7, z: -3, kind: 'clue', step: 2, text: ['난파선으로 가는 모래길은 썰물에 드러난다. 오래된 조수륜은 별빛에 반응해 잠시 바닷물을 붙잡아 둔다.', '도란이 만드는 별빛 등불을 들고 조수륜을 작동하자. 길은 서두르지 않아도 될 만큼 오래 열려 있다.'] },
  doran: { name: '조선공 도란', zone: 'harbor', x: 9, z: 3, kind: 'workshop', text: ['미라가 준비한 재료를 가져왔군. 표류목은 불빛을 품고, 철은 틀을 지탱하지. 별의 가루가 있으면 오래된 조수륜도 응답할 거야.', '내 작업대에서 등불을 만들게. 바다의 수호자를 구한다면 그가 남긴 심장으로 자네 무기도 벼려주겠네.'] },
  tide: { name: '남쪽 조수륜', zone: 'wreck', x: 4, z: 8, kind: 'tide', text: ['조수륜에 등불을 걸자 기어가 천천히 돌아간다. 물이 물러난 자리로 오래된 돌길이 드러난다.'] },
  tide_north: { name: '북쪽 조수륜', zone: 'wreck', x: 4, z: -7, kind: 'tide', text: ['양쪽 조수륜은 같은 물길에 연결되어 있다. 통로를 건넌 뒤에도 물높이를 조절할 수 있다.'] },
  ian: { name: '갇힌 선원 이안', zone: 'wreck', x: -9, z: -12, kind: 'rescue', step: 3, text: ['“세라가 아직 배에 있어요. 저는 로프를 타고 항구로 돌아갈 수 있어요. 제발 그 아이를 찾아주세요.”', '묶인 밧줄을 풀자 이안은 남은 구명줄을 붙잡는다. 멀리 항구에서 미라의 배가 응답한다.'] },
  sera: { name: '갇힌 선원 세라', zone: 'wreck', x: 8, z: -18, kind: 'rescue', step: 3, text: ['“커다란 상어가 우리 배를 삼키려는 줄 알았어요. 그런데 바위에 부딪히기 직전, 등에 태워 여기까지 데려다줬어요.”', '세라는 등대 열쇠를 건넨다. 구조 신호를 보내자 항구의 작은 배가 안개 속에서 다가온다.'] },
  rescue_report: { name: '미라에게 구조 보고', zone: 'harbor', x: -6, z: 8, kind: 'npc', step: 3, text: ['“두 사람 모두 돌아왔어요. 몇 번을 세어봐도 이번에는 빈자리가 없네요.” 미라는 잠시 말을 멈춘다.', '“세라가 건넨 열쇠는 옛 등대의 것이에요. 어쩌면 그 수호자는 아직 우리를 기다리고 있을지도 몰라요.”'] },
  inscription: { name: '등대의 비문', zone: 'wreck', x: -5, z: -19, kind: 'clue', step: 4, text: ['“바다가 낳은 조개, 조수를 이끄는 달, 집으로 인도하는 별. 그 순서로 이름을 불러라.”', '조개 → 달 → 별. 틀리면 처음부터 다시 부를 수 있다. 문양은 등대 앞 세 기둥에 새겨져 있다.'] },
  shell: { name: '조개 문양', zone: 'wreck', x: -5, z: -24, kind: 'rune', step: 4, text: ['조개 문양에서 낮고 따뜻한 소리가 울린다.'] },
  moon: { name: '달 문양', zone: 'wreck', x: 0, z: -24, kind: 'rune', step: 4, text: ['달 문양에서 물결 같은 빛이 피어난다.'] },
  star: { name: '별 문양', zone: 'wreck', x: 5, z: -24, kind: 'rune', step: 4, text: ['별 문양이 빛나며 꺼졌던 등대가 바다를 비춘다. 검은 물결 한가운데로 길이 열린다.'] },
  memory: { name: '수호자의 기억', zone: 'abyss', x: 0, z: -10, kind: 'memory', step: 6, text: ['어둠이 걷히자, 거대한 상어의 등에 오래된 상처가 보인다. 수많은 배를 바위에서 밀어내며 생긴 흔적이다.', '모르가스의 기억이 겹쳐진다. 두 수호자는 하늘과 바다에서 같은 봉인을 지켜 왔다. 그 봉인의 뿌리는 엘리온이 오래전 떠나온 하늘나무 아래에 있다.', '수호자는 작은 결정 세 개를 남기고 깊은 바다로 돌아간다. 심장은 상처가 아니라, 다시 지킬 수 있게 된 약속이었다.'] },
  harbor_return: { name: '미라와 마지막 인사', zone: 'harbor', x: -6, z: 8, kind: 'npc', step: 6, text: ['등대 아래에 모든 선원이 모여 있다. 이안은 그물을 고치고, 세라는 새 항해일지의 첫 줄을 적는다. “오늘, 바다가 우리를 돌려보냈다.”', '“엘리온에게 이 편지를 전해주세요.” 미라는 푸른 봉투를 건넨다. “이제 우리가 바다를 기억할 차례라고요.”', '당신은 강 상류를 바라본다. 숲 너머, 아직 보이지 않는 하늘나무가 조용히 기다리고 있다.'] },
  wood_cache: { name: '표류목 보급 상자', zone: 'harbor', x: 13, z: 7, kind: 'chest', text: ['표류목 5개를 챙겼다. 항구의 보급 창고에서 남은 재료도 구입할 수 있다.'] },
  iron_cache: { name: '철 보급 상자', zone: 'wreck', x: 11, z: -9, kind: 'chest', text: ['해수가 스며들지 않은 상자에서 철 5개와 별의 가루 2개를 발견했다.'] },
  herb: { name: '떨어진 약초 주머니', zone: 'forest', x: 8, z: 8, kind: 'clue', text: ['아이의 손글씨로 “리라”라고 적혀 있다. 안에는 동물의 상처를 치료하는 약초가 남아 있다.', '주머니 옆에 작은 발자국이 북쪽 야영지로 이어진다.'] },
  camp: { name: '야영지의 쪽지', zone: 'forest', x: -9, z: -7, kind: 'clue', text: ['“다친 토끼를 두고 갈 수 없어요. 북쪽 바위 뒤에서 비가 그치기를 기다릴게요. — 리라”', '약초사는 도망친 것이 아니었다. 저주에 물든 숲에서도 치료를 멈추지 않았던 것이다.'] },
  lyra: { name: '약초사 제자 리라', zone: 'forest', x: 4, z: -20, kind: 'rescue', text: ['“이 아이도 아파서 그랬던 거예요.” 리라가 토끼를 품에 안는다. 주변이 조용해지자 둘은 함께 일어난다.', '마을로 돌아갈 길을 알려주었다. 리라가 남긴 별의 가루가 손바닥 위에서 따뜻하게 빛난다.'] },
} as const satisfies Record<string, StorySite>;
export type StoryId = keyof typeof STORY_SITES;
export const STORY_FLAGS = [...Object.keys(STORY_SITES), 'lantern', 'beacon', 'leviathan_freed'] as const;
export type StoryFlag = StoryId | 'lantern' | 'beacon' | 'leviathan_freed';
export type Rune = 'shell' | 'moon' | 'star';
export interface JourneyState { step: number; flags: StoryFlag[]; runes: Rune[]; tide: 'high' | 'low' }
export const newJourney = (): JourneyState => ({ step: 0, flags: [], runes: [], tide: 'high' });
export interface JourneyQuest { title: string; subtitle: string; description: string; zone: Zone; objectives: StoryFlag[]; xp: number; gold: number; ending: string }
export const JOURNEY: JourneyQuest[] = [
  { title: '강이 전해온 편지', subtitle: '1막 이야기 완료 · 다음 여정', description: '엘리온에게 다시 말을 걸어 바다에서 온 편지를 받으세요.', zone: 'village', objectives: [], xp: 0, gold: 0, ending: '' },
  { title: '사라진 배들의 항구', subtitle: '2막 · 검은 조수 / 1', description: '선장 미라와 대화하고 항구의 그물·항해일지·파편을 조사하세요.', zone: 'harbor', objectives: ['captain', 'net', 'log', 'shard'], xp: 500, gold: 180, ending: '별의 저주가 강을 따라 바다로 흘러갔습니다. 아직 살아 있는 선원들을 구하기 위해 미라가 등불 재료를 내어줍니다.' },
  { title: '별빛을 담는 등불', subtitle: '2막 · 검은 조수 / 2', description: '조수표를 읽고 항구의 도란에게 별빛 등불을 제작하세요. 보상으로 받은 재료를 사용합니다.', zone: 'harbor', objectives: ['chart', 'lantern'], xp: 450, gold: 130, ending: '별빛 등불이 오래된 장치를 깨웁니다. 난파선 해안으로 향해 남쪽 조수륜을 작동하세요.' },
  { title: '돌아오지 않은 사람들', subtitle: '2막 · 검은 조수 / 3', description: '조수륜으로 썰물 길을 열고 선원 이안·세라를 구조한 뒤 항구의 미라에게 보고하세요.', zone: 'wreck', objectives: ['ian', 'sera', 'rescue_report'], xp: 800, gold: 240, ending: '두 선원이 항구로 돌아왔습니다. 그들을 지키려던 바다의 수호자에게도 도움이 필요합니다. 세라가 건넨 열쇠로 등대의 비문을 읽으세요.' },
  { title: '귀항을 부르는 세 이름', subtitle: '2막 · 검은 조수 / 4', description: '난파선 북쪽 등대의 비문을 읽고 세 문양을 올바른 순서로 작동하세요.', zone: 'wreck', objectives: ['inscription', 'beacon'], xp: 700, gold: 180, ending: '등대가 다시 빛납니다. 안개가 갈라지며 검은 조수의 제단으로 가는 길이 드러납니다.' },
  { title: '검은 조수의 심장', subtitle: '2막 · 검은 조수 / 5', description: '제단의 수호자 네리스를 별의 저주에서 해방하세요. 잠행 예고를 피하고 수면 위로 돌아온 순간을 노리세요.', zone: 'abyss', objectives: ['leviathan_freed'], xp: 1500, gold: 500, ending: '수호자의 등에 얽혀 있던 어둠이 흩어집니다. 남겨진 기억을 조사하고 항구로 돌아가세요.' },
  { title: '바다가 돌려준 약속', subtitle: '2막 · 검은 조수 / 에필로그', description: '제단에서 수호자의 기억을 읽고 항구의 미라와 이야기하세요.', zone: 'abyss', objectives: ['memory', 'harbor_return'], xp: 900, gold: 350, ending: '등대는 다시 배를 인도하고 선원들은 새로운 항해를 준비합니다. 다음 여정의 단서는 하늘나무의 뿌리, 그리고 엘리온의 오래된 기억에 있습니다.' },
  { title: '새벽을 되찾은 바다', subtitle: '2막 이야기 완료', description: '선원들이 돌아오고 등대가 켜졌습니다. 도란의 작업대에서 조수의 심장으로 새 무기를 제작할 수 있습니다.', zone: 'harbor', objectives: [], xp: 0, gold: 0, ending: '' },
];
export const FLAG_NAMES: Partial<Record<StoryFlag, string>> = { lantern: '별빛 등불 제작', beacon: '등대에 불 밝히기', leviathan_freed: '검은 조수의 네리스 해방' };
export const flagName = (flag: StoryFlag) => FLAG_NAMES[flag] ?? STORY_SITES[flag as StoryId]?.name ?? flag;
export const RECIPES = {
  lantern: { name: '별빛 등불', step: 2, gold: 60, materials: { wood: 2, iron: 2, star: 1 }, description: '조수륜과 등대 문양을 깨우는 여정의 등불입니다.' },
  tide_sword: { name: '등대지기의 검', step: 6, gold: 180, materials: { iron: 5, star: 2, heart: 1 }, description: '검의 받아치기로 동료를 지키는 바다의 수호자.' },
  tide_spear: { name: '해류의 삼지창', step: 6, gold: 180, materials: { wood: 3, iron: 5, heart: 1 }, description: '휩쓸기에 맞은 적의 발을 붙잡는 삼지창.' },
  tide_bow: { name: '새벽바다의 활', step: 6, gold: 180, materials: { wood: 5, star: 3, heart: 1 }, description: '도약 사격으로 적을 늦추는 푸른 활.' },
} as const;
export type RecipeId = keyof typeof RECIPES;
export const CRAFTED_ITEMS: ItemId[] = ['tide_sword', 'tide_spear', 'tide_bow'];
export const DROPS: Record<Species, Partial<Record<MaterialId, number>>> = { squirrel: { wood: 1 }, rabbit: { wood: 1 }, cow: { iron: 1 }, horse: { iron: 1 }, hippo: { iron: 2 }, tiger: { star: 1 }, shark: { star: 1 }, dragon: { star: 3 }, reef_shark: { iron: 1, star: 1 }, leviathan: { heart: 3, star: 3 } };
