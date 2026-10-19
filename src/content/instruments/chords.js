// CHORDS channel: harmony. Several notes at once, sitting in the middle of the mix (MIDI 52 to 76)
// on the off-beats or held underneath, leaving the top for the lead. Wide areas and support.

const TAU = Math.PI * 2;

// Pattern helpers: step s (0..15), n-note chord voiced near `center`, velocity v, length d in steps.
const C = (s, n = 3, v = 1, d = 1) => ({ s, v, chord: n, d });
const PAD = (s, n = 4, v = 1, d = 12) => ({ s, v, k: 'pad', chord: n, d });

// Spread the notes of a chord a little across the stereo field, lowest note left.
const spread = (i, n, w) => (n > 1 ? (i / (n - 1) - 0.5) * w : 0);

// Per-note level, so a four-note chord is no louder than a three-note one.
const each = (n) => Math.sqrt(3 / n);

// ---------------------------------------------------------------------------- Supersaw Stabs (Synth)

const supersaw = {
  id: 'supersaw',
  name: 'Supersaw Stabs',
  role: 'chords',
  style: 'synth',
  blurb: 'Bright, buzzy dance chords that hit between the beats. Each one fires a fan of shots that turns around you.',
  steps: 16,
  center: 63,
  levels: [
    { text: 'A chord between the beats, twice a bar. Each fires three shots in a fan.',
      pattern: [C(2), C(10)],
      stats: { damage: 28, speed: 400, pierce: 2, fan: 0.5, size: 7 } },
    { text: 'A chord between every beat, so the fan sweeps all the way around you.',
      pattern: [C(2), C(6), C(10), C(14)],
      stats: { damage: 28, speed: 410, pierce: 2, fan: 0.6, size: 7 } },
    { text: 'Fuller four-note chords: four shots per chord, and each one passes through more enemies.',
      pattern: [C(2, 4), C(6, 4), C(10, 4), C(14, 4)],
      stats: { damage: 28, speed: 420, pierce: 3, fan: 0.8, size: 7.5 } },
    { text: 'A quick extra chord right before each bar. Wider fans that pierce even more.',
      pattern: [C(2, 4), C(6, 4), C(10, 4), C(14, 4), C(15, 4, 0.6)],
      stats: { damage: 32, speed: 440, pierce: 4, fan: 1.0, size: 8 } },
    { text: 'A soft pad swells under every bar and sends a slow, wide wave out from you.',
      pattern: [PAD(0, 4, 0.8), C(2, 4), C(6, 4), C(10, 4), C(14, 4), C(15, 4, 0.6)],
      stats: { damage: 34, speed: 460, pierce: 5, fan: 1.15, size: 8.5, padDamage: 36, padRadius: 250 } },
  ],

  sound(A, t, note, out) {
    const { ctx, v } = A;
    const n = note.freqs.length;
    if (note.k === 'pad') {
      // Pad: two gently detuned saws per note behind a slowly opening filter.
      note.freqs.forEach((f, i) => {
        v.tone(ctx, out, t, { freq: f, wave: 'sawtooth', unison: 2, spread: 9, dur: note.dur, a: 0.35, d: 0.5, s: 0.8, r: 0.45,
          gain: 0.055 * note.v * each(n), filter: { type: 'lowpass', freq: 600, to: 1600, time: note.dur }, pan: spread(i, n, 0.7) });
      });
    } else {
      // Stab: three detuned saws per note, a snappy filter that closes fast.
      note.freqs.forEach((f, i) => {
        v.tone(ctx, out, t, { freq: f, wave: 'sawtooth', unison: 3, spread: 18, dur: 0.15, a: 0.002, d: 0.22, s: 0.55, r: 0.16,
          gain: 0.26 * note.v * each(n), filter: { type: 'lowpass', freq: 1100, env: 3.5, decay: 0.15, q: 1.4 }, pan: spread(i, n, 0.6) });
      });
    }
  },

  fire(g, note, st, inst) {
    const p = g.player;
    const color = g.color(inst);
    if (note.k === 'pad') {
      g.fx.ring({ x: p.x, y: p.y, follow: true, r0: 24, r1: g.area(st.padRadius), dur: 1.1,
        damage: g.dmg(st.padDamage) * note.v, kb: 90, slow: 0.25, color, width: 10 });
      return;
    }
    // The fan turns a little with every stab, so over a bar it covers every side.
    const S = inst.state;
    S.turn = ((S.turn ?? g.aim()) + 1.15) % TAU;
    const n = g.amount(note.midis.length);
    for (let i = 0; i < n; i++) {
      g.fx.bullet({ x: p.x, y: p.y, angle: S.turn + spread(i, n, st.fan), speed: g.speed(st.speed), r: st.size, life: 1.0,
        damage: g.dmg(st.damage) * note.v, pierce: st.pierce, kb: 60, color, shape: 'diamond', trail: true });
    }
  },

  remix: {
    id: 'hypersaw', name: 'Hypersaw', pedal: 'chorus',
    text: 'Every stab doubles: a second fan fires the opposite way, so the chords cut all around you.',
    fire(g, note, st, inst) {
      this.fire(g, note, st, inst);
      if (note.k === 'pad') return;
      const p = g.player;
      const n = g.amount(note.midis.length);
      for (let i = 0; i < n; i++) {
        g.fx.bullet({ x: p.x, y: p.y, angle: inst.state.turn + Math.PI + spread(i, n, st.fan), speed: g.speed(st.speed), r: st.size, life: 1.0,
          damage: g.dmg(st.damage) * note.v, pierce: st.pierce, kb: 60, color: g.color(inst), shape: 'diamond', trail: true });
      }
    },
  },
};

// ---------------------------------------------------------------------------- Electric Piano (Live)

const rhodes = {
  id: 'rhodes',
  name: 'Electric Piano',
  role: 'chords',
  style: 'organic',
  blurb: 'A warm, bell-like piano playing jazzy chords. Each one sends out a soft wave that slows enemies and heals you.',
  steps: 16,
  center: 63,
  seventh: true,
  levels: [
    { text: 'Two relaxed chords per bar. Each sends out a soft wave that slows and pushes enemies, and heals you a little.',
      pattern: [C(0, 4, 1, 6), C(10, 4, 0.85, 4)],
      stats: { damage: 10, radius: 160, slow: 0.3, kb: 90, heal: 0.6 } },
    { text: 'Adds a gentle chord between beats 2 and 3.',
      pattern: [C(0, 4, 1, 6), C(6, 4, 0.7, 2), C(10, 4, 0.85, 4)],
      stats: { damage: 11, radius: 170, slow: 0.33, kb: 95, heal: 0.8 } },
    { text: 'A chord that leans into the next bar. Waves reach farther.',
      pattern: [C(0, 4, 1, 6), C(6, 4, 0.7, 2), C(10, 4, 0.85, 4), C(14, 4, 0.75, 2)],
      stats: { damage: 12, radius: 185, slow: 0.36, kb: 100, heal: 1.0 } },
    { text: 'Bigger waves that slow harder and heal more.',
      pattern: [C(0, 4, 1, 6), C(6, 4, 0.7, 2), C(10, 4, 0.85, 4), C(14, 4, 0.75, 2)],
      stats: { damage: 20, radius: 210, slow: 0.42, kb: 110, heal: 1.3 } },
    { text: 'A soft extra chord early in the bar. Waves slow enemies to half speed.',
      pattern: [C(0, 4, 1, 6), C(3, 4, 0.55, 2), C(6, 4, 0.7, 2), C(10, 4, 0.85, 4), C(14, 4, 0.75, 2)],
      stats: { damage: 30, radius: 247, slow: 0.5, kb: 120, heal: 1.6 } },
  ],

  sound(A, t, note, out) {
    const { ctx, v } = A;
    const n = note.freqs.length;
    note.freqs.forEach((f, i) => {
      const at = t + i * 0.007;   // a slight roll, bottom note first
      const pan = spread(i, n, 0.5);
      // Body: a round tone whose overtones mellow out as the note rings.
      v.fm(ctx, out, at, { freq: f, ratio: 3, index: 2 + 1.5 * note.v, indexDecay: 2.2, a: 0.003, d: Math.min(1.3, note.dur + 0.1), s: 0.3, r: 0.25,
        dur: note.dur, gain: 0.1 * note.v, detune: i % 2 ? 4 : -4, pan });
      // Tine: a short metallic bell on the top note's attack.
      if (i === n - 1) v.fm(ctx, out, at, { freq: f, ratio: 14, index: 10, indexDecay: 0.2, a: 0.001, d: 0.5, s: 0, r: 0.1,
        dur: 0.01, gain: 0.1 * note.v, pan });
    });
  },

  fire(g, note, st, inst) {
    const p = g.player;
    const color = g.color(inst);
    g.fx.ring({ x: p.x, y: p.y, follow: true, r0: 18, r1: g.area(st.radius) * (0.8 + 0.2 * note.v), dur: 0.55,
      damage: g.dmg(st.damage) * note.v, kb: st.kb, slow: st.slow, color, width: 5 });
    const healed = g.heal(st.heal * note.v);
    if (healed > 0) g.fx.particles(p.x, p.y, '#7dffb0', 3, 70, 0.5, 2);
    // Soul Keys (remix, st.spill): healing you do not need fills the Drop meter instead.
    if (st.spill) g.chargeDrop((st.heal * note.v * g.dmgScale - healed) * st.spill);
  },

  remix: {
    id: 'soulkeys', name: 'Soul Keys', pedal: 'compressor',
    text: 'Wider waves. Healing you do not need fills the Drop meter instead.',
    sound: 'the chords pump under every kick.',
    stats: { radius: 290, spill: 4 },
  },
};

// ---------------------------------------------------------------------------- Pulse Chords (8-Bit)

const chipChords = {
  id: 'chipchords',
  name: 'Pulse Chords',
  role: 'chords',
  style: 'chip',
  blurb: 'Thin, buzzy console chords. Each one drops a block on every nearby enemy it can pick out.',
  steps: 16,
  center: 62,
  levels: [
    { text: 'Two chords per bar, between the beats. Each drops three blocks on the closest enemies.',
      pattern: [C(6), C(14)],
      stats: { damage: 20, radius: 36, kb: 80, range: 380 } },
    { text: 'Two more chords that skip ahead of the beat.',
      pattern: [C(3, 3, 0.8), C(6), C(11, 3, 0.8), C(14)],
      stats: { damage: 20, radius: 38, kb: 80, range: 390 } },
    { text: 'Four-note chords: four blocks each, and bigger ones.',
      pattern: [C(3, 4, 0.8), C(6, 4), C(11, 4, 0.8), C(14, 4)],
      stats: { damage: 21, radius: 44, kb: 90, range: 400 } },
    { text: 'A quick extra chord right before each bar.',
      pattern: [C(3, 4, 0.8), C(6, 4), C(11, 4, 0.8), C(14, 4), C(15, 4, 0.6)],
      stats: { damage: 23, radius: 48, kb: 95, range: 420 } },
    { text: 'One more chord in the middle of the bar. Heavy blocks that stun what they land on.',
      pattern: [C(3, 4, 0.8), C(6, 4), C(9, 4, 0.6), C(11, 4, 0.8), C(14, 4), C(15, 4, 0.6)],
      stats: { damage: 26, radius: 54, kb: 110, range: 440, stun: 0.3 } },
  ],

  sound(A, t, note, out) {
    const { ctx, v } = A;
    const n = note.freqs.length;
    note.freqs.forEach((f, i) => {
      // Narrow pulse on the top note for the buzz, a rounder one underneath.
      v.tone(ctx, out, t, { freq: f, duty: i === n - 1 ? 0.125 : 0.25, dur: 0.15, a: 0.001, d: 0.06, s: 0.7, r: 0.04,
        gain: 0.39 * note.v * each(n), pan: spread(i, n, 0.4) });
    });
  },

  fire(g, note, st, inst) {
    const p = g.player;
    const color = g.color(inst);
    const n = g.amount(note.midis.length);
    const targets = g.nearestN(p.x, p.y, n, st.range);
    for (let i = 0; i < n; i++) {
      // Not enough enemies close by: spare blocks go to anyone farther out, or are skipped.
      const e = targets[i] || g.randomEnemy(p.x, p.y, 600);
      if (!e) continue;
      g.fx.strike({ x: e.x, y: e.y, target: e, delay: 0.125, r: g.area(st.radius), damage: g.dmg(st.damage) * note.v,
        kb: st.kb, stun: st.stun || 0, color, style: 'drop' });
    }
  },

  remix: {
    id: 'lineclear', name: 'Line Clear', pedal: 'wah',
    text: 'The two loudest chords of every bar also clear a line: a beam across the whole screen through the thickest crowd.',
    stats: { lineDamage: 50, lineWidth: 34, lineStun: 0.3 },
    fire(g, note, st, inst) {
      this.fire(g, note, st, inst);
      if (note.v < 1) return;
      const spot = g.densest(st.range);
      if (!spot) return;
      // Across the screen in the first half of the bar, down it in the second.
      const down = note.s % 16 >= 8;
      g.fx.beam({ x: spot.x - (down ? 0 : 720), y: spot.y - (down ? 720 : 0), angle: down ? Math.PI / 2 : 0, length: 1440,
        width: g.area(st.lineWidth), damage: g.dmg(st.lineDamage) * note.v, kb: 60, stun: st.lineStun, color: g.color(inst), life: 0.3 });
    },
  },
};

export default [supersaw, rhodes, chipChords];
