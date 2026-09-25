// Headless balance / smoke run. Loads the game with ?sim=1 (no audio, simulated clock) and an
// autopilot, runs until the run ends or the time limit, then prints metrics as JSON.
//
//   node tools/sim.mjs "speed=12&bot=1&minutes=8"            # full autopiloted run
//   node tools/sim.mjs "speed=12&bot=1&god=1&minutes=8" --screenshot out.png
//   node tools/sim.mjs "god=1&start=kick808&give=taiko:5" --timeout 60 --summary
//
// Flags: --timeout <s> (wall clock, default 240), --screenshot <path>, --summary (short output), --runs N.
import { serve, launch } from './serve.mjs';

const args = process.argv.slice(2);
const query = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a) && !a.endsWith('.png')) || 'speed=12&bot=1&minutes=8';
const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const timeout = Number(flag('--timeout', 240)) * 1000;
const shot = flag('--screenshot', null);
const summary = args.includes('--summary');
const runs = Number(flag('--runs', 1));

const { server, url } = await serve();
const browser = await launch();
const results = [];
try {
  for (let r = 0; r < runs; r++) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
    const logs = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}\n${e.stack || ''}`));
    let q = query.includes('sim=') ? query : `sim=1&${query}`;
    if (runs > 1 && !/seed=/.test(q)) q += `&seed=${r + 1}`;
    const t0 = Date.now();
    await page.goto(`${url}/index.html?${q}`);
    try {
      await page.waitForFunction(() => window.__LS && window.__LS.done, null, { timeout, polling: 500 });
    } catch (e) {
      logs.push(`timeout after ${timeout / 1000}s wall clock`);
    }
    const m = await page.evaluate(() => (window.__LS ? window.__LS.metrics() : null));
    if (shot) await page.screenshot({ path: runs > 1 ? shot.replace('.png', `-${r + 1}.png`) : shot });
    await page.close();
    const wall = ((Date.now() - t0) / 1000).toFixed(1);
    if (!m) { results.push({ error: 'no metrics', logs }); continue; }
    const out = summary
      ? { state: m.state, time: Math.round(m.time), level: m.level, kills: m.kills, hp: Math.round(m.hp), section: m.section, bosses: m.bosses, errors: m.errors,
          damageTaken: m.damageTaken, drops: m.drops, bossAlive: m.bossesAlive, filledAt: (m.samples.find((s) => s.filled >= 6) || {}).t ?? null, loadout: m.loadout.map((i) => `${i.id}:${i.level}:${i.dmg}`), pedals: m.pedals.map((p) => `${p.id}:${p.level}`), genre: m.genre, wall, logs: logs.slice(0, 12) }
      : { ...m, wall, logs: logs.slice(0, 40) };
    results.push(out);
  }
} finally {
  await browser.close();
  server.close();
}
console.log(JSON.stringify(runs === 1 ? results[0] : results, null, summary ? 0 : 2));
