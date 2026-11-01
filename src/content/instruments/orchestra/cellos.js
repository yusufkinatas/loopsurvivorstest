// BASS, Orchestra: Cellos. A bowed ostinato on the root and the step above it, quarters at level 1 and driving
// sixteenths by level 5. Every note drags the enemies around the thickest crowd near you into its center (a
// whirl marks the spot), and the accents on beats 1 and 3 crush that point. The neighbor notes stay one step
// long, so the sequencer never settles them onto the root.

// Pattern helpers: step s, duration d in steps, velocity v. R the root (a chord tone), N the step above it.
const R = (s, d = 1, v = 1) => ({ s, v, d, ct: 0 });
const N = (s, v = 0.65) => ({ s, v, d: 1, sc: 1 });
const O = (s, d = 1, v = 1) => ({ s, v, d, ct: 0, o: 1 });

const ACCENT = 0.95;   // a note this loud crushes the point

// Each level keeps the steps of the one before (shortening notes as it speeds up) and adds to them.
const CELLO_1 = [R(0, 3), R(4, 3, 0.75), R(8, 3, 0.95), R(12, 3, 0.75)];
const CELLO_2 = [R(0, 2), R(2, 1, 0.6), R(4, 2, 0.75), N(6), R(8, 2, 0.95), R(10, 1, 0.6), R(12, 2, 0.75), N(14)];
const CELLO_3 = [...CELLO_2.map((n) => (n.s === 4 || n.s === 12 ? { ...n, d: 1 } : n)), R(7, 1, 0.5), R(15, 1, 0.5)];
const CELLO_4 = [...CELLO_3.map((n) => (n.s === 0 || n.s === 8 ? { ...n, d: 1 } : n)), R(3, 1, 0.5), R(11, 1, 0.5)];
const CELLO_5 = [...CELLO_4, R(1, 1, 0.5), R(5, 1, 0.55), N(9, 0.55), R(13, 1, 0.55)];

// Maelstrom: the same drive in a 3+3+2 swirl, every third 16th an accent leaping to the octave and back.
const CELLO_RX = [
  R(0), R(1, 1, 0.5), N(2, 0.55), O(3, 1, 0.95), R(4, 1, 0.5), N(5, 0.55), O(6, 1, 0.95), R(7, 1, 0.55),
  R(8), R(9, 1, 0.5), N(10, 0.55), O(11, 1, 0.95), R(12, 1, 0.5), N(13, 0.55), O(14, 1, 0.95), R(15, 1, 0.6),
];

export default {
  id: 'cellos',
  name: 'Cellos',
  role: 'bass',
  style: 'orchestra',
  blurb: 'A driving cello ostinato that drags the crowd together and crushes it.',
  steps: 16,
  low: 28,
  levels: [
    { text: 'Each note pulls the crowd in. Accents crush it.',
      pattern: CELLO_1,
      stats: { damage: 17, radius: 70, stun: 0, pull: 60, pullR: 210, range: 380 } },
    { text: 'Eighth notes: the pull never lets up.',
      pattern: CELLO_2,
      stats: { damage: 26, radius: 75, stun: 0, pull: 46, pullR: 220, range: 390 } },
    { text: 'Pickup notes and bigger crushes.',
      pattern: CELLO_3,
      stats: { damage: 33, radius: 82, stun: 0, pull: 40, pullR: 225, range: 400 } },
    { text: 'More pickups. Crushes stun.',
      pattern: CELLO_4,
      stats: { damage: 42, radius: 89, stun: 0.3, pull: 36, pullR: 230, range: 410 } },
    { text: 'A full sixteenth ostinato. Wider, harder crushes.',
      pattern: CELLO_5,
      stats: { damage: 54, radius: 96, stun: 0.3, pull: 32, pullR: 235, range: 420 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    const rx = !!inst?.remix;
    const g = (0.55 + 0.45 * (note.phrase ?? 0.5)) * note.v;
    const f = note.freq;
    // The section: two detuned bowed saws behind a dark lowpass that opens a little on the bow's bite, and a sine
    // under it for weight. Maelstrom digs in harder: the bows overdrive and the filter opens.
    v.tone(ctx, out, t, { freq: f, wave: 'sawtooth', unison: 2, spread: 9, dur: note.dur, a: 0.03, d: 0.12, s: 0.8, r: 0.08, gain: 0.3 * g,
      filter: { type: 'lowpass', freq: rx ? 1050 : 800, q: 0.9, env: 1.5, decay: 0.14 }, drive: rx ? 2.4 : 0 });
    v.tone(ctx, out, t, { freq: f, wave: 'sine', dur: note.dur, a: 0.02, d: 0.1, s: 0.85, r: 0.08, gain: 0.09 * g });
    // Rosin: the bow catching the string on an accent.
    if (note.v >= ACCENT) v.noise(ctx, out, t, { dur: 0.004, d: 0.04, gain: 0.05 * g, filter: { type: 'bandpass', freq: 1300, q: 1.1 } });
  },

  fire(g, note, st, inst) { bow(g, note, st, inst, false); },

  remix: {
    id: 'maelstrom', name: 'Maelstrom', pedal: 'overdrive',
    text: 'The crowd spins the way you circle, and every crush rings outward.',
    pattern: CELLO_RX,
    stats: { damage: 44, radius: 96, stun: 0.3, pull: 30, pullR: 250, range: 430, spin: 34, ringDamage: 19, ringReach: 2.6 },
    fire(g, note, st, inst) { bow(g, note, st, inst, true); },
  },
};

// The orchestra's swell: soft after each fill, full at the next one (mean 1).
const swell = (phrase) => 0.7 + 0.6 * (phrase ?? 0.5);

// One bowed note. An accent crushes the point first (on the bar's downbeat, a boss in range instead). Then, on
// each beat, the point moves to the thickest crowd near you, and every note drags the enemies around it in.
// Maelstrom spins them around the point too, the way you are circling it, and its crushes ring outward.
function bow(g, note, st, inst, maelstrom) {
  const S = inst.state, p = g.player;
  const color = g.color(inst);
  const echo = g.dmgScale !== 1;
  const sw = swell(note.phrase);
  if (note.v >= ACCENT) {
    const boss = note.s === 0 ? g.bossInRange(p.x, p.y, st.range) : null;
    const pt = boss || S.pt || { x: p.x + p.faceX * 90, y: p.y + p.faceY * 90 };
    crush(g, note, st, pt.x, pt.y, sw, color, maelstrom);
  }
  if (!S.pt || note.s % 4 === 0 || Math.hypot(S.pt.x - p.x, S.pt.y - p.y) > st.range) {
    const d = g.densest(st.range);
    S.pt = d ? { x: d.x, y: d.y } : null;
  }
  if (!S.pt) return;
  const { x, y } = S.pt;
  const r = g.area(st.pullR);
  g.pull(x, y, r, st.pull * note.v);
  if (maelstrom) {
    // Spin the way you are circling the point (your velocity across the line to it); hold the last turn when still.
    const cross = (x - p.x) * p.vy - (y - p.y) * p.vx;
    if (Math.abs(cross) > 400) S.turn = cross > 0 ? -1 : 1;
    swirl(g, x, y, r, st.spin * note.v, S.turn || 1);
  }
  if (!echo) mark(g, st, inst, x, y);
  // The drag, drawn: a ring closing in on the point.
  g.fx.ring({ x, y, r0: r * 0.45, r1: 14, dur: 0.2, damage: 0, kb: 0, color, width: 1.5 + note.v });
}

// The crush: an instant blow on the point that stuns what it holds. Maelstrom's also rings outward.
function crush(g, note, st, x, y, sw, color, maelstrom) {
  const r = g.area(st.radius) * (0.85 + 0.15 * note.v);
  g.fx.pulse({ x, y, r, damage: g.dmg(st.damage) * note.v * sw, kb: 40, stun: st.stun || 0, color, fill: 0.34, flashLife: 0.26 });
  g.fx.particles(x, y, color, 12, 220, 0.4, 3);
  g.shake = Math.max(g.shake, 2.2 * note.v);
  if (maelstrom) {
    g.fx.ring({ x, y, r0: r * 0.8, r1: r * st.ringReach, dur: 0.3, damage: g.dmg(st.ringDamage) * note.v * sw, kb: 90, color, width: 5 });
  }
}

// The whirl that marks the point: a persistent marker (a mine that never goes off) the size of the crush,
// moved to the point on each note and kept alive while the cellos play.
function mark(g, st, inst, x, y) {
  const S = inst.state;
  let m = S.marker;
  if (!m || !g.fx.mines.includes(m)) {
    m = S.marker = g.fx.mine({ owner: inst.def.id, x, y, r: g.area(st.radius), damage: 0, kb: 0, color: g.color(inst), life: 2, max: 1, size: 5, persist: true });
  }
  m.x = x; m.y = y; m.r = g.area(st.radius);
  m.life = m.age + 2;
  m.glow = 1;
}

// A turn around (x, y): a sideways shove on every enemy within r (bosses, charging, spawning and flying enemies
// hold), the same kind of impulse g.pull gives, so the pulled crowd circles the point as it closes in.
function swirl(g, x, y, r, strength, dir) {
  for (const e of g.inRadius(x, y, r)) {
    if (e.boss || e.ai.charge > 0 || e.spawnT > 0 || e.launch) continue;
    const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy);
    if (d < 4) continue;
    const k = Math.min((strength * 3) / Math.max(0.5, e.mass), d * 4);
    e.kbx += (-dy / d) * k * dir; e.kby += (dx / d) * k * dir;
  }
}
