// Music theory helpers. Instruments never pick raw pitches. They ask for "chord tone 2" or
// "scale step 4", and this module turns that into a note that fits the current chord and key.
// That is what guarantees every pick sounds good.

export const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];
export const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];

export const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// Keys the run can be in (all minor). Pitch class of the tonic.
export const KEYS = [
  { pc: 9, name: 'A minor' },
  { pc: 0, name: 'C minor' },
  { pc: 2, name: 'D minor' },
  { pc: 4, name: 'E minor' },
  { pc: 7, name: 'G minor' },
  { pc: 11, name: 'B minor' },
  { pc: 5, name: 'F minor' },
];

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const mod = (n, m) => ((n % m) + m) % m;

// Build a chord by stacking thirds inside the key's scale, so every chord tone (7ths included) is diatonic.
// deg: scale degree 0..6. harm: use harmonic minor (raised 7th) for a major V chord. The chord also carries its
// key (keyPc, scale) for parts written in key degrees (keyTone).
export function makeChord(keyPc, deg, harm = false) {
  const scale = harm ? HARMONIC_MINOR : NATURAL_MINOR;
  const pcs = [0, 2, 4, 6].map((k) => mod(keyPc + scale[(deg + k) % 7] + (deg + k >= 7 ? 12 : 0), 12));
  const rootPc = pcs[0];
  const intervals = pcs.map((pc) => mod(pc - rootPc, 12));
  // Scale intervals measured from the chord root, ascending.
  const scaleFromRoot = [];
  for (let k = 0; k < 7; k++) scaleFromRoot.push(mod(keyPc + scale[(deg + k) % 7] - rootPc, 12));
  const third = intervals[1];
  const quality = third === 3 ? (intervals[2] === 6 ? 'dim' : 'min') : 'maj';
  const name = NOTE_NAMES[rootPc] + (quality === 'min' ? 'm' : quality === 'dim' ? 'dim' : '');
  return { deg, harm, rootPc, pcs, intervals, scaleFromRoot, quality, name, keyPc, scale };
}

// Lowest MIDI note >= low with the given pitch class.
export function noteAtOrAbove(pc, low) {
  return low + mod(pc - low, 12);
}

// idx-th chord tone counting upward from the chord root placed at/above `low`.
// seventh: include the 7th in the stack (4 tones per octave) or use a triad (3 per octave).
export function chordTone(chord, idx, low, seventh = false) {
  const n = seventh ? 4 : 3;
  const root = noteAtOrAbove(chord.rootPc, low);
  const oct = Math.floor(idx / n);
  const pos = mod(idx, n);
  return root + chord.intervals[pos] + 12 * oct;
}

// idx-th scale step counting from the chord root at/above `low` (0 = root, 2 = third, 4 = fifth...).
export function scaleTone(chord, idx, low) {
  const root = noteAtOrAbove(chord.rootPc, low);
  const oct = Math.floor(idx / 7);
  const pos = mod(idx, 7);
  return root + chord.scaleFromRoot[pos] + 12 * oct;
}

// n-th step of the key's scale counting from the tonic at/above `low` (a tune written in key degrees, kd). Over a
// harmonic V the scale is harmonic minor, so step 6 is the leading tone and no accidental is needed.
export function keyTone(chord, n, low) {
  return noteAtOrAbove(chord.keyPc, low) + chord.scale[mod(n, 7)] + 12 * Math.floor(n / 7);
}

// Pick an n-note voicing of the chord close to the previous voicing (smooth voice leading),
// kept around `center`.
export function voiceChord(chord, prev, center, n = 3, seventh = false) {
  const tones = seventh ? 4 : 3;
  if (seventh && chord.intervals[3] === 11) {
    // Major 7th chords voiced close put the 7th a half step under the root. Swap the root for the 9th.
    const pcs = chord.pcs.slice();
    pcs[0] = (chord.rootPc + 2) % 12;
    chord = { ...chord, pcs };
  }
  let best = null, bestCost = Infinity;
  for (let inv = 0; inv < tones; inv++) {
    for (let base = center - 14; base <= center + 2; base += 1) {
      if (mod(base - chord.pcs[inv], 12) !== 0) continue;
      // Stack the following chord tones upward from `base`.
      const notes = [base];
      for (let i = 1; i < n; i++) {
        const pc = chord.pcs[(inv + i) % tones];
        notes.push(noteAtOrAbove(pc, notes[i - 1] + 1));
      }
      const mid = (notes[0] + notes[n - 1]) / 2;
      let cost = Math.abs(mid - center) * 0.6 * n;
      if (prev && prev.length) {
        const p = prev.slice().sort((a, b) => a - b);
        for (let i = 0; i < n; i++) cost += Math.abs(notes[i] - (p[i] ?? p[p.length - 1]));
      }
      if (cost < bestCost) { bestCost = cost; best = notes; }
    }
  }
  return best;
}
