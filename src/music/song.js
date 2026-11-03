// Song structure. The run is one song: sections change the chord progression, the arena color and
// the enemy mix, and the arrangement changes which parts play and how. Progressions are scale degrees
// in the run's minor key; {d, h} = harmonic-minor chord.
//
// Section data: lift raises the section's key by semitones (the Finale's key change), quote names the tune a phrase
// plays (see the setlist below). A radio edit (src/music/replay.js) also uses from (start the section's progression
// and arrangement that many bars in) and end (the outro: one last downbeat on the song's home chord, then silence).

import { ROLES } from '../config.js';
import { makeChord, keyTone } from './theory.js';

const V = { d: 4, h: true };                   // the major V (harmonic minor)
const P = {
  verse:  [0, 5, 2, 6],                       // i  VI III VII
  verse2: [0, 3, 5, 6],                       // i  iv VI  VII
  chorus: [5, 6, 4, 0],                       // VI VII v  i
  bridge: [3, 0, 3, V],                       // iv i  iv  V
  build:  [3, 3, V, V],
  finale: [0, 6, 5, V],                       // i  VII VI V (Andalusian cadence)
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
  { id: 'finale',  name: 'Finale',    bars: Infinity, prog: P.finale, hue: 6, boss: 'whitenoise', riser: true, lift: 2, quote: { at: 'solo', part: 'dies' } },
];

export const FINALE_BAR = SECTIONS.slice(0, -1).reduce((s, x) => s + x.bars, 0);

// ---------------------------------------------------------------------------- the setlist
//
// A song is the same nine sections, bosses and chart with its own harmony and tune. Never drawn from rng(): the
// lobby picks it, sims pass song=N.
//   name, credit  what the lobby shows
//   hook          the pickup chimes' tune in key degrees (null: they climb the chord)
//   home          the degree it ends on (its stop-time and last chord)
//   prog          section id -> its progression (one chord per bar, up to 32 bars: a quote phrase gets its own 8)
//   quote         section id -> { at, part }: the phrase (an index, or 'solo' for the solo phrase) where the band's
//                 Lead (else its Sparkle) traces QUOTES[part] with its own notes, each still an attack
//   fig           section id -> { role: figure }: an accompaniment figure (an id of src/music/grooves.js FIGURES) in
//                 place of that role's full part
//   waves         section id -> the enemy mix in place of BALANCE.waves (its own crowd)
//
// Quotes are written in key degrees (kd: 0 the tonic, 2 the third, 4 the fifth, 7 the octave, negative goes down;
// over the major V degree 6 is the leading tone), steps on the 16th grid from the phrase's downbeat, d in steps. They
// sit only on bars whose chords the song sets for them, and tools/check.mjs --audit checks every note on every Lead
// and Sparkle in every key: no fold under a ceiling, no held note a half step above a chord tone. A part traces a
// quote in its own rhythm (sequencer.js q_), each of its notes taking the pitch of the tune note last struck, and
// strikes the tune notes it would rest through, so d bounds those added notes and a tune note a half step above a
// chord tone: a part holds that one no longer than 3 steps or d.
// Public domain melodies only.
// Bars of [step, kd, d] from bar b0 on.
const bars = (b0, ...bs) => bs.flatMap((ns, i) => ns.map(([s, kd, d]) => ({ s: (b0 + i) * 16 + s, kd, d })));

// Beethoven, Symphony No. 9, the "Ode to Joy" theme (Beethoven died 1827), in the relative major: major degree n is
// kd n + 2.
const ODE_LINE = [
  [[0, 4, 2], [4, 4, 2], [8, 5, 2], [12, 6, 4]],   // E E F G   (in A minor's C major)
  [[0, 6, 2], [4, 5, 2], [8, 4, 2], [12, 3, 2]],   // G F E D
  [[0, 2, 2], [4, 2, 2], [8, 3, 2], [12, 4, 4]],   // C C D E
];
const ODE_THEME = [...bars(0, ...ODE_LINE, [[0, 4, 6], [6, 3, 2], [8, 3, 8]]),   // E. D D
  ...bars(4, ...ODE_LINE, [[0, 3, 6], [6, 2, 2], [8, 2, 8]])];                    // D. C C
// Korobeiniki, the Russian folk song (traditional tune, to Nekrasov's poem of 1861), A and B strains. This is the
// folk melody, opening E G# B G# E, never the 1989 Game Boy "Type A" arrangement (which opens E B C D C B).
const KORO_END = [[[0, 1, 6], [6, 2, 2], [8, 3, 2], [12, 4, 2]], [[0, 2, 2], [4, 0, 2], [8, 0, 8]]];   // B C D E | C A A
const KORO = [
  ...bars(0, [[0, -3, 6], [6, -1, 2], [8, 1, 2], [12, -1, 2], [14, -3, 2]], [[0, 0, 6], [6, 2, 2], [8, 4, 2], [12, 3, 2], [14, 2, 2]], ...KORO_END),   // E G# B G# E | A C E D C
  ...bars(4, [[0, 5, 6], [6, 6, 2], [8, 7, 2], [12, 6, 2], [14, 5, 2]], [[0, 4, 6], [6, 5, 2], [8, 4, 2], [12, 3, 2], [14, 2, 2]], ...KORO_END),      // F G A G F | E F E D C
];
// Dies irae, the 13th-century chant (attributed to Thomas of Celano, died about 1265): its first line over the
// Finale's i VII, then our own answer over VI V. Each bar's last note is held.
const DIES = bars(0, [[0, 2, 2], [4, 1, 2], [8, 2, 2], [12, 0, 4]], [[0, 1, 2], [4, -1, 2], [8, 0, 8]],   // F E F D | E C D (in D minor)
  [[0, 2, 2], [4, 0, 2], [8, 2, 2], [12, 5, 4]], [[0, 1, 2], [4, -1, 2], [8, 1, 2], [12, 4, 4]]);         // F D F Bb | E C# E A

const ODE_CHORDS = [2, 6, 2, 6, 2, 6, 2, 2];   // I V I V I V I I in the relative major
const KORO_CHORDS = [V, 0, V, 0, 3, 0, V, 0];  // the folk song's own V i V i iv i V i
// id -> { steps, pattern, by (notes by step), last (per step, the note last struck), next (per step, the step of the
// next tune note, or steps), held (per step: that note is no half step above a tone of its bar's chord, one of chords,
// so a part may hold it) }: the quotes (sequencer.js plays QUOTES[id] as the transform q_<id>).
const quote = (steps, pattern, chords) => {
  const by = [], last = [], held = [], next = [];
  for (const n of pattern) (by[n.s] ||= []).push(n);
  for (let i = 0; i < steps; i++) {
    last[i] = by[i] ? by[i][0] : last[i - 1];
    const c = chords[i >> 4], ch = makeChord(0, c.d ?? c, !!c.h), m = keyTone(ch, last[i].kd, 60);
    held[i] = !ch.pcs.slice(0, 3).some((pc) => (m - pc) % 12 === 1);
  }
  for (let i = steps - 1; i >= 0; i--) next[i] = by[i + 1] ? i + 1 : next[i + 1] ?? steps;
  return { steps, pattern, by, last, held, next };
};
export const QUOTES = { ode: quote(128, ODE_THEME, ODE_CHORDS), koro: quote(128, KORO, KORO_CHORDS), dies: quote(64, DIES, P.finale) };

// A 32-bar progression: a 4-bar loop with the quote's own 8 chords under phrase i.
const around = (loop, i, tune) => [...Array(2 * i).fill(loop).flat(), ...tune, ...Array(2 * (3 - i)).fill(loop).flat()];

const LOOP = { id: 'loop', name: 'Loop Survivors', credit: 'The original', hook: null, home: 0 };
const ODE = {
  id: 'ode', name: 'Ode', credit: 'Beethoven, Symphony No. 9', home: 2,
  hook: [4, 4, 5, 6, 6, 5, 4, 3, 2, 2, 3, 4, 4, 3, 3],
  // The relative major: I V vi IV and its turns, ending on I.
  prog: { intro: [2, 6, 0, 5], verse1: [2, 6, 0, 5], chorus1: around([5, 6, 2, 0], 1, ODE_CHORDS), verse2: [0, 5, 2, 6],
    chorus2: around([5, 6, 2, 0], 1, ODE_CHORDS), bridge: around([5, 6, 2, 0], 1, ODE_CHORDS), build: [5, 5, 6, 6], drop: [5, 6, 2, 2],
    finale: around([2, 6, 0, 5], 2, ODE_CHORDS) },
  quote: { chorus1: { at: 1, part: 'ode' }, chorus2: { at: 1, part: 'ode' }, bridge: { at: 'solo', part: 'ode' }, finale: { at: 'solo', part: 'ode' } },
  fig: { verse1: { arp: 'alberti' }, verse2: { arp: 'alberti' }, finale: { bass: 'octave' } },
  // The verses march in: heavier Hums and Stomps in place of Static and Buzz.
  waves: {
    verse1: { static: 0.52, buzz: 0.22, hum: 0.16, 'hum:loud': 0.04, stomp: 0.06 },
    verse2: { static: 0.16, 'static:loud': 0.18, buzz: 0.1, glitch: 0.16, hum: 0.24, 'hum:loud': 0.08, stomp: 0.06, snare: 0.02 },
  },
};
const KOROBEINIKI = {
  id: 'korobeiniki', name: 'Korobeiniki', credit: 'Russian folk song', home: 0,
  hook: [0, 2, 4, 3, 2, 1, 2, 3, 4, 2, 0, 0],   // A C E D C | B C D E | C A A: no leading tone, so it is right over any chord
  // Folk V-i harmony throughout; the Build-Up keeps the default iv iv V V.
  prog: { intro: [V, 0, V, 0], verse1: KORO_CHORDS, chorus1: around([5, 6, V, 0], 1, KORO_CHORDS), verse2: KORO_CHORDS,
    chorus2: around([5, 6, V, 0], 1, KORO_CHORDS), bridge: around([3, 0, 3, V], 1, KORO_CHORDS), drop: [5, 6, V, 0],
    finale: around([0, 6, 5, V], 2, KORO_CHORDS) },
  quote: { chorus1: { at: 1, part: 'koro' }, chorus2: { at: 1, part: 'koro' }, bridge: { at: 'solo', part: 'koro' }, finale: { at: 'solo', part: 'koro' } },
  fig: { verse1: { bass: 'oompah' }, verse2: { bass: 'oompah' }, chorus1: { bass: 'oompah' }, chorus2: { bass: 'oompah' } },
  // The verses swarm: more Buzz in place of Static (the round 1 retune softened it: under the harder late sections
  // the full swarm left the ordinary bot 2 wins of 16 against the loop's 7). Verse II keeps its loud Statics (a loud
  // Buzz there cost the skilled bot 2 to 4 of 8 wins).
  waves: {
    verse1: { static: 0.6, buzz: 0.38, stomp: 0.02 },
    verse2: { static: 0.2, 'static:loud': 0.2, buzz: 0.26, glitch: 0.14, hum: 0.12, 'hum:loud': 0.04, stomp: 0.02, snare: 0.02 },
  },
};
export const SONGS = [LOOP, ODE, KOROBEINIKI];

// A song's sections: SECTIONS with that song's progressions and quotes (the loop's are SECTIONS).
export function sectionsOf(tune) {
  if (!tune?.prog) return SECTIONS;
  return SECTIONS.map((s) => ({ ...s, prog: tune.prog[s.id] || s.prog, quote: tune.quote?.[s.id] || s.quote }));
}

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
//   groove   Beat and Groove play a classic groove in their own sounds (src/music/grooves.js): the band's
//            crossover or top style picks the list, { groove: k } the phrase's turn in it (the Finale's next
//            rise takes the next one); a remixed channel keeps its part
// A song can also give a section's channel an accompaniment figure (tune.fig, see arrangement()).
// Weights default per transform (WEIGHT); 'tf*w' sets one (a groove or a figure at 1 hits as hard as the part
// it replaces). The rules on top, applied by the sequencer for the band that is playing: 'out' plays
// 'sparse' while the band has 3 channels or fewer, a remixed channel never goes 'out' (it plays 'sparse'),
// and in a solo phrase the featured channel plays its solo variant over everyone else's thin line.
//
// Each phrase has a class, which sets the desk and the band its energy must stay in (tools/check.mjs
// --arrange): 'quiet' a breakdown (the desk drops and filters, the bar before it breaks off on beat 3),
// 'solo' one channel takes the stage, 'mid' a thinner verse-like texture, 'full' the band at full
// strength. e is the phrase's energy: the band's damage per second against its full parts (the mean over
// the standard level 5 bands, measured by --arrange; it fails when this drifts).
// impact: the phrase's downbeat hits like a Drop (the band slams back in). 'first': only on the
// section's first pass (the Finale's opening).

export const WEIGHT = { full: 1, out: 0, sparse: 1, half: 1.5, double: 0.65, call: 1.15, answer: 1.15, hold: 1.3, low: 1, inv: 1, lv1: 1, lv2: 1, lv3: 1, lv4: 1, groove: 1 };
export const ENERGY_BANDS = { quiet: [0.33, 0.65], solo: [0.5, 0.8], mid: [0.55, 0.92], full: [0.88, 1.15] };

const FULL_TEX = { tf: 'full', w: 1 };
const OUT_TEX = { tf: 'out', w: 0 };

// ph(cls, e, 'role:tf*w ...', { impact, solo, groove, as }); as: role -> the texture a groove there hits as hard as
// (its velocity against the full part's), times w.
function ph(cls, e, spec = '', more = {}) {
  const tex = {};
  for (const r of ROLES) tex[r] = FULL_TEX;
  for (const item of spec.split(/\s+/).filter(Boolean)) {
    const [role, t] = item.split(':');
    const [tf, w] = t.split('*');
    tex[role] = tf === 'out' ? OUT_TEX : { tf, w: w !== undefined ? Number(w) : WEIGHT[tf] ?? 1 };
  }
  for (const r in more.as) tex[r] = { ...tex[r], as: more.as[r] };
  return { cls, e, tex, solo: cls === 'solo', impact: more.impact || false, groove: more.groove ?? 0, spec };
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
  // Chorus: the whole band slams in. The third phrase turns the tune upside down, the last one grooves.
  chorus1: [
    ph('full', 1.0, '', { impact: true }),
    ph('full', 1.0),
    ph('full', 1.0, 'lead:inv'),
    ph('full', 0.94, 'beat:groove perc:groove', { groove: 0 }),
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
  // Chorus II is bigger: the sparkle doubles up, then the tune flips over the band's next groove (its Groove
  // channel weighted by the velocity of the doubled hats it used to play, which is not their damage on every sound).
  chorus2: [
    ph('full', 1.0, '', { impact: true }),
    ph('full', 1.0),
    ph('full', 0.96, 'arp:double'),
    ph('full', 0.93, 'beat:groove perc:groove*0.9 lead:inv arp:double', { groove: 1, as: { perc: 'double' } }),
  ],
  // The Bridge: a real breakdown (no drums, the groove only ticking, the bass in half time under held
  // chords), then one channel takes a solo over the bass and the pads, then everything but the drums
  // builds back, and the drums return on an impact. They sit out for 24 bars, so their return is the
  // Bridge's moment.
  bridge: [
    ph('quiet', 0.55, 'beat:out perc:lv1*1.6 bass:half*2 chords:hold*2.2 lead:call*1.6 arp:lv1*1.4'),
    ph('solo', 0.66, 'beat:out perc:lv2*1.3 bass:lv1*2 chords:hold*2 lead:out arp:lv1'),
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
  // upside down over a groove, then the climax doubles the hats and the sparkle.
  drop: [
    ph('full', 0.92, 'beat:half*2.2 perc:double*1.1 bass:full*1.3 chords:lv1*2 lead:out arp:answer*1.5', { impact: true }),
    ph('full', 0.95, 'beat:half*2.2 perc:double*1.1 bass:full*1.3 chords:lv1*2 lead:inv*0.9 arp:out'),
    ph('full', 0.95, 'beat:groove perc:groove lead:inv arp:answer*1.4', { groove: 2 }),
    ph('full', 1.02, 'perc:double*0.9 arp:double*0.9'),
  ],
  // The Finale cycles: the full band in the new key, a breakdown, a solo over the bass and the pads (the
  // drums still out), and the band rising back in on an impact and a groove (the next of the band's, each rise).
  // It rises and falls every 64 seconds until White Noise is silenced.
  finale: [
    ph('full', 0.94, '', { impact: 'first' }),
    ph('quiet', 0.45, 'beat:out perc:lv1*1.6 bass:half*2 chords:hold*2.2 lead:call*1.6 arp:out'),
    ph('solo', 0.63, 'beat:out perc:lv2*1.4 bass:half*1.8 chords:hold*2 lead:out arp:out'),
    ph('full', 0.96, 'beat:groove perc:groove*0.9 lead:inv arp:double', { impact: true, groove: 3, as: { perc: 'double' } }),
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
//   groove  the phrase's turn in its band's groove list (a groove phrase's)
//   quote   the transform ('q_<part>') of the section's quote on its phrase: the band's Lead (else its Sparkle)
//           plays it, or on the solo phrase the featured channel when it is a Lead or Sparkle (sequencer.js texOf)
const BASE = { phrase: 0, pb: 0, cycle: 0, cls: 'full', tex: null, quiet: false, solo: false, impact: false, energy: 1, groove: 0,
  rest: [], fill: false, brk: 0, roll: 0, kicks: true, v0: 1, v1: 1, sweep: false, cut: 0, quote: null };
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
// break (which needs the next bar). fig: the song's figures for the section (tune.fig[section id]), role -> a
// figure id of src/music/grooves.js FIGURES, or a list the section's phrases take in turn; the channel plays it
// wherever the phrase has it full, so its thinner textures stay.
function arrangement(section, b, fig) {
  if (section.end) return b ? SILENT : LAST_HIT;
  const at = phraseAt(section, b);
  if (!at) return PLAIN;
  const { ph, phrase, cycle } = at;
  const pb = b & 7;
  const rest = ROLES.filter((r) => ph.tex[r].tf === 'out');
  const impact = pb === 0 && (ph.impact === 'first' ? cycle === 0 : !!ph.impact);
  const roll = section.build && b >= 8 && b < 16 ? ROLL[b - 8] : null;
  let tex = ph.tex;
  for (const r in fig) {
    if (tex[r]?.tf !== 'full') continue;
    const f = [].concat(fig[r]);
    tex = { ...tex, [r]: { ...tex[r], tf: 'f_' + f[phrase % f.length] } };
  }
  const q = section.quote;
  const quote = q && (q.at === 'solo' ? ph.solo : ph === CHART[section.id][q.at]) ? 'q_' + q.part : null;
  return { ...BASE, phrase, pb, cycle, cls: ph.cls, tex, quiet: ph.cls === 'quiet', solo: ph.solo, impact, energy: ph.e,
    groove: ph.groove + cycle, rest, fill: pb === 7 && !roll, quote, ...roll };
}

export class Song {
  constructor(keyPc, sections = SECTIONS, tune = LOOP) {
    this.keyPc = keyPc;
    this.sections = sections;
    this.tune = tune;
    this.home = tune.home;   // the degree the song ends on (its stop-time and last chord)
    this.hook = tune.hook;
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
      // The bar before a breakdown breaks off on beat 3 (instead of the fill). In the song that is a phrase's
      // last bar; in a radio edit it can be an excerpt's.
      const a = p.arr;
      if (!a.quiet && !a.roll && !p.section.end) {
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
        return { index: i, section: s, barInSection, sectionStart: start, chord, barsLeft: s.bars - barInSection, arr: arrangement(s, b, this.tune.fig?.[s.id]) };
      }
      start += s.bars;
    }
    const s = S[S.length - 1];
    return { index: S.length - 1, section: s, barInSection: bar - start, sectionStart: start, chord: this.chord(s.prog[0], s.lift), barsLeft: Infinity, arr: PLAIN };
  }
}

// Load check (console.error fails the sims): every progression is at most 32 bars of plain major or minor triads,
// and every quote a section names exists, starts on its downbeat, sits on its grid and lands on a phrase of the chart.
for (const tune of SONGS) for (const s of sectionsOf(tune)) {
  const bad = (what) => console.error(`[songs] ${tune.id}.${s.id}: ${what}`);
  if (s.prog.length > 32) bad('a progression longer than 32 bars');
  for (const c of s.prog) { const { quality, intervals } = makeChord(0, c.d ?? c, !!c.h); if (quality === 'dim' || intervals[2] !== 7) bad(`degree ${JSON.stringify(c)} is not a major or minor triad`); }
  if (!s.quote) continue;
  const q = QUOTES[s.quote.part], phs = CHART[s.id] || [];
  if (!q || q.steps % 16 || !q.by[0] || q.pattern.some((n) => !Number.isInteger(n.s) || n.s < 0 || !Number.isInteger(n.kd) || !Number.isInteger(n.d) || n.d < 1 || n.s + n.d > q.steps)) bad(`bad quote ${s.quote.part}`);
  if (!(s.quote.at === 'solo' ? phs.some((p) => p.solo) : phs[s.quote.at])) bad(`no phrase ${s.quote.at} for its quote`);
}
