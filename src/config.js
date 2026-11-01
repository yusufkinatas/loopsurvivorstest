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

// The five styles. Each one is a play rule (CHEMISTRY in src/game/loadout.js) and a set of six sounds.
// The colors stay apart from each other, from the remix gold #ffd166 and from the channel colors.
export const STYLES = {
  synth:     { name: 'Synth',     color: '#7ab0ff', blurb: 'Electronic' },
  organic:   { name: 'Live',      color: '#f0b884', blurb: 'Played by hand' },
  chip:      { name: '8-Bit',     color: '#c2f25e', blurb: 'Retro console' },
  heavy:     { name: 'Heavy',     color: '#ff7020', blurb: 'Rock and metal' },
  orchestra: { name: 'Orchestra', color: '#d4a6ff', blurb: 'Cinematic' },
};

// The mixer opens up with the song: channels available from each section on (Intro, Verse, Chorus, Verse II, Chorus II...).
// This is what keeps a run starting as a single sound and growing into a full band.
export const CHANNEL_UNLOCKS = [2, 3, 4, 5, 6];

export const MAX_INSTRUMENT_LEVEL = 5;
export const MAX_PEDAL_LEVEL = 3;
export const PEDAL_SLOTS = 4;
export const REROLLS_PER_RUN = 3;
export const BANISHES_PER_RUN = 3;

// Fader cards, offered once the real cards run out: each push adds 8% damage to one channel, up to 5 pushes.
export const FADER = { step: 0.08, max: 5 };

export const WORLD = {
  spawnMargin: 70,       // px outside the visible area where enemies appear
  despawnDist: 1500,     // enemies farther than this get recycled closer to the player
  maxEnemies: 420,
  maxGems: 420,
};

// Gain: opt-in difficulty tiers. A win at the highest tier open unlocks the next. Tiers stack, add 10% score
// each and only touch combat numbers, never the tempo, the channels, the patterns or the desk. The mods
// multiply where those numbers live (Game.mods, all 1 at Gain 0). wnPhase is the phase White Noise starts in.
export const GAIN = [
  { name: 'Hot signal',   text: 'Noise +20% health',     mods: { hp: 1.2 } },
  { name: 'Slow build',   text: 'Drop +30% notes',       mods: { drop: 1.3 } },
  { name: 'Loud room',    text: 'Hits +25% damage',      mods: { dmgIn: 1.25 } },
  { name: 'Low budget',   text: 'Level-ups +10% notes',  mods: { xp: 1.1 } },
  { name: 'Packed house', text: 'Crowd +30%, same notes', mods: { density: 1.3 } },
  { name: 'Headliners',   text: 'Bosses +60% health',    mods: { bossHp: 1.6 } },
  { name: 'Feedback',     text: 'Shots +30% speed',      mods: { shotSpeed: 1.3 } },
  { name: 'Brickwall',    text: 'White Noise starts loud · Elites +50%, no extra hearts', mods: { wnPhase: 2, elite: 1.5 } },
];

// Every challenge and economy knob in one place, so a balance pass tunes numbers here instead of hunting them
// through the game code. Other lanes add their own keys. Times are in seconds unless a name says bars or beats.
export const BALANCE = {
  // The player: health before pedals and chemistry, and a master dial on all damage taken (before armor).
  player: { maxHp: 120, dmgIn: 0.75 },
  // Healing is a budget tied to the song, not to kills: choruses test you, verses let you recover.
  hearts: {
    heal: 0.35,             // a heart restores this share of max health
    killMagnet: 0.0015,     // chance an ordinary kill drops a magnet (ordinary kills never drop hearts)
    eliteHeart: true,       // timed elites carry a heart (featured elites carry a vinyl instead)
    bossHeart: true,        // every non-final boss silenced drops a heart where it fell
    breathers: { verse2: [0, 16], bridge: [0, 16], finale: [16, 32] },   // section -> bars in it that put a heart near you
    breatherDist: 300,      // px from the player, in a random direction
  },
  // Level-up cost: round(min(cap, base + lin*L + quad*L^2) * Gain xp). Vinyls only come from featured elites.
  xp: { base: 5, lin: 0.5, quad: 0.6, cap: 340 },
  // Notes left on the floor fade after `life` (8 bars) and blink through their last `blink` seconds.
  notes: { life: 16, blink: 2 },
  // How many enemies the director keeps around: base + perSec * t + perMin2 * minutes^2, times the energy.
  crowd: { base: 12, perSec: 0.5, perMin2: 2.8 },
  // Threat follows the song: section -> crowd multiplier (the Build-Up ramps across its bars).
  energy: { intro: 0.8, verse1: 0.85, chorus1: 1.15, verse2: 0.8, chorus2: 1.05, bridge: 0.7, build: [1.0, 1.5], drop: 1.05, finale: 0.85 },
  // A quiet phrase (the band plays thin): a smaller crowd, more ranged enemies and elites, no formations.
  quiet: { crowd: 0.85, ranged: 2, elite: 1.5 },
  // Drop-ins: this share of a beat's spawns appears close to you after a one-beat ring. Never tanks or Stomps.
  dropIns: { share: { chorus1: 0.08, chorus2: 0.12, build: 0.16, drop: 0.16, finale: 0.12 }, min: 200, max: 320, types: ['static', 'buzz', 'glitch'], telegraph: 1 },
  // Formations: rings close in from `ringDist` px after a one-beat telegraph. impactRing: a ring arrives the bar
  // before each arrangement impact, so the release lands on a crowd.
  formation: { ringDist: 420, telegraph: 1, impactRing: true },
  // The Snare: a mortar that marks where you will be on beat 4 and lands on the next backbeat.
  snare: {
    mix: { verse2: 0.045, chorus2: 0.06, bridge: 0.12, drop: 0.06, finale: 0.075 },
    keep: [380, 520],       // px it keeps from you
    range: 620,             // px it fires from (and only on screen)
    r: 64, dmg: 13, dmgPerMin: 0.06,
    lead: 1, leadCap: 160,  // aims where you will be in `lead` s, at most `leadCap` px ahead
    cap: 6,                 // live marks at most
  },
  // Elites hunt: faster, and every `every` bars they light a lane on beat 4 and dash down it on the downbeat.
  elites: { hp: 9, speed: 1.2, dash: 700, every: 4, min: 120, max: 560 },
  // Screech: damage of its aimed shot (grows 6% per song minute), and a multiplier on its share of every mix.
  screech: { dmg: 11, mix: 0.7 },
  // Bosses: health grows `hpPerMin` per song minute, times hp[type]. Attack numbers for the retuned fights.
  boss: {
    hpPerMin: 0.14,
    hp: { drone: 1.3, clipper: 1.15, glitchking: 1, whitenoise: 0.5 },
    clipperRadial: 11, clipperTriple: 0.5,          // radial shots on beats 1 and 3; aimed triples below this health
    kingTripleDmg: 15, kingRadialDmg: 18,           // the Glitch King's aimed triples and its blink radial
    noiseRadialDmg: 16, noiseSpiralDmg: 14,         // White Noise's radials and spiral arms
  },
  // The Drop: a timed, local blast. A perfect drop lands on a phrase downbeat (bar % 8 === 0: the build
  // plays over the fill bar, or a press during the fill bar lets the fill be the build).
  drop: {
    charge: 880,           // xp-equivalent needed to fill the meter
    skip: 0.15,            // share of a full meter paid for skipping a level-up
    damage: 70, perLevel: 0.05, boss: 1.5,
    radius: 460,           // shots are erased only inside it
    kb: 260, stun: 0.6,
    perfectDmg: 1.5, perfectRadius: 1.25, phrase: 8,
  },
  // The song's own impacts (the band slams back in): damage is a share of the Drop's base, never staggers a boss,
  // erases enemy shots inside `erase` of the radius.
  songImpact: { damage: 0.5, radius: 380, kb: 220, stun: 0.4, erase: 0.6 },
  // Remixes are earned with Master Tapes: a non-final boss silenced in its own section drops one where it fell.
  // A tape lies `tapeLife` (8 bars), blinks through its last `tapeBlink`, and is only picked up within `tapeReach`
  // px (magnets and the boss pull-all never move it). Spent on a channel at level 5, the remix lands on the
  // first 4-bar line (`line`) at least `lead` bars ahead: one bar of dropout and riser, then the impact ring.
  // Its damage is `damage` x the Drop's base x (1 + perLevel x level) x the band's damage; it erases enemy shots
  // inside it and knocks a boss in it off the beat. While a tape is banked, the level cards of the channels nearest a
  // remix (the highest level not remixed yet) weigh at least `tapeUp` (a level 4 card alone weighs 0.1, a level 3
  // one 0.35; 0 turns the pull off).
  remix: {
    tapes: 3, tapeLife: 16, tapeBlink: 2, tapeReach: 46, tapeUp: 0.85,
    lead: 2, line: 4,
    damage: 0.5, perLevel: 0.05, radius: 520, kb: 220, stun: 0.5, dur: 0.5,
  },
};

// The Drop's numbers (kept as their own export for the code that already reads DROP).
export const DROP = BALANCE.drop;

export const PLAYER_BASE = {
  maxHp: BALANCE.player.maxHp,
  speed: 165,
  pickup: 72,
  radius: 14,
  iframes: 0.4,
};
