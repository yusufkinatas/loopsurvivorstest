// SPARKLE, Orchestra: Harp. Plucked glissandos of chord tones. Each glissando sets a harp frame down
// on the crowd: six strings laid across the line from you, nearest you the lowest. Each note plucks its own string
// as a beam, so a glissando sweeps the frame like a curtain and you can watch the tune.
// Like every Orchestra sound it rides the 8-bar phrase (note.phrase): soft after each fill, full at its climax.

import { STEP_SEC } from '../../../config.js';
import { chordTone } from '../../../music/theory.js';
import { rng } from '../../../util.js';

// Pattern helper (16 steps): chord tone c (with sevenths: 0 root, 1 third, 2 fifth, 3 seventh, 4 root an
// octave up, 5 the third above it), velocity v. From LOW the top string (ct 5) stays under the Sparkle ceiling.
const N = (s, c, v = 1) => ({ s, ct: c, v });
const LOW = 71;

const STRINGS = 6;
const AHEAD = 140;     // px from you to the middle of a frame set down with no crowd near

// The glissando, built level by level: 8ths up and down, then 16ths filling the rise and the fall, then
// pickups and turns at the top and the bottom, until every step plucks.
const UP = [N(0, 0, 0.85), N(2, 2, 0.9), N(4, 4)];
const DOWN = [N(8, 5, 0.95), N(10, 3, 0.85), N(12, 1, 0.8)];
const RISE = [N(1, 1, 0.6), N(3, 3, 0.65), N(5, 5, 0.75)];
const FALL = [N(9, 4, 0.65), N(11, 2, 0.6), N(13, 0, 0.6)];
const PICKUP = [N(7, 4, 0.6), N(15, 1, 0.55)];
const TURN = [N(6, 5, 0.7), N(14, 0, 0.65)];

const swellGain = (note) => 0.55 + 0.45 * (note.phrase || 0);
const swellDmg = (note) => 0.7 + 0.6 * (note.phrase || 0);

// Which string a note plucks: its chord tone counted up from the frame's lowest string.
function stringOf(note) {
  for (let i = 0; i < STRINGS; i++) if (chordTone(note.chord, i, LOW, true) >= note.midi) return i;
  return STRINGS - 1;
}

// Each glissando (each half bar) sets its own frame down, on its first note, over the thickest crowd within
// reach (a different one from the last frame's when there is one), its strings across the line from you: a
// rising glissando sweeps away from you through the crowd and a falling one sweeps back. With no crowd near,
// the frame goes 140 px ahead of you, across where you face. On the bar's downbeat a boss in reach takes the
// middle of the frame. Aeolian (remix, st.cross) sets a pair down for every group of three notes (each gust):
// the first frame as above, and a second crossing it at 90 degrees on another crowd, or in your wake when there
// is none (frame.cross). An echo never moves either.
function frameOf(g, note, st, inst) {
  const S = inst.state;
  const s = note.s % 16;
  const slot = st.cross ? note.bar * 6 + Math.floor(s / 3) : note.bar * 2 + (s >= 8 ? 1 : 0);
  if (S.frame && (S.frame.slot === slot || g.dmgScale !== 1)) return S.frame;
  const p = g.player, last = S.frame;
  const t = (note.s === 0 && g.bossInRange(p.x, p.y, st.reach))
    || (last && otherCrowd(g, st.reach, last.cx, last.cy, st.len * 0.45)) || g.densest(st.reach)?.enemy || null;
  const ang = t ? Math.atan2(t.y - p.y, t.x - p.x) : g.aim();
  const cx = t ? t.x : p.x + Math.cos(ang) * AHEAD, cy = t ? t.y : p.y + Math.sin(ang) * AHEAD;
  S.frame = { slot, cx, cy, ang, cross: null };
  if (st.cross) {
    // Another crowd, turned 90 degrees so its strings run toward you; with none, your wake: where you were about
    // half a beat ago, the strings across the way you are going.
    const o = otherCrowd(g, st.reach, cx, cy, st.len * 0.45);
    const moving = Math.hypot(p.vx, p.vy) > 30;
    const way = moving ? Math.atan2(p.vy, p.vx) : g.aim();
    const back = moving ? st.wake : 0;
    S.frame.cross = o ? { cx: o.x, cy: o.y, ang: Math.atan2(o.y - p.y, o.x - p.x) + Math.PI / 2 }
      : { cx: p.x - Math.cos(way) * back, cy: p.y - Math.sin(way) * back, ang: way };
  }
  if (g.dmgScale === 1) g.fx.flash(cx, cy, 34, g.color(inst), 0.25, 0.06);
  return S.frame;
}

// The thickest crowd within `range` of you whose middle is at least `apart` px from (ax, ay), or null
// (sampled like game.densest).
function otherCrowd(g, range, ax, ay, apart) {
  const p = g.player;
  const arr = g.inRadius(p.x, p.y, range).filter((e) => (e.x - ax) ** 2 + (e.y - ay) ** 2 > apart * apart);
  let best = null, bestN = -1;
  for (let i = 0, n = Math.min(arr.length, 12); i < n; i++) {
    const e = arr[Math.floor(rng() * arr.length)];
    let k = 0;
    for (const o of arr) if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 8100) k += o.boss ? 6 : 1;
    if (k > bestN) { bestN = k; best = e; }
  }
  return best;
}

// Pluck string i of a frame: a beam along the string. Frames grow with the level (st.len, st.gap) and with area.
function pluck(g, inst, st, fr, i, dmg) {
  const a = fr.ang, k = g.area(1);
  const len = st.len * k, off = (i - (STRINGS - 1) / 2) * st.gap * k;
  const sx = fr.cx + Math.cos(a) * off, sy = fr.cy + Math.sin(a) * off;   // the string's middle
  const ux = -Math.sin(a), uy = Math.cos(a);                               // along the string
  g.fx.beam({ x: sx - ux * len / 2, y: sy - uy * len / 2, angle: a + Math.PI / 2, length: len, width: g.area(st.width),
    damage: dmg, kb: 30, slow: st.slow || 0, color: g.color(inst), life: 0.3 });
}

export default {
  id: 'harp',
  name: 'Harp',
  role: 'arp',
  style: 'orchestra',
  blurb: 'Rippling harp glissandos pluck a frame of strings laid over the crowd.',
  steps: 16,
  low: LOW,
  seventh: true,
  levels: [
    { text: 'Each sweep lays a harp on the crowd to pluck.',
      pattern: [...UP, ...DOWN],
      stats: { damage: 27, width: 13, len: 200, gap: 24, reach: 300 } },
    { text: 'Quick notes fill the rise. A bigger harp.',
      pattern: [...UP, ...DOWN, ...RISE],
      stats: { damage: 28, width: 14, len: 212, gap: 25, reach: 308 } },
    { text: 'Quick notes fill the fall.',
      pattern: [...UP, ...DOWN, ...RISE, ...FALL],
      stats: { damage: 30, width: 15, len: 224, gap: 26, reach: 316 } },
    { text: 'Pickup notes lead into each sweep.',
      pattern: [...UP, ...DOWN, ...RISE, ...FALL, ...PICKUP],
      stats: { damage: 34, width: 16, len: 238, gap: 28, reach: 324 } },
    { text: 'Turns at the top and bottom: every step plucks.',
      pattern: [...UP, ...DOWN, ...RISE, ...FALL, ...PICKUP, ...TURN],
      stats: { damage: 38, width: 17, len: 250, gap: 30, reach: 330, slow: 0.15 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    const sw = swellGain(note);
    const lift = Math.max(0, Math.min(1, (note.midi - LOW) / 30));
    const pan = (lift - 0.5) * 0.9;   // low strings left, high strings right, as a harp sits on the stage
    const rx = !!inst?.remix;
    // A finger-plucked string (Karplus-Strong) that rings on, thinned below its pitch, with the tick of the
    // finger leaving it.
    v.pluck(ctx, out, t, { freq: note.freq, decay: 0.999, bright: rx ? 0.9 : 0.8, dur: 2, len: 2.2, gain: 0.75 * note.v * sw, pan,
      filter: { type: 'highpass', freq: 450, q: 0.7 } });
    // The bright edge of the pluck: an FM tone whose overtones fall away within a beat, like a gut string's.
    v.fm(ctx, out, t, { freq: note.freq, ratio: 1, index: 3.2, indexDecay: 0.18, a: 0.001, d: 0.5, s: 0, r: 0.1, dur: 0.01,
      gain: 0.24 * note.v * sw, pan });
    v.noise(ctx, out, t, { dur: 0.003, d: 0.025, gain: 0.14 * note.v * sw, filter: { type: 'bandpass', freq: 3800, q: 1.2 }, pan });
    // Aeolian (remix): the wind sets each string's octave harmonic singing, a breath behind the pluck.
    if (rx) v.tone(ctx, out, t, { freq: note.freq * 2, wave: 'sine', dur: 0.05, a: 0.05, d: 0.8, s: 0, r: 0.2, gain: 0.14 * note.v * sw, pan: -pan });
  },

  fire(g, note, st, inst) {
    const fr = frameOf(g, note, st, inst);
    pluck(g, inst, st, fr, stringOf(note), g.dmg(st.damage) * note.v * swellDmg(note));
  },

  remix: {
    id: 'aeolian', name: 'Aeolian', pedal: 'delay',
    text: 'Every gust lays two crossed harps, and each string rings twice.',
    // A new part: groups of three notes against the four beats (up, up, down, down, up), so the tune turns
    // over across the bar like wind through the strings.
    pattern: [N(0, 0, 0.85), N(1, 2, 0.65), N(2, 4, 0.75), N(3, 1, 0.8), N(4, 3, 0.65), N(5, 5, 0.75), N(6, 4, 0.85), N(7, 2, 0.65),
      N(8, 0, 0.9), N(9, 5, 0.8), N(10, 3, 0.65), N(11, 1, 0.7), N(12, 2, 0.8), N(13, 4, 0.65), N(14, 5, 0.75), N(15, 3, 0.55)],
    stats: { cross: 1.1, ring: 0.75, wake: 80, len: 280, gap: 32, width: 18, reach: 350 },
    // Wider strings. Each note plucks its string on both frames of its gust (see frameOf),
    // and three steps later both strings ring again. Echoes pluck once and do not ring.
    fire(g, note, st, inst) {
      const fr = frameOf(g, note, st, inst);
      const i = stringOf(note);
      const dmg = g.dmg(st.damage) * note.v * swellDmg(note);
      const both = (scale) => {
        pluck(g, inst, st, fr, i, dmg * scale);
        if (fr.cross) pluck(g, inst, st, fr.cross, i, dmg * scale * st.cross);   // none on a frame set before the remix
      };
      both(1);
      if (g.dmgScale !== 1) return;
      g.later.push({ at: g.time + 3 * STEP_SEC, fn: () => {
        if (!g.loadout.has(inst)) return;
        const prev = g.src; g.src = inst;
        both(st.ring);
        g.src = prev;
      } });
    },
  },
};
