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

// A chord note of a remix's own part, with its kind (k) for sound() and fire().
const K = (s, k, v = 1, n = 4, d = 1) => ({ s, v, chord: n, d, k });

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

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    const n = note.freqs.length;
    if (inst?.remix && note.k === 'gate') {
      // Hypersaw gate: five wide-detuned saws per note, chopped short, with the top note doubled an octave up.
      note.freqs.forEach((f, i) => {
        v.tone(ctx, out, t, { freq: f, wave: 'sawtooth', unison: 5, spread: 32, dur: 0.05, a: 0.002, d: 0.08, s: 0.35, r: 0.05,
          gain: 0.2 * note.v * each(n), filter: { type: 'lowpass', freq: 1500, env: 2.6, decay: 0.07, q: 1.2 }, pan: spread(i, n, 0.95) });
      });
      v.tone(ctx, out, t, { freq: note.freqs[n - 1] * 2, wave: 'sawtooth', unison: 3, spread: 24, dur: 0.04, a: 0.002, d: 0.07, s: 0.2, r: 0.05,
        gain: 0.06 * note.v, filter: { type: 'lowpass', freq: 3600, q: 0.8 } });
      return;
    }
    if (note.k === 'pad') {
      // Pad: two gently detuned saws per note behind a slowly opening filter (wider and brighter remixed).
      note.freqs.forEach((f, i) => {
        const hyper = !!inst?.remix;
        v.tone(ctx, out, t, { freq: f, wave: 'sawtooth', unison: hyper ? 3 : 2, spread: hyper ? 16 : 9, dur: note.dur, a: 0.35, d: 0.5, s: 0.8, r: 0.45,
          gain: 0.055 * note.v * each(n), filter: { type: 'lowpass', freq: 600, to: hyper ? 2200 : 1600, time: note.dur }, pan: spread(i, n, hyper ? 0.9 : 0.7) });
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
    text: 'A pumping trance gate fires fans ahead of you and behind you: tight while you run, wide when you stop.',
    sound: 'a trance gate pumping between the beats.',
    // The pad holds the bar while the chord stutters on every 16th between the beats, swelling into each one
    // (the pump), so the kick keeps the downbeats to itself.
    pattern: [PAD(0, 4, 0.7, 14), ...[1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15].map((s) => K(s, 'gate', [0, 0.55, 0.75, 1][s % 4]))],
    stats: { gateDamage: 30, gateLife: 1.5, fanRun: 1, fanStand: 2.2 },
    fire(g, note, st, inst) {
      if (note.k !== 'gate') { this.fire(g, note, st, inst); return; }   // the pad's slow wave, as at level 5
      const p = g.player;
      const color = g.color(inst);
      // Fans along your facing: the first 16th after a beat fires ahead, the second behind, the third both ways.
      const ahead = g.aim(), pos = note.s % 4;
      const dirs = pos === 1 ? [ahead] : pos === 2 ? [ahead + Math.PI] : [ahead, ahead + Math.PI];
      const run = Math.min(1, p.speedNow / Math.max(1, g.stats.speed));
      const fan = st.fanStand + (st.fanRun - st.fanStand) * run;
      const n = g.amount(note.midis.length);
      for (const a of dirs) {
        for (let i = 0; i < n; i++) {
          g.fx.bullet({ x: p.x, y: p.y, angle: a + spread(i, n, fan), speed: g.speed(st.speed), r: st.size, life: st.gateLife,
            damage: g.dmg(st.gateDamage) * note.v, pierce: st.pierce, kb: 60, color, shape: 'diamond', trail: pos === 3 });
        }
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

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    const n = note.freqs.length;
    if (inst?.remix) { soulKeys(A, t, note, out); return; }
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
  },

  remix: {
    id: 'soulkeys', name: 'Soul Keys', pedal: 'compressor',
    text: 'Spare healing becomes a shield, and the push chord before each bar throws the crowd off you.',
    sound: 'syncopated soul chords that pump under every kick.',
    // Comping that leans ahead of the beat: chords on the 'and's, each of the first and third with a muted
    // ghost chord a 16th after it, and a push on the last 16th of the bar. The downbeat is left to the kick and
    // the bass, and every beat still starts on a real chord (so the thinner textures keep the chords).
    pattern: [K(2, null, 0.8, 4, 2), K(3, 'ghost', 0.4), K(7, null, 0.7, 4, 2), K(10, null, 0.85, 4, 3), K(11, 'ghost', 0.4), K(15, 'push', 1)],
    stats: { radius: 400, damage: 40, shieldAt: 6, shieldTime: 10, pushRadius: 420, pushMax: 8, pushSpeed: 900, pushDamage: 60, pushWave: 620 },
    fire(g, note, st, inst) {
      const p = g.player;
      const color = g.color(inst);
      if (note.k === 'ghost') {
        // A ghost chord: a quick, small tap around you.
        g.fx.ring({ x: p.x, y: p.y, follow: true, r0: 14, r1: g.area(st.radius) * 0.5, dur: 0.25, damage: g.dmg(st.damage) * note.v,
          kb: st.kb * 0.6, color, width: 3 });
        return;
      }
      g.fx.ring({ x: p.x, y: p.y, follow: true, r0: 18, r1: g.area(st.radius) * (0.8 + 0.2 * note.v), dur: 0.55,
        damage: g.dmg(st.damage) * note.v, kb: st.kb, slow: st.slow, color, width: 5 });
      // Healing you do not need fills a shield, one charge at a time (up to three).
      const healed = g.heal(st.heal * note.v);
      if (healed > 0) g.fx.particles(p.x, p.y, '#7dffb0', 3, 70, 0.5, 2);
      const S = inst.state;
      S.over = Math.min(st.shieldAt * 3, (S.over || 0) + st.heal * note.v * g.dmgScale - healed);
      const mine = g.shield?.src === inst;
      if (S.over >= st.shieldAt && g.dmgScale === 1 && (mine || !(g.shield?.n > 0)) && (g.shield?.n || 0) < 3) {
        S.over -= st.shieldAt;
        g.shield = { n: (mine ? g.shield.n : 0) + 1, until: g.time + st.shieldTime, src: inst, onBreak: soulBurst(st, color) };
        g.fx.flash(p.x, p.y, p.r + 30, color, 0.3, 0.2);
      }
      if (note.k !== 'push') return;
      // The push: a wave rolls out far past the others, and the closest enemies are thrown out from you,
      // knocking down whatever they land in.
      g.fx.ring({ x: p.x, y: p.y, follow: true, r0: 40, r1: g.area(st.pushWave), dur: 0.5, damage: g.dmg(st.damage) * note.v,
        kb: st.kb * 1.5, color, width: 8 });
      const near = g.nearestN(p.x, p.y, st.pushMax, g.area(st.pushRadius));
      for (const e of near) {
        g.launch(e, Math.atan2(e.y - p.y, e.x - p.x), st.pushSpeed, g.dmg(st.pushDamage) * note.v, { t: 0.4, max: 6 });
      }
      g.fx.flash(p.x, p.y, g.area(st.pushRadius), color, 0.2, 0.12);
    },
  },
};

// Soul Keys' voice: a harder-struck electric piano that barks on loud chords, each chord panned a little
// further to one side (a suitcase tremolo), the ghost chords muted short.
function soulKeys(A, t, note, out) {
  const { ctx, v } = A;
  const n = note.freqs.length;
  const ghost = note.k === 'ghost';
  const side = note.s % 8 < 4 ? -0.3 : 0.3;
  note.freqs.forEach((f, i) => {
    const at = t + i * 0.005;
    const pan = side + spread(i, n, 0.4);
    v.fm(ctx, out, at, { freq: f, ratio: 3, index: ghost ? 4 : 2.5 + 3 * note.v, indexDecay: ghost ? 0.05 : 0.3, a: 0.002,
      d: ghost ? 0.08 : Math.min(1.1, note.dur + 0.1), s: ghost ? 0 : 0.3, r: ghost ? 0.04 : 0.2, dur: ghost ? 0.02 : note.dur,
      gain: (ghost ? 0.1 : 0.135) * note.v, detune: i % 2 ? 6 : -6, pan });
    if (i === n - 1 && !ghost) v.fm(ctx, out, at, { freq: f, ratio: 14, index: 12, indexDecay: 0.15, a: 0.001, d: 0.45, s: 0, r: 0.1,
      dur: 0.01, gain: 0.16 * note.v, pan });
  });
}

// Soul Keys: the last shield charge breaking sends out a wave that clears shots and knocks the crowd back.
const soulBurst = (st, color) => (g) => {
  const p = g.player;
  g.fx.ring({ x: p.x, y: p.y, follow: true, r0: 20, r1: g.area(st.radius) * 1.2, dur: 0.45, damage: g.dmg(st.damage * 2), kb: 260,
    stun: 0.4, erase: 1, color, width: 10 });
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

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    const n = note.freqs.length;
    if (inst?.remix) { lineClear(A, t, note, out); return; }
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
    text: 'A chord ratchet ends every bar by clearing lines across the screen: your row, your column, then the fullest ones.',
    sound: 'a chord ratchet clearing the end of every bar.',
    // Three chords early in the bar, a gap, then a 16th ratchet on beat 4 that clears the lines. Every chord
    // drops its blocks as at level 5.
    pattern: [C(0, 4, 0.9), C(3, 4, 0.7), C(6, 4, 0.85), K(12, 'clear', 0.7), K(13, 'clear', 0.8), K(14, 'clear', 0.9), K(15, 'clear', 1)],
    stats: { lineDamage: 50, lineWidth: 56, lineStun: 0.3, reach: 900 },
    fire(g, note, st, inst) {
      this.fire(g, note, st, inst);
      if (note.k !== 'clear') return;
      const p = g.player;
      const color = g.color(inst);
      // The ratchet clears lines across the screen: the row through you, the column through you, then the two
      // fullest rows and the two fullest columns within reach, like full lines in a falling-block game.
      const i = note.s % 4, w = g.area(st.lineWidth);
      const line = (x, y, across) => g.fx.beam({ x: across ? x : x - LINE / 2, y: across ? y - LINE / 2 : y, angle: across ? Math.PI / 2 : 0,
        length: LINE, width: w, damage: g.dmg(st.lineDamage) * note.v, kb: 60, stun: st.lineStun, color, life: 0.3 });
      if (i < 2) line(p.x, p.y, i === 1);
      else {
        for (const c of fullest(g, p, i === 3, 2, w, st.reach)) line(i === 3 ? c : p.x, i === 3 ? p.y : c, i === 3);
        if (i === 3) g.fx.flash(p.x, p.y, w * 4, color, 0.25, 0.15);
      }
    },
  },
};

// Line Clear's lines reach across the whole screen.
const LINE = 1600;

// The n fullest lines (rows, or columns with cols) of width w among the enemies within `reach` of p, as their
// y (or x), fullest first and never overlapping (a boss counts twice). None when nobody is in reach.
function fullest(g, p, cols, n, w, reach) {
  const crowd = g.inRadius(p.x, p.y, reach);
  const at = (e) => (cols ? e.x : e.y);
  const lines = [];
  for (const c of crowd) {
    let k = 0;
    for (const e of crowd) if (Math.abs(at(e) - at(c)) < w / 2 + e.r) k += e.boss ? 2 : 1;
    lines.push([k, at(c)]);
  }
  lines.sort((a, b) => b[0] - a[0]);
  const out = [];
  for (const [, v] of lines) {
    if (out.length >= n) break;
    if (out.every((u) => Math.abs(u - v) >= w)) out.push(v);
  }
  return out;
}

// Line Clear's voice: brighter, thinner pulses for the chords, and on the ratchet a square that zips up into
// pitch, with a burst of console noise on the last one.
function lineClear(A, t, note, out) {
  const { ctx, v } = A;
  const n = note.freqs.length;
  const clear = note.k === 'clear';
  note.freqs.forEach((f, i) => {
    v.tone(ctx, out, t, { freq: f, duty: clear ? (i === n - 1 ? 0.25 : 0.5) : 0.125, dur: clear ? 0.06 : 0.13, a: 0.001, d: 0.05, s: 0.7, r: 0.03,
      gain: (clear ? 0.3 : 0.36) * note.v * each(n), pitchEnv: clear ? { from: 0.7, time: 0.03 } : null, pan: spread(i, n, clear ? 0.7 : 0.4) });
  });
  if (clear && note.v >= 1) v.noise(ctx, out, t, { dur: 0.02, d: 0.14, gain: 0.12, chip: 5, filter: { type: 'highpass', freq: 1200 } });
}

export default [supersaw, rhodes, chipChords];
