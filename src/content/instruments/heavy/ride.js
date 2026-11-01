// GROOVE, Heavy: Ride Cymbal. A washy metal ride with a glassy bell. Each bell plants a spinning cymbal
// where you stand (or strikes the one you are standing on), and every note of the ride makes all of your
// planted cymbals ring at once. Moving lays a chiming minefield along your path for whatever follows you;
// standing your ground keeps them ringing around your feet.

import { BAR_SEC } from '../../../config.js';

// Pattern helpers: step s, velocity v, kind k.
const R = (s, v = 1) => ({ s, v, k: 'ride' });
const B = (s, v = 1) => ({ s, v, k: 'bell' });
const C = (s, v = 1) => ({ s, v, k: 'china' });

// Each level keeps the one before and adds to it. Step 0 belongs to the kick until level 2's soft quarters.
const RIDE_1 = [R(2), R(6), R(10), R(14), B(12)];
const RIDE_2 = [...RIDE_1, R(0, 0.55), R(4, 0.6), R(8, 0.55)];
const RIDE_3 = [...RIDE_2, B(4, 0.9)];
const RIDE_4 = [...RIDE_3, R(3, 0.35), R(7, 0.35), R(11, 0.35), R(15, 0.4)];
const RIDE_5 = [...RIDE_4, B(0), B(8, 0.9)];   // the bell on every beat

// China Crash: bells on beats 1 and 3, a trashy china on the backbeat, the ride on the off-beats and 16th
// ghost notes all the way through.
const CHINA = [B(0), C(4), B(8), C(12), R(2), R(6), R(10), R(14),
  R(1, 0.3), R(3, 0.35), R(5, 0.3), R(7, 0.35), R(9, 0.3), R(11, 0.35), R(13, 0.3), R(15, 0.4)];

const LIFE = 8 * BAR_SEC;   // a planted cymbal rings for 8 bars, unless newer ones push it out
const STAND = 70;           // a bell within this many px of one of your cymbals strikes it instead of planting

export default {
  id: 'ride',
  name: 'Ride Cymbal',
  role: 'perc',
  style: 'heavy',
  blurb: 'A metal ride whose bells plant cymbals that ring on every note.',
  steps: 16,
  levels: [
    { text: 'Bells plant cymbals. The ride rings them.',
      pattern: RIDE_1,
      stats: { damage: 5, radius: 44, cymbals: 2, bell: 1.3 } },
    { text: 'The ride on the beat too. Three cymbals.',
      pattern: RIDE_2,
      stats: { damage: 6, radius: 50, cymbals: 3, bell: 1.4 } },
    { text: 'A second bell every bar. Wider rings.',
      pattern: RIDE_3,
      stats: { damage: 8, radius: 56, cymbals: 3, bell: 1.5 } },
    { text: 'Soft 16ths in between. Four cymbals.',
      pattern: RIDE_4,
      stats: { damage: 10, radius: 62, cymbals: 4, bell: 1.6 } },
    { text: 'The bell on every beat. Five cymbals.',
      pattern: RIDE_5,
      stats: { damage: 13, radius: 68, cymbals: 5, bell: 1.7 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    const rx = !!inst?.remix;
    if (note.k === 'china') {
      // China (remix): a trashy, fast-dying crash with clashing metal partials.
      v.noise(ctx, out, t, { dur: 0.006, d: 0.5, r: 0.06, gain: 0.22 * note.v, filter: { type: 'bandpass', freq: 5200, q: 0.7 } });
      for (const f of [419, 587, 743, 1031]) {
        v.tone(ctx, out, t, { freq: f, wave: 'square', dur: 0.004, d: 0.32, s: 0, r: 0.04, gain: 0.035 * note.v, filter: { type: 'highpass', freq: 4200, q: 1.1 } });
      }
      return;
    }
    if (note.k === 'bell') {
      // The bell: a glassy FM ping at a fixed pitch, on top of the ride wash.
      v.fm(ctx, out, t, { freq: rx ? 2400 : 2600, ratio: 2.76, index: rx ? 4 : 3, indexDecay: 0.18, d: 0.6, s: 0, r: 0.1, dur: 0.02, gain: 0.1 * note.v });
    }
    // The ride: a washy highpassed hiss and a shimmer of squares at clashing ratios. Remixed, it turns trashier.
    v.noise(ctx, out, t, { dur: 0.004, d: (rx ? 0.32 : 0.5) * (0.5 + 0.5 * note.v), r: 0.05, gain: 0.28 * note.v,
      filter: { type: 'highpass', freq: rx ? 5200 : 6500, q: 0.8 } });
    for (const f of rx ? [377, 563, 829] : [357, 531, 803]) {
      v.tone(ctx, out, t, { freq: f, wave: 'square', dur: 0.004, d: 0.38 * (0.5 + 0.5 * note.v), s: 0, r: 0.04, gain: 0.045 * note.v,
        filter: { type: 'highpass', freq: 8000, q: 1.2 } });
    }
  },

  fire(g, note, st, inst) {
    const p = g.player;
    const color = g.color('perc');
    const id = inst.def.id;
    const dmg = g.dmg(st.damage) * note.v;
    const r = g.area(st.radius);
    if (note.k === 'bell') {
      // Strike the cymbal you stand on, or plant a new one (an echo only strikes).
      let m = standingOn(g, id);
      if (!m && g.dmgScale === 1) {
        m = g.fx.mine({ owner: id, x: p.x, y: p.y, r, damage: dmg, kb: 40, color, life: LIFE, max: g.amount(st.cymbals), size: 6, persist: true });
        m.age = 0.05;
      }
      if (m) {
        m.age = Math.min(m.age, 0.05);
        m.glow = 1;
        g.fx.pulse({ x: m.x, y: m.y, r: r * 1.35, damage: dmg * st.bell, kb: 90, stun: 0.15, color, fill: 0.2 });
      }
    }
    // Every note rings all of your cymbals where they stand.
    g.fx.ringMines(id, { damage: dmg, r, kb: 24 });
  },

  remix: {
    id: 'chinacrash', name: 'China Crash', pedal: 'bitcrusher',
    text: 'Wired cymbals fire down the wires, and chinas strike inside the fence.',
    pattern: CHINA,
    stats: { cymbals: 6, radius: 74, wire: 1, crash: 1.2 },
    fire(g, note, st, inst) {
      if (note.k !== 'china') this.fire(g, note, st, inst);
      else g.fx.ringMines(inst.def.id, { damage: g.dmg(st.damage) * note.v, r: g.area(st.radius), kb: 24 });
      chinaWires(g, note, st, inst);
    },
  },
};

// The cymbal of `id` you are standing on, if any.
function standingOn(g, id) {
  const p = g.player;
  let best = null, bd = STAND * STAND;
  for (const m of g.fx.mines) {
    if (m.owner !== id) continue;
    const d = (m.x - p.x) ** 2 + (m.y - p.y) ** 2;
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

// China Crash: the cymbals are wired in the order they were planted. Every note fires a beam down each
// wire. A china also closes the fence (last cymbal back to the first) and crashes on everything inside it,
// so walking a loop around a crowd fences it in.
function chinaWires(g, note, st, inst) {
  const id = inst.def.id;
  const pts = g.fx.mines.filter((m) => m.owner === id);
  if (pts.length < 2) return;
  const color = g.color('perc');
  const china = note.k === 'china';
  const dmg = g.dmg(st.damage) * note.v;
  const n = china && pts.length >= 3 ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 12) continue;
    g.fx.beam({ x: a.x, y: a.y, angle: Math.atan2(b.y - a.y, b.x - a.x), length: L, width: china ? 20 : 16,
      damage: dmg * st.wire, kb: 30, color, life: china ? 0.22 : 0.12 });
  }
  if (!china || pts.length < 3) return;
  // Everything inside the fence takes the crash and is stunned for a moment.
  let cx = 0, cy = 0;
  for (const m of pts) { cx += m.x; cy += m.y; }
  cx /= pts.length; cy /= pts.length;
  let reach = 0;
  for (const m of pts) reach = Math.max(reach, Math.hypot(m.x - cx, m.y - cy));
  for (const e of g.inRadius(cx, cy, reach)) {
    if (!inside(pts, e.x, e.y)) continue;
    g.hit(e, dmg * st.crash, { kb: 60, fx: cx, fy: cy, stun: 0.25 });
    g.fx.particles(e.x, e.y, color, 3, 140, 0.3, 2.5);
  }
}

// Point in polygon (even-odd rule) over the cymbals in planting order.
function inside(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
