// Boss cues: the sound a boss makes on the beats it attacks on, so a fight can be heard coming.
// The sequencer asks on every beat at schedule time, a moment before the beat is heard, and the desk
// plays the cue on that beat (AudioEngine.bossCue). The predicates are copies of the attack beats in
// bossOnBeat (src/game/enemies.js): change them together.

const NOISE = ['noise1', 'noise2', 'noise3'];

// Cue name for boss `e` on beat `beat` (0..3) of bar `bar`, or null. wnPhase: the phase White Noise starts in.
export function bossCue(e, bar, beat, wnPhase = 1) {
  if (e.spawnT > 0 || bar < e.ai.offbeatUntil) return null;   // still arriving, or knocked off the beat by a Drop
  const frac = e.hp / e.maxHp;
  switch (e.type) {
    case 'drone':        // beat 4 shows the charge lane, the dash comes on the downbeat
      return beat === 3 && bar % 4 === 0 ? 'swell' : null;
    case 'clipper':      // aimed triples on beats 2 and 4 below 70%
      return frac < 0.7 && (beat === 1 || beat === 3) ? 'bark' : null;
    case 'glitchking':   // the blink target is set on the downbeat of even bars, the blink and its ring come on beat 3
      return bar % 2 === 0 && e.ai.blinkTo ? (beat === 1 ? 'glitch' : beat === 2 ? 'blink' : null) : null;
    case 'whitenoise':   // a bar of hiss from each downbeat, louder in each of its attack phases
      return beat === 0 ? NOISE[Math.max(wnPhase, frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3) - 1] : null;
  }
  return null;
}
