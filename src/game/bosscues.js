// Boss cues: the sound a boss makes on the beats it attacks on, so a fight can be heard coming, and the
// leitmotif it announces itself with. The sequencer asks on every beat at schedule time, a moment before
// the beat is heard, and the desk plays the cue on that beat (AudioEngine.bossCue). The attack predicates
// are copies of the attack beats in bossOnBeat (src/game/enemies.js): change them together.

import { whiteNoisePhase } from './enemies.js';
import { BALANCE } from '../config.js';
import { keyTone } from '../music/theory.js';

const NOISE = ['noise1', 'noise2', 'noise3'];

// Cue name for boss `e` on beat `beat` (0..3) of bar `bar`, or null. wnPhase: the phase White Noise starts in.
export function bossCue(e, bar, beat, wnPhase = 1) {
  if (e.spawnT > 0 || bar < e.ai.offbeatUntil) return null;   // still arriving, or knocked off the beat by a Drop
  const frac = e.hp / e.maxHp;
  switch (e.type) {
    case 'drone':        // beat 4 shows the charge lane, the dash comes on the downbeat
      return beat === 3 && bar % 4 === 0 ? 'swell' : null;
    case 'clipper':      // aimed triples on beats 2 and 4 below BALANCE.boss.clipperTriple of its health
      return frac < BALANCE.boss.clipperTriple && (beat === 1 || beat === 3) ? 'bark' : null;
    case 'glitchking':   // the blink target is set on the downbeat of even bars, the blink and its ring come on beat 3
      return bar % 2 === 0 && e.ai.blinkTo ? (beat === 1 ? 'glitch' : beat === 2 ? 'blink' : null) : null;
    case 'whitenoise':   // a bar of hiss from each downbeat, louder in each of its attack phases
      return beat === 0 ? NOISE[whiteNoisePhase(e, wnPhase) - 1] : null;
  }
  return null;
}

// Leitmotifs (sound only): each boss's public-domain motif on the boss bus, two bars long, as [step, key
// degree, length in 16ths]. Key degrees (theory.js keyTone) keep the tune's own shape in the key over any
// chord; a chord-relative motif over the chorus's VII would turn the Mountain King major.
export const LEIT = {
  // Grieg, In the Hall of the Mountain King (1875): bar 1, then bar 3 up to the octave (bar 2 is chromatic)
  drone: [[0, 0], [2, 1], [4, 2], [6, 3], [8, 4], [10, 2], [12, 4, 4],
    [16, 0], [18, 1], [20, 2], [22, 3], [24, 4], [26, 2], [28, 4], [30, 7, 2]],
  // Beethoven, Symphony No. 5 (1808): the motto, three short and one held, then a step lower; a fifth under his
  // pitches (the same intervals), so the held notes sit on the chorus's VII and v, not a half step over a third
  clipper: [[1, 0], [2, 0], [3, 0], [4, -2, 12], [17, -1], [18, -1], [19, -1], [20, -3, 12]],
  // Bach, Toccata in D minor, BWV 565: the mordent and the run down to the tonic, echoed an octave lower
  glitchking: [[0, 4], [1, 3], [2, 4, 6], [8, 3], [9, 2], [10, 1], [11, 0], [12, -1], [13, 0, 3],
    [16, -3], [17, -4], [18, -3, 6], [24, -4], [25, -5], [26, -6], [27, -7], [28, -8], [29, -7, 3]],
  // Dies irae (13th-century chant): "Dies irae, dies illa"
  whitenoise: [[0, 2, 4], [4, 1, 4], [8, 2, 4], [12, 0, 4], [16, 1, 4], [20, -1, 4], [24, 0, 8]],
};
const LEIT_LOW = 60;   // the motifs' tonic sits at or above this

// The leitmotif cue on beat `beat` of song position `pos` (while the section's boss is up), or null. It plays
// over bars 1-2 of a boss's section, after the impact the boss arrives on, and over the first two bars of every
// breakdown in it (the Finale's). Never under a quote: two tunes at once are mud.
export function leitCue(pos, beat) {
  const id = pos.section.boss, a = pos.arr, b = pos.barInSection;
  if (!LEIT[id] || a.quote) return null;
  const k = b === 1 || b === 2 ? b - 1 : a.quiet && a.pb < 2 ? a.pb : -1;
  return k < 0 ? null : `leit:${id}:${k * 4 + beat}`;
}

// The notes a leitmotif cue plays on `chord` (the bar's): { at: 16ths after the beat, midi, d: length in 16ths }.
export function leitNotes(name, chord) {
  const [, id, k] = name.split(':');
  return LEIT[id].filter(([s]) => s >> 2 === +k).map(([s, kd, d = 1]) => ({ at: s & 3, midi: keyTone(chord, kd, LEIT_LOW), d }));
}
