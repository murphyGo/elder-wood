import { test, expect, type Page } from '@playwright/test';
import { newGame } from '../../src/game/state';

const progressed = () => ({ ...newGame(), level: 8, chapter: 4, gold: 2000, hp: 250, mp: 144, armor: 3, totalKills: 25, kills: { tiger: 2 }, playTime: 600 });
async function start(page: Page, state = progressed()) {
  await page.addInitScript(state => { if (!localStorage.getItem('elderwood-save-v2')) localStorage.setItem('elderwood-save-v2', JSON.stringify(state)); }, state);
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0, { timeout: 30000 });
}

test('weapon skills, all six shop items, remembered equipment and difficulty survive reload', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await start(page);
  await page.keyboard.press('Digit3'); await expect(page.locator('[data-skill="q"]')).toContainText('다중 사격'); await expect(page.locator('[data-skill="r"]')).toContainText('충전 관통 사격');
  await page.keyboard.press('KeyR'); await page.keyboard.press('Digit1');
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.battle.cast)).toBeUndefined();
  await expect(page.locator('[data-skill="r"]')).toContainText('회전 베기'); await expect(page.locator('#cooldown-r')).not.toBeEmpty();
  await page.keyboard.press('Escape'); await page.locator('[data-difficulty="veteran"]').click(); await expect(page.locator('[data-difficulty="veteran"]')).toHaveClass(/selected/);
  await page.keyboard.press('Escape'); await page.keyboard.press('KeyI'); await page.locator('[data-shop-visit]').click();
  for (const id of ['ember_sword','ward_sword','earth_spear','dragon_spear','storm_bow','frost_bow']) { await page.locator(`[data-buy-item="${id}"]`).click(); await expect(page.locator(`[data-buy-item="${id}"]`)).toBeDisabled(); }
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.state.ownedItems.length)).toBe(9);
  await page.screenshot({ path: testInfo.outputPath('unique-weapons-shop.png'), animations: 'disabled' });
  await page.keyboard.press('Escape'); await page.keyboard.press('KeyI'); await page.locator('[data-item="ember_sword"]').click(); await page.locator('[data-item="frost_bow"]').click();
  await page.screenshot({ path: testInfo.outputPath('nine-items.png'), animations: 'disabled' });
  await page.keyboard.press('Escape'); await page.keyboard.press('Digit1'); await expect(page.locator('#weapon-name')).toHaveText('잿불 검');
  await page.keyboard.press('Digit3'); await expect(page.locator('#weapon-name')).toHaveText('서리사냥꾼의 활');
  await page.reload(); await expect(page.locator('#loading')).toHaveCount(0); await expect(page.locator('#weapon-name')).toHaveText('서리사냥꾼의 활');
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.state.difficulty)).toBe('veteran');
  await page.keyboard.press('KeyM'); await page.locator('button[data-travel="forest"]').click(); await page.keyboard.press('Escape');
  await expect(page.locator('[data-difficulty="story"]')).toBeDisabled(); expect(errors).toEqual([]);
});

test('v1 migration preserves an ending and offers reward-free dragon practice', async ({ page }) => {
  const old = { ...progressed(), version: 1, chapter: 6, hp: 30, mp: 5, zone: 'sanctum' }; const raw = JSON.stringify(old);
  await page.addInitScript(raw => { if (!localStorage.getItem('elderwood-save-v1')) localStorage.setItem('elderwood-save-v1', raw); }, raw);
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0, { timeout: 30000 });
  expect(await page.evaluate(() => localStorage.getItem('elderwood-save-v1'))).toBe(raw);
  await expect(page.locator('#toasts')).toContainText('숲의 치유는 T');
  const loaded = await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; return { hp:g.state.hp,mp:g.state.mp,chapter:g.state.chapter,practice:g.battle.practice,totalKills:g.state.totalKills }; });
  expect(loaded.hp).toBeLessThan(40); expect(loaded.mp).toBeLessThan(15); expect(loaded.chapter).toBe(6); expect(loaded.practice).toBe(true); expect(loaded.totalKills).toBe(25);
  await page.keyboard.press('KeyM'); await expect(page.locator('button[data-travel="sanctum"]')).toContainText('보스 연습');
});

test('corrupt saves stay intact until recovery is chosen; backup and old save remain', async ({ page }) => {
  const raw = JSON.stringify({ ...progressed(), version: 1 });
  await page.addInitScript(raw => { localStorage.setItem('elderwood-save-v1', raw); localStorage.setItem('elderwood-save-v2', 'damaged-data'); }, raw);
  await page.goto('/'); await expect(page.locator('#modal-title')).toHaveText('저장 기록 복구');
  await page.keyboard.press('Escape'); await expect(page.locator('#modal-title')).toHaveText('저장 기록 복구');
  expect(await page.evaluate(() => localStorage.getItem('elderwood-save-v2'))).toBe('damaged-data');
  await page.locator('[data-recover="legacy"]').click(); await expect(page.locator('#modal-backdrop')).toBeHidden();
  const storage = await page.evaluate(() => ({ old:localStorage.getItem('elderwood-save-v1'), state:JSON.parse(localStorage.getItem('elderwood-save-v2')!), backups:Object.keys(localStorage).filter(k => k.startsWith('elderwood-save-v2-backup-')).map(k => localStorage.getItem(k)) }));
  expect(storage.old).toBe(raw); expect(storage.state.level).toBe(8); expect(storage.backups).toContain('damaged-data');
});

test('write failures are visible on a small screen while play remains available', async ({ page }) => {
  await page.setViewportSize({ width:390,height:844 });
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('quota','QuotaExceededError'); }; });
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0, { timeout:30000 });
  await expect(page.locator('#save-warning')).toBeVisible(); await expect(page.locator('#save-warning')).toContainText('저장 불가');
  await expect(page.locator('#game-canvas')).toBeVisible();
});

test.describe('touch skills and boss seals', () => {
  test.use({ hasTouch:true, viewport:{width:390,height:844} });
  test('all slots fit and T, charge cancellation and the seal use touch buttons', async ({ page }, testInfo) => {
    await start(page);
    await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; g.state.hp=50; });
    await page.locator('[data-skill="t"]').tap(); await expect(page.locator('#cooldown-t')).not.toBeEmpty();
    expect(await page.evaluate(() => (window as any).__ELDERWOOD__.state.hp)).toBeGreaterThan(180);
    await page.keyboard.press('Digit3'); await page.locator('[data-skill="r"]').tap(); await page.locator('[data-action="dodge"]').tap();
    expect(await page.evaluate(() => (window as any).__ELDERWOOD__.battle.cast)).toBeUndefined();
    for (const slot of await page.locator('.skill-slot').all()) { const r=await slot.boundingBox(); expect(r!.x).toBeGreaterThan(0); expect(r!.x+r!.width).toBeLessThan(390); }
    await page.keyboard.press('KeyM'); await page.locator('button[data-travel="sanctum"]').tap();
    await page.evaluate(() => { const g=(window as any).__ELDERWOOD__, boss=g.enemies[0]; boss.hp=boss.maxHp*.35; boss.bossPhase=3; boss.mode='recover'; boss.timer=10; g.hero.position.set(0,0,3); });
    await expect(page.locator('#interaction')).toContainText('별의 봉인'); await page.locator('[data-action="interact"]').tap();
    expect(await page.evaluate(() => (window as any).__ELDERWOOD__.battle.exposure)).toBeGreaterThan(6);
    await page.screenshot({ path:testInfo.outputPath('boss-seal-touch.png'),animations:'disabled' });
    expect(await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; return g.camera.position.distanceTo(g.hero.position); })).toBeGreaterThan(3);
  });
});
