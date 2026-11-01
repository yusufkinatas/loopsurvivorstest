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
//
// --summary adds `sections` to each run: one line per song section from the game's ledger,
//   chorus2 t224 -131/+40 c38% min34% lv15+6 p6 k1234@260 n3.1% a180 h1/1 d1*1 m2/9 f40
// = section, start time (s), damage taken / healed, contact share (bodies and Snare marks), lowest health,
//   level at the start + levels gained, cards picked, kills @ mean kill distance (px), share of kills within
//   120 px, enemies alive on average, hearts spawned/taken, Drops (*perfect), Snare marks that hit/landed,
//   note value that faded on the floor.
// With --runs > 1 it then prints one AGGREGATE line (wins, where runs died, median lowest health before the
// Finale, contact share, picks, levels at Chorus II and the Finale, Drops, boss fight lengths, channels at L5).
// With god=1 the ledger still records the damage you would have taken.
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
  const out = summary
    ? { state: m.state, time: Math.round(m.time), level: m.level, kills: m.kills, hp: Math.round(m.hp), section: m.section, bosses: m.bosses, errors: m.errors,
        damageTaken: round(m.damageTaken), damageBy: round(m.damageBy), lastHitBy: m.lastHitBy,
        bossLog: (m.bossLog || []).map((b) => `${b.type}:${b.spawn.toFixed(1)}-${b.end === null ? 'alive' : `${b.end.toFixed(1)}:${b.how}`}`),
        drops: m.drops, bossAlive: m.bossesAlive, bossesSpawned: m.bossesSpawned, sectionIndex: m.sectionIndex, cap: m.cap, dropState: m.dropState, filledAt: (m.samples.find((s) => s.filled >= 6) || {}).t ?? null, loadout: m.loadout.map((i) => `${i.id}:${i.level}:${i.dmg}`), pedals: m.pedals.map((p) => `${p.id}:${p.level}`), genre: m.genre, remixes: m.remixes, deadScreens: m.deadScreens, perfectDrops: m.perfectDrops, sections: sectionLines(m), wall, logs: logs.slice(0, 12) }
    : { ...m, wall, logs: logs.slice(0, 40) };
  Object.defineProperty(out, 'raw', { value: m, enumerable: false });   // for the aggregate line, not printed
  return out;
}

const pct = (x) => `${Math.round(x * 100)}%`;
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
const median = (a) => { const b = a.filter((x) => x != null && !Number.isNaN(x)).sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : null; };

// One compact line per section of the game's ledger (Game._led).
function sectionLines(m) {
  return (m.ledger || []).map((L) => {
    if (!L) return null;
    const dmg = sum(L.dmg), heal = sum(L.heal);
    const close = (L.dmg.contact || 0) + (L.dmg.mark || 0);
    return `${L.sec} t${Math.round(L.t0)} -${Math.round(dmg)}/+${Math.round(heal)} c${dmg ? pct(close / dmg) : '-'} min${pct(L.minHp)} lv${L.lv0}+${L.levels} p${L.picks}`
      + ` k${L.kills}@${Math.round(L.killDist / Math.max(1, L.nd))} n${(100 * L.near120 / Math.max(1, L.nd)).toFixed(1)}% a${Math.round(L.alive / Math.max(1, L.frames))}`
      + ` h${L.hearts}/${L.heartsTaken} d${L.drops}${L.perfect ? `*${L.perfect}` : ''} m${L.markHits}/${L.marks} f${Math.round(L.faded)}`;
  }).filter(Boolean);
}

// One line across all runs: what a balance pass reads first.
function aggregate(rs) {
  const ms = rs.map((r) => r.raw).filter(Boolean);
  if (!ms.length) return 'AGGREGATE no metrics';
  const FINALE = 8, CHORUS2 = 4;
  const wins = ms.filter((m) => m.state === 'victory' || (m.bosses > 0 && m.bossKills?.includes('whitenoise'))).length;
  const deaths = ms.filter((m) => m.state === 'gameover').map((m) => m.section);
  const minPre = ms.map((m) => Math.min(1, ...(m.ledger || []).slice(0, FINALE).filter(Boolean).map((L) => L.minHp)));
  let all = 0, contact = 0, marks = 0;
  for (const m of ms) for (const L of m.ledger || []) if (L) { all += sum(L.dmg); contact += L.dmg.contact || 0; marks += L.dmg.mark || 0; }
  const picks = ms.map((m) => (m.ledger || []).reduce((a, L) => a + (L?.picks || 0), 0));
  const lvAt = (i) => ms.map((m) => m.ledger?.[i]?.lv0 ?? null);
  const fights = {};
  for (const m of ms) for (const b of m.bossLog || []) (fights[b.type] ||= []).push(b.end === null ? `${Math.round(m.time - b.spawn)}+` : `${Math.round(b.end - b.spawn)}${b.how === 'faded' ? 'f' : ''}`);
  const maxed = ms.map((m) => (m.loadout || []).filter((i) => i.level >= 5).length);
  const hearts = ms.map((m) => (m.ledger || []).reduce((a, L) => a + (L?.hearts || 0), 0));
  const mk = ms.reduce((a, m) => { for (const L of m.ledger || []) if (L) { a[0] += L.markHits; a[1] += L.marks; } return a; }, [0, 0]);
  return `AGGREGATE runs ${ms.length} | wins ${wins} | died in ${deaths.join(',') || '-'} | lowest HP before the Finale ${minPre.map(pct).join(' ')} (median ${pct(median(minPre))})`
    + ` | contact ${pct(contact / Math.max(1, all))} +marks ${pct((contact + marks) / Math.max(1, all))} | picks ${picks.join(' ')} | lv at Chorus II ${lvAt(CHORUS2).join(' ')} at Finale ${lvAt(FINALE).join(' ')}`
    + ` | drops ${ms.map((m) => `${m.drops}${m.perfectDrops ? `*${m.perfectDrops}` : ''}`).join(' ')} | hearts ${hearts.join(' ')} | marks hit ${mk[0]}/${mk[1]}`
    + ` | channels at L5 ${maxed.join(' ')} | fights ${Object.entries(fights).map(([k, v]) => `${k} ${v.join(',')}`).join('; ')}`;
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
if (summary && runs > 1) console.log(aggregate(results));
