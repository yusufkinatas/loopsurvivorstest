// BEAT channel: kicks and snares. The reference implementation for the instrument format
// (see docs/INSTRUMENTS.md). Low, heavy, on the beat: big area hits around the player.

import { TAU } from '../../util.js';
import { BAR_SEC } from '../../config.js';

// Pattern helpers: step s (0..15), velocity v, kind k.
const K = (s, v = 1) => ({ s, v, k: 'kick' });
const S = (s, v = 1) => ({ s, v, k: 'snare' });
const R = (s, v = 1) => ({ s, v, k: 'rim' });
// Remix sounds: the 808's long sub boom, the taiko ensemble's big odaiko and small shime, the kit's glitch blip.
const B = (s, v = 1) => ({ s, v, k: 'boom', d: 8 });
const D = (s, v = 1) => ({ s, v, k: 'odaiko', d: 8 });
const T = (s, v = 1) => ({ s, v, k: 'shime' });
const G = (s, v = 1) => ({ s, v, k: 'glitch' });

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

// ---------------------------------------------------------------------------- 808 Kick (Synth)

const kick808 = {
  id: 'kick808',
  name: '808 Kick',
  role: 'beat',
  style: 'synth',
  blurb: 'Deep electronic kicks. Each one sends a shockwave rolling out from you.',
  steps: 16,
  levels: [
    { text: 'Kicks on beats 1 and 3. Each kick sends out a shockwave.',
      pattern: [K(0), K(8)],
      stats: { damage: 14, radius: 150, kb: 150 } },
    { text: 'Four on the floor: a kick on every beat.',
      pattern: [K(0), K(4), K(8), K(12)],
      stats: { damage: 15, radius: 165, kb: 150 } },
    { text: 'Adds a clap on the backbeat that throws a ring of shards.',
      pattern: [K(0), K(4), K(8), K(12), S(4), S(12)],
      stats: { damage: 17, radius: 190, kb: 160, shards: 6, shardDamage: 10 } },
    { text: 'A pickup kick before every bar. Bigger shockwaves, more shards.',
      pattern: [K(0), K(4), K(8), K(12), K(14, 0.7), S(4), S(12)],
      stats: { damage: 21, radius: 225, kb: 170, shards: 8, shardDamage: 12 } },
    { text: 'Full groove. Shockwaves now stun what they hit.',
      pattern: [K(0), K(4), K(7, 0.6), K(8), K(12), K(14, 0.7), S(4), S(12), S(15, 0.5)],
      stats: { damage: 26, radius: 258, kb: 180, shards: 10, shardDamage: 14, stun: 0.25 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    const rx = !!inst?.remix;
    if (note.k === 'boom') {
      // Sidechain 808 (remix): a long sub boom that dives in pitch with a driven tail, and the band drops out of its way.
      v.kick(ctx, out, t, { f0: 210, f1: 39, pitchDecay: 0.15, decay: 0.95, gain: 0.62 * note.v, click: 0.22 });
      v.tone(ctx, out, t, { freq: 41, wave: 'sine', dur: Math.min(0.8, note.dur), a: 0.004, d: 0.45, s: 0.35, r: 0.25, gain: 0.2 * note.v,
        drive: 2.5, pitchEnv: { from: 2.4, time: 0.15 } });
      A.duck(t, 0.75 * note.v, 0.5);
    } else if (note.k === 'kick') {
      v.kick(ctx, out, t, { f0: 150, f1: 44, pitchDecay: 0.075, decay: 0.42 + 0.1 * note.v, gain: 0.8 * note.v, click: rx ? 0.22 : 0.15 });
      // Sidechain 808 (remix): every kick ducks the band deep, so the whole mix pumps.
      A.duck(t, (rx ? 0.6 : 0.42) * note.v, rx ? 0.3 : 0.22);
    } else {
      // Clap: three quick noise bursts through a band-pass.
      for (let i = 0; i < 3; i++) {
        v.noise(ctx, out, t + i * 0.011, { dur: 0.003, d: i === 2 ? 0.16 : 0.02, gain: 0.42 * note.v, filter: { type: 'bandpass', freq: 1500, q: 1.1 } });
      }
    }
  },

  fire(g, note, st) {
    const p = g.player;
    const color = g.color('beat');
    if (note.k === 'kick') {
      // Sidechain 808 (remix, st.kickErase): every kick's shockwave wipes out the enemy shots it passes.
      const erase = st.kickErase || 0;
      g.fx.ring({ x: p.x, y: p.y, follow: true, r0: 16, r1: g.area(st.radius) * (0.75 + 0.25 * note.v), dur: 0.26,
        damage: g.dmg(st.damage) * note.v, kb: st.kb, stun: st.stun || 0, color, width: erase ? 10 : 7, erase });
      g.shake = Math.max(g.shake, 2.5 * note.v);
    } else {
      const n = g.amount(st.shards);
      const off = note.s * 0.37;
      for (let i = 0; i < n; i++) {
        g.fx.bullet({ x: p.x, y: p.y, angle: off + (i / n) * Math.PI * 2, speed: g.speed(420), r: 5, life: 0.42,
          damage: g.dmg(st.shardDamage) * note.v, pierce: 1, kb: 50, color, shape: 'shard', drag: 1.5 });
      }
    }
  },

  // The downbeat becomes a long sub boom: a slow, wide shockwave that drags everything it passes in toward you,
  // stuns it and wipes out every shot, and ducks it for the bar (it takes more from every hit, the way the band
  // ducks under the kick), for the kicks that follow to throw back out. Every kick erases the shots it passes,
  // so you can step into a bullet pattern on the beat.
  remix: {
    id: 'sidechain808', name: 'Sidechain 808', pedal: 'compressor',
    text: 'The downbeat boom drags the crowd in and ducks it, and every kick erases enemy shots.',
    sound: 'a long sub boom on the downbeat, a ghost kick, and the whole band pumping on every kick.',
    // The clap comes first, so fills and rolls play claps.
    pattern: [S(4), S(12), S(15, 0.5), B(0), K(4), K(7, 0.6), K(8), K(10, 0.5), K(12), K(14, 0.7)],
    stats: { radius: 280, shards: 12, shardDamage: 16, kickErase: 0.7, boomDamage: 72, boomReach: 2, boomPull: 260, boomStun: 0.6, duck: 0.25 },
    fire(g, note, st, inst) {
      if (note.k !== 'boom') { this.fire(g, note, st, inst); return; }
      const p = g.player, R = g.area(st.radius) * st.boomReach, until = g.time + BAR_SEC;
      for (const e of g.inRadius(p.x, p.y, R)) {
        if (e.vulnUntil > g.time && e.vuln > st.duck) continue;   // a deeper mark (Lullaby) stays
        e.vuln = st.duck; e.vulnUntil = until;
      }
      g.fx.ring({ x: p.x, y: p.y, follow: true, r0: 24, r1: R, dur: 0.5,
        damage: g.dmg(st.boomDamage) * note.v, kb: -st.boomPull, stun: st.boomStun, color: g.color('beat'), width: 18, erase: 1 });
      g.shake = Math.max(g.shake, 6 * note.v);
    },
  },
};

// ---------------------------------------------------------------------------- Taiko (Live)

const taiko = {
  id: 'taiko',
  name: 'Taiko Drums',
  role: 'beat',
  style: 'organic',
  blurb: 'Huge hand drums. Every hit slams down on the thickest crowd and stuns it.',
  steps: 16,
  levels: [
    { text: 'Two booming hits per bar, each landing on the biggest crowd.',
      pattern: [K(0), K(8, 0.85)],
      stats: { damage: 10, radius: 66, stun: 0.35, kb: 60 } },
    { text: 'Adds a third hit that answers the second.',
      pattern: [K(0), K(8, 0.85), K(10, 0.7)],
      stats: { damage: 11, radius: 70, stun: 0.4, kb: 60 } },
    { text: 'Rim clicks on the backbeat push enemies away from you.',
      pattern: [K(0), K(8, 0.85), K(10, 0.7), R(4), R(12)],
      stats: { damage: 12, radius: 75, stun: 0.45, kb: 70, rimRadius: 90, rimDamage: 9 } },
    { text: 'A fourth hit closes each bar. Bigger impacts.',
      pattern: [K(0), K(8, 0.85), K(10, 0.7), K(14, 0.75), R(4), R(12)],
      stats: { damage: 14, radius: 86, stun: 0.5, kb: 80, rimRadius: 100, rimDamage: 11 } },
    { text: 'Thunder: every hit also strikes a second crowd.',
      pattern: [K(0), K(3, 0.55), K(8, 0.85), K(10, 0.7), K(14, 0.75), R(4), R(12)],
      stats: { damage: 17, radius: 94, stun: 0.6, kb: 90, rimRadius: 110, rimDamage: 13, extra: 1 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    if (note.k === 'odaiko') {
      // Thunder Hall (remix): the great drum. A deep skin that rings for a second, and a soft boom of air.
      v.tone(ctx, out, t, { freq: 46, wave: 'sine', dur: 0.06, d: 0.8, s: 0, r: 0.15, gain: 0.62 * note.v, pitchEnv: { from: 1.9, time: 0.09 } });
      v.tone(ctx, out, t, { freq: 92, wave: 'triangle', dur: 0.03, d: 0.4, s: 0, gain: 0.26 * note.v, pitchEnv: { from: 1.5, time: 0.06 } });
      v.noise(ctx, out, t, { dur: 0.01, a: 0.004, d: 0.3, gain: 0.34 * note.v, filter: { type: 'lowpass', freq: 520 } });
      A.duck(t, 0.5 * note.v, 0.4);
    } else if (note.k === 'shime') {
      // Thunder Hall (remix): the small, tight shime drum rolling into the next bar.
      v.tone(ctx, out, t, { freq: 240, wave: 'triangle', dur: 0.01, d: 0.09, s: 0, gain: 0.3 * note.v, pitchEnv: { from: 1.4, time: 0.02 } });
      v.noise(ctx, out, t, { dur: 0.003, d: 0.05, gain: 0.2 * note.v, filter: { type: 'bandpass', freq: 1300, q: 1.2 } });
    } else if (note.k === 'kick') {
      // In the hall (remix) the drums are bigger: lower and longer.
      const rx = !!inst?.remix;
      v.tone(ctx, out, t, { freq: rx ? 57 : 62, wave: 'sine', dur: 0.05, d: rx ? 0.65 : 0.55, s: 0, r: 0.1, gain: 0.9 * note.v, pitchEnv: { from: 2.1, time: 0.06 } });
      v.tone(ctx, out, t, { freq: rx ? 110 : 124, wave: 'triangle', dur: 0.02, d: 0.18, s: 0, gain: 0.25 * note.v, pitchEnv: { from: 1.6, time: 0.04 } });
      v.noise(ctx, out, t, { dur: 0.005, d: 0.07, gain: 0.35 * note.v, filter: { type: 'lowpass', freq: 700 } });
      A.duck(t, 0.35 * note.v, 0.25);
    } else {
      v.tone(ctx, out, t, { freq: 820, wave: 'square', dur: 0.005, d: 0.03, s: 0, gain: 0.12 * note.v, filter: { type: 'bandpass', freq: 1800, q: 3 } });
      v.noise(ctx, out, t, { dur: 0.003, d: 0.035, gain: 0.25 * note.v, filter: { type: 'bandpass', freq: 3200, q: 1.5 } });
    }
  },

  fire(g, note, st) {
    const p = g.player;
    const color = g.color('beat');
    if (note.k === 'kick') {
      const slam = (x, y) => {
        const r = g.area(st.radius) * (0.8 + 0.2 * note.v);
        g.fx.pulse({ x, y, r, damage: g.dmg(st.damage) * note.v, kb: st.kb, stun: st.stun, color, fill: 0.3 });
        g.fx.particles(x, y, color, 10, 240, 0.4, 3);
      };
      // The bar's first slam lands on a boss in range, so the drums play the fight too.
      const spot = (note.s === 0 && g.bossInRange(p.x, p.y, 460)) || g.densest(460);
      if (spot) slam(spot.x, spot.y);
      else slam(p.x + Math.cos(g.aim()) * 90, p.y + Math.sin(g.aim()) * 90);
      const extra = g.amount(1 + (st.extra || 0)) - 1;
      for (let i = 0; i < extra; i++) {
        const e = g.randomEnemy(p.x, p.y, 420);
        if (e) slam(e.x, e.y);
      }
      g.shake = Math.max(g.shake, 3.5 * note.v);
    } else {
      g.fx.ring({ x: p.x, y: p.y, follow: true, r0: 10, r1: g.area(st.rimRadius), dur: 0.16, damage: g.dmg(st.rimDamage), kb: 260, color, width: 3 });
    }
  },

  // A taiko ensemble: the great odaiko on the downbeat slams the boss or the biggest crowd, hurls the enemies
  // at its heart out into the rest and booms on through the hall as a shockwave, and the small shime rolls the
  // thunder out the way you face.
  remix: {
    id: 'thunderhall', name: 'Thunder Hall', pedal: 'reverb',
    text: 'The great drum hurls the crowd apart, and a drum roll thunders out the way you face.',
    sound: 'a great odaiko drum on the downbeat and a tight shime roll at the end of every bar.',
    // The rim comes first, so fills and rolls play rims.
    pattern: [R(4), R(12), D(0), K(3, 0.55), K(6, 0.6), K(8, 0.85), K(10, 0.7), K(14, 0.75), T(12, 0.5), T(13, 0.65), T(14, 0.8), T(15, 1)],
    stats: { damage: 20, odaikoDamage: 44, odaikoReach: 1.9, odaikoStun: 0.9, hallDamage: 16, hurl: 6, hurlSpeed: 640, hurlDamage: 34,
      shimeDamage: 30, shimeRadius: 76, shimeStep: 85 },
    fire(g, note, st, inst) {
      const p = g.player;
      const color = g.color('beat');
      if (note.k === 'odaiko') {
        // On the boss in range, else the biggest crowd, else just ahead of you.
        const spot = g.bossInRange(p.x, p.y, 480) || g.densest(480);
        const x = spot ? spot.x : p.x + Math.cos(g.aim()) * 90, y = spot ? spot.y : p.y + Math.sin(g.aim()) * 90;
        const r = g.area(st.radius) * st.odaikoReach;
        g.fx.pulse({ x, y, r, damage: g.dmg(st.odaikoDamage) * note.v, kb: 0, stun: st.odaikoStun, color, fill: 0.4, flashLife: 0.4 });
        // Its boom rolls on through the hall as a shockwave.
        g.fx.ring({ x, y, r0: r * 0.5, r1: r * 2.2, dur: 0.5, damage: g.dmg(st.hallDamage) * note.v, kb: 120, stun: 0.3, width: 10, color });
        g.fx.particles(x, y, color, 24, 340, 0.6, 3.5);
        // The enemies at its heart fly out from the center, crashing into the rest.
        let n = 0;
        for (const e of g.inRadius(x, y, r * 0.75)) {
          if (n >= st.hurl) break;
          const dx = e.x - x, dy = e.y - y;
          const a = dx * dx + dy * dy > 4 ? Math.atan2(dy, dx) : (n / st.hurl) * TAU;
          if (g.launch(e, a, g.speed(st.hurlSpeed), g.dmg(st.hurlDamage) * note.v)) n++;
        }
        g.shake = Math.max(g.shake, 7 * note.v);
      } else if (note.k === 'shime') {
        // Each 16th of the roll lands a step farther out along your facing: 12, 13, 14, 15 -> near to far.
        const a = g.aim(), d = st.shimeStep * (1 + (note.s & 3));
        const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        g.fx.pulse({ x, y, r: g.area(st.shimeRadius), damage: g.dmg(st.shimeDamage) * note.v, kb: 140, stun: 0.3, color, fill: 0.3 });
        g.fx.particles(x, y, color, 6, 200, 0.3, 2.5);
        g.shake = Math.max(g.shake, 1.5 * note.v);
      } else this.fire(g, note, st, inst);
    },
  },
};

// ---------------------------------------------------------------------------- 8-Bit Drums (8-Bit)

const chipDrums = {
  id: 'chipdrums',
  name: '8-Bit Drums',
  role: 'beat',
  style: 'chip',
  blurb: 'Crunchy console drums. Each hit fires a block that ricochets between enemies.',
  steps: 16,
  levels: [
    { text: 'Kick and snare on the beat. Blocks ricochet twice.',
      pattern: [K(0), S(4), K(8), S(12)],
      stats: { damage: 9, bounce: 2, size: 7, speed: 430 } },
    { text: 'Adds an off-beat kick. Blocks ricochet three times.',
      pattern: [K(0), S(4), K(8), K(10, 0.8), S(12)],
      stats: { damage: 10, bounce: 3, size: 7, speed: 450 } },
    { text: 'Every hit fires two blocks.',
      pattern: [K(0), S(4), K(8), K(10, 0.8), S(12)],
      stats: { damage: 9, bounce: 3, size: 7.5, speed: 460, count: 2 } },
    { text: 'A snare roll at the end of each bar.',
      pattern: [K(0), S(4), K(6, 0.7), K(8), K(10, 0.8), S(12), S(14, 0.6), S(15, 0.75)],
      stats: { damage: 10, bounce: 4, size: 8, speed: 480, count: 2 } },
    { text: 'Blocks ricochet six times and punch through enemies.',
      pattern: [K(0), S(4), K(6, 0.7), K(8), K(10, 0.8), S(12), S(14, 0.6), S(15, 0.75)],
      stats: { damage: 12, bounce: 6, size: 9, speed: 520, count: 2, pierce: 1 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    const rx = !!inst?.remix;
    if (note.k === 'kick') {
      v.tone(ctx, out, t, { freq: 55, wave: 'triangle', dur: 0.03, d: 0.2, s: 0, r: 0.03, gain: 0.78 * note.v, sub: 0.4, pitchEnv: { from: 4, time: 0.045 } });
      v.noise(ctx, out, t, { dur: 0.004, d: 0.02, gain: 0.25 * note.v, chip: rx ? 40 : 20, filter: { type: 'lowpass', freq: 3000 } });
      A.duck(t, 0.35 * note.v, 0.18);
    } else if (note.k === 'glitch') {
      // Glitch Kit (remix): a bit-flipped blip, a pulse that drops two octaves in a blink, stuttered twice.
      for (let i = 0; i < 2; i++) {
        v.tone(ctx, out, t + i * 0.031, { freq: 330, duty: 0.125, dur: 0.012, d: 0.03, s: 0, gain: 0.1 * note.v * (1 - 0.3 * i), pitchEnv: { from: 4, time: 0.025 } });
      }
      v.noise(ctx, out, t, { dur: 0.004, d: 0.025, gain: 0.12 * note.v, chip: 12, filter: { type: 'bandpass', freq: 900, q: 1.2 } });
    } else {
      // In the remix the snare is crushed coarser, so the ratchet chatters.
      v.noise(ctx, out, t, { dur: 0.01, d: rx ? 0.09 : 0.13, gain: 0.5 * note.v, chip: rx ? 6 : 3, filter: { type: 'highpass', freq: 900 } });
      v.tone(ctx, out, t, { freq: 220, duty: 0.25, dur: 0.01, d: 0.05, s: 0, gain: 0.12 * note.v, pitchEnv: { from: 1.8, time: 0.03 } });
    }
  },

  fire(g, note, st) {
    const p = g.player;
    const n = g.amount(st.count || 1);
    // The bar's first hit goes at a boss in range.
    const target = (note.s === 0 && g.bossInRange(p.x, p.y, 520)) || g.nearest(p.x, p.y, 520);
    blocks(g, note, st, n, target ? Math.atan2(target.y - p.y, target.x - p.x) : g.aim(), 0.35);
  },

  // A snare ratchet closes every bar and each of its 16ths fires blocks behind you, so running away leaves a
  // stream of ricochets in whoever chases you. Glitch blips split every block in flight in two.
  remix: {
    id: 'glitchkit', name: 'Glitch Kit', pedal: 'bitcrusher',
    text: 'A snare ratchet fires blocks behind you, and glitch blips split every block in flight.',
    sound: 'a chattering 16th snare ratchet closing every bar, and bit-flipped glitch blips.',
    // The snare comes first, so fills and rolls play snares (a fill is a ratchet too).
    pattern: [S(4), K(0), G(2, 0.7), K(6, 0.7), K(8), K(10, 0.8), G(11, 0.6), S(12, 0.6), S(13, 0.7), S(14, 0.85), S(15)],
    stats: { damage: 14, ratchetCount: 3, glitchShare: 0.8, glitchMax: 12 },
    fire(g, note, st, inst) {
      if (note.k === 'glitch') {
        if (!glitchSplit(g, st, inst)) this.fire(g, note, st, inst);   // nothing in flight: a plain volley
      } else if (note.k === 'snare' && note.s >= 12) {
        // The ratchet: blocks fly out behind you (at the nearest enemy back there), fanning across the four 16ths.
        const back = aimArc(g, g.aim() + Math.PI, 1.2, 480);
        blocks(g, note, st, g.amount(st.ratchetCount), back + ((note.s & 3) - 1.5) * 0.22, 0.3);
      } else this.fire(g, note, st, inst);
    },
  },
};

// A volley of n ricocheting blocks centered on angle `base`, `gap` radians apart. Kicks throw them bigger and slower.
function blocks(g, note, st, n, base, gap) {
  const p = g.player, color = g.color('beat'), kick = note.k === 'kick';
  for (let i = 0; i < n; i++) {
    g.fx.bullet({ x: p.x, y: p.y, angle: base + (i - (n - 1) / 2) * gap, speed: g.speed(st.speed) * (kick ? 0.9 : 1.1),
      r: st.size * (kick ? 1.1 : 0.85), life: 1.6, damage: g.dmg(st.damage) * note.v,
      bounce: st.bounce, pierce: st.pierce || 0, kb: 70, color, shape: 'square', spin: 8 });
  }
}

// Glitch Kit: every block of the kit in flight glitches in two (at most glitchMax): the copy jumps off at an
// angle, alternating sides, a little smaller and with glitchShare of the damage. A copy never splits again. Returns
// how many split.
function glitchSplit(g, st, inst) {
  const bs = g.fx.bullets;
  let n = 0;
  for (let i = bs.length - 1; i >= 0 && n < st.glitchMax; i--) {
    const b = bs[i];
    if (b.src !== inst || b.dead || b.glitch) continue;
    b.glitch = true;
    const c = g.fx.bullet({ x: b.x, y: b.y, angle: Math.atan2(b.vy, b.vx) + (n & 1 ? 1.1 : -1.1), speed: Math.hypot(b.vx, b.vy), r: b.r * 0.85,
      life: 1.1, damage: b.damage * st.glitchShare, bounce: Math.max(1, b.bounce - 2), pierce: b.pierce, kb: 50, color: b.color, shape: 'square', spin: -12 });
    if (!c) break;
    c.glitch = true;
    for (const e of b.hit) c.hit.add(e);
    g.fx.flash(b.x, b.y, 14, b.color, 0.12, 0.4);
    n++;
  }
  return n;
}

export default [kick808, taiko, chipDrums];
