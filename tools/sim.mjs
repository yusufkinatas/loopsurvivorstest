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
//   chorus2 t224 -131/+40 c38% min34% lv15+6 p6 k1234@260 n3.1% a180 s74/95 kd~200 w3.2 x12 h1/1 d1*1 m2/9 f40
// = section, start time (s), damage taken / healed, contact share (bodies and Snare marks), lowest health,
//   level at the start + levels gained, cards picked, kills @ mean kill distance (px), share of kills within
//   120 px, enemies alive on average, bodies on screen (average / p90), median kill distance (px, 50 px bins),
//   bodies within 150 px on average, damage from charging bodies (x, Stomp and elite dashes, the Drone's charge),
//   hearts spawned/taken, Drops (*perfect), Snare marks that hit/landed, note value that faded on the floor.
// It also adds `tapes` (Master Tapes: d dropped, c collected, s spent, b banked at the end, l lost on the floor) and
// `remixLog` (each remix as it landed: instrument, bar, section, game second).
// With --runs > 1 it then prints one AGGREGATE line (wins, where runs died, median lowest health before the
// Finale, damage by cause: walking contact, bodies = contact + boss + dash, dash, shots, marks and set-piece bodies;
// each boss's share of its section's damage, bosses silenced and faded; from Chorus II on each run's median kill
// distance, kills within 120 px and bodies within 150 px; bodies on screen per section across runs; runs untouched
// across two or more late sections with their band; wall seconds per run; picks, levels at Chorus II and the
// Finale, Drops, boss fight lengths, channels at L5, tapes dropped/collected/lost and the remixes of each run).
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
        drops: m.drops, bossAlive: m.bossesAlive, bossesSpawned: m.bossesSpawned, sectionIndex: m.sectionIndex, cap: m.cap, dropState: m.dropState, filledAt: (m.samples.find((s) => s.filled >= 6) || {}).t ?? null, loadout: m.loadout.map((i) => `${i.id}:${i.level}:${i.dmg}`), pedals: m.pedals.map((p) => `${p.id}:${p.level}`), genre: m.genre, remixes: m.remixes, tapes: tapeLine(m.tapes), remixLog: (m.remixLog || []).map((r) => `${r.id} b${r.bar} ${r.sec} ${Math.round(r.t)}s`), deadScreens: m.deadScreens, perfectDrops: m.perfectDrops, sections: sectionLines(m), wall, logs: logs.slice(0, 12) }
    : { ...m, wall, logs: logs.slice(0, 40) };
  Object.defineProperty(out, 'raw', { value: m, enumerable: false });   // for the aggregate line, not printed
  return out;
}

const pct = (x) => `${Math.round(x * 100)}%`;
const tapeLine = (t) => (t ? `d${t.dropped} c${t.collected} s${t.spent} b${t.banked} l${t.lost}` : null);
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
const median = (a) => { const b = a.filter((x) => x != null && !Number.isNaN(x)).sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : null; };
// The q-quantile of a histogram (bins of `w`), as the bin's upper edge; null when empty.
const binQ = (bins, w, q) => {
  const n = sum(bins || []);
  if (!n) return null;
  let acc = 0;
  for (let i = 0; i < bins.length; i++) { acc += bins[i]; if (acc >= q * n) return (i + 1) * w; }
  return bins.length * w;
};
const addBins = (a, b) => (b || []).forEach((x, i) => { a[i] = (a[i] || 0) + x; });
const KD_W = 50, ON_W = 5;   // the director's ledger bins (director.js)
const BOSS_SEC = { chorus1: 'The Drone', chorus2: 'The Clipper', drop: 'The Glitch King', finale: 'White Noise' };
const LATE = ['chorus2', 'bridge', 'build', 'drop', 'finale'];   // Chorus II on
const SECS = ['intro', 'verse1', 'chorus1', 'verse2', ...LATE];

// One compact line per section of the game's ledger (Game._led, plus the director's crowd and kill bins).
function sectionLines(m) {
  return (m.ledger || []).map((L) => {
    if (!L) return null;
    const dmg = sum(L.dmg), heal = sum(L.heal);
    const close = (L.dmg.contact || 0) + (L.dmg.mark || 0);
    const kd = binQ(L.kd, KD_W, 0.5);
    return `${L.sec} t${Math.round(L.t0)} -${Math.round(dmg)}/+${Math.round(heal)} c${dmg ? pct(close / dmg) : '-'} min${pct(L.minHp)} lv${L.lv0}+${L.levels} p${L.picks}`
      + ` k${L.kills}@${Math.round(L.killDist / Math.max(1, L.nd))} n${(100 * L.near120 / Math.max(1, L.nd)).toFixed(1)}% a${Math.round(L.alive / Math.max(1, L.frames))}`
      + (L.onN ? ` s${Math.round(L.onscr / L.onN)}/${binQ(L.onBins, ON_W, 0.9)} kd~${kd ?? '-'} w${(L.w150 / L.onN).toFixed(1)}` : '')
      + (L.dmg.dash ? ` x${Math.round(L.dmg.dash)}` : '')
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
  let all = 0, contact = 0, marks = 0, shots = 0, boss = 0, dash = 0, sets = 0;
  const focus = {};   // boss -> [damage taken in its section, damage it dealt there (body, dash and shots)]
  for (const m of ms) for (const L of m.ledger || []) if (L) {
    all += sum(L.dmg); contact += L.dmg.contact || 0; marks += L.dmg.mark || 0; shots += L.dmg.shots || 0;
    boss += L.dmg.boss || 0; dash += L.dmg.dash || 0; sets += sum(L.setDmg);
    const bn = BOSS_SEC[L.sec];
    if (bn) { const f = (focus[bn] ||= [0, 0]); f[0] += sum(L.dmg); f[1] += L.by?.[bn] || 0; }
  }
  const share = (x) => pct(x / Math.max(1, all));
  // Crowd and reach from Chorus II on, per run: median kill distance, kills within 120 px, bodies within 150 px.
  const late = ms.map((m) => {
    const kd = [], Ls = (m.ledger || []).filter((L) => L && LATE.includes(L.sec));
    for (const L of Ls) addBins(kd, L.kd);
    const nd = Ls.reduce((a, L) => a + (L.nd || 0), 0), n120 = Ls.reduce((a, L) => a + (L.near120 || 0), 0);
    const on = Ls.reduce((a, L) => a + (L.onN || 0), 0), w = Ls.reduce((a, L) => a + (L.w150 || 0), 0);
    return { kd: binQ(kd, KD_W, 0.5), n120: nd ? n120 / nd : null, w150: on ? w / on : null };
  });
  // On screen per section across runs: the median of the runs' averages / the median of their p90s (max p90).
  const onscr = SECS.map((id) => {
    const avg = [], p90 = [];
    for (const m of ms) { const L = (m.ledger || []).find((x) => x && x.sec === id); if (L?.onN) { avg.push(L.onscr / L.onN); p90.push(binQ(L.onBins, ON_W, 0.9)); } }
    return avg.length ? `${id} ${Math.round(median(avg))}/${median(p90)}(${Math.max(...p90)})` : null;
  }).filter(Boolean);
  // Runs that took no damage across two or more sections from Chorus II on, with their band (for the weapon lanes).
  const untouched = ms.map((m, i) => {
    const clean = (m.ledger || []).filter((L) => L && LATE.includes(L.sec) && sum(L.dmg) < 1).map((L) => L.sec);
    return clean.length >= 2 ? `#${i + 1} ${clean.join('+')} [${(m.loadout || []).map((x) => `${x.id}:${x.level}`).join(' ')} rmx ${(m.remixes || []).join(',') || '-'}]` : null;
  }).filter(Boolean);
  const bossEnds = ms.flatMap((m) => (m.bossLog || []).filter((b) => b.end !== null));
  const silenced = bossEnds.filter((b) => b.how === 'silenced').length, faded = bossEnds.filter((b) => b.how === 'faded').length;
  const picks = ms.map((m) => (m.ledger || []).reduce((a, L) => a + (L?.picks || 0), 0));
  const lvAt = (i) => ms.map((m) => m.ledger?.[i]?.lv0 ?? null);
  const fights = {};
  for (const m of ms) for (const b of m.bossLog || []) (fights[b.type] ||= []).push(b.end === null ? `${Math.round(m.time - b.spawn)}+` : `${Math.round(b.end - b.spawn)}${b.how === 'faded' ? 'f' : ''}`);
  const maxed = ms.map((m) => (m.loadout || []).filter((i) => i.level >= 5).length);
  const hearts = ms.map((m) => (m.ledger || []).reduce((a, L) => a + (L?.hearts || 0), 0));
  const mk = ms.reduce((a, m) => { for (const L of m.ledger || []) if (L) { a[0] += L.markHits; a[1] += L.marks; } return a; }, [0, 0]);
  return `AGGREGATE runs ${ms.length} | wins ${wins} | died in ${deaths.join(',') || '-'} | lowest HP before the Finale ${minPre.map(pct).join(' ')} (median ${pct(median(minPre))})`
    + ` | damage: walking contact ${share(contact)} bodies ${share(contact + boss + dash)} dash ${share(dash)} shots ${share(shots)} marks ${share(marks)} set pieces ${share(sets)}`
    + ` | boss share of its section ${Object.entries(focus).map(([k, f]) => `${k.replace(/^The /, '')} ${pct(f[1] / Math.max(1, f[0]))}`).join(', ')} | bosses silenced ${silenced} faded ${faded}`
    + ` | from Chorus II: kill dist~ ${late.map((x) => x.kd ?? '-').join(' ')} (median ${median(late.map((x) => x.kd)) ?? '-'}) near120 ${late.map((x) => (x.n120 == null ? '-' : pct(x.n120))).join(' ')}`
    + ` w150 ${late.map((x) => (x.w150 == null ? '-' : x.w150.toFixed(1))).join(' ')} | on screen avg/p90(max) ${onscr.join(', ') || '-'}`
    + ` | untouched ${untouched.join('; ') || '-'} | wall ${rs.map((r) => r.wall ?? '-').join(' ')}`
    + ` | picks ${picks.join(' ')} | lv at Chorus II ${lvAt(CHORUS2).join(' ')} at Finale ${lvAt(FINALE).join(' ')}`
    + ` | drops ${ms.map((m) => `${m.drops}${m.perfectDrops ? `*${m.perfectDrops}` : ''}`).join(' ')} | hearts ${hearts.join(' ')} | marks hit ${mk[0]}/${mk[1]}`
    + ` | channels at L5 ${maxed.join(' ')} | fights ${Object.entries(fights).map(([k, v]) => `${k} ${v.join(',')}`).join('; ')}`
    + ` | tapes d/c/l ${ms.map((m) => (m.tapes ? `${m.tapes.dropped}/${m.tapes.collected}/${m.tapes.lost}` : '-')).join(' ')}`
    + ` | remixes ${ms.map((m) => `${(m.remixLog || []).length}${(m.remixLog || []).length ? `(${m.remixLog.map((r) => `b${r.bar}`).join(',')})` : ''}`).join(' ')}`;
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
