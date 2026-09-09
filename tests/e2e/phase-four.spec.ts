import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { secondEnding, finalState } from '../helpers/finale-state';
import { FINAL_SITES, CHOICES, type FinalSiteId, type EndingChoice } from '../../src/game/finale';
import type { SaveState } from '../../src/game/state';

async function start(page: Page, state: SaveState, migrate = false) {
  const raw = JSON.stringify(migrate ? { ...state, version:3, finale:undefined, trials:undefined } : state);
  await page.addInitScript(({raw,key}) => { if (!localStorage.getItem(key)) localStorage.setItem(key,raw); }, {raw,key:migrate ? 'elderwood-save-v3' : 'elderwood-save-v4'});
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0,{timeout:30000}); return raw;
}
async function travel(page: Page, zone: string) {
  if (await page.locator('#modal-backdrop').isVisible()) await page.keyboard.press('Escape');
  await page.keyboard.press('KeyM'); await page.locator(`button[data-travel="${zone}"]`).click();
  await expect.poll(() => page.evaluate(() => (window as any).__ELDERWOOD__.state.zone)).toBe(zone);
}
async function site(page: Page, id: FinalSiteId, close = true) {
  const p = FINAL_SITES[id]; await page.evaluate(p => (window as any).__ELDERWOOD__.hero.position.set(p.x,0,p.z),{x:p.x,z:p.z});
  await expect.poll(() => page.evaluate(() => (window as any).__ELDERWOOD__.nearby?.finalId)).toBe(id);
  await page.keyboard.press('KeyF'); await expect(page.locator('#modal-title')).toHaveText(id === 'covenant' ? '빛을 맡길 곳' : p.name);
  if (close) await page.keyboard.press('Escape');
}
async function claim(page: Page) { await page.locator('#quest-content [data-action="claim"]').click(); await page.locator('[data-next-chapter]').click(); await page.keyboard.press('Escape'); }

/** Deterministic positioning; every hit, skill, healing and resonance uses real keyboard input. */
async function fight(page: Page, info: TestInfo, prefix: string) {
  const phases = new Set<number>();
  for (let i = 0; i < 230; i++) {
    const result = await page.evaluate(async () => {
      const { clearLine, moveBody } = await import('/src/game/geometry.ts');
      const g = (window as any).__ELDERWOOD__, e = g.enemies.filter((e:any) => e.hp > 0).sort((a:any,b:any) => a.hp-b.hp)[0];
      if (!e || g.state.hp <= 0) return { done:!e, lost:g.state.hp<=0, phase:0, anchor:false };
      g.target = e;
      if (e.species === 'starwarden' && e.bossPhase === 2 && g.battle.exposure < 1) {
        const anchors = [{x:-7,z:-5},{x:7,z:-5},{x:0,z:4}], index = anchors.findIndex((_,i) => g.battle.sealCooldowns[i] === 0);
        if (index >= 0) { g.hero.position.set(anchors[index].x,0,anchors[index].z); return {done:false,lost:false,phase:e.bossPhase,anchor:true}; }
      }
      const candidates = Array.from({length:16},(_,i) => moveBody({x:e.pos.x+Math.sin(i*Math.PI/8)*7,z:e.pos.z+Math.cos(i*Math.PI/8)*7},{x:0,z:0},.4,g.environment.obstacles));
      const p = candidates.filter(p => Math.hypot(p.x-e.pos.x,p.z-e.pos.z)>4 && clearLine(p,e.pos,g.environment.obstacles,.25)).sort((a,b) => Math.hypot(a.x-g.hero.position.x,a.z-g.hero.position.z)-Math.hypot(b.x-g.hero.position.x,b.z-g.hero.position.z))[0];
      if (p) g.hero.position.set(p.x,0,p.z);
      return {done:false,lost:false,phase:e.bossPhase,anchor:false};
    });
    if (result.done) break; expect(result.lost).toBe(false);
    if (!phases.has(result.phase)) { phases.add(result.phase); await page.screenshot({animations:'disabled',path:info.outputPath(`${prefix}-phase-${result.phase}.png`)}); }
    if (result.anchor) { await page.keyboard.up('KeyJ'); await page.keyboard.press('KeyF'); }
    else { await page.keyboard.down('KeyJ'); if (i%10 === 0) await page.keyboard.press('KeyR'); if (i%8 === 3) await page.keyboard.press('KeyQ'); }
    if (i%10 === 5) { await page.keyboard.press('KeyT'); await page.keyboard.press('KeyH'); }
    await page.waitForTimeout(300);
  }
  await page.keyboard.up('KeyJ');
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.enemies.every((e:any) => e.hp <= 0))).toBe(true);
  return [...phases];
}

for (const choice of ['renew','release'] as EndingChoice[]) test(`v3 to final ending: ${choice}, actual bridge, promise, three boss phases and persistent world`, async ({page},info) => {
  test.setTimeout(200000); const errors:string[]=[]; page.on('pageerror',e => errors.push(e.message));
  const s = secondEnding(); s.weapon='bow'; s.ownedItems.push('tide_bow'); s.equipment.bow='tide_bow'; const raw = await start(page,s,true);
  await page.evaluate(() => (window as any).__ELDERWOOD__.hero.position.set(-2.8,0,5.7)); await page.keyboard.press('KeyF');
  await expect(page.locator('#modal')).toContainText('바로 나였네'); await page.locator('[data-begin-finale]').click(); await page.locator('button[data-travel="ruins"]').click();
  await page.waitForTimeout(600); await page.screenshot({animations:'disabled',path:info.outputPath('skytree-arrival.png')});
  await page.evaluate(() => { const g=(window as any).__ELDERWOOD__; g.hero.position.set(0,0,5); g.yaw=0; });
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.hero.position.z)).toBeGreaterThan(1);
  for (const id of ['past','sky_echo','sea_echo'] as const) await site(page,id); await claim(page);
  for (const id of ['elion_ally','earth_song','sea_song'] as const) await site(page,id); await claim(page);
  await page.evaluate(() => { const g=(window as any).__ELDERWOOD__; g.hero.position.set(0,0,5); g.yaw=0; });
  await page.keyboard.down('KeyW'); await expect.poll(() => page.evaluate(() => (window as any).__ELDERWOOD__.hero.position.z),{timeout:8000}).toBeLessThan(-4); await page.keyboard.up('KeyW');
  await site(page,'covenant',false); await page.screenshot({animations:'disabled',path:info.outputPath('the-promise.png')});
  await page.locator(`[data-choice-preview="${choice}"]`).click(); expect(await page.evaluate(() => (window as any).__ELDERWOOD__.state.finale.choice)).toBeNull();
  await page.locator('#modal [data-panel="choice"]').click(); await page.locator(`[data-choice-preview="${choice}"]`).click(); await page.locator(`[data-choice-confirm="${choice}"]`).click();
  await page.reload(); await expect(page.locator('#loading')).toHaveCount(0); expect(await page.evaluate(() => (window as any).__ELDERWOOD__.state.finale.choice)).toBe(choice);
  await claim(page); await travel(page,'roots'); await page.waitForTimeout(600);
  expect(await fight(page,info,'aster')).toEqual([1,2,3]); expect(await page.evaluate(() => (window as any).__ELDERWOOD__.battle.metrics.sealUses)).toBeGreaterThan(0);
  await claim(page); await site(page,'seed'); await travel(page,'village');
  await page.evaluate(() => (window as any).__ELDERWOOD__.hero.position.set(-2.8,0,5.7)); await page.keyboard.press('KeyF'); await expect(page.locator('#modal')).toContainText('같은 새벽');
  await page.keyboard.press('Escape'); await page.locator('#quest-content [data-action="claim"]').click(); await expect(page.locator('#modal-title')).toHaveText(CHOICES[choice].ending);
  await page.screenshot({animations:'disabled',path:info.outputPath('final-ending.png')}); await page.keyboard.press('Escape'); await page.reload(); await expect(page.locator('#loading')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.state.finale.step)).toBe(6);
  expect(await page.evaluate(choice => (window as any).__ELDERWOOD__.environment.ending[choice].visible,choice)).toBe(true);
  await page.evaluate(() => { const g=(window as any).__ELDERWOOD__; g.hero.position.set(6,0,10); g.yaw=.2; }); await page.waitForTimeout(500);
  await page.screenshot({animations:'disabled',path:info.outputPath(`village-${choice}.png`)});
  expect(await page.evaluate(() => localStorage.getItem('elderwood-save-v3'))).toBe(raw); expect(errors).toEqual([]);
});

test('three real trial waves, reward claim, forge and interruption preserve the correct progress', async ({page},info) => {
  test.setTimeout(210000); const s=finalState(); s.weapon='bow'; s.ownedItems.push('tide_bow'); s.equipment.bow='tide_bow'; await start(page,s);
  await page.locator('#quest-content [data-panel="trials"]').click(); await expect(page.locator('[data-trial-start="gauntlet"][data-tier="2"]')).toBeDisabled();
  await page.locator('[data-trial-start="gauntlet"][data-tier="1"]').click();
  for (let wave=0;wave<3;wave++) {
    await fight(page,info,`gauntlet-${wave+1}`); await expect(page.locator('#modal-title')).toHaveText('메아리의 회랑');
    expect(await page.evaluate(() => (window as any).__ELDERWOOD__.state.trials.marks)).toBe(0);
    if (wave<2) { await expect(page.locator('[data-trial-claim]')).toHaveCount(0); await page.locator('[data-trial-next]').click(); }
  }
  await page.screenshot({animations:'disabled',path:info.outputPath('trial-clear.png')}); await page.locator('[data-trial-claim]').click();
  await expect(page.locator('[data-trial-start="gauntlet"][data-tier="2"]')).toBeEnabled();
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.state.trials)).toMatchObject({marks:14,best:{gauntlet:1},clears:{gauntlet:1}});
  await page.locator('[data-forge="bow"]').click(); await expect(page.locator('#weapon-name')).toContainText('공명 +1');
  const earned=await page.evaluate(() => structuredClone((window as any).__ELDERWOOD__.state));
  expect(earned.trials.marks).toBe(6); expect(earned.totalKills).toBe(s.totalKills); expect(earned.materials).toEqual(s.materials);
  await page.locator('[data-trial-start="gauntlet"][data-tier="2"]').click();
  await page.keyboard.press('Escape'); const before=await page.evaluate(() => { const g=(window as any).__ELDERWOOD__; g.save(); return {hp:g.state.hp,mp:g.state.mp,playTime:g.state.playTime}; });
  await page.reload(); await expect(page.locator('#loading')).toHaveCount(0); await page.keyboard.press('Escape');
  const loaded=await page.evaluate(() => {const g=(window as any).__ELDERWOOD__;return {state:g.state,active:g.activeTrial};});
  expect(loaded.state.zone).toBe('village'); expect(loaded.active).toBeUndefined(); expect(loaded.state.trials).toEqual(earned.trials);
  // Only elapsed simulation time can regenerate resources; loading itself grants none.
  const elapsed=loaded.state.playTime-before.playTime;
  expect(loaded.state.hp).toBeLessThanOrEqual(before.hp+12*elapsed+.001); expect(loaded.state.mp).toBeLessThanOrEqual(before.mp+4*elapsed+.001);
});

test.describe('finale on touch screens',() => {
  test.use({hasTouch:true,viewport:{width:390,height:844}});
  test('both promise cards and the trial/forge menus are usable without horizontal overflow', async ({page},info) => {
    const s=finalState(3); s.zone='ruins'; await start(page,s); await site(page,'covenant',false);
    await page.locator('[data-choice-preview="release"]').tap(); await expect(page.locator('[data-choice-confirm="release"]')).toBeVisible();
    await page.screenshot({animations:'disabled',path:info.outputPath('promise-mobile.png')});
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.keyboard.press('Escape'); await page.evaluate(async () => {
      const { FINALE }=await import('/src/game/finale.ts'); const g=(window as any).__ELDERWOOD__;
      g.state.finale={step:6,choice:'release',flags:[...new Set(FINALE.slice(1,6).flatMap((q:any)=>q.objectives)),'bridge']};g.state.level=16;g.loadZone('village');g.save();
    });
    await page.getByRole('button',{name:'퀘스트 일지',exact:true}).tap(); await page.locator('#modal [data-panel="trials"]').tap();
    await page.locator('[data-trial-start="starwarden"][data-tier="1"]').scrollIntoViewIfNeeded(); await page.screenshot({animations:'disabled',path:info.outputPath('trials-mobile.png')});
    await page.locator('[data-forge="bow"]').scrollIntoViewIfNeeded(); await expect(page.locator('[data-forge="bow"]')).toBeDisabled();
    const bounds=await page.locator('#modal').boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(390);
    expect(await page.locator('#modal').evaluate(el => el.scrollWidth<=el.clientWidth+1)).toBe(true);
  });
});
