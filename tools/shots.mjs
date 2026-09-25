// Drives the real UI (audio on, real clock) and saves screenshots of each screen.
//   node tools/shots.mjs [outdir] [--mobile]
import { serve, launch } from './serve.mjs';
import { mkdir } from 'node:fs/promises';

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--')) || 'shots';
const mobile = args.includes('--mobile');
await mkdir(outDir, { recursive: true });

const { server, url } = await serve();
const browser = await launch();
const ctx = await browser.newContext({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  deviceScaleFactor: mobile ? 2 : 1,
  hasTouch: mobile, isMobile: mobile, ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
const tag = mobile ? 'm' : 'd';
const snap = (name) => page.screenshot({ path: `${outDir}/${tag}-${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(`${url}/index.html?bot=1&seed=5`);
await wait(900);
await snap('1-title');
await page.click('[data-act=play]');
await wait(700);
await snap('2-select');
await page.click('.card[data-i="0"]');
await wait(6000);
await snap('3-play-early');
// Fast-forward: give a full band and some pedals so the HUD and arena are busy.
await page.evaluate(async () => {
  const { game } = window.__LS;
  const mod = await import('/src/content/instruments/index.js');
  const ped = await import('/src/content/pedals.js');
  for (const def of mod.INSTRUMENTS) {
    if (!game.loadout.channels[def.role]) game.addInstrument(def, 3);
  }
  for (const id of ['reverb', 'delay', 'overdrive']) if (!game.loadout.pedal(id)) game.loadout.pedals.push({ def: ped.PEDAL_BY_ID[id], level: 2 });
  game.onLoadoutChanged();
});
await wait(7000);
await snap('4-play-full');
await page.evaluate(() => { const g = window.__LS.game; g.pendingLevels = 1; });
await wait(600);
await snap('5-levelup');
await page.hover('.card[data-i="1"]').catch(() => {});
await wait(1200);
await snap('6-levelup-hover');
await page.keyboard.press('1');
await wait(500);
await page.evaluate(() => document.querySelector('.pausebtn')?.click());
await wait(500);
await snap('7-pause');
await page.click('[data-act=resume]').catch(() => {});
await wait(400);
await page.evaluate(() => { const g = window.__LS.game; g.opts.god = false; g.player.iframes = 0; g.player.hp = 1; g.hurt(50, null); });
await wait(900);
await snap('8-end');
await page.click('[data-act=howto]').catch(() => {});
console.log(JSON.stringify({ logs: logs.filter((l) => !/Failed to load resource/.test(l)).slice(0, 20) }, null, 2));
await browser.close();
server.close();
