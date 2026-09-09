import { newGame, maxHp, maxMp } from '../../src/game/state';
import { JOURNEY } from '../../src/game/journey';
import { FINALE, type EndingChoice } from '../../src/game/finale';

export function secondEnding() {
  const s = newGame(); s.chapter = 6; s.level = 12; s.armor = 3; s.hp = maxHp(s); s.mp = maxMp(s);
  s.journey.step = 7; s.journey.flags = [...new Set(JOURNEY.slice(1, 7).flatMap(q => q.objectives))]; s.journey.runes = ['shell', 'moon', 'star'];
  return s;
}
export function finalState(step = 6, choice: EndingChoice = 'renew') {
  const s = secondEnding(); s.level = 16; s.hp = maxHp(s); s.mp = maxMp(s);
  s.finale.step = step; s.finale.flags = [...new Set(FINALE.slice(1, step).flatMap(q => q.objectives))];
  if (step >= 3) s.finale.flags.push('bridge');
  if (step >= 4) s.finale.choice = choice;
  return s;
}
