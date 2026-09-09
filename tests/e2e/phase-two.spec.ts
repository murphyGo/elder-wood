import { test, expect, type Page } from '@playwright/test';
import { newGame } from '../../src/game/state';

async function start(page: Page) {
  await page.addInitScript(state => { if (!localStorage.getItem('elderwood-save-v3')) localStorage.setItem('elderwood-save-v3', JSON.stringify(state)); }, { ...newGame(), level: 8, chapter: 4, armor: 3, gold: 1234, hp: 300, mp: 144 });
  await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0, { timeout: 30000 });
}

test('display settings apply, preserve progress and survive reload; failed writes remain usable', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await start(page);
  await page.keyboard.press('Escape'); await page.locator('.display-menu').click();
  await page.locator('[data-quality="low"]').click(); await page.locator('[data-shake="0"]').click(); await page.locator('[data-display="aimZoom"]').uncheck(); await page.locator('[data-display="ambientMotion"]').uncheck();
  expect(await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; return { quality: g.quality, shadows: g.renderer.shadowMap.enabled, particles: g.environment.particles.visible, grass: g.environment.grass.count }; })).toEqual({ quality: 'low', shadows: false, particles: false, grass: 1000 });
  await page.screenshot({ path: info.outputPath('display-desktop.png') }); await page.reload(); await expect(page.locator('#loading')).toHaveCount(0);
  expect(await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; return { ...g.settings, level: g.state.level, armor: g.state.armor, gold: g.state.gold, chapter: g.state.chapter }; })).toEqual({ quality: 'low', shake: 0, aimZoom: false, ambientMotion: false, level: 8, armor: 3, gold: 1234, chapter: 4 });
  await page.keyboard.press('Escape'); await page.locator('.display-menu').click();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('quota'); }; });
  await page.locator('[data-quality="high"]').click(); await expect(page.locator('#toasts')).toContainText('화면 설정을 저장하지 못했습니다');
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.quality)).toBe('high'); expect(errors).toEqual([]);
});

test('target lock, aim zoom and charge cancellation work with keyboard and screen controls', async ({ page }, info) => {
  await start(page); await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; g.loadZone('forest'); const e = g.enemies[0]; g.hero.position.set(e.pos.x, 0, e.pos.z + 10); g.target = e; });
  await page.keyboard.press('KeyX'); await expect(page.locator('#target-lock')).toHaveAttribute('aria-pressed', 'true');
  const first = await page.evaluate(() => (window as any).__ELDERWOOD__.lockedTarget.id);
  await page.keyboard.press('Tab'); expect(await page.evaluate(() => (window as any).__ELDERWOOD__.lockedTarget?.id)).not.toBe(first);
  await page.locator('#target-lock').click(); await expect(page.locator('#target-lock')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Digit3'); await page.keyboard.press('KeyR');
  await expect.poll(() => page.evaluate(() => (window as any).__ELDERWOOD__.camera.fov), { intervals: [50], timeout: 2000 }).toBeLessThan(47);
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.distance)).toBe(16);
  await page.keyboard.press('Digit1'); await expect.poll(() => page.evaluate(() => (window as any).__ELDERWOOD__.camera.fov)).toBeGreaterThan(48.8);
  await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; g.setDisplay({ aimZoom: false }); g.state.cooldowns.r = 0; g.state.mp = 144; });
  await page.keyboard.press('Digit3'); await page.keyboard.press('KeyR'); await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as any).__ELDERWOOD__.camera.fov)).toBeGreaterThan(48.8);
  await page.keyboard.press('ShiftLeft'); expect(await page.evaluate(() => (window as any).__ELDERWOOD__.battle.cast)).toBeUndefined();
  await page.keyboard.press('KeyX'); await page.evaluate(() => { (window as any).__ELDERWOOD__.hero.position.set(29, 0, 29); });
  await expect(page.locator('#target-lock')).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; g.loadZone('sanctum'); g.hero.position.set(0, 0, 1); g.target = g.enemies[0]; g.toggleTargetLock(); g.enemies[0].hp = g.enemies[0].maxHp * .6; g.enemies[0].airborne = true; g.enemies[0].phaseTime = 0; g.enemies[0].bossPhase = 2; g.enemies[0].mode = 'recover'; g.enemies[0].timer = 100; });
  await page.waitForTimeout(2600);
  const framing = await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; const point = g.hero.position.clone(); g.enemies[0].model.userData.head.getWorldPosition(point); const head = point.project(g.camera).y; const hero = g.hero.position.clone(); hero.y += 1; return { head, hero: hero.project(g.camera).y, airborne: g.enemies[0].airborne }; });
  expect(framing.airborne).toBe(true); expect(framing.head).toBeLessThan(.85); expect(framing.hero).toBeGreaterThan(-.85);
  await page.screenshot({ path: info.outputPath('dragon-flight.png') });
  await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; g.enemies[0].hp = 0; });
  await expect(page.locator('#target-lock')).toHaveAttribute('aria-pressed', 'false');
});

test.describe('touch camera', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('a real touch drag rotates without attacking and reduced motion starts quietly', async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); await start(page);
    const before = await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; return { yaw: g.yaw, settings: g.settings, quality: g.quality, mp: g.state.mp }; });
    expect(before.quality).toBe('low'); expect(before.settings).toEqual({ quality: 'auto', shake: 0, aimZoom: false, ambientMotion: false });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 160, y: 410, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 255, y: 450, id: 1 }] });
    await page.waitForTimeout(120); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const after = await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; return { yaw: g.yaw, attack: g.cooldowns.attack, mp: g.state.mp, keys: g.keys.size }; });
    expect(Math.abs(after.yaw - before.yaw)).toBeGreaterThan(.2); expect(after.attack).toBe(0); expect(after.mp).toBeGreaterThanOrEqual(before.mp); expect(after.keys).toBe(0);
    console.log('PHASE2_TOUCH', await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; return { width: innerWidth, height: innerHeight, quality: g.quality, ratio: g.renderer.getPixelRatio(), ...g.renderer.info.render }; }));
    await page.screenshot({ path: info.outputPath('village-touch.png') });
    await page.keyboard.press('Escape'); await page.locator('.display-menu').tap(); await page.locator('[data-quality="medium"]').tap(); await expect(page.locator('#modal-title')).toBeInViewport();
    await page.screenshot({ path: info.outputPath('display-touch.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });
});

test('rendering remains bounded across equipment and quality swaps; capture representative scenes', async ({ page }, info) => {
  test.setTimeout(90000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); }); await start(page);
  await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; g.loadZone('plains'); g.setPaused(true); });
  const measurements = [];
  for (const quality of ['high', 'low']) {
    await page.evaluate(quality => { (window as any).__ELDERWOOD__.setDisplay({ quality }); }, quality);
    await page.waitForTimeout(250);
    measurements.push(await page.evaluate(async () => {
      const g = (window as any).__ELDERWOOD__; const frames: number[] = []; let previous = performance.now();
      for (let i = 0; i < 45; i++) { const now = await new Promise<number>(requestAnimationFrame); frames.push(now - previous); previous = now; }
      frames.sort((a, b) => a - b);
      const gl = g.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable', canvas: [gl.drawingBufferWidth, gl.drawingBufferHeight], quality: g.quality, width: innerWidth, height: innerHeight, ratio: g.renderer.getPixelRatio(), medianMs: frames[22], p95Ms: frames[42], ...g.renderer.info.render, geometries: g.renderer.info.memory.geometries, enemies: g.enemies.length, obstacles: g.environment.obstacles.length };
    }));
    await page.screenshot({ path: info.outputPath(`plains-${quality}.png`) });
  }
  expect(measurements[0].enemies).toBe(measurements[1].enemies); expect(measurements[0].obstacles).toBe(measurements[1].obstacles);
  const geometries: number[] = [];
  for (let round = 0; round < 3; round++) {
    for (const weapon of ['sword', 'spear', 'bow']) {
      await page.evaluate(({ weapon, round }) => { const g = (window as any).__ELDERWOOD__; g.setWeapon(weapon, false); g.state.armor = round; g.setDisplay({ quality: round % 2 ? 'high' : 'low' }); }, { weapon, round }); await page.waitForTimeout(60);
    }
    await page.evaluate(() => { const g = (window as any).__ELDERWOOD__; g.state.armor = 3; g.setDisplay({ quality: 'high' }); }); await page.waitForTimeout(100);
    geometries.push(await page.evaluate(() => (window as any).__ELDERWOOD__.renderer.info.memory.geometries));
  }
  expect(Math.max(...geometries) - Math.min(...geometries)).toBeLessThanOrEqual(2);
  console.log('PHASE2_RENDER', JSON.stringify({ measurements, geometries }));
  await info.attach('render-metrics.json', { body: JSON.stringify({ measurements, geometries }, null, 2), contentType: 'application/json' });
  expect(errors).toEqual([]);
});

test('authored actors and equipment can be inspected in a stable studio view', async ({ page }, info) => {
  await start(page);
  await page.evaluate(async () => {
    const T = await import('/node_modules/three/build/three.module.js');
    const { animal, character, weaponModel, dressArmor } = await import('/src/game/actors.ts');
    const { animateHuman, animateAnimal } = await import('/src/game/animation.ts');
    const g = (window as any).__ELDERWOOD__; g.renderer.setAnimationLoop(null);
    const scene = new T.Scene(); scene.background = new T.Color('#bcc8b7');
    const sun = new T.DirectionalLight(0xffedce, 3); sun.position.set(-8, 14, 10); scene.add(sun, new T.HemisphereLight(0xd9edee, 0x5b6857, 2.2));
    const camera = new T.PerspectiveCamera(40, innerWidth / innerHeight, .1, 100); camera.position.set(9, 11, 19); camera.lookAt(0, 1, 1);
    const species = ['squirrel', 'rabbit', 'cow', 'horse', 'hippo', 'tiger', 'shark', 'dragon'];
    species.forEach((type, i) => {
      const model = animal(type); model.position.set((i % 4 - 1.5) * 4, 0, Math.floor(i / 4) * 4 - 3); model.rotation.y = .45;
      const enemy = { species: type, mode: 'idle', airborne: false }; animateAnimal(model, enemy, 1, 0, 0); scene.add(model);
    });
    for (let i = 0; i < 3; i++) {
      const weapon = ['sword', 'spear', 'bow'][i]; const human = character(); dressArmor(human, i + 1);
      const model = weaponModel(weapon, ['ember_sword', 'dragon_spear', 'frost_bow'][i]); human.userData.hand.add(model); human.userData.weapon = model;
      human.position.set((i - 1) * 3, 0, 6); human.rotation.y = .5;
      animateHuman(human, 1, { weapon, distance: 0, time: 0, attack: 0, action: '', parry: false, dodge: false, jump: 0, landed: false }); scene.add(human);
    }
    const floor = new T.Mesh(new T.PlaneGeometry(60, 60), new T.MeshStandardMaterial({ color: '#a6b19c', roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -.1; scene.add(floor);
    g.renderer.shadowMap.enabled = false; g.renderer.render(scene, camera);
    document.querySelectorAll('#hud, .topbar, .bottom-bar, .world-vignette, #touch-controls, #save-warning').forEach(el => (el as HTMLElement).style.display = 'none');
  });
  await page.screenshot({ path: info.outputPath('actors-studio.png') });
});
