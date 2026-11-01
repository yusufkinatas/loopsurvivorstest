// BEAT, Heavy: Double Kick. A metal kit: a tight, clicky kick and a cracking snare. You steer the drums:
// every kick fires a wedge the way you are moving, every snare a stunning wedge behind you, so whether you
// charge into the pit or run from it, both sides are covered. The fast double kicks (soft 16ths) alternate
// feet, fanning left and right, and only the full-strength kicks duck the mix, so a 16th run never pumps it.
// With a boss in range the kicks turn to it and reach it (the snares still guard your back).

// Pattern helpers: step s (0..15), velocity v, kind k.
const K = (s, v = 1) => ({ s, v, k: 'kick' });
const S = (s, v = 1) => ({ s, v, k: 'snare' });

// Each level keeps the one before and adds to it. The snare (the second note) plays the fills.
const BEAT_1 = [K(0), S(4), K(8), S(12)];
const BEAT_2 = [...BEAT_1, K(10, 0.8)];
const BEAT_3 = [...BEAT_2, K(2, 0.7), K(3, 0.75)];                  // the gallop: kick, ki-ki, snare
const BEAT_4 = [...BEAT_3, K(14, 0.7), K(15, 0.8)];                 // a double kick into every bar
const BEAT_5 = [...BEAT_4, K(9, 0.55), K(11, 0.55), K(13, 0.55)];   // 16th double kicks under the second half

// Wall of Death: a half-time breakdown. One snare a bar on beat 3, syncopated kicks with the chugs before it,
// and a solid 16th double kick run after it.
const WALL = [K(0), K(3, 0.8), K(6, 0.8), S(8), K(9, 0.55), K(10, 0.6), K(11, 0.55), K(12, 0.6), K(13, 0.55), K(14, 0.7), K(15, 0.8)];

const STRONG = 0.9;    // kicks at this velocity or more duck the mix and fire straight ahead
const FOOT = 0.45;     // radians a soft double kick fans off to its foot's side

export default {
  id: 'doublekick',
  name: 'Double Kick',
  role: 'beat',
  style: 'heavy',
  blurb: 'Metal drums you steer: kicks blast ahead of you, snares behind.',
  steps: 16,
  levels: [
    { text: 'Kicks blast ahead. Snares stun behind you.',
      pattern: BEAT_1,
      stats: { damage: 15, radius: 165, spread: 1.22, kb: 220, stun: 0.2 } },
    { text: 'An extra kick just after beat 3.',
      pattern: BEAT_2,
      stats: { damage: 16, radius: 172, spread: 1.26, kb: 220, stun: 0.2 } },
    { text: 'A galloping kick after the downbeat.',
      pattern: BEAT_3,
      stats: { damage: 17, radius: 180, spread: 1.32, kb: 220, stun: 0.22 } },
    { text: 'A double kick into every bar. Wider blasts.',
      pattern: BEAT_4,
      stats: { damage: 19, radius: 192, spread: 1.42, kb: 220, stun: 0.25 } },
    { text: 'Rolling 16th double kicks fan out both ways.',
      pattern: BEAT_5,
      stats: { damage: 25, radius: 215, spread: 1.6, kb: 220, stun: 0.3 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    const rx = !!inst?.remix;
    if (note.k === 'kick') {
      // A tight, high-tuned kick with a hard beater click. Remixed, it drops lower and booms longer.
      v.kick(ctx, out, t, { f0: rx ? 170 : 190, f1: rx ? 48 : 52, pitchDecay: 0.04, decay: (rx ? 0.35 : 0.33) + 0.06 * note.v,
        gain: 0.86 * note.v, click: 0.12 * note.v });
      // The beater: a short knock in the low mids that keeps fast 16ths readable.
      v.tone(ctx, out, t, { freq: 420, wave: 'triangle', dur: 0.004, d: 0.025, s: 0, r: 0.01, gain: 0.1 * note.v, pitchEnv: { from: 1.5, time: 0.012 } });
      if (note.v >= STRONG) {
        // Only full-strength kicks duck. Wall of Death (remix): the downbeat pumps the whole mix hard.
        const deep = rx && note.s === 0;
        A.duck(t, (deep ? 0.62 : 0.38) * note.v, deep ? 0.32 : 0.16);
      }
    } else {
      // A cracking metal snare: a high, tight body and a bright rattle. Remixed, the crack is lower, fatter and longer.
      v.snare(ctx, out, t, { tone: rx ? 190 : 210, body: (rx ? 0.58 : 0.54) * note.v, rattle: (rx ? 0.34 : 0.3) * note.v,
        decay: rx ? 0.22 : 0.17, bright: 2400 });
    }
  },

  fire(g, note, st, inst) {
    const p = g.player;
    const color = g.color('beat');
    const ahead = g.aim();
    if (note.k === 'kick') {
      // Kicks turn to a boss in range and reach it.
      const boss = g.bossInRange(p.x, p.y, 240);
      let angle = ahead, r = g.area(st.radius) * (0.8 + 0.2 * note.v);
      if (boss) {
        angle = Math.atan2(boss.y - p.y, boss.x - p.x);
        r = Math.max(r, Math.hypot(boss.x - p.x, boss.y - p.y) - boss.r * 0.5);
      } else if (note.v < STRONG) {
        // A soft kick is a double kick: right foot on even steps, left foot on odd ones.
        angle += note.s & 1 ? -FOOT : FOOT;
      }
      g.fx.cone({ x: p.x, y: p.y, angle, spread: st.spread, r, damage: g.dmg(st.damage) * note.v, kb: st.kb * (0.5 + 0.5 * note.v), color });
      g.shake = Math.max(g.shake, 2.2 * note.v);
    } else {
      // Snares crack behind you, wider and shorter, and stun what they hit.
      g.fx.cone({ x: p.x, y: p.y, angle: ahead + Math.PI, spread: st.spread + 0.5, r: g.area(st.radius) * 0.9, damage: g.dmg(st.damage) * note.v,
        kb: st.kb * 0.7, stun: st.stun, color, life: 0.24 });
      g.shake = Math.max(g.shake, 1.6 * note.v);
    }
  },

  remix: {
    id: 'wallofdeath', name: 'Wall of Death', pedal: 'compressor',
    text: 'Each downbeat hurls the crowd together in front of you, or into a boss.',
    sound: 'a half-time breakdown, and the downbeat pumps the whole mix.',
    pattern: WALL,
    stats: { damage: 28, radius: 230, wallRadius: 270, wallDamage: 1.5, crash: 0.9, crashMax: 6 },
    fire(g, note, st, inst) {
      if (note.k !== 'kick' || note.s !== 0) { this.fire(g, note, st, inst); return; }
      wallOfDeath(g, note, st);
    },
  },
};

// Wall of Death: every enemy around you is launched. Those ahead of you and beside you fly across to your
// path a little ahead of where they stand, so the two halves of the crowd crash into each other right where
// your next kicks land; those behind you are hurled straight away. With a boss in range, the whole crowd is
// slammed into the boss instead. Every crash hits, and each one takes the shove itself where it lands.
// Bosses and elites stand their ground and take the shove at once.
function wallOfDeath(g, note, st) {
  const p = g.player;
  const color = g.color('beat');
  const R = g.area(st.wallRadius);
  const boss = g.bossInRange(p.x, p.y, R);
  const a = boss ? Math.atan2(boss.y - p.y, boss.x - p.x) : g.aim(), fx = Math.cos(a), fy = Math.sin(a);
  const dmg = g.dmg(st.damage) * note.v;
  const shove = dmg * st.wallDamage;
  const land = (e, gg) => gg.hit(e, shove, { fx: e.x, fy: e.y });
  for (const e of g.inRadius(p.x, p.y, R)) {
    if (e.spawnT > 0) continue;
    if (e.boss || e.elite) { g.hit(e, shove * (e.boss ? 1.25 : 1), { kb: 160, fx: p.x, fy: p.y }); continue; }
    const dx = e.x - p.x, dy = e.y - p.y;
    const along = dx * fx + dy * fy;
    let tx, ty;
    if (boss) { tx = boss.x; ty = boss.y; }
    else if (along > -24) {
      // To the path line, a little further ahead than it stands.
      tx = p.x + fx * (Math.max(0, along) + 60); ty = p.y + fy * (Math.max(0, along) + 60);
    } else { tx = e.x + dx; ty = e.y + dy; }
    const ang = Math.atan2(ty - e.y, tx - e.x);
    // A launch covers about a quarter of its speed in px before it stops (0.35 s with drag).
    const dist = Math.min(Math.hypot(tx - e.x, ty - e.y), 300) + 30;
    if (!g.launch(e, ang, Math.min(900, Math.max(260, dist * 3.9)), dmg * st.crash, { max: st.crashMax, onLand: land })) {
      g.hit(e, shove, { kb: 160, fx: p.x, fy: p.y });
    }
  }
  g.fx.ring({ x: p.x, y: p.y, follow: true, r0: 20, r1: R, dur: 0.22, damage: 0, color, width: 10 });
  g.fx.cone({ x: p.x, y: p.y, angle: a, spread: 1.22, r: R * 0.9, damage: 0, color, life: 0.3 });
  g.shake = Math.max(g.shake, 5);
}
