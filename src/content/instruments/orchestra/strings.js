// CHORDS, Orchestra: String Section. A bowed chord is held long and swells: while it sounds it wraps you in a
// shield, and when it ends the shield breaks outward as a wave. Short staccato chords (spiccato) pulse close.
// Like every Orchestra sound it rides the 8-bar phrase (note.phrase): soft after each fill, full at its climax.

import { STEP_SEC } from '../../../config.js';

// Pattern helpers (16 steps). B: a bowed chord of n notes held d steps. S: a short staccato chord.
const B = (s, n = 4, v = 1, d = 8) => ({ s, v, k: 'bow', chord: n, d });
const S = (s, n = 3, v = 0.8) => ({ s, v, k: 'spic', chord: n });

// Spread the section across the stereo field, lowest note left (the cellos side of the stage).
const spread = (i, n, w) => (n > 1 ? (i / (n - 1) - 0.5) * w : 0);
// Per-note level, so a four-note chord is no louder than a three-note one. Long releases overlap, so the
// bowed chords also leave headroom for the tail of the previous one.
const each = (n) => Math.sqrt(3 / n);

// The swell: gain and damage follow the note's place in its 8-bar phrase (0 right after a fill, 1 at the
// next one). Damage averages 1 over the phrase, so the swell moves power in time without adding any.
const swellGain = (note) => 0.55 + 0.45 * (note.phrase || 0);
const swellDmg = (note) => 0.7 + 0.6 * (note.phrase || 0);

// The part, built level by level (the notes each level adds): a long bowed chord answered by two stabs, then
// stabs on every half beat after it, a gallop into the next bar, and a pickup into the stabs.
const ADD_1 = [B(0), S(10, 3, 0.75), S(14, 3, 0.8)];
const ADD_2 = [S(8, 3, 0.85), S(12, 3, 0.8)];
const ADD_3 = [S(11, 3, 0.6), S(15, 3, 0.65)];
const ADD_5 = [S(6, 3, 0.6)];

const BOWED = 4;   // a chord held this many steps is bowed, whatever its kind (the arrangement can hold a stab)
const GUARD = 6;   // a bowed chord at least this many steps long raises the shield,
const SWELL = 0.5; // but only in the second half of the 8-bar phrase, while the orchestra swells,
const LONG = 12;   // and one this long takes two hits
const isBowed = (note) => note.k === 'bow' || note.dur >= BOWED * STEP_SEC - 0.001;

// A wave of bowed sound out from you. o: dmg (already scaled), r (radius), kb, erase (share of r that wipes shots).
function wave(g, inst, o) {
  const p = g.player;
  const color = g.color(inst);
  g.fx.ring({ x: p.x, y: p.y, follow: true, r0: 30, r1: o.r, dur: o.dur ?? 0.5, damage: o.dmg, kb: o.kb, width: o.width ?? 9,
    color, erase: o.erase || 0 });
  if (o.erase) g.fx.flash(p.x, p.y, o.r * o.erase, color, 0.3, 0.12);
}

// A bowed chord: the shield while it sounds (as the phrase swells), the wave when it ends (on the grid, a whole
// number of steps later). A hit on the shield takes that one hit and breaks it: the wave goes out at once, cut
// short (as big as the share of the chord already played). Crescendo (remix, st.stack): each chord that ends
// without you being hit stacks the next wave up (harder and wider), and a full stack floods the whole screen and
// wipes out the shots close to you. A hit, on you or on the shield, starts the count again.
function bow(g, note, st, inst) {
  const steps = Math.max(1, Math.round(note.dur / STEP_SEC));
  const held = Math.min(1, steps / 8);
  // Damage and size are fixed when the chord starts: its weight in the arrangement, the fader and the echo scale.
  const dmg = g.dmg(st.damage) * note.v * swellDmg(note) * (0.6 + 0.4 * held);
  const r = g.area(st.radius) * (0.85 + 0.15 * note.v) * (0.8 + 0.2 * held);
  // An echo has no chord to hold: it breaks as a small wave at once, with no shield and nothing scheduled.
  if (g.dmgScale !== 1) { wave(g, inst, { dmg, r: r * 0.8, kb: st.kb * 0.6 }); return; }
  const mem = inst.state;
  const tok = { burst: false, t0: g.time, shield: null };
  const release = (gg, burst) => {
    if (burst) {
      const played = Math.max(0, Math.min(1, (gg.time - tok.t0) / (steps * STEP_SEC)));
      if (st.stack) mem.stack = 0;
      wave(gg, inst, { dmg: dmg * (0.4 + 0.6 * played), r: r * (0.7 + 0.3 * played), kb: st.kb * 0.6 });
      return;
    }
    const stack = st.stack ? mem.stack || 0 : 0;
    let mul = 1 + stack * (st.stack || 0), rr = r * (1 + stack * (st.stackR || 0)), erase = 0;
    if (st.stack) {
      const clean = gg.lastHurtAt < tok.t0 && !(tok.shield && tok.shield.n < tok.shield.n0);
      mem.stack = clean ? stack + 1 : 0;
      if (clean && mem.stack >= st.stackMax) {
        // The last unbroken chord of a full stack: the whole section swells over the screen.
        mem.stack = 0;
        mul = st.flood; rr = g.area(st.floodR); erase = st.floodErase;
        gg.shake = Math.max(gg.shake, 6);
      }
    }
    wave(gg, inst, { dmg: dmg * mul, r: rr, kb: st.kb, erase, dur: rr > r * 1.5 ? 0.9 : 0.5, width: rr > r * 1.5 ? 14 : 9 });
  };
  if (steps >= GUARD && (note.phrase || 0) >= SWELL) {
    const n = steps >= LONG ? 2 : st.guard;
    const cur = g.shield;
    // Never cut short a stronger shield from another sound.
    if (!cur || cur.src === inst || cur.n <= n) {
      tok.shield = g.shield = { n, n0: n, until: g.time + steps * STEP_SEC, src: inst, tok,
        onBreak: (gg) => { tok.burst = true; release(gg, true); } };
    }
  }
  g.later.push({ at: g.time + steps * STEP_SEC, fn: () => {
    if (tok.burst || !g.loadout.has(inst)) return;
    if (g.shield?.tok === tok) g.shield = null;
    const prev = g.src; g.src = inst;
    release(g, false);
    g.src = prev;
  } });
}

// A staccato chord: a quick, small pulse around you.
function stab(g, note, st, inst) {
  const p = g.player;
  g.fx.pulse({ x: p.x, y: p.y, r: g.area(st.spicR) * (0.85 + 0.15 * note.v), damage: g.dmg(st.spic) * note.v * swellDmg(note),
    kb: 70, color: g.color(inst), fill: 0.1, flashLife: 0.14 });
}

export default {
  id: 'strings',
  name: 'String Section',
  role: 'chords',
  style: 'orchestra',
  blurb: 'Swelling strings: long chords shield you as the music builds, then break as a wave.',
  steps: 16,
  center: 62,
  levels: [
    { text: 'A long chord breaks as a wave. Swelling, it shields you.',
      pattern: [...ADD_1],
      stats: { damage: 11, radius: 180, kb: 140, guard: 1, spic: 6, spicR: 90 } },
    { text: 'Stabs on every half beat after the chord.',
      pattern: [...ADD_1, ...ADD_2],
      stats: { damage: 17, radius: 200, kb: 140, guard: 1, spic: 7, spicR: 92 } },
    { text: 'A galloping rhythm drives into the next bar.',
      pattern: [...ADD_1, ...ADD_2, ...ADD_3],
      stats: { damage: 28, radius: 225, kb: 145, guard: 1, spic: 8, spicR: 96 } },
    { text: 'Wider waves that push harder.',
      pattern: [...ADD_1, ...ADD_2, ...ADD_3],
      stats: { damage: 44, radius: 260, kb: 155, guard: 1, spic: 9, spicR: 100 } },
    { text: 'A pickup stab leads in. The biggest waves.',
      pattern: [...ADD_1, ...ADD_2, ...ADD_3, ...ADD_5],
      stats: { damage: 70, radius: 290, kb: 160, guard: 1, spic: 11, spicR: 105 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    const n = note.freqs.length;
    const sw = swellGain(note);
    if (!isBowed(note)) {
      // Spiccato: the bow bounces off the string. A fast attack, a short bite, a little rosin on top.
      note.freqs.forEach((f, i) => {
        v.tone(ctx, out, t, { freq: f, wave: 'sawtooth', unison: 2, spread: 10, dur: inst?.remix ? 0.07 : 0.04, a: 0.008, d: 0.11, s: 0.25, r: 0.08,
          gain: 0.3 * note.v * sw * each(n), filter: { type: 'lowpass', freq: 1700, env: 1.8, decay: 0.08, q: 0.9 }, pan: spread(i, n, 0.6) });
      });
      return;
    }
    // Bowed: three detuned saws per note, a slow bow attack, a filter that opens over the note (and wider at
    // the phrase's climax), and a gentle vibrato once the note has settled.
    const a = Math.min(0.4, 0.12 + note.dur * 0.18);
    const open = 2200 * (0.8 + 0.4 * (note.phrase || 0));
    const vib = { rate: 5, depth: 6, delay: 0.22 };
    note.freqs.forEach((f, i) => {
      v.tone(ctx, out, t, { freq: f, wave: 'sawtooth', unison: 3, spread: 12, dur: note.dur, a, d: 0.3, s: 0.85, r: 0.5,
        gain: 0.28 * note.v * sw * each(n), filter: { type: 'lowpass', freq: 1300, to: open, time: Math.max(0.2, note.dur), q: 0.7 },
        vibrato: vib, pan: spread(i, n, 0.7) });
    });
    // Crescendo (remix): the violins double the top line an octave up, sweet and airy.
    if (inst?.remix) {
      const top = note.freqs[n - 1];
      v.tone(ctx, out, t, { freq: top * 2, wave: 'triangle', unison: 2, spread: 8, dur: note.dur, a: a * 1.3, d: 0.3, s: 0.8, r: 0.5,
        gain: 0.12 * note.v * sw, vibrato: { rate: 5.5, depth: 9, delay: 0.25 }, pan: 0.3 });
    }
  },

  fire(g, note, st, inst) {
    if (isBowed(note)) bow(g, note, st, inst);
    else stab(g, note, st, inst);
  },

  remix: {
    id: 'crescendo', name: 'Crescendo', pedal: 'chorus',
    text: 'Unbroken chords build the wave. Four in a row flood the screen.',
    // A new part: a measured tremolo that grows across the first half of the bar into a chord bowed to its end,
    // so every wave breaks on the next downbeat.
    pattern: [S(0, 3, 0.45), S(1, 3, 0.5), S(2, 3, 0.55), S(3, 3, 0.6), S(4, 3, 0.65), S(5, 3, 0.7), S(6, 3, 0.75), S(7, 3, 0.8),
      B(8, 4, 1, 8)],
    stats: { stack: 0.4, stackR: 0.3, stackMax: 4, flood: 2.5, floodR: 720, floodErase: 0.45 },
  },
};
