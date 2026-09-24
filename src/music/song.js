// Song structure. The run is one song: sections change the chord progression, the arena color and
// the enemy mix. Progressions are scale degrees in the run's minor key; {d, h} = harmonic-minor chord.

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
  { id: 'bridge',  name: 'Bridge',    bars: 32, prog: P.bridge, hue: 172 },
  { id: 'build',   name: 'Build-Up',  bars: 16, prog: P.build,  hue: 34,  build: true },
  { id: 'drop',    name: 'The Drop',  bars: 32, prog: P.chorus, hue: 336, boss: 'glitchking', riser: true, drop: true },
  { id: 'finale',  name: 'Finale',    bars: Infinity, prog: P.finale, hue: 6, boss: 'whitenoise', riser: true },
];

export const FINALE_BAR = SECTIONS.slice(0, -1).reduce((s, x) => s + x.bars, 0);

export class Song {
  constructor(keyPc) {
    this.keyPc = keyPc;
    this.chordCache = new Map();
  }

  chord(spec) {
    const d = typeof spec === 'number' ? spec : spec.d;
    const h = typeof spec === 'number' ? false : !!spec.h;
    const key = d * 2 + (h ? 1 : 0);
    let c = this.chordCache.get(key);
    if (!c) { c = makeChord(this.keyPc, d, h); this.chordCache.set(key, c); }
    return c;
  }

  // Where bar `bar` falls in the song.
  position(bar) {
    let start = 0;
    for (let i = 0; i < SECTIONS.length; i++) {
      const s = SECTIONS[i];
      if (bar < start + s.bars) {
        const barInSection = bar - start;
        const chord = this.chord(s.prog[barInSection % s.prog.length]);
        return { index: i, section: s, barInSection, sectionStart: start, chord, barsLeft: s.bars - barInSection };
      }
      start += s.bars;
    }
    const s = SECTIONS[SECTIONS.length - 1];
    return { index: SECTIONS.length - 1, section: s, barInSection: bar - start, sectionStart: start, chord: this.chord(s.prog[0]), barsLeft: Infinity };
  }
}
