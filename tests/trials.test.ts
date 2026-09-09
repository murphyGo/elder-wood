import { describe, it, expect } from 'vitest';
import { Combat, SEALS } from '../src/game/combat';
import { ROOT_ANCHORS } from '../src/game/finale';
import { beginTrial, finishTrialWave, nextTrialWave, claimTrial, trialEncounter, trialProblem, forgeWeapon, TIERS, TRIALS, type TrialKind } from '../src/game/trials';
import { attackPower, maxHp, newGame, MONSTERS, DIFFICULTIES, canTravel, type Difficulty, type Weapon } from '../src/game/state';
import { createEnvironment, disposeEnvironment } from '../src/game/world';
import { finalState } from './helpers/finale-state';
import { fight } from './helpers/fight';

// Boundary tests finish phases directly; balance tests below use only live controls.
function finish(c: Combat) {
  for (const e of c.enemies) for (let i = 0; e.hp > 0 && i < 10; i++) {
    e.phaseTime = 3;
    if (e.species === 'dragon' && e.bossPhase === 3) { Object.assign(c.player, SEALS[0]); c.activateSeal(0); }
    if (e.species === 'starwarden' && e.bossPhase === 2) { Object.assign(c.player, ROOT_ANCHORS[0]); c.activateRoot(0); }
    c.hit(e, 999999);
  }
}
describe('repeatable memories and fair rewards', () => {
  it('gates trials by ending, safe region, sequential tier and level', () => {
    expect(beginTrial(newGame(),'dragon',1)).toBeNull(); const s = finalState();
    expect(canTravel(s,'trial')).toBe(false); expect(beginTrial(s,'dragon',2)).toBeNull(); expect(beginTrial(s,'dragon',NaN)).toBeNull();
    expect(beginTrial(s,'__proto__' as TrialKind,1)).toBeNull(); s.zone = 'roots'; expect(beginTrial(s,'dragon',1)).toBeNull();
    s.zone = 'village'; s.level = 12; expect(trialProblem(s,'dragon',1)).toContain('13'); s.level = 13; expect(beginTrial(s,'dragon',1)).not.toBeNull();
    s.hp = 0; expect(beginTrial(s,'dragon',1)).toBeNull();
  });
  it.each(Object.keys(TRIALS) as TrialKind[])('grants %s rewards only once, keeps story kills intact, and unlocks the next tier', kind => {
    const s = finalState(), run = beginTrial(s,kind,1)!, before = structuredClone(s);
    expect(claimTrial(s,run)).toBeNull();
    for (let wave = 0; wave < TRIALS[kind].waves.length; wave++) {
      const c = new Combat(s,'trial',[],false,trialEncounter(run));
      expect(finishTrialWave(run,c)).toBe(false); expect(nextTrialWave(run)).toBe(false); finish(c);
      expect(s).toEqual(before); expect(finishTrialWave(run,c)).toBe(true); expect(finishTrialWave(run,c)).toBe(false);
      for (let i = 0; i < 500; i++) c.tick(.05); expect(c.enemies.every(e => e.hp === 0)).toBe(true); s.hp = before.hp; s.mp = before.mp; s.playTime = before.playTime;
      if (wave + 1 < TRIALS[kind].waves.length) { expect(claimTrial(s,run)).toBeNull(); expect(nextTrialWave(run)).toBe(true); }
    }
    const reward = claimTrial(s,run); expect(reward).toEqual({ first:true, marks:kind === 'gauntlet' ? 14 : 10, xp:240, gold:100 });
    expect(s.trials.best[kind]).toBe(1); expect(s.trials.clears[kind]).toBe(1); expect(claimTrial(s,run)).toBeNull();
    expect(s.kills).toEqual(before.kills); expect(s.totalKills).toBe(before.totalKills); expect(s.materials).toEqual(before.materials); expect(s.finale).toEqual(before.finale);
    expect(beginTrial(s,kind,2)).not.toBeNull(); expect(beginTrial(s,kind,3)).toBeNull();
    const repeat = beginTrial(s,kind,1)!;
    for (let wave = 0; wave < TRIALS[kind].waves.length; wave++) { const c = new Combat(s,'trial',[],false,trialEncounter(repeat)); finish(c); finishTrialWave(repeat,c); if (repeat.status === 'between') nextTrialWave(repeat); }
    expect(claimTrial(s,repeat)?.marks).toBe(2); expect(s.trials.clears[kind]).toBe(2);
  });
  it('preserves supplies and cooldowns between waves and cannot pay abandoned or failed runs', () => {
    const s = finalState(), run = beginTrial(s,'gauntlet',1)!; s.hp = 77; s.mp = 33; s.cooldowns.q = 5; s.potions = 2;
    const c = new Combat(s,'trial',[],false,trialEncounter(run)); finish(c); finishTrialWave(run,c); nextTrialWave(run);
    const next = new Combat(s,'trial',[],false,trialEncounter(run)); expect(s).toMatchObject({ hp:77, mp:33, potions:2, cooldowns:{q:5} });
    s.hp = 0; finish(next); expect(finishTrialWave(run,next)).toBe(false); run.status = 'abandoned'; expect(claimTrial(s,run)).toBeNull(); expect(s.trials.marks).toBe(0);
  });
  it.each([1,2,3])('applies tier %i on top of the selected adventure difficulty', tier => {
    const s = finalState(); s.difficulty = 'veteran'; s.trials.best.starwarden = tier - 1; s.trials.clears.starwarden = tier - 1;
    const run = beginTrial(s,'starwarden',tier)!, c = new Combat(s,'trial',[],false,trialEncounter(run)), e = c.boss!;
    expect(e.maxHp).toBe(Math.round(MONSTERS.starwarden.hp * DIFFICULTIES.veteran.hp * TIERS[tier-1].hp)); expect(c.encounter?.attack).toBe(TIERS[tier-1].attack);
  });
  it('spends earned marks on the selected weapon category, preserves item effects, and caps at +3', () => {
    const s = finalState(); s.trials.marks = 100; s.equipment.sword = 'tide_sword'; s.ownedItems.push('tide_sword');
    const before = attackPower(s); expect(forgeWeapon(s,'bow')).toBe(true); expect(attackPower(s)).toBe(before); expect(s.trials.marks).toBe(92);
    expect(forgeWeapon(s,'sword')).toBe(true); expect(attackPower(s)).toBe(before+4); expect(s.equipment.sword).toBe('tide_sword');
    expect(forgeWeapon(s,'sword')).toBe(true); expect(forgeWeapon(s,'sword')).toBe(true); const marks = s.trials.marks;
    expect(forgeWeapon(s,'sword')).toBe(false); expect(s.trials.marks).toBe(marks); expect(attackPower(s)).toBe(before+12);
    s.zone = 'trial'; expect(forgeWeapon(s,'spear')).toBe(false); s.zone = 'village'; s.trials.marks = 0; expect(forgeWeapon(s,'spear')).toBe(false);
  });
});

it.each((['story','adventure','veteran'] as Difficulty[]).flatMap(difficulty => (['sword','spear','bow'] as Weapon[]).map(weapon => ({difficulty,weapon}))))('completes every gauntlet tier with $weapon/$difficulty without resetting supplies between waves', ({difficulty,weapon}) => {
  const s = finalState(); s.difficulty = difficulty; s.weapon = weapon; s.ownedItems.push('tide_sword','tide_spear','tide_bow'); s.equipment = { sword:'tide_sword', spear:'tide_spear', bow:'tide_bow' };
  const outcomes = [];
  for (const tier of [1,2,3]) {
    s.zone = 'village'; const rest = new Combat(s,'village',[]); for (let i = 0; i < 800; i++) rest.tick(.05);
    const run = beginTrial(s,'gauntlet',tier)!; expect(run).not.toBeNull(); s.zone = 'trial';
    for (let wave = 0; wave < 3; wave++) {
      const env = createEnvironment('trial',s.journey,s.finale), c = new Combat(s,'trial',env.obstacles,false,trialEncounter(run));
      const outcome = fight(c, () => c.enemies.every(e => e.hp <= 0)); disposeEnvironment(env);
      expect(s.hp,JSON.stringify({tier,wave,...outcome})).toBeGreaterThan(0); expect(finishTrialWave(run,c),JSON.stringify({tier,wave,...outcome})).toBe(true);
      outcomes.push({tier,wave:wave+1,seconds:outcome.seconds,damage:outcome.damageTaken,potions:outcome.potionUses});
      if (wave < 2) expect(nextTrialWave(run)).toBe(true);
    }
    expect(claimTrial(s,run)?.first).toBe(true); s.zone = 'village'; expect(forgeWeapon(s,weapon)).toBe(true);
  }
  expect(s.trials.best.gauntlet).toBe(3); expect(s.trials.forge[weapon]).toBe(3); expect(s.hp).toBeLessThanOrEqual(maxHp(s));
  console.log(`GAUNTLET ${weapon}/${difficulty}`,JSON.stringify(outcomes));
});
