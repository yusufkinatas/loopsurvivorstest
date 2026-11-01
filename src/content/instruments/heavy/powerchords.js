// CHORDS, Heavy: Power Chords. Root, fifth and octave struck together through one overdriven amp. A ringing
// chord raises a wall of sound between you and the crowd for as long as it rings: it bounces what walks into
// it and soaks up shots. Palm-muted chugs keep the wall standing and slam it into whatever presses on it.

import { STEP_SEC } from '../../../config.js';

const TAU = Math.PI * 2;
const LOW = 52;                  // roots land on MIDI 52 to 63, the octave on 64 to 75: the chords' register
const BOSS_RANGE = 300;          // a chord stands its wall on a boss this close

// A ringing power chord: root, fifth and octave on one step (three chord tones, so the fifth is always the
// key's, the diminished chord's too). Only the root ('ring') fires; the others ('ring5') only sound.
const R = (s, d, v = 1) => [{ s, ct: 0, k: 'ring', d, v }, { s, ct: 2, k: 'ring5', d, v }, { s, ct: 3, k: 'ring5', d, v }];
// A palm-muted chug: root and fifth, short and dark. Only the root ('mute') fires.
const M = (s, v = 0.8) => [{ s, ct: 0, k: 'mute', v }, { s, ct: 2, k: 'mute5', v }];
// The remix's call climbs the same chord: root on the bottom (0 2 3), then the fifth (2 3 5), then the octave (3 5 6).
const UP = (s, [a, b, c], d, v = 1) => [{ s, ct: a, k: 'ring', d, v }, { s, ct: b, k: 'ring5', d, v }, { s, ct: c, k: 'ring5', d, v }];

const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

// ---------------------------------------------------------------------------- the amp

// Every string of one strum feeds the same clipper, so root, fifth and octave grind together (their
// intermodulation is the power chord's growl), then a cabinet-like low-pass. One strum per channel input
// and time; a remixed chord is double-tracked, two takes panned apart.
const strums = new WeakMap();
function amp(A, t, out, o) {
  const { ctx, v } = A;
  const pre = ctx.createGain();
  pre.gain.value = 0.3;
  const sh = ctx.createWaveShaper();
  sh.curve = v.driveCurve(ctx, o.drive);
  const g = ctx.createGain();
  g.gain.value = 0;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 100; hp.Q.value = 0.7;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = o.q;
  lp.frequency.setValueAtTime(o.cut * o.env, t);
  lp.frequency.exponentialRampToValueAtTime(o.cut, t + o.decay);
  const pan = ctx.createStereoPanner();
  pan.pan.value = o.pan;
  pre.connect(sh); sh.connect(g); g.connect(hp); hp.connect(lp); lp.connect(pan); pan.connect(out);
  const end = v.env(g.gain, t, { a: o.a, d: o.d, s: o.s, r: o.r, peak: o.gain, hold: Math.max(0, o.dur - o.a) });
  return { pre, end, live: 0, nodes: [pre, sh, g, hp, lp, pan] };
}

// One string into an amp: two slightly detuned saws.
function string(ctx, a, t, freq, detune) {
  for (const det of [-detune, detune]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);
    osc.detune.setValueAtTime(det, t);
    osc.connect(a.pre);
    osc.start(t); osc.stop(a.end + 0.03);
    a.live++;
    osc.onended = () => { osc.disconnect(); if (--a.live === 0) for (const n of a.nodes) n.disconnect(); };
  }
}

// ---------------------------------------------------------------------------- the attack

const myWalls = (g, inst) => g.fx.walls.filter((w) => w.owner === inst.def.id && w.t < w.dur);

// The wall soaks `soak` shots, then lets them through (it thins to show it).
function soaked(w) {
  if (w.erase && w.erased >= w.soak) { w.erase = false; w.base = Math.max(3, w.base * 0.5); w.width = Math.min(w.width, w.base); }
}

// Raise a wall `span` wide at radius r, facing `angle`, for dur seconds.
function raise(g, st, inst, angle, r, span, dur, damage, extra = {}) {
  const w = g.fx.wall({ follow: true, r, angle, span: Math.min(TAU, span), dur, damage, kb: st.kb, stun: st.stun || 0,
    width: 10, color: g.color(inst), onErase: extra.onErase || soaked });
  w.base = 10; w.width = 22;
  w.soak = extra.soak ?? st.soak;
  inst.state.wall = w;
  return w;
}

// Slam a wall: the arc thumps outward, shoving everything between you and it (and up to `push` px beyond it)
// out through it, once per slam. With `inner`, only what stands within that far inside the arc.
function slam(g, w, damage, kb, stun, push, inner = Infinity) {
  let n = 0;
  for (const e of g.inRadius(w.x, w.y, w.r + push)) {
    const d = Math.hypot(e.x - w.x, e.y - w.y);
    if (d + e.r < w.r - inner) continue;
    const slack = d > e.r ? Math.asin(Math.min(1, e.r / d)) : Math.PI;
    if (Math.abs(angDiff(Math.atan2(e.y - w.y, e.x - w.x), w.angle)) > w.half + slack) continue;
    w.hit.add(e);
    g.hit(e, damage, { kb, fx: w.x, fy: w.y, stun });
    n++;
  }
  w.width = Math.max(w.width, w.base * 2.2);   // the arc thumps; update() eases it back
  return n;
}

// Where a chord's wall faces: a boss in range (the wall stands on it), else the thickest crowd, else where
// the last one faced.
function facing(g, note, st, inst) {
  const p = g.player, S = inst.state;
  const boss = g.bossInRange(p.x, p.y, BOSS_RANGE);
  if (boss) {
    const d = Math.hypot(boss.x - p.x, boss.y - p.y);
    return { angle: Math.atan2(boss.y - p.y, boss.x - p.x), r: Math.max(st.r, Math.min(BOSS_RANGE, d)) };
  }
  const spot = g.densest(st.reach);
  return { angle: spot ? Math.atan2(spot.y - p.y, spot.x - p.x) : S.face ?? g.aim(), r: st.r };
}

// The wall's arc stays about the same length however far out it stands.
const spanAt = (st, r) => st.span * Math.min(1, st.r / r);

function ring(g, note, st, inst) {
  const dmg = g.dmg(st.damage) * note.v;
  // A Tape Delay echo slams the walls already up, and never raises one.
  if (g.dmgScale !== 1) { for (const w of myWalls(g, inst)) slam(g, w, dmg, st.slamKb, 0, st.push); return; }
  const f = facing(g, note, st, inst);
  inst.state.face = f.angle;
  // The chord lands with a slam, then stands as a wall while it rings.
  const w = raise(g, st, inst, f.angle, f.r, spanAt(st, f.r), note.dur + STEP_SEC / 2, dmg);
  slam(g, w, g.dmg(st.slam) * note.v, st.slamKb, st.stun || 0, st.push);
}

function chug(g, note, st, inst) {
  const dmg = g.dmg(st.slam) * note.v;
  const walls = myWalls(g, inst);
  if (g.dmgScale !== 1) { for (const w of walls) slam(g, w, dmg, st.slamKb, 0, st.push); return; }
  const S = inst.state;
  if (!walls.length) {
    // No chord ringing: the chug throws up a short stub of wall where the last one faced.
    const spot = g.densest(st.reach), p = g.player;
    S.face = spot ? Math.atan2(spot.y - p.y, spot.x - p.x) : S.face ?? g.aim();
    raise(g, st, inst, S.face, st.r, st.span * 0.7, 2 * STEP_SEC, dmg);
    return;
  }
  // The chug keeps the newest wall standing through the next step, and slams every wall that is up.
  const last = walls[walls.length - 1];
  last.dur = Math.max(last.dur, last.t + note.dur + STEP_SEC);
  for (const w of walls) slam(g, w, dmg, st.slamKb, st.stun || 0, st.push);
}

// ---------------------------------------------------------------------------- Call and Response

// A caught shot flies back at whoever fired it (or the nearest enemy), harder than it came. Boss shots come
// back weaker than a minion's, White Noise's weakest; at most `reflect` per wall.
function reflect(g, w, s, st) {
  soaked(w);
  w.reflected = (w.reflected || 0) + 1;
  if (w.reflected > st.reflect) return;
  const from = s.from && !s.from.dead ? s.from : null;
  const target = from && Math.hypot(from.x - s.x, from.y - s.y) < 800 ? from : g.nearest(s.x, s.y, 500);
  if (!target) return;
  const mul = from?.type === 'whitenoise' ? st.reflectNoise : from?.boss ? st.reflectBoss : st.reflectMul;
  const b = g.fx.bullet({ x: s.x, y: s.y, angle: Math.atan2(target.y - s.y, target.x - s.x), speed: g.speed(560), r: 6,
    life: 1.8, damage: g.dmg(s.dmg * mul), homing: 7, range: 900, kb: 90, color: w.color, shape: 'shard', trail: true });
  if (b) { b.target = target; b.retarget = 99; }   // straight back at the shooter
}

export default {
  id: 'powerchords',
  name: 'Power Chords',
  role: 'chords',
  style: 'heavy',
  blurb: 'Distorted guitar chords that raise a wall of sound between you and the crowd.',
  steps: 16,
  low: LOW,
  levels: [
    { text: 'Two ringing chords a bar. Each slams, then stands as a wall.',
      pattern: [...R(0, 6), ...R(8, 6)],
      stats: { damage: 22, slam: 7, kb: 170, slamKb: 110, push: 60, r: 90, span: 2.1, soak: 4, reach: 280 } },
    { text: 'A chug before each chord slams the wall.',
      pattern: [...R(0, 6), ...M(6, 0.75), ...R(8, 6), ...M(14, 0.75)],
      stats: { damage: 23, slam: 9, kb: 170, slamKb: 110, push: 62, r: 92, span: 2.15, soak: 5, reach: 285 } },
    { text: 'Chugging eighths keep the wall up all bar.',
      pattern: [...R(0, 4), ...M(4), ...M(6, 0.75), ...R(8, 4), ...M(12), ...M(14, 0.75)],
      stats: { damage: 24, slam: 12, kb: 175, slamKb: 115, push: 66, r: 95, span: 2.2, soak: 6, reach: 290 } },
    { text: 'A galloping chug. Wider walls soak more shots.',
      pattern: [...R(0, 4), ...M(4), ...M(6, 0.75), ...M(7, 0.6), ...R(8, 4), ...M(12), ...M(14, 0.75), ...M(15, 0.6)],
      stats: { damage: 26, slam: 14, kb: 180, slamKb: 120, push: 70, r: 98, span: 2.35, soak: 7, reach: 295 } },
    { text: 'A pushed chord. Slams stun what they hit.',
      pattern: [...R(0, 4), ...M(4), ...M(6, 0.75), ...M(7, 0.6), ...R(8, 2), ...R(10, 2, 0.85), ...M(12), ...M(14, 0.75), ...M(15, 0.6)],
      stats: { damage: 30, slam: 18, kb: 185, slamKb: 120, push: 75, r: 100, span: 2.45, soak: 8, reach: 300, stun: 0.25 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx } = A;
    const mute = note.k === 'mute' || note.k === 'mute5';
    let s = strums.get(out);
    if (!s || s.t !== t || s.ctx !== ctx) {
      const rx = !!inst?.remix;
      const o = mute
        ? { drive: 4, a: 0.002, d: 0.09, s: 0.05, r: 0.04, dur: 0.05, cut: 680, env: 2.2, decay: 0.07, q: 1.1, gain: 0.46 * note.v }
        : { drive: 3.5, a: 0.003, d: 0.3, s: 0.7, r: 0.16, dur: note.dur * 0.94, cut: 1750, env: 1.5, decay: 0.3, q: 0.8, gain: 0.25 * note.v };
      // Call and Response: double-tracked, one take hard left and a second, a hair late, hard right.
      const takes = rx ? [{ ...o, pan: -0.75, gain: o.gain * 0.72 }, { ...o, pan: 0.75, gain: o.gain * 0.72, late: 0.011 }] : [{ ...o, pan: 0 }];
      s = { t, ctx, takes: takes.map((k) => ({ amp: amp(A, t + (k.late || 0), out, k), late: k.late || 0 })) };
      strums.set(out, s);
    }
    s.takes.forEach((k, i) => string(ctx, k.amp, t + k.late, note.freq, i ? 9 : 6));
  },

  fire(g, note, st, inst) {
    if (note.k === 'ring') ring(g, note, st, inst);
    else if (note.k === 'mute') chug(g, note, st, inst);
    // 'ring5' and 'mute5', the fifth and the octave, only sound.
  },

  // The arcs thump on a slam and settle back.
  update(g, dt, st, inst) {
    for (const w of g.fx.walls) if (w.owner === inst.def.id && w.width > w.base) w.width = Math.max(w.base, w.width - dt * 90);
  },

  remix: {
    id: 'callresponse', name: 'Call and Response', pedal: 'chorus',
    text: 'Three chords close a ring of sound around you, chugs march it outward, and caught shots fly back at their shooter.',
    // The call: three stabs climbing the chord in dotted eighths. The response: a galloping chug answer.
    pattern: [...UP(0, [0, 2, 3], 3), ...UP(3, [2, 3, 5], 3, 0.9), ...UP(6, [3, 5, 6], 2, 0.95),
      ...M(8), ...M(9, 0.6), ...M(10, 0.8), ...M(12), ...M(13, 0.6), ...M(14, 0.8), ...M(15, 0.7)],
    stats: { damage: 52, slam: 52, march: 44, rMax: 300, push: 70, widen: 2.1, soak: 14, reflect: 10, reflectMul: 4, reflectBoss: 1.5, reflectNoise: 0.5 },
    fire(g, note, st, inst) {
      if (note.k !== 'ring' && note.k !== 'mute') return;
      const S = inst.state;
      const dmg = g.dmg(note.k === 'ring' ? st.damage : st.slam) * note.v;
      const walls = myWalls(g, inst);
      if (g.dmgScale !== 1) { for (const w of walls) slam(g, w, dmg, st.slamKb, 0, st.push); return; }
      const w = walls.includes(S.wall) ? S.wall : null;
      if (note.k === 'ring') {
        // The call: the first stab raises the wall, each stab after it opens it wider until it closes around you.
        if (w && w.half < Math.PI) {
          w.half = Math.min(Math.PI, w.half + st.widen / 2);
          w.dur = Math.max(w.dur, w.t + note.dur + STEP_SEC);
          w.hit.clear();
          slam(g, w, dmg, st.slamKb, st.stun, st.push);
          return;
        }
        const f = facing(g, note, st, inst);
        S.face = f.angle;
        const nw = raise(g, st, inst, f.angle, st.r, st.span, note.dur + STEP_SEC, dmg, { soak: st.soak, onErase: (ww, s, gg) => reflect(gg, ww, s, st) });
        slam(g, nw, dmg, st.slamKb, st.stun, st.push);
        return;
      }
      // The response: every chug marches the wall out and slams what it reaches, a shockwave in steps.
      if (!w) return chug(g, note, st, inst);
      w.r = Math.min(st.rMax, w.r + st.march);
      w.dur = Math.max(w.dur, w.t + note.dur + STEP_SEC);
      w.hit.clear();
      slam(g, w, dmg, st.slamKb, st.stun, st.push, st.march + 20);
      for (const o of walls) if (o !== w) slam(g, o, dmg, st.slamKb, 0, st.push, st.march + 20);
    },
  },
};
