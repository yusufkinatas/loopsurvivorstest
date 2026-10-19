// Headless balance / smoke run. Loads the game with ?sim=1 (no audio, simulated clock) and an
// autopilot, runs until the run ends or the time limit, then prints metrics as JSON.
//
//   node tools/sim.mjs "speed=12&bot=1&minutes=8"            # full autopiloted run
//   node tools/sim.mjs "speed=12&bot=1&god=1&minutes=8" --screenshot out.png
//   node tools/sim.mjs "god=1&start=kick808&give=taiko:5" --timeout 60 --summary
//   node tools/sim.mjs "speed=12&bot=1&minutes=10" --summary --runs 16 --parallel 4
//
// Flags: --timeout <s> (wall clock per run, default 240), --screenshot <path>, --summary (short output),
// --runs N (seeds 1..N unless the query sets one), --parallel N (pages at once; results stay in seed order).
// Exits with 1 when a run crashed, threw, timed out or produced no metrics; the other runs still print.
import { serve, launch } from './serve.mjs';

const args = process.argv.slice(2);
const query = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a) && !a.endsWith('.png')) || 'speed=12&bot=1&minutes=8';
const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const timeout = Number(flag('--timeout', 240)) * 1000;
const shot = flag('--screenshot', null);
const summary = args.includes('--summary');
const runs = Number(flag('--runs', 1));
const parallel = Math.max(1, Number(flag('--parallel', 1)) || 1);

async function run(browser, url, r) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}\n${e.stack || ''}`));
  const crashed = new Promise((resolve) => page.once('crash', resolve));   // a crashed page never reports done
  let q = query.includes('sim=') ? query : `sim=1&${query}`;
  if (runs > 1 && !/seed=/.test(q)) q += `&seed=${r + 1}`;
  const t0 = Date.now();
  await page.goto(`${url}/index.html?${q}`);
  try {
    await Promise.race([page.waitForFunction(() => window.__LS && window.__LS.done, null, { timeout, polling: 500 }), crashed]);
  } catch (e) {
    logs.push(`timeout after ${timeout / 1000}s wall clock`);
  }
  const m = await page.evaluate(() => (window.__LS ? window.__LS.metrics() : null));
  if (shot) await page.screenshot({ path: runs > 1 ? shot.replace('.png', `-${r + 1}.png`) : shot });
  await page.close();
  const wall = ((Date.now() - t0) / 1000).toFixed(1);
  if (!m) return { error: 'no metrics', logs };
  const round = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, Math.round(v)]));
  return summary
    ? { state: m.state, time: Math.round(m.time), level: m.level, kills: m.kills, hp: Math.round(m.hp), section: m.section, bosses: m.bosses, errors: m.errors,
        damageTaken: round(m.damageTaken), damageBy: round(m.damageBy), lastHitBy: m.lastHitBy,
        bossLog: (m.bossLog || []).map((b) => `${b.type}:${b.spawn.toFixed(1)}-${b.end === null ? 'alive' : `${b.end.toFixed(1)}:${b.how}`}`),
        drops: m.drops, bossAlive: m.bossesAlive, bossesSpawned: m.bossesSpawned, sectionIndex: m.sectionIndex, cap: m.cap, dropState: m.dropState, filledAt: (m.samples.find((s) => s.filled >= 6) || {}).t ?? null, loadout: m.loadout.map((i) => `${i.id}:${i.level}:${i.dmg}`), pedals: m.pedals.map((p) => `${p.id}:${p.level}`), genre: m.genre, remixes: m.remixes, deadScreens: m.deadScreens, wall, logs: logs.slice(0, 12) }
    : { ...m, wall, logs: logs.slice(0, 40) };
}

const { server, url } = await serve();
const browser = await launch();
const results = new Array(runs);
try {
  // A small pool of pages pulling the next seed, so N runs take about runs / parallel rounds.
  let next = 0;
  // A run that crashes or throws keeps its slot as an error, so the other runs still print.
  const worker = async () => { while (next < runs) { const r = next++; results[r] = await run(browser, url, r).catch((e) => ({ error: e.message })); } };
  await Promise.all(Array.from({ length: Math.min(parallel, runs) }, worker));
} finally {
  await browser.close();
  server.close();
}
if (results.some((x) => x.error || x.errors > 0 || x.logs.some((l) => /^(pageerror|timeout)/.test(l)))) process.exitCode = 1;
console.log(JSON.stringify(runs === 1 ? results[0] : results, null, summary ? 0 : 2));
