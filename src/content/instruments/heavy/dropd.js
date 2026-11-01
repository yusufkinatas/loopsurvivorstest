// BASS, Heavy: Drop-D Bass. A distorted saw chugging on the root with a clean sine underneath; palm-muted
// notes (k: 'mute') close the filter and stop short. Every note punts an enemy close to you, the closest one in
// front of you first: it flies off like a bowling ball the way you are running (or straight away from you, if it
// stood beside or behind you) and hits everything it crashes into. Charge into the crowd and it scatters ahead
// of you. Bosses and elites are too heavy to punt and take a harder hit instead, and the downbeat turns to a
// boss in range.

import { STEP_SEC } from '../../../config.js';

// Pattern helpers: step s, duration d in steps, velocity v. R an open chug on the root, M a palm-muted
// one, O the root an octave up (chord tones, so they follow every chord change).
const R = (s, d = 2, v = 1) => ({ s, v, d, ct: 0 });
const M = (s, v = 0.8) => ({ s, v, d: 1, ct: 0, k: 'mute' });
const O = (s, d = 1, v = 0.85) => ({ s, v, d, ct: 0, o: 1 });

// Each level keeps the one before and adds to it: the 3-3-2 chug, locked to the Double Kick's 1 and 3.
const CHUG_1 = [R(0, 3), R(8, 3, 0.95)];
const CHUG_2 = [...CHUG_1, M(3), M(11)];
const CHUG_3 = [...CHUG_2, M(6, 0.75), M(14, 0.75)];
const CHUG_4 = [...CHUG_3, O(12, 1, 0.85)];
const CHUG_5 = [...CHUG_4, M(15, 0.8)];   // 12, 14, 15: an 8th and two 16ths, the gallop into the next bar

// Breakdown: big open notes left to ring, with machine-gun 16th chugs in the gaps.
const BREAK = [R(0, 4), M(4, 0.75), M(5, 0.75), R(6, 2, 0.95), M(8), M(9, 0.7), M(10, 0.75), M(11, 0.8), R(12, 4)];

export default {
  id: 'dropd',
  name: 'Drop-D Bass',
  role: 'bass',
  style: 'heavy',
  blurb: 'A distorted chugging bass that punts the closest enemy in front of you the way you are running, into the crowd.',
  steps: 16,
  low: 28,
  levels: [
    { text: 'Two heavy chugs a bar punt the closest enemy in front of you the way you run.',
      pattern: CHUG_1,
      stats: { damage: 30, crash: 0.7, range: 150, speed: 620, punts: 1 } },
    { text: 'Muted chugs after each one.',
      pattern: CHUG_2,
      stats: { damage: 30, crash: 0.7, range: 160, speed: 640, punts: 1 } },
    { text: 'A full syncopated chug. Longer reach.',
      pattern: CHUG_3,
      stats: { damage: 32, crash: 0.75, range: 170, speed: 660, punts: 1 } },
    { text: 'An octave pop on beat 4. Harder crashes.',
      pattern: CHUG_4,
      stats: { damage: 34, crash: 0.85, range: 180, speed: 690, punts: 1 } },
    { text: 'A gallop into every bar. Open chugs punt two.',
      pattern: CHUG_5,
      stats: { damage: 37, crash: 0.9, range: 190, speed: 720, punts: 2 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    const mute = note.k === 'mute';
    const rx = !!inst?.remix;
    const f = note.freq;
    // The amp: two detuned saws into the clipper, then a lowpass that a palm mute closes down. Remixed
    // (Breakdown), the open notes dive into pitch and the grit goes up.
    v.tone(ctx, out, t, { freq: f, wave: 'sawtooth', unison: 2, spread: 9, drive: rx ? 4 : 3,
      dur: mute ? Math.min(note.dur, 0.08) : note.dur, a: 0.003, d: mute ? 0.07 : 0.22, s: mute ? 0.2 : 0.75, r: mute ? 0.04 : 0.1,
      gain: (rx ? 0.17 : 0.24) * note.v, pitchEnv: rx && !mute ? { from: 1.12, time: 0.07 } : null,
      filter: mute ? { type: 'lowpass', freq: 420, q: 1.1, env: 1.8, decay: 0.05 } : { type: 'lowpass', freq: 760, q: 0.9, env: 2.2, decay: 0.16 } });
    // The clean sine underneath at the note itself, so the chug keeps its weight on any speaker.
    v.tone(ctx, out, t, { freq: f, wave: 'sine', dur: mute ? 0.07 : note.dur, a: 0.004, d: 0.1, s: 0.85, r: mute ? 0.04 : 0.09,
      gain: 0.05 * note.v });
  },

  fire(g, note, st) {
    const p = g.player;
    const mute = note.k === 'mute';
    // Long notes hit harder: a one-step chug deals 80%, a three-step one 110%.
    const steps = note.dur / STEP_SEC;
    const dmg = g.dmg(st.damage) * note.v * Math.min(1.25, 0.65 + 0.15 * steps);
    const range = g.area(st.range);
    // The closest enemies in front of you first (the way you are running), then the closest anywhere; the open
    // chugs punt more of them, and on the downbeat a boss in range takes the first.
    const boss = note.s === 0 && g.bossInRange(p.x, p.y, Math.max(range, 280));
    const n = Math.max(1, mute ? g.amount(1) : g.amount(st.punts));
    const face = g.aim(), fx = Math.cos(face), fy = Math.sin(face);
    const near = g.nearestN(p.x, p.y, n + 6, range + 20).filter((e) => !e.launch);   // not one already flying
    const ahead = (e) => (e.x - p.x) * fx + (e.y - p.y) * fy > 0.35 * Math.hypot(e.x - p.x, e.y - p.y);
    const targets = [...near.filter(ahead), ...near.filter((e) => !ahead(e))].slice(0, n);
    if (boss && !targets.includes(boss)) { targets.unshift(boss); targets.length = Math.min(targets.length, n); }
    for (const e of targets) punt(g, e, dmg, st, mute, !!st.blast, ahead(e) ? face : null);
    g.shake = Math.max(g.shake, (mute ? 1 : 2) * note.v * (st.blast ? 1.3 : 1));
  },

  remix: {
    id: 'breakdown', name: 'Breakdown', pedal: 'wah',
    text: 'Punted enemies explode where they land, throwing the next ones.',
    pattern: BREAK,
    stats: { damage: 44, range: 240, punts: 3, blast: 1, blastRadius: 100 },
  },
};

// Punt one enemy: send it flying, hitting all it crashes into. One in front of you flies the way you face (`face`),
// one beside or behind you flies straight away from you; either way it is turned onto the nearest enemy within 60
// degrees of that line, so it bowls into something. It takes the punt's own hit where it lands, so even a weak one
// flies before it falls. Bosses and elites are too heavy to fly and take 1.5x the hit at once; one that cannot fly
// (charging) takes the hit where it stands. Breakdown (remix, boom): it explodes where it lands.
function punt(g, e, dmg, st, mute, boom, face) {
  const p = g.player;
  const color = g.color('bass');
  if (e.boss || e.elite) {
    g.hit(e, dmg * 1.5, { kb: 140, fx: p.x, fy: p.y });
    g.fx.flash(e.x, e.y, e.r * 1.8, color, 0.2, 0.3);
    return;
  }
  let ang = face ?? Math.atan2(e.y - p.y, e.x - p.x);
  const behind = pinTarget(g, e, ang);
  if (behind) ang = Math.atan2(behind.y - e.y, behind.x - e.x);
  const speed = g.speed(st.speed) * (mute ? 0.8 : 1);
  const onLand = (en, gg) => {
    gg.hit(en, dmg, { fx: en.x, fy: en.y });
    if (boom) blast(gg, en, dmg, st, mute);
  };
  if (!g.launch(e, ang, speed, dmg * st.crash, { t: mute ? 0.3 : 0.38, max: 6, onLand })) g.hit(e, dmg, { kb: 160, fx: p.x, fy: p.y });
  g.fx.particles(e.x, e.y, color, 5, 200, 0.3, 3);
}

// The nearest enemy within 220 px of e that lies away from you (within 60 degrees of the punt), or null.
function pinTarget(g, e, ang) {
  const ax = Math.cos(ang), ay = Math.sin(ang);
  let best = null, bd = 220 * 220;
  g.grid.query(e.x, e.y, 220, (o) => {
    if (o === e || o.dead || o.spawnT > 0.2 || o.launch) return;
    const dx = o.x - e.x, dy = o.y - e.y, d = dx * dx + dy * dy;
    if (d < bd && dx * ax + dy * ay > 0.5 * Math.sqrt(d)) { bd = d; best = o; }
  });
  return best;
}

// Breakdown (remix): a punted enemy explodes where it stops, and the blast throws the smaller enemies around
// it outward (one generation: what the blast throws does not explode).
function blast(g, e, dmg, st, mute) {
  const r = g.area(st.blastRadius) * (mute ? 0.8 : 1);
  const color = g.color('bass');
  const d = dmg * st.blast;
  for (const o of g.inRadius(e.x, e.y, r)) {
    if (o === e) continue;
    g.hit(o, d, { kb: 120, fx: e.x, fy: e.y });
    if (!o.dead && !o.boss && !o.elite && o.r <= e.r + 2) g.launch(o, Math.atan2(o.y - e.y, o.x - e.x), 420, d * 0.5, { t: 0.25, max: 3 });
  }
  g.fx.flash(e.x, e.y, r, color, 0.25, 0.3);
  g.fx.particles(e.x, e.y, color, 10, 240, 0.4, 3);
}
