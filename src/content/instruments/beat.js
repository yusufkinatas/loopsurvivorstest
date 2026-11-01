// BEAT channel: kicks and snares. The reference implementation for the instrument format
// (see docs/INSTRUMENTS.md). Low, heavy, on the beat. Each sound plays its style: the 808 throws long lances at
// far targets, the Taiko slams around where you stand, the 8-Bit kit sprays ricochets along the grid.

import { TAU, dist2 } from '../../util.js';
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
  blurb: 'Deep electronic kicks. Each one fires a long sub lance at the farthest enemy in reach.',
  steps: 16,
  levels: [
    { text: 'Kicks on beats 1 and 3. Each kick fires a long lance at the farthest enemy in reach.',
      pattern: [K(0), K(8)],
      stats: { damage: 36, reach: 300, width: 28, kb: 170 } },
    { text: 'Four on the floor: a lance on every beat.',
      pattern: [K(0), K(4), K(8), K(12)],
      stats: { damage: 36, reach: 315, width: 30, kb: 170 } },
    { text: 'Adds a clap on the backbeat that snaps a crosshair of lances across the last one.',
      pattern: [K(0), K(4), K(8), K(12), S(4), S(12)],
      stats: { damage: 38, reach: 330, width: 32, kb: 180, clap: 26 } },
    { text: 'A pickup kick before every bar. Longer, wider lances.',
      pattern: [K(0), K(4), K(8), K(12), K(14, 0.7), S(4), S(12)],
      stats: { damage: 48, reach: 350, width: 36, kb: 190, clap: 32 } },
    { text: 'Full groove. Lances now stun what they hit.',
      pattern: [K(0), K(4), K(7, 0.6), K(8), K(12), K(14, 0.7), S(4), S(12), S(15, 0.5)],
      stats: { damage: 58, reach: 370, width: 40, kb: 200, clap: 38, stun: 0.25 } },
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

  // Kicks fire a lance at the farthest enemy in reach (the bar's first one at a boss in reach), so the farther
  // you keep the crowd, the more of it each lance runs through. Claps snap two shorter lances across the last
  // kick's line, a crosshair through you.
  fire(g, note, st, inst) {
    const p = g.player, S = inst.state;
    if (note.k === 'kick') {
      const reach = st.reach * (0.85 + 0.15 * note.v);
      const t = (note.s === 0 && g.bossInRange(p.x, p.y, reach)) || farthest(g, p.x, p.y, reach);
      const a = t ? Math.atan2(t.y - p.y, t.x - p.x) : g.aim();
      S.lance = a;
      lance(g, a, reach, g.area(st.width), g.dmg(st.damage) * note.v, st.kb, st.stun || 0);
      // Sidechain 808 (remix, st.kickErase): every kick also wipes out the enemy shots close around you.
      if (st.kickErase) g.fx.ring({ x: p.x, y: p.y, follow: true, r0: 16, r1: g.area(st.kickErase), dur: 0.2, damage: 0, kb: 0, color: g.color('beat'), width: 3, erase: 1 });
      g.shake = Math.max(g.shake, 2.5 * note.v);
    } else {
      const a = (S.lance ?? g.aim()) + Math.PI / 2;
      for (const d of [a, a + Math.PI]) lance(g, d, st.reach * 0.7, g.area(st.width) * 0.6, g.dmg(st.clap) * note.v, 60, 0);
    }
  },

  // The downbeat becomes a long sub boom: a slow shockwave around you that drags the crowd in toward you, stuns
  // it and ducks it for the bar (it takes more from every hit, the way the band ducks under the kick), for the
  // lances that follow to run through. The boom and every kick erase the enemy shots close around you, so you
  // can step into a bullet pattern on the beat.
  remix: {
    id: 'sidechain808', name: 'Sidechain 808', pedal: 'compressor',
    text: 'The downbeat boom drags the crowd in and ducks it, and every kick erases enemy shots.',
    sound: 'a long sub boom on the downbeat, a ghost kick, and the whole band pumping on every kick.',
    // The clap comes first, so fills and rolls play claps.
    pattern: [S(4), S(12), S(15, 0.5), B(0), K(4), K(7, 0.6), K(8), K(10, 0.5), K(12), K(14, 0.7)],
    stats: { damage: 86, clap: 56, width: 44, kickErase: 110, boomDamage: 60, boomRadius: 250, boomPull: 260, boomStun: 0.6, boomErase: 0.6, duck: 0.25 },
    fire(g, note, st, inst) {
      if (note.k !== 'boom') { this.fire(g, note, st, inst); return; }
      const p = g.player, R = g.area(st.boomRadius), until = g.time + BAR_SEC;
      for (const e of g.inRadius(p.x, p.y, R)) {
        if (e.vulnUntil > g.time && e.vuln > st.duck) continue;   // a deeper mark (Lullaby) stays
        e.vuln = st.duck; e.vulnUntil = until;
      }
      g.fx.ring({ x: p.x, y: p.y, follow: true, r0: 24, r1: R, dur: 0.5,
        damage: g.dmg(st.boomDamage) * note.v, kb: -st.boomPull, stun: st.boomStun, color: g.color('beat'), width: 14, erase: st.boomErase });
      g.shake = Math.max(g.shake, 6 * note.v);
    },
  },
};

// A sub lance: an instant shockwave line from you along `angle`, `len` px long, that hits everything on it and
// pushes it on along the line.
function lance(g, angle, len, width, damage, kb, stun) {
  const p = g.player;
  g.fx.beam({ x: p.x, y: p.y, angle, length: len, width, damage, kb, stun, color: g.color('beat'), life: 0.2 });
}

// The enemy farthest from (x, y) within range (spawning ones excluded), or null.
function farthest(g, x, y, range) {
  let best = null, bd = -1;
  g.grid.query(x, y, range, (e) => {
    if (e.dead || e.spawnT > 0.2) return;
    const d = dist2(e.x, e.y, x, y);
    if (d < range * range && d > bd) { bd = d; best = e; }
  });
  return best;
}

// ---------------------------------------------------------------------------- Taiko (Live)

const taiko = {
  id: 'taiko',
  name: 'Taiko Drums',
  role: 'beat',
  style: 'organic',
  blurb: 'Huge hand drums. Every hit slams the ground around you, and standing your ground makes it reach farther.',
  steps: 16,
  levels: [
    { text: 'Two booming slams per bar on the ground around you. Stand your ground and each slam reaches farther.',
      pattern: [K(0), K(8, 0.85)],
      stats: { damage: 17, radius: 100, stun: 0.35, kb: 110 } },
    { text: 'Adds a third slam that answers the second.',
      pattern: [K(0), K(8, 0.85), K(10, 0.7)],
      stats: { damage: 19, radius: 104, stun: 0.4, kb: 110 } },
    { text: 'Rim clicks on the backbeat shove enemies away from you.',
      pattern: [K(0), K(8, 0.85), K(10, 0.7), R(4), R(12)],
      stats: { damage: 22, radius: 108, stun: 0.45, kb: 120, rimRadius: 84, rimDamage: 11 } },
    { text: 'A fourth slam closes each bar. Bigger slams.',
      pattern: [K(0), K(8, 0.85), K(10, 0.7), K(14, 0.75), R(4), R(12)],
      stats: { damage: 27, radius: 114, stun: 0.5, kb: 130, rimRadius: 90, rimDamage: 13 } },
    { text: 'Thunder: every slam rolls a shockwave out around you.',
      pattern: [K(0), K(3, 0.55), K(8, 0.85), K(10, 0.7), K(14, 0.75), R(4), R(12)],
      stats: { damage: 34, radius: 120, stun: 0.6, kb: 140, rimRadius: 96, rimDamage: 16, thunder: 0.5 } },
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

  // Every slam lands on the ground around you (the bar's first on a boss in range instead). Each slam you are
  // planted for (moved under 24 px since the last beat) reaches farther, up to three in a row; moving resets it.
  fire(g, note, st, inst) {
    const p = g.player, S = inst.state;
    const color = g.color('beat');
    if (note.k === 'kick') {
      if (g.dmgScale === 1) S.streak = g.rules.planted ? Math.min(PLANT_MAX, (S.streak || 0) + 1) : 0;
      const r = g.area(st.radius) * (1 + PLANT_GROW * (S.streak || 0)) * (0.85 + 0.15 * note.v);
      const boss = note.s === 0 ? g.bossInRange(p.x, p.y, 320) : null;
      const x = boss ? boss.x : p.x, y = boss ? boss.y : p.y;
      slam(g, x, y, r, g.dmg(st.damage) * note.v, st.kb, st.stun, color);
      // Thunder: the slam rolls on out around you as a shockwave.
      if (st.thunder) g.fx.ring({ x, y, follow: !boss, r0: r * 0.6, r1: r * 1.4, dur: 0.32, damage: g.dmg(st.damage * st.thunder) * note.v, kb: 120, width: 5, color });
      g.shake = Math.max(g.shake, 3.5 * note.v);
    } else {
      g.fx.ring({ x: p.x, y: p.y, follow: true, r0: 10, r1: g.area(st.rimRadius), dur: 0.16, damage: g.dmg(st.rimDamage), kb: 260, color, width: 3 });
    }
  },

  // A taiko ensemble: the great odaiko on the downbeat slams the ground around you (or the boss in range), hurls
  // the enemies at its heart out into the rest and booms on through the hall as a shockwave, and the small shime
  // rolls the thunder out the way you face.
  remix: {
    id: 'thunderhall', name: 'Thunder Hall', pedal: 'reverb',
    text: 'The great drum hurls the crowd around you apart, and a drum roll thunders out the way you face.',
    sound: 'a great odaiko drum on the downbeat and a tight shime roll at the end of every bar.',
    // The rim comes first, so fills and rolls play rims.
    pattern: [R(4), R(12), D(0), K(3, 0.55), K(6, 0.6), K(8, 0.85), K(10, 0.7), K(14, 0.75), T(12, 0.5), T(13, 0.65), T(14, 0.8), T(15, 1)],
    stats: { damage: 42, rimDamage: 20, odaikoDamage: 64, odaikoReach: 1.5, odaikoStun: 0.9, hallDamage: 24, hurl: 6, hurlSpeed: 600, hurlDamage: 36,
      shimeDamage: 38, shimeRadius: 62, shimeStep: 55 },
    fire(g, note, st, inst) {
      const p = g.player;
      const color = g.color('beat');
      if (note.k === 'odaiko') {
        // Around you, or on the boss in range.
        const boss = g.bossInRange(p.x, p.y, 320);
        const x = boss ? boss.x : p.x, y = boss ? boss.y : p.y;
        const r = g.area(st.radius) * st.odaikoReach;
        slam(g, x, y, r, g.dmg(st.odaikoDamage) * note.v, 0, st.odaikoStun, color);
        // Its boom rolls on through the hall as a shockwave.
        g.fx.ring({ x, y, follow: !boss, r0: r * 0.5, r1: r * 1.5, dur: 0.45, damage: g.dmg(st.hallDamage) * note.v, kb: 120, stun: 0.3, width: 10, color });
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

const PLANT_GROW = 0.15;   // Taiko: how much farther each planted slam in a row reaches
const PLANT_MAX = 3;       // ... and how many in a row count

// A taiko slam: an instant blow on the ground at (x, y).
function slam(g, x, y, r, damage, kb, stun, color) {
  g.fx.pulse({ x, y, r, damage, kb, stun, color, fill: 0.3 });
  g.fx.particles(x, y, color, 10, 240, 0.4, 3);
}

// ---------------------------------------------------------------------------- 8-Bit Drums (8-Bit)

const chipDrums = {
  id: 'chipdrums',
  name: '8-Bit Drums',
  role: 'beat',
  style: 'chip',
  blurb: 'Crunchy console drums. Each hit fires blocks along the grid that ricochet between enemies.',
  steps: 16,
  levels: [
    { text: 'Kicks fire two blocks along the straight lines, snares along the diagonals, a quarter turn each hit. Blocks ricochet twice.',
      pattern: [K(0), S(4), K(8), S(12)],
      stats: { damage: 10, bounce: 2, size: 7, speed: 440, count: 2, life: 0.75 } },
    { text: 'Adds an off-beat kick. Blocks ricochet three times.',
      pattern: [K(0), S(4), K(8), K(10, 0.8), S(12)],
      stats: { damage: 11, bounce: 3, size: 7, speed: 460, count: 2, life: 0.75 } },
    { text: 'Every hit fires the whole cross: four blocks.',
      pattern: [K(0), S(4), K(8), K(10, 0.8), S(12)],
      stats: { damage: 9, bounce: 3, size: 7.5, speed: 470, count: 4, life: 0.72 } },
    { text: 'A snare roll at the end of each bar.',
      pattern: [K(0), S(4), K(6, 0.7), K(8), K(10, 0.8), S(12), S(14, 0.6), S(15, 0.75)],
      stats: { damage: 10, bounce: 4, size: 8, speed: 490, count: 4, life: 0.7 } },
    { text: 'Blocks ricochet six times and punch through enemies.',
      pattern: [K(0), S(4), K(6, 0.7), K(8), K(10, 0.8), S(12), S(14, 0.6), S(15, 0.75)],
      stats: { damage: 12, bounce: 6, size: 9, speed: 520, count: 4, pierce: 1, life: 0.68 } },
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

  // Kicks fire blocks along the straight lines (+), snares along the diagonals (x), a quarter turn each hit, so
  // the kit sprays the whole grid around you whichever way you dodge; a block that hits ricochets on to the next
  // enemy. The bar's first hit fires its whole volley at a boss in range instead.
  fire(g, note, st, inst) {
    const p = g.player, S = inst.state;
    const n = g.amount(st.count || 1);
    const diag = note.k !== 'kick';
    const turn = diag ? (S.sTurn = ((S.sTurn || 0) + 1) & 3) : (S.kTurn = ((S.kTurn || 0) + 1) & 3);
    const base = (diag ? Math.PI / 4 : 0) + turn * (Math.PI / 2);
    const boss = note.s === 0 ? g.bossInRange(p.x, p.y, 400) : null;
    const at = boss ? Math.atan2(boss.y - p.y, boss.x - p.x) : 0;
    for (let i = 0; i < n; i++) {
      block(g, note, st, boss ? at + (i - (n - 1) / 2) * 0.16 : GRID * Math.round((base + (i * TAU) / n) / GRID));
    }
  },

  // A snare ratchet closes every bar and each of its 16ths fires blocks behind you, so running away leaves a
  // stream of ricochets in whoever chases you. Glitch blips split every block in flight in two.
  remix: {
    id: 'glitchkit', name: 'Glitch Kit', pedal: 'bitcrusher',
    text: 'A snare ratchet fires blocks behind you, and glitch blips split every block in flight.',
    sound: 'a chattering 16th snare ratchet closing every bar, and bit-flipped glitch blips.',
    // The snare comes first, so fills and rolls play snares (a fill is a ratchet too).
    pattern: [S(4), K(0), G(2, 0.7), K(6, 0.7), K(8), K(10, 0.8), G(11, 0.6), S(12, 0.6), S(13, 0.7), S(14, 0.85), S(15)],
    stats: { damage: 16, ratchetCount: 4, glitchShare: 0.7, glitchMax: 4 },
    fire(g, note, st, inst) {
      if (note.k === 'glitch') {
        if (!glitchSplit(g, st, inst)) this.fire(g, note, st, inst);   // nothing in flight: a plain volley
      } else if (note.k === 'snare' && note.s >= 12) {
        // The ratchet: blocks fly out behind you (at the nearest enemy back there), fanning across the four 16ths.
        const back = aimArc(g, g.aim() + Math.PI, 1.2, 400), n = g.amount(st.ratchetCount);
        for (let i = 0; i < n; i++) block(g, note, st, back + ((note.s & 3) - 1.5) * 0.22 + (i - (n - 1) / 2) * 0.3);
      } else this.fire(g, note, st, inst);
    },
  },
};

const GRID = Math.PI / 4;   // 8-Bit Drums fire on the eight grid directions

// One ricocheting block from you along `angle`. Kicks throw them bigger and slower.
function block(g, note, st, angle) {
  const p = g.player, kick = note.k === 'kick';
  g.fx.bullet({ x: p.x, y: p.y, angle, speed: g.speed(st.speed) * (kick ? 0.9 : 1.1),
    r: st.size * (kick ? 1.1 : 0.85), life: st.life, damage: g.dmg(st.damage) * note.v,
    bounce: st.bounce, pierce: st.pierce || 0, kb: 70, color: g.color('beat'), shape: 'square', spin: 8 });
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
      life: 0.7, damage: b.damage * st.glitchShare, bounce: Math.max(1, b.bounce - 2), pierce: b.pierce, kb: 50, color: b.color, shape: 'square', spin: -12 });
    if (!c) break;
    c.glitch = true;
    for (const e of b.hit) c.hit.add(e);
    g.fx.flash(b.x, b.y, 14, b.color, 0.12, 0.4);
    n++;
  }
  return n;
}

export default [kick808, taiko, chipDrums];
