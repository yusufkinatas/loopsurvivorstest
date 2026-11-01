// GROOVE, Orchestra: Field Snare. A crisp marching snare (small body, bright rattle, so it sits high). Accents
// recruit drummers who march behind you along your path, and on every tap each drummer jabs the nearest enemy
// with a short stick strike. The line swells with the phrase: it grows toward the fill, and after each fill it
// thins back to a drummer or two, so you lead a small squad that becomes a parade by the climax.

import { STEP_SEC } from '../../../config.js';
import { TAU } from '../../../util.js';

// Pattern helpers: step s, velocity v; a buzz (press roll) lasts d steps.
const T = (s, v = 1) => ({ s, v, k: 'tap' });
const B = (s, v, d) => ({ s, v, d, k: 'buzz' });
const RIM = (s, v = 1) => ({ s, v, k: 'rim' });

const ACCENT = 0.9;         // a stroke this loud recruits
const MAX_LINE = 12;        // the followers archetype's cap

// Each level keeps the one before and adds to it. The backbeat accents stay put; step 0 is the kick's.
const SNARE_1 = [T(2, 0.5), T(4), T(10, 0.5), T(12)];
const SNARE_2 = [...SNARE_1, T(6, 0.45), T(14, 0.5)];
const SNARE_3 = [...SNARE_2, T(7, 0.4), T(15, 0.55)];
const SNARE_4 = [...SNARE_3, T(3, 0.4), T(11, 0.4), B(8, 0.55, 2)];
const SNARE_5 = [...SNARE_4, T(1, 0.35), T(5, 0.35), T(13, 0.4)];

// Parade: a two-bar street beat. A rimshot on every beat, and the second bar buzzes up into the next.
const PARADE = [
  RIM(0), T(1, 0.35), T(2, 0.45), T(3, 0.4), RIM(4), T(5, 0.35), T(6, 0.45), T(7, 0.4),
  RIM(8), T(9, 0.35), T(10, 0.45), T(11, 0.4), RIM(12), T(13, 0.35), T(14, 0.5), T(15, 0.55),
  RIM(16), T(17, 0.35), T(18, 0.45), T(19, 0.4), RIM(20), T(21, 0.35), T(22, 0.45), T(23, 0.4),
  B(24, 0.5, 2), B(26, 0.65, 2), B(28, 0.8, 2), RIM(30), T(31, 0.6),
];

export default {
  id: 'fieldsnare',
  name: 'Field Snare',
  role: 'perc',
  style: 'orchestra',
  blurb: 'A crisp marching snare whose accents recruit drummers to march behind you.',
  steps: 16,
  levels: [
    { text: 'Accents recruit a drummer who jabs nearby enemies.',
      pattern: SNARE_1,
      stats: { drummers: 2, jab: 22, reach: 95, width: 7, pierce: 2, gap: 34 } },
    { text: 'More taps, more jabs. Three drummers.',
      pattern: SNARE_2,
      stats: { drummers: 3, jab: 22, reach: 100, width: 7, pierce: 2, gap: 34 } },
    { text: 'Pickup taps. Drummers reach farther.',
      pattern: SNARE_3,
      stats: { drummers: 3, jab: 24, reach: 110, width: 8, pierce: 2, gap: 34 } },
    { text: 'A buzz roll and ghost taps. Four drummers.',
      pattern: SNARE_4,
      stats: { drummers: 4, jab: 25, reach: 115, width: 8, pierce: 3, gap: 34 } },
    { text: 'Nonstop taps. Five drummers in the line.',
      pattern: SNARE_5,
      stats: { drummers: 5, jab: 27, reach: 120, width: 9, pierce: 3, gap: 34 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    const rx = !!inst?.remix;
    const g = 1.2 * (0.55 + 0.45 * (note.phrase ?? 0.5)) * note.v;
    const bright = rx ? 5200 : 4200;
    if (note.k === 'buzz') {
      // A press roll: the sticks buzz on the head, a dense swelling rattle.
      const n = Math.max(1, Math.round(note.dur / STEP_SEC)) * 5;
      for (let i = 0; i < n; i++) {
        const k = 0.55 + (0.45 * (i + 1)) / n;
        v.noise(ctx, out, t + (i * note.dur) / n, { dur: 0.003, d: 0.06, gain: 0.6 * g * k, filter: { type: 'highpass', freq: bright, q: 0.7 } });
      }
      return;
    }
    // The stroke: a small, high body and a bright rattle. An accent (and every rimshot) gets a flam: a quiet
    // grace stroke first, the full stroke 14 ms after it.
    const flam = note.v >= ACCENT || note.k === 'rim';
    const at = flam ? t + 0.014 : t;
    if (flam) v.snare(ctx, out, t, { tone: 440, body: 0.04 * g, rattle: 0.22 * g, decay: 0.08, bright });
    v.snare(ctx, out, at, { tone: 420, body: 0.12 * g, rattle: 0.66 * g, decay: rx ? 0.3 : 0.25, bright });
    // The crack of stick on head; a rimshot (Parade) rings the shell too.
    v.noise(ctx, out, at, { dur: 0.002, d: 0.03, gain: 0.2 * g, filter: { type: 'bandpass', freq: 6200, q: 1.3 } });
    if (note.k === 'rim') v.tone(ctx, out, at, { freq: 1730, wave: 'square', dur: 0.004, d: 0.05, s: 0, r: 0.02, gain: 0.05 * g, filter: { type: 'bandpass', freq: 3500, q: 2 } });
  },

  setup(g, st, inst) { line(g, st, inst); },

  fire(g, note, st, inst) { tap(g, note, st, inst, false); },

  remix: {
    id: 'parade', name: 'Parade', pedal: 'delay',
    text: 'Each tap ripples down a longer line, and the last drummer throws confetti.',
    pattern: PARADE,
    steps: 32,
    stats: { drummers: 9, jab: 33, reach: 140, width: 9, pierce: 3, gap: 34, confetti: 7, confettiDamage: 28, toss: 460, stick: 1 },
    fire(g, note, st, inst) { tap(g, note, st, inst, true); },
  },
};

// The marching line: as many drummers as the phrase has recruited (at least one, at most the level's).
function line(g, st, inst) {
  const S = inst.state;
  S.n = Math.max(1, Math.min(st.drummers, S.n || 1));
  return g.fx.followers(inst, { count: S.n, gap: st.gap, size: 5, color: g.color(inst), shape: 'diamond' });
}

// How long the line may be at this point of the phrase: one drummer after the fill, the full line by its end.
const room = (st, phrase) => Math.max(1, Math.ceil(st.drummers * (0.3 + 0.7 * (phrase ?? 0.5))));

// One tap. A new phrase sends the extra drummers home; an accent recruits one (never past the room the phrase
// gives); then every drummer jabs. Parade: the jab ripples down the line a 16th per drummer (throwing its stick
// when nobody is in reach), and on an accent the last one throws confetti. An echo jabs at its own strength and
// recruits, dismisses and schedules nothing.
function tap(g, note, st, inst, parade) {
  const S = inst.state;
  const echo = g.dmgScale !== 1;
  let grp = g.fx.followersOf(inst);
  if (!grp) {
    if (echo) return;
    grp = line(g, st, inst);
  }
  if (!echo) {
    const ph = note.phrase ?? 0.5;
    const cap = Math.min(MAX_LINE, room(st, ph));
    if (ph + 0.25 < (S.lastPh ?? 0) && S.n > cap) {
      for (let i = cap; i < grp.items.length; i++) g.fx.particles(grp.items[i].x, grp.items[i].y, grp.color, 6, 120, 0.4, 2.5);
      S.n = cap;
      grp = line(g, st, inst);
    }
    S.lastPh = ph;
    if ((note.v >= ACCENT || note.k === 'rim') && S.n < cap) {
      S.n++;
      grp = line(g, st, inst);
      const it = grp.items[grp.items.length - 1];
      if (it) { it.glow = 1; g.fx.flash(it.x, it.y, 22, grp.color, 0.3, 0.3); }
    }
  }
  const dmg = g.dmg(st.jab) * note.v;
  const accent = note.v >= ACCENT || note.k === 'rim';
  if (!parade || echo) {
    for (let i = 0; i < grp.items.length; i++) jab(g, grp.items[i], st, dmg, grp.color);
    return;
  }
  // Parade: drummer i strikes i 16ths after the tap. Each strike looks the drummer up again, so the ripple
  // follows the line as you march.
  // Damage is worked out now, while the note's weight and the echo scale apply, for the strikes that land later.
  const toss = claims(g, S);
  const cdmg = g.dmg(st.confettiDamage) * note.v;
  jab(g, grp.items[0], st, dmg, grp.color, toss);
  const n = grp.items.length;
  if (n === 1 && accent) confetti(g, grp.items[0], st, note, cdmg);
  for (let i = 1; i < n; i++) {
    g.later.push({ at: g.time + i * STEP_SEC, fn: () => {
      if (!g.loadout.has(inst)) return;
      const f = g.fx.followersOf(inst), it = f?.items[i];
      if (!it) return;
      const prev = g.src; g.src = inst;
      jab(g, it, st, dmg, f.color, toss);
      if (accent && i === f.items.length - 1) confetti(g, it, st, note, cdmg);
      g.src = prev;
    } });
  }
}

// Parade's throws share out their targets: an enemy a stick is flying at is left to it for a moment, so the
// line spreads its sticks over the crowd instead of piling onto one enemy.
function claims(g, S) {
  const m = (S.claims ||= new Map());
  if (m.size > 48) for (const [e, t] of m) if (t <= g.time || e.dead) m.delete(e);
  return { has: (e) => (m.get(e) ?? 0) > g.time, claim: (e) => m.set(e, g.time + 0.3) };
}

// A drummer's stick: a short strike at the nearest enemy in reach, piercing the ones on the line to it. In the
// Parade (toss: the shared claims) a drummer with nobody in reach throws the stick at the nearest unclaimed enemy
// in throwing range instead.
function jab(g, it, st, dmg, color, toss = null) {
  if (!it) return;
  const e = g.nearest(it.x, it.y, st.reach);
  it.glow = 1;
  if (!e) {
    const far = toss && g.nearest(it.x, it.y, st.toss, toss);
    if (far) toss.claim(far);
    if (far) g.fx.bullet({ x: it.x, y: it.y, angle: Math.atan2(far.y - it.y, far.x - it.x), speed: g.speed(600), r: 4.5, life: 0.8, damage: dmg * st.stick,
      pierce: 2, kb: 40, color, shape: 'shard', spin: 16 });
    return;
  }
  const a = Math.atan2(e.y - it.y, e.x - it.x);
  const len = Math.hypot(e.x - it.x, e.y - it.y) + e.r * 0.6;
  g.fx.beam({ x: it.x, y: it.y, angle: a, length: len, width: st.width, damage: dmg, kb: 50, color, pierce: st.pierce, life: 0.1 });
}

// Parade's confetti: on an accent the last drummer throws a fan of shards at the nearest enemy in throwing range
// (all around with nobody there).
function confetti(g, it, st, note, dmg) {
  const n = g.amount(st.confetti);
  if (n <= 0) return;
  const e = g.nearest(it.x, it.y, st.toss);
  const base = e ? Math.atan2(e.y - it.y, e.x - it.x) : note.s * 0.61;
  const fan = e ? 0.8 / Math.max(1, n - 1) : TAU / n;
  const mid = e ? (n - 1) / 2 : 0;
  for (let i = 0; i < n; i++) {
    g.fx.bullet({ x: it.x, y: it.y, angle: base + (i - mid) * fan, speed: g.speed(460), r: 4.5, life: 0.75, damage: dmg,
      pierce: 1, kb: 30, color: g.color('perc'), shape: 'diamond', spin: 12, drag: 0.6 });
  }
}
