import { test, expect } from '@playwright/test';

test('the 3D adventure renders, moves, accepts its story, and saves equipment', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0, { timeout: 30000 });
  await expect(page.locator('#game-canvas')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('village-desktop.png'), animations: 'disabled' });
  const start = await page.evaluate(() => (window as any).__ELDERWOOD__.hero.position.toArray());
  await page.keyboard.down('KeyW'); await page.waitForTimeout(650); await page.keyboard.up('KeyW');
  const moved = await page.evaluate(() => (window as any).__ELDERWOOD__.hero.position.toArray());
  expect(Math.hypot(start[0] - moved[0], start[2] - moved[2])).toBeGreaterThan(1);
  const yaw = await page.evaluate(() => (window as any).__ELDERWOOD__.yaw);
  await page.mouse.move(690, 420); await page.mouse.down({ button: 'right' }); await page.mouse.move(765, 425, { steps: 5 }); await page.mouse.up({ button: 'right' });
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.yaw)).not.toBe(yaw);
  await page.locator('#begin-btn').click(); await expect(page.getByRole('heading', { name: '장로 엘리온', exact: true })).toBeVisible();
  await page.locator('[data-dialogue-continue]').click();
  await expect(page.locator('#quest-content')).toContainText('작은 숲의 이상한 소문');
  await page.keyboard.press('KeyI'); await page.locator('[data-equip="bow"]').click();
  await expect(page.locator('[data-equip="bow"]')).toHaveClass(/equipped/);
  await page.screenshot({ path: testInfo.outputPath('inventory.png'), animations: 'disabled' });
  await page.keyboard.press('Escape'); await page.reload();
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 30000 });
  await expect(page.locator('#weapon-name')).toHaveText('숲지기의 활'); await expect(page.locator('#welcome-card')).toBeHidden();
  await page.keyboard.press('KeyM'); await expect(page.locator('button[data-travel="plains"]')).toBeDisabled();
  await page.locator('button[data-travel="forest"]').click();
  await expect(page.locator('#region-title')).toHaveText('속삭임의 숲');
  await page.waitForTimeout(3000); await page.screenshot({ path: testInfo.outputPath('forest-desktop.png'), animations: 'disabled' });
  expect(errors).toEqual([]);
});

test('all advanced regions render, the dragon can be defeated, and the ending completes', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0, { timeout: 30000 });
  await page.locator('#welcome-close').click();
  await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; g.state.level = 8; g.state.chapter = 4; g.state.hp = 356; g.state.mp = 144; g.state.armor = 3; g.state.potions = 10; });
  for (const zone of ['plains', 'depths', 'sanctum']) {
    await page.keyboard.press('KeyM'); await page.locator(`button[data-travel="${zone}"]`).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: testInfo.outputPath(`${zone}.png`), animations: 'disabled' });
    expect(await page.evaluate(() => (window as any).__ELDERWOOD__.renderer.info.render.triangles)).toBeGreaterThan(1000);
  }
  await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; const boss = g.enemies[0]; g.hero.position.copy(boss.model.position); g.hero.position.z += 3; g.target = boss; });
  await page.keyboard.press('Digit2'); await page.keyboard.press('KeyR'); await page.keyboard.press('KeyQ');
  await page.keyboard.down('KeyJ');
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(600);
    const state = await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; return { dead: g.enemies[0].hp <= 0, hp: g.state.hp }; });
    if (state.dead) break;
    if (state.hp < 180) await page.keyboard.press('KeyE');
    if (state.hp < 120) await page.keyboard.press('KeyH');
    if (i % 8 === 7) await page.keyboard.press('KeyQ');
  }
  await page.keyboard.up('KeyJ');
  await expect.poll(() => page.evaluate(() => (window as any).__ELDERWOOD__.state.kills.dragon)).toBe(1);
  await page.locator('[data-action="claim"]').click(); await page.locator('[data-next-chapter]').click(); await page.locator('button[data-travel="village"]').click();
  await page.evaluate(() => { (window as any).__ELDERWOOD__.hero.position.set(-2, 0, 7); });
  await page.keyboard.press('KeyF'); await expect(page.locator('#modal-title')).toHaveText('장로 엘리온');
  await page.locator('[data-dialogue-continue]').click();
  await expect(page.locator('#quest-content')).toContainText('이야기 완료');
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.state.chapter)).toBe(6);
  expect(errors).toEqual([]);
});

test.describe('touch input', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('the on-screen direction pad moves the character and releases cleanly', async ({ page }, testInfo) => {
    await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0, { timeout: 30000 });
    await expect(page.locator('#touch-controls')).toBeVisible();
    const start = await page.evaluate(() => (window as any).__ELDERWOOD__.hero.position.z);
    const button = await page.locator('[data-hold="KeyW"]').boundingBox();
    await page.mouse.move(button!.x + button!.width / 2, button!.y + button!.height / 2); await page.mouse.down();
    await page.waitForTimeout(400); await page.mouse.up();
    expect(await page.evaluate(() => (window as any).__ELDERWOOD__.hero.position.z)).toBeLessThan(start - 0.5);
    expect(await page.evaluate(() => (window as any).__ELDERWOOD__.keys.size)).toBe(0);
    await page.screenshot({ path: testInfo.outputPath('touch-mobile.png'), animations: 'disabled' });
  });
});

test('combat grants XP, skills consume mana, death revives, and the shop equips armor', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0, { timeout: 30000 });
  await page.locator('#begin-btn').click(); await page.locator('[data-dialogue-continue]').click();
  await page.keyboard.press('KeyM'); await page.locator('button[data-travel="forest"]').click();
  // Deterministic proximity avoids testing a bot's navigation in a combat regression.
  await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; const e = g.enemies[0]; g.hero.position.copy(e.model.position); g.hero.position.z += 2; g.target = e; });
  await page.keyboard.down('KeyJ'); await expect.poll(() => page.evaluate(() => (window as any).__ELDERWOOD__.state.totalKills)).toBeGreaterThan(0); await page.keyboard.up('KeyJ');
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.state.xp)).toBeGreaterThan(0);
  await page.keyboard.press('Digit3');
  const rangedTarget = await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; const e = g.enemies.find((e: any) => e.hp > 0); g.hero.position.copy(e.model.position); g.hero.position.z += 8; g.target = e; return { id: e.id, hp: e.hp }; });
  await page.keyboard.down('KeyJ');
  await expect.poll(() => page.evaluate(id => (window as any).__ELDERWOOD__.enemies.find((e: any) => e.id === id).hp, rangedTarget.id)).toBeLessThan(rangedTarget.hp);
  await page.keyboard.up('KeyJ');
  await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; g.state.level = 3; g.state.mp = 70; g.hero.position.set(0, 0, 28); });
  await page.keyboard.press('KeyQ'); await expect(page.locator('#cooldown-q')).not.toBeEmpty();
  const mp = await page.evaluate(() => (window as any).__ELDERWOOD__.state.mp); expect(mp).toBeLessThan(65);
  // A real AI strike delivers the final point of damage and exercises the revive UI.
  await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; const e = g.enemies.find((e: any) => e.hp > 0); g.state.hp = 1; g.hero.position.copy(e.model.position); g.hero.position.z += 1; e.cooldown = 0; });
  await expect(page.locator('[data-revive]')).toBeVisible({ timeout: 15000 }); await page.locator('[data-revive]').click();
  await expect(page.locator('#region-title')).toHaveText('그린헤이븐 마을');
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.state.totalKills)).toBeGreaterThan(0);
  await page.keyboard.press('KeyI'); await page.locator('[data-shop-visit]').click();
  await page.evaluate(() => { (window as any).__ELDERWOOD__.state.gold = 100; });
  await page.keyboard.press('Escape'); await page.keyboard.press('KeyF');
  await page.locator('[data-buy-armor]').click();
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.state.armor)).toBe(1);
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.state.gold)).toBe(20);
  expect(errors).toEqual([]);
});

test('quest completion unlocks the next region and exposes actual story rewards', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0, { timeout: 30000 });
  await page.locator('#begin-btn').click(); await page.locator('[data-dialogue-continue]').click();
  await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; g.state.kills = { squirrel: 3, rabbit: 3 }; g.state.xp = 90; g.state.level = 2; });
  await expect(page.locator('[data-action="claim"]')).toBeVisible(); await page.locator('[data-action="claim"]').click();
  await expect(page.locator('#modal-title')).toHaveText('숲이 당신을 기억합니다');
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.state.chapter)).toBe(2);
  await page.locator('[data-next-chapter]').click();
  await expect(page.locator('button[data-travel="plains"]')).toBeEnabled();
  await page.locator('button[data-travel="plains"]').click();
  await expect(page.locator('#region-title')).toHaveText('거인의 들판');
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.state.potions)).toBe(7);
});

test('mobile controls, modals, audio preference, and reset work without overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0, { timeout: 30000 });
  await page.screenshot({ path: testInfo.outputPath('village-mobile.png'), animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: '소리 끄기', exact: true }).click(); await expect(page.getByRole('button', { name: '소리 켜기', exact: true })).toBeVisible();
  await page.locator('.nav-item[data-panel="map"]').click(); await expect(page.locator('#modal-title')).toHaveText('세계 지도'); await page.screenshot({ path: testInfo.outputPath('map-mobile.png'), animations: 'disabled' });
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.locator('[data-new-game]').click(); await page.locator('[data-confirm-new]').click();
  await expect(page.locator('#welcome-card')).toBeVisible(); await expect(page.locator('#gold')).toHaveText('60');
  await page.keyboard.press('KeyC'); await page.screenshot({ path: testInfo.outputPath('character-mobile.png'), animations: 'disabled' });
  const bounds = await page.locator('#modal').boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
});
