// Song structure. The run is one song: sections change the chord progression, the arena color and
// the enemy mix, and the arrangement changes which parts play and how. Progressions are scale degrees
// in the run's minor key; {d, h} = harmonic-minor chord.
//
// Section data: lift raises the section's key by semitones (the Finale's key change). A radio edit
// (src/music/replay.js) also uses from (start the section's progression and arrangement that many bars
// in) and end (the outro: one last downbeat, then silence).

import { ROLES } from '../config.js';
import { makeChord } from './theory.js';

const P = {
  verse:  [0, 5, 2, 6],                       // i  VI III VII
  verse2: [0, 3, 5, 6],                       // i  iv VI  VII
  chorus: [5, 6, 4, 0],                       // VI VII v  i
  bridge: [3, 0, 3, { d: 4, h: true }],       // iv i  iv  V
  build:  [3, 3, { d: 4, h: true }, { d: 4, h: true }],
  finale: [0, 6, 5, { d: 4, h: true }],       // i  VII VI V (Andalusian cadence)
};

export const SECTIONS = [
  { id: 'intro',   name: 'Intro',     bars: 16, prog: P.verse,  hue: 248 },
  { id: 'verse1',  name: 'Verse',     bars: 32, prog: P.verse,  hue: 226 },
  { id: 'chorus1', name: 'Chorus',    bars: 32, prog: P.chorus, hue: 292, boss: 'drone',      riser: true },
  { id: 'verse2',  name: 'Verse II',  bars: 32, prog: P.verse2, hue: 204 },
  { id: 'chorus2', name: 'Chorus II', bars: 32, prog: P.chorus, hue: 318, boss: 'clipper',    riser: true },
  { id: 'bridge',  name: 'Bridge',    bars: 32, prog: P.bridge, hue: 172, note: 'The drums sit out for the breakdown' },
  { id: 'build',   name: 'Build-Up',  bars: 16, prog: P.build,  hue: 34,  build: true, note: 'The drums build to the drop' },
  { id: 'drop',    name: 'The Drop',  bars: 32, prog: P.chorus, hue: 336, boss: 'glitchking', riser: true, drop: true },
  { id: 'finale',  name: 'Finale',    bars: Infinity, prog: P.finale, hue: 6, boss: 'whitenoise', riser: true, lift: 2 },
];

export const FINALE_BAR = SECTIONS.slice(0, -1).reduce((s, x) => s + x.bars, 0);

// ---------------------------------------------------------------------------- the texture chart
//
// Every section is a list of 8-bar phrases (the Finale cycles its list). A phrase gives each channel a
// texture: a transform of the channel's own part (src/music/sequencer.js TRANSFORMS) and a damage weight
// for its notes, so a thinner part can hit harder. A role the phrase leaves out plays its full part.
//   full     the part as written          out      tacet (no sound, no attack)
//   lvN      level N's simpler part        sparse   the first note of each beat
//   half     half time, notes twice as long          double   double time, even steps
//   call     only the even bars             answer   only the odd bars
//   hold     the bar's first note, held     low      an octave down
//   inv      the tune mirrored (chord and scale steps upside down)
// Weights default per transform (WEIGHT); 'tf*w' sets one. The rules on top, applied by the sequencer
// for the band that is playing: 'out' plays 'sparse' while the band has 3 channels or fewer, a remixed
// channel never goes 'out' (it plays 'sparse'), and in a solo phrase the featured channel plays its
// solo variant over everyone else's thin line.
//
// Each phrase has a class, which sets the desk and the band its energy must stay in (tools/check.mjs
// --arrange): 'quiet' a breakdown (the desk drops and filters, the bar before it breaks off on beat 3),
// 'solo' one channel takes the stage, 'mid' a thinner verse-like texture, 'full' the band at full
// strength. e is the phrase's energy: the band's damage per second against its full parts (the mean over
// the standard level 5 bands, measured by --arrange; it fails when this drifts).
// impact: the phrase's downbeat hits like a Drop (the band slams back in). 'first': only on the
// section's first pass (the Finale's opening).

export const WEIGHT = { full: 1, out: 0, sparse: 1, half: 1.5, double: 0.65, call: 1.15, answer: 1.15, hold: 1.3, low: 1, inv: 1, lv1: 1, lv2: 1, lv3: 1, lv4: 1 };
export const ENERGY_BANDS = { quiet: [0.33, 0.65], solo: [0.5, 0.8], mid: [0.55, 0.92], full: [0.88, 1.15] };

const FULL_TEX = { tf: 'full', w: 1 };
const OUT_TEX = { tf: 'out', w: 0 };

// ph(cls, e, 'role:tf*w ...', { impact, solo })
function ph(cls, e, spec = '', more = {}) {
  const tex = {};
  for (const r of ROLES) tex[r] = FULL_TEX;
  for (const item of spec.split(/\s+/).filter(Boolean)) {
    const [role, t] = item.split(':');
    const [tf, w] = t.split('*');
    tex[role] = tf === 'out' ? OUT_TEX : { tf, w: w !== undefined ? Number(w) : WEIGHT[tf] ?? 1 };
  }
  return { cls, e, tex, solo: cls === 'solo', impact: more.impact || false, spec };
}

export const CHART = {
  // One sound grows into two.
  intro: [
    ph('full', 1.0),
    ph('full', 1.0),
  ],
  // Verse: the groove is laid back. Groove and chords play their simpler parts, the sparkle sits out
  // (or only marks the beats in a small band), and the lead talks every other bar. It fills in toward the chorus.
  verse1: [
    ph('mid', 0.57, 'beat:lv2*1.2 perc:lv1*1.3 chords:lv1*1.4 lead:call*1.4 arp:out'),
    ph('mid', 0.7, 'perc:lv2 chords:lv2 lead:call arp:lv1'),
    ph('mid', 0.78, 'perc:lv3 chords:hold*1.6 arp:lv2'),
    ph('full', 1.0),
  ],
  // Chorus: the whole band slams in. The third phrase turns the tune upside down.
  chorus1: [
    ph('full', 1.0, '', { impact: true }),
    ph('full', 1.0),
    ph('full', 1.0, 'lead:inv'),
    ph('full', 0.94),
  ],
  // Verse II drops down after the chorus breaks off: underwater at first, half-time hats, held chords, the
  // lead and the sparkle answering each other. Then the lead sinks an octave and the band climbs back,
  // held chords under a racing sparkle into the second chorus.
  verse2: [
    ph('quiet', 0.57, 'beat:lv2 perc:half bass:lv2 chords:hold*1.6 lead:call*1.3 arp:answer*1.3'),
    ph('mid', 0.65, 'beat:lv3 perc:half bass:lv3 chords:hold*1.6 lead:answer*1.3 arp:call*1.3'),
    ph('mid', 0.86, 'chords:lv2 lead:low arp:lv2'),
    ph('full', 0.92, 'chords:hold*2 arp:double*0.9'),
  ],
  // Chorus II is bigger: the sparkle doubles up, then the tune flips over a double-time groove.
  chorus2: [
    ph('full', 1.0, '', { impact: true }),
    ph('full', 1.0),
    ph('full', 0.96, 'arp:double'),
    ph('full', 0.93, 'perc:double*0.9 lead:inv arp:double'),
  ],
  // The Bridge: a real breakdown (no drums, the bass in half time under held chords), then one channel
  // takes a solo over a heartbeat, then everything but the drums builds back, and the drums return on
  // an impact.
  bridge: [
    ph('quiet', 0.4, 'beat:out perc:out bass:half*1.8 chords:hold*1.8 lead:call*1.4 arp:lv1*1.2'),
    ph('solo', 0.62, 'beat:lv1*1.2 perc:lv1*1.2 bass:lv1*1.4 chords:hold*1.5 lead:out arp:out'),
    ph('mid', 0.84, 'beat:out lead:low'),
    ph('full', 1.0, 'lead:inv', { impact: true }),
  ],
  // Build-Up: a thin pulse with the sparkle driving double time, then the drums roll into the drop
  // (bars 8-15: see ROLL) while the lead holds its breath.
  build: [
    ph('mid', 0.6, 'beat:sparse*1.3 perc:out bass:sparse*1.5 chords:hold*1.8 lead:out arp:double*1.5'),
    ph('full', 0.94, 'perc:lv2 lead:out arp:double*1.2'),
  ],
  // The Drop: heavy half-time drums and fat bass and chord hits with no lead, then the lead comes back
  // upside down, then the climax doubles the groove and the sparkle.
  drop: [
    ph('full', 0.92, 'beat:half*2.2 perc:double*1.1 bass:full*1.3 chords:lv1*2 lead:out arp:answer*1.5', { impact: true }),
    ph('full', 0.95, 'beat:half*2.2 perc:double*1.1 bass:full*1.3 chords:lv1*2 lead:inv*0.9 arp:out'),
    ph('full', 0.95, 'lead:inv arp:answer*1.4'),
    ph('full', 1.02, 'perc:double*0.9 arp:double*0.9'),
  ],
  // The Finale cycles: the full band in the new key, a breakdown, a solo over a half-time heartbeat, and
  // the band rising back in on an impact. It rises and falls every 64 seconds until White Noise is silenced.
  finale: [
    ph('full', 0.94, '', { impact: 'first' }),
    ph('quiet', 0.38, 'beat:out perc:lv1*1.3 bass:half*1.8 chords:hold*1.8 lead:call*1.3 arp:out'),
    ph('solo', 0.62, 'beat:half*1.3 perc:lv1*1.3 bass:lv1*1.6 chords:hold*1.8 lead:out arp:out'),
    ph('full', 0.96, 'perc:double*0.9 lead:inv arp:double', { impact: true }),
  ],
};

// ---------------------------------------------------------------------------- the arrangement
//
// How a bar differs from the plain loop. Every note it adds or removes still goes through the
// sequencer's note events, so the fight changes with the music.
//   phrase  index of the 8-bar phrase in the section (pb: the bar in it, 0..7; cycle: the Finale's pass)
//   tex     role -> { tf, w }: the phrase's texture (see CHART)
//   cls     'quiet' | 'solo' | 'mid' | 'full'; quiet and solo are also flags
//   energy  the phrase's declared energy (~0.3..1.1)
//   rest    channels that sit out (tf 'out')
//   fill    the Beat channel plays a fill on steps 12-15 (the last bar of each phrase)
//   brk     the bar before a quiet phrase breaks off: every channel rests from this step (instead of the fill)
//   roll    the Beat channel plays its fill sound every `roll` steps (kicks: false drops the kicks
//           under it), getting louder from v0 to v1 across the bar
//   sweep   the 2-bar filter sweep into The Drop starts on this downbeat
//   impact  this downbeat hits like a Drop: the band slams back in (a game event too)
//   cut     every channel plays its step-0 notes, then rests until this step
const BASE = { phrase: 0, pb: 0, cycle: 0, cls: 'full', tex: null, quiet: false, solo: false, impact: false, energy: 1,
  rest: [], fill: false, brk: 0, roll: 0, kicks: true, v0: 1, v1: 1, sweep: false, cut: 0 };
const ALL_FULL = Object.fromEntries(ROLES.map((r) => [r, FULL_TEX]));
const ALL_OUT = Object.fromEntries(ROLES.map((r) => [r, OUT_TEX]));
const PLAIN = Object.freeze({ ...BASE, tex: ALL_FULL });
// The Build-Up's last 8 bars: 8ths over kicks, then 16ths, then 16ths alone, louder every step.
const ROLL = Array.from({ length: 8 }, (_, i) => ({
  roll: i < 4 ? 2 : 1, kicks: i < 6, sweep: i === 6, v0: 0.45 + (0.55 * i * 16) / 127, v1: 0.45 + (0.55 * (i * 16 + 15)) / 127,
}));
const LAST_HIT = Object.freeze({ ...BASE, tex: ALL_FULL, cut: 16 });
const SILENT = Object.freeze({ ...BASE, tex: ALL_OUT, rest: ROLES, energy: 0 });

// The phrase at bar b of a section (b counted from the section's `from`).
export function phraseAt(section, b) {
  const list = CHART[section.id];
  if (!list) return null;
  const phrase = b >> 3;
  return { ph: list[phrase % list.length], phrase, cycle: Math.floor(phrase / list.length) };
}

// The arrangement part for bar b of a section (b counted from the section's `from`), without the
// break (which needs the next bar).
function arrangement(section, b) {
  if (section.end) return b ? SILENT : LAST_HIT;
  const at = phraseAt(section, b);
  if (!at) return PLAIN;
  const { ph, phrase, cycle } = at;
  const pb = b & 7;
  const rest = ROLES.filter((r) => ph.tex[r].tf === 'out');
  const impact = pb === 0 && (ph.impact === 'first' ? cycle === 0 : !!ph.impact);
  const roll = section.build && b >= 8 && b < 16 ? ROLL[b - 8] : null;
  return { ...BASE, phrase, pb, cycle, cls: ph.cls, tex: ph.tex, quiet: ph.cls === 'quiet', solo: ph.solo, impact, energy: ph.e,
    rest, fill: pb === 7 && !roll, ...roll };
}

export class Song {
  constructor(keyPc, sections = SECTIONS) {
    this.keyPc = keyPc;
    this.sections = sections;
    this.chordCache = new Map();
    this.posCache = new Map();
  }

  chord(spec, lift = 0) {
    const d = typeof spec === 'number' ? spec : spec.d;
    const h = typeof spec === 'number' ? false : !!spec.h;
    const key = d * 2 + (h ? 1 : 0) + 16 * lift;
    let c = this.chordCache.get(key);
    if (!c) { c = makeChord((this.keyPc + lift) % 12, d, h); this.chordCache.set(key, c); }
    return c;
  }

  // Where bar `bar` falls in the song. arr is that bar's arrangement part. Positions are cached: treat
  // them as read-only.
  position(bar) {
    let p = this.posCache.get(bar);
    if (!p) {
      p = this._position(bar);
      // The last bar of a phrase breaks off on beat 3 when a breakdown follows (instead of the fill).
      const a = p.arr;
      if (a.pb === 7 && !a.roll && !p.section.end) {
        const n = this._position(bar + 1).arr;
        if (n.quiet && n.pb === 0) p.arr = { ...a, fill: false, brk: 8 };
      }
      if (this.posCache.size > 4096) this.posCache.clear();
      this.posCache.set(bar, p);
    }
    return p;
  }

  _position(bar) {
    const S = this.sections;
    let start = 0;
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      if (bar < start + s.bars) {
        const barInSection = bar - start;
        const b = barInSection + (s.from || 0);
        const chord = this.chord(s.prog[b % s.prog.length], s.lift);
        return { index: i, section: s, barInSection, sectionStart: start, chord, barsLeft: s.bars - barInSection, arr: arrangement(s, b) };
      }
      start += s.bars;
    }
    const s = S[S.length - 1];
    return { index: S.length - 1, section: s, barInSection: bar - start, sectionStart: start, chord: this.chord(s.prog[0], s.lift), barsLeft: Infinity, arr: PLAIN };
  }
}
