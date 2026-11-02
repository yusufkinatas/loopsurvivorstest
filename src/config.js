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
  beat:   { name: 'Beat',    color: '#b6f23a', desc: 'Kicks and snares. Big hits on the beat.' },
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
  heavy:     { name: 'Heavy',     color: '#c9d1e0', blurb: 'Rock and metal' },
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

// Fader cards: each push adds 8% damage to one channel, up to 5 pushes. Dealt for a channel at level 5 or remixed
// (BALANCE.offers.fader), and for every channel once the real cards run out.
export const FADER = { step: 0.08, max: 5 };

export const WORLD = {
  spawnMargin: 70,       // px outside the visible area where enemies appear
  despawnDist: 1500,     // enemies farther than this get recycled closer to the player
  maxEnemies: 480,       // the horde's floor and stream stop BALANCE.horde.reserve below it (set pieces use the rest)
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
  // area: a master dial on every attack area of the band (game.area): small areas early, earned back with Reverb
  // and the Live rule. It reaches area footprints only, not projectile range or auto-aim.
  player: { maxHp: 120, dmgIn: 0.72, area: 0.8 },
  // The Noise's health: hp x (1 + lin*m + quad*m^2) x sec[section] for song minute m (bosses have their own line
  // under boss). sec: one section's toughness on top of the curve.
  enemy: { hp: 1, lin: 0.3, quad: 0.1, sec: { chorus2: 1.25, bridge: 1.12, build: 1.08, drop: 1.12, finale: 1.2 } },
  // The horde (director.js): a floor of bodies near the view that refills every beat, so the screen never clears,
  // and a stream on top that piles up when the band cannot keep up.
  horde: {
    scale: 1,               // master dial on the floor, the stream and the set pieces' counts
    // Section -> [first, last] minimum bodies inside the view grown by `near` px, ramped across the section's bars
    // (the open-ended Finale ramps over `finaleBars`, then holds).
    floor: { intro: [12, 24], verse1: [30, 56], chorus1: [58, 82], verse2: [60, 80], chorus2: [120, 155], bridge: [100, 130], build: [125, 170], drop: [170, 210], finale: [190, 240] },
    finaleBars: 32, near: 100,
    // Missing bodies come back each beat: at most max(base, share x floor), times `grace` for `graceBars` after a
    // song impact downbeat and (afterDrop) after the player's Drop, so a clear reads as a clear.
    refill: { base: 6, share: 0.2, grace: 0.4, graceBars: 1, afterDrop: true },
    // Bodies per second on top of the floor (halved in quiet phrases), while the crowd near you is under cap x floor.
    stream: { intro: 0.2, verse1: 0.5, chorus1: 1, verse2: 0.8, chorus2: 1.5, bridge: 1.2, build: 1.8, drop: 2, finale: 2.5 },
    cap: 1.25,
    // Spawns land edge[0..1] px past the view's edge. While you move faster than `moving` px/s, `ahead` of them come
    // from the side you are heading to, `aheadExtra` px further out (about 2 s of warning). A body `recycle` px
    // beyond the view's edge comes back on the edge ahead of you, its health kept.
    edge: [40, 90], ahead: 0.35, aheadExtra: 60, moving: 40, recycle: 420,
    boss: 0.65, finalBoss: 0.7,   // the floor while a boss is up (White Noise: finalBoss), so the boss stays the focus
    view: { ref: 921600, min: 0.8, max: 1.15 },   // the floor scales with the view's area / ref, clamped
    xp: 0.7,                // notes of every ordinary body (the horde kills more than the old crowd did)
    reserve: 60,            // the floor and the stream stop at WORLD.maxEnemies - reserve (set pieces use the rest)
    liveMax: { screech: 2, snare: 2, stomp: 2 },   // live at most (x the view factor); past it a pick falls back
    fallback: { verse2: 'static:loud', chorus2: 'static:loud', bridge: 'static:loud', build: 'static:loud', drop: 'static:loud', finale: 'static:loud' },
  },
  // Tougher bodies in the same silhouettes (spawnEnemy opts): health, size, speed, damage, notes and mass.
  variants: {
    loud:  { hp: 2.2, scale: 1.25, speed: 0.92, dmg: 1.3, xp: 1.8, mass: 1.8 },
    heavy: { hp: 5,   scale: 1.55, speed: 0.8,  dmg: 1.7, xp: 3.5, mass: 4 },
  },
  // Each section's wave: 'type' or 'type:variant' -> weight. Shooters (Screech, Snare) and Stomps are rare and
  // capped by horde.liveMax.
  waves: {
    intro:   { static: 1 },
    verse1:  { static: 0.62, buzz: 0.32, 'static:loud': 0.04, stomp: 0.02 },
    chorus1: { static: 0.4, buzz: 0.28, hum: 0.14, 'static:loud': 0.1, 'buzz:loud': 0.06, stomp: 0.02 },
    verse2:  { static: 0.2, 'static:loud': 0.21, buzz: 0.18, glitch: 0.16, hum: 0.14, 'hum:loud': 0.05, stomp: 0.04, snare: 0.02 },
    chorus2: { static: 0.12, 'static:loud': 0.26, buzz: 0.14, 'buzz:loud': 0.08, glitch: 0.1, hum: 0.1, 'hum:loud': 0.05, feedback: 0.1, 'static:heavy': 0.03, stomp: 0.03, screech: 0.02 },
    bridge:  { 'static:loud': 0.23, static: 0.08, 'static:heavy': 0.05, hum: 0.12, 'hum:loud': 0.05, feedback: 0.13, glitch: 0.12, buzz: 0.14, stomp: 0.03, screech: 0.02, snare: 0.03 },
    build:   { buzz: 0.2, 'buzz:loud': 0.26, 'static:loud': 0.24, glitch: 0.12, 'glitch:loud': 0.08, 'static:heavy': 0.07, stomp: 0.02 },
    drop:    { 'static:loud': 0.22, static: 0.1, 'static:heavy': 0.06, hum: 0.1, 'hum:loud': 0.05, 'buzz:loud': 0.12, buzz: 0.12, feedback: 0.08, 'feedback:loud': 0.04, 'glitch:loud': 0.06, stomp: 0.02, screech: 0.02 },
    finale:  { 'static:loud': 0.2, static: 0.1, 'static:heavy': 0.08, hum: 0.08, 'hum:loud': 0.05, 'buzz:loud': 0.14, buzz: 0.1, feedback: 0.08, 'feedback:loud': 0.05, 'glitch:loud': 0.08, screech: 0.02, snare: 0.02 },
  },
  // Set pieces on the song's moments (director.js formation). Counts are base + perMin x song minute, times the
  // horde's density, at most max. Keys follow the section ('default' when it has none).
  sets: {
    // Mid-phrase rotation: beat 1 of every bar with bar % rotationEvery === rotationAt, skipped when a song impact
    // lands within skipNearImpact bars. While a boss is up a 'ring' turn becomes a swarm.
    rotation: ['swarm', 'wall', 'ring'], rotationEvery: 16, rotationAt: 4, skipNearImpact: 4,
    // The bar before each impact a ring closes in from `dist`, at least `gapMin` px between bodies, with a `door` of
    // empty slots facing away from the boss. A second ring `gap` px behind it (0.75 as many) in the `double`
    // sections, only with no boss up. Key and double follow the section the impact opens.
    ring: { base: 16, perMin: 4, max: 40, dist: 420, gap: 70, gapMin: 36, door: 3, double: ['chorus2', 'bridge', 'drop', 'finale'],
      key: { default: 'static', verse1: 'static', chorus1: 'static', verse2: 'static:loud', chorus2: 'static:loud', bridge: 'static:loud', drop: 'static:loud', finale: 'static:loud' } },
    // A dense block marching for `march` s through where you will be, `spread` x sqrt(n) px across.
    swarm: { base: 24, perMin: 4, max: 48, march: 9, spread: 14,
      key: { default: 'buzz', chorus2: 'buzz:loud', bridge: 'buzz:loud', build: 'buzz:loud', drop: 'buzz:loud', finale: 'buzz:loud' } },
    // A line `span` x the view's side wide, marching for `march` s, `spacing` body diameters apart (heavySpacing for
    // heavies: gaps just wide enough to thread). One wall per quiet phrase; in the `pincer` sections two, from the
    // two ends of the view's long axis.
    wall: { march: 14, spacing: 1.6, heavySpacing: 1.7, span: 1.15, max: 40, pincer: ['finale'], pincerAxis: 'long',
      key: { default: 'static', verse1: 'static', chorus1: 'static:loud', verse2: 'static:loud', chorus2: 'static:loud', bridge: 'static:heavy', drop: 'static:loud', finale: 'static:loud' } },
    buildSwarms: [8, 12],   // the Build-Up's bars that send a swarm (the drum roll)
  },
  // Bodies: contact knockback on the body that hit you, how hard a crowd blocks you (block x overlap, split by
  // mass against playerMass, `inset` px inside contact range), boss body damage x boss, a boss shoves you clear
  // to `bossGap` px from its edge after the crowd pushed (negative: still inside contact range, so a boss holding
  // you keeps hurting at the iframe rate), and the crowd yields while you touch a boss.
  contact: { kb: 140, block: 0.5, inset: 5, playerMass: 2, boss: 0.75, bossShove: true, bossGap: -5, yieldToBoss: true },
  // Healing is a budget tied to the song, not to kills: choruses test you, verses let you recover.
  hearts: {
    heal: 0.35,             // a heart restores this share of max health
    killMagnet: 0.0015,     // chance an ordinary kill drops a magnet (ordinary kills never drop hearts)
    eliteHeart: true,       // timed elites carry a heart (featured elites carry a vinyl instead)
    bossHeart: true,        // every non-final boss silenced drops a heart where it fell
    breathers: { verse2: [0, 16], bridge: [0, 16], finale: [16, 32] },   // section -> bars in it that put a heart near you
    breatherDist: 300,      // px from the player, in a random direction
  },
  // Level-up cost: round(min(cap, base + lin*L + quad*L^2) * Gain xp), flat from level 18 on so the late sections
  // still deal cards. Vinyls only come from featured elites.
  xp: { base: 5, lin: 0.5, quad: 0.6, cap: 190 },
  // Notes left on the floor fade after `life` (8 bars) and blink through their last `blink` seconds.
  notes: { life: 18, blink: 2 },
  // A quiet phrase (the band plays thin): the floor x floor, the stream x stream, `upgrade` of the plain bodies come
  // loud, elites come x elite sooner, a wall sweeps in on its downbeat, and no drop-ins or rotation set pieces.
  quiet: { floor: 0.85, stream: 0.5, upgrade: 0.25, elite: 1.5 },
  // Drop-ins: this share of a beat's spawns appears close to you after a one-beat ring, at most perBeat a beat,
  // plain keys of `types` only (plainOnly), never in a quiet phrase or a refill grace. Never tanks or Stomps.
  dropIns: { share: { chorus1: 0.08, chorus2: 0.12, build: 0.16, drop: 0.16, finale: 0.12 }, min: 200, max: 320, types: ['static', 'buzz', 'glitch'], telegraph: 1, perBeat: 2, plainOnly: true },
  // Formations: set pieces arrive after a `telegraph`-beat ring. impactRing: a ring closes in the bar before each
  // arrangement impact, so the release lands on a crowd (sets.ring has its numbers).
  formation: { telegraph: 1, impactRing: true },
  // The Snare: a mortar that marks where you will be on beat 4 and lands on the next backbeat. Its share of each
  // section is in `waves`, its live count in horde.liveMax.
  snare: {
    keep: [380, 520],       // px it keeps from you
    range: 620,             // px it fires from (and only on screen)
    r: 64, dmg: 13, dmgPerMin: 0.06,
    lead: 1, leadCap: 160,  // aims where you will be in `lead` s, at most `leadCap` px ahead
    cap: 2,                 // live marks at most
  },
  // Elites hunt: faster, and every `every` bars they light a lane on beat 4 and dash down it on the downbeat.
  // They are drawn from the wave's types minus `exclude` (no tiny ones, no shooters, no 9x-health Stomp).
  elites: { hp: 9, speed: 1.2, dash: 700, every: 4, min: 120, max: 560, exclude: ['buzz', 'stomp', 'screech', 'snare'] },
  // Screech: damage of its aimed shot (grows 6% per song minute). Its share of each section is in `waves`.
  screech: { dmg: 11 },
  // Bosses: health grows `hpPerMin` per song minute, times hp[type]. Attack numbers for the retuned fights.
  boss: {
    hpPerMin: 0.14,
    hp: { drone: 1.3, clipper: 1.15, glitchking: 0.9, whitenoise: 0.5 },
    // Fewer bullets, more bodies: every radial count x radial, summoned bodies x summon (arriving after a
    // summonTelegraph-beat ring), the Clipper's radials only on clipperRadialBeats, the Glitch King's aimed triples
    // only on kingTripleBeats and below kingTripleBelow of its health (1: always), White Noise's spiral with
    // noiseSpiralArms [phases 1-2, phase 3] arms, plus a second set on the 8th after the beat when noiseSpiral8th.
    radial: 0.6, summon: 1.25, summonTelegraph: 1,
    clipperRadialBeats: [0], kingTripleBeats: [3], kingTripleBelow: 0.5, noiseSpiralArms: [1, 2], noiseSpiral8th: false,
    clipperRadial: 11, clipperTriple: 0.35,         // the Clipper's radial shots; aimed triples below this health
    kingTripleDmg: 13, kingRadialDmg: 16,           // the Glitch King's aimed triples and its blink radial
    noiseRadialDmg: 16, noiseSpiralDmg: 14,         // White Noise's radials and spiral arms
  },
  // The Drop: a timed, local blast. A perfect drop lands on a phrase downbeat (bar % 8 === 0: the build
  // plays over the fill bar, or a press during the fill bar lets the fill be the build).
  drop: {
    charge: 800,           // xp-equivalent needed to fill the meter
    skip: 0.15,            // share of a full meter paid for skipping a level-up
    damage: 70, perLevel: 0.05, boss: 1.5,
    radius: 460,           // shots are erased only inside it
    kb: 260, stun: 0.6,
    perfectDmg: 1.5, perfectRadius: 1.25, phrase: 8,
    // A Double Drop: a perfect drop on one of the song's own impact downbeats, x doubleDmg damage and x doubleRadius reach.
    doubleDmg: 1.5, doubleRadius: 1.15,
  },
  // The song's own impacts (the band slams back in): damage is a share of the Drop's base, never staggers a boss,
  // erases enemy shots inside `erase` of the radius.
  songImpact: { damage: 0.5, radius: 380, kb: 220, stun: 0.4, erase: 0.6 },
  // Remixes are earned with Master Tapes: a non-final boss silenced in its own section drops one where it fell.
  // A tape lies `tapeLife` (8 bars), blinks through its last `tapeBlink`, and is only picked up within `tapeReach`
  // px (magnets and the boss pull-all never move it). Spent on a channel at `minLevel` or more (finished to level 5
  // as it lands), the remix lands on the first 4-bar line (`line`) at least `lead` bars ahead: one bar of dropout and
  // riser, then the impact ring. Its damage is `damage` x the Drop's base x (1 + perLevel x level) x the band's
  // damage; it erases enemy shots inside it and knocks a boss in it off the beat. While a tape is banked, the level
  // cards of the channels it waits for (upgrades.js tapeTarget: the highest level below minLevel, not remixed) weigh
  // at least `tapeUp` (0 turns the pull off).
  remix: {
    tapes: 3, tapeLife: 16, tapeBlink: 2, tapeReach: 46, tapeUp: 0.85,
    lead: 2, line: 4,
    damage: 0.5, perLevel: 0.05, radius: 520, kb: 220, stun: 0.5, dur: 0.5,
    // minLevel: the level a channel needs before a tape can remix it (every player-facing "level 3" reads it). sig: a
    // remix's damage with its own remix pedal on the board (the Signature).
    minLevel: 3, sig: 1.5,
  },
  // The deal (upgrades.js buildOffers): new cards x (1 + mom x sounds of their style), level cards upA - upB x level
  // (the top channel's at least topFloor), one level card on upSlot of screens, pedal weights (pedalNew2 once two are
  // owned, x pedalDud when the pedal powers none of the band), swap x swapGain when it gains a tier or a crossover,
  // x swapLoss when it loses one, x swapSide when it moves away from the band's styles, and Fader cards in the pool.
  offers: { mom: 0.35, upA: 0.95, upB: 0.12, topFloor: 0.75, upSlot: 0.75, pedalUp: 0.8, pedalNew: 0.75, pedalNew2: 0.5, pedalDud: 0.3,
    swap: 0.32, swapGain: 3, swapLoss: 0.25, swapSide: 0.4, fader: 0.45 },
  // Crossovers (loadout.js crossoverOf): two styles at 2+ sounds bend their two rules, three form Fusion. pairTier and
  // fusionTier: rule tiers a pair or Fusion adds (cap 3). grunge: the Mosh pit's reach while planted, symphonic: its
  // growth with the phrase, film: Long throw's shrink with the phrase, lofi: combo a clean planted beat adds.
  crossover: { pairTier: 0, fusionTier: 1, grunge: 2, symphonic: 1, film: 0.4, lofi: 2 },
  // Moments: a kill run when one channel silences at least max(multiKill, multiShare x the section's floor) bodies in
  // a beat; the camera leans in while a boss you can still silence is under bossLean of its health.
  feel: { multiKill: 10, multiShare: 0.25, bossLean: 0.05 },
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
