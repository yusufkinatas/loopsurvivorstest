// Drives the real UI (audio on, real clock) and saves screenshots of each screen: a fresh player first,
// then the career screens (c-*) from a seeded save.
//   node tools/shots.mjs [outdir] [--mobile]
import { serve, launch } from './serve.mjs';
import { mkdir } from 'node:fs/promises';

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--')) || 'shots';
const mobile = args.includes('--mobile');
await mkdir(outDir, { recursive: true });

const { server, url } = await serve();
const browser = await launch();
const logs = [];
async function newPage(save) {
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: mobile ? 2 : 1,
    hasTouch: mobile, isMobile: mobile, ignoreHTTPSErrors: true,
  });
  if (save) await ctx.addInitScript((s) => localStorage.setItem('loop-survivors:v1', JSON.stringify(s)), save);
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  p.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  return p;
}
let page = await newPage(null);
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

// The career: a seeded save with records (gold, demo, a Gain tag, a hidden track), remixes, most goals and
// Gain 1-3 open. Then a short run that earns two first sounds, for the liner notes and the Listen line.
const band = ['kick808', 'upright', 'supersaw', 'sawlead', 'hats909', 'arpsynth'];
const sheet = Array.from({ length: 9 }, (_, i) => ({ index: i, band: band.slice(0, Math.min(6, i + 1)).map((id) => [id, Math.min(5, 1 + (i >> 1)), 0]), pedals: i > 2 ? [['reverb', 2]] : [] }));
const rec = (s, k, kp, w, g) => ({ s, k, kp, w, g, sh: sheet, d: '2026-10-18' });
const goals = Object.fromEntries(['fullband', 'clipper', 'synth4', 'live4', 'remix', 'king', 'maxed', 'win', 'chip4'].map((id) => [id, 1]));
page = await newPage({
  best: { score: 182340, time: 512, kills: 13000, level: 40, won: true, section: 'Finale', bar: 260, genre: 'Neon Synthwave', gain: 3 },
  meta: {
    v: 1, runs: 12, wins: 3, kills: 48210, secs: 5520, goals, gainMax: 3, gainSel: 2,
    records: { 'Neon Synthwave': rec(182340, 'C minor', 0, 1, 3), Synthwave: rec(120400, 'A minor', 9, 0, 0), 'Live band': rec(154000, 'E minor', 4, 1, 0), Synthpop: rec(70000, 'D minor', 2, 0, 0) },
    remixes: { sawlead: 1, kick808: 1, musicbox: 1, flute: 1, chipchords: 1 },
  },
});
await page.goto(`${url}/index.html?seed=5`);
await wait(900);
await snap('c1-title');
await press('[data-act=disco]');
await wait(400);
await press('button.sleeve >> nth=0');
await wait(1200);
await snap('c2-records');
await press('[data-page=remixes]');
await wait(300);
await snap('c3-remixes');
await press('[data-page=notes]');
await wait(300);
await snap('c4-notes');
await press('[data-act=back]');
await wait(400);
await press('[data-act=play]');
await wait(700);
await page.evaluate(() => document.querySelector('.gain').scrollIntoView({ block: 'center' }));
await snap('c5-select');
await press('.chip >> nth=0');
await wait(2500);
await page.evaluate(() => { const g = window.__LS.game; g.bossKills.push('drone'); g.staggers = 1; g.player.iframes = 0; g.player.hp = 1; g.hurt(50, null); });
await wait(2500);
await press('[data-act=listen]');
await wait(1200);
await snap('c6-end');
console.log(JSON.stringify({ logs: logs.filter((l) => !/Failed to load resource/.test(l)).slice(0, 20) }, null, 2));
await browser.close();
server.close();
