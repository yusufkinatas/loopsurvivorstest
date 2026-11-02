// Instrument parity in one table: each sound alone (invincible, no level-ups, autopilot, seed 7) at level 1,
// at level 5, and remixed with its paired pedal at 3 next to level 5 with the same pedal.
//
//   node tools/parity.mjs --ids doublekick,timpani      # these sounds
//   node tools/parity.mjs --style heavy                 # the six sounds of a style
//   node tools/parity.mjs --role beat                   # every sound of a channel
//   node tools/parity.mjs --style heavy --no-remix      # level 1 and level 5 only (half the runs)
//
// Columns: total damage the sound dealt, its kills, and its damage on The Drone (it arrives at 96 s and has
// about 2.1k health: a level 5 sound should land 1.9k to 2.1k in its chorus). L1 and L5 run 3 minutes;
// L5+p (level 5 with the remix pedal at 3) and Rx (the remix) run 2.2 minutes, so compare Rx with L5+p.
// A flag (!) marks a number outside its channel's band (BANDS below) or a remix no better than its level 5.
// Flags: --parallel N (pages at once, default 2; keep it at 2 on a shared machine), --timeout s (per run,
// default 120), --seed N (default 7), --song N (a song of the setlist, default 0), --tex role:transform,... (that
// transform in place of each of the role's full phrases, e.g. --tex lead:q_ode). Remix runs never count a
// Signature (sig=0), so Rx compares the remix itself with L5+p. Exits 1 when a run errors, so it also works as a
// smoke test.
import { serve, launch } from './serve.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const parallel = Math.max(1, Number(flag('--parallel', 2)) || 2);
const timeout = Number(flag('--timeout', 120)) * 1000;
const seed = Number(flag('--seed', 7));
const remixToo = !args.includes('--no-remix');
const song = flag('--song', null), tex = flag('--tex', null);

// Total damage bands per channel at level 1 and level 5 (3-minute solo, seed 7), from the Synth, Live and
// 8-Bit sounds of each channel measured on 2026-11-01: 0.9x the lowest to 1.1x the highest, to 0.5k.
//   beat   L1 6.54-13.9k   L5 21.9-31.3k      perc   L1 5.28-7.37k   L5 19.5-25.5k
//   bass   L1 7.08-14.4k   L5 20.0-22.7k      chords L1 6.57-12.7k   L5 18.8-29.2k
//   lead   L1 6.99-10.7k   L5 20.6-25.0k      arp    L1 8.94-12.5k   L5 20.3-26.7k
// Re-measure with node tools/parity.mjs --style synth (and organic, chip) --no-remix after a balance pass.
const BANDS = {
  beat:   { l1: [5500, 15500], l5: [19500, 34500] },
  perc:   { l1: [4500, 8500],  l5: [17500, 28500] },
  bass:   { l1: [6000, 16000], l5: [18000, 25000] },
  chords: { l1: [5500, 14000], l5: [16500, 32500] },
  lead:   { l1: [6000, 12000], l5: [18500, 27500] },
  arp:    { l1: [8000, 14000], l5: [18000, 29500] },
};
const DRONE = [1900, 2100];

const { server, url } = await serve();
const browser = await launch();
const page0 = await browser.newPage();
await page0.goto(`${url}/tools/blank.html`);
const defs = await page0.evaluate(async () => {
  const { INSTRUMENTS } = await import('/src/content/instruments/index.js');
  return INSTRUMENTS.map((d) => ({ id: d.id, role: d.role, style: d.style, pedal: d.remix?.pedal, remix: d.remix?.name }));
});
await page0.close();

const ids = (flag('--ids', '') || '').split(',').filter(Boolean);
const style = flag('--style', null), role = flag('--role', null);
const chosen = defs.filter((d) => ids.includes(d.id) || d.style === style || d.role === role);
for (const id of ids) if (!defs.some((d) => d.id === id)) console.log(`unknown instrument ${id}`);
if (!chosen.length) {
  console.log('usage: node tools/parity.mjs --ids a,b | --style <style> | --role <role> [--no-remix] [--parallel 2]');
  await browser.close(); server.close();
  process.exit(2);
}

const base = `speed=16&bot=1&god=1&solo=1&seed=${seed}${song !== null ? `&song=${song}` : ''}${tex ? `&tex=${tex}` : ''}`;
const jobs = [];
for (const d of chosen) {
  const q = `${base}&start=${d.id}`;
  jobs.push({ d, kind: 'l1', q: `${q}&minutes=3&give=${d.id}:1` });
  jobs.push({ d, kind: 'l5', q: `${q}&minutes=3&give=${d.id}:5` });
  if (remixToo && d.pedal) {
    jobs.push({ d, kind: 'l5p', q: `${q}&minutes=2.2&give=${d.id}:5&pedals=${d.pedal}:3` });
    jobs.push({ d, kind: 'rx', q: `${q}&minutes=2.2&give=${d.id}:5&pedals=${d.pedal}:3&remix=${d.id}&sig=0` });
  }
}

// Damage on bosses is counted by wrapping the game's hit() before the run starts (only hits with a source:
// the sound's own, not the Drop's).
const hook = () => {
  let ls;
  Object.defineProperty(window, '__LS', {
    configurable: true,
    get() { return ls; },
    set(v) {
      ls = v;
      const g = v.game, hit = g.hit, boss = (window.__bossDmg = {});
      g.hit = function (e, dmg, o) {
        if (!e?.boss || e.dead || !((o && o.src) || this.src)) return hit.call(this, e, dmg, o);
        const before = e.hp;
        hit.call(this, e, dmg, o);
        boss[e.type] = (boss[e.type] || 0) + Math.max(0, before - Math.max(0, e.hp));
      };
    },
  });
};

async function run(job) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  await page.addInitScript(hook);
  await page.goto(`${url}/index.html?sim=1&${job.q}`);
  try { await page.waitForFunction(() => window.__LS && window.__LS.done, null, { timeout, polling: 250 }); }
  catch (e) { logs.push('timeout'); }
  const r = await page.evaluate(() => {
    const m = window.__LS?.metrics();
    if (!m) return null;
    const own = [...m.loadout, ...m.retired];
    return { dmg: own.reduce((s, i) => s + i.dmg, 0), kills: m.loadout.reduce((s, i) => s + i.kills, 0), drone: Math.round(window.__bossDmg?.drone || 0), errors: m.errors };
  }).catch(() => null);
  await page.close();
  job.r = r || { dmg: 0, kills: 0, drone: 0, errors: 1 };
  job.logs = logs;
}

const t0 = Date.now();
let next = 0;
await Promise.all(Array.from({ length: Math.min(parallel, jobs.length) }, async () => { while (next < jobs.length) await run(jobs[next++]); }));
await browser.close();
server.close();

const k = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n >= 1000 ? `${(n / 1000).toFixed(2)}k` : String(n));
const out = (v, [lo, hi]) => v < lo || v > hi;
const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('sound', 13)}${pad('style', 10)}${pad('L1 dmg', 10)}${pad('L5 dmg', 10)}${pad('L5 Drone', 10)}${pad('L5+p dmg', 10)}${pad('Rx dmg', 10)}${pad('Rx/L5+p', 9)}${pad('kills L1/L5/L5+p/Rx', 22)}flags`);
let failed = false;
for (const d of chosen) {
  const j = Object.fromEntries(jobs.filter((x) => x.d === d).map((x) => [x.kind, x]));
  const b = BANDS[d.role];
  const flags = [];
  const v = (kind) => j[kind]?.r || null;
  if (v('l1') && out(v('l1').dmg, b.l1)) flags.push(`L1 outside ${k(b.l1[0])}-${k(b.l1[1])}`);
  if (v('l5') && out(v('l5').dmg, b.l5)) flags.push(`L5 outside ${k(b.l5[0])}-${k(b.l5[1])}`);
  if (v('l5') && v('l5').drone < DRONE[0]) flags.push(`Drone under ${k(DRONE[0])}`);
  if (v('rx') && v('l5p') && v('rx').dmg <= v('l5p').dmg && v('rx').kills <= v('l5p').kills && v('rx').drone <= v('l5p').drone) flags.push('remix not above L5');
  for (const x of Object.values(j)) if (x.r.errors || x.logs.length) { failed = true; flags.push(`${x.kind} errors: ${x.logs.slice(0, 2).join(' | ') || x.r.errors}`); }
  const cell = (kind, f = 'dmg') => (v(kind) ? k(v(kind)[f]) : '-');
  const ratio = v('rx') && v('l5p') ? (v('rx').dmg / Math.max(1, v('l5p').dmg)).toFixed(2) : '-';
  const kills = ['l1', 'l5', 'l5p', 'rx'].map((x) => (v(x) ? v(x).kills : '-')).join('/');
  console.log(`${pad(d.id, 13)}${pad(d.style, 10)}${pad(cell('l1'), 10)}${pad(cell('l5'), 10)}${pad(cell('l5', 'drone'), 10)}${pad(cell('l5p'), 10)}${pad(cell('rx'), 10)}${pad(ratio, 9)}${pad(kills, 22)}${flags.length ? '! ' + flags.join('; ') : ''}`);
}
console.log(`${jobs.length} runs in ${((Date.now() - t0) / 1000).toFixed(0)} s (${parallel} at once). Bands: ${Object.entries(BANDS).map(([r, b]) => `${r} ${k(b.l1[0])}-${k(b.l1[1])} / ${k(b.l5[0])}-${k(b.l5[1])}`).join(', ')}; Drone at L5 ${k(DRONE[0])}+.`);
if (failed) process.exitCode = 1;
