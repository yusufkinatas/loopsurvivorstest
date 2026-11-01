// SPARKLE channel: arpeggios and bells (see docs/INSTRUMENTS.md). High and glittery, fast chord
// tones on the 16th grid: lots of small extras rather than one big hit. Three ways to play it: Arp Synth
// snipes along straight lines, nearer or farther with the pitch; Music Box rings stars down around where you
// stand; Coin Arp throws coins along the compass lines that come back to you.

import { STEP_SEC, BEAT_SEC } from '../../config.js';

const TAU = Math.PI * 2;

// Pattern helper: step s (0..15), chord tone c (0 root, 1 third, 2 fifth, 3 root an octave up...),
// velocity v. Every note is a chord tone, so it fits whatever chord the song is on.
const N = (s, c, v = 1) => ({ s, ct: c, v });

// How high a note sits inside the part: 0 at `low`, about 1 at the top of the register.
const lift = (note, inst) => Math.max(0, Math.min(1, (note.midi - inst.def.low) / 27));

// Where you were `ago` seconds back. A remix's update() keeps a short trail of your positions in inst.state.
function track(g, inst) {
  const tr = (inst.state.trail ||= []);
  tr.push({ t: g.time, x: g.player.x, y: g.player.y });
  while (tr.length > 2 && tr[1].t < g.time - 1.5) tr.shift();
}
function wasAt(g, inst, ago) {
  const tr = inst.state.trail, t = g.time - ago;
  if (!tr?.length) return g.player;
  for (let i = tr.length - 1; i >= 0; i--) if (tr[i].t <= t) return tr[i];
  return tr[0];
}

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
  blurb: 'A bright, plucky synth rippling up and down. Every note snipes a needle down a straight line: low notes at the nearest enemy, high notes at the farthest.',
  steps: 16,
  low: 71,
  levels: [
    { text: 'A note every half beat. Each one snipes a needle straight at an enemy: the lower the note, the nearer the enemy, the higher, the farther.',
      pattern: [...ARP_8THS],
      stats: { damage: 19, speed: 720, size: 4.5, reach: 340, pierce: 2, streams: 1 } },
    { text: 'Quick extra notes on beats 1 and 3 fire more needles.',
      pattern: [...ARP_8THS, ...ARP_16THS_A],
      stats: { damage: 20, speed: 730, size: 4.5, reach: 345, pierce: 2, streams: 1 } },
    { text: 'The full run: a note on every step, and a needle on every note.',
      pattern: [...ARP_8THS, ...ARP_16THS_A, ...ARP_16THS_B],
      stats: { damage: 21, speed: 740, size: 4.5, reach: 350, pierce: 2, streams: 1 } },
    { text: 'Every note fires a second needle at an enemy farther out.',
      pattern: [...ARP_8THS, ...ARP_16THS_A, ...ARP_16THS_B],
      stats: { damage: 19, speed: 760, size: 5, reach: 355, pierce: 2, streams: 2 } },
    { text: 'And a third at one nearer in. Needles punch through an extra enemy.',
      pattern: [...ARP_8THS, ...ARP_16THS_A, ...ARP_16THS_B],
      stats: { damage: 16, speed: 780, size: 5, reach: 360, pierce: 3, streams: 3 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    if (inst?.remix) {
      // Galaxy: the pluck rings longer, and every accent is a bell-like chime with a shimmer an octave and a
      // fifth up, swinging from one side to the other.
      const acc = note.k === 'acc';
      v.tone(ctx, out, t, { freq: note.freq, wave: 'sawtooth', unison: 3, spread: 10, dur: 0.02, a: 0.002, d: acc ? 0.3 : 0.14, s: 0.1, r: 0.06,
        gain: (acc ? 0.4 : 0.34) * note.v, filter: { type: 'lowpass', freq: note.freq * (acc ? 3 : 1.8), q: 5, env: 3, decay: acc ? 0.2 : 0.1 },
        pan: acc ? ((note.s / 3) % 2 ? 0.55 : -0.55) : 0 });
      if (acc) v.fm(ctx, out, t, { freq: note.freq * 3, ratio: 2, index: 1.2, indexDecay: 0.2, a: 0.002, d: 0.5, s: 0, r: 0.2, dur: 0.02,
        gain: 0.07 * note.v, pan: (note.s / 3) % 2 ? -0.5 : 0.5 });
      return;
    }
    // Two detuned saws through a resonant low-pass that snaps shut: a short, bright pluck.
    v.tone(ctx, out, t, { freq: note.freq, wave: 'sawtooth', unison: 2, spread: 7, dur: 0.02, a: 0.002, d: 0.16, s: 0.1, r: 0.04,
      gain: 0.46 * note.v, filter: { type: 'lowpass', freq: note.freq * 2, q: 4, env: 3, decay: 0.12 },
      pan: note.s % 2 ? 0.25 : -0.2 });
  },

  fire(g, note, st, inst) { needles(g, note, st, inst); },

  remix: {
    id: 'galaxy', name: 'Galaxy', pedal: 'reverb',
    text: 'Octave accents in threes fling curling spiral arms from where you were a beat ago.',
    sound: 'octave accents in threes, across the beat.',
    // Three against four: a 16th run in groups of three, each group's first note an octave up (the root, then
    // the third), so the accents walk across the beat and only come home every three bars.
    steps: 48,
    pattern: Array.from({ length: 48 }, (_, s) => (s % 3 ? N(s, 3 - (s % 3), s % 3 === 1 ? 0.7 : 0.6) : { ...N(s, (s / 3) % 2 ? 4 : 3, 1), k: 'acc' })),
    stats: { damage: 20, streams: 4, arms: 6, armDamage: 30, armSpeed: 380, armLife: 1.15, armPierce: 4, curve: 2.6 },
    update(g, dt, st, inst) { track(g, inst); },
    fire(g, note, st, inst) {
      needles(g, note, st, inst);
      if (note.k !== 'acc') return;
      // An accent also flings a spiral of arms in every direction from where you were a beat ago, a comet
      // trailing you as you run. Each arm curls round in a tight circle (about 150 px across), so the galaxy
      // stays close to your path.
      const o = wasAt(g, inst, BEAT_SEC);
      const color = g.color(inst);
      const n = g.amount(st.arms);
      const base = note.s * TAU / 16 + g.time * 0.4;
      for (let i = 0; i < n; i++) {
        g.fx.bullet({ x: o.x, y: o.y, angle: base + (i / n) * TAU, speed: g.speed(st.armSpeed), r: st.size * 1.4, life: st.armLife,
          curve: st.curve, damage: g.dmg(st.armDamage) * note.v, pierce: st.armPierce, kb: 25, color, shape: 'star', spin: 9, trail: true });
      }
    },
  },
};

// One note's needles: straight, fast shots at enemies within `reach`, picked by the pitch from the nearest (the
// bottom of the run) to the farthest (its top), so a rising arpeggio reaches out across the crowd and a falling
// one comes back in. A second stream fires at an enemy farther out than the first, a third at one nearer in.
// The bar's first note goes for a boss in reach. Nobody in reach: the needles fly the way you face.
function needles(g, note, st, inst) {
  const p = g.player;
  const color = g.color(inst);
  const R = st.reach;
  const n = g.amount(st.streams);
  if (!n) return;
  const list = [];
  for (const e of g.inRadius(p.x, p.y, R)) if (e.spawnT <= 0.2) list.push([(e.x - p.x) ** 2 + (e.y - p.y) ** 2, e]);
  list.sort((a, b) => a[0] - b[0]);
  const k = list.length;
  const at = Math.round(lift(note, inst) * (k - 1));
  const step = Math.max(1, Math.round(k / 5));
  const boss = note.s === 0 ? g.bossInRange(p.x, p.y, R) : null;
  const speed = g.speed(st.speed), life = (R + 40) / speed;
  const face = g.aim();
  for (let i = 0; i < n; i++) {
    // 0: the pitch's rank, 1: farther out, 2: nearer in, then alternating wider.
    const off = i === 0 ? 0 : (i % 2 ? 1 : -1) * step * Math.ceil(i / 2);
    const t = i === 0 && boss ? boss : k ? list[Math.max(0, Math.min(k - 1, at + off))][1] : null;
    const a = t ? Math.atan2(t.y - p.y, t.x - p.x) : face + off * 0.25;
    g.fx.bullet({ x: p.x, y: p.y, angle: a, speed, r: st.size, life, damage: g.dmg(st.damage) * note.v, pierce: st.pierce,
      kb: 25, color, shape: 'shard' });
  }
}

// ---------------------------------------------------------------------------- Music Box (Live)

// A star takes one beat (4 steps, 0.5 s) to fall, so it lands in time with the music, one beat after its chime.
const FALL = 4 * STEP_SEC;

const BOX_1 = [N(0, 4, 1), N(6, 2, 0.85), N(12, 3, 0.9)];
const BOX_2 = [N(10, 4, 0.7)];
const BOX_3 = [N(3, 2, 0.6), N(8, 1, 0.65)];
const BOX_4 = [N(14, 2, 0.6)];
const BOX_5 = [N(5, 3, 0.55), N(15, 1, 0.5)];
// Lullaby's chimes: one a beat, ringing for the beat.
const LUL = (s, c, v = 1) => ({ ...N(s, c, v), d: 4 });

const musicBox = {
  id: 'musicbox',
  name: 'Music Box',
  role: 'arp',
  style: 'organic',
  blurb: 'A tiny, twinkling music box. The bar turns like its cylinder around you, and each chime drops a star at its own hour, landing a beat later.',
  steps: 16,
  low: 75,
  seventh: true,
  levels: [
    { text: 'Three soft chimes per bar. Each one drops a star around you at its place on the bar\'s clock face, higher notes farther out, onto an enemy near that spot.',
      pattern: [...BOX_1],
      stats: { damage: 52, radius: 46, stars: 1, ring0: 85, ringW: 110, snap: 140 } },
    { text: 'A fourth chime answers the first. Bigger stars.',
      pattern: [...BOX_1, ...BOX_2],
      stats: { damage: 54, radius: 50, stars: 1, ring0: 86, ringW: 110, snap: 140 } },
    { text: 'Two more chimes fill in the tune. Stars hit harder.',
      pattern: [...BOX_1, ...BOX_2, ...BOX_3],
      stats: { damage: 58, radius: 53, stars: 1, ring0: 87, ringW: 110, snap: 140 } },
    { text: 'Another chime near the end of each bar. Wider stars.',
      pattern: [...BOX_1, ...BOX_2, ...BOX_3, ...BOX_4],
      stats: { damage: 63, radius: 56, stars: 1, ring0: 88, ringW: 110, snap: 140 } },
    { text: 'The whole tune. Stars now freeze what they hit for a moment.',
      pattern: [...BOX_1, ...BOX_2, ...BOX_3, ...BOX_4, ...BOX_5],
      stats: { damage: 70, radius: 60, stars: 1, ring0: 90, ringW: 110, snap: 140, stun: 0.35 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    if (inst?.remix) {
      // Lullaby: a softer, longer-ringing tine over a warm hum an octave down; the wind-down notes sag flat,
      // like a box running out of spring.
      const flat = note.k === 'wind' ? -30 : 0;
      v.fm(ctx, out, t, { freq: note.freq, ratio: 7, index: 3, indexDecay: 0.15, a: 0.001, d: 1.4, s: 0, r: 0.3, dur: 0.02, gain: 0.4 * note.v, pan: 0.1, detune: flat });
      v.fm(ctx, out, t, { freq: note.freq / 2, ratio: 2, index: 0.6, indexDecay: 0.4, a: 0.01, d: 1.2, s: 0, r: 0.3, dur: 0.02, gain: 0.18 * note.v, pan: -0.15, detune: flat });
      v.tone(ctx, out, t, { freq: note.freq * 3, wave: 'sine', dur: 0.005, a: 0.001, d: 0.35, s: 0, r: 0.05, gain: 0.09 * note.v, detune: flat });
      return;
    }
    // FM bell with a high modulator: a glassy ping that fades to a pure tone, like a tuned metal tine.
    v.fm(ctx, out, t, { freq: note.freq, ratio: 7, index: 5, indexDecay: 0.1, a: 0.001, d: 0.75, s: 0, r: 0.2, dur: 0.02, gain: 0.42 * note.v, pan: 0.1 });
    // A faint, faster-fading upper partial gives the tine its sparkle.
    v.tone(ctx, out, t, { freq: note.freq * 3, wave: 'sine', dur: 0.005, a: 0.001, d: 0.25, s: 0, r: 0.05, gain: 0.14 * note.v });
  },

  fire(g, note, st, inst) {
    const p = g.player;
    const color = g.color(inst);
    const n = g.amount(st.stars);
    // The bar is a clock face around you, its downbeat at the top: each chime's star drops at its step's hour,
    // farther out the higher the note, so the tune draws the same constellation round you every bar. A star
    // falls on the enemy nearest its spot (within `snap`) and follows it down; with none it lands on the spot.
    // Stand still and the stars ring you; walk on and they land where you were.
    const R = g.area(st.ring0 + st.ringW * lift(note, inst));
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (note.s / 16) * TAU + (i / n) * TAU;
      const sx = p.x + Math.cos(a) * R, sy = p.y + Math.sin(a) * R;
      // The bar's first star falls on a boss near you.
      const e = (i === 0 && note.s === 0 && g.bossInRange(p.x, p.y, 300)) || g.nearest(sx, sy, g.area(st.snap));
      g.fx.strike({ x: e ? e.x : sx, y: e ? e.y : sy, target: e, delay: FALL, r: g.area(st.radius) * (0.8 + 0.2 * note.v),
        damage: g.dmg(st.damage) * note.v, kb: 60, stun: st.stun || 0, color, style: 'star' });
    }
  },

  remix: {
    id: 'lullaby', name: 'Lullaby', pedal: 'reverb',
    text: 'A slow falling lullaby rings stars around you: what they land on falls asleep, harmless and easier to hurt.',
    sound: 'a slow lullaby that winds down.',
    // Half time: one chime a beat, falling down the chord, four bars long. The fourth bar winds down.
    steps: 64,
    pattern: [
      LUL(0, 4), LUL(4, 3, 0.8), LUL(8, 2, 0.9), LUL(12, 1, 0.75),
      LUL(16, 3), LUL(20, 2, 0.8), LUL(24, 1, 0.9), LUL(28, 0, 0.75),
      LUL(32, 4), LUL(36, 2, 0.8), LUL(40, 3, 0.9), LUL(44, 1, 0.75),
      LUL(48, 2), LUL(52, 1, 0.8), LUL(56, 0, 0.9), { ...N(62, 1, 0.5), k: 'wind' }, { ...N(63, 0, 0.4), d: 1, k: 'wind' },
    ],
    stats: { ring: 8, ringMin: 90, ringMax: 200, reach: 250, radius: 66, damage: 100, stun: 0.35, sleep: 1.5, vuln: 0.35 },
    fire(g, note, st, inst) {
      const p = g.player;
      const color = g.color(inst);
      // A whole ring of stars around you, one in every direction, landing a beat later on the nearest ordinary
      // enemy that way (within `reach`), or else on the ring: high notes ring wide, low ones close, so the falling
      // tune draws the empty part of the ring in toward you. Each ring sits between the stars of the last.
      const n = g.amount(st.ring);
      const R = g.area(st.ringMin + (st.ringMax - st.ringMin) * lift(note, inst));
      const S = inst.state;
      S.lull = ((S.lull || 0) + 1) % 2;
      const a0 = g.aim() + (S.lull / 2) * TAU / Math.max(1, n);
      const near = n > 0 ? sectors(g, p, a0, n, st.reach) : [];
      // Every other bar the first chime saves its first star for a boss in range.
      const boss = note.s % 32 === 0 ? g.bossInRange(p.x, p.y, 300) : null;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i + 0.5) * TAU / n;
        const e = i === 0 && boss ? boss : near[i];
        g.fx.strike({ x: e ? e.x : p.x + Math.cos(a) * R, y: e ? e.y : p.y + Math.sin(a) * R, target: e, delay: FALL,
          r: g.area(st.radius), damage: g.dmg(st.damage) * note.v, kb: 40, stun: st.stun, color, style: 'star', onLand: (s, gg) => lull(gg, s, st) });
      }
    },
  },
};

// The nearest ordinary enemy (not a boss or an elite) within r of p in each of n equal slices of the circle
// starting at angle a0 (null where a slice is empty).
function sectors(g, p, a0, n, r) {
  const best = new Array(n).fill(null), bd = new Array(n).fill(Infinity);
  for (const e of g.inRadius(p.x, p.y, r)) {
    if (e.boss || e.elite || e.spawnT > 0.2) continue;
    const dx = e.x - p.x, dy = e.y - p.y, d = dx * dx + dy * dy;
    const i = Math.floor((((Math.atan2(dy, dx) - a0) % TAU + TAU) % TAU) / (TAU / n)) % n;
    if (d < bd[i]) { bd[i] = d; best[i] = e; }
  }
  return best;
}

// Lullaby: what a star lands on (not a boss) takes `vuln` more damage from every source (game.hit) for `sleep`
// seconds, and an ordinary enemy (not an elite either) falls asleep where it stands, harmless to touch: it is
// 'launched' nowhere (g.launch at speed 0, crashing into nothing) for `sleep` seconds. A star landing on a
// sleeper keeps it asleep.
function lull(g, s, st) {
  for (const e of g.inRadius(s.x, s.y, s.r)) {
    if (e.boss) continue;
    e.vuln = st.vuln;
    e.vulnUntil = Math.max(e.vulnUntil || 0, g.time + st.sleep);
    if (e.elite) continue;
    if (e.launch?.sleep) e.launch.t = Math.max(e.launch.t, st.sleep);
    else if (g.launch(e, 0, 0, 0, { t: st.sleep, max: 0 })) {
      e.launch.sleep = true;
      g.fx.particles(e.x, e.y - e.r, '#d8d0ff', 3, 30, 0.8, 2);
    }
  }
}

// ---------------------------------------------------------------------------- Coin Arp (8-Bit)

// Built from "ba-ding" pairs: the fifth jumping up to the root an octave higher, the classic coin blip.
// The "ding" rings for two steps.
const DING = (s, c = 3, k) => ({ ...N(s, c, 1), d: 2, ...(k ? { k } : {}) });
const COIN_1 = [N(2, 2, 0.8), DING(3), N(10, 2, 0.8), DING(11)];
const COIN_2 = [N(0, 0, 0.7), N(1, 1, 0.7), N(8, 0, 0.7), N(9, 1, 0.7)];
const COIN_3 = [N(6, 3, 0.8), N(7, 4, 0.95), N(14, 4, 0.8), N(15, 3, 0.9)];
const COIN_4 = [N(4, 1, 0.6), N(5, 2, 0.65), N(12, 2, 0.6), N(13, 3, 0.65)];
// Jackpot: a bar of "ba-ding" pairs from step b, bouncing 3-3-2 twice, the third ding of each half a third higher.
const JACK = (b) => [0, 3, 6, 8, 11, 14].flatMap((s, i) => [N(b + s, 2, 0.75), DING(b + s + 1, i % 3 === 2 ? 4 : 3, 'ding')]);

const chipArp = {
  id: 'chiparp',
  name: 'Coin Arp',
  role: 'arp',
  style: 'chip',
  blurb: 'Bright 8-bit blips, like grabbing coins in an old game. Each blip throws a coin along a compass line that comes back to you.',
  steps: 16,
  low: 71,
  levels: [
    { text: 'A coin sound twice per bar. Each of its notes throws a coin along the compass line nearest an enemy; it spins back to you and hits on both trips.',
      pattern: [...COIN_1],
      stats: { damage: 21, speed: 430, size: 7, throw: 1.02, pierce: 6, coins: 1, range: 340 } },
    { text: 'The coin sounds grow into quick climbing runs: higher notes throw farther.',
      pattern: [...COIN_1, ...COIN_2],
      stats: { damage: 21, speed: 440, size: 7, throw: 1.08, pierce: 6, coins: 1, range: 340 } },
    { text: 'Answering blips on beats 2 and 4. Coins fly farther.',
      pattern: [...COIN_1, ...COIN_2, ...COIN_3],
      stats: { damage: 25, speed: 450, size: 7, throw: 1.16, pierce: 7, coins: 1, range: 350 } },
    { text: 'A blip on every step. Coins cut through even more enemies.',
      pattern: [...COIN_1, ...COIN_2, ...COIN_3, ...COIN_4],
      stats: { damage: 26, speed: 460, size: 7.5, throw: 1.22, pierce: 9, coins: 1, range: 350 } },
    { text: 'Every blip throws two coins, the second along the next compass line.',
      pattern: [...COIN_1, ...COIN_2, ...COIN_3, ...COIN_4],
      stats: { damage: 30, speed: 480, size: 8, throw: 1.3, pierce: 9, coins: 2, range: 360 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    if (inst?.remix && note.k === 'up') {
      // Jackpot's one-up: a round square wave, the last note held with a quick wobble.
      v.tone(ctx, out, t, { freq: note.freq, duty: 0.5, dur: note.dur * 0.8, a: 0.001, d: 0.05, s: 0.7, r: 0.03, gain: 0.3 * note.v,
        vibrato: note.dur > STEP_SEC ? { rate: 9, depth: 25, delay: 0.1 } : null });
      return;
    }
    // Thin 12.5% pulse, short and clipped, the way old consoles played fast arpeggios.
    v.tone(ctx, out, t, { freq: note.freq, duty: 0.125, dur: note.dur * 0.6, a: 0.001, d: 0.04, s: 0.55, r: 0.02, gain: 0.78 * note.v,
      pan: note.s % 4 < 2 ? -0.15 : 0.15 });
    // Jackpot's "ding": a second blip an octave up on a wider pulse, the ka-ching of a coin landing.
    if (inst?.remix && note.k === 'ding') v.tone(ctx, out, t + 0.03, { freq: note.freq * 2, duty: 0.25, dur: 0.05, a: 0.001, d: 0.05, s: 0.4, r: 0.03,
      gain: 0.14 * note.v, pan: 0.3 });
  },

  fire(g, note, st, inst) { coins(g, note, st, inst, 1, null); },

  remix: {
    id: 'jackpot', name: 'Jackpot', pedal: 'delay',
    text: 'Coins that come home build a streak of extra damage until you are hit, and a one-up run pays it out.',
    sound: 'coins bouncing 3-3-2, then a one-up run.',
    // Three bars of coin "ba-dings" bouncing 3-3-2, then a one-up run up the chord on the fourth.
    steps: 64,
    pattern: [...JACK(0), ...JACK(16), ...JACK(32),
      ...[[1, 0.8], [2, 0.84], [4, 0.88], [3, 0.92], [8, 0.96], [4, 1]].map(([c, v], i) => ({ s: 48 + i, ...(c > 4 ? { sc: c } : { ct: c }), v, d: i === 5 ? 4 : 1, k: 'up' })),
      N(60, 2, 0.75), DING(61, 3, 'ding')],
    stats: { damage: 32, speed: 560, throw: 1.3, coins: 3, streakCap: 20, streakDmg: 0.02, payout: 10 },
    fire(g, note, st, inst) {
      const S = inst.state;
      if (g.lastHurtAt > (S.since ?? -Infinity)) { S.streak = 0; S.since = g.time; }   // a hit breaks the streak
      const mul = 1 + st.streakDmg * (S.streak || 0);
      // Only coins thrown since your last hit count: a hit breaks the streak, coins already in the air included.
      const t0 = g.time;
      const home = (b, gg) => { if (b.paid && gg.lastHurtAt < t0) jackpotStreak(gg, inst, st); return false; };
      if (note.k !== 'up') { coins(g, note, st, inst, mul, home); return; }
      // The one-up pays out: a ring of coins all around you, more the longer your streak, on the compass lines
      // and between them on alternate notes.
      const p = g.player;
      const n = g.amount(st.payout) + Math.floor((S.streak || 0) / 4);
      const color = coinColor(g, inst, st);
      const turn = (note.s % 2) * OCT / 2;
      for (let i = 0; i < n; i++) {
        g.fx.bullet({ x: p.x, y: p.y, angle: turn + (i / n) * TAU, speed: g.speed(st.speed), r: st.size * (1 + 0.02 * (S.streak || 0)),
          life: st.throw, damage: g.dmg(st.damage) * note.v * mul, pierce: st.pierce, kb: 30, color, shape: 'coin', spin: 14,
          boomerang: true, onHit: paid, onReturn: home });
      }
    },
  },
};

// One note's coins, thrown along the eight compass lines like an old game's sprites: the line nearest the
// nearest enemy (within `range`), and further coins on the lines beside it. Pitch sets how far a coin flies
// (high notes farther), so a run throws them out and back in a ripple. They come home to wherever you are by
// then, so moving drags their way back through the crowd. `mul` scales their damage (Jackpot's streak), and
// onReturn(b, g) runs when a coin gets home.
const OCT = Math.PI / 4;
const SIDES = [0, 1, -1, 2, -2, 3, -3, 4];
function coins(g, note, st, inst, mul, onReturn) {
  const p = g.player;
  const color = onReturn ? coinColor(g, inst, st) : g.color(inst);
  // Jackpot's dings scatter their coins at anyone in reach.
  const target = onReturn && note.k === 'ding' ? g.randomEnemy(p.x, p.y, st.range) : g.nearest(p.x, p.y, st.range);
  const raw = target ? Math.atan2(target.y - p.y, target.x - p.x) : g.aim();
  const base = Math.round(raw / OCT) * OCT;
  const life = st.throw * (0.85 + 0.3 * lift(note, inst));
  const n = g.amount(st.coins);
  const r = st.size * (1 + 0.02 * (onReturn ? inst.state.streak || 0 : 0));
  for (let i = 0; i < n; i++) {
    const a = base + SIDES[i % SIDES.length] * OCT;
    g.fx.bullet({ x: p.x, y: p.y, angle: a, speed: g.speed(st.speed), r, life,
      damage: g.dmg(st.damage) * note.v * mul, pierce: st.pierce, kb: 30, color, shape: 'coin', spin: 14, boomerang: true,
      onHit: onReturn ? paid : null, onReturn });
  }
}

// Jackpot: a coin that hit something and makes it home adds one to the streak (up to streakCap). Coins
// turn gold from halfway up.
const paid = (b) => { b.paid = true; };
const coinColor = (g, inst, st) => ((inst.state.streak || 0) >= st.streakCap / 2 ? '#ffd166' : g.color(inst));
function jackpotStreak(g, inst, st) {
  const S = inst.state;
  if (g.lastHurtAt > (S.since ?? -Infinity)) { S.streak = 0; S.since = g.time; }   // a hit since the last count
  if ((S.streak || 0) >= st.streakCap) return;
  S.streak = (S.streak || 0) + 1;
  if (S.streak % 5 === 0) g.fx.text(g.player.x, g.player.y - 34, `x${S.streak}`, '#ffd166', 13);
}

export default [arpSynth, musicBox, chipArp];
