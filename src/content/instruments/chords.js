// CHORDS channel: harmony. Several notes at once, sitting in the middle of the mix (MIDI 52 to 76)
// on the off-beats or held underneath, leaving the top for the lead. Support, three ways: shots that snipe the
// far edge of the crowd (Synth), a soft wave around you that heals (Live), and falling blocks on the grid (8-Bit).

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

// The n farthest enemies within `reach` of you, farthest first.
function farthest(g, n, reach) {
  const p = g.player;
  const arr = g.inRadius(p.x, p.y, reach).filter((e) => e.spawnT <= 0.2);
  for (const e of arr) e._d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
  arr.sort((a, b) => b._d - a._d);
  return arr.slice(0, n);
}

// ---------------------------------------------------------------------------- Supersaw Stabs (Synth)

const supersaw = {
  id: 'supersaw',
  name: 'Supersaw Stabs',
  role: 'chords',
  style: 'synth',
  blurb: 'Bright, buzzy dance chords that hit between the beats. Each one snipes the farthest enemies in reach, cutting through everything on the way.',
  steps: 16,
  center: 63,
  levels: [
    { text: 'A chord between the beats, twice a bar. Each note of it fires a shot at one of the farthest enemies in reach.',
      pattern: [C(2), C(10)],
      stats: { damage: 30, speed: 430, pierce: 2, reach: 360, size: 6.5 } },
    { text: 'A chord between every beat.',
      pattern: [C(2), C(6), C(10), C(14)],
      stats: { damage: 28, speed: 440, pierce: 2, reach: 370, size: 6.5 } },
    { text: 'Fuller four-note chords: four shots per chord, and each one cuts through more enemies.',
      pattern: [C(2, 4), C(6, 4), C(10, 4), C(14, 4)],
      stats: { damage: 28, speed: 450, pierce: 3, reach: 385, size: 7 } },
    { text: 'A quick extra chord right before each bar. Shots reach farther and cut through even more.',
      pattern: [C(2, 4), C(6, 4), C(10, 4), C(14, 4), C(15, 4, 0.6)],
      stats: { damage: 31, speed: 470, pierce: 4, reach: 400, size: 7.5 } },
    { text: 'A soft pad swells under every bar and sends one slow, heavy shot through everything to the farthest enemy.',
      pattern: [PAD(0, 4, 0.8), C(2, 4), C(6, 4), C(10, 4), C(14, 4), C(15, 4, 0.6)],
      stats: { damage: 33, speed: 490, pierce: 5, reach: 420, size: 8, padDamage: 60, padSpeed: 240 } },
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

  // Each note of a stab snipes one of the farthest enemies within reach (the farthest first), so the shot crosses the
  // whole crowd between you and it, piercing as it goes. Fewer targets than notes: the spare shots fan out around
  // the farthest one; nobody in reach: the chord fires a tight fan where you face. The pad sends one slow, heavy
  // shot that pierces everything.
  fire(g, note, st, inst) {
    const p = g.player;
    const color = g.color(inst);
    const reach = st.reach;
    if (note.k === 'pad') {
      const [far] = farthest(g, 1, reach);
      const a = far ? Math.atan2(far.y - p.y, far.x - p.x) : g.aim();
      const sp = g.speed(st.padSpeed);
      g.fx.bullet({ x: p.x, y: p.y, angle: a, rot: a, speed: sp, r: st.size * 1.8, life: reach / sp, damage: g.dmg(st.padDamage) * note.v,
        pierce: 99, kb: 90, slow: 0.25, color, shape: 'diamond', trail: true });
      return;
    }
    const n = g.amount(note.midis.length);
    const far = farthest(g, n, reach);
    const sp = g.speed(st.speed);
    for (let i = 0; i < n; i++) {
      const e = far[i % Math.max(1, far.length)];
      const a = e ? Math.atan2(e.y - p.y, e.x - p.x) + (i < far.length ? 0 : i % 2 ? 0.14 : -0.14) : g.aim() + spread(i, n, 0.35);
      g.fx.bullet({ x: p.x, y: p.y, angle: a, rot: a, speed: sp, r: st.size, life: reach / sp + 0.05,
        damage: g.dmg(st.damage) * note.v, pierce: st.pierce, kb: 60, color, shape: 'diamond', trail: true });
    }
  },

  remix: {
    id: 'hypersaw', name: 'Hypersaw', pedal: 'chorus',
    text: 'A pumping trance gate fires fans ahead of you and behind you (tight while you run, wide when you stop), and still snipes on every beat.',
    sound: 'a trance gate pumping between the beats.',
    // The pad holds the bar while the chord stutters on every 16th between the beats, swelling into each one
    // (the pump), so the kick keeps the downbeats to itself.
    pattern: [PAD(0, 4, 0.7, 14), ...[1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15].map((s) => K(s, 'gate', [0, 0.55, 0.75, 1][s % 4]))],
    stats: { gateDamage: 46, fanRun: 1, fanStand: 2.2 },
    fire(g, note, st, inst) {
      if (note.k !== 'gate') { this.fire(g, note, st, inst); return; }   // the pad's slow shot, as at level 5
      const p = g.player;
      const color = g.color(inst);
      // Fans along your facing: the first 16th after a beat fires ahead, the second behind, the third both ways and
      // snipes as a level 5 stab does.
      const ahead = g.aim(), pos = note.s % 4;
      if (pos === 3) this.fire(g, note, st, inst);
      const dirs = pos === 1 ? [ahead] : pos === 2 ? [ahead + Math.PI] : [ahead, ahead + Math.PI];
      const run = Math.min(1, p.speedNow / Math.max(1, g.stats.speed));
      const fan = st.fanStand + (st.fanRun - st.fanStand) * run;
      const n = g.amount(note.midis.length);
      for (const a of dirs) {
        for (let i = 0; i < n; i++) {
          g.fx.bullet({ x: p.x, y: p.y, angle: a + spread(i, n, fan), speed: g.speed(st.speed), r: st.size, life: st.reach / g.speed(st.speed),
            damage: g.dmg(st.gateDamage) * note.v, pierce: st.pierce, kb: 60, color, shape: 'diamond', trail: pos === 3 });
        }
      }
    },
  },
};

// ---------------------------------------------------------------------------- Electric Piano (Live)

// The keys' wave around you: out and back in (yoyo) while you are planted, out only while you move.
function keysWave(g, note, st, inst, r, damage, o = {}) {
  const p = g.player, still = g.rules.planted;
  g.fx.ring({ x: p.x, y: p.y, follow: true, r0: 18, r1: r, dur: still ? 0.9 : 0.55, yoyo: still,
    damage, kb: o.kb ?? st.kb, slow: st.slow, color: g.color(inst), width: o.width ?? 5 });
}

const rhodes = {
  id: 'rhodes',
  name: 'Electric Piano',
  role: 'chords',
  style: 'organic',
  blurb: 'A warm, bell-like piano playing jazzy chords. Each one sends a soft wave around you that slows enemies and heals you; stand your ground and it breathes back in.',
  steps: 16,
  center: 63,
  seventh: true,
  levels: [
    { text: 'Two relaxed chords per bar. Each wave slows and pushes enemies and heals you a little; standing still, it rolls back in and hits again.',
      pattern: [C(0, 4, 1, 6), C(10, 4, 0.85, 4)],
      stats: { damage: 10, radius: 150, slow: 0.3, kb: 90, heal: 0.6 } },
    { text: 'Adds a gentle chord between beats 2 and 3.',
      pattern: [C(0, 4, 1, 6), C(6, 4, 0.7, 2), C(10, 4, 0.85, 4)],
      stats: { damage: 12, radius: 158, slow: 0.33, kb: 95, heal: 0.8 } },
    { text: 'A chord that leans into the next bar. Waves reach a little farther.',
      pattern: [C(0, 4, 1, 6), C(6, 4, 0.7, 2), C(10, 4, 0.85, 4), C(14, 4, 0.75, 2)],
      stats: { damage: 13, radius: 168, slow: 0.36, kb: 100, heal: 1.0 } },
    { text: 'Stronger waves that slow harder and heal more.',
      pattern: [C(0, 4, 1, 6), C(6, 4, 0.7, 2), C(10, 4, 0.85, 4), C(14, 4, 0.75, 2)],
      stats: { damage: 21, radius: 180, slow: 0.42, kb: 110, heal: 1.3 } },
    { text: 'A soft extra chord early in the bar. Waves slow enemies to half speed.',
      pattern: [C(0, 4, 1, 6), C(3, 4, 0.55, 2), C(6, 4, 0.7, 2), C(10, 4, 0.85, 4), C(14, 4, 0.75, 2)],
      stats: { damage: 31, radius: 195, slow: 0.5, kb: 120, heal: 1.6 } },
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

  // A soft wave out around you. Planted (you have not left your spot since the last beat) it breathes: it rolls out
  // and back in, hitting everything it passes on both ways.
  fire(g, note, st, inst) {
    keysWave(g, note, st, inst, g.area(st.radius) * (0.8 + 0.2 * note.v), g.dmg(st.damage) * note.v);
    const p = g.player;
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
    stats: { radius: 230, damage: 50, shieldAt: 6, shieldMax: 2, shieldTime: 8, pushRadius: 170, pushMax: 5, pushSpeed: 700, pushDamage: 85, pushWave: 280 },
    fire(g, note, st, inst) {
      const p = g.player;
      const color = g.color(inst);
      if (note.k === 'ghost') {
        // A ghost chord: a quick, small tap around you.
        g.fx.ring({ x: p.x, y: p.y, follow: true, r0: 14, r1: g.area(st.radius) * 0.5, dur: 0.25, damage: g.dmg(st.damage) * note.v,
          kb: st.kb * 0.6, color, width: 3 });
        return;
      }
      keysWave(g, note, st, inst, g.area(st.radius) * (0.8 + 0.2 * note.v), g.dmg(st.damage) * note.v);
      // Healing you do not need fills a shield, one charge at a time, up to two. The shield lasts shieldTime from
      // when it went up, however many charges join it, and spare healing stops piling up past two charges.
      const healed = g.heal(st.heal * note.v);
      if (healed > 0) g.fx.particles(p.x, p.y, '#7dffb0', 3, 70, 0.5, 2);
      const S = inst.state;
      S.over = Math.min(st.shieldAt * st.shieldMax, (S.over || 0) + st.heal * note.v * g.dmgScale - healed);
      const mine = g.shield?.src === inst && g.shield.n > 0;
      if (S.over >= st.shieldAt && g.dmgScale === 1 && (mine || !(g.shield?.n > 0)) && (mine ? g.shield.n : 0) < st.shieldMax) {
        S.over -= st.shieldAt;
        if (mine) g.shield.n += 1;
        else g.shield = { n: 1, until: g.time + st.shieldTime, src: inst, onBreak: soulBurst(st, color) };
        g.fx.flash(p.x, p.y, p.r + 30, color, 0.3, 0.2);
      }
      if (note.k !== 'push') return;
      // The push: a wave rolls out past the others, and the closest enemies are thrown out from you, knocking down
      // whatever they land in.
      g.fx.ring({ x: p.x, y: p.y, follow: true, r0: 40, r1: g.area(st.pushWave), dur: 0.45, damage: g.dmg(st.damage) * note.v,
        kb: st.kb * 1.5, color, width: 8 });
      const near = g.nearestN(p.x, p.y, st.pushMax, g.area(st.pushRadius));
      for (const e of near) {
        g.launch(e, Math.atan2(e.y - p.y, e.x - p.x), st.pushSpeed, g.dmg(st.pushDamage) * note.v, { t: 0.35, max: 5 });
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
  g.fx.ring({ x: p.x, y: p.y, follow: true, r0: 20, r1: g.area(st.radius) * 1.1, dur: 0.45, damage: g.dmg(st.damage * 2), kb: 260,
    stun: 0.4, erase: 1, color, width: 10 });
};

// ---------------------------------------------------------------------------- Pulse Chords (8-Bit)

// The falling-block pieces, as grid cells (x right, y down); cell 1 is the one that lands on the target.
const PIECES = [
  [[0, 0], [1, 0], [2, 0], [3, 0]],   // I
  [[0, 0], [1, 0], [0, 1], [1, 1]],   // O
  [[0, 1], [1, 1], [2, 1], [1, 0]],   // T
  [[0, 0], [0, 1], [0, 2], [1, 2]],   // L
  [[1, 0], [2, 0], [0, 1], [1, 1]],   // S
];
const snapTo = (v, cell) => (Math.floor(v / cell) + 0.5) * cell;

// Drop a piece: its cells, turned a quarter `turn` times, land on the grid with cell 1 on the tile under (x, y).
// Each block is a strike the size of its tile (it lands a beat-16th later, all at once); strikes carry `block`
// (the tile size) for the renderer.
function dropPiece(g, cells, x, y, cell, turn, o) {
  const rot = ([cx, cy]) => { for (let i = 0; i < turn; i++) [cx, cy] = [-cy, cx]; return [cx, cy]; };
  const pts = cells.map(rot), [ax, ay] = pts[1] || pts[0];
  const tx = snapTo(x, cell), ty = snapTo(y, cell);
  for (const [cx, cy] of pts) {
    const s = g.fx.strike({ x: tx + (cx - ax) * cell, y: ty + (cy - ay) * cell, delay: 0.125, r: cell * 0.56, damage: o.damage,
      kb: o.kb, stun: o.stun, color: o.color, style: 'drop' });
    s.block = cell;
  }
}

const chipChords = {
  id: 'chipchords',
  name: 'Pulse Chords',
  role: 'chords',
  style: 'chip',
  blurb: 'Thin, buzzy console chords. Each one drops a falling-block piece onto the floor\'s grid over the closest enemy, one block per note.',
  steps: 16,
  center: 62,
  levels: [
    { text: 'Two chords per bar, between the beats. Each drops a three-block piece on the grid over the closest enemy, turned the way you face.',
      pattern: [C(6), C(14)],
      stats: { damage: 30, cell: 40, kb: 80, range: 360 } },
    { text: 'Two more chords that skip ahead of the beat.',
      pattern: [C(3, 3, 0.8), C(6), C(11, 3, 0.8), C(14)],
      stats: { damage: 30, cell: 41, kb: 80, range: 370 } },
    { text: 'Four-note chords: four-block pieces, and bigger blocks.',
      pattern: [C(3, 4, 0.8), C(6, 4), C(11, 4, 0.8), C(14, 4)],
      stats: { damage: 31, cell: 44, kb: 90, range: 380 } },
    { text: 'A quick extra chord right before each bar.',
      pattern: [C(3, 4, 0.8), C(6, 4), C(11, 4, 0.8), C(14, 4), C(15, 4, 0.6)],
      stats: { damage: 37, cell: 46, kb: 95, range: 390 } },
    { text: 'One more chord in the middle of the bar. Heavy blocks that stun what they land on.',
      pattern: [C(3, 4, 0.8), C(6, 4), C(9, 4, 0.6), C(11, 4, 0.8), C(14, 4), C(15, 4, 0.6)],
      stats: { damage: 45, cell: 50, kb: 110, range: 400, stun: 0.3 } },
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

  // One piece per chord (the Chorus pedal adds pieces, onto the next closest enemies), one block per note, snapped
  // to the floor's grid over the closest enemy and turned the way you face. The pieces cycle I, O, T, L, S. The
  // bar's first chord drops on a boss in range.
  fire(g, note, st, inst) {
    const p = g.player, S = inst.state;
    const color = g.color(inst);
    const pieces = Math.max(1, g.amount(1));
    const first = S.bar !== note.bar;
    if (g.dmgScale === 1) S.bar = note.bar;
    const boss = first ? g.bossInRange(p.x, p.y, st.range) : null;
    const near = g.nearestN(p.x, p.y, pieces, st.range).filter((e) => e !== boss);
    if (boss) near.unshift(boss);
    const cell = g.area(st.cell), turn = ((Math.round(g.aim() / (Math.PI / 2)) % 4) + 4) % 4;
    for (let k = 0; k < pieces && k < near.length; k++) {
      const e = near[k];
      const shape = PIECES[(S.piece = ((S.piece ?? -1) + 1) % PIECES.length)];
      dropPiece(g, shape.slice(0, Math.min(4, note.midis.length)), e.x, e.y, cell, turn, {
        damage: g.dmg(st.damage) * note.v, kb: st.kb, stun: st.stun || 0, color });
    }
  },

  remix: {
    id: 'lineclear', name: 'Line Clear', pedal: 'wah',
    text: 'A chord ratchet ends every bar by clearing lines of the floor around you: your row, your column, then the fullest ones.',
    sound: 'a chord ratchet clearing the end of every bar.',
    // Three chords early in the bar, a gap, then a 16th ratchet on beat 4 that clears the lines. Every chord
    // drops its piece as at level 5.
    pattern: [C(0, 4, 0.9), C(3, 4, 0.7), C(6, 4, 0.85), K(12, 'clear', 0.7), K(13, 'clear', 0.8), K(14, 'clear', 0.9), K(15, 'clear', 1)],
    stats: { lineDamage: 88, lineLength: 400, lineStun: 0.3, reach: 240 },
    fire(g, note, st, inst) {
      this.fire(g, note, st, inst);
      if (note.k !== 'clear') return;
      const p = g.player;
      const color = g.color(inst);
      // The ratchet clears lines of the grid around you, each a tile wide and lineLength long, centered on you:
      // the row through you, the column through you, then the two fullest rows and the two fullest columns within
      // reach, like full lines in a falling-block game.
      const i = note.s % 4, cell = g.area(st.cell), w = cell, L = st.lineLength;
      const line = (x, y, across) => g.fx.beam({ x: across ? x : x - L / 2, y: across ? y - L / 2 : y, angle: across ? Math.PI / 2 : 0,
        length: L, width: w, damage: g.dmg(st.lineDamage) * note.v, kb: 60, stun: st.lineStun, color, life: 0.3 });
      const cx = snapTo(p.x, cell), cy = snapTo(p.y, cell);
      if (i < 2) line(i === 1 ? cx : p.x, i === 1 ? p.y : cy, i === 1);
      else {
        for (const c of fullest(g, p, i === 3, 2, w, st.reach)) line(i === 3 ? snapTo(c, cell) : p.x, i === 3 ? p.y : snapTo(c, cell), i === 3);
        if (i === 3) g.fx.flash(p.x, p.y, w * 3, color, 0.25, 0.15);
      }
    },
  },
};

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
