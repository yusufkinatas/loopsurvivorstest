// Global tuning constants. Everything musical hangs off BPM so the fight and the song share one clock.

export const BPM = 120;
export const STEPS_PER_BAR = 16;
export const BEAT_SEC = 60 / BPM;
export const STEP_SEC = BEAT_SEC / 4;
export const BAR_SEC = BEAT_SEC * 4;

// Echo attacks (Tape Delay pedal) land a dotted eighth later, matching the audible delay line.
export const ECHO_STEPS = 3;

// The six mixer channels. One instrument per channel keeps every frequency range and rhythmic role owned by exactly one sound.
export const ROLES = ['beat', 'perc', 'bass', 'chords', 'lead', 'arp'];

// Pitch ceiling per pitched channel. Notes resolved above it fold down an octave so every key stays in range.
export const ROLE_HIGH = { bass: 51, chords: 77, lead: 86, arp: 98 };

export const ROLE_INFO = {
  beat:   { name: 'Beat',    color: '#ff5b6b', desc: 'Kicks and snares. Big hits on the beat.' },
  perc:   { name: 'Groove',  color: '#ffb547', desc: 'Hats and shakers. Fast, light hits.' },
  bass:   { name: 'Bass',    color: '#9b78ff', desc: 'Low notes. Thick, heavy damage.' },
  chords: { name: 'Chords',  color: '#3fcdf5', desc: 'Harmony. Wide areas and support.' },
  lead:   { name: 'Lead',    color: '#55efb3', desc: 'The melody. Precise, piercing shots.' },
  arp:    { name: 'Sparkle', color: '#ff86d8', desc: 'Arpeggios and bells. Glittering extras.' },
};

export const STYLES = {
  synth:   { name: 'Synth', color: '#7ab0ff', blurb: 'Electronic' },
  organic: { name: 'Live',  color: '#f0b884', blurb: 'Played by hand' },
  chip:    { name: '8-Bit', color: '#c2f25e', blurb: 'Retro console' },
};

export const MAX_INSTRUMENT_LEVEL = 5;
export const MAX_PEDAL_LEVEL = 3;
export const PEDAL_SLOTS = 4;
export const REROLLS_PER_RUN = 3;

export const PLAYER_BASE = {
  maxHp: 100,
  speed: 165,
  pickup: 72,
  radius: 14,
  iframes: 0.55,
};

export const WORLD = {
  spawnMargin: 70,       // px outside the visible area where enemies appear
  despawnDist: 1500,     // enemies farther than this get recycled closer to the player
  maxEnemies: 420,
  maxGems: 420,
};

// Drop ability: fills from collected notes, fires on the next downbeat after a one-bar build.
export const DROP = {
  charge: 260,           // xp-equivalent needed to fill the meter
  damage: 90,
  radius: 900,
};
