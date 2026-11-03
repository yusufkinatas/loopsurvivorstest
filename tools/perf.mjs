// Logic cost per frame: a band at level 5 (pedals at 3) against a static field of unkillable bodies for 30 game
// seconds, walking a slow circle. Node only, no browser; prints one JSON line (ms per frame, worst frame, hits).
//   node tools/perf.mjs <id,id,...> [pedal,pedal,...] [bodies, default 480] [rx]   # rx: every sound remixed
//   node tools/perf.mjs timpani,hats909,cellos,supersaw,flute,musicbox reverb,chorus 480
import { Game } from '../src/game/game.js';
import { Sequencer } from '../src/music/sequencer.js';
import { spawnEnemy } from '../src/game/enemies.js';
const [band, pedals, n, rx] = [process.argv[2].split(','), (process.argv[3] || '').split(',').filter(Boolean), Number(process.argv[4] || 480), process.argv[5] === 'rx'];
const clock = { sim: true, t: 0, now() { return this.t; } };
const seq = new Sequencer(clock, null);
const g = new Game({ audio: null, clock, seq, opts: { sim: true, god: true, solo: true, give: band.slice(1).map((id) => ({ id, level: 5 })), remix: rx ? band : [], givePedals: pedals.map((id) => ({ id, level: 3 })) }, hooks: {} });
g.director.onBeat = () => {}; g.director.update = () => {}; g.director.onSection = () => {};
g.newRun({ start: band[0], seed: 3, keyIndex: 0 });
const s0 = g.loadout.instruments().find((i) => i.def.id === band[0]); g.setInstrumentLevel(s0, 5);
if (rx) { for (const i of g.loadout.instruments()) { i.level = 5; i.remix = true; } g.onLoadoutChanged(); }
let hits = 0, kills = 0; const oh = g.hit.bind(g); g.hit = (...a) => { hits++; return oh(...a); };
const home = [];
for (let i = 0; i < n; i++) { const d = 50 + 650 * Math.sqrt((i + 0.5) / n), a = i * 2.39996; const e = spawnEnemy(g, 'static', Math.cos(a) * d, Math.sin(a) * d, { hpMul: 1e7 }); e.spawnT = 0; e.speed = 0; e.mass = 1e9; home.push([e, e.x, e.y]); }
const dt = 1 / 60; let worst = 0, total = 0, frames = 0, maxB = 0, maxR = 0;
const t0 = performance.now();
while (g.time < 30) {
  clock.t += dt; seq.tick();
  const a = performance.now();
  g.step(dt, { x: Math.cos(frames / 120), y: Math.sin(frames / 120) });
  const ms = performance.now() - a; total += ms; worst = Math.max(worst, ms); frames++;
  maxB = Math.max(maxB, g.fx.bullets.length); maxR = Math.max(maxR, g.fx.rings.length);
  for (const [e, x, y] of home) { e.x = x + g.player.x; e.y = y + g.player.y; e.kbx = e.kby = 0; }
}
const dmg = g.loadout.instruments().reduce((s, i) => s + i.dmg, 0);
console.log(JSON.stringify({ band: g.loadout.instruments().map((i) => i.remix ? i.def.remix.id : i.def.id), hitsPerSec: Math.round(hits / g.time), dps: Math.round(dmg / g.time), msPerFrameAvg: +(total / frames).toFixed(3), msWorst: +worst.toFixed(2), maxBullets: maxB, maxRings: maxR, mines: g.fx.mines.length, walls: g.fx.walls.length }));
