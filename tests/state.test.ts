import { describe, it, expect } from 'vitest';
import { newGame, xpRequired, gainXp, maxHp, maxMp, attackPower, defense, recordKill, completeQuest, questReady, canTravel, parseSave, useSkill, usePotion, upgradeArmor, buyPotion, CHAPTERS, MONSTERS, type Species } from '../src/game/state';

describe('character progression', () => {
  it('requires increasing XP and carries excess XP across multiple levels', () => {
    const s = newGame(); const amount = xpRequired(1) + xpRequired(2) + 9;
    expect(gainXp(s, amount)).toBe(2); expect(s.level).toBe(3); expect(s.xp).toBe(9);
    expect(s.hp).toBe(156); expect(s.mp).toBe(84); expect(attackPower(s)).toBe(28);
    for (let i = 1; i < 49; i++) expect(xpRequired(i + 1)).toBeGreaterThan(xpRequired(i));
  });
  it('awards a kill exactly through the kill record and grants its rewards', () => {
    const s = newGame(); recordKill(s, 'rabbit'); expect(s.kills.rabbit).toBe(1); expect(s.totalKills).toBe(1); expect(s.xp).toBe(28); expect(s.gold).toBe(70);
  });
  it('caps levels and safely round trips level 50', () => {
    const s = newGame(); gainXp(s, 100000000); expect(s.level).toBe(50); expect(s.xp).toBeLessThan(xpRequired(50)); expect(parseSave(JSON.stringify(s)).level).toBe(50);
  });
});
describe('a complete playable story', () => {
  it('keeps later regions locked until the appropriate chapter and level', () => {
    const s = newGame(); expect(canTravel(s, 'village')).toBe(true); expect(canTravel(s, 'forest')).toBe(false); s.chapter = 2; expect(canTravel(s, 'plains')).toBe(false); gainXp(s, 300); expect(canTravel(s, 'plains')).toBe(true); expect(canTravel(s, 'depths')).toBe(false);
  });
  it('provides enough quest XP to enter every subsequent story zone without extra grinding', () => {
    const s = newGame(); s.chapter = 1;
    for (let chapter = 1; chapter <= 4; chapter++) {
      expect(canTravel(s, CHAPTERS[chapter].zone), `entry to chapter ${chapter} at level ${s.level}`).toBe(true);
      for (const [type, count] of Object.entries(CHAPTERS[chapter].objectives)) for (let i = 0; i < count!; i++) recordKill(s, type as Species);
      expect(questReady(s)).toBe(true); expect(completeQuest(s)).toBe(true); expect(s.chapter).toBe(chapter + 1); expect(s.kills).toEqual({}); expect(completeQuest(s)).toBe(false);
    }
    expect(s.chapter).toBe(5); expect(canTravel(s, 'village')).toBe(true); expect(s.potions).toBe(13);
  });
  it('does not complete quests with partial or unrelated kills', () => {
    const s = newGame(); s.chapter = 1; recordKill(s, 'dragon'); recordKill(s, 'rabbit'); expect(questReady(s)).toBe(false); expect(completeQuest(s)).toBe(false);
  });
});
describe('combat resources and equipment', () => {
  it('enforces skill level, cooldown, and mana without consuming resources on failure', () => {
    const s = newGame(); expect(useSkill(s, 'q', 0)).toContain('레벨 2'); expect(s.mp).toBe(60);
    gainXp(s, 60); expect(useSkill(s, 'q', 1)).toContain('준비'); expect(s.mp).toBe(maxMp(s));
    s.mp = 13; expect(useSkill(s, 'q', 0)).toContain('부족'); expect(s.mp).toBe(13);
    s.mp = 30; expect(useSkill(s, 'q', 0)).toBe(null); expect(s.mp).toBe(16);
  });
  it('heals to the HP cap and refuses wasteful potions and healing', () => {
    const s = newGame(); expect(usePotion(s)).toBe(false); expect(s.potions).toBe(5);
    s.hp = 70; expect(usePotion(s)).toBe(true); expect(s.hp).toBe(100); expect(s.potions).toBe(4);
    gainXp(s, 300); expect(useSkill(s, 't', 0)).toContain('가득'); s.hp = 1; const hp = maxHp(s); expect(useSkill(s, 't', 0)).toBe(null); expect(s.hp).toBe(1 + hp * 0.45);
  });
  it('charges gold for armor and potions and prevents excessive armor upgrades', () => {
    const s = newGame(); expect(upgradeArmor(s)).toBe(false); expect(s.gold).toBe(60);
    expect(buyPotion(s)).toBe(true); expect(s.gold).toBe(40); expect(s.potions).toBe(6);
    s.gold = 500; expect(upgradeArmor(s)).toBe(true); expect(s.gold).toBe(420); expect(s.hp).toBe(120); expect(defense(s)).toBe(6);
    expect(upgradeArmor(s)).toBe(true); expect(upgradeArmor(s)).toBe(true); expect(upgradeArmor(s)).toBe(false); expect(s.armor).toBe(3); expect(s.gold).toBe(20);
  });
  it('gives different weapons different power and range', () => {
    const s = newGame(); expect(attackPower(s)).toBe(18); s.weapon = 'spear'; expect(attackPower(s)).toBe(22); s.weapon = 'bow'; expect(attackPower(s)).toBe(16);
    expect(Object.keys(MONSTERS)).toHaveLength(10);
  });
});
describe('save integrity', () => {
  it('round trips a progressed character', () => {
    const s = newGame(); gainXp(s, 1500); s.chapter = 3; s.zone = 'depths'; s.weapon = 'spear'; s.armor = 2; s.kills.tiger = 1; s.muted = true;
    expect(parseSave(JSON.stringify(s))).toEqual(s);
  });
  it('recovers corrupted saves and validates untrusted stored values', () => {
    expect(parseSave('not json')).toEqual(newGame()); expect(parseSave('null')).toEqual(newGame()); expect(parseSave('{"version":2}')).toEqual(newGame());
    const s = parseSave(JSON.stringify({ version: 1, level: 999, xp: -50, hp: -1, mp: 99999, chapter: 999, weapon: '__proto__', zone: 'not-a-zone', potions: -5, armor: 50, kills: { dragon: -2, rabbit: '99', cow: 1.5 } }));
    expect(s.level).toBe(50); expect(s.hp).toBe(0); expect(s.mp).toBe(maxMp(s)); expect(s.chapter).toBe(6); expect(s.weapon).toBe('sword'); expect(s.zone).toBe('village'); expect(s.potions).toBe(0); expect(s.armor).toBe(3); expect(s.kills).toEqual({ cow: 1, dragon: 0 });
  });
  it('returns a character saved in a locked zone to the village', () => { const s = newGame(); s.zone = 'sanctum'; expect(parseSave(JSON.stringify(s)).zone).toBe('village'); });
});
