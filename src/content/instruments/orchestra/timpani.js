// BEAT, Orchestra: Timpani. Kettle drums tuned to the chord's root (MIDI 38-49, in key by construction). Placed
// and timed: the first soft hit or roll after a boom sets a kettle down on the thickest crowd near you (it rides
// along with that crowd), every soft stroke tunes it up (its circle grows), and an accent booms it out as one
// shockwave sized by what was gathered. Fills and the Build-Up are timpani rolls: a fill's last stroke releases
// at the top of the phrase, and the Build-Up's 8 bars of rolls release on The Drop's downbeat.

import { STEP_SEC, BEAT_SEC, BAR_SEC } from '../../../config.js';
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
  blurb: 'Kettle drums tuned to the chord: soft strokes set a kettle on the crowd and tune it, accents boom it out.',
  steps: 16,
  levels: [
    { text: 'A soft hit sets a kettle down on the thickest crowd near you, a roll tunes it up, and the downbeat booms it out.',
      pattern: TIMP_1,
      stats: { damage: 9, radius: 96, kb: 150, stun: 0, reach: 300 } },
    { text: 'A second boom answers the soft hit.',
      pattern: TIMP_2,
      stats: { damage: 13, radius: 104, kb: 160, stun: 0, reach: 310 } },
    { text: 'Soft hits tune each boom. Booms stun.',
      pattern: TIMP_3,
      stats: { damage: 19, radius: 112, kb: 170, stun: 0.2, reach: 320 } },
    { text: 'Another soft hit. Bigger booms.',
      pattern: TIMP_4,
      stats: { damage: 28, radius: 122, kb: 180, stun: 0.3, reach: 330 } },
    { text: 'A third boom on beat two.',
      pattern: TIMP_5,
      stats: { damage: 40, radius: 132, kb: 190, stun: 0.35, reach: 340 } },
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

  // The kettle rides along with the crowd it was set on.
  update(g, dt, st, inst) {
    const S = inst.state, m = kettleOf(g, inst), e = S.anchor;
    if (!m || !e || e.dead) return;
    const k = Math.min(1, dt * 6);
    m.x += (e.x - m.x) * k; m.y += (e.y - m.y) * k;
  },

  fire(g, note, st, inst) { strike(g, note, st, inst); },

  remix: {
    id: 'overture1812', name: '1812', pedal: 'reverb',
    text: 'A boom on every beat, each firing cannons at the heaviest crowds the kettle missed.',
    pattern: TIMP_RX,
    stats: { damage: 42, radius: 140, cannons: 3, cannon: 32, cannonR: 70, reach: 360 },
  },
};

const GROW = 12;            // px a boom reaches farther per unit gathered
const GROW_MAX = 96;        // ... and at most this much farther
const reachOf = (g, st, c) => g.area(st.radius + Math.min(GROW * c, GROW_MAX));

// The kettle of this Timpani, if one is down.
function kettleOf(g, inst) {
  const id = inst.def.id;
  for (const m of g.fx.mines) if (m.owner === id) return m;
  return null;
}

// Set the kettle down on the thickest crowd within reach (just ahead of you when nobody is there).
function setKettle(g, st, inst) {
  const p = g.player, S = inst.state;
  const spot = g.densest(st.reach);
  const a = g.aim();
  const x = spot ? spot.x : p.x + Math.cos(a) * 90, y = spot ? spot.y : p.y + Math.sin(a) * 90;
  S.anchor = spot ? spot.enemy : null;
  const m = g.fx.mine({ owner: inst.def.id, x, y, r: reachOf(g, st, 0), damage: 0, kb: 0, color: g.color(inst), life: 9 * BAR_SEC, max: 1, size: 5, persist: true });
  g.fx.flash(x, y, 26, m.color, 0.25, 0.3);
  return m;
}

// One note. Rolls and soft hits gather (no damage): the first one after a boom sets the kettle down, and each
// tunes it up (its circle grows to the size the boom will reach, and a ring closes in on it). An accent (a
// downbeat hit, or any hit or fill stroke at 0.95) booms it all out from the kettle as one shockwave (from a boss
// in reach on the bar's first hit; from you when no kettle is down). In the Build-Up's roll bars the roll gathers
// and the kicks under it boom at their own size, so the whole roll comes out on The Drop's downbeat. An echo only
// booms at its own strength where the kettle stands, and never touches the kettle or the resonance.
function strike(g, note, st, inst) {
  const S = inst.state;
  const echo = g.dmgScale !== 1;
  const rollBar = !!g.song?.position(note.bar)?.arr?.roll;
  const accent = note.k === 'kick' ? note.s === 0 || note.v >= ACCENT : note.v >= ACCENT && note.s === 15;
  if (rollBar && note.k === 'kick') { boomAt(g, note, st, inst, 0, swell(note.phrase), kettleOf(g, inst)); return; }
  if (rollBar || !accent) {
    if (echo) return;
    let m = kettleOf(g, inst);
    if (!m || S.fresh !== false) { m = setKettle(g, st, inst); S.fresh = false; }
    const add = note.k === 'roll' ? 0.5 * note.v * stepsOf(note) : note.v;
    S.charge = Math.min(CAP, (S.charge || 0) + add);
    S.peak = Math.max(S.peak || 0, note.phrase ?? 0.5);
    m.r = reachOf(g, st, S.charge);
    m.size = 5 + 0.6 * S.charge;
    m.glow = 1;
    g.fx.ring({ x: m.x, y: m.y, r0: m.r, r1: 14, dur: 0.24, damage: 0, kb: 0, color: m.color, width: 1.5 + 0.4 * S.charge });
    return;
  }
  const c = echo ? 0 : S.charge || 0;
  // A release carries the swell of the roll that gathered it, so the Build-Up still lands full on The Drop.
  const sw = swell(Math.max(note.phrase ?? 0.5, echo ? 0 : S.peak || 0));
  const m = kettleOf(g, inst);
  if (!echo) {
    S.charge = 0; S.peak = 0; S.fresh = true;
    if (m) g.fx.mines.splice(g.fx.mines.indexOf(m), 1);
  }
  const boom = boomAt(g, note, st, inst, c, sw, m);
  if (inst.remix && st.cannons) cannons(g, note, st, c, sw, boom);
}

// A boom of resonance c: one shockwave from the kettle m (or from a boss in reach on the bar's first hit, or from
// you when no kettle is down). Returns where it landed, the boss it landed on (or null) and its reach.
function boomAt(g, note, st, inst, c, sw, m) {
  const p = g.player;
  const color = g.color(inst);
  const boss = note.s === 0 ? g.bossInRange(p.x, p.y, st.reach) : null;
  const at = boss || m;
  const x = at ? at.x : p.x, y = at ? at.y : p.y;
  const r1 = reachOf(g, st, c) * (0.85 + 0.15 * note.v);
  const mul = Math.min(4, 1 + 0.35 * c);
  g.fx.ring({ x, y, follow: !at, r0: boss ? boss.r : 18, r1, dur: 0.28 + 0.025 * c, damage: g.dmg(st.damage) * note.v * mul * sw,
    kb: st.kb * (1 + 0.06 * c), stun: (st.stun || 0) * (1 + 0.1 * c), color, width: 6 + 1.2 * c });
  if (c >= 3) g.fx.ring({ x, y, follow: !at, r0: 10, r1: r1 * 0.6, dur: 0.22, damage: 0, kb: 0, color: '#ffffff', width: 3 });
  g.fx.flash(x, y, 40 + 6 * c, color, 0.25, 0.3);
  g.fx.particles(x, y, color, 8 + 3 * c, 200 + 30 * c, 0.45, 3);
  g.shake = Math.max(g.shake, (2.5 + 0.6 * c) * note.v);
  return { x, y, boss, r: r1 };
}

// 1812: each boom also fires cannons (more the more it gathered, up to 6) from you at the biggest targets in reach
// outside the shockwave: the boss before all, then the heaviest knots of enemies (an enemy and everything around
// it, by health), those ahead of you counting more. Each shell falls two 16ths later, on the off-beat.
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
    const dx = e.x - boom.x, dy = e.y - boom.y;
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
