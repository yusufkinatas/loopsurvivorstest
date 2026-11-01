// SPARKLE, Heavy: Pinch Harmonics. The squeal a guitarist gets by catching the string with the thumb: a
// glassy pick, then a gritty harmonic that scoops into pitch and wails with a wide vibrato. Each squeal
// hooks the nearest free enemy on a crackling line and drags it in, and every squeal hits all of them.

import { STEP_SEC, BEAT_SEC } from '../../../config.js';

const LOW = 74;
const BOSS_RANGE = 380;          // a boss this close is always hooked (hit by every squeal, never dragged)

// Pattern helper: step s (0..15), chord tone c, velocity v, length d in steps. Every note is a chord tone.
const P = (s, c, v = 1, d = 1) => ({ s, ct: c, v, d });
// The remix's whammy dive: a squeal that falls into its note from a fifth above.
const DIVE = (s, c, d) => ({ s, ct: c, v: 1, d, k: 'dive' });

// Squeals on the off-beat 8ths, then the beats, then 16th flicks into them.
const SQ_1 = [P(2, 3, 1, 2), P(6, 4, 0.85, 2), P(10, 3, 0.9, 2), P(14, 2, 0.85, 2)];
const SQ_2 = [P(0, 2, 0.8), P(8, 1, 0.8)];
const SQ_3 = [P(4, 3, 0.75), P(12, 3, 0.75)];
const SQ_4 = [P(5, 5, 0.65), P(13, 4, 0.65)];
const SQ_5 = [P(1, 3, 0.6), P(9, 2, 0.6)];

// Hook up to `n` more enemies (nearest first, never one already hooked) while fewer than st.hooks are on.
function hook(g, note, st, inst, n) {
  const id = inst.def.id, p = g.player, color = g.color(inst);
  const hooked = g.fx.tethersOf(id);
  const taken = new Set(hooked.map((t) => t.e));
  let room = st.hooks - hooked.length;
  // A boss in range is always on a hook: hit by every squeal, but too heavy to drag. It takes a hook first
  // (the oldest lets go for it).
  const boss = g.bossInRange(p.x, p.y, BOSS_RANGE);
  if (boss && !taken.has(boss)) {
    if (room <= 0 && hooked.length) hooked[0].life = 0;
    g.fx.tether(id, boss, { life: st.life, pull: st.pull, color });
    taken.add(boss); room = Math.max(0, room - 1); n--;
  }
  for (let i = 0; i < n && room > 0; i++, room--) {
    const e = g.nearest(p.x, p.y, st.range, taken);
    if (!e) break;
    g.fx.tether(id, e, { life: st.life, pull: st.pull, color });
    taken.add(e);
    g.fx.particles(e.x, e.y, color, 4, 120, 0.3, 2);
  }
}

export default {
  id: 'pinch',
  name: 'Pinch Harmonics',
  role: 'arp',
  style: 'heavy',
  blurb: 'Squealing guitar harmonics that hook enemies and drag them to you.',
  steps: 16,
  low: LOW,
  levels: [
    { text: 'Squeals hook three enemies and drag them in.',
      pattern: [...SQ_1],
      stats: { damage: 17, hooks: 3, grab: 3, range: 320, pull: 90, life: 3 } },
    { text: 'More squeals, on the beat.',
      pattern: [...SQ_1, ...SQ_2],
      stats: { damage: 17, hooks: 3, grab: 3, range: 330, pull: 95, life: 3 } },
    { text: 'A squeal on every eighth. Four hooks.',
      pattern: [...SQ_1, ...SQ_2, ...SQ_3],
      stats: { damage: 17, hooks: 4, grab: 3, range: 340, pull: 100, life: 3 } },
    { text: 'Quick flicks between squeals. Longer reach.',
      pattern: [...SQ_1, ...SQ_2, ...SQ_3, ...SQ_4],
      stats: { damage: 17.5, hooks: 4, grab: 3, range: 350, pull: 105, life: 3.2 } },
    { text: 'More flicks. Five hooks that drag harder.',
      pattern: [...SQ_1, ...SQ_2, ...SQ_3, ...SQ_4, ...SQ_5],
      stats: { damage: 18, hooks: 5, grab: 3, range: 360, pull: 120, life: 3.4 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    const f = note.freq;
    const rx = !!inst?.remix;
    const dive = note.k === 'dive';
    const pan = note.s % 4 < 2 ? -0.2 : 0.2;
    // The pick: a short, glassy FM glint.
    v.fm(ctx, out, t, { freq: f, ratio: 3, index: 2.5, indexDecay: 0.06, a: 0.001, d: 0.1, s: 0, r: 0.04, dur: 0.01, gain: 0.16 * note.v, pan });
    // The squeal: a gritty harmonic that scoops down into pitch and wails. Whammy dives into it from a fifth
    // above and flutters faster and wider.
    v.tone(ctx, out, t, { freq: f, wave: 'triangle', drive: rx ? 3.2 : 2.4, dur: note.dur * 0.9, a: 0.004, d: 0.12, s: 0.6, r: dive ? 0.2 : 0.1,
      gain: 0.23 * note.v, pitchEnv: dive ? { from: 1.5, time: 0.32 } : { from: 1.06, time: 0.07 },
      vibrato: { rate: rx ? 9 : 6.5, depth: rx ? 38 : 20, delay: dive ? 0.3 : 0.05 },
      pan });
    // The harmonic's ghost an octave up, faint.
    v.tone(ctx, out, t, { freq: f * 2, wave: 'sine', dur: note.dur * 0.6, a: 0.006, d: 0.1, s: 0.4, r: 0.06, gain: 0.055 * note.v,
      pitchEnv: dive ? { from: 1.5, time: 0.32 } : { from: 1.06, time: 0.07 }, vibrato: { rate: rx ? 9 : 6.5, depth: rx ? 38 : 20, delay: 0.05 }, pan: -pan });
  },

  fire(g, note, st, inst) {
    // A Tape Delay echo hits what is hooked and never hooks anything new.
    if (g.dmgScale === 1) hook(g, note, st, inst, note.k === 'dive' ? st.hooks : st.grab);
    g.fx.pulseTethers(inst.def.id, { damage: g.dmg(st.damage) * note.v, color: g.color(inst) });
  },

  remix: {
    id: 'whammy', name: 'Whammy', pedal: 'delay',
    text: 'Hooks reach across the screen, and each bar opens with a dive that yanks them to where you stood a beat ago and slams them.',
    // A dive bomb on every downbeat, then fluttering squeals that climb back up to the next one.
    pattern: [DIVE(0, 4, 4), P(4, 3, 0.7), P(5, 4, 0.75), P(6, 5, 0.85, 2), P(8, 3, 0.9, 2),
      P(11, 2, 0.65), P(12, 3, 0.75), P(13, 4, 0.75), P(14, 5, 0.85), P(15, 4, 0.7)],
    stats: { damage: 24, hooks: 8, grab: 4, range: 680, pull: 240, life: 4, slam: 110, slamR: 130 },
    fire(g, note, st, inst) {
      const S = inst.state, p = g.player;
      // Where you stood a beat or more ago (each note marks the spot).
      const marks = (S.marks ||= []);
      if (g.dmgScale === 1) { marks.push({ t: g.time, x: p.x, y: p.y }); if (marks.length > 12) marks.shift(); }
      this.fire(g, note, st, inst);
      if (note.k !== 'dive' || g.dmgScale !== 1) return;
      let spot = null;
      for (const m of marks) if (m.t <= g.time - BEAT_SEC + 0.01) spot = m;
      spot ||= marks[0];
      const X = spot.x, Y = spot.y, color = g.color(inst);
      // The dive: every hooked enemy that can be moved is yanked to the spot (a knockback impulse that travels
      // about 1/7 of itself, so it stops on the spot). Two steps later, on the grid, the pile is slammed there.
      // A hooked boss (or a charging enemy) cannot be moved, so it is slammed where it stands.
      const dmg = g.dmg(st.slam);
      for (const t of g.fx.tethersOf(inst.def.id)) {
        const e = t.e;
        t.glow = 1;
        if (e.boss || e.ai.charge > 0) {
          g.fx.strike({ x: e.x, y: e.y, target: e, delay: 2 * STEP_SEC, r: e.r + 30, damage: dmg, kb: 0, color, style: 'ring' });
          continue;
        }
        if (e.launch || e.spawnT > 0) continue;
        e.kbx = (X - e.x) * 6.6; e.kby = (Y - e.y) * 6.6;
        e.stun = Math.max(e.stun, e.elite ? 0.15 : 0.3);
      }
      g.fx.strike({ x: X, y: Y, delay: 2 * STEP_SEC, r: g.area(st.slamR), damage: dmg, kb: 260, stun: 0.3, color, style: 'ring' });
    },
  },
};
