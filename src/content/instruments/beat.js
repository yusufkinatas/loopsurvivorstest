// BEAT channel: kicks and snares. The reference implementation for the instrument format
// (see docs/INSTRUMENTS.md). Low, heavy, on the beat: big area hits around the player.

// Pattern helpers: step s (0..15), velocity v, kind k.
const K = (s, v = 1) => ({ s, v, k: 'kick' });
const S = (s, v = 1) => ({ s, v, k: 'snare' });
const R = (s, v = 1) => ({ s, v, k: 'rim' });

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

  sound(A, t, note, out) {
    const { ctx, v } = A;
    if (note.k === 'kick') {
      v.kick(ctx, out, t, { f0: 150, f1: 44, pitchDecay: 0.075, decay: 0.42 + 0.1 * note.v, gain: 0.8 * note.v, click: 0.15 });
      A.duck(t, 0.42 * note.v, 0.22);
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
      g.fx.ring({ x: p.x, y: p.y, follow: true, r0: 16, r1: g.area(st.radius) * (0.75 + 0.25 * note.v), dur: 0.26,
        damage: g.dmg(st.damage) * note.v, kb: st.kb, stun: st.stun || 0, color, width: 7 });
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

  sound(A, t, note, out) {
    const { ctx, v } = A;
    if (note.k === 'kick') {
      v.tone(ctx, out, t, { freq: 62, wave: 'sine', dur: 0.05, d: 0.55, s: 0, r: 0.1, gain: 0.9 * note.v, pitchEnv: { from: 2.1, time: 0.06 } });
      v.tone(ctx, out, t, { freq: 124, wave: 'triangle', dur: 0.02, d: 0.18, s: 0, gain: 0.25 * note.v, pitchEnv: { from: 1.6, time: 0.04 } });
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
        g.fx.pulse({ x, y, r: g.area(st.radius) * (0.8 + 0.2 * note.v), damage: g.dmg(st.damage) * note.v, kb: st.kb, stun: st.stun, color, fill: 0.3 });
        g.fx.particles(x, y, color, 10, 240, 0.4, 3);
      };
      const spot = g.densest(460);
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

  sound(A, t, note, out) {
    const { ctx, v } = A;
    if (note.k === 'kick') {
      v.tone(ctx, out, t, { freq: 55, wave: 'triangle', dur: 0.03, d: 0.2, s: 0, r: 0.03, gain: 0.78 * note.v, sub: 0.4, pitchEnv: { from: 4, time: 0.045 } });
      v.noise(ctx, out, t, { dur: 0.004, d: 0.02, gain: 0.25 * note.v, chip: 20, filter: { type: 'lowpass', freq: 3000 } });
      A.duck(t, 0.35 * note.v, 0.18);
    } else {
      v.noise(ctx, out, t, { dur: 0.01, d: 0.13, gain: 0.5 * note.v, chip: 3, filter: { type: 'highpass', freq: 900 } });
      v.tone(ctx, out, t, { freq: 220, duty: 0.25, dur: 0.01, d: 0.05, s: 0, gain: 0.12 * note.v, pitchEnv: { from: 1.8, time: 0.03 } });
    }
  },

  fire(g, note, st) {
    const p = g.player;
    const color = g.color('beat');
    const n = g.amount(st.count || 1);
    const target = g.nearest(p.x, p.y, 520);
    const base = target ? Math.atan2(target.y - p.y, target.x - p.x) : g.aim();
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.35;
      g.fx.bullet({ x: p.x, y: p.y, angle: a, speed: g.speed(st.speed) * (note.k === 'kick' ? 0.9 : 1.1),
        r: st.size * (note.k === 'kick' ? 1.1 : 0.85), life: 1.6, damage: g.dmg(st.damage) * note.v,
        bounce: st.bounce, pierce: st.pierce || 0, kb: 70, color, shape: 'square', spin: 8 });
    }
  },
};

export default [kick808, taiko, chipDrums];
