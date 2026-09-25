// BASS channel: the low notes. Roots and fifths that lock onto the kick, syncopated at higher levels.
// Heavy and close: pulses around the player, slugs that bowl through the front row, mines tossed into the crowd.

import { STEP_SEC } from '../../config.js';

// Pattern helpers: step s (0..15), duration d in steps, velocity v.
// R root, F fifth, O root an octave up (chord tones, so they follow every chord change).
const R = (s, d = 1, v = 1) => ({ s, v, d, ct: 0 });
const F = (s, d = 1, v = 1) => ({ s, v, d, ct: 2 });
const O = (s, d = 1, v = 1) => ({ s, v, d, ct: 0, o: 1 });
// W walking note: scale step n from the chord root (0 root, 1 second, 2 third, 3 fourth, 4 fifth).
const W = (s, n, d = 1, v = 1) => ({ s, v, d, sc: n });

// ---------------------------------------------------------------------------- Sub Bass (Synth)

const subBass = {
  id: 'subbass',
  name: 'Sub Bass',
  role: 'bass',
  style: 'synth',
  blurb: 'A deep electronic hum you feel in your chest. Every note pulses around you, hurting and slowing anything close.',
  steps: 16,
  low: 28,
  levels: [
    { text: 'Long, deep notes on beats 1 and 3. Each one pulses around you and slows what it hits.',
      pattern: [R(0, 7), R(8, 7, 0.95)],
      stats: { damage: 17, radius: 108, slow: 0.35, kb: 45 } },
    { text: 'Adds a jump to a higher note in between. One more pulse every bar.',
      pattern: [R(0, 6), O(6, 2, 0.75), R(8, 7, 0.95)],
      stats: { damage: 20, radius: 118, slow: 0.38, kb: 45 } },
    { text: 'Adds a note on beat 4. Pulses reach farther.',
      pattern: [R(0, 6), O(6, 2, 0.75), R(8, 4, 0.95), F(12, 3, 0.85)],
      stats: { damage: 25, radius: 134, slow: 0.42, kb: 50 } },
    { text: 'A quick rolling run closes each bar. Pulses slow even harder.',
      pattern: [R(0, 6), O(6, 2, 0.75), R(8, 4, 0.95), F(12, 2, 0.85), O(14, 1, 0.7), R(15, 1, 0.65)],
      stats: { damage: 30, radius: 150, slow: 0.48, kb: 50 } },
    { text: 'Full rolling groove. Much wider pulses, and the longest notes now stun what is close.',
      pattern: [R(0, 3), R(3, 3, 0.6), O(6, 2, 0.75), R(8, 3, 0.95), O(11, 1, 0.55), F(12, 2, 0.85), O(14, 1, 0.7), R(15, 1, 0.65)],
      stats: { damage: 40, radius: 182, slow: 0.52, kb: 55, stun: 0.3 } },
  ],

  sound(A, t, note, out) {
    const { ctx, v } = A;
    // Round sine body, plus a softly filtered saw at the same pitch whose overtones keep it audible on small speakers.
    v.tone(ctx, out, t, { freq: note.freq, wave: 'sine', dur: note.dur, a: 0.008, d: 0.12, s: 0.8, r: 0.12, gain: 0.085 * note.v });
    v.tone(ctx, out, t, { freq: note.freq, wave: 'sawtooth', dur: note.dur, a: 0.005, d: 0.18, s: 0.7, r: 0.1, gain: 0.23 * note.v,
      filter: { type: 'lowpass', freq: 480, q: 0.8, env: 2, decay: 0.14 } });
  },

  fire(g, note, st) {
    const p = g.player;
    const color = g.color('bass');
    // Long notes hit harder: a one-step note deals 75%, a six-step note 150%.
    const steps = note.dur / STEP_SEC;
    const len = Math.min(1.5, 0.6 + 0.15 * steps);
    const long = steps >= 3;
    g.fx.pulse({ x: p.x, y: p.y, r: g.area(st.radius) * (0.85 + 0.15 * note.v), damage: g.dmg(st.damage) * note.v * len,
      kb: st.kb, slow: st.slow, stun: long ? st.stun || 0 : 0, color, fill: long ? 0.26 : 0.16, flashLife: long ? 0.3 : 0.2 });
    g.shake = Math.max(g.shake, (long ? 2 : 1) * note.v);
  },
};

// ---------------------------------------------------------------------------- Upright Bass (Live)

const upright = {
  id: 'upright',
  name: 'Upright Bass',
  role: 'bass',
  style: 'organic',
  blurb: 'A big plucked double bass, warm and woody. Every note fires a heavy slug that bowls through enemies.',
  steps: 16,
  low: 31,
  levels: [
    { text: 'Four plucks per bar. Each one fires a heavy slug at the closest enemy.',
      pattern: [W(0, 0, 4), W(4, 4, 4, 0.85), W(8, 0, 4, 0.95), W(12, 4, 4, 0.85)],
      stats: { damage: 24, pierce: 1, size: 9, speed: 290, kb: 170 } },
    { text: 'Adds a quick pickup note at the end of every bar.',
      pattern: [W(0, 0, 4), W(4, 4, 4, 0.85), W(8, 0, 4, 0.95), W(12, 4, 2, 0.85), W(14, 2, 2, 0.75)],
      stats: { damage: 25, pierce: 1, size: 9.5, speed: 295, kb: 175 } },
    { text: 'The line starts walking between notes. Slugs punch through one more enemy.',
      pattern: [W(0, 0, 4), W(4, 4, 2, 0.85), W(6, 3, 2, 0.75), W(8, 0, 2, 0.95), W(10, 2, 2, 0.75), W(12, 4, 2, 0.85), W(14, 2, 2, 0.75)],
      stats: { damage: 26, pierce: 2, size: 10, speed: 300, kb: 180 } },
    { text: 'Soft muted plucks fill the gaps. Bigger slugs punch through one more enemy.',
      pattern: [W(0, 0, 3), W(3, 0, 1, 0.5), W(4, 4, 2, 0.85), W(6, 3, 2, 0.75), W(8, 0, 2, 0.95), W(10, 2, 2, 0.75), W(12, 4, 2, 0.85), W(14, 2, 1, 0.75), W(15, 1, 1, 0.6)],
      stats: { damage: 29, pierce: 3, size: 11, speed: 305, kb: 195 } },
    { text: 'Full walking line. Slugs plow through five enemies and hit even harder.',
      pattern: [W(0, 0, 3), W(3, 0, 1, 0.5), W(4, 4, 2, 0.85), W(6, 3, 1, 0.75), W(7, 1, 1, 0.55), W(8, 0, 2, 0.95), W(10, 2, 1, 0.75), W(11, 0, 1, 0.5), W(12, 4, 2, 0.85), W(14, 2, 1, 0.75), W(15, 1, 1, 0.6)],
      stats: { damage: 34, pierce: 4, size: 12.5, speed: 310, kb: 210 } },
  ],

  sound(A, t, note, out) {
    const { ctx, v } = A;
    const f = note.freq;
    // The string itself, darkened so it sounds like gut strings rather than a guitar.
    v.pluck(ctx, out, t, { freq: f, decay: 0.995, bright: 0.12, dur: Math.max(0.35, note.dur + 0.12), gain: 0.75 * note.v,
      filter: { type: 'lowpass', freq: 300, q: 0.7, env: 1.8, decay: 0.12 } });
    // Wooden body: a sine thump at the note that fades fast.
    v.tone(ctx, out, t, { freq: f, wave: 'sine', dur: 0.02, d: 0.4, s: 0, r: 0.06, gain: 0.4 * note.v });
    // Finger on the string.
    v.noise(ctx, out, t, { dur: 0.003, d: 0.025, gain: 0.05 * note.v, filter: { type: 'bandpass', freq: 700, q: 1.2 } });
  },

  fire(g, note, st) {
    const p = g.player;
    const color = g.color('bass');
    const target = g.nearest(p.x, p.y, 520);
    const a = target ? Math.atan2(target.y - p.y, target.x - p.x) : g.aim();
    g.fx.bullet({ x: p.x, y: p.y, angle: a, rot: a, speed: g.speed(st.speed), r: st.size * (0.8 + 0.2 * note.v), life: 1.5,
      damage: g.dmg(st.damage) * note.v, pierce: st.pierce, kb: st.kb, color, shape: 'seed', trail: true });
  },
};

// ---------------------------------------------------------------------------- Triangle Bass (8-Bit)

const triBass = {
  id: 'tribass',
  name: 'Triangle Bass',
  role: 'bass',
  style: 'chip',
  blurb: 'The bouncy low line of old game consoles. Every note tosses a mine into the crowd, and mines blow up on the beat.',
  steps: 16,
  low: 28,
  levels: [
    { text: 'Low and high notes bounce back and forth. Each note tosses a mine into the nearest crowd, and mines with enemies on them blow up.',
      pattern: [R(0, 2), O(2, 2, 0.8), R(8, 2, 0.95), O(10, 2, 0.8)],
      stats: { damage: 23, radius: 72, kb: 90, count: 1, toss: 420 } },
    { text: 'The bounce carries through beat 2. Two more blasts every bar.',
      pattern: [R(0, 2), O(2, 2, 0.8), R(4, 2, 0.9), O(6, 2, 0.8), R(8, 2, 0.95), O(10, 2, 0.8)],
      stats: { damage: 24, radius: 76, kb: 95, count: 1, toss: 440 } },
    { text: 'Bounces on every half beat. Bigger blasts.',
      pattern: [R(0, 2), O(2, 2, 0.8), R(4, 2, 0.9), O(6, 2, 0.8), R(8, 2, 0.95), O(10, 2, 0.8), F(12, 2, 0.9), O(14, 2, 0.8)],
      stats: { damage: 27, radius: 86, kb: 100, count: 1, toss: 460 } },
    { text: 'Quick extra hops between the bounces. Blasts throw enemies back harder.',
      pattern: [R(0, 2), O(2, 1, 0.8), O(3, 1, 0.55), R(4, 2, 0.9), O(6, 2, 0.8), R(8, 2, 0.95), O(10, 1, 0.8), O(11, 1, 0.55), F(12, 2, 0.9), O(14, 2, 0.8)],
      stats: { damage: 31, radius: 94, kb: 120, count: 1, toss: 480 } },
    { text: 'Full bouncing line. Every note tosses a second mine at another enemy.',
      pattern: [R(0, 2), O(2, 1, 0.8), O(3, 1, 0.55), R(4, 2, 0.9), O(6, 1, 0.8), R(7, 1, 0.55), R(8, 2, 0.95), O(10, 1, 0.8), O(11, 1, 0.55), F(12, 2, 0.9), O(14, 1, 0.8), R(15, 1, 0.6)],
      stats: { damage: 38, radius: 106, kb: 130, count: 2, toss: 520 } },
  ],

  sound(A, t, note, out) {
    const { ctx, v } = A;
    // The console triangle channel: just on and off with a tiny pitch hop, plus a thin pulse wave for bite.
    v.tone(ctx, out, t, { freq: note.freq, wave: 'triangle', dur: note.dur * 0.85, a: 0.002, d: 0.04, s: 0.9, r: 0.02, gain: 0.3 * note.v,
      pitchEnv: { from: 1.12, time: 0.015 } });
    v.tone(ctx, out, t, { freq: note.freq, duty: 0.25, dur: note.dur * 0.85, a: 0.002, d: 0.08, s: 0.5, r: 0.02, gain: 0.15 * note.v });
  },

  fire(g, note, st, inst) {
    const p = g.player;
    const color = g.color('bass');
    const id = inst.def.id;
    // Mines already lying in a crowd go off on the beat; the rest keep waiting.
    g.fx.detonateMines(id, 1, { armed: true });
    // Then toss fresh ones: the first into the thickest crowd nearby, extras onto other enemies.
    // With nobody around they land at your feet.
    const n = Math.max(1, g.amount(st.count));
    const spot = g.densest(st.toss);
    for (let i = 0; i < n; i++) {
      const e = i === 0 ? spot : g.randomEnemy(p.x, p.y, st.toss);
      const x = e ? e.x : p.x, y = e ? e.y : p.y;
      g.fx.mine({ owner: id, x, y, r: g.area(st.radius), damage: g.dmg(st.damage) * note.v,
        kb: st.kb, color, life: 5, max: n + 6, size: 6 + note.v * 2 });
      g.fx.particles(x, y, color, 3, 60, 0.25, 2);
    }
  },
};

export default [subBass, upright, triBass];
