// BASS channel: the low notes. Roots and fifths that lock onto the kick, syncopated at higher levels.
// Heavy and close: pulses around the player, slugs that bowl through the front row, mines tossed into the crowd.

import { STEP_SEC } from '../../config.js';

// Pattern helpers: step s (0..15), duration d in steps, velocity v.
// R root, F fifth, O root an octave up (chord tones, so they follow every chord change).
const R = (s, d = 1, v = 1) => ({ s, v, d, ct: 0 });
const F = (s, d = 1, v = 1) => ({ s, v, d, ct: 2 });
const O = (s, d = 1, v = 1) => ({ s, v, d, ct: 0, o: 1 });
// W walking note: scale step n from the chord root (0 root, 1 second, 2 third, 3 fourth, 4 fifth).
const W = (s, n, d = 1, v = 1) => ({ s, v, d, sc: n });
// Slap Bass: a thumb slap on scale step n, a popped string (the octave by default), a muted dead note.
const TH = (s, n, d = 1, v = 1) => ({ s, v, d, sc: n, k: 'thumb' });
const PP = (s, n = 7, v = 1) => ({ s, v, d: 1, sc: n, k: 'pop' });
const DN = (s, v = 0.45) => ({ s, v, d: 1, sc: 0, k: 'dead' });

// The nearest enemy within `half` radians of `angle` (a side of you), or null.
function nearestArc(g, angle, half, range) {
  const p = g.player, ax = Math.cos(angle), ay = Math.sin(angle), c = Math.cos(half);
  let best = null, bd = range * range;
  g.grid.query(p.x, p.y, range, (e) => {
    if (e.dead || e.spawnT > 0.2) return;
    const dx = e.x - p.x, dy = e.y - p.y, d = dx * dx + dy * dy;
    if (d < bd && dx * ax + dy * ay >= c * Math.sqrt(d)) { bd = d; best = e; }
  });
  return best;
}

// ---------------------------------------------------------------------------- Sub Bass (Synth)

const subBass = {
  id: 'subbass',
  name: 'Sub Bass',
  role: 'bass',
  style: 'synth',
  blurb: 'A deep electronic hum you feel in your chest. Every note pulses around you, hurting and slowing anything close.',
  steps: 16,
  low: 28,
  levels: [
    { text: 'Long, deep notes on beats 1 and 3. Each one pulses around you and slows what it hits.',
      pattern: [R(0, 7), R(8, 7, 0.95)],
      stats: { damage: 17, radius: 130, slow: 0.35, kb: 45 } },
    { text: 'Adds a jump to a higher note in between. One more pulse every bar.',
      pattern: [R(0, 6), O(6, 2, 0.75), R(8, 7, 0.95)],
      stats: { damage: 20, radius: 145, slow: 0.38, kb: 45 } },
    { text: 'Adds a note on beat 4. Pulses reach farther.',
      pattern: [R(0, 6), O(6, 2, 0.75), R(8, 4, 0.95), F(12, 3, 0.85)],
      stats: { damage: 25, radius: 175, slow: 0.42, kb: 50 } },
    { text: 'A quick rolling run closes each bar. Pulses slow even harder.',
      pattern: [R(0, 6), O(6, 2, 0.75), R(8, 4, 0.95), F(12, 2, 0.85), O(14, 1, 0.7), R(15, 1, 0.65)],
      stats: { damage: 30, radius: 210, slow: 0.48, kb: 50 } },
    { text: 'Full rolling groove. Much wider pulses, and the longest notes now stun what is close.',
      pattern: [R(0, 3), R(3, 3, 0.6), O(6, 2, 0.75), R(8, 3, 0.95), O(11, 1, 0.55), F(12, 2, 0.85), O(14, 1, 0.7), R(15, 1, 0.65)],
      stats: { damage: 40, radius: 265, slow: 0.52, kb: 55, stun: 0.3 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    if (inst?.remix) {
      // Wobble Bass (remix): a gritty saw through a resonant lowpass that opens across every note (wub, wub),
      // over a clean sine that holds the floor.
      v.tone(ctx, out, t, { freq: note.freq, wave: 'sine', dur: note.dur * 0.9, a: 0.005, d: 0.08, s: 0.85, r: 0.05, gain: 0.09 * note.v });
      v.tone(ctx, out, t, { freq: note.freq, wave: 'sawtooth', dur: note.dur * 0.9, a: 0.004, d: 0.1, s: 0.9, r: 0.04, gain: 0.17 * note.v, drive: 2,
        filter: { type: 'lowpass', freq: 110, to: 820, time: note.dur * 0.8, q: 7 } });
      return;
    }
    // Round sine body, plus a softly filtered saw at the same pitch whose overtones keep it audible on small speakers.
    v.tone(ctx, out, t, { freq: note.freq, wave: 'sine', dur: note.dur, a: 0.008, d: 0.12, s: 0.8, r: 0.12, gain: 0.085 * note.v });
    v.tone(ctx, out, t, { freq: note.freq, wave: 'sawtooth', dur: note.dur, a: 0.005, d: 0.18, s: 0.7, r: 0.1, gain: 0.23 * note.v,
      filter: { type: 'lowpass', freq: 480, q: 0.8, env: 2, decay: 0.14 } });
  },

  fire(g, note, st) {
    const p = g.player;
    const color = g.color('bass');
    // Long notes hit harder: a one-step note deals 75%, a six-step note 150%.
    const steps = note.dur / STEP_SEC;
    const len = Math.min(1.5, 0.6 + 0.15 * steps);
    const long = steps >= 3;
    g.fx.pulse({ x: p.x, y: p.y, r: g.area(st.radius) * (0.85 + 0.15 * note.v), damage: g.dmg(st.damage) * note.v * len,
      kb: st.kb, slow: st.slow, stun: long ? st.stun || 0 : 0, color, fill: long ? 0.26 : 0.16, flashLife: long ? 0.3 : 0.2 });
    g.shake = Math.max(g.shake, (long ? 2 : 1) * note.v);
  },

  // Retriggered 8ths that wobble, and a zone around you that breathes with them: the 8ths on the beat throw a
  // ring out, the 8ths between pull one back in, so a crowd you stand in sways in and out, slowed, taking hits.
  remix: {
    id: 'wobblebass', name: 'Wobble Bass', pedal: 'wah',
    text: 'Your zone breathes: on-beat notes push the crowd out, off-beat notes pull it back in.',
    sound: 'retriggered eighths whose filter wobbles open on every note.',
    pattern: [R(0, 2), R(2, 2, 0.8), O(4, 2, 0.9), R(6, 2, 0.8), R(8, 2, 0.95), R(10, 2, 0.8), F(12, 1, 0.85), F(13, 1, 0.7), O(14, 2, 0.9)],
    stats: { damage: 46, push: 70, pull: 170, reach: 1.15, draw: 1.45 },
    fire(g, note, st) {
      const p = g.player, R0 = 24, R1 = g.area(st.radius) * (0.85 + 0.15 * note.v);
      const out = (note.s & 2) === 0;   // steps 0, 4, 8, 12 breathe out, 2, 6, 10, 14 breathe in
      g.fx.ring({ x: p.x, y: p.y, follow: true, r0: out ? R0 : R1 * st.draw, r1: out ? R1 * st.reach : R0, dur: Math.max(1.5 * STEP_SEC, note.dur * 0.9),
        damage: g.dmg(st.damage) * note.v, kb: out ? st.push : -st.pull, slow: out ? st.slow : 0, color: g.color('bass'), width: out ? 10 : 6 });
      g.shake = Math.max(g.shake, 1.4 * note.v);
    },
  },
};

// ---------------------------------------------------------------------------- Upright Bass (Live)

const upright = {
  id: 'upright',
  name: 'Upright Bass',
  role: 'bass',
  style: 'organic',
  blurb: 'A big plucked double bass, warm and woody. Every note fires a heavy slug that bowls through enemies.',
  steps: 16,
  low: 31,
  levels: [
    { text: 'Four plucks per bar. Each one fires a heavy slug at the closest enemy.',
      pattern: [W(0, 0, 4), W(4, 4, 4, 0.85), W(8, 0, 4, 0.95), W(12, 4, 4, 0.85)],
      stats: { damage: 38, pierce: 1, size: 9, speed: 290, kb: 170 } },
    { text: 'Adds a quick pickup note at the end of every bar.',
      pattern: [W(0, 0, 4), W(4, 4, 4, 0.85), W(8, 0, 4, 0.95), W(12, 4, 2, 0.85), W(14, 2, 2, 0.75)],
      stats: { damage: 39, pierce: 1, size: 9.5, speed: 295, kb: 175 } },
    { text: 'The line starts walking between notes. Slugs punch through one more enemy.',
      pattern: [W(0, 0, 4), W(4, 4, 2, 0.85), W(6, 3, 2, 0.75), W(8, 0, 2, 0.95), W(10, 2, 2, 0.75), W(12, 4, 2, 0.85), W(14, 2, 2, 0.75)],
      stats: { damage: 40, pierce: 2, size: 10, speed: 300, kb: 180 } },
    { text: 'Soft muted plucks fill the gaps. Bigger slugs punch through one more enemy.',
      pattern: [W(0, 0, 3), W(3, 0, 1, 0.5), W(4, 4, 2, 0.85), W(6, 3, 2, 0.75), W(8, 0, 2, 0.95), W(10, 2, 2, 0.75), W(12, 4, 2, 0.85), W(14, 2, 1, 0.75), W(15, 1, 1, 0.6)],
      stats: { damage: 46, pierce: 3, size: 11, speed: 305, kb: 195 } },
    { text: 'Full walking line. Slugs plow through five enemies and hit even harder.',
      pattern: [W(0, 0, 3), W(3, 0, 1, 0.5), W(4, 4, 2, 0.85), W(6, 3, 1, 0.75), W(7, 1, 1, 0.55), W(8, 0, 2, 0.95), W(10, 2, 1, 0.75), W(11, 0, 1, 0.5), W(12, 4, 2, 0.85), W(14, 2, 1, 0.75), W(15, 1, 1, 0.6)],
      stats: { damage: 53, pierce: 4, size: 12.5, speed: 310, kb: 210 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    const f = note.freq;
    if (inst?.remix) {
      // Slap Bass (remix): steel strings through a bit of overdrive. The thumb slaps a bright, fat note with a
      // click, the pop snaps the octave, and a dead note is just the thud of a muted string.
      if (note.k === 'dead') {
        v.noise(ctx, out, t, { dur: 0.004, d: 0.045, gain: 0.3 * note.v, filter: { type: 'lowpass', freq: 520 } });
        v.tone(ctx, out, t, { freq: f, wave: 'triangle', dur: 0.01, d: 0.06, s: 0, gain: 0.25 * note.v });
        return;
      }
      const pop = note.k === 'pop';
      v.pluck(ctx, out, t, { freq: f, decay: pop ? 0.985 : 0.992, bright: pop ? 0.6 : 0.35, dur: pop ? 0.22 : Math.max(0.25, note.dur + 0.08), gain: (pop ? 0.4 : 0.55) * note.v,
        drive: 1.6, filter: { type: 'lowpass', freq: pop ? 520 : 330, q: 0.9, env: 2.4, decay: 0.07 } });
      v.tone(ctx, out, t, { freq: f, wave: 'sine', dur: 0.02, d: pop ? 0.14 : 0.3, s: 0, r: 0.05, gain: (pop ? 0.22 : 0.42) * note.v });
      v.noise(ctx, out, t, { dur: 0.003, d: pop ? 0.02 : 0.025, gain: (pop ? 0.07 : 0.06) * note.v, filter: { type: 'bandpass', freq: pop ? 2400 : 1300, q: 1.4 } });
      return;
    }
    // The string itself, darkened so it sounds like gut strings rather than a guitar.
    v.pluck(ctx, out, t, { freq: f, decay: 0.995, bright: 0.12, dur: Math.max(0.35, note.dur + 0.12), gain: 0.75 * note.v,
      filter: { type: 'lowpass', freq: 300, q: 0.7, env: 1.8, decay: 0.12 } });
    // Wooden body: a sine thump at the note that fades fast.
    v.tone(ctx, out, t, { freq: f, wave: 'sine', dur: 0.02, d: 0.4, s: 0, r: 0.06, gain: 0.4 * note.v });
    // Finger on the string.
    v.noise(ctx, out, t, { dur: 0.003, d: 0.025, gain: 0.05 * note.v, filter: { type: 'bandpass', freq: 700, q: 1.2 } });
  },

  fire(g, note, st) {
    const p = g.player;
    const color = g.color('bass');
    const target = g.nearest(p.x, p.y, 520);
    const a = target ? Math.atan2(target.y - p.y, target.x - p.x) : g.aim();
    g.fx.bullet({ x: p.x, y: p.y, angle: a, rot: a, speed: g.speed(st.speed), r: st.size * (0.8 + 0.2 * note.v), life: 1.5,
      damage: g.dmg(st.damage) * note.v, pierce: st.pierce, kb: st.kb, color, shape: 'seed', trail: true });
  },

  // A slap line: thumbed roots fire the slug, and every popped octave blasts a wedge where you face and
  // smacks the closest enemy in it flying, bowling into the ones behind. Dead notes shove the close ones off you.
  remix: {
    id: 'slapbass', name: 'Slap Bass', pedal: 'overdrive',
    text: 'Pops blast where you face and smack an enemy flying into the crowd.',
    sound: 'slapped roots, popped octaves on the off-beats and muted dead notes.',
    pattern: [TH(0, 0, 2), PP(2), TH(3, 0, 1, 0.6), TH(4, 4, 1, 0.85), PP(6, 7, 0.9), DN(7), TH(8, 0, 2, 0.95), PP(10),
      TH(11, 0, 1, 0.6), TH(12, 4, 1, 0.85), PP(14, 7, 0.9), DN(15)],
    stats: { damage: 70, pierce: 6, popDamage: 85, popReach: 240, popSpread: 1.2, popLaunch: 720, popCrash: 44, thudRadius: 80, deadDamage: 40, deadRadius: 100 },
    fire(g, note, st, inst) {
      const p = g.player, color = g.color('bass');
      if (note.k === 'pop') {
        // Where you face, turned onto the closest enemy in front of you (else the closest one at all).
        const reach = g.area(st.popReach);
        const e = nearestArc(g, g.aim(), 1.4, reach) || g.nearest(p.x, p.y, reach);
        const a = e ? Math.atan2(e.y - p.y, e.x - p.x) : g.aim();
        g.fx.cone({ x: p.x, y: p.y, angle: a, spread: st.popSpread, r: reach, damage: g.dmg(st.popDamage) * note.v, kb: 160, color });
        // The smacked enemy flies the way you popped it, bowling into the crowd, and lands with a thud.
        const crash = g.dmg(st.popCrash) * note.v, thud = g.area(st.thudRadius);
        if (e && !e.dead) g.launch(e, a, g.speed(st.popLaunch), crash, { onLand: (f, gg) => gg.fx.pulse({ x: f.x, y: f.y, r: thud, damage: crash, kb: 140, color, fill: 0.25 }) });
        g.shake = Math.max(g.shake, 2.5 * note.v);
      } else if (note.k === 'dead') {
        g.fx.pulse({ x: p.x, y: p.y, r: g.area(st.deadRadius), damage: g.dmg(st.deadDamage) * note.v, kb: 240, color, fill: 0.12, flashLife: 0.12 });
      } else this.fire(g, note, st, inst);
    },
  },
};

// ---------------------------------------------------------------------------- Triangle Bass (8-Bit)

const triBass = {
  id: 'tribass',
  name: 'Triangle Bass',
  role: 'bass',
  style: 'chip',
  blurb: 'The bouncy low line of old game consoles. Every note tosses a mine into the crowd, and mines blow up on the beat.',
  steps: 16,
  low: 28,
  levels: [
    { text: 'Low and high notes bounce back and forth. Each note tosses a mine into the nearest crowd, and mines with enemies on them blow up.',
      pattern: [R(0, 2), O(2, 2, 0.8), R(8, 2, 0.95), O(10, 2, 0.8)],
      stats: { damage: 9, radius: 54, kb: 90, count: 1, toss: 336 } },
    { text: 'The bounce carries through beat 2. Two more blasts every bar.',
      pattern: [R(0, 2), O(2, 2, 0.8), R(4, 2, 0.9), O(6, 2, 0.8), R(8, 2, 0.95), O(10, 2, 0.8)],
      stats: { damage: 9, radius: 57, kb: 95, count: 1, toss: 352 } },
    { text: 'Bounces on every half beat. Bigger blasts.',
      pattern: [R(0, 2), O(2, 2, 0.8), R(4, 2, 0.9), O(6, 2, 0.8), R(8, 2, 0.95), O(10, 2, 0.8), F(12, 2, 0.9), O(14, 2, 0.8)],
      stats: { damage: 11, radius: 64, kb: 100, count: 1, toss: 368 } },
    { text: 'Quick extra hops between the bounces. Blasts throw enemies back harder.',
      pattern: [R(0, 2), O(2, 1, 0.8), O(3, 1, 0.55), R(4, 2, 0.9), O(6, 2, 0.8), R(8, 2, 0.95), O(10, 1, 0.8), O(11, 1, 0.55), F(12, 2, 0.9), O(14, 2, 0.8)],
      stats: { damage: 13, radius: 70, kb: 120, count: 1, toss: 384 } },
    { text: 'Full bouncing line. Every note tosses a second mine at another enemy.',
      pattern: [R(0, 2), O(2, 1, 0.8), O(3, 1, 0.55), R(4, 2, 0.9), O(6, 1, 0.8), R(7, 1, 0.55), R(8, 2, 0.95), O(10, 1, 0.8), O(11, 1, 0.55), F(12, 2, 0.9), O(14, 1, 0.8), R(15, 1, 0.6)],
      stats: { damage: 14, radius: 79, kb: 130, count: 2, toss: 416 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    if (inst?.remix) {
      // Blown Speaker (remix): the square channel through a fuzz about to tear the cone, a dark lowpass on top,
      // and a clean triangle under it to hold the floor.
      v.tone(ctx, out, t, { freq: note.freq, duty: 0.5, dur: note.dur * 0.92, a: 0.003, d: 0.2, s: 0.75, r: 0.04, gain: 0.19 * note.v, drive: 6,
        filter: { type: 'lowpass', freq: 640, q: 1.1, env: 2.4, decay: 0.12 } });
      v.tone(ctx, out, t, { freq: note.freq, wave: 'triangle', dur: note.dur * 0.92, a: 0.002, d: 0.05, s: 0.9, r: 0.03, gain: 0.14 * note.v,
        pitchEnv: { from: 1.12, time: 0.015 } });
      return;
    }
    // The console triangle channel: just on and off with a tiny pitch hop, plus a thin pulse wave for bite.
    v.tone(ctx, out, t, { freq: note.freq, wave: 'triangle', dur: note.dur * 0.85, a: 0.002, d: 0.04, s: 0.9, r: 0.02, gain: 0.3 * note.v,
      pitchEnv: { from: 1.12, time: 0.015 } });
    v.tone(ctx, out, t, { freq: note.freq, duty: 0.25, dur: note.dur * 0.85, a: 0.002, d: 0.08, s: 0.5, r: 0.02, gain: 0.15 * note.v });
  },

  fire(g, note, st, inst) {
    const p = g.player;
    const color = g.color('bass');
    const id = inst.def.id;
    // Mines already lying in a crowd go off on the beat; the rest keep waiting.
    g.fx.detonateMines(id, 1, { armed: true });
    // Then toss fresh ones: the first into the thickest crowd nearby, extras onto other enemies.
    // With nobody around they land at your feet.
    const n = Math.max(1, g.amount(st.count));
    const spot = g.densest(st.toss);
    for (let i = 0; i < n; i++) {
      const e = i === 0 ? spot : g.randomEnemy(p.x, p.y, st.toss);
      const x = e ? e.x : p.x, y = e ? e.y : p.y;
      g.fx.mine({ owner: id, x, y, r: g.area(st.radius), damage: g.dmg(st.damage) * note.v,
        kb: st.kb, color, life: 5, max: n + 6, size: 6 + note.v * 2 });
      g.fx.particles(x, y, color, 3, 60, 0.25, 2);
    }
  },

  // A half-time fuzz line. The downbeat drops a speaker at your feet (the last two stay, two bars each), and
  // every note blasts a shockwave out of each speaker and still tosses the level 5 mines. Where you stand on
  // the downbeat is where the sound comes from: plant them and lead the crowd past.
  remix: {
    id: 'blownspeaker', name: 'Blown Speaker', pedal: 'overdrive',
    text: 'The downbeat drops a speaker at your feet that blasts on every note.',
    sound: 'a half-time root through a fuzz that is tearing the speaker.',
    pattern: [R(0, 6), O(6, 1, 0.7), R(7, 1, 0.6), F(10, 4, 0.9), O(14, 1, 0.7), R(15, 1, 0.65)],
    stats: { count: 3, speakerDamage: 24, speakerRadius: 175, speakerLife: 4.25, dropDamage: 40, dropRadius: 150 },
    fire(g, note, st, inst) {
      this.fire(g, note, st, inst);
      const p = g.player, color = g.color('bass');
      // The speakers have an owner of their own, so the tossed mines never push them out.
      const spk = inst.def.id + ':speaker';
      if (note.s === 0) {
        if (g.dmgScale === 1) {
          // Two speakers at most (the oldest goes); they never go off, they ring.
          g.fx.mine({ owner: spk, x: p.x, y: p.y, r: g.area(st.speakerRadius), damage: 0, kb: 0, color, life: st.speakerLife, max: 2, size: 11, persist: true });
        }
        g.fx.pulse({ x: p.x, y: p.y, r: g.area(st.dropRadius), damage: g.dmg(st.dropDamage) * note.v, kb: 220, color, fill: 0.3 });
        g.shake = Math.max(g.shake, 4 * note.v);
      }
      // Long notes blast harder: a one-step note 80%, a six-step note 130%.
      const len = Math.min(1.3, 0.7 + 0.1 * (note.dur / STEP_SEC));
      for (const m of g.fx.mines) {
        if (m.owner !== spk || m.age < 0.05) continue;
        m.glow = 1;
        g.fx.ring({ x: m.x, y: m.y, r0: 14, r1: m.r, dur: 0.3, damage: g.dmg(st.speakerDamage) * note.v * len, kb: 170, color, width: 7 });
      }
    },
  },
};

export default [subBass, upright, triBass];
