import type { Zone } from './state';

export const CHOICES = {
  renew: { name: '함께 봉인을 지킨다', ending: '함께 지키는 새벽', color: '#e4ca87', description: '수호자와 사람들이 봉인을 함께 돌봅니다. 마을에 황금빛 수호석이 세워지고 엘리온은 다음 수호자를 가르칩니다.', combat: '공명 장치: 보호막을 10초 해제하고 내 최대 체력 20%의 보호막을 얻습니다.' },
  release: { name: '별빛을 세계에 나눈다', ending: '모두에게 돌아간 별빛', color: '#9fd8c2', description: '별빛을 작은 씨앗으로 나누어 숲과 바다에 돌려줍니다. 마을에 빛나는 꽃이 피고 엘리온은 새로운 길을 여행합니다.', combat: '공명 장치: 보호막을 8초 해제하고 내 체력 18%와 마력 15를 회복합니다.' },
} as const;
export type EndingChoice = keyof typeof CHOICES;
interface FinalSite { name: string; zone: Zone; x: number; z: number; kind: 'memory' | 'ally' | 'switch' | 'choice'; step: number; text: string[] }
export const FINAL_SITES = {
  past: { name: '엘리온의 옛 기록', zone: 'ruins', x: -10, z: 14, kind: 'memory', step: 1, text: ['젊은 엘리온의 이름이 돌에 새겨져 있다. 그는 오래전 별빛을 모아 숲을 지키려 했다. 얼마 전 떨어진 별이 낡은 봉인을 흔들자, 한곳에 갇혀 상처가 된 빛이 숲과 강으로 흘러나왔다.', '“혼자 책임지는 것이 용기인 줄 알았다. 모르가스와 네리스에게 그 짐을 나누어 주고도, 나는 마을로 숨었다.”'] },
  sky_echo: { name: '하늘 수호자의 기억', zone: 'ruins', x: 10, z: 13, kind: 'memory', step: 1, text: ['모르가스의 날개가 유적 위로 펼쳐진다. “빛은 적이 아니다. 그것을 혼자 붙들려는 마음이 상처가 되었지.”', '용은 마지막 봉인의 안쪽에 아스테르가 남아 있다고 말한다. 뿌리의 수호자는 아직도 숲 전체의 아픔을 홀로 삼키고 있다.'] },
  sea_echo: { name: '바다 수호자의 기억', zone: 'ruins', x: 1, z: 6, kind: 'memory', step: 1, text: ['네리스의 노래가 돌바닥을 타고 흐른다. “돌아올 곳이 있는 자는 어둠 속에서도 길을 찾는다.”', '수호자들은 당신에게 명령하지 않는다. 함께 지킬 것인지, 모두에게 돌려줄 것인지 결정할 수 있도록 길을 내어 줄 뿐이다.'] },
  elion_ally: { name: '동행한 엘리온', zone: 'ruins', x: -9, z: 7, kind: 'ally', step: 2, text: ['“이번에는 나도 함께 가겠네.” 엘리온이 낡은 지팡이를 땅에 짚는다.', '“숲의 노래와 바다의 울림을 깨워 주게. 나는 이쪽에서 뿌리를 붙잡겠네. 자네에게 선택을 떠넘기고 뒤로 숨지는 않을 걸세.”'] },
  earth_song: { name: '숲의 공명석', zone: 'ruins', x: -5, z: 3, kind: 'switch', step: 2, text: ['손바닥 아래에서 작은 생명들의 심장 소리가 들린다. 숲에서 구한 동물들이 빛의 발자국으로 나타나 다리의 첫 뿌리를 잇는다.'] },
  sea_song: { name: '바다의 공명석', zone: 'ruins', x: 8, z: 4, kind: 'switch', step: 2, text: ['등불을 비추자 조수의 노래가 깨어난다. 미라와 선원들의 귀항 신호가 파도처럼 돌아온다.', '두 수호자의 빛과 엘리온의 힘이 합쳐지면 유적의 중앙 돌길이 열린다.'] },
  covenant: { name: '하늘나무의 서약', zone: 'ruins', x: 0, z: -19, kind: 'choice', step: 3, text: ['안쪽에서 아스테르의 고통이 전해진다. 별빛을 봉인해 함께 지킬 수도, 작은 씨앗으로 나누어 세계에 돌려줄 수도 있다.', '엘리온은 당신 곁에 선다. “어떤 길이든 혼자 걷게 하지 않겠네.”'] },
  seed: { name: '처음으로 맺힌 씨앗', zone: 'roots', x: 0, z: -12, kind: 'memory', step: 5, text: ['아스테르가 마지막 가시를 내려놓는다. 거대한 뿌리 사이에서 작은 씨앗 하나가 태어난다.', '그것은 저주를 물리친 증표가 아니라, 누군가의 아픔을 함께 나누겠다는 약속이다. 이제 엘리온과 함께 그린헤이븐으로 돌아갈 시간이다.'] },
} as const satisfies Record<string, FinalSite>;
export type FinalSiteId = keyof typeof FINAL_SITES;
export const FINAL_FLAGS = [...Object.keys(FINAL_SITES), 'bridge', 'choice', 'aster_freed', 'home'] as const;
export type FinalFlag = FinalSiteId | 'bridge' | 'choice' | 'aster_freed' | 'home';
export interface FinaleState { step: number; flags: FinalFlag[]; choice: EndingChoice | null }
export const newFinale = (): FinaleState => ({ step: 0, flags: [], choice: null });
export interface FinalQuest { title: string; subtitle: string; description: string; zone: Zone; objectives: FinalFlag[]; xp: number; gold: number; ending: string }
export const FINALE: FinalQuest[] = [
  { title: '아직 끝나지 않은 편지', subtitle: '마지막 여정', description: '2막을 마친 뒤 엘리온에게 말을 걸어 마지막 여정을 시작하세요.', zone: 'village', objectives: [], xp: 0, gold: 0, ending: '' },
  { title: '엘리온이 두고 온 이름', subtitle: '3막 · 하늘나무의 뿌리 / 1', description: '기억의 유적 남쪽에서 엘리온·하늘·바다의 기록 세 개를 읽으세요.', zone: 'ruins', objectives: ['past', 'sky_echo', 'sea_echo'], xp: 900, gold: 180, ending: '별의 저주는 한곳에 갇힌 빛의 상처였습니다. 엘리온은 도망쳤던 과거와 마주하고 당신 곁에 섭니다.' },
  { title: '혼자서는 건널 수 없는 길', subtitle: '3막 · 하늘나무의 뿌리 / 2', description: '엘리온과 대화하고 숲·바다의 공명석을 깨워 중앙 뿌리 다리를 복구하세요.', zone: 'ruins', objectives: ['elion_ally', 'earth_song', 'sea_song'], xp: 1100, gold: 220, ending: '구했던 생명들의 노래가 길이 되었습니다. 북쪽 서약석에서 봉인의 운명을 정하세요.' },
  { title: '빛을 맡길 곳', subtitle: '3막 · 하늘나무의 뿌리 / 3', description: '유적 북쪽의 하늘나무 서약에서 두 길을 살펴보고 선택을 확정하세요.', zone: 'ruins', objectives: ['choice'], xp: 800, gold: 200, ending: '엘리온이 당신의 결정을 받아들입니다. 하늘나무의 심장에서 아스테르를 해방하세요.' },
  { title: '마지막 수호자의 짐', subtitle: '3막 · 하늘나무의 뿌리 / 최종전', description: '아스테르를 해방하세요. 2단계 보호막은 주변 공명 장치를 F로 작동해 열 수 있습니다.', zone: 'roots', objectives: ['aster_freed'], xp: 1800, gold: 600, ending: '아스테르를 감싼 가시가 흩어집니다. 뿌리 사이의 씨앗을 읽고 엘리온에게 돌아가세요.' },
  { title: '돌아오는 사람들의 이야기', subtitle: '3막 · 귀환', description: '하늘나무의 씨앗을 읽은 뒤 마을의 엘리온과 마지막 인사를 나누세요.', zone: 'village', objectives: ['seed', 'home'], xp: 900, gold: 300, ending: '숲과 바다, 하늘의 이야기가 하나로 이어졌습니다.' },
  { title: '엘더우드의 새로운 아침', subtitle: '모든 이야기 완료', description: 'L 일지의 메아리의 회랑에서 보스 재도전·연속 전투와 공명 강화를 준비하세요.', zone: 'village', objectives: [], xp: 0, gold: 0, ending: '' },
];
export const finalFlagName = (flag: FinalFlag) => ({ choice: '봉인의 운명 선택', bridge: '뿌리 다리 복구', aster_freed: '아스테르 해방', home: '엘리온과 마지막 인사' } as Partial<Record<FinalFlag, string>>)[flag] ?? FINAL_SITES[flag as FinalSiteId]?.name ?? flag;
export const ROOT_ANCHORS = [{ x: -7, z: -5 }, { x: 7, z: -5 }, { x: 0, z: 4 }];
