// BASS channel: the low notes. Roots and fifths that lock onto the kick, syncopated at higher levels.
// Heavy and close: a sub wave rolling down the line you face (Synth), thumps that walk around where you stand
// (Live), bombs left on the floor's grid behind you that blow in a cross (8-Bit). The channel's Heavy and
// Orchestra sounds (heavy/dropd.js punts, orchestra/cellos.js a placed whirl) live in their own files.

import { STEP_SEC } from '../../config.js';

const TAU = Math.PI * 2;

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

// Where a forward attack goes: along your facing, turned onto the closest enemy within `half` radians of it, else
// onto the closest enemy in reach, else straight ahead.
function aimAhead(g, half, range) {
  const p = g.player, f = g.aim();
  const e = nearestArc(g, f, half, range) || g.nearest(p.x, p.y, range);
  return e ? Math.atan2(e.y - p.y, e.x - p.x) : f;
}

// A sub wave: a straight front of pressure `width` px across that rolls from (x, y) along `angle` for `reach` px.
// It is a row of pieces that share one set of hits, so each enemy in its lane is hit once. o: width, reach,
// speed, damage, kb, slow, stun, color. Pieces carry `wave` (their index and the row's size) for the renderer.
function subWave(g, x, y, angle, o) {
  const n = Math.max(3, Math.round(o.width / 24)), hit = new Set();
  const nx = -Math.sin(angle), ny = Math.cos(angle), gap = o.width / (n - 1);
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * gap;
    const b = g.fx.bullet({ x: x + nx * off, y: y + ny * off, angle, rot: angle, speed: o.speed, r: gap * 0.55, life: o.reach / o.speed,
      damage: o.damage, pierce: 999, kb: o.kb, slow: o.slow, stun: o.stun || 0, color: o.color, shape: 'dot' });
    if (b) { b.hit = hit; b.wave = { i, n }; }
  }
}

// A thump on the ground at (x, y): everything on the patch is hit and shoved away from you (not from the patch),
// so the walking line keeps the crowd off you.
function thump(g, x, y, r, damage, kb) {
  const p = g.player, color = g.color('bass');
  for (const e of g.inRadius(x, y, r)) g.hit(e, damage, { kb, fx: p.x, fy: p.y });
  g.fx.flash(x, y, r, color, 0.24, 0.22);
  g.fx.particles(x, y, color, 4, 120, 0.3, 2.5);
}

// ---------------------------------------------------------------------------- Sub Bass (Synth)

const subBass = {
  id: 'subbass',
  name: 'Sub Bass',
  role: 'bass',
  style: 'synth',
  blurb: 'A deep electronic hum you feel in your chest. Every note rolls a wave of pressure straight down the line you face.',
  steps: 16,
  low: 28,
  levels: [
    { text: 'Long, deep notes on beats 1 and 3. Each one rolls a wave down the line you face, slowing what it crosses.',
      pattern: [R(0, 7), R(8, 7, 0.95)],
      stats: { damage: 18, width: 80, reach: 300, speed: 330, slow: 0.35, kb: 45 } },
    { text: 'Adds a jump to a higher note in between. One more wave every bar.',
      pattern: [R(0, 6), O(6, 2, 0.75), R(8, 7, 0.95)],
      stats: { damage: 24, width: 86, reach: 320, speed: 340, slow: 0.38, kb: 45 } },
    { text: 'Adds a note on beat 4. Waves roll farther.',
      pattern: [R(0, 6), O(6, 2, 0.75), R(8, 4, 0.95), F(12, 3, 0.85)],
      stats: { damage: 30, width: 94, reach: 345, speed: 350, slow: 0.42, kb: 50 } },
    { text: 'A quick rolling run closes each bar. Waves slow even harder.',
      pattern: [R(0, 6), O(6, 2, 0.75), R(8, 4, 0.95), F(12, 2, 0.85), O(14, 1, 0.7), R(15, 1, 0.65)],
      stats: { damage: 39, width: 102, reach: 365, speed: 360, slow: 0.48, kb: 50 } },
    { text: 'Full rolling groove. Wider waves, and the longest notes stun what they roll over.',
      pattern: [R(0, 3), R(3, 3, 0.6), O(6, 2, 0.75), R(8, 3, 0.95), O(11, 1, 0.55), F(12, 2, 0.85), O(14, 1, 0.7), R(15, 1, 0.65)],
      stats: { damage: 46, width: 112, reach: 380, speed: 370, slow: 0.52, kb: 55, stun: 0.3 } },
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

  // A straight wave down the line you face (turned onto the closest enemy in front of you, else the closest one at
  // all; on beats 1 and 3 onto a boss in reach). Long notes roll a wider, harder wave: a one-step note deals 75%, a
  // six-step note 150%.
  fire(g, note, st) {
    const p = g.player;
    const steps = note.dur / STEP_SEC;
    const len = Math.min(1.5, 0.6 + 0.15 * steps);
    const long = steps >= 3;
    // Beats 1 and 3 roll at a boss in reach.
    const boss = note.s % 8 === 0 ? g.bossInRange(p.x, p.y, st.reach) : null;
    const a = boss ? Math.atan2(boss.y - p.y, boss.x - p.x) : aimAhead(g, 1.05, st.reach);
    subWave(g, p.x, p.y, a, { width: g.area(st.width) * (long ? 1 : 0.75), reach: st.reach, speed: g.speed(st.speed),
      damage: g.dmg(st.damage) * note.v * len, kb: st.kb, slow: st.slow, stun: long ? st.stun || 0 : 0, color: g.color('bass') });
    g.shake = Math.max(g.shake, (long ? 2 : 1) * note.v);
  },

  // Retriggered 8ths that wobble, and a lane that breathes with them: the 8ths on the beat roll a wave out down the
  // line you face, the 8ths between roll one back in from the far end of it, dragging what it crosses toward you,
  // so a crowd in your lane sways in and out, slowed, taking hits both ways.
  remix: {
    id: 'wobblebass', name: 'Wobble Bass', pedal: 'wah',
    text: 'Your lane breathes: on-beat waves push the crowd out, off-beat waves roll back in and drag it to you.',
    sound: 'retriggered eighths whose filter wobbles open on every note.',
    pattern: [R(0, 2), R(2, 2, 0.8), O(4, 2, 0.9), R(6, 2, 0.8), R(8, 2, 0.95), R(10, 2, 0.8), F(12, 1, 0.85), F(13, 1, 0.7), O(14, 2, 0.9)],
    stats: { damage: 115, push: 40, pull: 320, wide: 1.25 },
    fire(g, note, st, inst) {
      const p = g.player, S = inst.state;
      const out = (note.s & 2) === 0;   // steps 0, 4, 8, 12 breathe out, 2, 6, 10, 14 breathe in
      // The out-breath picks the lane (the bar's first one at a boss in reach); the in-breath rolls back down the
      // same one (it was aimed a 16th or two ago).
      if (out || S.lane === undefined) {
        const boss = note.s === 0 ? g.bossInRange(p.x, p.y, st.reach) : null;
        S.lane = boss ? Math.atan2(boss.y - p.y, boss.x - p.x) : aimAhead(g, 1.05, st.reach);
      }
      const a = S.lane, speed = g.speed(st.speed), L = st.reach;
      const o = { width: g.area(st.width) * st.wide, reach: L, speed, damage: g.dmg(st.damage) * note.v, slow: out ? st.slow : 0, color: g.color('bass') };
      if (out) subWave(g, p.x, p.y, a, { ...o, kb: st.push });
      else subWave(g, p.x + Math.cos(a) * L, p.y + Math.sin(a) * L, a + Math.PI, { ...o, reach: L - 30, kb: st.pull });
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
  blurb: 'A big plucked double bass, warm and woody. Its walking line thumps the ground in a circle around you, once round every bar.',
  steps: 16,
  low: 31,
  levels: [
    { text: 'Four plucks per bar. Each thumps the ground beside you, walking once around you every bar, starting where you face.',
      pattern: [W(0, 0, 4), W(4, 4, 4, 0.85), W(8, 0, 4, 0.95), W(12, 4, 4, 0.85)],
      stats: { damage: 30, ring: 54, size: 52, walk: 4, kb: 90 } },
    { text: 'Adds a quick pickup note at the end of every bar.',
      pattern: [W(0, 0, 4), W(4, 4, 4, 0.85), W(8, 0, 4, 0.95), W(12, 4, 2, 0.85), W(14, 2, 2, 0.75)],
      stats: { damage: 33, ring: 56, size: 54, walk: 5, kb: 92 } },
    { text: 'The line starts walking between notes, so the thumps close up into a ring.',
      pattern: [W(0, 0, 4), W(4, 4, 2, 0.85), W(6, 3, 2, 0.75), W(8, 0, 2, 0.95), W(10, 2, 2, 0.75), W(12, 4, 2, 0.85), W(14, 2, 2, 0.75)],
      stats: { damage: 40, ring: 58, size: 57, walk: 7, kb: 95 } },
    { text: 'Soft muted plucks fill the gaps. Bigger thumps.',
      pattern: [W(0, 0, 3), W(3, 0, 1, 0.5), W(4, 4, 2, 0.85), W(6, 3, 2, 0.75), W(8, 0, 2, 0.95), W(10, 2, 2, 0.75), W(12, 4, 2, 0.85), W(14, 2, 1, 0.75), W(15, 1, 1, 0.6)],
      stats: { damage: 52, ring: 61, size: 60, walk: 9, kb: 100 } },
    { text: 'Full walking line. The heaviest thumps, and the higher notes land a little farther out.',
      pattern: [W(0, 0, 3), W(3, 0, 1, 0.5), W(4, 4, 2, 0.85), W(6, 3, 1, 0.75), W(7, 1, 1, 0.55), W(8, 0, 2, 0.95), W(10, 2, 1, 0.75), W(11, 0, 1, 0.5), W(12, 4, 2, 0.85), W(14, 2, 1, 0.75), W(15, 1, 1, 0.6)],
      stats: { damage: 74, ring: 64, size: 63, walk: 11, kb: 110, rise: 4 } },
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

  // The walk: the bar's first pluck thumps the ground where you face, and every pluck after it lands `walk`-th of
  // the way further round you (clockwise), so each bar the line walks once around where you stand. A thump hits
  // everything on that patch and shoves it away from you. On the beat, a boss in range takes the thump instead. An
  // echo thumps the last spot again.
  fire(g, note, st, inst) {
    const p = g.player, S = inst.state;
    if (g.dmgScale === 1) {
      if (S.bar !== note.bar || S.walk === undefined) { S.bar = note.bar; S.low = note.midi; S.walk = g.aim(); }
      else S.walk += TAU / Math.max(1, st.walk);
    }
    // On the beat, a boss in range takes the thump on its body instead.
    const boss = note.s % 4 === 0 ? g.bossInRange(p.x, p.y, 240) : null;
    if (boss) { thump(g, boss.x, boss.y, g.area(st.size) * 0.8, g.dmg(st.damage) * note.v, st.kb); return; }
    // The higher the note above the bar's first one, the farther out it lands (level 5).
    const R = g.area(st.ring) + (st.rise || 0) * Math.max(0, Math.min(7, (note.midi || 0) - (S.low || 0)));
    const w = S.walk ?? g.aim();
    thump(g, p.x + Math.cos(w) * R, p.y + Math.sin(w) * R, g.area(st.size) * (0.85 + 0.15 * note.v), g.dmg(st.damage) * note.v, st.kb);
  },

  // A slap line: every note walks the thumps around you (twelve a bar), every popped octave also blasts a wedge
  // where you face and smacks the closest enemy in it flying, bowling into the ones behind, and dead notes also
  // shove the close ones off you.
  remix: {
    id: 'slapbass', name: 'Slap Bass', pedal: 'overdrive',
    text: 'Every slap walks the thumps round you, and pops blast where you face and smack an enemy flying into the crowd.',
    sound: 'slapped roots, popped octaves on the off-beats and muted dead notes.',
    pattern: [TH(0, 0, 2), PP(2), TH(3, 0, 1, 0.6), TH(4, 4, 1, 0.85), PP(6, 7, 0.9), DN(7), TH(8, 0, 2, 0.95), PP(10),
      TH(11, 0, 1, 0.6), TH(12, 4, 1, 0.85), PP(14, 7, 0.9), DN(15)],
    stats: { damage: 76, walk: 12, popDamage: 110, popReach: 240, popSpread: 1.2, popLaunch: 720, popCrash: 50, thudRadius: 80, deadDamage: 60, deadRadius: 100 },
    fire(g, note, st, inst) {
      const p = g.player, color = g.color('bass');
      this.fire(g, note, st, inst);
      if (note.k === 'pop') {
        // Where you face, turned onto a boss in reach, else the closest enemy in front of you (else the closest one
        // at all). A boss takes the wedge but is too heavy to fly.
        const reach = g.area(st.popReach);
        const e = g.bossInRange(p.x, p.y, reach) || nearestArc(g, g.aim(), 1.4, reach) || g.nearest(p.x, p.y, reach);
        const a = e ? Math.atan2(e.y - p.y, e.x - p.x) : g.aim();
        g.fx.cone({ x: p.x, y: p.y, angle: a, spread: st.popSpread, r: reach, damage: g.dmg(st.popDamage) * note.v, kb: 160, color });
        // The smacked enemy flies the way you popped it, bowling into the crowd, and lands with a thud.
        const crash = g.dmg(st.popCrash) * note.v, thud = g.area(st.thudRadius);
        if (e && !e.dead) g.launch(e, a, g.speed(st.popLaunch), crash, { onLand: (f, gg) => gg.fx.pulse({ x: f.x, y: f.y, r: thud, damage: crash, kb: 140, color, fill: 0.25 }) });
        g.shake = Math.max(g.shake, 2.5 * note.v);
      } else if (note.k === 'dead') {
        g.fx.pulse({ x: p.x, y: p.y, r: g.area(st.deadRadius), damage: g.dmg(st.deadDamage) * note.v, kb: 240, color, fill: 0.12, flashLife: 0.12 });
      }
    },
  },
};

// ---------------------------------------------------------------------------- Triangle Bass (8-Bit)

// The floor's grid: bombs sit in the middle of a tile, and crosses run along its rows and columns.
const TILE = 48;
const tile = (v) => (Math.floor(v / TILE) + 0.5) * TILE;
const FUSE = 0.45;   // a bomb blows on the first note at least this long (about a beat) after it landed

// Every bomb of `owner` whose fuse has run blows in a cross: everything on its row or column within `arm` px is
// hit once, pushed away from the bomb. With chain (level 4), a cross that runs over another of its bombs sets that
// one off as well, fuse or not, and so on.
function blowBombs(g, owner) {
  const all = g.fx.mines.filter((m) => m.owner === owner && m.cross);
  const queue = all.filter((m) => m.age >= FUSE);
  if (!queue.length) return;
  const gone = new Set(), prev = g.src;
  while (queue.length) {
    const m = queue.shift();
    if (gone.has(m)) continue;
    gone.add(m);
    g.src = m.src;
    const { arm, w, chain } = m.cross;
    for (const e of g.inRadius(m.x, m.y, arm + w)) {
      const dx = Math.abs(e.x - m.x), dy = Math.abs(e.y - m.y);
      if ((dy <= w / 2 + e.r && dx <= arm + e.r) || (dx <= w / 2 + e.r && dy <= arm + e.r)) g.hit(e, m.damage, { kb: m.kb, fx: m.x, fy: m.y });
    }
    // Drawn as two beams that deal nothing (the hits above are the blast), and a flash on the bomb.
    g.fx.beam({ x: m.x - arm, y: m.y, angle: 0, length: arm * 2, width: w, damage: 0, color: m.color, life: 0.22 });
    g.fx.beam({ x: m.x, y: m.y - arm, angle: Math.PI / 2, length: arm * 2, width: w, damage: 0, color: m.color, life: 0.22 });
    g.fx.flash(m.x, m.y, w, m.color, 0.2, 0.3);
    if (chain) {
      for (const o of all) {
        if (gone.has(o)) continue;
        const dx = Math.abs(o.x - m.x), dy = Math.abs(o.y - m.y);
        if ((dy < 1 && dx <= arm) || (dx < 1 && dy <= arm)) queue.push(o);
      }
    }
  }
  g.src = prev;
  g.fx.mines = g.fx.mines.filter((m) => !gone.has(m));
  g.shake = Math.max(g.shake, 1.5);
}

const triBass = {
  id: 'tribass',
  name: 'Triangle Bass',
  role: 'bass',
  style: 'chip',
  blurb: 'The bouncy low line of old game consoles. Every note drops a bomb on the floor tile under you, and a beat later it blows in a cross.',
  steps: 16,
  low: 28,
  levels: [
    { text: 'Low and high notes bounce back and forth. Each note drops a bomb on your tile, and a beat later it blows in a cross along the floor.',
      pattern: [R(0, 2), O(2, 2, 0.8), R(8, 2, 0.95), O(10, 2, 0.8)],
      stats: { damage: 20, arm: 96, width: 28, kb: 90 } },
    { text: 'The bounce carries through beat 2. More bombs every bar.',
      pattern: [R(0, 2), O(2, 2, 0.8), R(4, 2, 0.9), O(6, 2, 0.8), R(8, 2, 0.95), O(10, 2, 0.8)],
      stats: { damage: 21, arm: 100, width: 29, kb: 95 } },
    { text: 'Bounces on every half beat. Longer crosses.',
      pattern: [R(0, 2), O(2, 2, 0.8), R(4, 2, 0.9), O(6, 2, 0.8), R(8, 2, 0.95), O(10, 2, 0.8), F(12, 2, 0.9), O(14, 2, 0.8)],
      stats: { damage: 25, arm: 120, width: 30, kb: 100 } },
    { text: 'Quick extra hops between the bounces. A cross that runs over another bomb sets it off.',
      pattern: [R(0, 2), O(2, 1, 0.8), O(3, 1, 0.55), R(4, 2, 0.9), O(6, 2, 0.8), R(8, 2, 0.95), O(10, 1, 0.8), O(11, 1, 0.55), F(12, 2, 0.9), O(14, 2, 0.8)],
      stats: { damage: 29, arm: 124, width: 32, kb: 120, chain: 1 } },
    { text: 'Full bouncing line. The longest crosses, and they throw enemies back harder.',
      pattern: [R(0, 2), O(2, 1, 0.8), O(3, 1, 0.55), R(4, 2, 0.9), O(6, 1, 0.8), R(7, 1, 0.55), R(8, 2, 0.95), O(10, 1, 0.8), O(11, 1, 0.55), F(12, 2, 0.9), O(14, 1, 0.8), R(15, 1, 0.6)],
      stats: { damage: 33, arm: 144, width: 34, kb: 135, chain: 1 } },
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

  // Bombs whose fuse has run (a beat since they landed) blow first, then a fresh one drops on the tile under you (one
  // bomb a tile: standing still you keep one ticking, running you leave a trail). On the bar's first note, with a
  // boss in range, the bomb lands on the boss's tile instead. An echo only lights fuses, it drops nothing.
  fire(g, note, st, inst) {
    const p = g.player, id = inst.def.id;
    blowBombs(g, id);
    if (g.dmgScale !== 1) return;
    const boss = note.s === 0 ? g.bossInRange(p.x, p.y, 260) : null;
    const x = tile((boss || p).x), y = tile((boss || p).y);
    if (g.fx.mines.some((m) => m.owner === id && m.x === x && m.y === y)) return;
    const m = g.fx.mine({ owner: id, x, y, r: TILE * 0.45, damage: g.dmg(st.damage) * note.v, kb: st.kb, color: g.color('bass'),
      life: 3, max: 10, size: 6 + note.v * 2 });
    m.cross = { arm: g.area(st.arm), w: st.width, chain: !!st.chain };
  },

  // A half-time fuzz line. The downbeat drops a speaker on your tile (the last two stay, two bars each), and
  // every note blasts a shockwave out of each speaker and still drops the level 5 bombs. Where you stand on
  // the downbeat is where the sound comes from: plant them and lead the crowd past.
  remix: {
    id: 'blownspeaker', name: 'Blown Speaker', pedal: 'overdrive',
    text: 'The downbeat drops a speaker at your feet that blasts on every note.',
    sound: 'a half-time root through a fuzz that is tearing the speaker.',
    pattern: [R(0, 6), O(6, 1, 0.7), R(7, 1, 0.6), F(10, 4, 0.9), O(14, 1, 0.7), R(15, 1, 0.65)],
    stats: { damage: 46, speakerDamage: 46, speakerRadius: 150, speakerLife: 4.25, dropDamage: 70, dropRadius: 120 },
    fire(g, note, st, inst) {
      this.fire(g, note, st, inst);
      const p = g.player, color = g.color('bass');
      // The speakers have an owner of their own, so the bombs never push them out.
      const spk = inst.def.id + ':speaker';
      if (note.s === 0) {
        if (g.dmgScale === 1) {
          // Two speakers at most (the oldest goes); they never go off, they ring.
          g.fx.mine({ owner: spk, x: tile(p.x), y: tile(p.y), r: g.area(st.speakerRadius), damage: 0, kb: 0, color, life: st.speakerLife, max: 2, size: 11, persist: true });
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
