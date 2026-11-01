// BEAT, Orchestra: Timpani. Kettle drums tuned to the chord's root (MIDI 38-49, in key by construction). Soft
// hits and rolls gather a resonance around you (motes that spin wider and faster); an accent booms it out as one
// shockwave sized by what was gathered. Fills and the Build-Up are timpani rolls: a fill's last stroke releases
// at the top of the phrase, and the Build-Up's 8 bars of rolls release on The Drop's downbeat.

import { STEP_SEC, BEAT_SEC } from '../../../config.js';
import { mtof } from '../../../music/theory.js';

// Pattern helpers: step s, velocity v; a roll lasts d steps (16 strokes a second).
const K = (s, v = 1) => ({ s, v, k: 'kick' });
const RO = (s, v, d) => ({ s, v, d, k: 'roll' });

const CAP = 8;              // most resonance a roll can gather
const ACCENT = 0.95;        // a hit this loud (or any downbeat hit) releases the resonance
// The orchestra's swell: soft after each fill, full at the next one (mean 1 for damage).
const swell = (phrase) => 0.7 + 0.6 * (phrase ?? 0.5);
const loud = (phrase) => 0.62 + 0.38 * (phrase ?? 0.5);
const loudBoom = (phrase) => 0.76 + 0.24 * (phrase ?? 0.5);
// Kettle pitch: the chord's root between D2 and C#3, so it follows every chord change and stays in key.
const kettle = (note) => mtof(38 + ((((note.chord?.rootPc ?? 9) - 2) % 12) + 12) % 12);
const stepsOf = (note) => Math.max(1, Math.round(note.dur / STEP_SEC));

// Each level keeps the one before and adds to it.
const TIMP_1 = [K(0), K(8, 0.7), RO(12, 0.5, 4)];
const TIMP_2 = [...TIMP_1, K(10)];
const TIMP_3 = [...TIMP_2, K(3, 0.55), K(6, 0.6)];
const TIMP_4 = [...TIMP_3, K(11, 0.6)];
const TIMP_5 = [...TIMP_4, K(4)];

// 1812: a boom on every beat with soft pickups, and a short roll into the downbeat.
const TIMP_RX = [K(0), K(2, 0.55), K(3, 0.65), K(4), K(7, 0.6), K(8), K(10, 0.55), K(11, 0.65), K(12), RO(14, 0.6, 2)];

export default {
  id: 'timpani',
  name: 'Timpani',
  role: 'beat',
  style: 'orchestra',
  blurb: 'Kettle drums tuned to the chord: rolls gather power, accents boom it out.',
  steps: 16,
  levels: [
    { text: "A soft hit and roll charge each bar's boom.",
      pattern: TIMP_1,
      stats: { damage: 9, radius: 112, kb: 150, stun: 0, reach: 460 } },
    { text: 'A second boom answers the soft hit.',
      pattern: TIMP_2,
      stats: { damage: 13, radius: 128, kb: 160, stun: 0, reach: 460 } },
    { text: 'Soft hits charge each boom. Booms stun.',
      pattern: TIMP_3,
      stats: { damage: 17, radius: 145, kb: 170, stun: 0.2, reach: 470 } },
    { text: 'Another soft hit. Bigger booms.',
      pattern: TIMP_4,
      stats: { damage: 22, radius: 162, kb: 180, stun: 0.3, reach: 480 } },
    { text: 'A third boom on beat two.',
      pattern: TIMP_5,
      stats: { damage: 30, radius: 185, kb: 190, stun: 0.35, reach: 500 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    const S = inst?.state || {};
    const f = kettle(note);
    // A Build-Up roll bar plays rolls on steps a fill never does; its loud strokes keep rolling (they release on
    // The Drop, not before it).
    if (note.k === 'roll' && note.s < 12 && note.dur < STEP_SEC * 1.5) S.aRollBar = note.bar;
    const boom = note.k === 'kick' ? note.s === 0 || note.v >= ACCENT : note.v >= ACCENT && note.s === 15 && S.aRollBar !== note.bar;
    if (note.k === 'roll' && !boom) {
      // A roll: soft single strokes 16 a second, swelling across the note. It gathers the next boom's size.
      const n = stepsOf(note) * 2;
      for (let i = 0; i < n; i++) {
        const g = loud(note.phrase) * note.v * (0.6 + (0.4 * (i + 1)) / n);
        v.tone(ctx, out, t + i * STEP_SEC * 0.5, { freq: f, wave: 'sine', dur: 0.01, a: 0.004, d: 0.22, s: 0, r: 0.05, gain: 0.45 * g, pitchEnv: { from: 1.06, time: 0.03 } });
        v.noise(ctx, out, t + i * STEP_SEC * 0.5, { dur: 0.003, d: 0.03, gain: 0.12 * g, filter: { type: 'lowpass', freq: 700 } });
      }
      S.aCharge = Math.min(CAP, (S.aCharge || 0) + 0.5 * note.v * stepsOf(note));
      S.aPeak = Math.max(S.aPeak || 0, note.phrase ?? 0.5);
      return;
    }
    if (!boom) {
      // A soft hit: short and round, felt more than heard. It gathers too.
      const g = loud(note.phrase) * note.v;
      v.tone(ctx, out, t, { freq: f, wave: 'sine', dur: 0.02, a: 0.003, d: 0.6, s: 0, r: 0.06, gain: 0.62 * g, pitchEnv: { from: 1.1, time: 0.05 } });
      v.tone(ctx, out, t, { freq: f * 1.5, wave: 'sine', dur: 0.01, d: 0.14, s: 0, r: 0.04, gain: 0.1 * g });
      v.noise(ctx, out, t, { dur: 0.003, d: 0.04, gain: 0.16 * g, filter: { type: 'lowpass', freq: 450 } });
      A.duck(t, 0.18 * note.v, 0.16);
      S.aCharge = Math.min(CAP, (S.aCharge || 0) + note.v);
      S.aPeak = Math.max(S.aPeak || 0, note.phrase ?? 0.5);
      return;
    }
    // A boom: the kettle's body, its fifth and octave partials and the felt mallet, fuller (longer, a little louder)
    // the more it gathered, and as loud as the swell it gathered in (the Build-Up's roll lands full on The Drop).
    // It dies away within 0.9 s, quickly enough not to smear into the bass, which plays the same root.
    // A kick under a Build-Up roll (a later beat of a roll bar, or the downbeat after a roll bar that had kicks)
    // booms at its own size and lets the roll keep gathering.
    const under = note.s > 0 ? S.aRollBar === note.bar : S.aKickRoll === note.bar - 1;
    if (under || S.aRollBar === note.bar) S.aKickRoll = note.bar;
    const c = under ? 0 : Math.min(CAP, S.aCharge || 0);
    const g = Math.min(1.02, loudBoom(Math.max(note.phrase ?? 0.5, under ? 0 : S.aPeak || 0)) * note.v * (under ? 0.65 : 1 + 0.02 * c));
    if (!under) { S.aCharge = 0; S.aPeak = 0; }
    const rx = !!inst?.remix;
    v.tone(ctx, out, t, { freq: f, wave: 'sine', dur: 0.03, a: 0.002, d: Math.min(0.9, 0.78 + 0.015 * c), s: 0, r: 0.08, gain: (rx && !under ? 0.6 : 0.68) * g, pitchEnv: { from: 1.16, time: 0.06 } });
    v.tone(ctx, out, t, { freq: f * 1.5, wave: 'sine', dur: 0.02, d: 0.3, s: 0, r: 0.05, gain: 0.14 * g });
    v.tone(ctx, out, t, { freq: f * 2, wave: 'triangle', dur: 0.01, d: 0.09, s: 0, r: 0.04, gain: 0.07 * g });
    v.noise(ctx, out, t, { dur: 0.004, d: 0.07, gain: 0.16 * g, filter: { type: 'lowpass', freq: 420 } });
    if (rx && !under) {
      // 1812: a cannon under every boom, a dark burst of powder that thuds and rumbles off into the hall.
      v.noise(ctx, out, t, { dur: 0.01, d: 0.32, r: 0.06, gain: 0.22 * g, filter: { type: 'lowpass', freq: 260, q: 0.7, env: 3, decay: 0.12 } });
      v.tone(ctx, out, t, { freq: f / 2, wave: 'sine', dur: 0.02, d: 0.24, s: 0, r: 0.05, gain: 0.14 * g, pitchEnv: { from: 1.6, time: 0.05 } });
    }
    A.duck(t, (0.32 + 0.02 * c) * note.v, 0.22);
  },

  setup(g, st, inst) { motes(g, inst); },

  fire(g, note, st, inst) { strike(g, note, st, inst); },

  remix: {
    id: 'overture1812', name: '1812', pedal: 'reverb',
    text: 'A boom on every beat, each firing cannons at the heaviest crowds ahead.',
    pattern: TIMP_RX,
    stats: { damage: 32, radius: 220, cannons: 3, cannon: 36, cannonR: 85, reach: 600 },
  },
};

// The resonance you carry: motes circling the speaker, one per unit gathered, wider and faster as it grows.
function motes(g, inst) {
  const c = inst.state.charge || 0;
  g.fx.orbit(inst, { count: Math.min(CAP, Math.floor(c)), radius: 30 + 4 * c, speed: 2.4 + 0.45 * c, size: 3, color: g.color(inst), shape: 'ring' });
}

// One note. Rolls and soft hits gather (no damage): a ring closes in on you at the size the next boom will
// reach. An accent (a downbeat hit, or any hit or fill stroke at 0.95) releases it all as one shockwave. In the
// Build-Up's roll bars the roll gathers and the kicks under it boom at their own size, so the whole roll comes
// out on The Drop's downbeat. An echo only booms at its own strength and never touches the resonance.
function strike(g, note, st, inst) {
  const S = inst.state;
  const echo = g.dmgScale !== 1;
  const rollBar = !!g.song?.position(note.bar)?.arr?.roll;
  const accent = note.k === 'kick' ? note.s === 0 || note.v >= ACCENT : note.v >= ACCENT && note.s === 15;
  if (rollBar && note.k === 'kick') { boomAt(g, note, st, inst, 0, swell(note.phrase)); return; }
  if (rollBar || !accent) {
    if (echo) return;
    const add = note.k === 'roll' ? 0.5 * note.v * stepsOf(note) : note.v;
    S.charge = Math.min(CAP, (S.charge || 0) + add);
    S.peak = Math.max(S.peak || 0, note.phrase ?? 0.5);
    gather(g, st, S.charge, g.color(inst));
    motes(g, inst);
    return;
  }
  const c = echo ? 0 : S.charge || 0;
  // A release carries the swell of the roll that gathered it, so the Build-Up still lands full on The Drop.
  const sw = swell(Math.max(note.phrase ?? 0.5, echo ? 0 : S.peak || 0));
  if (!echo) { S.charge = 0; S.peak = 0; motes(g, inst); }
  const boom = boomAt(g, note, st, inst, c, sw);
  if (inst.remix && st.cannons) cannons(g, note, st, c, sw, boom);
}

// A boom of resonance c: one shockwave from you, or from a boss in reach on the bar's first hit. Returns the
// boss it landed on (or null) and its reach.
function boomAt(g, note, st, inst, c, sw) {
  const p = g.player;
  const color = g.color(inst);
  const boss = note.s === 0 ? g.bossInRange(p.x, p.y, st.reach) : null;
  const x = boss ? boss.x : p.x, y = boss ? boss.y : p.y;
  const r1 = g.area(Math.min(st.radius + 25 * c, st.radius + 190)) * (0.85 + 0.15 * note.v);
  const mul = Math.min(4, 1 + 0.35 * c);
  g.fx.ring({ x, y, follow: !boss, r0: boss ? boss.r : 18, r1, dur: 0.28 + 0.025 * c, damage: g.dmg(st.damage) * note.v * mul * sw,
    kb: st.kb * (1 + 0.06 * c), stun: (st.stun || 0) * (1 + 0.1 * c), color, width: 6 + 1.2 * c });
  if (c >= 3) g.fx.ring({ x, y, follow: !boss, r0: 10, r1: r1 * 0.6, dur: 0.22, damage: 0, kb: 0, color: '#ffffff', width: 3 });
  g.fx.flash(x, y, 40 + 6 * c, color, 0.25, 0.3);
  g.fx.particles(x, y, color, 8 + 3 * c, 200 + 30 * c, 0.45, 3);
  g.shake = Math.max(g.shake, (2.5 + 0.6 * c) * note.v);
  return { boss, r: r1 };
}

// Gathering: a thin ring closes in on you from where the next boom will reach.
function gather(g, st, c, color) {
  const p = g.player;
  const r = g.area(Math.min(st.radius + 25 * c, st.radius + 190));
  g.fx.ring({ x: p.x, y: p.y, follow: true, r0: r, r1: 22, dur: 0.24, damage: 0, kb: 0, color, width: 1.5 + 0.4 * c });
}

// 1812: each boom also fires cannons (more the more it gathered, up to 6) over the shockwave, at the biggest
// targets beyond it: the boss before all, then the heaviest knots of enemies (an enemy and everything around it,
// by health), those ahead of you counting more. Each shell falls two 16ths later, on the off-beat.
function cannons(g, note, st, c, sw, boom) {
  const p = g.player;
  const n = Math.min(6, g.amount(st.cannons + Math.floor(c / 1.5)));
  if (n <= 0) return;
  const reach = st.reach, blast = g.area(st.cannonR);
  const ax = p.faceX, ay = p.faceY;
  const b = boom.boss || g.bossInRange(p.x, p.y, reach);
  const near = boom.boss ? 0 : boom.r * 0.8;
  const cand = [];
  for (const e of g.inRadius(p.x, p.y, reach)) {
    if (e.boss || e.spawnT > 0.2) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    if (dx * dx + dy * dy >= near * near) cand.push(e);
  }
  // Weigh at most 24 of them (every k-th, so it stays deterministic), each by the health inside its blast.
  const pool = [];
  const step = Math.max(1, Math.ceil(cand.length / 24));
  for (let i = 0; i < cand.length; i += step) {
    const e = cand[i];
    let hp = 0;
    for (const o of g.inRadius(e.x, e.y, blast * 0.8)) if (!o.boss) hp += o.hp;
    const ahead = (e.x - p.x) * ax + (e.y - p.y) * ay > 0 ? 1.6 : 1;
    pool.push([hp * ahead, e]);
  }
  pool.sort((u, w) => w[0] - u[0]);
  const targets = b ? [b] : [];
  for (let i = 0; targets.length < n && i < pool.length; i++) {
    const e = pool[i][1];
    if (targets.some((t) => (t.x - e.x) ** 2 + (t.y - e.y) ** 2 < blast * blast)) continue;   // spread the volley
    targets.push(e);
  }
  const color = g.color('beat');
  const dmg = g.dmg(st.cannon) * note.v * sw;
  for (let i = 0; i < targets.length; i++) {
    const e = targets[i];
    g.fx.strike({ x: e.x, y: e.y, target: e, delay: 2 * STEP_SEC, r: blast, damage: dmg, kb: 140, stun: 0.25, color, style: 'drop' });
  }
  // Reports from the guns: a ring of smoke where the volley left.
  g.fx.ring({ x: p.x, y: p.y, follow: true, r0: 14, r1: 70, dur: BEAT_SEC * 0.4, damage: 0, kb: 0, color: '#ffd166', width: 3 });
}
