// Song structure. The run is one song: sections change the chord progression, the arena color and
// the enemy mix, and the arrangement changes which parts play. Progressions are scale degrees in the
// run's minor key; {d, h} = harmonic-minor chord.
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

// The arrangement: how a bar differs from the plain loop. Every note it adds or removes still goes
// through the sequencer's note events, so the fight changes with the music.
//   rest    channels that sit out (no sound, no attack)
//   fill    the Beat channel plays a fill on steps 12-15
//   roll    the Beat channel plays its fill sound every `roll` steps (kicks: false drops the kicks
//           under it), getting louder from v0 to v1 across the bar
//   sweep   the 2-bar filter sweep into The Drop starts on this downbeat
//   impact  this downbeat hits like the player's own Drop
//   cut     every channel plays its step-0 notes, then rests until this step
const part = (o) => ({ rest: [], fill: false, roll: 0, kicks: true, v0: 1, v1: 1, sweep: false, impact: false, cut: 0, ...o });
const PLAIN = part({});
const FILL = part({ fill: true });
const BREAKDOWN = part({ rest: ['beat', 'perc'] });
const DRUMS_OUT = part({ rest: ['beat'] });
// The Build-Up's last 8 bars: 8ths over kicks, then 16ths, then 16ths alone, louder every step.
const ROLL = Array.from({ length: 8 }, (_, i) => part({
  roll: i < 4 ? 2 : 1, kicks: i < 6, sweep: i === 6, v0: 0.45 + (0.55 * i * 16) / 127, v1: 0.45 + (0.55 * (i * 16 + 15)) / 127,
}));
const IMPACT = part({ impact: true });
const LAST_HIT = part({ cut: 16 });
const SILENT = part({ rest: ROLES });

// Section id -> part for bar b (counted from the section's `from`), or null for the plain loop.
const ARRANGE = {
  bridge: (b) => (b < 4 ? BREAKDOWN : b < 8 ? DRUMS_OUT : null),   // the drums and groove drop out, the groove returns, then the drums
  build:  (b) => (b >= 8 ? ROLL[b - 8] : null),
  drop:   (b) => (b === 0 ? IMPACT : null),
};

// Every section is a multiple of 8 bars, so the fill on each 8th bar also ends every section.
export function arrangement(section, b) {
  if (section.end) return b ? SILENT : LAST_HIT;
  return ARRANGE[section.id]?.(b) || (b % 8 === 7 ? FILL : PLAIN);
}

export class Song {
  constructor(keyPc, sections = SECTIONS) {
    this.keyPc = keyPc;
    this.sections = sections;
    this.chordCache = new Map();
  }

  chord(spec, lift = 0) {
    const d = typeof spec === 'number' ? spec : spec.d;
    const h = typeof spec === 'number' ? false : !!spec.h;
    const key = d * 2 + (h ? 1 : 0) + 16 * lift;
    let c = this.chordCache.get(key);
    if (!c) { c = makeChord((this.keyPc + lift) % 12, d, h); this.chordCache.set(key, c); }
    return c;
  }

  // Where bar `bar` falls in the song. arr is that bar's arrangement part.
  position(bar) {
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
