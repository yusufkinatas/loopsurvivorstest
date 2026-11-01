// LEAD channel: the melody. A 2-bar phrase (a call in bar 1, an answer in bar 2) built from chord
// tones on the strong beats and scale steps in between, so it is sweet over every chord. Three ways to play
// it: Saw Lead fires lasers the way you face, Wooden Flute leaves wisps drifting around where you stand,
// Square Lead bounces a pixel from enemy to enemy.

import { STEP_SEC } from '../../config.js';

// Pattern helpers: step s (0..31), duration d in steps, velocity v.
const C = (s, ct, d = 1, v = 1) => ({ s, ct, d, v });   // chord tone: 0 root, 1 third, 2 fifth, 3 octave
const N = (s, sc, d = 1, v = 1) => ({ s, sc, d, v });   // scale step: 0 root, 1 second, 2 third ... 7 octave

// Shared register. Chord roots land between LOW and LOW + 11, and the tunes never climb more than an
// octave above the root, so every note stays inside the lead's range (MIDI 62 to 86) in every key.
const LOW = 63;
const MID = 74;                          // middle of the range: pitch steering is centered here
const LONG = 3 * STEP_SEC - 0.001;       // a held note (3 steps or more)
const TAU = Math.PI * 2;

// A remix voice: every note of a part again `shift` steps later (wrapping round the phrase) and a third
// higher (two scale steps; chord tones 0-3 are scale steps 0, 2, 4, 7), as kind k. Folded under the lead's
// ceiling by the sequencer, a third up turns into a sixth below, which is just as sweet.
const SC = [0, 2, 4, 7];
const third = (part, shift, v, k) => part.map((n) => ({ s: (n.s + shift) % 32, sc: (n.sc ?? SC[n.ct]) + 2, d: n.d, v: n.v * v, k }));

// Where you were `ago` seconds back. A remix's update() keeps a short trail of your positions in inst.state.
function track(g, inst) {
  const tr = (inst.state.trail ||= []);
  tr.push({ t: g.time, x: g.player.x, y: g.player.y });
  while (tr.length > 2 && tr[1].t < g.time - 1.5) tr.shift();
}
function wasAt(g, inst, ago) {
  const tr = inst.state.trail, t = g.time - ago;
  if (!tr?.length) return g.player;
  for (let i = tr.length - 1; i >= 0; i--) if (tr[i].t <= t) return tr[i];
  return tr[0];
}

// ---------------------------------------------------------------------------- Saw Lead (Synth)

const sawLead = {
  id: 'sawlead',
  name: 'Saw Lead',
  role: 'lead',
  style: 'synth',
  blurb: 'A soaring electronic lead. Every note fires a laser the way you face, cutting through a whole line of enemies.',
  steps: 32,
  low: LOW,
  levels: [
    { text: 'A slow, soaring tune. Each note fires a laser the way you face, snapping onto an enemy near that line. Held notes fire wider, stronger lasers.',
      pattern: [C(0, 2, 3), C(4, 1, 2), C(8, 0, 4), C(16, 1, 2), C(24, 2, 3)],
      stats: { damage: 19, longMul: 1.6, width: 9, wide: 18, length: 340, assist: 0.5 } },
    { text: 'More notes fill in the tune. Longer lasers.',
      pattern: [C(0, 2, 3), N(3, 3, 1, 0.7), C(4, 1, 2), N(6, 1, 2, 0.8), C(8, 0, 4),
        C(16, 1, 2), N(22, 3, 2, 0.8), C(24, 2, 3)],
      stats: { damage: 22, longMul: 1.6, width: 9, wide: 19, length: 355, assist: 0.5 } },
    { text: 'Quick lead-in notes before each bar fire extra lasers.',
      pattern: [C(0, 2, 3), N(3, 3, 1, 0.7), C(4, 1, 2), N(6, 1, 2, 0.8), C(8, 0, 4), N(15, 5, 1, 0.7),
        C(16, 1, 2), N(22, 3, 2, 0.8), C(24, 2, 3), N(30, 1, 1, 0.7), N(31, 2, 1, 0.8)],
      stats: { damage: 24, longMul: 1.7, width: 10, wide: 20, length: 370, assist: 0.5 } },
    { text: 'The second bar answers the first with its own tune. Longer reach.',
      pattern: [C(0, 2, 3), N(3, 3, 1, 0.7), C(4, 1, 2), N(6, 1, 2, 0.8), C(8, 0, 4), N(15, 5, 1, 0.7),
        C(16, 1, 2), N(18, 1, 1, 0.7), C(20, 0, 2, 0.85), N(22, 3, 2, 0.8), C(24, 2, 3), C(28, 1, 1, 0.75),
        N(30, 1, 1, 0.7), N(31, 2, 1, 0.8)],
      stats: { damage: 27, longMul: 1.7, width: 10, wide: 21, length: 385, assist: 0.5 } },
    { text: 'Big leaps up to high notes. Held notes also fire a laser straight behind you.',
      pattern: [C(0, 2, 3), N(3, 3, 1, 0.7), C(4, 1, 2), N(6, 1, 2, 0.8), C(8, 0, 4), C(12, 3, 2, 0.9), N(15, 5, 1, 0.7),
        C(16, 1, 2), N(18, 1, 1, 0.7), C(20, 0, 2, 0.85), N(22, 3, 2, 0.8), C(24, 2, 3), C(27, 3, 1, 0.8),
        C(28, 1, 1, 0.75), N(30, 1, 1, 0.7), N(31, 2, 1, 0.8)],
      stats: { damage: 32, longMul: 1.8, width: 11, wide: 22, length: 400, assist: 0.5, twin: 1 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    const long = note.dur >= LONG;
    if (inst?.remix) {
      // Screamer: overdriven saws through a resonant filter. Held notes scoop up a whole step and wail.
      v.tone(ctx, out, t, {
        freq: note.freq, wave: 'sawtooth', unison: 2, spread: 12, dur: note.dur * 0.92, drive: 3.2,
        a: 0.004, d: 0.25, s: 0.75, r: long ? 0.2 : 0.08, gain: 0.15 * note.v,
        filter: { type: 'lowpass', freq: Math.min(6000, note.freq * 4), q: 3.5, env: 2, decay: 0.3 },
        pitchEnv: long ? { from: 0.89, time: 0.09 } : { from: 0.97, time: 0.02 },
        vibrato: long ? { rate: 6.2, depth: 30, delay: 0.14 } : null,
      });
      return;
    }
    // Two detuned saws through a plucky low-pass. Held notes scoop up into pitch and get vibrato.
    v.tone(ctx, out, t, {
      freq: note.freq, wave: 'sawtooth', unison: 2, spread: 9, dur: note.dur * 0.9,
      a: 0.006, d: 0.2, s: 0.7, r: long ? 0.16 : 0.09, gain: 0.26 * note.v,
      filter: { type: 'lowpass', freq: Math.min(5200, note.freq * 3.2), q: 2.2, env: 2.4, decay: 0.22 },
      pitchEnv: long ? { from: 0.97, time: 0.05 } : null,
      vibrato: long ? { rate: 5.4, depth: 16, delay: 0.16 } : null,
    });
  },

  fire(g, note, st) { lasers(g, note, st, null); },

  remix: {
    id: 'screamer', name: 'Screamer', pedal: 'overdrive',
    text: 'The answer climbs to the top and screams: held notes keep firing on every 16th as you turn, and kills burst.',
    sound: 'an overdriven answer that wails at the top.',
    // The call keeps level 5's tune; the answer climbs to the top fifth of the range and holds screaming notes there.
    pattern: [C(0, 2, 3), N(3, 3, 1, 0.7), C(4, 1, 2), N(6, 1, 2, 0.8), C(8, 0, 4), C(12, 3, 2, 0.9), N(14, 4, 1, 0.75), N(15, 5, 1, 0.8),
      N(16, 7, 4), N(20, 6, 1, 0.8), N(21, 7, 1, 0.85), C(22, 2, 2, 0.9), N(24, 7, 6), N(30, 5, 1, 0.8), N(31, 4, 1, 0.85)],
    stats: { scream: 0.65, burst: 0.7, burstRadius: 60 },
    fire(g, note, st, inst) {
      // Anything a laser kills bursts.
      const r = g.area(st.burstRadius), color = g.color('lead');
      const dmg = g.dmg(st.damage * (note.dur >= LONG ? st.longMul : 1)) * note.v * st.burst;
      const burst = (e) => { if (e.dead) g.fx.pulse({ x: e.x, y: e.y, r, damage: dmg, kb: 120, color, fill: 0.3 }); };
      lasers(g, note, st, burst);
      // A held note keeps screaming: a laser ahead of you and one behind on every 16th it sounds, so you sweep
      // them by turning. Echoes do not.
      if (note.dur < LONG || g.dmgScale !== 1) return;
      const w = g.noteW;
      for (let k = 1; k < Math.round(note.dur / STEP_SEC); k++) {
        g.later.push({ at: g.time + k * STEP_SEC, fn: () => {
          if (!g.loadout.has(inst)) return;
          const prev = g.src; g.src = inst; g.noteW = w;
          const p = g.player;
          for (const back of [false, true]) {
            g.fx.beam({ x: p.x, y: p.y, angle: facing(g, st.length, st.assist, back).angle, length: st.length, width: g.area(st.wide),
              damage: g.dmg(st.damage * st.longMul * st.scream) * note.v, kb: 70, color, life: 0.14, onHit: burst });
          }
          g.src = prev; g.noteW = 1;
        } });
      }
    },
  },
};

// Your facing (or, with back, straight behind you), nudged onto the enemy closest to it within `cone` radians
// and `range` px: a little aim assist, so a laser swept across a crowd catches it. A boss in range pulls the
// laser onto it from anywhere within 90 degrees of that line. Returns { angle, t } (t: the enemy it snapped
// onto, or null).
const BOSS_CONE = Math.PI / 2;
function facing(g, range, cone, back = false) {
  const p = g.player, a = g.aim() + (back ? Math.PI : 0);
  let best = a, bd = cone, t = null;
  for (const e of g.inRadius(p.x, p.y, range)) {
    if (e.spawnT > 0.2) continue;
    let d = Math.atan2(e.y - p.y, e.x - p.x) - a;
    d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
    if (d < bd || (e.boss && d < BOSS_CONE)) { bd = e.boss ? -1 : d; best = Math.atan2(e.y - p.y, e.x - p.x); t = e; }
  }
  return { angle: best, t };
}

// One note's laser along the line you are moving on: the top of the tune (from the middle of the lead's range
// up) fires ahead of you, the lower notes straight behind you, so a run forward clears the way and a low
// phrase cuts down what chases you. A held note, once the level has twin, fires both ways.
function lasers(g, note, st, onHit) {
  const p = g.player;
  const color = g.color('lead');
  const long = note.dur >= LONG;
  const len = st.length;
  const beam = (aim) => {
    // The pitch moves where the laser starts: high notes fire from one shoulder, low from the other, so the
    // tune draws parallel lines. A laser that snapped onto an enemy still passes through it.
    const side = (note.midi - MID) * 2.4;
    const x = p.x - Math.sin(aim.angle) * side, y = p.y + Math.cos(aim.angle) * side;
    const angle = aim.t ? Math.atan2(aim.t.y - y, aim.t.x - x) : aim.angle;
    g.fx.beam({ x, y, angle, length: len, width: g.area(long ? st.wide : st.width),
      damage: g.dmg(st.damage * (long ? st.longMul : 1)) * note.v, kb: long ? 90 : 40, color,
      life: long ? 0.3 : 0.16, onHit });
  };
  const ahead = note.midi >= MID;
  if (long && st.twin) { beam(facing(g, len, st.assist)); beam(facing(g, len, st.assist, true)); }
  else beam(facing(g, len, st.assist, !ahead));
}

// ---------------------------------------------------------------------------- Wooden Flute (Live)

const FLUTE_5 = [C(0, 1, 3), C(4, 2, 2), N(6, 3, 1, 0.7), C(8, 1, 4), C(12, 0, 2, 0.8), C(14, 3, 1, 0.85), N(15, 3, 1, 0.7),
  C(16, 2, 3), N(19, 3, 1, 0.7), C(20, 1, 2), N(22, 1, 1, 0.7), C(24, 0, 2), C(26, 3, 2, 0.8), N(28, 4, 2, 0.75),
  N(30, 1, 1, 0.7), N(31, 2, 1, 0.8)];

const flute = {
  id: 'flute',
  name: 'Wooden Flute',
  role: 'lead',
  style: 'organic',
  blurb: 'A breathy wooden flute. Each note leaves a glowing wisp drifting around where you stand, darting at anything that comes close.',
  steps: 32,
  low: LOW,
  levels: [
    { text: 'A gentle tune. Each note lets a wisp drift out around you; it circles where you played it and darts at anything that comes close.',
      pattern: [C(0, 1, 3), C(4, 2, 2), C(8, 1, 4), C(12, 0, 2, 0.8),
        C(16, 2, 3), C(20, 1, 2), N(22, 1, 1, 0.7), C(24, 0, 2)],
      stats: { damage: 30, speed: 120, curve: 2.4, homing: 6, sense: 140, life: 3, size: 7, pierce: 1 } },
    { text: 'Little in-between notes join the tune, so more wisps.',
      pattern: [C(0, 1, 3), C(4, 2, 2), N(6, 3, 1, 0.7), C(8, 1, 4), C(12, 0, 2, 0.8),
        C(16, 2, 3), N(19, 3, 1, 0.7), C(20, 1, 2), N(22, 1, 1, 0.7), C(24, 0, 2)],
      stats: { damage: 27, speed: 124, curve: 2.4, homing: 6, sense: 145, life: 3.1, size: 7, pierce: 1 } },
    { text: 'Quick lead-in notes before each bar. Wisps linger longer.',
      pattern: [C(0, 1, 3), C(4, 2, 2), N(6, 3, 1, 0.7), C(8, 1, 4), C(12, 0, 2, 0.8), N(15, 3, 1, 0.7),
        C(16, 2, 3), N(19, 3, 1, 0.7), C(20, 1, 2), N(22, 1, 1, 0.7), C(24, 0, 2), N(30, 1, 1, 0.7), N(31, 2, 1, 0.8)],
      stats: { damage: 24, speed: 128, curve: 2.4, homing: 6.2, sense: 150, life: 3.4, size: 7.5, pierce: 1 } },
    { text: 'The second bar sings a longer answer. Wisps pass through two enemies.',
      pattern: [C(0, 1, 3), C(4, 2, 2), N(6, 3, 1, 0.7), C(8, 1, 4), C(12, 0, 2, 0.8), N(15, 3, 1, 0.7),
        C(16, 2, 3), N(19, 3, 1, 0.7), C(20, 1, 2), N(22, 1, 1, 0.7), C(24, 0, 2), N(28, 4, 2, 0.75),
        N(30, 1, 1, 0.7), N(31, 2, 1, 0.8)],
      stats: { damage: 25, speed: 132, curve: 2.4, homing: 6.4, sense: 155, life: 3.5, size: 8, pierce: 2 } },
    { text: 'Bright leaps up to high notes. Wisps pass through three enemies.',
      pattern: FLUTE_5,
      stats: { damage: 28, speed: 136, curve: 2.4, homing: 6.6, sense: 160, life: 3.6, size: 8.5, pierce: 3 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    const long = note.dur >= LONG;
    const f = note.freq;
    const dur = note.dur * 0.92;
    const vib = long ? { rate: 4.8, depth: 12, delay: 0.24 } : null;
    // Canon: two flutes a little apart, the round's second voice brighter and breathier on the right.
    const two = inst?.remix, second = note.k === 'canon';
    const pan = two ? (second ? 0.35 : -0.25) : 0, lv = two ? 0.8 : 1;
    // Body: a soft sine with its first overtones. Slow attack, like breath filling the pipe.
    v.tone(ctx, out, t, { freq: f, wave: 'sine', dur, a: 0.035, d: 0.1, s: 0.85, r: 0.12, gain: 0.175 * note.v * lv, vibrato: vib, pan });
    v.tone(ctx, out, t, { freq: f * 2, wave: 'sine', dur, a: 0.05, d: 0.12, s: 0.7, r: 0.1, gain: (second ? 0.12 : 0.0875) * note.v * lv, vibrato: vib, pan });
    v.tone(ctx, out, t, { freq: f * 3, wave: 'sine', dur, a: 0.06, d: 0.1, s: 0.5, r: 0.08, gain: 0.0375 * note.v * lv, vibrato: vib, pan });
    // Breath: band-passed noise above the pitch, plus a soft chiff at the start of the note.
    v.noise(ctx, out, t, { dur, a: 0.02, d: 0.1, s: 0.6, r: 0.1, gain: (second ? 0.14 : 0.1125) * note.v * lv, filter: { type: 'bandpass', freq: Math.min(9000, f * 4), q: 1.2 }, pan });
    v.noise(ctx, out, t, { dur: 0.01, d: 0.04, gain: 0.1 * note.v * lv, filter: { type: 'bandpass', freq: 3200, q: 1 }, pan });
  },

  fire(g, note, st) { wisps(g, note, st, g.player, st.damage); },

  remix: {
    id: 'canon', name: 'Canon', pedal: 'delay',
    text: 'A second flute sings the tune a beat behind and a third higher, its wisps drifting from where you were.',
    sound: 'a second flute singing a round.',
    // A real round: level 5's tune, and every note again one beat (4 steps) later, a third higher.
    pattern: [...FLUTE_5, ...third(FLUTE_5, 4, 0.85, 'canon')],
    stats: { canon: 2, life: 4 },
    update(g, dt, st, inst) { track(g, inst); },
    fire(g, note, st, inst) {
      if (note.k !== 'canon') { wisps(g, note, st, g.player, st.damage); return; }
      wisps(g, note, st, wasAt(g, inst, 4 * STEP_SEC), st.damage * st.canon);
    },
  },
};

// One note's wisps from `from`. A wisp leaves at an angle set by the pitch (the tune draws a flower around
// you, turning a little each bar), drifts slowly in a small loop around where it was played (speed / curve,
// about 50 px), and darts at any enemy that comes within `sense` px of it. Stand still and the wisps gather
// around you; run and they hang in the air behind you for whatever chases you.
function wisps(g, note, st, from, damage) {
  const color = g.color('lead');
  const hi = Math.max(0, Math.min(1, (note.midi - LOW) / 23));   // 0 lowest note .. 1 highest
  const n = g.amount(1);
  const turn = hi > 0.5 ? 1 : -1;                                  // high notes loop one way, low notes the other
  for (let i = 0; i < n; i++) {
    const a = hi * TAU + (note.bar || 0) * 0.7 + (i / n) * TAU;
    g.fx.bullet({ x: from.x, y: from.y, angle: a, speed: g.speed(st.speed), curve: st.curve * turn, r: g.area(st.size), life: st.life,
      damage: g.dmg(damage) * note.v, pierce: st.pierce, homing: st.homing, range: g.area(st.sense), kb: 30, color,
      shape: 'dot', trail: true });
  }
}

// ---------------------------------------------------------------------------- Square Lead (8-Bit)

const SQUARE_5 = [C(0, 1, 2), C(2, 3, 1, 0.85), C(3, 2, 2), C(6, 1, 2), C(8, 0, 2), N(10, 1, 1, 0.75), C(12, 1, 2), N(14, 3, 1, 0.7), N(15, 4, 1, 0.8),
  C(16, 2, 2), N(18, 3, 1, 0.7), C(19, 1, 2), C(22, 0, 2), C(24, 1, 2), N(26, 1, 1, 0.75), C(27, 3, 1, 0.85), C(28, 0, 2), N(30, 2, 1, 0.7), N(31, 4, 1, 0.8)];

const squareLead = {
  id: 'squarelead',
  name: 'Square Lead',
  role: 'lead',
  style: 'chip',
  blurb: 'A chirpy retro game tune. Every note shoots a pixel that ricochets from enemy to enemy, hitting harder with each bounce.',
  steps: 32,
  low: LOW,
  levels: [
    { text: 'A bouncy game tune. Each note shoots a pixel at the nearest enemy that ricochets on to the next one, hitting harder each bounce.',
      pattern: [C(0, 1, 2), C(3, 2, 2), C(6, 1, 2), C(8, 0, 2), N(10, 1, 1, 0.75), C(12, 1, 2),
        C(16, 2, 2), C(19, 1, 2), C(22, 0, 2), C(24, 1, 2), N(26, 1, 1, 0.75), C(28, 0, 2)],
      stats: { damage: 14, count: 1, bounce: 1, chain: 1.15, speed: 520, life: 0.5, range: 300 } },
    { text: 'Quick lead-in notes into the second bar. Pixels bounce twice.',
      pattern: [C(0, 1, 2), C(3, 2, 2), C(6, 1, 2), C(8, 0, 2), N(10, 1, 1, 0.75), C(12, 1, 2), N(14, 3, 1, 0.7), N(15, 4, 1, 0.8),
        C(16, 2, 2), C(19, 1, 2), C(22, 0, 2), C(24, 1, 2), N(26, 1, 1, 0.75), C(28, 0, 2)],
      stats: { damage: 15, count: 1, bounce: 2, chain: 1.15, speed: 540, life: 0.5, range: 300 } },
    { text: 'A lead-in note before the tune repeats. Every note now shoots two pixels, at the two nearest enemies.',
      pattern: [C(0, 1, 2), C(3, 2, 2), C(6, 1, 2), C(8, 0, 2), N(10, 1, 1, 0.75), C(12, 1, 2), N(14, 3, 1, 0.7), N(15, 4, 1, 0.8),
        C(16, 2, 2), C(19, 1, 2), C(22, 0, 2), C(24, 1, 2), N(26, 1, 1, 0.75), C(28, 0, 2), N(31, 4, 1, 0.8)],
      stats: { damage: 15, count: 2, bounce: 2, chain: 1.15, speed: 560, life: 0.5, range: 310 } },
    { text: 'The second bar answers with its own twist. Pixels bounce three times.',
      pattern: [C(0, 1, 2), C(3, 2, 2), C(6, 1, 2), C(8, 0, 2), N(10, 1, 1, 0.75), C(12, 1, 2), N(14, 3, 1, 0.7), N(15, 4, 1, 0.8),
        C(16, 2, 2), N(18, 3, 1, 0.7), C(19, 1, 2), C(22, 0, 2), C(24, 1, 2), N(26, 1, 1, 0.75), C(28, 0, 2), N(30, 2, 1, 0.7), N(31, 4, 1, 0.8)],
      stats: { damage: 17, count: 2, bounce: 3, chain: 1.15, speed: 580, life: 0.5, range: 320 } },
    { text: 'The full theme with high leaps. Pixels bounce four times.',
      pattern: SQUARE_5,
      stats: { damage: 17, count: 2, bounce: 4, chain: 1.15, speed: 600, life: 0.5, range: 330 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    const held = note.dur >= 2 * STEP_SEC - 0.001;
    if (inst?.remix) {
      // Twin Lead: two chips in parallel thirds, the tune left on a square, the harmony right on a thin
      // 12.5% pulse with a slower vibrato, so the two lines stay apart.
      const harm = note.k === 'harm';
      v.tone(ctx, out, t, {
        freq: note.freq, duty: harm ? 0.125 : held ? 0.5 : 0.25, dur: note.dur * 0.85, a: 0.002, d: 0.06, s: 0.7, r: 0.04,
        gain: (harm ? 0.16 : 0.2) * note.v, pan: harm ? 0.4 : -0.4,
        vibrato: held ? { rate: harm ? 6 : 7.5, depth: 22, delay: harm ? 0.12 : 0.09 } : null,
      });
      return;
    }
    // Thin 25% pulse for quick notes, round 50% square for held ones. Held notes get a fast chip vibrato.
    v.tone(ctx, out, t, {
      freq: note.freq, duty: held ? 0.5 : 0.25, dur: note.dur * 0.85, a: 0.002, d: 0.06, s: 0.7, r: 0.04,
      gain: 0.2 * note.v, vibrato: held ? { rate: 7.5, depth: 22, delay: 0.09 } : null,
    });
  },

  fire(g, note, st) { pixels(g, note, st, false); },

  remix: {
    id: 'twinlead', name: 'Twin Lead', pedal: 'chorus',
    text: 'A harmony line plays the tune in thirds, its pixels mirrored across the way you face onto whatever is on that side, bouncing on from there.',
    sound: 'a harmony line in thirds.',
    // Level 5's theme with a second voice on every note, a third above it.
    pattern: [...SQUARE_5, ...third(SQUARE_5, 0, 0.9, 'harm')],
    stats: { damage: 23, twin: 1.6, harmony: 3, snap: 0.7, speed: 660 },
    fire(g, note, st) { pixels(g, note, st, note.k === 'harm'); },
  },
};

// One note's pixels, each at one of the nearest enemies (within `range`), tilted a hair by the pitch so a run
// rakes across. A pixel that hits ricochets to the next enemy near it (`bounce` times), each hit `chain` times
// harder than the last, so it keeps working while you dodge. The harmony's pixels (mirror: Twin Lead's
// `harmony`) leave reflected across the line you face and snap onto the enemy closest to that line (within
// `snap` radians): run at the target and both lines land on it, strafe and they split onto two crowds.
function pixels(g, note, st, mirror) {
  const p = g.player;
  const color = g.color('lead');
  const n = g.amount(mirror ? st.harmony : st.count);
  if (!n) return;
  const targets = g.nearestN(p.x, p.y, n, st.range);
  const face = g.aim();
  const tilt = (note.midi - MID) * 0.006;
  const chain = st.chain;
  const onHit = (b) => { b.damage *= chain; };
  const taken = new Set();
  for (let i = 0; i < n; i++) {
    const t = targets.length ? targets[i % targets.length] : null;
    let a = t ? Math.atan2(t.y - p.y, t.x - p.x) + tilt : face + (i - (n - 1) / 2) * 0.4;
    if (mirror) a = snapTo(g, 2 * face - a, st.range, st.snap, taken);
    g.fx.bullet({ x: p.x, y: p.y, angle: a, speed: g.speed(st.speed), r: 5, life: st.life, bounce: st.bounce,
      damage: g.dmg(st.damage) * note.v * (mirror ? st.twin : 1), kb: 45, color, shape: 'square', onHit });
  }
}

// The angle to the enemy closest in angle to `a` (within `cone` radians and `range` px of you, not one already in
// `taken`, which it joins), else `a` itself.
function snapTo(g, a, range, cone, taken) {
  const p = g.player;
  let best = a, bd = cone, t = null;
  for (const e of g.inRadius(p.x, p.y, range)) {
    if (e.spawnT > 0.2 || taken.has(e)) continue;
    const ea = Math.atan2(e.y - p.y, e.x - p.x);
    let d = ea - a;
    d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
    if (d < bd) { bd = d; best = ea; t = e; }
  }
  if (t) taken.add(t);
  return best;
}

export default [sawLead, flute, squareLead];
