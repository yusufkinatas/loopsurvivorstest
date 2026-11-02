// Your career between runs. Liner-note goals unlock first sounds, a run that reaches the Finale presses
// its genre as a record (gold if it finished the song), remixes go in your crate, and wins open Gain.
// Pure: no DOM and no storage (storage.js keeps `meta`, main.js folds each finished run in with applyRun).
//
// meta = { v: 1, runs, wins, kills, secs, goals: { [goalId]: firstMs }, records: { [genre]: rec },
//          remixes: { [instrumentId]: firstMs }, gainMax: 0-8, gainSel: 0-gainMax,
//          songSel: the song picked (index into SONGS), played: bit i set once song i was played,
//          seen: { [instrument or pedal id]: 1 } every sound and pedal ever taken }
// rec  = { s: score, k: key name, kp: key pitch class, w: 0|1, g: gain, sh: track sheet, d: 'YYYY-MM-DD', sg: song id }

import { GAIN, STYLES } from '../config.js';
import { SECTIONS, SONGS } from '../music/song.js';
import { BY_ID } from '../content/instruments/index.js';
import { PEDAL_BY_ID } from '../content/pedals.js';

export const DEFAULT_STARTS = ['kick808', 'upright', 'squarelead'];

const has = (sum, boss) => sum.bossKills.includes(boss);
// The most sounds of one style in the band at the end of the run.
const topStyle = (sum) => Math.max(...Object.keys(STYLES).map((st) => sum.band.filter(([id]) => BY_ID[id]?.style === st).length));

// The six sounds of the newer styles, opened as first sounds all at once by their goal.
const HEAVY = ['doublekick', 'ride', 'dropd', 'powerchords', 'shred', 'pinch'];
const ORCHESTRA = ['timpani', 'fieldsnare', 'cellos', 'strings', 'horn', 'harp'];

// One goal unlocks one first sound (or, for a style's goal, all six of that style's sounds), roughly easiest
// first. test(sum, meta) runs after the run's record and remixes are in meta, so Box set and Crate digger can
// count them.
export const GOALS = [
  { id: 'drone',    name: 'Soundcheck',    text: 'Silence The Drone.',                          unlock: 'taiko',      test: (s) => has(s, 'drone') },
  { id: 'fullband', name: 'Full band',     text: 'Fill all six channels.',                      unlock: 'hats909',    test: (s) => s.fullBand },
  { id: 'clipper',  name: 'Clean signal',  text: 'Silence The Clipper.',                        unlock: 'sawlead',    test: (s) => has(s, 'clipper') },
  { id: 'stagger',  name: 'Off the beat',  text: 'Knock a boss off the beat.',                  unlock: 'chipdrums',  test: (s) => s.staggers > 0 },
  { id: 'synth4',   name: 'Electric',      text: 'Have 4 Synth sounds at once.',                unlock: 'supersaw',   test: (s) => s.peak.synth >= 4 },
  { id: 'live4',    name: 'Acoustic set',  text: 'Have 4 Live sounds at once.',                 unlock: 'rhodes',     test: (s) => s.peak.organic >= 4 },
  { id: 'chip4',    name: 'Insert coin',   text: 'Have 4 8-Bit sounds at once.',                unlock: 'chipchords', test: (s) => s.peak.chip >= 4 },
  { id: 'heavy4',   name: 'Amped up',      text: 'Have 4 Heavy sounds at once.',                unlock: HEAVY,        test: (s) => s.peak.heavy >= 4 },
  { id: 'orch4',    name: 'Overture',      text: 'Have 4 Orchestra sounds at once.',            unlock: ORCHESTRA,    test: (s) => s.peak.orchestra >= 4 },
  { id: 'remix',    name: 'First remix',   text: 'Make your first remix.',                      unlock: 'chiphat',    test: (s) => s.remixes.length > 0 },
  { id: 'king',     name: 'Headliner',     text: 'Silence The Glitch King.',                    unlock: 'chiparp',    test: (s) => has(s, 'glitchking') },
  { id: 'maxed',    name: 'Maxed out',     text: 'Have all six channels at level 5 at once.',   unlock: 'arpsynth',   test: (s) => s.maxedAll },
  { id: 'win',      name: 'Final chord',   text: 'Finish the song.',                            unlock: 'flute',      test: (s) => s.won },
  { id: 'fusion',   name: 'Fusion',        text: 'Have two sounds each of three styles.',       unlock: 'musicbox',   test: (s) => s.fused },
  { id: 'concept',  name: 'Concept album', text: 'Finish the song with 5 sounds of one style.', unlock: 'tribass',    test: (s) => s.won && topStyle(s) >= 5 },
  { id: 'boxset',   name: 'Box set',       text: 'Press 3 different records.',                  unlock: 'shaker',     test: (s, m) => Object.keys(m.records).length >= 3 },
  { id: 'crate',    name: 'Crate digger',  text: 'Find 6 different remixes.',                   unlock: 'subbass',    test: (s, m) => Object.keys(m.remixes).length >= 6 },
];

// The 30 genres a six-channel band can end as (genreName in loadout.js), with a hint for an empty sleeve. A
// crossover needs exactly two styles at 2+ (a third makes Fusion).
// Any other genre still presses, as a hidden track (a Finale run with fewer than six channels).
export const RECORDS = [
  { genre: 'Synthwave',         hint: '3 or 4 Synth, no second style twice' },
  { genre: 'Neon Synthwave',    hint: '5 Synth sounds' },
  { genre: 'Pure Synthwave',    hint: '6 Synth sounds' },
  { genre: 'Live band',         hint: '3 or 4 Live, no second style twice' },
  { genre: 'Full live band',    hint: '5 Live sounds' },
  { genre: 'Pure live band',    hint: '6 Live sounds' },
  { genre: 'Chiptune',          hint: '3 or 4 8-Bit, no second style twice' },
  { genre: 'Console chiptune',  hint: '5 8-Bit sounds' },
  { genre: 'Pure chiptune',     hint: '6 8-Bit sounds' },
  { genre: 'Hard rock',         hint: '3 or 4 Heavy, no second style twice' },
  { genre: 'Heavy metal',       hint: '5 Heavy sounds' },
  { genre: 'Pure metal',        hint: '6 Heavy sounds' },
  { genre: 'Chamber orchestra', hint: '3 or 4 Orchestra, no second style twice' },
  { genre: 'Symphony',          hint: '5 Orchestra sounds' },
  { genre: 'Full symphony',     hint: '6 Orchestra sounds' },
  { genre: 'Indietronica',      hint: '2+ Synth, 2+ Live' },
  { genre: 'Electro chip',      hint: '2+ Synth, 2+ 8-Bit' },
  { genre: 'Lo-fi chip',        hint: '2+ Live, 2+ 8-Bit' },
  { genre: 'Industrial',        hint: '2+ Heavy, 2+ Synth' },
  { genre: 'Grunge',            hint: '2+ Heavy, 2+ Live' },
  { genre: 'Chip metal',        hint: '2+ Heavy, 2+ 8-Bit' },
  { genre: 'Symphonic metal',   hint: '2+ Heavy, 2+ Orchestra' },
  { genre: 'Film score',        hint: '2+ Orchestra, 2+ Synth' },
  { genre: 'Chamber pop',       hint: '2+ Orchestra, 2+ Live' },
  { genre: 'Boss theme',        hint: '2+ Orchestra, 2+ 8-Bit' },
  { genre: 'Fusion',            hint: '2 each of 3 styles' },
  // Two of one style and one of each of the other four: the 2-sound name of the style with two.
  { genre: 'Synthpop',          hint: '2 Synth, 1 of each other style' },
  { genre: 'Acoustic duo',      hint: '2 Live, 1 of each other style' },
  { genre: 'Garage rock',       hint: '2 Heavy, 1 of each other style' },
  { genre: 'Duet',              hint: '2 Orchestra, 1 of each other style' },
];

const FINALE = SECTIONS.findIndex((s) => s.id === 'finale');
const SHEET_MAX = SECTIONS.length;

export function newMeta() {
  return { v: 1, runs: 0, wins: 0, kills: 0, secs: 0, goals: {}, records: {}, remixes: {}, gainMax: 0, gainSel: 0, songSel: 0, played: 0, seen: {} };
}

const num = (x) => (Number.isFinite(x) && x >= 0 ? x : 0);
const int = (x, max) => (Number.isInteger(x) ? Math.min(max, Math.max(0, x)) : 0);
const pc = (x) => (Number.isInteger(x) && x >= 0 && x < 12 ? x : 0);
const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
// Keep the entries of `o` whose key passes `ok` and whose value is a time.
const stamps = (o, ok) => Object.fromEntries(Object.entries(obj(o)).filter(([k, t]) => ok(k) && Number.isFinite(t) && t >= 0));
const sheetOf = (sh) => (Array.isArray(sh) ? sh.filter((e) => e && Number.isInteger(e.index) && SECTIONS[e.index] && Array.isArray(e.band)).slice(0, SHEET_MAX) : []);
// A song id this version knows, else the loop (a record from before the setlist, or from a later version).
const songOf = (id) => (SONGS.some((t) => t.id === id) ? id : SONGS[0].id);
const PLAYED = (1 << SONGS.length) - 1;

// Anything read from storage comes through here: every field is coerced, malformed records are dropped,
// and gainSel <= gainMax <= 8. Never throws.
export function normalizeMeta(raw) {
  const m = obj(raw);
  const records = {};
  for (const [genre, r] of Object.entries(obj(m.records))) {
    if (!r || !Number.isFinite(r.s)) continue;
    records[genre] = {
      s: r.s, k: typeof r.k === 'string' ? r.k : '', kp: pc(r.kp), w: r.w === 1 ? 1 : 0, g: int(r.g, GAIN.length),
      sh: sheetOf(r.sh), d: typeof r.d === 'string' ? r.d : '', sg: songOf(r.sg),
    };
  }
  const gainMax = int(m.gainMax, GAIN.length);
  const runs = Math.floor(num(m.runs));
  return {
    ...newMeta(), runs, wins: Math.floor(num(m.wins)), kills: num(m.kills), secs: num(m.secs),
    goals: stamps(m.goals, (id) => GOALS.some((g) => g.id === id)), records,
    remixes: stamps(m.remixes, (id) => !!BY_ID[id]?.remix), gainMax, gainSel: int(m.gainSel, gainMax),
    songSel: int(m.songSel, SONGS.length - 1),
    // Only the bits of songs this version knows; every run before the setlist played the loop.
    played: (Number.isInteger(m.played) && m.played > 0 ? m.played & PLAYED : 0) | (runs > 0 ? 1 : 0),
    seen: Object.fromEntries(Object.entries(obj(m.seen)).filter(([id, v]) => v === 1 && (Object.hasOwn(BY_ID, id) || Object.hasOwn(PEDAL_BY_ID, id)))),
  };
}

// The sounds a goal opens: its unlock, one id or a list.
export const unlocksOf = (goal) => [].concat(goal.unlock);
// What a goal opens, in words: a sound's name, or "all six Heavy sounds" for a style's goal.
export function unlockLabel(goal) {
  const ids = unlocksOf(goal);
  if (ids.length === 1) return BY_ID[ids[0]]?.name ?? ids[0];
  const style = STYLES[BY_ID[ids[0]]?.style];
  return `all ${ids.length === 6 ? 'six' : ids.length}${style ? ` ${style.name}` : ''} sounds`;
}

// First sounds open to pick: the three defaults plus what each goal met opens.
export function unlockedStarts(meta) {
  return [...DEFAULT_STARTS, ...GOALS.filter((g) => meta.goals[g.id]).flatMap(unlocksOf)];
}

// The liner-note goal to go for next: the first one not met yet, or null once all are.
export const nextGoal = (meta) => GOALS.find((g) => !meta.goals[g.id]) || null;

// Fold one finished run into meta (mutates it). Returns what is new, for the end screen:
// { goals: [goal...], record: { genre, fresh, gold, upgraded } | null, remixes: [ids], gain: n | null }.
// A summary field that is missing counts as not done.
export function applyRun(meta, sum, { now }) {
  const out = { goals: [], record: null, remixes: [], gain: null };
  meta.runs++;
  meta.wins += sum.won ? 1 : 0;
  meta.kills += num(sum.kills);
  meta.secs += Math.round(num(sum.time));
  meta.played |= 1 << SONGS.findIndex((t) => t.id === songOf(sum.songId));
  // Every sound (retired ones too) and pedal the run took is no longer new.
  for (const r of Array.isArray(sum.instruments) ? sum.instruments : []) if (Object.hasOwn(BY_ID, r?.id)) meta.seen[r.id] = 1;
  for (const p of Array.isArray(sum.pedals) ? sum.pedals : []) if (Object.hasOwn(PEDAL_BY_ID, p?.id)) meta.seen[p.id] = 1;
  for (const r of Array.isArray(sum.remixes) ? sum.remixes : []) {
    if (BY_ID[r?.id]?.remix && !meta.remixes[r.id]) { meta.remixes[r.id] = now; out.remixes.push(r.id); }
  }
  if (sum.sectionIndex >= FINALE && typeof sum.genre === 'string' && Number.isFinite(sum.score)) {
    const old = meta.records[sum.genre];
    const rec = { s: sum.score, k: String(sum.key ?? ''), kp: pc(sum.keyPc), w: sum.won ? 1 : 0, g: int(sum.gain, GAIN.length), sh: sheetOf(sum.sheet), d: new Date(now).toISOString().slice(0, 10), sg: songOf(sum.songId) };
    if (!old || rec.w > old.w || (rec.w === old.w && rec.s > old.s)) {
      meta.records[sum.genre] = rec;
      out.record = { genre: sum.genre, fresh: !old, gold: !!rec.w, upgraded: !!old && rec.w > old.w };
    }
  }
  // A win at the highest Gain open opens the next one.
  if (sum.won && sum.gain === meta.gainMax && meta.gainMax < GAIN.length) out.gain = ++meta.gainMax;
  for (const g of GOALS) {
    if (meta.goals[g.id]) continue;
    let ok = false;
    try { ok = !!g.test(sum, meta); } catch (e) { /* a missing summary field leaves the goal open */ }
    if (ok) { meta.goals[g.id] = now; out.goals.push(g); }
  }
  return out;
}
