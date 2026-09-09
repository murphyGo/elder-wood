import { test, expect } from '@playwright/test';
import { finalState } from '../helpers/finale-state';

for (const device of [{ name:'desktop', width:1440, height:960, touch:false }, { name:'touch viewport', width:390, height:844, touch:true }]) {
  test.describe(device.name,() => {
    test.use({viewport:{width:device.width,height:device.height},hasTouch:device.touch});
    test('bounds new-region GPU resources and records animated boss frame intervals', async ({page},info) => {
      test.setTimeout(90000); const errors:string[]=[]; page.on('pageerror',e => errors.push(e.message));
      const s=finalState(); await page.addInitScript(s => localStorage.setItem('elderwood-save-v4',JSON.stringify(s)),s);
      await page.goto('/'); await expect(page.locator('#loading')).toHaveCount(0,{timeout:30000});
      const geometries:number[][]=[];
      for (let cycle=0;cycle<3;cycle++) {
        const counts:number[]=[];
        for (const zone of ['ruins','roots','trial','harbor','village']) {
          await page.evaluate(zone => {const g=(window as any).__ELDERWOOD__;g.loadZone(zone);g.setPaused(true);},zone);
          await page.waitForTimeout(120); counts.push(await page.evaluate(() => (window as any).__ELDERWOOD__.renderer.info.memory.geometries));
        }
        geometries.push(counts);
      }
      expect(geometries[2]).toEqual(geometries[1]);
      await page.evaluate(() => {const g=(window as any).__ELDERWOOD__;g.startTrial('starwarden',1);});
      await page.waitForTimeout(500);
      const metrics=await page.evaluate(async () => {
        const g=(window as any).__ELDERWOOD__, samples:number[]=[]; let last=performance.now();
        await new Promise<void>(resolve => { const frame=(now:number) => {samples.push(now-last);last=now;if(samples.length<180)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame); });
        samples.shift(); samples.sort((a,b)=>a-b);
        const gl=g.renderer.getContext(), debug=gl.getExtension('WEBGL_debug_renderer_info');
        return { userAgent:navigator.userAgent, gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unavailable', viewport:[innerWidth,innerHeight], drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight], quality:g.quality, medianMs:samples[Math.floor(samples.length*.5)], p95Ms:samples[Math.floor(samples.length*.95)], samples:samples.length, ...g.renderer.info.render, geometries:g.renderer.info.memory.geometries };
      });
      expect(metrics.samples).toBe(179); expect(errors).toEqual([]);
      console.log(`PHASE4_RENDER ${device.name}`,JSON.stringify({metrics,geometries}));
      await info.attach('render-measurements',{body:JSON.stringify({metrics,geometries},null,2),contentType:'application/json'});
      await page.screenshot({animations:'disabled',path:info.outputPath('echoes-boss.png')});
    });
  });
}
