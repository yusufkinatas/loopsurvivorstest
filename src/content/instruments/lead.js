// LEAD channel: the melody. A 2-bar phrase (a call in bar 1, an answer in bar 2) built from chord
// tones on the strong beats and scale steps in between, so it is sweet over every chord. Precise,
// long-range shots, and the pitch of each note steers its shot so you can see the tune.

import { STEP_SEC, ECHO_STEPS } from '../../config.js';

// Pattern helpers: step s (0..31), duration d in steps, velocity v.
const C = (s, ct, d = 1, v = 1) => ({ s, ct, d, v });   // chord tone: 0 root, 1 third, 2 fifth, 3 octave
const N = (s, sc, d = 1, v = 1) => ({ s, sc, d, v });   // scale step: 0 root, 1 second, 2 third ... 7 octave

// Shared register. Chord roots land between LOW and LOW + 11, and the tunes never climb more than an
// octave above the root, so every note stays inside the lead's range (MIDI 62 to 86) in every key.
const LOW = 63;
const MID = 74;                          // middle of the range: pitch steering is centered here
const LONG = 3 * STEP_SEC - 0.001;       // a held note (3 steps or more)

// ---------------------------------------------------------------------------- Saw Lead (Synth)

const sawLead = {
  id: 'sawlead',
  name: 'Saw Lead',
  role: 'lead',
  style: 'synth',
  blurb: 'A soaring electronic lead. Every note fires a laser that cuts through a whole line of enemies.',
  steps: 32,
  low: LOW,
  levels: [
    { text: 'A slow, soaring tune. Each note fires a laser through the nearest enemy. Held notes fire wider, stronger lasers.',
      pattern: [C(0, 2, 3), C(4, 1, 2), C(8, 0, 4), C(16, 1, 2), C(24, 2, 3)],
      stats: { damage: 18, longMul: 1.6, width: 10, wide: 20, length: 380 } },
    { text: 'More notes fill in the tune. Longer lasers.',
      pattern: [C(0, 2, 3), N(3, 3, 1, 0.7), C(4, 1, 2), N(6, 1, 2, 0.8), C(8, 0, 4),
        C(16, 1, 2), N(22, 3, 2, 0.8), C(24, 2, 3)],
      stats: { damage: 20, longMul: 1.6, width: 10, wide: 22, length: 420 } },
    { text: 'Quick lead-in notes before each bar fire extra lasers.',
      pattern: [C(0, 2, 3), N(3, 3, 1, 0.7), C(4, 1, 2), N(6, 1, 2, 0.8), C(8, 0, 4), N(15, 5, 1, 0.7),
        C(16, 1, 2), N(22, 3, 2, 0.8), C(24, 2, 3), N(30, 1, 1, 0.7), N(31, 2, 1, 0.8)],
      stats: { damage: 21, longMul: 1.7, width: 11, wide: 24, length: 460 } },
    { text: 'The second bar answers the first with its own tune. Longer reach.',
      pattern: [C(0, 2, 3), N(3, 3, 1, 0.7), C(4, 1, 2), N(6, 1, 2, 0.8), C(8, 0, 4), N(15, 5, 1, 0.7),
        C(16, 1, 2), N(18, 1, 1, 0.7), C(20, 0, 2, 0.85), N(22, 3, 2, 0.8), C(24, 2, 3), C(28, 1, 1, 0.75),
        N(30, 1, 1, 0.7), N(31, 2, 1, 0.8)],
      stats: { damage: 23, longMul: 1.7, width: 11, wide: 26, length: 500 } },
    { text: 'Big leaps up to high notes. Held notes fire a second laser at another enemy.',
      pattern: [C(0, 2, 3), N(3, 3, 1, 0.7), C(4, 1, 2), N(6, 1, 2, 0.8), C(8, 0, 4), C(12, 3, 2, 0.9), N(15, 5, 1, 0.7),
        C(16, 1, 2), N(18, 1, 1, 0.7), C(20, 0, 2, 0.85), N(22, 3, 2, 0.8), C(24, 2, 3), C(27, 3, 1, 0.8),
        C(28, 1, 1, 0.75), N(30, 1, 1, 0.7), N(31, 2, 1, 0.8)],
      stats: { damage: 29, longMul: 1.8, width: 12, wide: 28, length: 540, twin: 1 } },
  ],

  sound(A, t, note, out) {
    const { ctx, v } = A;
    const long = note.dur >= LONG;
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
    text: 'Lasers reach across the screen, held notes keep firing on every 16th, and anything a laser kills bursts.',
    stats: { length: 760, burst: 0.6, burstRadius: 60 },
    fire(g, note, st, inst) {
      const r = g.area(st.burstRadius), color = g.color('lead');
      const dmg = g.dmg(st.damage * (note.dur >= LONG ? st.longMul : 1)) * note.v * st.burst;
      const burst = (e) => { if (e.dead) g.fx.pulse({ x: e.x, y: e.y, r, damage: dmg, kb: 120, color, fill: 0.3 }); };
      lasers(g, note, st, burst);
      // Held notes keep screaming: the laser fires again on every 16th while the note sounds. Echoes do not.
      if (note.dur < LONG || g.dmgScale !== 1) return;
      for (let k = 1; k < Math.round(note.dur / STEP_SEC); k++) {
        g.later.push({ at: g.time + k * STEP_SEC, fn: () => {
          if (!g.loadout.has(inst)) return;
          const prev = g.src; g.src = inst;
          lasers(g, note, st, burst);
          g.src = prev;
        } });
      }
    },
  },
};

// One note's lasers through the nearest enemy (plus a second enemy on held notes once the level has twin).
function lasers(g, note, st, onHit) {
  const p = g.player;
  const color = g.color('lead');
  const long = note.dur >= LONG;
  const len = st.length;
  const targets = g.nearestN(p.x, p.y, 2, len + 40);
  const beam = (target) => {
    const base = target ? Math.atan2(target.y - p.y, target.x - p.x) : g.aim();
    // The pitch moves where the laser starts: high notes fire from one shoulder, low from the other.
    // It still passes through the target, so the tune sweeps the beam without costing hits.
    const side = (note.midi - MID) * 2.4;
    const x = p.x - Math.sin(base) * side, y = p.y + Math.cos(base) * side;
    const angle = target ? Math.atan2(target.y - y, target.x - x) : base;
    g.fx.beam({ x, y, angle, length: len, width: g.area(long ? st.wide : st.width),
      damage: g.dmg(st.damage * (long ? st.longMul : 1)) * note.v, kb: long ? 90 : 40, color,
      life: long ? 0.3 : 0.16, onHit });
  };
  beam(targets[0]);
  if (long && st.twin && targets[1]) beam(targets[1]);
}

// ---------------------------------------------------------------------------- Wooden Flute (Live)

const flute = {
  id: 'flute',
  name: 'Wooden Flute',
  role: 'lead',
  style: 'organic',
  blurb: 'A breathy wooden flute. Each note floats off as a glowing wisp that hunts down an enemy.',
  steps: 32,
  low: LOW,
  levels: [
    { text: 'A gentle tune. Each note sends out a wisp that hunts an enemy and flies on through it. High notes fly faster.',
      pattern: [C(0, 1, 3), C(4, 2, 2), C(8, 1, 4), C(12, 0, 2, 0.8),
        C(16, 2, 3), C(20, 1, 2), N(22, 1, 1, 0.7), C(24, 0, 2)],
      stats: { damage: 22, speed: 240, homing: 3.2, life: 2.4, size: 6, pierce: 1 } },
    { text: 'Little in-between notes join the tune, so more wisps.',
      pattern: [C(0, 1, 3), C(4, 2, 2), N(6, 3, 1, 0.7), C(8, 1, 4), C(12, 0, 2, 0.8),
        C(16, 2, 3), N(19, 3, 1, 0.7), C(20, 1, 2), N(22, 1, 1, 0.7), C(24, 0, 2)],
      stats: { damage: 23, speed: 250, homing: 3.4, life: 2.5, size: 6, pierce: 1 } },
    { text: 'Quick lead-in notes before each bar. Wisps last longer.',
      pattern: [C(0, 1, 3), C(4, 2, 2), N(6, 3, 1, 0.7), C(8, 1, 4), C(12, 0, 2, 0.8), N(15, 3, 1, 0.7),
        C(16, 2, 3), N(19, 3, 1, 0.7), C(20, 1, 2), N(22, 1, 1, 0.7), C(24, 0, 2), N(30, 1, 1, 0.7), N(31, 2, 1, 0.8)],
      stats: { damage: 24, speed: 260, homing: 3.6, life: 2.8, size: 6.5, pierce: 1 } },
    { text: 'The second bar sings a longer answer. Wisps pass through two enemies.',
      pattern: [C(0, 1, 3), C(4, 2, 2), N(6, 3, 1, 0.7), C(8, 1, 4), C(12, 0, 2, 0.8), N(15, 3, 1, 0.7),
        C(16, 2, 3), N(19, 3, 1, 0.7), C(20, 1, 2), N(22, 1, 1, 0.7), C(24, 0, 2), N(28, 4, 2, 0.75),
        N(30, 1, 1, 0.7), N(31, 2, 1, 0.8)],
      stats: { damage: 25, speed: 270, homing: 3.8, life: 2.9, size: 7, pierce: 2 } },
    { text: 'Bright leaps up to high notes. Wisps pass through three enemies.',
      pattern: [C(0, 1, 3), C(4, 2, 2), N(6, 3, 1, 0.7), C(8, 1, 4), C(12, 0, 2, 0.8), C(14, 3, 1, 0.85), N(15, 3, 1, 0.7),
        C(16, 2, 3), N(19, 3, 1, 0.7), C(20, 1, 2), N(22, 1, 1, 0.7), C(24, 0, 2), C(26, 3, 2, 0.8), N(28, 4, 2, 0.75),
        N(30, 1, 1, 0.7), N(31, 2, 1, 0.8)],
      stats: { damage: 28, speed: 280, homing: 4, life: 3, size: 7.5, pierce: 3 } },
  ],

  sound(A, t, note, out) {
    const { ctx, v } = A;
    const long = note.dur >= LONG;
    const f = note.freq;
    const dur = note.dur * 0.92;
    const vib = long ? { rate: 4.8, depth: 12, delay: 0.24 } : null;
    // Body: a soft sine with its first overtones. Slow attack, like breath filling the pipe.
    v.tone(ctx, out, t, { freq: f, wave: 'sine', dur, a: 0.035, d: 0.1, s: 0.85, r: 0.12, gain: 0.175 * note.v, vibrato: vib });
    v.tone(ctx, out, t, { freq: f * 2, wave: 'sine', dur, a: 0.05, d: 0.12, s: 0.7, r: 0.1, gain: 0.0875 * note.v, vibrato: vib });
    v.tone(ctx, out, t, { freq: f * 3, wave: 'sine', dur, a: 0.06, d: 0.1, s: 0.5, r: 0.08, gain: 0.0375 * note.v, vibrato: vib });
    // Breath: band-passed noise above the pitch, plus a soft chiff at the start of the note.
    v.noise(ctx, out, t, { dur, a: 0.02, d: 0.1, s: 0.6, r: 0.1, gain: 0.1125 * note.v, filter: { type: 'bandpass', freq: Math.min(9000, f * 4), q: 1.2 } });
    v.noise(ctx, out, t, { dur: 0.01, d: 0.04, gain: 0.1 * note.v, filter: { type: 'bandpass', freq: 3200, q: 1 } });
  },

  fire(g, note, st) {
    const p = g.player;
    const color = g.color('lead');
    const hi = Math.max(0, Math.min(1, (note.midi - LOW) / 23));   // 0 lowest note .. 1 highest
    const target = g.nearest(p.x, p.y, 520);
    const base = target ? Math.atan2(target.y - p.y, target.x - p.x) : g.aim();
    const n = g.amount(1);
    for (let i = 0; i < n; i++) {
      // Wisps leave at an angle set by the pitch and curl in, so the tune draws arcs on screen.
      const a = base + (hi - 0.5) * 1.1 + (i - (n - 1) / 2) * 0.5;
      g.fx.bullet({ x: p.x, y: p.y, angle: a, speed: g.speed(st.speed) * (0.8 + 0.5 * hi), r: st.size, life: st.life,
        damage: g.dmg(st.damage) * note.v, pierce: st.pierce, homing: st.homing, range: 480, kb: 30, color,
        shape: 'dot', trail: true });
    }
  },

  remix: {
    id: 'canon', name: 'Canon', pedal: 'delay',
    text: 'The flute plays a round: the delay sings every wisp again, a dotted eighth and then a quarter later.',
    stats: { canon: 0.6, canon2: 0.35 },
    fire(g, note, st, inst) {
      this.fire(g, note, st, inst);
      if (g.dmgScale !== 1) return;   // the round's own voices do not start new rounds
      // Through fireNote, like a Tape Delay echo: on whole 16ths of game time, so a pause holds them too.
      g.later.push({ at: g.time + ECHO_STEPS * STEP_SEC, fn: () => g.fireNote(inst, note, st.canon) });
      g.later.push({ at: g.time + 2 * ECHO_STEPS * STEP_SEC, fn: () => g.fireNote(inst, note, st.canon2) });
    },
  },
};

// ---------------------------------------------------------------------------- Square Lead (8-Bit)

const squareLead = {
  id: 'squarelead',
  name: 'Square Lead',
  role: 'lead',
  style: 'chip',
  blurb: 'A chirpy retro game tune. Every note shoots a pixel, high notes to one side and low notes to the other.',
  steps: 32,
  low: LOW,
  levels: [
    { text: 'A bouncy game tune. Each note shoots a pixel that punches through the nearest enemy.',
      pattern: [C(0, 1, 2), C(3, 2, 2), C(6, 1, 2), C(8, 0, 2), N(10, 1, 1, 0.75), C(12, 1, 2),
        C(16, 2, 2), C(19, 1, 2), C(22, 0, 2), C(24, 1, 2), N(26, 1, 1, 0.75), C(28, 0, 2)],
      stats: { damage: 14, count: 1, speed: 520, swing: 0.012, spread: 0.2, pierce: 1 } },
    { text: 'Quick lead-in notes into the second bar. Faster shots.',
      pattern: [C(0, 1, 2), C(3, 2, 2), C(6, 1, 2), C(8, 0, 2), N(10, 1, 1, 0.75), C(12, 1, 2), N(14, 3, 1, 0.7), N(15, 4, 1, 0.8),
        C(16, 2, 2), C(19, 1, 2), C(22, 0, 2), C(24, 1, 2), N(26, 1, 1, 0.75), C(28, 0, 2)],
      stats: { damage: 15, count: 1, speed: 560, swing: 0.012, spread: 0.2, pierce: 1 } },
    { text: 'A lead-in note before the tune repeats. Every note now shoots two pixels.',
      pattern: [C(0, 1, 2), C(3, 2, 2), C(6, 1, 2), C(8, 0, 2), N(10, 1, 1, 0.75), C(12, 1, 2), N(14, 3, 1, 0.7), N(15, 4, 1, 0.8),
        C(16, 2, 2), C(19, 1, 2), C(22, 0, 2), C(24, 1, 2), N(26, 1, 1, 0.75), C(28, 0, 2), N(31, 4, 1, 0.8)],
      stats: { damage: 15, count: 2, speed: 560, swing: 0.016, spread: 0.2, pierce: 1 } },
    { text: 'The second bar answers with its own twist. Pixels punch through two enemies.',
      pattern: [C(0, 1, 2), C(3, 2, 2), C(6, 1, 2), C(8, 0, 2), N(10, 1, 1, 0.75), C(12, 1, 2), N(14, 3, 1, 0.7), N(15, 4, 1, 0.8),
        C(16, 2, 2), N(18, 3, 1, 0.7), C(19, 1, 2), C(22, 0, 2), C(24, 1, 2), N(26, 1, 1, 0.75), C(28, 0, 2), N(30, 2, 1, 0.7), N(31, 4, 1, 0.8)],
      stats: { damage: 17, count: 2, speed: 580, swing: 0.018, spread: 0.2, pierce: 2 } },
    { text: 'The full theme with high leaps. Three pixels per note in a wide fan.',
      pattern: [C(0, 1, 2), C(2, 3, 1, 0.85), C(3, 2, 2), C(6, 1, 2), C(8, 0, 2), N(10, 1, 1, 0.75), C(12, 1, 2), N(14, 3, 1, 0.7), N(15, 4, 1, 0.8),
        C(16, 2, 2), N(18, 3, 1, 0.7), C(19, 1, 2), C(22, 0, 2), C(24, 1, 2), N(26, 1, 1, 0.75), C(27, 3, 1, 0.85), C(28, 0, 2), N(30, 2, 1, 0.7), N(31, 4, 1, 0.8)],
      stats: { damage: 23, count: 3, speed: 600, swing: 0.022, spread: 0.22, pierce: 2 } },
  ],

  sound(A, t, note, out) {
    const { ctx, v } = A;
    const held = note.dur >= 2 * STEP_SEC - 0.001;
    // Thin 25% pulse for quick notes, round 50% square for held ones. Held notes get a fast chip vibrato.
    v.tone(ctx, out, t, {
      freq: note.freq, duty: held ? 0.5 : 0.25, dur: note.dur * 0.85, a: 0.002, d: 0.06, s: 0.7, r: 0.04,
      gain: 0.2 * note.v, vibrato: held ? { rate: 7.5, depth: 22, delay: 0.09 } : null,
    });
  },

  fire(g, note, st) {
    const p = g.player;
    const color = g.color('lead');
    const target = g.nearest(p.x, p.y, 560);
    const base = target ? Math.atan2(target.y - p.y, target.x - p.x) : g.aim();
    const swing = (note.midi - MID) * st.swing;   // high notes swing the shot one way, low notes the other
    const n = g.amount(st.count);
    for (let i = 0; i < n; i++) {
      const a = base + swing + (i - (n - 1) / 2) * st.spread;
      g.fx.bullet({ x: p.x, y: p.y, angle: a, speed: g.speed(st.speed), r: 5, life: 1.1,
        damage: g.dmg(st.damage) * note.v, pierce: st.pierce, kb: 45, color, shape: 'diamond' });
    }
  },

  remix: {
    id: 'twinlead', name: 'Twin Lead', pedal: 'chorus',
    text: 'A harmony line joins the tune: every note fires a second fan at another enemy, swinging the other way.',
    stats: { twin: 0.7 },
    fire(g, note, st, inst) {
      this.fire(g, note, st, inst);
      const p = g.player;
      const near = g.nearestN(p.x, p.y, 2, 560);
      const t = near[1] || near[0];   // alone, the harmony doubles onto the same enemy
      const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : g.aim() + Math.PI;
      const swing = -(note.midi - MID) * st.swing;
      const n = g.amount(st.count);
      for (let i = 0; i < n; i++) {
        g.fx.bullet({ x: p.x, y: p.y, angle: base + swing + (i - (n - 1) / 2) * st.spread, speed: g.speed(st.speed), r: 5, life: 1.1,
          damage: g.dmg(st.damage) * note.v * st.twin, pierce: st.pierce, kb: 45, color: g.color('lead'), shape: 'diamond' });
      }
    },
  },
};

export default [sawLead, flute, squareLead];
