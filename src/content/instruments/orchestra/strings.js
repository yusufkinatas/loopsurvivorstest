// CHORDS, Orchestra: String Section. Each bar's downbeat lines the section up on the thickest crowd near you, and
// the bar plays a barrage along that heading on the grid: every short staccato chord (spiccato) lands a rank of bow
// strokes across the line, one step further out from you than the last, so the line marches away from you through
// the crowd. A bowed chord is held long and swells: while it sounds (late in the 8-bar phrase) it wraps you in a
// shield, and when it ends a wide rank lands across the line. Like every Orchestra sound it rides the 8-bar phrase
// (note.phrase): soft after each fill, full at its climax.

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

// The barrage: the bar's first note sets the line it marches along (toward a boss in range, else the thickest crowd
// near you, else where you face), and the line keeps that heading all bar, marching out from wherever you are.
// mem.k counts the ranks the stabs have landed this bar.
function lineUp(g, note, st, mem) {
  if (mem.bar !== note.bar || mem.a === undefined) {
    const p = g.player;
    const boss = g.bossInRange(p.x, p.y, st.aim);
    const crowd = boss || g.densest(st.aim);
    mem.bar = note.bar; mem.k = 0;
    mem.a = crowd ? Math.atan2(crowd.y - p.y, crowd.x - p.x) : g.aim();
  }
  return { x: g.player.x, y: g.player.y, a: mem.a };
}

// A rank: n bow strokes side by side across the line, d px out from you. Each is a strike that lands
// a 16th-fraction later, hitting what stands on it. o: dmg (already scaled), r, kb, stun. Strikes carry `rank`
// (their place in it and its size) for the renderer.
function rank(g, inst, line, d, n, o) {
  const a = line.a, cx = line.x + Math.cos(a) * d, cy = line.y + Math.sin(a) * d;
  const nx = -Math.sin(a), ny = Math.cos(a), gap = o.r * 1.7;
  const color = g.color(inst);
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * gap;
    const s = g.fx.strike({ x: cx + nx * off, y: cy + ny * off, delay: 0.1, r: o.r, damage: o.dmg, kb: o.kb, stun: o.stun || 0, color, style: 'ring' });
    s.rank = { i, n, a };
  }
}

// A bowed chord: the shield while it sounds (as the phrase swells), a wide rank across the line when it ends (on the
// grid, a whole number of steps later), `bowD` px out. A hit on the shield takes that one hit and breaks it: the rank
// lands at once, cut short (as strong as the share of the chord already played, three strokes wide). Crescendo
// (remix, st.stack): each chord that ends without you being hit stacks the next rank up (harder), and a full stack
// lands three wide ranks, one behind the other, and wipes out the shots close to you. A hit, on you or on the
// shield, starts the count again.
function bow(g, note, st, inst) {
  const steps = Math.max(1, Math.round(note.dur / STEP_SEC));
  const held = Math.min(1, steps / 8);
  const mem = inst.state;
  const a = lineUp(g, note, st, mem).a;
  const line = (gg) => ({ x: gg.player.x, y: gg.player.y, a });   // the heading it started with, from where you are
  // Damage and size are fixed when the chord starts: its weight in the arrangement, the fader and the echo scale.
  const dmg = g.dmg(st.damage) * note.v * swellDmg(note) * (0.6 + 0.4 * held);
  const r = g.area(st.spot);
  // An echo has no chord to hold: it lands a short rank at once, with no shield and nothing scheduled.
  if (g.dmgScale !== 1) { rank(g, inst, line(g), st.bowD, 3, { dmg, r: r * 0.9, kb: st.kb * 0.6 }); return; }
  const tok = { burst: false, t0: g.time, shield: null };
  const release = (gg, burst) => {
    if (burst) {
      const played = Math.max(0, Math.min(1, (gg.time - tok.t0) / (steps * STEP_SEC)));
      if (st.stack) mem.stack = 0;
      rank(gg, inst, line(gg), st.bowD, 3, { dmg: dmg * (0.4 + 0.6 * played), r, kb: st.kb * 0.6 });
      return;
    }
    const stack = st.stack ? mem.stack || 0 : 0;
    let mul = 1 + stack * (st.stack || 0), rows = 1;
    if (st.stack) {
      const clean = gg.lastHurtAt < tok.t0 && !(tok.shield && tok.shield.n < tok.shield.n0);
      mem.stack = clean ? stack + 1 : 0;
      if (clean && mem.stack >= st.stackMax) {
        // The last unbroken chord of a full stack: the whole section digs in, three ranks deep.
        mem.stack = 0;
        mul = st.flood; rows = st.floodRows;
        const p = gg.player;
        gg.fx.ring({ x: p.x, y: p.y, follow: true, r0: 30, r1: gg.area(st.floodErase), dur: 0.5, damage: 0, kb: 0, width: 6, color: gg.color(inst), erase: 1 });
        gg.shake = Math.max(gg.shake, 5);
      }
    }
    for (let k = 0; k < rows; k++) rank(gg, inst, line(gg), st.bowD + k * r * 1.8, st.wide, { dmg: dmg * mul, r, kb: st.kb, stun: st.stun });
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

// A staccato chord: a rank of three short strokes, one step further along the line than the last stab's (an echo
// lands on the last one's spot again).
function stab(g, note, st, inst) {
  const mem = inst.state;
  const line = lineUp(g, note, st, mem);
  const d = Math.min(st.dMax, st.d0 + st.step * Math.max(0, mem.k - (g.dmgScale === 1 ? 0 : 1)));
  if (g.dmgScale === 1) mem.k++;
  rank(g, inst, line, d, 3, { dmg: g.dmg(st.spic) * note.v * swellDmg(note), r: g.area(st.spot) * 0.85, kb: 70 });
}

export default {
  id: 'strings',
  name: 'String Section',
  role: 'chords',
  style: 'orchestra',
  blurb: 'Swelling strings: every bar a barrage of bow strokes marches from you into the crowd, and long chords shield you as the music builds.',
  steps: 16,
  center: 62,
  levels: [
    { text: 'Each bar lines up on the crowd. Stabs land ranks of bow strokes marching out along that line; the long chord lands a wide rank as it ends, and shields you while the music builds.',
      pattern: [...ADD_1],
      stats: { damage: 28, spic: 18, spot: 32, d0: 45, step: 42, dMax: 300, bowD: 110, wide: 5, aim: 300, kb: 120, guard: 1 } },
    { text: 'Stabs on every half beat after the chord: the line marches farther.',
      pattern: [...ADD_1, ...ADD_2],
      stats: { damage: 34, spic: 21, spot: 33, d0: 45, step: 42, dMax: 300, bowD: 110, wide: 5, aim: 300, kb: 125, guard: 1 } },
    { text: 'A galloping rhythm drives into the next bar.',
      pattern: [...ADD_1, ...ADD_2, ...ADD_3],
      stats: { damage: 46, spic: 25, spot: 35, d0: 45, step: 40, dMax: 300, bowD: 115, wide: 5, aim: 310, kb: 130, guard: 1 } },
    { text: 'Bigger, harder strokes.',
      pattern: [...ADD_1, ...ADD_2, ...ADD_3],
      stats: { damage: 66, spic: 33, spot: 38, d0: 45, step: 40, dMax: 300, bowD: 120, wide: 5, aim: 320, kb: 140, guard: 1 } },
    { text: 'A pickup stab leads in. The biggest strokes, and the long chord\'s rank stuns.',
      pattern: [...ADD_1, ...ADD_2, ...ADD_3, ...ADD_5],
      stats: { damage: 100, spic: 50, spot: 41, d0: 45, step: 38, dMax: 300, bowD: 125, wide: 5, aim: 320, kb: 150, guard: 1, stun: 0.3 } },
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
    text: 'Unbroken chords stack the long chord\'s rank. Four in a row land three ranks deep and clear the shots around you.',
    // A new part: a measured tremolo that grows across the first half of the bar into a chord bowed to its end,
    // so every rank lands on the next downbeat.
    pattern: [S(0, 3, 0.45), S(1, 3, 0.5), S(2, 3, 0.55), S(3, 3, 0.6), S(4, 3, 0.65), S(5, 3, 0.7), S(6, 3, 0.75), S(7, 3, 0.8),
      B(8, 4, 1, 8)],
    stats: { damage: 130, spic: 66, step: 34, stack: 0.4, stackMax: 4, flood: 2.2, floodRows: 3, floodErase: 170 },
  },
};
