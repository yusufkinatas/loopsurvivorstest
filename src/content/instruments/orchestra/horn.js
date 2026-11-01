// LEAD, Orchestra: French Horn. A heroic 2-bar call and answer. Short notes fire a small bolt at once; a held
// note saves its breath and, when it ends, sends one slow blast that pierces everything and swells as it flies.
// Like every Orchestra sound it rides the 8-bar phrase (note.phrase): soft after each fill, full at its climax.

import { STEP_SEC } from '../../../config.js';

// Pattern helpers (32 steps): chord tone (0 root, 1 third, 2 fifth, 3 octave) or scale step, d steps long.
const C = (s, ct, d = 1, v = 1) => ({ s, ct, d, v });
const N = (s, sc, d = 1, v = 1) => ({ s, sc, d, v });

// Chord roots land between LOW and LOW + 11 and the tune climbs at most an octave above, so every note stays
// in the lead's range (MIDI 62 to 86) in every key.
const LOW = 62;
const MID = 74;                  // pitch steering is centered here
const HELD = 3;                  // a note this many steps long is held: it fires its blast when it ends

const swellGain = (note) => 0.55 + 0.45 * (note.phrase || 0);
const swellDmg = (note) => 0.7 + 0.6 * (note.phrase || 0);

// Where a blast goes: a boss in reach, else the thickest crowd, else the nearest enemy, else where you face.
function blastAim(g, st) {
  const p = g.player;
  const t = g.bossInRange(p.x, p.y, st.reach) || g.densest(st.reach)?.enemy || g.nearest(p.x, p.y, st.reach + 80);
  return t ? { angle: Math.atan2(t.y - p.y, t.x - p.x), t } : { angle: g.aim(), t: null };
}

// The blast: a ring of sound leaving the bell, slow, piercing everything, widening as it travels.
// o: x, y, angle, r, dmg, and optionally speed (a multiple of st.slow) and life.
function blast(g, inst, st, o) {
  return g.fx.bullet({ x: o.x, y: o.y, angle: o.angle, speed: g.speed(st.slow) * (o.speed ?? 1), r: o.r, grow: st.grow, maxR: st.maxR,
    damage: o.dmg, pierce: 999, life: o.life ?? st.life, kb: 140, color: g.color(inst), shape: 'ring', trail: true });
}

// One note. Short: a bolt now, steered a little by pitch. Held: the blast when the note ends, sized by its length.
// onBlast(g, shot, aim, { r, dmg }) runs right after a blast leaves (Fanfare answers it).
function play(g, note, st, inst, onBlast) {
  const p = g.player;
  const color = g.color(inst);
  const sw = swellDmg(note);
  const steps = Math.max(1, Math.round(note.dur / STEP_SEC));
  if (steps < HELD) {
    const t = g.nearest(p.x, p.y, 540);
    const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : g.aim();
    const n = g.amount(1);
    for (let i = 0; i < n; i++) {
      // High notes leave a little to one side, low notes to the other, so a run fans across the target.
      const a = base + (note.midi - MID) * 0.012 + (i - (n - 1) / 2) * 0.3;
      g.fx.bullet({ x: p.x, y: p.y, angle: a, speed: g.speed(st.speed), r: 5.5, life: 1.1, damage: g.dmg(st.damage) * note.v * sw,
        pierce: st.pierce, kb: 50, color, shape: 'note', trail: true });
    }
    return;
  }
  // Damage and size are fixed now (the arrangement's weight, the fader, the echo scale), delivered at the end.
  const len = Math.min(steps, 12);
  const dmg = g.dmg(st.big + st.perStep * len) * note.v * sw;
  const r = st.r0 + st.rStep * len;
  const go = (gg) => {
    const aim = blastAim(gg, st);
    const n = gg.amount(1);
    for (let i = 0; i < n; i++) {
      const shot = blast(gg, inst, st, { x: gg.player.x, y: gg.player.y, angle: aim.angle + (i - (n - 1) / 2) * 0.35, r, dmg });
      if (shot && onBlast && i === 0) onBlast(gg, shot, aim, { r, dmg });
    }
    gg.fx.flash(gg.player.x, gg.player.y, 26, color, 0.2, 0.25);
  };
  // An echo is already late: it blasts at once and schedules nothing.
  if (g.dmgScale !== 1) { go(g); return; }
  // The horn draws breath while the note holds.
  g.fx.flash(p.x, p.y, 18 + 2 * len, color, Math.min(0.5, note.dur), 0.08);
  g.later.push({ at: g.time + steps * STEP_SEC, fn: () => {
    if (!g.loadout.has(inst)) return;
    const prev = g.src; g.src = inst;
    go(g);
    g.src = prev;
  } });
}

export default {
  id: 'horn',
  name: 'French Horn',
  role: 'lead',
  style: 'orchestra',
  blurb: 'A heroic horn: long notes launch slow, swelling blasts that pierce everything.',
  steps: 32,
  low: LOW,
  levels: [
    { text: 'Short notes fire bolts. Long notes launch a swelling blast.',
      pattern: [C(0, 0, 2, 0.9), C(2, 2, 2, 0.9), C(4, 3, 6), C(16, 1, 2, 0.9), C(20, 3, 4), C(28, 0, 4)],
      stats: { damage: 6, speed: 520, pierce: 1, big: 11, perStep: 2.2, r0: 9, rStep: 1.5, grow: 12, maxR: 36, slow: 250, life: 2.2, reach: 520 } },
    { text: 'A held note answers in the first bar.',
      pattern: [C(0, 0, 2, 0.9), C(2, 2, 2, 0.9), C(4, 3, 6), C(12, 2, 4, 0.9), C(16, 1, 2, 0.9), C(20, 3, 4), C(28, 0, 4)],
      stats: { damage: 8, speed: 530, pierce: 1, big: 16, perStep: 3.2, r0: 9, rStep: 1.5, grow: 14, maxR: 40, slow: 250, life: 2.2, reach: 530 } },
    { text: 'Quick steps walk down between the long notes.',
      pattern: [C(0, 0, 2, 0.9), C(2, 2, 2, 0.9), C(4, 3, 6), N(10, 6, 1, 0.7), N(11, 5, 1, 0.75), C(12, 2, 4, 0.9),
        C(16, 1, 2, 0.9), C(20, 3, 4), C(28, 0, 4)],
      stats: { damage: 10, speed: 540, pierce: 1, big: 20, perStep: 4, r0: 10, rStep: 1.6, grow: 16, maxR: 44, slow: 255, life: 2.3, reach: 540 } },
    { text: 'The answer climbs with quick notes.',
      pattern: [C(0, 0, 2, 0.9), C(2, 2, 2, 0.9), C(4, 3, 6), N(10, 6, 1, 0.7), N(11, 5, 1, 0.75), C(12, 2, 4, 0.9),
        C(16, 1, 2, 0.9), N(18, 3, 1, 0.7), C(19, 2, 1, 0.8), C(20, 3, 4), C(28, 0, 4)],
      stats: { damage: 12, speed: 550, pierce: 2, big: 25, perStep: 5, r0: 10, rStep: 1.7, grow: 18, maxR: 48, slow: 255, life: 2.3, reach: 550 } },
    { text: 'A falling run leads home. Bigger blasts.',
      pattern: [C(0, 0, 2, 0.9), C(2, 2, 2, 0.9), C(4, 3, 6), N(10, 6, 1, 0.7), N(11, 5, 1, 0.75), C(12, 2, 4, 0.9),
        C(16, 1, 2, 0.9), N(18, 3, 1, 0.7), C(19, 2, 1, 0.8), C(20, 3, 4), N(24, 4, 1, 0.75), N(25, 3, 1, 0.7), C(26, 1, 2, 0.85), C(28, 0, 4)],
      stats: { damage: 15, speed: 560, pierce: 2, big: 30, perStep: 6.5, r0: 11, rStep: 1.8, grow: 20, maxR: 52, slow: 260, life: 2.4, reach: 560 } },
  ],

  sound(A, t, note, out, inst) {
    const { ctx, v } = A;
    const held = note.dur >= HELD * STEP_SEC - 0.001;
    const f = note.freq;
    const sw = swellGain(note);
    const rx = !!inst?.remix;
    const dur = note.dur * 0.92;
    // Every note scoops up into pitch like a lip slur; held notes bloom into a slow vibrato.
    const scoop = { from: 0.985, time: 0.07 };
    const vib = held ? { rate: 4.8, depth: 10, delay: 0.28 } : null;
    // Body: a soft saw through a warm resonant low-pass (the bell), plus a round sine underneath. Fanfare (remix)
    // plays bells up: the filter opens and the brass starts to rasp.
    v.tone(ctx, out, t, { freq: f, wave: 'sawtooth', unison: 2, spread: 5, dur, a: held ? 0.06 : 0.03, d: 0.22, s: 0.8, r: held ? 0.2 : 0.1,
      gain: (rx ? 0.22 : 0.27) * note.v * sw, filter: { type: 'lowpass', freq: Math.max(1000, f * (rx ? 4.2 : 3)), q: 1.6, env: 1.6, decay: 0.25 },
      pitchEnv: scoop, vibrato: vib, drive: rx ? 1.8 : 0 });
    v.tone(ctx, out, t, { freq: f, wave: 'sine', dur, a: held ? 0.08 : 0.04, d: 0.2, s: 0.85, r: held ? 0.22 : 0.1,
      gain: 0.16 * note.v * sw, pitchEnv: scoop, vibrato: vib });
  },

  fire(g, note, st, inst) { play(g, note, st, inst, null); },

  remix: {
    id: 'fanfare', name: 'Fanfare', pedal: 'chorus',
    text: 'Three horns answer every blast, flying back through you.',
    // A new part: brass fanfare figures, three quick repeated notes into a held one, rising through the chord.
    pattern: [C(0, 2, 1, 0.75), C(1, 2, 1, 0.7), C(2, 2, 1, 0.8), C(3, 3, 5),
      C(8, 2, 1, 0.75), C(9, 3, 1, 0.8), C(10, 3, 6, 0.95),
      C(16, 1, 1, 0.75), C(17, 1, 1, 0.7), C(18, 1, 1, 0.8), C(19, 2, 5),
      C(24, 1, 1, 0.75), C(25, 2, 1, 0.8), C(26, 3, 6)],
    stats: { big: 36, perStep: 8, maxR: 58, answer: 0.75, spread: 0.4, beyond: 300, past: 320, gap: 6, answerSpeed: 1.7 },
    // Each blast is answered 6 steps later by three more that start beyond its target, fanned around you, and fly
    // back through wherever you are by then and on past you: the crowd is caught from both sides and the
    // answers sweep what is chasing you too. Echoes do not answer.
    fire(g, note, st, inst) {
      const answer = g.dmgScale !== 1 ? null : (gg, shot, aim, o) => {
        const p0x = gg.player.x, p0y = gg.player.y;
        // How far beyond you the answers start: past the target (or 260 px out when there was none).
        const far = (aim.t ? Math.hypot(aim.t.x - p0x, aim.t.y - p0y) : 260) + st.beyond;
        gg.later.push({ at: gg.time + st.gap * STEP_SEC, fn: () => {
          if (!gg.loadout.has(inst)) return;
          const prev = gg.src; gg.src = inst;
          const p = gg.player;
          for (let k = -1; k <= 1; k++) {
            const a = aim.angle + k * st.spread;
            const x = p0x + Math.cos(a) * far, y = p0y + Math.sin(a) * far;
            const d = Math.hypot(p.x - x, p.y - y);
            const life = Math.min(3.2, (d + st.past) / (gg.speed(st.slow) * st.answerSpeed));
            blast(gg, inst, st, { x, y, angle: Math.atan2(p.y - y, p.x - x), r: o.r, dmg: o.dmg * st.answer, speed: st.answerSpeed, life });
            gg.fx.flash(x, y, o.r + 10, gg.color(inst), 0.25, 0.2);
          }
          gg.src = prev;
        } });
      };
      play(g, note, st, inst, answer);
    },
  },
};
