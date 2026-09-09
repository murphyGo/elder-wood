import { test, expect, type Page } from '@playwright/test';
import { newGame, maxHp, maxMp } from '../../src/game/state';
import { STORY_SITES, JOURNEY, type StoryId } from '../../src/game/journey';

async function start(page: Page) {
  const s = newGame(); s.chapter = 6; s.level = 8; s.armor = 3; s.gold = 600; s.hp = maxHp(s); s.mp = maxMp(s);
  s.ownedItems.push('frost_bow'); s.equipment.bow = 'frost_bow'; s.weapon = 'bow';
  const raw = JSON.stringify({ ...s, version: 2, journey: undefined, materials: undefined });
  await page.addInitScript(raw => { if (!localStorage.getItem('elderwood-save-v2')) localStorage.setItem('elderwood-save-v2', raw); }, raw);
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0, { timeout: 30000 }); return raw;
}
async function travel(page: Page, zone: string) {
  if (await page.locator('#modal-backdrop').isVisible()) await page.keyboard.press('Escape');
  await page.keyboard.press('KeyM'); await page.locator(`button[data-travel="${zone}"]`).click();
  await expect.poll(() => page.evaluate(() => (window as any).__ELDERWOOD__.state.zone)).toBe(zone);
}
async function site(page: Page, id: StoryId, close = true) {
  const p = STORY_SITES[id];
  await page.evaluate(p => (window as any).__ELDERWOOD__.hero.position.set(p.x, 0, p.z), { x: p.x, z: p.z });
  await expect.poll(() => page.evaluate(() => (window as any).__ELDERWOOD__.nearby?.storyId)).toBe(id);
  await page.keyboard.press('KeyF'); await expect(page.locator('#modal-title')).toHaveText(id === 'doran' ? '도란의 작업대' : p.name);
  if (close) await page.keyboard.press('Escape');
}
async function claim(page: Page) {
  await page.locator('#quest-content [data-action="claim"]').click(); await page.locator('[data-next-chapter]').click(); await page.keyboard.press('Escape');
}
async function attack(page: Page, i: number) {
  await page.keyboard.down('KeyJ'); if (i % 12 === 0) await page.keyboard.press('KeyR'); if (i % 8 === 2) await page.keyboard.press('KeyQ');
  if (i % 10 === 4) { await page.keyboard.press('KeyT'); await page.keyboard.press('KeyH'); }
  await page.waitForTimeout(350);
}

test('continues a v2 ending through investigation, crafting, tide, rescue, lighthouse, boss and homecoming', async ({ page }, testInfo) => {
  test.setTimeout(210000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); const original = await start(page);
  await page.evaluate(() => (window as any).__ELDERWOOD__.hero.position.set(-2.8, 0, 5.7)); await page.keyboard.press('KeyF');
  await page.locator('[data-begin-journey]').click(); await page.locator('button[data-travel="harbor"]').click();
  await expect(page.locator('#region-title')).toHaveText('새벽물결 항구'); await page.waitForTimeout(600);
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('harbor-arrival.png') });
  for (const id of ['captain', 'net', 'log', 'shard', 'wood_cache'] as const) await site(page, id);
  await claim(page); await site(page, 'chart'); await site(page, 'doran', false);
  await page.locator('[data-craft="lantern"]').click(); await expect(page.locator('[data-craft="lantern"]')).toBeDisabled();
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('workshop-lantern.png') }); await page.keyboard.press('Escape'); await claim(page);
  await travel(page, 'wreck'); await site(page, 'tide'); await expect(page.locator('#quest-content')).toContainText('썰물');
  // Traverse the real collision opening with WASD before using deterministic proximity for story checks.
  await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; g.hero.position.set(0, 0, 5); g.yaw = 0; });
  await page.keyboard.down('KeyW'); await expect.poll(() => page.evaluate(() => (window as any).__ELDERWOOD__.hero.position.z), { timeout: 8000 }).toBeLessThan(-4); await page.keyboard.up('KeyW');
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('wreck-crossing.png') });
  for (const id of ['ian', 'sera'] as const) {
    for (let i = 0; i < 100; i++) {
      const clear = await page.evaluate(p => {
        const g = (window as any).__ELDERWOOD__, e = g.enemies.find((e: any) => e.hp > 0 && Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < 6);
        if (!e) return true; g.hero.position.copy(e.model.position); g.hero.position.z += 5; g.target = e; return false;
      }, { x: STORY_SITES[id].x, z: STORY_SITES[id].z });
      if (clear) break; await attack(page, i);
    }
    await page.keyboard.up('KeyJ'); await site(page, id);
  }
  await site(page, 'iron_cache'); await travel(page, 'harbor'); await site(page, 'rescue_report'); await claim(page);
  await travel(page, 'wreck'); await site(page, 'inscription'); await site(page, 'shell'); await site(page, 'star');
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.state.journey.runes)).toEqual([]);
  await site(page, 'shell'); await page.reload(); await expect(page.locator('#loading')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.state.journey)).toMatchObject({ step: 4, tide: 'low', runes: ['shell'] });
  await site(page, 'moon'); await site(page, 'star');
  await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; g.hero.position.set(0, 0, -18); }); await page.waitForTimeout(500);
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('lighthouse-restored.png') }); await claim(page); await travel(page, 'abyss'); await page.waitForTimeout(3500);
  const phases = new Set<number>();
  for (let i = 0; i < 150; i++) {
    const result = await page.evaluate(async () => {
      const { clearLine, moveBody } = await import('/src/game/geometry.ts');
      const g = (window as any).__ELDERWOOD__, boss = g.enemies[0];
      if (boss.hp <= 0 || g.state.hp <= 0) return { dead: boss.hp <= 0, lost: g.state.hp <= 0, phase: boss.bossPhase };
      const candidates = Array.from({ length: 16 }, (_, i) => moveBody({ x: boss.pos.x + Math.sin(i * Math.PI / 8) * 7, z: boss.pos.z + Math.cos(i * Math.PI / 8) * 7 }, { x: 0, z: 0 }, .4, g.environment.obstacles));
      const p = candidates.filter(p => Math.hypot(p.x-boss.pos.x,p.z-boss.pos.z) > 4 && clearLine(p, boss.pos, g.environment.obstacles, .25)).sort((a,b) => Math.hypot(a.x-g.hero.position.x,a.z-g.hero.position.z)-Math.hypot(b.x-g.hero.position.x,b.z-g.hero.position.z))[0];
      if (p) g.hero.position.set(p.x, 0, p.z); g.target = boss;
      return { dead: false, lost: false, phase: boss.bossPhase };
    });
    if (!phases.has(result.phase)) { phases.add(result.phase); await page.waitForTimeout(150); await page.screenshot({ animations: 'disabled', path: testInfo.outputPath(`neris-phase-${result.phase}.png`) }); }
    if (result.dead) break; expect(result.lost).toBe(false); await attack(page, i);
  }
  await page.keyboard.up('KeyJ'); expect([...phases]).toEqual([1, 2]);
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.state.materials.heart)).toBe(3);
  console.log('BROWSER_NERIS', await page.evaluate(() => (window as any).__ELDERWOOD__.battle.metrics));
  await claim(page); await site(page, 'memory', false); await expect(page.locator('#modal')).toContainText('하늘나무'); await page.keyboard.press('Escape');
  await travel(page, 'harbor'); await site(page, 'harbor_return'); await claim(page); await expect(page.locator('#quest-content')).toContainText('새벽을 되찾은 바다');
  await site(page, 'doran', false); await page.locator('[data-craft="tide_bow"]').click(); await expect(page.locator('[data-craft="tide_bow"]')).toBeDisabled();
  await page.keyboard.press('Escape'); await page.keyboard.press('KeyI'); await page.locator('[data-item="tide_bow"]').click();
  await page.keyboard.press('Escape'); await page.reload(); await expect(page.locator('#loading')).toHaveCount(0);
  await expect(page.locator('#weapon-name')).toHaveText('새벽바다의 활'); expect(await page.evaluate(() => (window as any).__ELDERWOOD__.state.journey.step)).toBe(7);
  expect(await page.evaluate(() => localStorage.getItem('elderwood-save-v2'))).toBe(original);
  await page.keyboard.press('KeyL'); await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('black-tide-ending-journal.png') });
  expect(errors).toEqual([]);
});

test.describe('coastal touch interface', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('touch interactions, workshop, world map and saved rune instructions fit the small screen', async ({ page }, testInfo) => {
    const s = newGame(); s.chapter = 6; s.level = 10; s.zone = 'wreck'; s.journey.step = 4;
    s.journey.flags = [...new Set(JOURNEY.slice(1, 4).flatMap(q => q.objectives)), 'inscription']; s.journey.tide = 'low'; s.journey.runes = ['shell'];
    await page.addInitScript(raw => localStorage.setItem('elderwood-save-v3', raw), JSON.stringify(s));
    await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0, { timeout: 30000 });
    await page.evaluate(() => (window as any).__ELDERWOOD__.hero.position.set(0, 0, -24));
    await expect(page.locator('#interaction')).toContainText('달 문양'); await page.locator('[data-action="interact"]').tap();
    await expect(page.locator('#modal-title')).toHaveText('달 문양'); await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('rune-touch.png') });
    await page.getByRole('button', { name: '계속하기', exact: true }).tap(); await page.getByRole('button', { name: '퀘스트 일지', exact: true }).tap();
    await expect(page.locator('#modal')).toContainText('현재 공명: 2 / 3'); await page.keyboard.press('Escape');
    await travel(page, 'harbor'); await site(page, 'doran', false); await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('workshop-touch.png') });
    const bounds = await page.locator('#modal').boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.keyboard.press('Escape'); await page.locator('.nav-item[data-panel="map"]').tap(); await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('coast-map-touch.png') });
    await expect(page.locator('button[data-travel="abyss"]')).toBeDisabled();
    await page.getByRole('button', { name: '창 닫기', exact: true }).tap(); await page.locator('.nav-item[data-panel="inventory"]').tap();
    await page.locator('[data-shop-visit]').tap(); await expect(page.locator('#modal-title')).toHaveText('항구의 보급 상점');
    await page.getByRole('button', { name: '창 닫기', exact: true }).tap();
    await expect.poll(() => page.evaluate(() => (window as any).__ELDERWOOD__.nearby?.kind)).toBe('shop');
    expect(await page.evaluate(() => (window as any).__ELDERWOOD__.state.zone)).toBe('harbor');
  });
});

test('the optional forest rescue leaves a returning villager and a persistent journal record', async ({ page }, testInfo) => {
  await start(page); await travel(page, 'forest');
  await site(page, 'herb'); await site(page, 'camp');
  for (let i = 0; i < 40; i++) {
    const clear = await page.evaluate(() => {
      const g = (window as any).__ELDERWOOD__, e = g.enemies.find((e: any) => e.hp > 0 && Math.hypot(e.pos.x - 4, e.pos.z + 20) < 6);
      if (!e) return true; g.hero.position.copy(e.model.position); g.hero.position.z += 4; g.target = e; return false;
    });
    if (clear) break; await attack(page, i);
  }
  await page.keyboard.up('KeyJ'); await site(page, 'lyra');
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.npcs.find((n: any) => n.userData.storyId === 'lyra').visible)).toBe(false);
  await travel(page, 'village'); await page.evaluate(() => (window as any).__ELDERWOOD__.hero.position.set(3, 0, 5));
  await expect(page.locator('#interaction')).toContainText('돌아온 리라'); await page.keyboard.press('KeyF');
  await expect(page.locator('#modal-title')).toHaveText('돌아온 리라'); await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('lyra-homecoming.png') });
  await page.keyboard.press('Escape'); await page.reload(); await expect(page.locator('#loading')).toHaveCount(0); await page.keyboard.press('KeyL');
  await expect(page.locator('#modal')).toContainText('구조 완료 · 리라는 그린헤이븐에 돌아왔습니다.');
});
