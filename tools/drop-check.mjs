// The perfect Drop window, judged by ear, checked in Node with a real Game and Sequencer (no browser, no audio).
// A press on the fill's last hits (1 or 2 steps before the phrase downbeat is heard) lands a perfect Drop on that
// downbeat, at output latency 0 and 0.2 s, even once the sequencer has already scheduled it; dropPerfectNow
// agrees with where the press lands; the Drop takes the song's impact event when the downbeat has one; and a
// downbeat a remix lands on or drops out on is never taken.
//   node tools/drop-check.mjs
import assert from 'node:assert/strict';
import { Sequencer } from '../src/music/sequencer.js';
import { Game } from '../src/game/game.js';
import { STEP_SEC, BAR_SEC, DROP } from '../src/config.js';
import { BY_ID } from '../src/content/instruments/index.js';

const FPS = 60;

// A run at output latency `latency`, stepped frame by frame on a fake audio clock, with a full Drop meter.
// press: the heard time (audio clock minus latency) to press at. Returns what landed.
function run({ latency, pressHeard, bar = 8, setup }) {
  const clock = { sim: false, t: 0, now() { return this.t; } };
  const audio = { ready: false, latency };
  const seq = new Sequencer(clock, audio);
  const drops = [], impacts = [];
  const game = new Game({ audio, clock, seq, opts: { god: true, solo: true }, hooks: { onImpact: (b) => impacts.push(b) } });
  game.newRun({ start: 'kick808', seed: 3, keyIndex: 0 });
  game.view = { w: 1280, h: 720 };
  const doDrop = game.doDrop.bind(game);
  game.doDrop = (b) => { drops.push({ bar: b, perfect: b % DROP.phrase === 0, at: clock.t }); doDrop(b); };
  setup?.(game, seq);
  const start = seq.nextTime;   // bar 0's downbeat on the audio clock
  const downbeat = start + bar * BAR_SEC;
  let pressed = null;
  for (let f = 0; f < FPS * 60 && clock.t < downbeat + 10; f++) {
    clock.t += 1 / FPS;
    seq.tick();
    if (!pressed && clock.t - latency >= pressHeard(downbeat)) {
      game.dropCharge = game.dropMax;
      const predicted = game.dropLandsOn();
      const perfectNow = game.dropPerfectNow();
      const ok = game.requestDrop();
      pressed = { ok, predicted, perfectNow, schedBar: seq.bar, heard: seq.sounding(clock.t - latency), at: clock.t };
    }
    game.step(1 / FPS, { x: 0, y: 0 });
  }
  return { pressed, drops, impacts, downbeat };
}

let n = 0;
const fail = [];
const check = (name, fn) => { n++; try { fn(); } catch (e) { fail.push(`${name}: ${e.message}`); } };

// The press is heard 1 or 2 steps (and a hair) before the bar 8 downbeat, at latency 0 and 0.2 s.
for (const latency of [0, 0.2]) {
  for (const steps of [1, 1.5, 2]) {
    const name = `latency ${latency}, ${steps} steps before the downbeat`;
    const r = run({ latency, pressHeard: (d) => d - steps * STEP_SEC });
    check(name, () => {
      assert.ok(r.pressed?.ok, 'the press was refused');
      assert.equal(r.pressed.heard?.bar, 7, `heard bar ${r.pressed.heard?.bar}`);
      assert.equal(r.drops.length, 1, `${r.drops.length} Drops`);
      assert.equal(r.drops[0].bar, 8, `landed on bar ${r.drops[0].bar}`);
      assert.ok(r.drops[0].perfect, 'not perfect');
      assert.equal(r.pressed.predicted, 8, `dropLandsOn said ${r.pressed.predicted}`);
      assert.ok(r.pressed.perfectNow, 'dropPerfectNow said no');
    });
    console.log(`${name.padEnd(42)} scheduled bar ${r.pressed?.schedBar}, heard ${r.pressed?.heard?.bar}:${r.pressed?.heard?.sib}  ->  Drop on bar ${r.drops[0]?.bar} (${r.drops[0]?.perfect ? 'perfect' : 'not perfect'}), predicted ${r.pressed?.predicted}`);
  }
}

// Once the downbeat is heard the window is gone: the press builds through the next bar.
{
  const r = run({ latency: 0.2, pressHeard: (d) => d + 0.5 * STEP_SEC });
  check('after the downbeat', () => {
    assert.equal(r.drops[0]?.bar, 10, `landed on bar ${r.drops[0]?.bar}`);
    assert.equal(r.pressed.predicted, 10, `dropLandsOn said ${r.pressed.predicted}`);
    assert.ok(!r.pressed.perfectNow);
  });
}

// A downbeat with the song's own impact: a late press takes it over (one hit, no songImpact on that bar).
{
  let impactBar = -1;
  const r = run({
    latency: 0.2, pressHeard: (d) => d - STEP_SEC, bar: 8,
    setup: (g, seq) => {
      const pos = seq.song.position.bind(seq.song);
      seq.song.position = (b) => { const p = pos(b); return b === 8 ? { ...p, arr: { ...p.arr, impact: true } } : p; };
      impactBar = 8;
    },
  });
  check('late press on a song impact', () => {
    assert.equal(r.drops[0]?.bar, impactBar);
    assert.ok(!r.impacts.includes(impactBar), 'the song impact fired as well');
  });
}

// A remix landing on (or dropping out on) the phrase downbeat keeps it: the late press waits for its own build.
for (const [what, R] of [['lands', 8], ['drops out', 9]]) {
  const r = run({
    latency: 0.2, pressHeard: (d) => d - STEP_SEC,
    setup: (g, seq) => {
      const inst = g.addInstrument(BY_ID.flute, 5);
      seq.remixAt = { inst, bar: R, out: false };
    },
  });
  check(`remix ${what} on the downbeat`, () => {
    assert.ok(r.drops.length === 1 && r.drops[0].bar !== 8, `landed on bar ${r.drops[0]?.bar}`);
    assert.equal(r.pressed.predicted, r.drops[0].bar, `dropLandsOn said ${r.pressed.predicted}, landed ${r.drops[0].bar}`);
  });
}

if (fail.length) { console.log('\n!! FAIL\n' + fail.join('\n')); process.exit(1); }
console.log(`drop-check: ${n} checks passed`);
