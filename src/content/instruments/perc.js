// PERC channel ("Groove"): hats and shakers. High, light and busy: many small hits between the beats,
// off-beat 8ths first, then 16ths and ghost notes. Step 0 belongs to the kick, so low levels stay off it.

import { rand, clamp } from '../../util.js';

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

// Angle to the nearest enemy within `half` radians of `angle` (a side of you), else `angle` itself.
function aimArc(g, angle, half, range) {
  const p = g.player, ax = Math.cos(angle), ay = Math.sin(angle), c = Math.cos(half);
  let best = null, bd = range * range;
  g.grid.query(p.x, p.y, range, (e) => {
    if (e.dead || e.spawnT > 0.2) return;
    const dx = e.x - p.x, dy = e.y - p.y, d = dx * dx + dy * dy;
    if (d < bd && dx * ax + dy * ay >= c * Math.sqrt(d)) { bd = d; best = e; }
  });
  return best ? Math.atan2(best.y - p.y, best.x - p.x) : angle;
}

// ---------------------------------------------------------------------------- Drum Machine Hats (Synth)

// Each level keeps the one before and adds to it.
const HATS_1 = [H(2), H(6), H(10), H(14)];
const HATS_2 = [...HATS_1, H(0, 0.4), H(4, 0.5), H(8, 0.45), H(12, 0.5)];
const HATS_3 = [...HATS_2, O(14, 0.85)];
const HATS_4 = [...HATS_3, H(3, 0.4), H(7, 0.4), H(11, 0.4), H(15, 0.4)];
const HATS_5 = [...HATS_4, H(1, 0.35), H(5, 0.35), H(9, 0.35), H(13, 0.35), O(6, 0.8)];

// Ping-Pong Hats: 16ths with accents grouped 3-3-2 (steps 0, 3, 6 and 8, 11, 14), the open hats on the "2"s.
const PING = [H(0), H(1, 0.35), H(2, 0.4), H(3), H(4, 0.4), H(5, 0.35), O(6, 0.95), H(7, 0.4),
  H(8), H(9, 0.35), H(10, 0.45), H(11), H(12, 0.4), H(13, 0.35), O(14, 0.95), H(15, 0.45)];
// Where each step sits in the stereo field: the accents alternate hard left and right, the ghosts half as far.
const PING_PAN = [-0.9, 0.45, -0.45, 0.9, -0.45, 0.45, -0.9, 0.45, 0.9, -0.45, 0.45, -0.9, 0.45, -0.45, 0.9, -0.45];

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

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    // Ping-Pong Hats (remix): every hat is thrown hard left or right, the 3-3-2 accents trading sides.
    const pan = inst?.remix ? PING_PAN[note.s & 15] : 0;
    if (note.k === 'open') {
      // Open hat: a longer noise hiss plus a metallic shimmer of squares at clashing ratios.
      v.noise(ctx, out, t, { dur: 0.004, d: 0.34, r: 0.04, gain: 0.24 * note.v, pan, filter: { type: 'highpass', freq: 7200, q: 0.9 } });
      for (const f of [317, 465, 634]) {
        v.tone(ctx, out, t, { freq: f, wave: 'square', dur: 0.004, d: 0.22, s: 0, r: 0.03, gain: 0.05 * note.v, pan, filter: { type: 'highpass', freq: 8200, q: 1.2 } });
      }
    } else if (inst?.remix) {
      // A tighter, glassier closed hat, and a metal ping on the accents.
      v.noise(ctx, out, t, { dur: 0.003, d: 0.11 + 0.15 * note.v, r: 0.02, gain: 0.95 * note.v, pan, filter: { type: 'bandpass', freq: 10500, q: 0.7 } });
      if (note.v >= 0.9) v.tone(ctx, out, t, { freq: 589, wave: 'square', dur: 0.003, d: 0.07, s: 0, r: 0.02, gain: 0.06, pan, filter: { type: 'highpass', freq: 7600, q: 2 } });
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

  // The hats go 3-3-2 across the bar and bounce between the speakers, and the needles bounce with them: they
  // fly alternately ahead of you and behind you (at the nearest enemy on that side), and every accent fires
  // both ways at once with needles that ricochet on to new enemies.
  remix: {
    id: 'pingponghats', name: 'Ping-Pong Hats', pedal: 'delay',
    text: 'Needles fly ahead of you and behind you in turn, and accents ricochet both ways.',
    sound: 'sixteenth hats in 3-3-2 accents, thrown hard left and right.',
    pattern: PING,
    stats: { pierce: 4, accentDamage: 38, pingBounce: 2 },
    fire(g, note, st) {
      const face = g.aim();
      const ahead = aimArc(g, face, 1.3, st.range), behind = aimArc(g, face + Math.PI, 1.3, st.range);
      if (note.k === 'open') {
        for (const a of [ahead, behind]) needles(g, a, g.amount(3), 0.2, { speed: 0.9, r: 4, life: 0.5, damage: g.dmg(st.openDamage) * note.v, pierce: st.openPierce, kb: 30, trail: true }, st);
      } else if (note.v >= 0.9) {
        for (const a of [ahead, behind]) needles(g, a, g.amount(1), 0.14, { r: 3.5, life: 0.5, damage: g.dmg(st.accentDamage) * note.v, pierce: st.pierce, bounce: st.pingBounce, kb: 16, trail: true }, st);
      } else {
        needles(g, note.s & 1 ? behind : ahead, g.amount(1), 0.14, { r: 3, life: 0.42, damage: g.dmg(st.damage) * note.v, pierce: st.pierce, kb: 12 }, st);
      }
    },
  },
};

// A fan of n hat needles centered on angle a, `gap` radians apart. o: speed (share of st.speed), r, life, damage,
// pierce, bounce, kb, trail.
function needles(g, a, n, gap, o, st) {
  const p = g.player, color = g.color('perc');
  for (let i = 0; i < n; i++) {
    g.fx.bullet({ x: p.x, y: p.y, angle: a + rand(-0.05, 0.05) + (i - (n - 1) / 2) * gap, speed: g.speed(st.speed) * (o.speed ?? 1), r: o.r,
      life: o.life, damage: o.damage, pierce: o.pierce, bounce: o.bounce || 0, kb: o.kb, color, shape: 'shard', trail: !!o.trail });
  }
}

// ---------------------------------------------------------------------------- Shaker (Live)

// Velocity gives the swing: strong on the "and", lighter after it, lightest on the "e".
const SHAKE_1 = [SH(2), SH(6, 0.75), SH(10), SH(14, 0.75)];
const SHAKE_2 = [...SHAKE_1, SH(3, 0.45), SH(7, 0.45), SH(11, 0.45), SH(15, 0.45)];
const SHAKE_3 = [...SHAKE_2, T(4), T(12)];
const SHAKE_4 = [...SHAKE_3, SH(1, 0.35), SH(5, 0.35), SH(9, 0.35), SH(13, 0.35)];
const SHAKE_5 = [...SHAKE_4, SH(0, 0.55), SH(4, 0.6), SH(8, 0.55), SH(12, 0.6)];
// Rainstick: a shake on every 16th swelling from a whisper to full across the bar, the tambourine on 2 and 4.
const RAIN = [...Array.from({ length: 16 }, (_, i) => SH(i, Math.round((0.3 + (0.7 * i) / 15) * 100) / 100)), T(4), T(12)];

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

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    if (inst?.remix && note.k === 'shake') {
      // Rainstick (remix): pebbles pouring through a tube, three tiny clicks spread across the 16th over a soft
      // hiss, pitched by where the step sits so the cascade never repeats within the bar.
      v.noise(ctx, out, t, { a: 0.01, dur: 0.07, d: 0.05, s: 0.35, r: 0.06, gain: 0.5 * note.v, filter: { type: 'bandpass', freq: 6200, q: 1.2 } });
      for (let i = 0; i < 3; i++) {
        const f = 5200 + ((note.s * 7 + i * 5) % 11) * 420;
        v.noise(ctx, out, t + i * 0.037, { dur: 0.002, d: 0.025, gain: 0.55 * note.v * (1 - 0.2 * i), filter: { type: 'bandpass', freq: f, q: 3 } });
      }
      return;
    }
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

  // A rain roll that swells across every bar, and seeds that follow your speed: standing still they close in
  // and spin fast (a shield), running they swing far out (a sweep). At the top of each swell every seed drops
  // a raindrop on what it is passing over.
  remix: {
    id: 'rainstick', name: 'Rainstick', pedal: 'reverb',
    text: 'Seeds hug you when you stand and swing wide when you run, and rain down at every swell.',
    sound: 'a rainstick pouring a 16th roll that swells across every bar.',
    pattern: RAIN,
    stats: { still: 0.7, run: 1.5, rainDamage: 72, rainRadius: 70, rainReach: 170 },
    // The orbit follows your speed (eased, so it breathes rather than jumps).
    update(g, dt, st, inst) {
      const S = inst.state, grp = S.orbit;
      if (!grp) return;
      const f = clamp(g.player.speedNow / Math.max(1, g.stats.speed), 0, 1);
      S.spread = (S.spread ?? f) + (f - (S.spread ?? f)) * Math.min(1, dt * 5);
      grp.radius = st.orbit * (st.still + (st.run - st.still) * S.spread);
      grp.speed = 2.6 * (1.8 - 0.9 * S.spread);
    },
    fire(g, note, st, inst) {
      const grp = inst.state.orbit;
      if (note.k !== 'shake' || note.v < 0.85 || !grp?.items.length) { this.fire(g, note, st, inst); return; }
      // The crest of the swell: every seed drops a raindrop on a boss under it, else on the closest enemy under
      // it, else where it is.
      const color = g.color(inst), reach = g.area(st.rainReach);
      for (const it of grp.items) {
        it.glow = 1;
        const e = g.bossInRange(it.x, it.y, reach) || g.nearest(it.x, it.y, reach);
        g.fx.strike({ x: e ? e.x : it.x, y: e ? e.y : it.y, target: e, delay: 0.1, r: g.area(st.rainRadius), damage: g.dmg(st.rainDamage) * note.v, kb: 60, color, style: 'drop' });
      }
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

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    const rx = !!inst?.remix;
    if (note.k === 'crash') {
      // A long burst of coarse console noise (coarser still in the remix, with a falling zap under it).
      v.noise(ctx, out, t, { dur: 0.01, d: 0.55, r: 0.08, gain: 0.3 * note.v, chip: rx ? 4 : 2, filter: { type: 'highpass', freq: 4800, q: 0.7 } });
      if (rx) v.tone(ctx, out, t, { freq: 1100, duty: 0.125, dur: 0.02, d: 0.16, s: 0, r: 0.02, gain: 0.07 * note.v, pitchEnv: { from: 3, time: 0.14 }, filter: { type: 'highpass', freq: 3800 } });
    } else if (rx && note.v >= 0.5) {
      // Short Circuit (remix): the louder ticks buzz, a clipped pulse sputtering under the noise as the wires fire.
      v.noise(ctx, out, t, { dur: 0.003, d: 0.12, r: 0.02, gain: 0.34 * note.v, chip: 1, filter: { type: 'highpass', freq: 6800, q: 0.8 } });
      for (let i = 0; i < 3; i++) {
        v.tone(ctx, out, t + i * 0.021, { freq: 1480, duty: 0.125, dur: 0.008, d: 0.018, s: 0, gain: 0.06 * note.v, filter: { type: 'highpass', freq: 4200 } });
      }
    } else {
      // Tick: stepped noise, finer for loud ticks and grainier for soft ones.
      const chip = note.v > 0.8 ? 1 : note.v > 0.45 ? 2 : 3;
      v.noise(ctx, out, t, { dur: 0.003, d: 0.1 + 0.06 * note.v, r: 0.02, gain: 0.4 * note.v, chip, filter: { type: 'highpass', freq: 6800, q: 0.8 } });
    }
  },

  fire(g, note, st) { bolt(g, note, st, null); },

  // The crash now comes every bar and hooks live wires onto the enemies its bolt strikes (a wire whose enemy
  // goes down jumps to the next). Every louder tick fires the wires: each one zaps everything on the line
  // between you and its enemy, so moving swings the wires through the crowd.
  remix: {
    id: 'shortcircuit', name: 'Short Circuit', pedal: 'bitcrusher',
    text: 'Every crash hooks live wires to the crowd, and they zap everything they cross.',
    sound: 'a crash of static on every bar, and ticks that buzz.',
    pattern: [...TICK_5, C(16, 0.9)],
    stats: { wires: 8, wireLife: 2.4, wirePull: 30, wireDamage: 17 },
    fire(g, note, st, inst) {
      const id = inst.def.id, color = g.color('perc'), p = g.player;
      const hook = (e) => g.fx.tether(id, e, { life: st.wireLife, pull: st.wirePull, color });
      if (note.k === 'crash') {
        struck.length = 0;
        bolt(g, note, st, strike);
        if (g.dmgScale !== 1) return;   // an echo does not hook
        // The wires hook the enemies the crash struck that are still standing.
        for (let i = 0, n = 0; i < struck.length && n < st.wires; i++) if (!struck[i].dead) { hook(struck[i]); n++; }
        return;
      }
      bolt(g, note, st, null);
      if (note.v < 0.5) return;
      const wires = g.fx.tethersOf(id);
      // A wire whose enemy went down jumps on: each louder tick hooks the nearest free enemy, up to the most wires.
      if (g.dmgScale === 1 && wires.length < st.wires) {
        hooked.clear();
        for (const t of wires) hooked.add(t.e);
        const e = g.nearest(p.x, p.y, st.range, hooked);
        if (e) wires.push(hook(e));
      }
      for (const t of wires) {
        const e = t.e, dx = e.x - p.x, dy = e.y - p.y;
        t.glow = 1;
        g.fx.beam({ x: p.x, y: p.y, angle: Math.atan2(dy, dx), length: Math.hypot(dx, dy) + e.r, width: 12,
          damage: g.dmg(st.wireDamage) * note.v, kb: 30, color, life: 0.12 });
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

// Short Circuit scratch, reused so a note allocates nothing: who the crash's bolt struck, who is hooked.
const struck = [];
const hooked = new Set();
const strike = (e) => { struck.push(e); };

export default [hats909, shaker, chiphat];
