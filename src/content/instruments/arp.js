// SPARKLE channel: arpeggios and bells (see docs/INSTRUMENTS.md). High and glittery, fast chord
// tones on the 16th grid: lots of small extras around the player rather than one big hit.

import { STEP_SEC } from '../../config.js';

const TAU = Math.PI * 2;

// Pattern helper: step s (0..15), chord tone c (0 root, 1 third, 2 fifth, 3 root an octave up...),
// velocity v. Every note is a chord tone, so it fits whatever chord the song is on.
const N = (s, c, v = 1) => ({ s, ct: c, v });

// How high a note sits inside the part: 0 at `low`, about 1 at the top of the register.
const lift = (note, inst) => Math.max(0, Math.min(1, (note.midi - inst.def.low) / 27));

// ---------------------------------------------------------------------------- Arp Synth (Synth)

// Up and down the chord, one octave and a third: 0 1 2 3 4 3 2 1, twice per bar.
const UD = [0, 1, 2, 3, 4, 3, 2, 1];
const U = (s, v) => N(s, UD[s % 8], v);
const ARP_8THS = [U(0, 1), U(2, 0.8), U(4, 0.9), U(6, 0.8), U(8, 0.95), U(10, 0.8), U(12, 0.9), U(14, 0.8)];
const ARP_16THS_A = [U(1, 0.6), U(3, 0.65), U(9, 0.6), U(11, 0.65)];
const ARP_16THS_B = [U(5, 0.6), U(7, 0.55), U(13, 0.6), U(15, 0.6)];

const arpSynth = {
  id: 'arpsynth',
  name: 'Arp Synth',
  role: 'arp',
  style: 'synth',
  blurb: 'A bright, plucky synth rippling up and down. Every note flicks a spark, spinning a spiral around you.',
  steps: 16,
  low: 71,
  levels: [
    { text: 'A note every half beat. Each one flicks a spark, and the sparks spin around you like a sprinkler.',
      pattern: [...ARP_8THS],
      stats: { damage: 22, speed: 340, size: 6, life: 1.15, pierce: 2, streams: 1 } },
    { text: 'Quick extra notes on beats 1 and 3 fill the spiral with more sparks.',
      pattern: [...ARP_8THS, ...ARP_16THS_A],
      stats: { damage: 23, speed: 350, size: 6, life: 1.15, pierce: 2, streams: 1 } },
    { text: 'The full run: a note on every step, and a spark on every note.',
      pattern: [...ARP_8THS, ...ARP_16THS_A, ...ARP_16THS_B],
      stats: { damage: 24, speed: 360, size: 6, life: 1.2, pierce: 2, streams: 1 } },
    { text: 'Two spirals at once, spraying in opposite directions.',
      pattern: [...ARP_8THS, ...ARP_16THS_A, ...ARP_16THS_B],
      stats: { damage: 25, speed: 375, size: 6.5, life: 1.2, pierce: 2, streams: 2 } },
    { text: 'Three spirals. Sparks fly farther and each one punches through an extra enemy.',
      pattern: [...ARP_8THS, ...ARP_16THS_A, ...ARP_16THS_B],
      stats: { damage: 26, speed: 390, size: 6.5, life: 1.25, pierce: 3, streams: 3 } },
  ],

  sound(A, t, note, out) {
    const { ctx, v } = A;
    // Two detuned saws through a resonant low-pass that snaps shut: a short, bright pluck.
    v.tone(ctx, out, t, { freq: note.freq, wave: 'sawtooth', unison: 2, spread: 7, dur: 0.02, a: 0.002, d: 0.16, s: 0.1, r: 0.04,
      gain: 0.46 * note.v, filter: { type: 'lowpass', freq: note.freq * 2, q: 4, env: 3, decay: 0.12 },
      pan: note.s % 2 ? 0.25 : -0.2 });
  },

  fire(g, note, st, inst) {
    const p = g.player;
    const color = g.color(inst);
    const n = g.amount(st.streams);
    // The spray turns 1/16 of a circle every step, plus a slow drift, so the arp draws a spinning spiral.
    const base = note.s * TAU / 16 + g.time * 0.4;
    const speed = g.speed(st.speed) * (0.85 + 0.35 * lift(note, inst));
    for (let i = 0; i < n; i++) {
      // Galaxy (remix, st.curve): sparks curve off into spiral arms.
      g.fx.bullet({ x: p.x, y: p.y, angle: base + (i / n) * TAU, speed, r: st.size, life: st.life, curve: st.curve,
        damage: g.dmg(st.damage) * note.v, pierce: st.pierce, kb: 25, color, shape: 'star', spin: 9 });
    }
  },

  remix: {
    id: 'galaxy', name: 'Galaxy', pedal: 'reverb',
    text: 'Sparks curve into spiral arms, drift almost twice as long and punch through five enemies.',
    stats: { curve: 1.6, life: 2.1, pierce: 5 },
  },
};

// ---------------------------------------------------------------------------- Music Box (Live)

// A star takes one beat (4 steps, 0.5 s) to fall, so it lands in time with the music, one beat after its chime.
const FALL = 4 * STEP_SEC;

const BOX_1 = [N(0, 4, 1), N(6, 2, 0.85), N(12, 3, 0.9)];
const BOX_2 = [N(10, 4, 0.7)];
const BOX_3 = [N(3, 2, 0.6), N(8, 1, 0.65)];
const BOX_4 = [N(14, 2, 0.6)];
const BOX_5 = [N(5, 3, 0.55), N(15, 1, 0.5)];

const musicBox = {
  id: 'musicbox',
  name: 'Music Box',
  role: 'arp',
  style: 'organic',
  blurb: 'A tiny, twinkling music box. Each chime calls down a falling star that lands on an enemy one beat later.',
  steps: 16,
  low: 75,
  seventh: true,
  levels: [
    { text: 'Three soft chimes per bar. Each one calls a star down onto a random enemy.',
      pattern: [...BOX_1],
      stats: { damage: 28, radius: 46, stars: 1 } },
    { text: 'A fourth chime answers the first. Bigger stars.',
      pattern: [...BOX_1, ...BOX_2],
      stats: { damage: 30, radius: 52, stars: 1 } },
    { text: 'Two more chimes fill in the tune. Stars hit harder.',
      pattern: [...BOX_1, ...BOX_2, ...BOX_3],
      stats: { damage: 34, radius: 58, stars: 1 } },
    { text: 'Another chime near the end of each bar. Wider stars.',
      pattern: [...BOX_1, ...BOX_2, ...BOX_3, ...BOX_4],
      stats: { damage: 39, radius: 64, stars: 1 } },
    { text: 'The whole tune. Stars now freeze what they hit for a moment.',
      pattern: [...BOX_1, ...BOX_2, ...BOX_3, ...BOX_4, ...BOX_5],
      stats: { damage: 46, radius: 72, stars: 1, stun: 0.35 } },
  ],

  sound(A, t, note, out) {
    const { ctx, v } = A;
    // FM bell with a high modulator: a glassy ping that fades to a pure tone, like a tuned metal tine.
    v.fm(ctx, out, t, { freq: note.freq, ratio: 7, index: 5, indexDecay: 0.1, a: 0.001, d: 0.75, s: 0, r: 0.2, dur: 0.02, gain: 0.42 * note.v, pan: 0.1 });
    // A faint, faster-fading upper partial gives the tine its sparkle.
    v.tone(ctx, out, t, { freq: note.freq * 3, wave: 'sine', dur: 0.005, a: 0.001, d: 0.25, s: 0, r: 0.05, gain: 0.14 * note.v });
  },

  fire(g, note, st, inst) {
    const p = g.player;
    const color = g.color(inst);
    const n = g.amount(st.stars);
    // Lullaby (remix, st.vuln): what a star lands on is marked, and takes more damage from every source (game.hit).
    const onLand = st.vuln ? (s, gg) => { for (const e of gg.inRadius(s.x, s.y, s.r)) { e.vulnUntil = gg.time + st.vulnTime; e.vuln = st.vuln; } } : null;
    for (let i = 0; i < n; i++) {
      // The bar's first star falls on a boss in range.
      const e = (i === 0 && note.s === 0 && g.bossInRange(p.x, p.y, 450)) || g.randomEnemy(p.x, p.y, 450);
      // Nobody around: the star still falls just ahead of you, so every chime shows up on screen.
      const a = g.aim() + (i - (n - 1) / 2) * 0.6;
      const x = e ? e.x : p.x + Math.cos(a) * 110, y = e ? e.y : p.y + Math.sin(a) * 110;
      g.fx.strike({ x, y, target: e, delay: FALL, r: g.area(st.radius) * (0.8 + 0.2 * note.v),
        damage: g.dmg(st.damage) * note.v, kb: 60, stun: st.stun || 0, color, style: 'star', onLand });
    }
  },

  remix: {
    id: 'lullaby', name: 'Lullaby', pedal: 'reverb',
    text: 'Stars sing the Noise to sleep. What they land on stays frozen longer and takes 35% more damage from your whole band for 2 seconds.',
    stats: { stun: 0.8, vuln: 0.35, vulnTime: 2 },
  },
};

// ---------------------------------------------------------------------------- Coin Arp (8-Bit)

// Built from "ba-ding" pairs: the fifth jumping up to the root an octave higher, the classic coin blip.
// The "ding" rings for two steps.
const DING = (s) => ({ ...N(s, 3, 1), d: 2 });
const COIN_1 = [N(2, 2, 0.8), DING(3), N(10, 2, 0.8), DING(11)];
const COIN_2 = [N(0, 0, 0.7), N(1, 1, 0.7), N(8, 0, 0.7), N(9, 1, 0.7)];
const COIN_3 = [N(6, 3, 0.8), N(7, 4, 0.95), N(14, 4, 0.8), N(15, 3, 0.9)];
const COIN_4 = [N(4, 1, 0.6), N(5, 2, 0.65), N(12, 2, 0.6), N(13, 3, 0.65)];

const chipArp = {
  id: 'chiparp',
  name: 'Coin Arp',
  role: 'arp',
  style: 'chip',
  blurb: 'Bright 8-bit blips, like grabbing coins in an old game. Each blip throws a coin that flies out and comes back to you.',
  steps: 16,
  low: 71,
  levels: [
    { text: 'A coin sound twice per bar. Each of its notes throws a coin that flies out, spins back, and hits on both trips.',
      pattern: [...COIN_1],
      stats: { damage: 21, speed: 430, size: 7, throw: 1.02, pierce: 6, coins: 1 } },
    { text: 'The coin sounds grow into quick climbing runs that fan coins across the nearest enemy.',
      pattern: [...COIN_1, ...COIN_2],
      stats: { damage: 21, speed: 440, size: 7, throw: 1.08, pierce: 6, coins: 1 } },
    { text: 'Answering blips on beats 2 and 4. Coins fly farther.',
      pattern: [...COIN_1, ...COIN_2, ...COIN_3],
      stats: { damage: 25, speed: 450, size: 7, throw: 1.2, pierce: 7, coins: 1 } },
    { text: 'A blip on every step. Coins cut through even more enemies.',
      pattern: [...COIN_1, ...COIN_2, ...COIN_3, ...COIN_4],
      stats: { damage: 26, speed: 460, size: 7.5, throw: 1.26, pierce: 9, coins: 1 } },
    { text: 'Every blip throws two coins, and they fly the farthest.',
      pattern: [...COIN_1, ...COIN_2, ...COIN_3, ...COIN_4],
      stats: { damage: 30, speed: 480, size: 8, throw: 1.38, pierce: 9, coins: 2 } },
  ],

  sound(A, t, note, out) {
    const { ctx, v } = A;
    // Thin 12.5% pulse, short and clipped, the way old consoles played fast arpeggios.
    v.tone(ctx, out, t, { freq: note.freq, duty: 0.125, dur: note.dur * 0.6, a: 0.001, d: 0.04, s: 0.55, r: 0.02, gain: 0.78 * note.v,
      pan: note.s % 4 < 2 ? -0.15 : 0.15 });
  },

  fire(g, note, st, inst) {
    const p = g.player;
    const color = g.color(inst);
    const target = g.nearest(p.x, p.y, 480);
    const base = target ? Math.atan2(target.y - p.y, target.x - p.x) : g.aim();
    // Pitch picks the angle: low notes veer one way, high notes the other, so a run fans coins across the target.
    const off = (lift(note, inst) - 0.5) * 0.8;
    const n = g.amount(st.coins);
    // Jackpot (remix, st.bank): coins that hit something pay into the Drop meter when they get home.
    const onReturn = st.bank ? (b, gg) => homeCoin(b, gg, st) : null;
    for (let i = 0; i < n; i++) {
      const a = base + off + (i - (n - 1) / 2) * 0.55;
      g.fx.bullet({ x: p.x, y: p.y, angle: a, speed: g.speed(st.speed), r: st.size, life: st.throw,
        damage: g.dmg(st.damage) * note.v, pierce: st.pierce, kb: 30, color, shape: 'coin', spin: 14, boomerang: true,
        onHit: st.bank ? paid : null, onReturn });
    }
  },

  remix: {
    id: 'jackpot', name: 'Jackpot', pedal: 'delay',
    text: 'Coins make the trip twice, and every coin that comes home after hitting something pays into the Drop meter.',
    stats: { trip: 0.35, bank: 1 },
  },
};

// Jackpot: a coin home from a trip where it hit something banks Drop charge. After its first trip it
// flies once more, at `trip` of its damage, aimed at the nearest enemy.
const paid = (b) => { b.paid = true; };
function homeCoin(b, g, st) {
  if (b.paid) g.chargeDrop(st.bank);
  if (b.trip) return false;
  const p = g.player;
  const e = g.nearest(p.x, p.y, 480);
  const a = e ? Math.atan2(e.y - p.y, e.x - p.x) : Math.atan2(b.vy, b.vx) + Math.PI;
  const sp = g.speed(st.speed);
  b.trip = true; b.paid = false; b.returning = false; b.age = 0; b.damage *= st.trip;
  b.hit.clear();
  b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
  return true;
}

export default [arpSynth, musicBox, chipArp];
