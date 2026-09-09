export type Weapon = 'sword' | 'spear' | 'bow';
export type Skill = 'q' | 'e' | 'r' | 't';
export type Difficulty = 'story' | 'adventure' | 'veteran';
export type ItemEffect = 'none' | 'burn' | 'shield' | 'earth' | 'weaken' | 'chain' | 'frost';

export const WEAPONS = {
  sword: { name: '여행자의 검', type: '한손검', attack: 8, range: 3.2, delay: 0.48, description: '빠른 베기와 받아치기로 가까이서 싸웁니다.', icon: 'sword' },
  spear: { name: '수호자의 창', type: '장창', attack: 12, range: 4.8, delay: 0.72, description: '거리를 유지하며 직선의 적을 관통합니다.', icon: 'spear' },
  bow: { name: '숲지기의 활', type: '장궁', attack: 6, range: 17, delay: 0.65, description: '화살과 도약으로 안전한 거리를 만듭니다.', icon: 'bow' },
} as const;

export const ITEMS = {
  traveler_sword: { name: '여행자의 검', weapon: 'sword', attack: 8, price: 0, chapter: 0, effect: 'none', description: '빠르고 균형 잡힌 여행자의 검', color: '#d7d9be' },
  guardian_spear: { name: '수호자의 창', weapon: 'spear', attack: 12, price: 0, chapter: 0, effect: 'none', description: '긴 사거리와 묵직한 일격', color: '#d7d9be' },
  ranger_bow: { name: '숲지기의 활', weapon: 'bow', attack: 6, price: 0, chapter: 0, effect: 'none', description: '숲을 지키던 이들의 가벼운 장궁', color: '#d7d9be' },
  ember_sword: { name: '잿불 검', weapon: 'sword', attack: 12, price: 100, chapter: 2, effect: 'burn', description: '회전 베기: 3초간 초당 공격력 25%의 화상. 중첩 없이 갱신.', color: '#e5a274' },
  ward_sword: { name: '수호자의 검', weapon: 'sword', attack: 10, price: 240, chapter: 4, effect: 'shield', description: '받아치기 성공: 최대 체력 20%의 보호막을 5초간 생성.', color: '#b9cfa0' },
  earth_spear: { name: '대지파수꾼의 창', weapon: 'spear', attack: 15, price: 110, chapter: 2, effect: 'earth', description: '휩쓸기: 3초간 40% 둔화. 보스는 15% 둔화. 중첩 없이 갱신.', color: '#c9ba83' },
  dragon_spear: { name: '용비늘 창', weapon: 'spear', attack: 18, price: 260, chapter: 4, effect: 'weaken', description: '관통 일격: 4초간 대상이 받는 피해 20% 증가. 중첩 없이 갱신.', color: '#c6a6de' },
  storm_bow: { name: '폭풍깃 활', weapon: 'bow', attack: 9, price: 240, chapter: 4, effect: 'chain', description: '충전 관통 사격: 처음 맞힌 적 주변 최대 2명에게 공격력 70% 번개.', color: '#a7cbe4' },
  frost_bow: { name: '서리사냥꾼의 활', weapon: 'bow', attack: 10, price: 100, chapter: 2, effect: 'frost', description: '도약 사격: 3초간 40% 둔화. 보스는 15% 둔화. 중첩 없이 갱신.', color: '#a6dadd' },
  tide_sword: { name: '등대지기의 검', weapon: 'sword', attack: 24, price: 0, chapter: 6, effect: 'shield', description: '받아치기 성공: 체력 20% 보호막. 되찾은 조수의 심장으로 제작합니다.', color: '#8de0d7' },
  tide_spear: { name: '해류의 삼지창', weapon: 'spear', attack: 28, price: 0, chapter: 6, effect: 'earth', description: '휩쓸기: 3초간 40% 둔화, 보스는 15%. 조수의 심장으로 제작합니다.', color: '#86cfc9' },
  tide_bow: { name: '새벽바다의 활', weapon: 'bow', attack: 22, price: 0, chapter: 6, effect: 'frost', description: '도약 사격: 3초간 40% 둔화, 보스는 15%. 조수의 심장으로 제작합니다.', color: '#adcfe8' },
} as const satisfies Record<string, { name: string; weapon: Weapon; attack: number; price: number; chapter: number; effect: ItemEffect; description: string; color: string }>;
export type ItemId = keyof typeof ITEMS;
export const STARTER_ITEMS: Record<Weapon, ItemId> = { sword: 'traveler_sword', spear: 'guardian_spear', bow: 'ranger_bow' };

export interface SkillDefinition {
  id: string; name: string; level: number; mana: number; cooldown: number; icon: string;
  description: string; multiplier: number; range: number; angle?: number; width?: number; duration?: number;
}
export const SKILL_SETS: Record<Weapon, Record<'q' | 'e' | 'r', SkillDefinition>> = {
  sword: {
    q: { id: 'sword-triple', name: '삼연 베기', level: 2, mana: 14, cooldown: 5, icon: 'sword', multiplier: 0.8, range: 3.5, angle: 110, duration: 0.7, description: '전방 3.5m에 80% 피해를 3회. 회피로 취소할 수 있습니다.' },
    e: { id: 'sword-parry', name: '받아치기', level: 3, mana: 12, cooldown: 6, icon: 'shield', multiplier: 2.4, range: 4, angle: 140, duration: 0.85, description: '0.85초 동안 전방 직접 공격 1회를 막고 240% 반격. 지면·화상 제외.' },
    r: { id: 'sword-whirl', name: '회전 베기', level: 5, mana: 26, cooldown: 9, icon: 'whirl', multiplier: 2.8, range: 4.8, description: '주변 4.8m의 적에게 280% 피해.' },
  },
  spear: {
    q: { id: 'spear-dash', name: '돌진 찌르기', level: 2, mana: 14, cooldown: 5, icon: 'spear', multiplier: 2, range: 5, width: 0.9, duration: 0.3, description: '전방 5m로 돌진하며 경로의 적에게 200% 피해. 회피로 취소 가능.' },
    e: { id: 'spear-sweep', name: '휩쓸기', level: 3, mana: 15, cooldown: 6, icon: 'whirl', multiplier: 1.3, range: 4.8, angle: 150, description: '전방 150°의 적에게 130% 피해를 주고 밀어냅니다. 보스는 밀리지 않습니다.' },
    r: { id: 'spear-pierce', name: '관통 일격', level: 5, mana: 28, cooldown: 10, icon: 'spear', multiplier: 3.4, range: 9, width: 1, description: '전방 9m 직선상의 적을 관통해 340% 피해.' },
  },
  bow: {
    q: { id: 'bow-fan', name: '다중 사격', level: 2, mana: 14, cooldown: 5, icon: 'bow', multiplier: 0.85, range: 17, angle: 24, description: '부채꼴로 3발 발사. 화살마다 85% 피해, 가까운 적은 여러 발 명중 가능.' },
    e: { id: 'bow-retreat', name: '도약 사격', level: 3, mana: 12, cooldown: 6, icon: 'arrow', multiplier: 1.35, range: 17, duration: 0.3, description: '뒤로 4m 도약하며 135% 화살 발사. 도약 중에는 회피 효과가 없습니다.' },
    r: { id: 'bow-charge', name: '충전 관통 사격', level: 5, mana: 28, cooldown: 10, icon: 'bow', multiplier: 3.4, range: 20, width: 0.7, duration: 0.75, description: '0.75초 준비 후 340% 관통 화살. 회피·무기 교체 시 취소되며 자원은 반환되지 않습니다.' },
  },
};
export const HEAL_SKILL: SkillDefinition = { id: 'forest-heal', name: '숲의 치유', level: 3, mana: 22, cooldown: 10, icon: 'leaf', multiplier: 0.45, range: 0, description: '최대 체력의 45% 회복. 난이도에 따라 회복량이 달라집니다.' };
export const getSkill = (s: { weapon: Weapon }, key: Skill): SkillDefinition => key === 't' ? HEAL_SKILL : SKILL_SETS[s.weapon][key];
export const SKILL_KEYS: Skill[] = ['q', 'e', 'r', 't'];

export const DIFFICULTIES = {
  story: { name: '이야기', hp: 0.8, damage: 0.65, telegraph: 1.35, recovery: 1.2, healing: 1.25, description: '여유로운 공격 예고와 회복으로 이야기에 집중합니다.' },
  adventure: { name: '모험', hp: 1, damage: 1, telegraph: 1, recovery: 1, healing: 1, description: '거리와 회피, 무기별 스킬을 활용하는 기본 난이도.' },
  veteran: { name: '숙련자', hp: 1.12, damage: 1.22, telegraph: 0.85, recovery: 0.85, healing: 0.85, description: '빠른 반격과 추가 연계, 제한적인 회복에 대응합니다.' },
} as const;
export const freshCooldowns = () => ({ attack: 0, q: 0, e: 0, r: 0, t: 0, potion: 0, dodge: 0 });
export type Cooldowns = ReturnType<typeof freshCooldowns>;
