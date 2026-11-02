// Training dummies: a static field of unkillable enemies around a standing player (god, solo), to measure raw
// damage per second (no overkill cap) and which stat APIs each attack reads. Node only, no browser.
//   node tools/dummy.mjs                                        # every sound and remix x each pedal at 3 (JSON;
//                                                               # tools/data/pedal-fit.json, see tools/fitcheck.mjs)
//   node tools/dummy.mjs mode=one give=sawlead:5 remix=sawlead pedals=overdrive:3 [faders=lead:2]
//   node tools/dummy.mjs mode=move                              # standing vs walking a slow circle
// Args: secs=40 (game seconds per run), n=160 (dummies), spread=460 (px).
import { Game } from '../src/game/game.js';
import { Sequencer } from '../src/music/sequencer.js';
import { spawnEnemy } from '../src/game/enemies.js';
import { INSTRUMENTS } from '../src/content/instruments/index.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const SECS = Number(args.secs || 40);
const N = Number(args.n || 160);
const SPREAD = Number(args.spread || 460);

function run({ give = [], remix = [], pedals = [], faders = {}, secs = SECS, n = N, move = null, seed = 7 }) {
  const clock = { sim: true, t: 0, now() { return this.t; } };
  const seq = new Sequencer(clock, null);
  const g = new Game({ audio: null, clock, seq, opts: { sim: true, god: true, solo: true, give: give.slice(1), remix, givePedals: pedals }, hooks: {} });
  g.director.onBeat = () => {}; g.director.update = () => {}; g.director.onSection = () => {};
  const calls = {};
  for (const k of ['area', 'amount', 'speed', 'heal']) {
    const f = g[k].bind(g);
    g[k] = (...a) => { const id = g.src?.def?.id || '-'; (calls[id] ||= {})[k] = ((calls[id] ||= {})[k] || 0) + 1; return f(...a); };
  }
  g.newRun({ start: give[0].id, seed, keyIndex: 0 });
  { const s0 = g.loadout.instruments().find((i) => i.def.id === give[0].id); if (s0 && give[0].level) g.setInstrumentLevel(s0, give[0].level); }
  for (const id of remix) { const inst = g.loadout.instruments().find((i) => i.def.id === id); if (inst && !inst.remix) { inst.level = 5; inst.remix = true; g.onLoadoutChanged(); } }
  Object.assign(g.loadout.faders, faders);
  // A static field: rings of dummies from 50 to SPREAD px, golden-angle spread.
  const home = [];
  for (let i = 0; i < n; i++) {
    const d = 50 + (SPREAD - 50) * Math.sqrt((i + 0.5) / n);
    const a = i * 2.39996;
    const e = spawnEnemy(g, 'static', Math.cos(a) * d, Math.sin(a) * d, { hpMul: 1e7 });
    e.spawnT = 0; e.speed = 0; e.mass = 1e9;
    home.push([e, e.x, e.y]);
  }
  const dt = 1 / 60;
  let t = 0, frame = 0;
  while (g.time < secs) {
    clock.t += dt;
    seq.tick();
    g.step(dt, move ? move(g, frame) : { x: 0, y: 0 });
    for (const [e, x, y] of home) { e.x = x + g.player.x; e.y = y + g.player.y; e.kbx = e.kby = 0; e.stun = 0; }
    frame++;
    if (g.state !== 'playing') {
      if (g.state === 'levelup') { g.choose(-1); continue; }
      break;
    }
  }
  const out = {};
  for (const i of g.loadout.instruments()) out[i.def.id] = { dps: i.dmg / g.time, notes: i.notes };
  return { out, calls, time: g.time, crit: g.stats.crit };
}

const L5 = (id) => [{ id, level: 5 }];
const mode = args.mode || 'matrix';
if (mode === 'matrix') {
  const P = [null, 'reverb', 'chorus', 'delay', 'overdrive', 'bitcrusher'];
  const rows = [];
  for (const def of INSTRUMENTS) {
    for (const rx of [false, true]) {
      const row = { id: rx ? def.remix.id : def.id, style: def.style, role: def.role };
      let base = 0;
      for (const p of P) {
        const r = run({ give: L5(def.id), remix: rx ? [def.id] : [], pedals: p ? [{ id: p, level: 3 }] : [] });
        const v = r.out[def.id]?.dps || 0;
        if (!p) { base = v; row.base = Math.round(v); row.calls = r.calls[def.id] || {}; }
        else row[p] = base ? +(v / base).toFixed(3) : 0;
      }
      rows.push(row);
    }
  }
  console.log(JSON.stringify(rows));
} else if (mode === 'one') {
  const give = (args.give || 'kick808:5').split(',').map((s) => { const [id, level] = s.split(':'); return { id, level: Number(level || 5) }; });
  const pedals = (args.pedals || '').split(',').filter(Boolean).map((s) => { const [id, level] = s.split(':'); return { id, level: Number(level || 3) }; });
  const remix = (args.remix || '').split(',').filter(Boolean);
  const faders = Object.fromEntries((args.faders || '').split(',').filter(Boolean).map((s) => s.split(':')).map(([r, n]) => [r, Number(n)]));
  const r = run({ give, pedals, remix, faders });
  const tot = Object.values(r.out).reduce((a, b) => a + b.dps, 0);
  console.log(JSON.stringify({ total: Math.round(tot), ...Object.fromEntries(Object.entries(r.out).map(([k, v]) => [k, Math.round(v.dps)])) }));
}
if (mode === 'move') {
  // Standing vs walking a slow circle (direction turns once every 4 s), level 5 and remix, no pedals.
  const circle = (g, f) => { const a = (f / 60) * (Math.PI * 2 / 4); return { x: Math.cos(a), y: Math.sin(a) }; };
  const rows = [];
  for (const def of INSTRUMENTS) for (const rx of [false, true]) {
    const a = run({ give: L5(def.id), remix: rx ? [def.id] : [] }).out[def.id]?.dps || 0;
    const b = run({ give: L5(def.id), remix: rx ? [def.id] : [], move: circle }).out[def.id]?.dps || 0;
    rows.push([rx ? def.remix.id : def.id, def.style, def.role, Math.round(a), Math.round(b), +(b / Math.max(1, a)).toFixed(2)]);
  }
  for (const r of rows) console.log(r.map(String).map((s, i) => (i < 3 ? s.padEnd(13) : s.padStart(6))).join(' '));
}
