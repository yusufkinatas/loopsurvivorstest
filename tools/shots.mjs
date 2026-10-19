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
const press = (sel) => (mobile ? page.tap(sel) : page.click(sel));   // a phone taps, so prompts follow touch

await page.goto(`${url}/index.html?bot=1&seed=5`);
await wait(900);
await snap('1-title');
await press('[data-act=play]');
await wait(700);
await snap('2-select');
await press('.card[data-i="0"]');
await wait(6000);
await snap('3-play-early');
// Fast-forward: give a full band and some pedals so the HUD and arena are busy. XP opens no level-ups from
// here on, so the full-band shot shows play (the level-up shot opens one itself).
await page.evaluate(async () => {
  const { game } = window.__LS;
  game.opts.solo = true;
  for (let i = 0; i < 20 && game.state === 'levelup'; i++) game.choose(0);
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
if (mobile) await press('.card[data-i="0"]');
else await page.keyboard.press('1');
await wait(500);
await page.evaluate(() => document.querySelector('.pausebtn')?.click());
await wait(500);
await snap('7-pause');
await press('[data-act=resume]').catch(() => {});
await wait(400);
await page.evaluate(() => { const g = window.__LS.game; g.opts.god = false; g.player.iframes = 0; g.player.hp = 1; g.hurt(50, null); });
await wait(2500);   // the death beat (0.9 s) and the screen fade, so the end screen is settled
await snap('8-end');
await press('[data-act=back]');   // the end screen's Title button
await wait(500);
await press('[data-act=howto]');
await wait(500);
await snap('9-howto');
console.log(JSON.stringify({ logs: logs.filter((l) => !/Failed to load resource/.test(l)).slice(0, 20) }, null, 2));
await browser.close();
server.close();
