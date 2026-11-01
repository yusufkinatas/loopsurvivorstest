// LEAD, Heavy: Shred Guitar. A driven string with a thin square under it, playing a 2-bar lead of held
// notes and fast scale runs. A held note swings a blade around you, one cut per 16th while it rings, and
// its direction follows the tune (up the neck: clockwise). A short note stabs the nearest enemy.

import { STEP_SEC } from '../../../config.js';

const TAU = Math.PI * 2;
const LOW = 63;                          // the lead's register, as in lead.js: MIDI 62 to 86 in every key
const MID = 74;
const LONG = 3 * STEP_SEC - 0.001;       // a held note (3 steps or more) swings the blade
const BOSS_RANGE = 280;

// Pattern helpers: step s (0..31), chord tone (ct) or scale step (sc), duration d in steps, velocity v.
const C = (s, ct, d = 1, v = 1) => ({ s, ct, d, v });
const N = (s, sc, d = 1, v = 1) => ({ s, sc, d, v });

// The tune, built up level by level. Held notes on the chord, runs on the scale between them.
const HELD = [C(0, 2, 3), C(4, 3, 4), C(12, 1, 4), C(16, 2, 3), C(26, 4, 6)];
const LICKS = [N(3, 5, 1, 0.7), N(19, 4, 1, 0.7), C(20, 3, 2, 0.85)];
const RUN_DOWN = [N(8, 6, 1, 0.8), N(9, 5, 1, 0.7), N(10, 4, 1, 0.75), N(11, 3, 1, 0.7)];
const RUN_UP = [N(22, 4, 1, 0.7), N(23, 5, 1, 0.75), N(24, 6, 1, 0.8), N(25, 7, 1, 0.85)];
// Level 5 tightens two held notes to fit a pickup after each.
const HELD5 = [C(0, 2, 3), C(4, 3, 3), C(12, 1, 4), C(16, 2, 3), C(26, 4, 4)];
const PICKUPS = [N(7, 4, 1, 0.65), N(30, 5, 1, 0.7), N(31, 3, 1, 0.75)];

// One cut of the blade: a beam from wherever you stand now.
function cut(g, angle, len, width, damage, color) {
  const p = g.player;
  g.fx.beam({ x: p.x, y: p.y, angle, length: len, width, damage, kb: 70, color, life: 0.2 });
}

// A held note: the blade swings `arc` radians across the target (a boss in range first), one cut per 16th
// while the note rings, centered so one cut lands on the target. dir: +1 clockwise (the tune rose), -1 back.
// The cuts after the first land on the grid (g.later); a Tape Delay echo cuts once.
function swing(g, note, st, inst, dir) {
  const p = g.player, color = g.color(inst);
  const t = g.bossInRange(p.x, p.y, BOSS_RANGE) || g.nearest(p.x, p.y, st.blade + 60);
  const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : g.aim();
  const n = Math.max(1, Math.round(note.dur / STEP_SEC));
  const c = Math.floor((n - 1) / 2);
  const step = n > 1 ? st.arc / (n - 1) : 0;
  const dmg = g.dmg(st.damage * st.bladeMul) * note.v;
  each16th(g, inst, n, (k) => cut(g, base + (k - c) * step * dir, st.blade, st.bladeW, dmg, color));
}

// Run fn(k) now for k = 0 and on each later 16th of the note (k < n), on the grid, while the sound is in the
// band. An echo (g.dmgScale below 1) only runs the first.
function each16th(g, inst, n, fn) {
  fn(0);
  if (g.dmgScale !== 1) return;
  for (let k = 1; k < n; k++) {
    g.later.push({ at: g.time + k * STEP_SEC, fn: () => {
      if (!g.loadout.has(inst)) return;
      const prev = g.src; g.src = inst;
      fn(k);
      g.src = prev;
    } });
  }
}

// Windmill: four blades turn a quarter circle each while a held note rings, one wedge per 16th, so together
// they cut everything within reach once per note (the first wedge on the target). What a blade cuts is
// flung along the turn and crashes into the crowd (bosses hold their ground).
const ARMS = 4;
function windmill(g, note, st, inst, dir) {
  const p = g.player, color = g.color(inst);
  const t = g.bossInRange(p.x, p.y, BOSS_RANGE) || g.nearest(p.x, p.y, st.blade);
  const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : g.aim();
  const n = Math.max(1, Math.round(note.dur / STEP_SEC));
  const sweep = TAU / (ARMS * n);
  const dmg = g.dmg(st.damage * st.bladeMul) * note.v, fling = g.dmg(st.fling) * note.v;
  each16th(g, inst, n, (k) => {
    const q = g.player, R = st.blade;
    const mids = [];
    for (let a = 0; a < ARMS; a++) mids.push(base + (a * TAU) / ARMS + k * sweep * dir);
    for (const e of g.inRadius(q.x, q.y, R)) {
      const d = Math.hypot(e.x - q.x, e.y - q.y), ang = Math.atan2(e.y - q.y, e.x - q.x);
      const slack = d > e.r ? Math.asin(Math.min(1, e.r / d)) : Math.PI;
      if (!mids.some((m) => Math.abs(angDiff(ang, m)) <= sweep / 2 + slack)) continue;
      g.hit(e, dmg, { kb: 50, fx: q.x, fy: q.y });
      if (!e.dead) g.launch(e, ang + (dir * Math.PI) / 2, st.flingSpeed, fling, { t: 0.4, max: 6 });
    }
    // What you see: each blade's wedge and its leading edge.
    for (const m of mids) {
      g.fx.cone({ x: q.x, y: q.y, angle: m, spread: sweep, r: R, damage: 0, kb: 0, color, life: 0.16 });
      g.fx.beam({ x: q.x, y: q.y, angle: m + (sweep / 2) * dir, length: R, width: st.bladeW, damage: 0, color, life: 0.16 });
    }
  });
}

const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

// A short note: a quick stab at the nearest enemy, else at a boss in range (the stab reaches it). The pitch
// shifts where the stab starts, so a run rakes across its target.
function stab(g, note, st, inst) {
  const p = g.player;
  const near = g.nearest(p.x, p.y, st.reach + 40);
  const boss = !near && g.bossInRange(p.x, p.y, BOSS_RANGE);
  const t = near || boss;
  const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : g.aim();
  const side = (note.midi - MID) * 1.6;
  const x = p.x - Math.sin(base) * side, y = p.y + Math.cos(base) * side;
  const angle = t ? Math.atan2(t.y - y, t.x - x) : base;
  const len = boss ? Math.hypot(t.x - x, t.y - y) + t.r : st.reach;
  g.fx.beam({ x, y, angle, length: len, width: st.stabW, damage: g.dmg(st.damage) * note.v, kb: 40, pierce: st.pierce,
    color: g.color(inst), life: 0.12 });
}

// Which way the blade turns: up the neck clockwise, down it back the other way.
function turn(g, note, inst) {
  const S = inst.state;
  const dir = note.midi >= (S.lastMidi ?? note.midi) ? 1 : -1;
  if (g.dmgScale === 1) S.lastMidi = note.midi;
  return dir;
}

export default {
  id: 'shred',
  name: 'Shred Guitar',
  role: 'lead',
  style: 'heavy',
  blurb: 'A screaming lead guitar whose held notes swing a blade around you.',
  steps: 32,
  low: LOW,
  levels: [
    { text: 'Held notes swing a blade. The tune turns it.',
      pattern: [...HELD],
      stats: { damage: 11, bladeMul: 1, blade: 210, bladeW: 16, arc: 2.44, reach: 170, stabW: 10, pierce: 2 } },
    { text: 'Quick licks stab the nearest enemy.',
      pattern: [...HELD, ...LICKS],
      stats: { damage: 12, bladeMul: 1, blade: 215, bladeW: 16, arc: 2.44, reach: 175, stabW: 10, pierce: 2 } },
    { text: 'A fast run down the scale. Longer blade.',
      pattern: [...HELD, ...LICKS, ...RUN_DOWN],
      stats: { damage: 14, bladeMul: 1.05, blade: 225, bladeW: 17, arc: 2.44, reach: 180, stabW: 11, pierce: 2 } },
    { text: 'A run back up answers it. Wider cuts.',
      pattern: [...HELD, ...LICKS, ...RUN_DOWN, ...RUN_UP],
      stats: { damage: 16, bladeMul: 1.1, blade: 235, bladeW: 18, arc: 2.6, reach: 185, stabW: 12, pierce: 3 } },
    { text: 'Pickup notes everywhere. Stabs pierce four enemies.',
      pattern: [...HELD5, ...LICKS, ...RUN_DOWN, ...RUN_UP, ...PICKUPS],
      stats: { damage: 21, bladeMul: 1.15, blade: 245, bladeW: 19, arc: 2.7, reach: 195, stabW: 12, pierce: 4 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    const long = note.dur >= LONG;
    const rx = !!inst?.remix;
    const f = note.freq;
    const dur = note.dur * 0.92 + 0.03;
    // The string: a bright Karplus-Strong pluck through a soft clipper, rounded off like a guitar cabinet.
    v.pluck(ctx, out, t, { freq: f, decay: 0.997, bright: 0.85, dur, gain: (rx ? 0.2 : 0.36) * note.v, drive: rx ? 4 : 2,
      filter: { type: 'lowpass', freq: 3600, q: 0.9 }, pan: 0.08 });
    // A thin square under it carries the pitch, and sings with vibrato on held notes.
    v.tone(ctx, out, t, { freq: f, wave: 'square', dur: note.dur * 0.9, a: 0.004, d: 0.12, s: 0.55, r: long ? 0.14 : 0.06,
      gain: (rx ? 0.09 : 0.15) * note.v, filter: { type: 'lowpass', freq: 2600, q: 0.7 },
      vibrato: long ? { rate: rx ? 7 : 6, depth: rx ? 32 : 20, delay: 0.12 } : null });
    // Windmill: an octave fuzz rides on top, and held notes scream up into pitch.
    if (rx) v.tone(ctx, out, t, { freq: f * 2, wave: 'sawtooth', drive: 3, dur: note.dur * 0.85, a: 0.006, d: 0.15, s: 0.5, r: 0.1,
      gain: 0.08 * note.v, filter: { type: 'lowpass', freq: 3200, q: 1 }, pitchEnv: long ? { from: 0.94, time: 0.09 } : null,
      vibrato: long ? { rate: 7, depth: 32, delay: 0.12 } : null, pan: -0.15 });
  },

  fire(g, note, st, inst) {
    const dir = turn(g, note, inst);
    if (note.dur >= LONG) swing(g, note, st, inst, dir);
    else stab(g, note, st, inst);
  },

  remix: {
    id: 'windmill', name: 'Windmill', pedal: 'overdrive',
    text: 'Held notes spin a four-bladed windmill that cuts all around you and flings what it hits.',
    // A new lead: long screaming notes, each answered by a tremolo-picked burst on one note.
    steps: 32,
    pattern: [C(0, 3, 6), N(6, 4, 1, 0.65), N(7, 4, 1, 0.7), C(8, 2, 4), N(12, 3, 1, 0.65), N(13, 3, 1, 0.7), N(14, 4, 1, 0.75), N(15, 5, 1, 0.8),
      C(16, 4, 6), N(22, 5, 1, 0.65), N(23, 5, 1, 0.7), C(24, 3, 4, 0.95), N(28, 2, 1, 0.7), N(29, 2, 1, 0.75), N(30, 1, 1, 0.75), N(31, 0, 1, 0.8)],
    stats: { blade: 460, bladeW: 20, bladeMul: 1.75, fling: 32, flingSpeed: 560, reach: 240, pierce: 5 },
    fire(g, note, st, inst) {
      const dir = turn(g, note, inst);
      if (note.dur < LONG) stab(g, note, st, inst);
      else windmill(g, note, st, inst, dir);
    },
  },
};
