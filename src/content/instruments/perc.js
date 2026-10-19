// PERC channel ("Groove"): hats and shakers. High, light and busy: many small hits between the beats,
// off-beat 8ths first, then 16ths and ghost notes. Step 0 belongs to the kick, so low levels stay off it.

import { rand } from '../../util.js';
import { STEP_SEC, BEAT_SEC, ECHO_STEPS } from '../../config.js';

// Pattern helpers: step s, velocity v, kind k.
const H = (s, v = 1) => ({ s, v, k: 'hat' });
const O = (s, v = 1) => ({ s, v, k: 'open' });
const SH = (s, v = 1) => ({ s, v, k: 'shake' });
const T = (s, v = 1) => ({ s, v, k: 'tamb' });
const N = (s, v = 1) => ({ s, v, k: 'tick' });
const C = (s, v = 1) => ({ s, v, k: 'crash' });
// Repeat a one-bar figure across both bars of a 32-step pattern.
const twice = (notes) => [...notes, ...notes.map((n) => ({ ...n, s: n.s + 16 }))];

// Where to aim: the nearest enemy in range, or the way you are facing.
const aimAt = (g, range) => {
  const p = g.player;
  const e = g.nearest(p.x, p.y, range);
  return e ? Math.atan2(e.y - p.y, e.x - p.x) : g.aim();
};

// ---------------------------------------------------------------------------- Drum Machine Hats (Synth)

// Each level keeps the one before and adds to it.
const HATS_1 = [H(2), H(6), H(10), H(14)];
const HATS_2 = [...HATS_1, H(0, 0.4), H(4, 0.5), H(8, 0.45), H(12, 0.5)];
const HATS_3 = [...HATS_2, O(14, 0.85)];
const HATS_4 = [...HATS_3, H(3, 0.4), H(7, 0.4), H(11, 0.4), H(15, 0.4)];
const HATS_5 = [...HATS_4, H(1, 0.35), H(5, 0.35), H(9, 0.35), H(13, 0.35), O(6, 0.8)];

const hats909 = {
  id: 'hats909',
  name: 'Drum Machine Hats',
  role: 'perc',
  style: 'synth',
  blurb: 'Crisp electronic hi-hats. Every tick fires a fast needle at the nearest enemy.',
  steps: 16,
  levels: [
    { text: 'A crisp tick between every beat. Each tick fires a needle at the nearest enemy.',
      pattern: HATS_1,
      stats: { damage: 30, pierce: 1, speed: 760, range: 380 } },
    { text: 'Adds softer ticks on the beat, so it ticks twice as fast. Twice the needles.',
      pattern: HATS_2,
      stats: { damage: 30, pierce: 1, speed: 780, range: 390 } },
    { text: 'An open hat rings out at the end of each bar and throws a fan of three piercing needles.',
      pattern: HATS_3,
      stats: { damage: 30, pierce: 1, speed: 800, range: 400, openDamage: 19, openPierce: 3 } },
    { text: 'Quiet extra ticks squeeze in between. More needles that fly farther and punch through a second enemy.',
      pattern: HATS_4,
      stats: { damage: 30, pierce: 2, speed: 840, range: 430, openDamage: 22, openPierce: 3 } },
    { text: 'Ticks on every step and a second open hat. A storm of needles that punch through more enemies.',
      pattern: HATS_5,
      stats: { damage: 34, pierce: 3, speed: 880, range: 460, openDamage: 28, openPierce: 4 } },
  ],

  sound(A, t, note, out) {
    const { ctx, v } = A;
    if (note.k === 'open') {
      // Open hat: a longer noise hiss plus a metallic shimmer of squares at clashing ratios.
      v.noise(ctx, out, t, { dur: 0.004, d: 0.34, r: 0.04, gain: 0.24 * note.v, filter: { type: 'highpass', freq: 7200, q: 0.9 } });
      for (const f of [317, 465, 634]) {
        v.tone(ctx, out, t, { freq: f, wave: 'square', dur: 0.004, d: 0.22, s: 0, r: 0.03, gain: 0.05 * note.v, filter: { type: 'highpass', freq: 8200, q: 1.2 } });
      }
    } else {
      // Closed hat: a short burst of bright bandpassed noise. Softer ticks are also shorter.
      v.noise(ctx, out, t, { dur: 0.003, d: 0.13 + 0.15 * note.v, r: 0.02, gain: 0.56 * note.v, filter: { type: 'bandpass', freq: 9500, q: 0.55 } });
    }
  },

  fire(g, note, st) {
    const p = g.player;
    const color = g.color('perc');
    const base = aimAt(g, st.range);
    if (note.k === 'open') {
      const n = g.amount(3);
      for (let i = 0; i < n; i++) {
        g.fx.bullet({ x: p.x, y: p.y, angle: base + (i - (n - 1) / 2) * 0.2, speed: g.speed(st.speed) * 0.9, r: 4, life: 0.5,
          damage: g.dmg(st.openDamage) * note.v, pierce: st.openPierce, kb: 30, color, shape: 'shard', trail: true });
      }
    } else {
      const n = g.amount(1);
      for (let i = 0; i < n; i++) {
        g.fx.bullet({ x: p.x, y: p.y, angle: base + rand(-0.07, 0.07) + (i - (n - 1) / 2) * 0.14, speed: g.speed(st.speed), r: 3, life: 0.42,
          damage: g.dmg(st.damage) * note.v, pierce: st.pierce, kb: 12, color, shape: 'shard' });
      }
    }
  },

  remix: {
    id: 'pingponghats', name: 'Ping-Pong Hats', pedal: 'delay',
    text: 'Every needle bounces back on the delay: a dotted eighth later, a second needle flies at the nearest enemy behind you.',
    stats: { pong: 0.7 },
    fire(g, note, st, inst) {
      this.fire(g, note, st, inst);
      if (g.dmgScale !== 1) return;   // an echo does not bounce again
      const ahead = aimAt(g, st.range);
      g.later.push({ at: g.time + ECHO_STEPS * STEP_SEC, fn: () => {
        if (!g.loadout.has(inst)) return;
        const prev = g.src; g.src = inst;
        pong(g, note, st, ahead);
        g.src = prev;
      } });
    },
  },
};

// Ping-Pong Hats: the bounce flies at the nearest enemy behind you (away from where the first needle
// went), or at the nearest enemy anywhere when nobody is behind you.
function pong(g, note, st, ahead) {
  const p = g.player;
  const open = note.k === 'open';
  const ax = Math.cos(ahead), ay = Math.sin(ahead), r2 = st.range * st.range;
  let behind = null, bd = r2;
  g.grid.query(p.x, p.y, st.range, (e) => {
    if (e.dead || e.spawnT > 0.2) return;
    const dx = e.x - p.x, dy = e.y - p.y, d = dx * dx + dy * dy;
    if (d < bd && dx * ax + dy * ay < 0) { bd = d; behind = e; }
  });
  const e = behind || g.nearest(p.x, p.y, st.range);
  const a = e ? Math.atan2(e.y - p.y, e.x - p.x) : ahead + Math.PI;
  const n = g.amount(open ? 3 : 1);
  for (let i = 0; i < n; i++) {
    g.fx.bullet({ x: p.x, y: p.y, angle: a + (i - (n - 1) / 2) * (open ? 0.2 : 0.14), speed: g.speed(st.speed) * (open ? 0.9 : 1), r: open ? 4 : 3,
      life: open ? 0.5 : 0.42, damage: g.dmg(open ? st.openDamage : st.damage) * note.v * st.pong, pierce: open ? st.openPierce : st.pierce,
      kb: open ? 30 : 12, color: g.color('perc'), shape: 'shard', trail: open });
  }
}

// ---------------------------------------------------------------------------- Shaker (Live)

// Velocity gives the swing: strong on the "and", lighter after it, lightest on the "e".
const SHAKE_1 = [SH(2), SH(6, 0.75), SH(10), SH(14, 0.75)];
const SHAKE_2 = [...SHAKE_1, SH(3, 0.45), SH(7, 0.45), SH(11, 0.45), SH(15, 0.45)];
const SHAKE_3 = [...SHAKE_2, T(4), T(12)];
const SHAKE_4 = [...SHAKE_3, SH(1, 0.35), SH(5, 0.35), SH(9, 0.35), SH(13, 0.35)];
const SHAKE_5 = [...SHAKE_4, SH(0, 0.55), SH(4, 0.6), SH(8, 0.55), SH(12, 0.6)];

const shaker = {
  id: 'shaker',
  name: 'Shaker',
  role: 'perc',
  style: 'organic',
  blurb: 'A hand shaker. Seeds circle you and flash on every shake, hitting anything close.',
  steps: 16,
  levels: [
    { text: 'Shakes between the beats. Three seeds circle you. Soft shakes flash one, loud shakes flash all.',
      pattern: SHAKE_1,
      stats: { seeds: 3, orbit: 150, radius: 84, damage: 32 } },
    { text: 'A quick extra shake after each one, and a fourth seed.',
      pattern: SHAKE_2,
      stats: { seeds: 4, orbit: 155, radius: 88, damage: 36 } },
    { text: 'A tambourine on beats 2 and 4. Every seed bursts wide and shoves enemies back.',
      pattern: SHAKE_3,
      stats: { seeds: 4, orbit: 160, radius: 91, damage: 38, tambDamage: 43, tambRadius: 66, tambKb: 150 } },
    { text: 'The shaker fills the gaps. Five seeds with bigger flashes.',
      pattern: SHAKE_4,
      stats: { seeds: 5, orbit: 165, radius: 96, damage: 40, tambDamage: 50, tambRadius: 72, tambKb: 170 } },
    { text: 'Nonstop shaking with six seeds. Tambourine bursts now stun.',
      pattern: SHAKE_5,
      stats: { seeds: 6, orbit: 175, radius: 107, damage: 49, tambDamage: 60, tambRadius: 78, tambKb: 190, tambStun: 0.3 } },
  ],

  sound(A, t, note, out) {
    const { ctx, v } = A;
    if (note.k === 'tamb') {
      // Tambourine: a bright slap of noise plus a short metallic jingle.
      v.noise(ctx, out, t, { dur: 0.004, d: 0.14, r: 0.03, gain: 0.26 * note.v, filter: { type: 'highpass', freq: 5200, q: 0.9 } });
      v.fm(ctx, out, t, { freq: 4700, ratio: 3.41, index: 1.6, indexDecay: 0.06, d: 0.1, s: 0, r: 0.03, dur: 0.02, gain: 0.06 * note.v });
      v.fm(ctx, out, t + 0.012, { freq: 6100, ratio: 2.83, index: 1.3, indexDecay: 0.05, d: 0.08, s: 0, r: 0.03, dur: 0.02, gain: 0.045 * note.v });
    } else {
      // Shaker: bandpassed noise with a slightly soft attack, so it swishes instead of clicks.
      v.noise(ctx, out, t, { a: 0.012, dur: 0.08, d: 0.06, s: 0.4, r: 0.07, gain: 0.6 * note.v, filter: { type: 'bandpass', freq: 7000, q: 1.1 } });
    }
  },

  setup(g, st, inst) {
    inst.state.orbit = g.fx.orbit(inst, { count: g.amount(st.seeds), radius: st.orbit, speed: 2.6, size: 5, color: g.color(inst), shape: 'seed' });
  },

  fire(g, note, st, inst) {
    const grp = inst.state.orbit;
    if (!grp || !grp.items.length) return;
    const color = g.color(inst);
    if (note.k === 'tamb') {
      grp.pulse({ damage: g.dmg(st.tambDamage) * note.v, r: g.area(st.tambRadius), kb: st.tambKb, stun: st.tambStun || 0, color });
      g.shake = Math.max(g.shake, 1.2);
    } else if (note.v >= 0.9) {
      // Accented shake: every seed flashes at once.
      grp.pulse({ damage: g.dmg(st.damage) * note.v, r: g.area(st.radius), kb: 12, color });
    } else {
      // Soft shake: the next seed in line flashes.
      inst.state.i = ((inst.state.i || 0) + 1) % grp.items.length;
      grp.pulse({ damage: g.dmg(st.damage) * note.v, r: g.area(st.radius), kb: 8, color, index: inst.state.i });
    }
  },

  remix: {
    id: 'rainstick', name: 'Rainstick', pedal: 'reverb',
    text: 'Tambourine hits swing the seeds out to twice their orbit and back over one beat. While they swing, every shake flashes them all.',
    stats: { swing: 1.1 },
    // The swing runs on game time from the tambourine note, so it lands back on the next beat.
    update(g, dt, st, inst) {
      const S = inst.state;
      if (!(S.swingT > 0) || !S.orbit) return;
      S.swingT = Math.max(0, S.swingT - dt);
      S.orbit.radius = st.orbit * (1 + st.swing * Math.sin(Math.PI * (1 - S.swingT / BEAT_SEC)));
    },
    fire(g, note, st, inst) {
      const S = inst.state;
      if (note.k === 'tamb') S.swingT = BEAT_SEC;
      else if (S.swingT > 0 && S.orbit?.items.length) {
        S.orbit.pulse({ damage: g.dmg(st.damage) * note.v, r: g.area(st.radius), kb: 20, color: g.color(inst) });
        return;
      }
      this.fire(g, note, st, inst);
    },
  },
};

// ---------------------------------------------------------------------------- Noise Hats (8-Bit)

// Two-bar pattern so the crash can land on every other downbeat.
const TICK_1 = twice([N(2), N(6), N(10), N(14)]);
const TICK_2 = [...TICK_1, ...twice([N(5, 0.55), N(13, 0.55)])];
const TICK_3 = [...TICK_2, ...twice([N(4, 0.5), N(8, 0.45), N(12, 0.5)])];
const TICK_4 = [...TICK_3, C(0)];
const TICK_5 = [...TICK_4, ...twice([N(3, 0.4), N(7, 0.4), N(11, 0.4), N(15, 0.45)])];

const chiphat = {
  id: 'chiphat',
  name: 'Noise Hats',
  role: 'perc',
  style: 'chip',
  blurb: 'Crunchy console hi-hats that tick like an old game. Every tick throws lightning that jumps between enemies.',
  steps: 32,
  levels: [
    { text: 'A tick between every beat. Each one zaps the nearest enemy, then jumps to a second.',
      pattern: TICK_1,
      stats: { damage: 24, chain: 2, range: 300, chainRange: 140 } },
    { text: 'Adds a quick double tick. Bolts now reach three enemies.',
      pattern: TICK_2,
      stats: { damage: 24, chain: 3, range: 310, chainRange: 145 } },
    { text: 'Soft ticks join on the beat. Bolts hit harder.',
      pattern: TICK_3,
      stats: { damage: 25, chain: 3, range: 320, chainRange: 150 } },
    { text: 'A long crash of static every other bar sends a huge, stunning bolt through the crowd. Bolts reach four enemies.',
      pattern: TICK_4,
      stats: { damage: 27, chain: 4, range: 330, chainRange: 155, crashDamage: 48, crashChain: 6 } },
    { text: 'Fast rattling ticks in between. Bolts reach five enemies.',
      pattern: TICK_5,
      stats: { damage: 28, chain: 5, range: 340, chainRange: 160, crashDamage: 60, crashChain: 8 } },
  ],

  sound(A, t, note, out) {
    const { ctx, v } = A;
    if (note.k === 'crash') {
      // A long burst of coarse console noise.
      v.noise(ctx, out, t, { dur: 0.01, d: 0.55, r: 0.08, gain: 0.3 * note.v, chip: 2, filter: { type: 'highpass', freq: 4800, q: 0.7 } });
    } else {
      // Tick: stepped noise, finer for loud ticks and grainier for soft ones.
      const chip = note.v > 0.8 ? 1 : note.v > 0.45 ? 2 : 3;
      v.noise(ctx, out, t, { dur: 0.003, d: 0.1 + 0.06 * note.v, r: 0.02, gain: 0.4 * note.v, chip, filter: { type: 'highpass', freq: 6800, q: 0.8 } });
    }
  },

  fire(g, note, st) { bolt(g, note, st, null); },

  remix: {
    id: 'shortcircuit', name: 'Short Circuit', pedal: 'bitcrusher',
    text: 'Bolts fork: every enemy a bolt strikes arcs a spark to its nearest neighbor.',
    stats: { fork: 0.5, forkReach: 0.8 },
    fire(g, note, st) {
      struck.length = 0;
      bolt(g, note, st, strike);
      const dmg = g.dmg(note.k === 'crash' ? st.crashDamage : st.damage) * note.v * st.fork;
      const reach = g.area(st.chainRange) * st.forkReach;
      seen.clear();
      for (const e of struck) seen.add(e);
      for (const e of struck) {
        const t = g.nearest(e.x, e.y, reach, seen);
        if (!t) continue;
        seen.add(t);
        g.fx.zap({ x: e.x, y: e.y, target: t, chain: 1, damage: dmg, color: g.color('perc'), width: 1.5, life: 0.14 });
      }
    },
  },
};

// One tick's bolt (a crash's is bigger and stuns). onHit(enemy) sees every enemy it strikes.
function bolt(g, note, st, onHit) {
  const p = g.player;
  const color = g.color('perc');
  if (note.k === 'crash') {
    g.fx.zap({ x: p.x, y: p.y, range: st.range * 1.3, chain: g.amount(st.chain + st.crashChain), chainRange: g.area(st.chainRange) * 1.2,
      damage: g.dmg(st.crashDamage) * note.v, falloff: 0.92, color, width: 4, stun: 0.2, onHit });
    g.fx.flash(p.x, p.y, 40, color, 0.2, 0.25);
  } else {
    g.fx.zap({ x: p.x, y: p.y, range: st.range, chain: g.amount(st.chain), chainRange: g.area(st.chainRange),
      damage: g.dmg(st.damage) * note.v, falloff: 0.85, color, onHit });
  }
}

// Short Circuit scratch, reused so a note allocates nothing: who the bolt struck, and who is hit already.
const struck = [];
const seen = new Set();
const strike = (e) => { struck.push(e); };

export default [hats909, shaker, chiphat];
