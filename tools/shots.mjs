// Drives the real UI (audio on, real clock) and saves screenshots of each screen: a fresh player first,
// then the career screens (c-*) from a seeded save, a remix (r-*) and every glyph at strip and card size
// (icons). Prints the visible words on the card screens and the HUD (words), so text creep shows up.
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
// Visible words under a root: text nodes that are rendered (key caps are CSS glyphs, not text).
const wordsIn = (sel) => page.evaluate((s) => {
  const root = document.querySelector(s);
  if (!root) return { n: 0, text: [] };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n = 0;
  const text = [];
  while (walker.nextNode()) {
    const p = walker.currentNode.parentElement;
    if (!p || (!p.offsetParent && getComputedStyle(p).position !== 'fixed')) continue;
    let hidden = false;
    for (let e = p; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) { hidden = true; break; }
    }
    if (hidden) continue;
    const w = walker.currentNode.textContent.trim().split(/\s+/).filter(Boolean);
    n += w.length;
    if (w.length) text.push(walker.currentNode.textContent.trim());
  }
  return { n, text };
}, sel);
const words = {};

await page.goto(`${url}/index.html?bot=1&seed=5`);
await wait(900);
await snap('1-title');
await press('[data-act=play]');
await wait(700);
await snap('2-select');
words.select = await wordsIn('#screens');
await press('.card[data-i="0"]');
await wait(6000);
await snap('3-play-early');
await wait(3200);
words.hudEarly = await wordsIn('#hud');
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
words.hudFull = await wordsIn('#hud');
// The Drop meter full: the closed ring around the speaker and, the first time in a run, its key cap.
await page.evaluate(() => { const g = window.__LS.game; window.__LS.opts.bot = false; g.dropCharge = g.dropMax; });
await wait(400);
const vp = page.viewportSize();
await page.screenshot({ path: `${outDir}/${tag}-4d-drop.png`, clip: { x: vp.width / 2 - 130, y: vp.height / 2 - 130, width: 260, height: 260 } });
// A boss: the HUD shows its name and bar, nothing else. Knocked off the beat, it wears a white ring.
await page.evaluate(async () => {
  const { game: g, seq } = window.__LS;
  g.dropCharge = 0;
  const { spawnEnemy } = await import('/src/game/enemies.js');
  const e = spawnEnemy(g, 'drone', g.player.x + 260, g.player.y - 40);
  e.ai.offbeatUntil = seq.bar + 3;
  g.hooks.onBossCue?.('stagger', e);
});
await wait(250);
await snap('4b-boss');
words.hudBoss = await wordsIn('#hud');
await page.evaluate(() => {
  const g = window.__LS.game;
  g.enemies = g.enemies.filter((e) => !e.boss);
  g.boss = null;
  g.hooks.onBoss?.(null);
  window.__LS.opts.bot = true;
});
await page.evaluate(() => { const g = window.__LS.game; g.pendingLevels = 1; });
await wait(600);
await snap('5-levelup');
words.levelup = await wordsIn('#screens');
await page.hover('.card[data-i="1"]').catch(() => {});
await wait(1200);
await snap('6-levelup-hover');
// The info layer: every card's details on demand.
await press('[data-act=info]');
await wait(300);
await snap('6i-levelup-info');
words.levelupInfo = await wordsIn('#screens');
await press('[data-act=info]');
await wait(200);
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

// A remix: the card (a level 5 sound with its pedal on the board), then play with the gold rims on its attacks.
page = await newPage(null);
await page.goto(`${url}/index.html?bot=1&seed=7&give=flute:5,kick808:3,upright:3&pedals=delay:2`);
await wait(900);
await press('[data-act=play]');
await wait(700);
await press('.card[data-i="0"]');
await wait(2500);
await page.evaluate(() => { const g = window.__LS.game; g.pendingLevels = 1; });
await wait(700);
await snap('r1-remix-card');
await page.evaluate(() => { const g = window.__LS.game; const i = g.offers.findIndex((o) => o.kind === 'remix'); g.choose(i >= 0 ? i : 0); });
await wait(5000);
await snap('r2-remix-play');
words.hudRemix = await wordsIn('#hud');

// Every glyph at strip size (22 px) and card size (64 px), a row per channel (Synth, Live, 8-Bit, Heavy,
// Orchestra), then the pedals and the UI glyphs.
page = await newPage(null);
await page.goto(`${url}/tools/blank.html`);
await page.evaluate(async () => {
  const { ICONS, icon } = await import('/src/ui/icons.js');
  const rows = [
    ['beat', 'kick808', 'taiko', 'chipdrums', 'doublekick', 'timpani'], ['perc', 'hats909', 'shaker', 'chiphat', 'ride', 'fieldsnare'],
    ['bass', 'subbass', 'upright', 'tribass', 'dropd', 'cellos'], ['chords', 'supersaw', 'rhodes', 'chipchords', 'powerchords', 'strings'],
    ['lead', 'sawlead', 'flute', 'squarelead', 'shred', 'horn'], ['arp', 'arpsynth', 'musicbox', 'chiparp', 'pinch', 'harp'],
    ['reverb', 'delay', 'overdrive', 'compressor', 'chorus', 'wah', 'bitcrusher'],
    ['plus', 'up', 'swap', 'lock', 'reroll', 'banish', 'skip', 'info', 'tape', 'drop', 'vinyl', 'pedal', 'fader', 'heal', 'score', 'keys', 'stick', 'finger', 'padA', 'space', 'boss'],
  ];
  const col = { beat: '#ff5b6b', perc: '#ffb547', bass: '#9b78ff', chords: '#3fcdf5', lead: '#55efb3', arp: '#ff86d8' };
  document.body.style.cssText = 'margin:0;background:#0d0a17;color:#f3eeff;font:11px monospace;padding:12px';
  document.body.innerHTML = rows.map((r) => `<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin-bottom:8px">${r.map((id) => `<div style="display:grid;justify-items:center;gap:3px;width:${r.length > 10 ? 44 : 84}px;color:${col[r[0]] || '#f3eeff'}">${r.length > 10 ? '' : `<span style="width:64px;height:64px">${icon(id)}</span>`}<span style="width:22px;height:22px">${icon(id)}</span><small style="color:#a89fc8">${ICONS[id] ? id : `${id}?`}</small></div>`).join('')}</div>`).join('');
  document.querySelectorAll('svg').forEach((s) => { s.style.width = '100%'; s.style.height = '100%'; s.style.display = 'block'; });
});
await snap('icons');

// Every card frame: the five styles, a pedal, a remix and a bonus card, built from describeOffer's shape.
// Until config.js has a style, the harness lends it a stand-in color.
await page.evaluate(async () => {
  const { STYLES, ROLE_INFO } = await import('/src/config.js');
  STYLES.heavy ||= { name: 'Heavy', color: '#ff7a45' };
  STYLES.orchestra ||= { name: 'Orchestra', color: '#e9d39b' };
  const { cardHtml } = await import('/src/ui/screens.js');
  const lane = (s) => Array.from({ length: 16 }, (_, i) => ({ on: s.includes(i), isNew: i === s[s.length - 1], v: 1 }));
  const card = (kind, title, role, style, glyph, extra = {}) => ({ kind, title, color: ROLE_INFO[role]?.color || extra.color, style, glyph, from: null, level: 1, maxLevel: 5, cells: lane([0, 4, 8, 12]), gems: [], slot: { role }, info: ['Every sentence the card used to show lives here.'], ...extra });
  const descs = [
    card('new', '808 Kick', 'beat', 'synth', 'kick808', { gems: [{ style: 'synth', n: 2, delta: 1, tier: 1 }] }),
    card('up', 'Upright Bass', 'bass', 'organic', 'upright', { level: 3, cells: lane([0, 3, 6, 10]) }),
    card('swap', 'Square Lead', 'lead', 'chip', 'squarelead', { from: 'sawlead', level: 2, gems: [{ style: 'chip', n: 3, delta: 1, tier: 0 }, { style: 'synth', n: 1, delta: -1, tier: -1 }] }),
    card('new', 'Double Kick', 'beat', 'heavy', 'doublekick', { gems: [{ style: 'heavy', n: 4, delta: 1, tier: 1 }, { style: 'fusion', n: 0, delta: 0, tier: 1 }] }),
    card('new', 'French Horn', 'lead', 'orchestra', 'horn', { gems: [{ style: 'orchestra', n: 1, delta: 1, tier: 0 }] }),
    { kind: 'pedal-new', title: 'Tape Delay', color: '#ffcf70', style: null, glyph: 'delay', from: null, level: 1, maxLevel: 3, cells: null, gems: [], slot: { pedal: 0 }, info: ['Notes repeat a dotted eighth later.'] },
    card('remix', 'Canon', 'lead', 'organic', 'flute', { level: 5, cells: lane([0, 2, 5, 8, 10, 13]) }),
    { kind: 'heal', title: 'Breather', color: '#ff6f8a', style: null, glyph: 'heal', from: null, level: 0, maxLevel: 0, cells: null, gems: [], slot: null, info: ['Restore 40% of your health.'] },
  ];
  document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="/styles.css">');
  await new Promise((r) => setTimeout(r, 300));
  document.body.innerHTML = `<div id="screens" style="position:static;overflow:visible;padding:24px"><div class="cards-wrap"><div class="cards" style="grid-template-columns:repeat(4,232px)">${descs.map((d, i) => cardHtml(d, i)).join('')}</div></div></div>`;
});
await wait(300);
await snap('cards');
console.log(JSON.stringify({ words: Object.fromEntries(Object.entries(words).map(([k, v]) => [k, `${v.n}: ${v.text.join(' | ')}`])), logs: logs.filter((l) => !/Failed to load resource/.test(l)).slice(0, 20) }, null, 2));
await browser.close();
server.close();
