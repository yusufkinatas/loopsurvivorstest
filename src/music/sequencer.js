// The transport. Schedules every instrument's pattern slightly ahead on the audio clock and emits a
// matching game event for each note, so an attack fires at the exact moment its note is heard.
// While the game is paused ("hold"), the current bar loops as a muffled vamp and no attacks are emitted.
// The vamp always plays the plain loop: textures, fills, rolls, breaks and stops only happen while the
// song moves, and an auditioned card always plays its plain part.

import { STEPS_PER_BAR, STEP_SEC, BAR_SEC, ROLE_HIGH } from '../config.js';
import { chordTone, scaleTone, keyTone, voiceChord, mtof } from './theory.js';
import { clamp } from '../util.js';
import { GROOVES, STYLE_GROOVE, CROSS_GROOVE, FIGURES } from './grooves.js';
import { crossoverOf, emptyCounts } from '../game/loadout.js';

const NO_CUES = [];
const NONE = Object.freeze([]);
// Beat fill velocities on steps 12-15: a run on a snare, clap or rim, or three kicks.
const FILL_V = { hit: [0.55, 0.65, 0.8, 0.95], kick: [0.7, 0, 0.8, 0.9] };
// Pickup chimes climb the chord and come back down while pickups keep coming.
const CLIMB = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1];

// Pitch of a pickup chime: the idx-th chord tone from G5 up, kept under the Sparkle ceiling.
export function chimeMidi(chord, idx) {
  let m = chordTone(chord, idx, 79);
  while (m > ROLE_HIGH.arp) m -= 12;
  return m;
}

// ---------------------------------------------------------------------------- textures
//
// The arrangement (src/music/song.js CHART) gives every channel a texture in each 8-bar phrase: one of
// these transforms of the channel's own part. A transform only picks which of the part's notes sound on a
// step, moves notes onto another 16th step, changes their octave (o) or length (d), or mirrors their chord
// or scale index (ct/sc). It never invents a pitch or a sound, so every note stays in key, on the grid and
// a kind the part plays. (by, P, bar, sib) -> the notes on step sib of bar, or null. A note that moves
// gets s = the pattern step it sounds on ((bar * 16 + sib) % P), so s === 0 is still the pattern's downbeat.
const at = (bar, sib, P) => (bar * STEPS_PER_BAR + sib) % P;
const moved = (ns, s, fn) => (ns ? ns.map((n) => fn({ ...n, s })) : null);
const pitched = (n) => n.ct !== undefined || n.sc !== undefined || n.kd !== undefined || !!n.chord;

export const TRANSFORMS = {
  // The part as written.
  full: (by, P, bar, sib) => by[at(bar, sib, P)] || null,
  // Tacet.
  out: () => null,
  // The first note of each beat.
  sparse: (by, P, bar, sib) => {
    const i = at(bar, sib, P);
    if (!by[i]) return null;
    for (let s = i - (i % 4); s < i; s++) if (by[s]) return null;
    return by[i];
  },
  // Half time: the part at half speed on the even steps, every note twice as long.
  half: (by, P, bar, sib) => (sib & 1 ? null : moved(by[(bar * 8 + sib / 2) % P], at(bar, sib, P), (n) => { n.d = (n.d || 1) * 2; return n; })),
  // Double time: the part's even steps at twice the speed, notes half as long.
  double: (by, P, bar, sib) => moved(by[(bar * 32 + sib * 2) % P], at(bar, sib, P), (n) => { n.d = Math.max(1, (n.d || 1) >> 1); return n; }),
  // Only the even bars (the call of a 2-bar phrase) / only the odd bars (its answer).
  call: (by, P, bar, sib) => (bar & 1 ? null : by[at(bar, sib, P)] || null),
  answer: (by, P, bar, sib) => (bar & 1 ? by[at(bar, sib, P)] || null : null),
  // The bar's first note, held for up to half a bar.
  hold: (by, P, bar, sib) => {
    const i0 = at(bar, 0, P);
    let f = 0;
    while (f < STEPS_PER_BAR && !by[i0 + f]) f++;
    return f === sib ? moved(by[i0 + f], i0 + f, (n) => { n.d = Math.min(8, STEPS_PER_BAR - f); return n; }) : null;
  },
  // An octave down.
  low: (by, P, bar, sib) => moved(by[at(bar, sib, P)], at(bar, sib, P), (n) => { if (pitched(n)) n.o = (n.o || 0) - 1; return n; }),
  // The tune upside down: chord tone n -> 3 - n (root <-> octave), scale step n -> 7 - n.
  inv: (by, P, bar, sib) => moved(by[at(bar, sib, P)], at(bar, sib, P), (n) => {
    if (n.ct !== undefined) n.ct = 3 - n.ct;
    else if (n.sc !== undefined) n.sc = 7 - n.sc;
    return n;
  }),
};

// Grooves and figures (src/music/grooves.js) re-time the part's own notes. In every bar the part's notes, loudest
// first, take the transform's slots, strongest first (a slot ranks by its velocity in the row, then by where it
// falls: step 0, beat 3, the other beats, the 8ths), and a bar with more notes than slots plays the rest, softest
// last, on the strongest steps left free (a figure holds its pitch there). So every note of the part plays, with
// its sound and its velocity (an attack keyed on a kind, an accent or the downbeat fires as often), and only the
// timing changes (and a figure's pitch): a groove or a figure hits exactly as hard as the part.
const rank = (sib, v) => v + (sib ? (sib === 8 ? 1.25 : sib % 4 ? (sib % 2 ? 0 : 0.5) : 1) : 2);
// Notes ns into slots [{ sib, r, x }] (x: what the slot sets on its note), into out by step of the bar; hold: a
// free step takes the slot before it (a figure's pitch).
function fit(ns, slots, out, hold) {
  if (!ns.length) return;
  if (ns.length > slots.length) {
    const by = slots.slice().sort((a, b) => a.sib - b.sib), free = [];
    for (let sib = 0; sib < STEPS_PER_BAR; sib++) {
      if (by.some((sl) => sl.sib === sib)) continue;
      free.push({ sib, r: rank(sib, 0) - 10, x: hold && (by.findLast((sl) => sl.sib < sib) || by[0]).x });
    }
    slots = [...slots, ...free];
  }
  ns = ns.slice().sort((a, b) => (b.v ?? 1) - (a.v ?? 1));
  slots.slice().sort((a, b) => b.r - a.r || a.sib - b.sib).slice(0, ns.length)
    .forEach((sl, i) => (out[sl.sib] ||= []).push({ ...ns[i], ...sl.x }));
}
// A part's notes re-timed bar by bar: pools(the notes of bar b, b) -> [[notes, slots, hold], ...]. Cached on the
// part, for as many bars as it takes the part and every 1, 2 and 4-bar row or figure to come round together.
function retime(by, P, tf, pools) {
  const c = (by._re ||= {});
  if (!c[tf]) {
    let L = 4;
    while (L % (P / STEPS_PER_BAR)) L += 4;
    const t = (c[tf] = []);
    for (let b = 0; b < L; b++) {
      const ns = [], out = [];
      for (let sib = 0; sib < STEPS_PER_BAR; sib++) ns.push(...(by[at(b, sib, P)] || NONE));
      for (const [pool, slots, hold] of pools(ns, b)) fit(pool, slots, out, hold);
      for (let sib = 0; sib < STEPS_PER_BAR; sib++) t.push(out[sib]?.map((n) => ({ ...n, s: at(b, sib, P) })) || null);
    }
  }
  return c[tf];
}
// A part's main sound K (a Beat part's kick, else its most played); drum: no note has a pitch; line: every note is
// one pitch (no chord); beat: it has a kick.
const kindsOf = (by) => by._kinds ||= (() => {
  const n = {};
  let drum = true, line = true;
  for (const ns of by) for (const x of ns || NONE) {
    if (pitched(x)) drum = false;
    if (!pitched(x) || x.chord) line = false;
    n[x.k] = (n[x.k] || 0) + 1;
  }
  return { drum, line, beat: !!n.kick, K: n.kick ? 'kick' : Object.keys(n).sort((a, b) => n[b] - n[a])[0] };
})();
// A grid row ('X... o...', '|' between bars) as a velocity (0 a rest) per step, and its slots in bar b.
const VEL = { X: 1, x: 0.8, o: 0.6, g: 0.4 };
const row = (str) => [...str.replace(/[\s|]/g, '')].map((c) => VEL[c] || 0);
const slotsIn = (r, b) => {
  const out = [];
  for (let sib = 0; sib < STEPS_PER_BAR; sib++) {
    const v = r[(b * STEPS_PER_BAR + sib) % r.length];
    if (v) out.push({ sib, r: rank(sib, v) });
  }
  return out;
};
// A groove re-times a drum part (Beat rows on a part with a kick, else Groove rows): its main sound takes the K row,
// any other sound the S row, then the K row's other hits (so a second sound the row has no room for keeps its
// job); a pitched part plays as written.
for (const [id, G] of Object.entries(GROOVES)) {
  const rows = { beat: G.beat.map(row), perc: G.perc.map(row) };
  TRANSFORMS['g_' + id] = (by, P, bar, sib) => {
    const p = kindsOf(by);
    if (!p.drum) return by[at(bar, sib, P)] || null;
    const t = retime(by, P, 'g_' + id, (ns, b) => {
      const [K, S] = (p.beat ? rows.beat : rows.perc).map((r) => slotsIn(r, b));
      const spill = K.filter((k) => !S.some((s) => s.sib === k.sib));
      return [[ns.filter((n) => n.k === p.K), K], [ns.filter((n) => n.k !== p.K), [...S.map((s) => ({ ...s, r: s.r + 10 })), ...spill]]];
    });
    return t[(bar * STEPS_PER_BAR + sib) % t.length];
  };
}
// A figure plays its chord tones on the part's notes (their kinds, velocities and lengths; its own velocities only
// rank its notes), on a part of single pitches; any other part plays as written. On a part with a quarter or half
// as many notes it plays at quarter or half speed (an Alberti on quarters is still an Alberti); a sparser part
// leaves out its weakest notes.
for (const [id, F] of Object.entries(FIGURES)) {
  TRANSFORMS['f_' + id] = (by, P, bar, sib) => {
    const p = kindsOf(by);
    if (!p.line) return by[at(bar, sib, P)] || null;
    const t = retime(by, P, 'f_' + id, (ns, b) => {
      const per = (by.reduce((n, x) => n + (x?.length || 0), 0) * STEPS_PER_BAR) / P, z = [4, 2].find((z) => F.length / z >= per) || 1;
      const slots = F.filter((n) => Math.floor((n.s * z) / STEPS_PER_BAR) === b % z).map((n) => {
        const sib = (n.s * z) % STEPS_PER_BAR;
        return { sib, r: rank(sib, n.v), x: { ct: n.ct, ...(n.o && { o: n.o }) } };
      });
      return [[ns.map((n) => ({ v: n.v, ...(n.d && { d: n.d }), ...(n.k && { k: n.k }) })), slots, true]];
    });
    return t[(bar * STEPS_PER_BAR + sib) % t.length];
  };
}
// lvN plays level N's authored part (levels are supersets, so it is the simpler part), never above the
// channel's own level and with the channel's own stats. On a remix's own pattern it plays 'sparse'.
const LV = { lv1: 1, lv2: 2, lv3: 3, lv4: 4, lv5: 5 };
// Every texture name a chart may use ('solo' is the featured channel's, chosen by the sequencer).
export const TEXTURE_NAMES = [...Object.keys(TRANSFORMS), ...Object.keys(LV), 'groove'];

const FULL_TEX = Object.freeze({ tf: 'full', w: 1 });
const SPARSE_TEX = Object.freeze({ tf: 'sparse', w: 1 });
// The featured channel of a solo phrase hits this hard against its full part (the game can ask for less).
export const SOLO_GAIN = 1.8;
// Without a game to ask, a solo goes to a remix, else the highest level, else the first role here.
const ROLE_PREF = ['lead', 'arp', 'chords', 'bass', 'perc', 'beat'];
// The desk follows the phrase: its level, and a quiet phrase's lowpass opening from 900 Hz across 8 bars.
const DESK_LEVEL = { quiet: 0.8, solo: 0.95, mid: 0.95, full: 1 };
const toneAt = (pb) => 900 * Math.pow(20, pb / 8);

// The part a channel plays: a remix's own pattern (def.remix.pattern, def.remix.steps long) once
// remixed, else its level's. The registry prepares remix._byStep; it is built here if it is missing.
export function partOf(inst) {
  const def = inst.def, rm = def.remix;
  if (inst.remix && rm?.pattern?.length) {
    if (!rm._byStep) {
      rm._byStep = [];
      for (const n of rm.pattern) (rm._byStep[n.s] ||= []).push(n);
    }
    return rm;
  }
  return def.levels?.[inst.level - 1] || null;
}
export const stepsOf = (def, part) => (part === def.remix ? def.remix.steps || def.steps : def.steps) || STEPS_PER_BAR;
// The sound a Beat part plays its fills and rolls on: the first that is not a kick, else the kick
// (prepared by the registry as _fillKind, for a remix's own pattern too).
const fillKind = (part) => (part._fillKind ||= (part.pattern?.find((n) => n.k && n.k !== 'kick') || { k: 'kick' }).k);

// Total velocity of a part over `bars` bars of a transform.
function velocity(by, P, tf, bars) {
  let v = 0;
  for (let bar = 0; bar < bars; bar++) for (let sib = 0; sib < STEPS_PER_BAR; sib++) for (const n of TRANSFORMS[tf](by, P, bar, sib) || NONE) v += n.v ?? 1;
  return v;
}
// A solo is the part doubled up when it is sparse (8 notes a bar or fewer), else the full part. Its
// weight brings the channel to `gain` times its full part's damage. Cached on the part.
function soloShape(part, P) {
  if (!part._solo) {
    const by = part._byStep, bars = 2 * (P / STEPS_PER_BAR);
    let count = 0;
    for (const ns of by) if (ns) count += ns.length;
    const tf = (count * STEPS_PER_BAR) / P <= 8 ? 'double' : 'full';
    const full = velocity(by, P, 'full', bars);
    part._solo = { tf, ratio: full > 0 ? velocity(by, P, tf, bars) / full : 1 };
  }
  return part._solo;
}

// The weight that makes a part under transform tf hit like its full part over a phrase (8 bars): the full part's
// velocity over the transform's, clamped to 0.5-4. Cached on the part.
export function reW(part, P, tf) {
  const c = (part._reW ||= {});
  if (c[tf] === undefined) {
    const v = velocity(part._byStep, P, tf, 8);
    c[tf] = v > 0 ? clamp(velocity(part._byStep, P, 'full', 8) / v, 0.5, 4) : 1;
  }
  return c[tf];
}

function pickFeatured(band) {
  let best = null, bk = -Infinity;
  for (const i of band) {
    if (!i?.def) continue;
    const k = (i.remix ? 1000 : 0) + (i.level || 0) * 10 - ROLE_PREF.indexOf(i.def.role);
    if (k > bk) { bk = k; best = i; }
  }
  return best;
}

export class Sequencer {
  constructor(clock, audio) {
    this.clock = clock;
    this.audio = audio;
    this.lookahead = 0.14;
    this.running = false;
    this.getInstruments = () => [];
    this.getBossCues = () => NO_CUES;   // (bar, beat) -> cue names to play on that beat (see src/game/bosscues.js)
    // At the start of a solo phrase: the instrument that takes it, or { inst, gain } (gain: how hard it
    // hits against its full part, SOLO_GAIN by default), or null to let the sequencer pick.
    this.getFeatured = () => null;
    this.forceTex = null;   // role -> a transform played in place of each of its 'full' phrases (sims: tex=)
    this._errors = new Set();
    this.reset(null);
  }

  reset(song) {
    this.song = song;
    this.globalStep = 0;
    this.bar = 0;
    this.loopBar = 0;          // counts every bar, held or not, so 2-bar patterns keep cycling in a vamp
    this.hold = false;
    this.nextTime = 0;
    this.events = [];
    this.preview = null;       // { inst } an instrument auditioned in place of its channel's current one
    this.dropState = null;     // null | 'queued' | 'building'
    this.stepLog = [];         // recent {time, sib, bar, rest, tex, quiet, solo, impact} for the playhead display
    this.running = false;
    this.pos = null;           // song position of the bar being scheduled
    this.onBar = null;         // (bar) called as each new bar starts, before its notes are scheduled
    this.pendingStop = null;   // { len, home } waiting for the next downbeat
    this.lastStop = null;      // { bar, len, home, step, end } the latest stop bar
    this.fillBar = -1;         // last bar the Beat channel played a fill in
    this.featured = null;      // { at, role, gain } the channel featured in the solo phrase starting on bar `at`
    this.barRest = [];         // channels of the band tacet in the bar being scheduled
    this.barTex = {};          // role -> { tf, w } the band's textures in the bar being scheduled
    this.pingStep = -1e9;      // global step of the last note chime
    this.pingN = 0;
    this.pingSlots = new Array(8).fill(-1e9);   // note chimes per 8th of the last 2 seconds
    // A queued remix { inst, bar, out } (see remixBar and _remixDownbeat): on bar - 1 the channel drops out under
    // a riser (out), and on bar's downbeat inst.remix flips before that step's notes, so the remix's own part is
    // what is heard there, with an impact as the downbeat's one hit and a { type: 'remix' } event.
    this.remixAt = null;
    this.onRemix = null;       // (inst, bar) as the flip is scheduled: the game sets the remix up at once
    this.onRemixLost = null;   // (inst) a queued remix whose channel left the band before it landed
    this.remixLanded = -1;     // the bar the latest remix landed on (its impact is that downbeat's one hit)
    this.dropLanded = -1;      // the bar the player's latest Drop landed on
    this._impactBar = -1;      // the bar whose downbeat had an impact (the desk opens up for that bar)
    this._vamped = false;      // a held downbeat set the desk to the vamp: the first step the song moves again resets it
    this._w = 1;
    this.heard = { quote: 0, groove: 0 };   // live notes played from a quote and from a groove (sim coverage)
    this._gBar = -1;           // the bar the band's groove list was read for (see _groove)
  }

  start(atTime) {
    this.nextTime = atTime;
    this.running = true;
  }

  stop() { this.running = false; }

  requestDrop() {
    if (this.dropState) return false;
    this.dropState = 'queued';
    return true;
  }

  // The downbeat of `bar` (its step log entry) when the player's Drop can still land on it although it is
  // already scheduled: it is the bar being scheduled, the song moves, no Drop or stop is queued, and that
  // downbeat is free of a stop bar and of a remix (its landing, or its dropout bar starting there). Else null.
  // For a press on a fill's last hits, heard after the sequencer has moved on (see Game._lateFill).
  dropDownbeat(bar) {
    if (this.hold || bar !== this.bar || this.dropState || this.pendingStop || this.lastStop?.bar === bar || this.dropLanded === bar || this.remixLanded === bar || this.remixAt?.out) return null;
    for (let i = this.stepLog.length - 1; i >= 0; i--) {
      const s = this.stepLog[i];
      if (s.bar === bar && s.sib === 0) return s.rest ? s : null;   // the vamp's downbeats carry no arrangement
    }
    return null;
  }

  // Land the player's Drop on that scheduled downbeat after all: its 'drop' event goes in where a Drop's own
  // would have been (after the section's), and the Drop is the downbeat's one hit: it takes the song's impact
  // event there (that impact already sounds), or it plays its own impact (as soon as the audio clock allows),
  // and the desk opens up for the bar as on any impact. Returns false when the downbeat is not free.
  landDropAt(bar) {
    const d = this.dropDownbeat(bar);
    if (!d) return false;
    const t = d.time;
    const ev = this.events = this.events.filter((e) => !(e.type === 'impact' && e.bar === bar));
    let i = 0;
    while (i < ev.length && (ev[i].time < t || (ev[i].time === t && ev[i].type === 'section'))) i++;
    ev.splice(i, 0, { type: 'drop', time: t, bar });
    this.dropLanded = bar;
    if (!d.impact) {
      d.impact = true;
      this._impactBar = bar;
      const A = this._audioOn() ? this.audio : null;
      if (A) {
        A.impact(Math.max(t, A.now()), this.pos.chord.rootPc);
        if (this.pos.arr.quiet) this._bar(A, t, this.pos.arr, this.getInstruments(), true);
      }
    }
    return true;
  }

  // Stop-time: on the next downbeat that is not held, every channel plays its step-0 notes and rests
  // until step `len`. home: that bar's chord becomes i (of the lifted key), the song's last chord.
  // It never shares a bar with the player's Drop: a queued Drop waits out the stop bar (see _step), and a
  // stop asked for while a Drop builds would land on its impact, the moment itself, so it is dropped. The
  // song's ending is kept: its silent bar follows the impact.
  stopNext(len, home = false) { if (home || this.dropState !== 'building') this.pendingStop = { len, home }; }

  // The bar a remix queued now lands on: the first 4-bar line at or after `from` that is not an arrangement
  // impact, a Build-Up roll bar or a breakdown's first bar, and whose dropout bar and downbeat are clear of a
  // stop bar waiting on the next downbeat and of the player's Drop (its build and impact). Else the next line.
  remixBar(from, line = 4) {
    let bar = Math.ceil(from / line) * line;
    for (let guard = 0; guard < 64 && this._remixClash(bar); guard++) bar += line;
    return bar;
  }

  _remixClash(bar) {
    if (!this.song) return false;
    const a = this.song.position(bar).arr;
    if (a.impact || a.roll || (a.quiet && a.pb === 0)) return true;
    const busy = [];
    if (this.pendingStop) busy.push(this.bar + 1);
    if (this.dropState === 'building') busy.push(this.bar + 1);
    else if (this.dropState === 'queued') { const b = this.bar + 1 + (this.pendingStop ? 1 : 0); busy.push(b, b + 1); }
    return busy.includes(bar) || busy.includes(bar - 1);
  }

  // The channel rests through its remix's dropout bar (the song moving, never the vamp).
  _droppedOut(inst, bar) { const R = this.remixAt; return !!R && R.out && R.inst === inst && bar === R.bar - 1; }

  // A queued remix on a downbeat the song moves on. clash: a stop bar or the player's Drop (impact or build)
  // has this downbeat, so the remix moves to the next free line. Returns 'out' on the dropout bar, 'in' on the
  // downbeat it lands (the caller plays the impact there), else null.
  _remixDownbeat(t, A, clash, runIn, band) {
    const R = this.remixAt;
    if (!band.includes(R.inst) || R.inst.remix) {
      this.remixAt = null;
      if (!R.inst.remix) { try { this.onRemixLost?.(R.inst); } catch (e) { this._report('onRemixLost', e); } }
      return null;
    }
    if (this.bar < R.bar - 1) return null;
    if (this.bar === R.bar - 1 && !clash) {
      R.out = true;
      if (A && !runIn) A.riser(t, BAR_SEC);
      return 'out';
    }
    if (this.bar < R.bar || clash || !R.out) {
      R.out = false;
      R.bar = this.remixBar(this.bar + 2);
      return null;
    }
    R.inst.remix = true;
    this.remixAt = null;
    this.remixLanded = this.bar;
    this.events.push({ type: 'remix', time: t, inst: R.inst, bar: this.bar });
    try { this.onRemix?.(R.inst, this.bar); } catch (e) { this._report('onRemix', e); }
    return 'in';
  }

  // Audio time when the pending or latest stop bar is over (0 when there has been none).
  stopEnd() {
    const next = this.nextTime + ((STEPS_PER_BAR - (this.globalStep % STEPS_PER_BAR)) % STEPS_PER_BAR) * STEP_SEC;   // next downbeat not yet scheduled
    if (this.pendingStop) return next + BAR_SEC;
    if (!this.lastStop) return 0;
    return this.lastStop.end ?? next;
  }

  get position() { return this.song ? this.song.position(this.bar) : null; }

  tick() {
    if (!this.running || !this.song) return;
    const now = this.clock.now();
    if (this.nextTime < now - 0.3) this.nextTime = now + 0.04; // recovered from a stall: skip rather than flood
    const horizon = now + this.lookahead;
    let guard = 0;
    while (this.running && this.nextTime < horizon && guard++ < 48) {
      this._step(this.nextTime);
      this.nextTime += STEP_SEC;
      this.globalStep++;
    }
  }

  _audioOn() { return !this.clock.sim && this.audio && this.audio.ready; }

  _step(t) {
    const sib = this.globalStep % STEPS_PER_BAR;
    const emit = !this.hold;
    let impactAt = null, crash = 0, landed = false, dropped = false, songImpact = false;
    let swept = false, runIn = false, rolling = false;   // what this downbeat already plays into the next one
    const audioOn = this._audioOn();
    const A = audioOn ? this.audio : null;
    const band = this.getInstruments();
    if (!this.pos) this.pos = this.song.position(this.bar);

    if (sib === 0) {
      if (this.globalStep > 0) this.loopBar++;
      if (this.globalStep > 0 && !this.hold) {
        this.bar++;
        this.onBar?.(this.bar);
        if (!this.running) return;   // the hook ended playback
        const was = this.pos.arr;
        const pos = this.pos = this.song.position(this.bar);
        const arr = pos.arr;
        // Section starts crash; so does the downbeat after a Beat fill, and the drums coming back in.
        crash = pos.barInSection === 0 ? 0.28 : this.fillBar === this.bar - 1 ? 0.14 : was.rest.includes('beat') && !arr.rest.includes('beat') ? 0.28 : 0;
        if (pos.barInSection === 0) this.events.push({ type: 'section', time: t, index: pos.index, section: pos.section, bar: this.bar });
        if (this.lastStop && this.lastStop.end == null) this.lastStop.end = t;
        if (this.pendingStop) {
          this.lastStop = { ...this.pendingStop, bar: this.bar, step: this.globalStep, end: null };
          this.pendingStop = null;
          landed = true;
        }
        if (arr.impact) { impactAt = t; songImpact = true; }   // the band slams back in
        if (arr.sweep && !this.dropState) A && A.buildSweep(t, t + 2 * BAR_SEC);
        swept = was.sweep;
        // A Beat channel rolling replaces the system snare roll.
        rolling = !!arr.roll && band.some((i) => i.def.role === 'beat');
        // A riser into every impact (and every riser section); a snare roll into The Drop and the Finale.
        const next = pos.next || this.song.sections[pos.index + 1];
        const into = pos.barsLeft === 1 && next && next.riser;
        if (into || this.song.position(this.bar + 1).arr.impact) {
          runIn = true;
          A && A.riser(t, BAR_SEC);
          if (into && (next.drop || next.id === 'finale') && !rolling) { rolling = true; A && A.snareRoll(t, BAR_SEC); }
        }
      }
      // The Drop: queued -> one bar of build -> impact on the next downbeat.
      if (this.dropState === 'building') {
        if (this.hold) {
          if (A) { A.buildSweep(t, t + BAR_SEC); A.riser(t, BAR_SEC); }
        } else {
          impactAt = t;
          dropped = true;
          this.dropLanded = this.bar;
          this.events.push({ type: 'drop', time: t, bar: this.bar });
          this.dropState = null;
        }
      }
      // A remix whose dropout has played lands on this downbeat: a Drop queued during the dropout waits a bar.
      const R = this.hold ? null : this.remixAt;
      const landing = !!R && R.out && this.bar >= R.bar && !landed && !dropped;
      if (this.dropState === 'queued' && !this.hold && !landed && !landing) {   // a stop bar first: silence, riser, impact
        this.dropState = 'building';
        // Over a section's run-in, the build adds only what that bar does not already play.
        if (A) {
          if (!swept) A.buildSweep(t, t + BAR_SEC);
          if (!runIn) A.riser(t, BAR_SEC);
          if (!rolling) A.snareRoll(t, BAR_SEC);
        }
        this.events.push({ type: 'build', time: t });
      }
      // The song's own impact is a game event too, unless the player's Drop lands on the same downbeat:
      // then that Drop is the downbeat's one hit.
      if (songImpact && !dropped) this.events.push({ type: 'impact', time: t, bar: this.bar });
      // A queued remix: its dropout bar, or its downbeat (the remix's impact is that downbeat's one hit). A stop or
      // the player's Drop on either moves it to the next free 4-bar line.
      if (R && this.remixAt === R && this._remixDownbeat(t, A, landed || dropped || this.dropState === 'building' || songImpact, runIn, band) === 'in' && impactAt === null) impactAt = t;
    }

    const pos = this.pos;
    // The arrangement applies to the band while the song moves, never to the vamp or an auditioned card.
    const arr = this.hold ? null : pos.arr;
    const stopped = arr && this.lastStop?.bar === this.bar;
    const chord = stopped && this.lastStop.home ? this.song.chord(0, pos.section.lift) : pos.chord;
    // One hit per downbeat: an impact (it has its own crash) over stop-time over a plain crash.
    if (A && impactAt === null) { if (landed) A.silenced(t, chord.rootPc); else if (crash) A.crash(t, crash); }
    if (sib === 0) {
      this._bar(A, t, arr, band, impactAt !== null);
      this._vamped = this.hold;
    } else if (this._vamped && !this.hold) {
      // The song moves again mid-bar after a held downbeat set the desk to the vamp: this bar's own
      // arrangement comes back from this step (its quiet lowpass ramping on to the bar's end).
      this._vamped = false;
      this._bar(A, t, arr, band, this._impactBar === this.bar, sib);
    }

    if (emit && sib % 4 === 0) {
      this.events.push({ type: 'beat', time: t, beat: sib / 4, bar: this.bar, sib });
      // The impact is the downbeat's one hit, and a player's Drop may knock the boss off this beat.
      if (A && impactAt === null) for (const c of this.getBossCues(this.bar, sib / 4)) A.bossCue(c, t, chord);
    }
    this.stepLog.push({ time: t, sib, bar: this.bar, rest: arr ? this.barRest : null, tex: arr ? this.barTex : null,
      quiet: !!arr?.quiet, solo: arr?.solo ? this.featured?.role ?? null : null, impact: impactAt !== null });
    if (this.stepLog.length > 24) this.stepLog.shift();

    const previewRole = this.preview?.inst?.def.role;
    for (const inst of band) {
      if (inst.def.role === previewRole) continue;
      this._play(inst, t, sib, chord, emit, A, arr, band.length);
    }
    if (this.preview?.inst) this._play(this.preview.inst, t, sib, chord, false, A, null, band.length);
    if (impactAt !== null && A) A.impact(impactAt, chord.rootPc);
  }

  // Each downbeat: the band's textures for this bar (for the playhead display), and the desk follows the
  // phrase on the audio clock (level, the quiet phrase's lowpass, the featured strip). The vamp is plain.
  // sib > 0: the same from step sib of the bar on (the song moving again after a held downbeat).
  _bar(A, t, arr, band, impact, sib = 0) {
    const rest = [], tex = {};
    let playing = 0;
    for (const inst of band) {
      const x = arr ? this.texOf(inst, arr, band.length, this.bar) : FULL_TEX;
      tex[inst.def.role] = x;
      if (x.tf === 'out' || (arr && this._droppedOut(inst, this.bar))) rest.push(inst.def.role); else playing++;
    }
    this.barRest = rest;
    this.barTex = tex;
    if (arr) this._impactBar = impact ? this.bar : -1;
    if (!A?.arrange) return;
    const quiet = !!arr?.quiet && !impact;
    A.arrange(t, {
      playing, band: band.length, level: arr ? DESK_LEVEL[arr.cls] ?? 1 : 1,
      tone: quiet ? [toneAt(arr.pb + sib / STEPS_PER_BAR), toneAt(arr.pb + 1), t + (STEPS_PER_BAR - sib) * STEP_SEC - 0.005] : null,
      solo: arr?.solo ? this.featured?.role ?? null : null,
    });
  }

  // Re-level the desk now for the band as it stands (the band changed). Leaves the lowpass where it is.
  deskNow() {
    const A = this._audioOn() ? this.audio : null;
    if (!A?.arrange || !this.song) return;
    const band = this.getInstruments();
    const arr = this.hold || !this.pos ? null : this.pos.arr;
    let playing = 0;
    for (const inst of band) if (!arr || this.texOf(inst, arr, band.length, this.bar, true).tf !== 'out') playing++;
    A.arrange(A.now(), { playing, band: band.length, level: arr ? DESK_LEVEL[arr.cls] ?? 1 : 1, tone: undefined,
      solo: arr?.solo ? this.featured?.role ?? null : null });
  }

  // The texture a channel plays in a bar of the arrangement: the chart's, with the band's rules. A solo
  // phrase's featured channel plays its solo; a tacet channel plays 'sparse' while the band has 3 channels
  // or fewer, and a remixed channel never goes dark. peek: never ask the game (display only).
  texOf(inst, arr, band = this.getInstruments().length, bar = this.bar, peek = false) {
    const role = inst.def.role;
    if (arr.solo) {
      const f = this._featured(arr, bar, peek);
      if (f?.role === role) return this._soloTex(inst, f.gain);
    }
    const t = arr.tex?.[role] || FULL_TEX;
    if (t.tf === 'out' && (inst.remix || band <= 3)) return SPARSE_TEX;
    if (t.tf === 'full' && this.forceTex?.[role]) return { ...t, tf: this.forceTex[role] };
    return t;
  }

  // The channel featured in the solo phrase that bar is in: asked of the game once, on the phrase's first bar.
  _featured(arr, bar, peek) {
    const at = bar - arr.pb;
    if (this.featured?.at === at) return this.featured;
    let f = null;
    if (!peek) { try { f = this.getFeatured(); } catch (e) { this._report('getFeatured', e); } }
    const inst = f?.inst || (f?.def ? f : null) || pickFeatured(this.getInstruments());
    const out = { at, role: inst ? inst.def.role : null, gain: f?.gain ?? SOLO_GAIN };
    if (!peek) this.featured = out;
    return out;
  }

  _soloTex(inst, gain) {
    const part = partOf(inst);
    if (!part?._byStep) return FULL_TEX;
    const s = soloShape(part, stepsOf(inst.def, part));
    return { tf: s.tf, w: clamp(gain / s.ratio, 0.5, 2), solo: true };
  }

  // The notes inst plays on step sib of bar, as the band hears them (the raw pattern notes: s, v, k, ct/sc/
  // chord, o, d): the arrangement's texture, fills, rolls, breaks and stops while the song moves, the plain
  // loop in the vamp or for an auditioned card. For step grids (the pause sheet, cards).
  // bar: the bar the step is heard in (the loop bar while held, as _play reads it).
  notesFor(inst, bar = this.hold ? this.loopBar : this.bar, sib = 0) {
    if (!this.song || !inst?.def) return NONE;
    const plain = this.hold || inst === this.preview?.inst;
    const arr = plain ? null : this.song.position(bar).arr;
    return this._notes(inst, arr, bar, sib, this.getInstruments().length, false) || NONE;
  }

  // The notes inst plays on a step, and their damage weight in this._w. Precedence, highest first: a stop's
  // or the song's cut, the break before a breakdown, tacet ('out'), the Beat channel's roll (the whole
  // bar), its fill (steps 12-15), then the texture. Fill and roll notes weigh 1. live: the bar is being
  // scheduled (marks the fill for the next downbeat's crash).
  _notes(inst, arr, bar, sib, band, live) {
    const def = inst.def;
    let part = partOf(inst);
    this._w = 1;
    if (!part?._byStep) return null;
    if (!arr) return part._byStep[at(bar, sib, stepsOf(def, part))] || null;   // the plain loop
    if (this._droppedOut(inst, bar)) return null;   // a remix's dropout bar
    if (sib > 0 && sib < (this.lastStop?.bar === bar ? this.lastStop.len : arr.cut)) return null;
    if (arr.brk && sib >= arr.brk) return null;
    const tex = this.texOf(inst, arr, band, bar, !live);
    if (tex.tf === 'out') return null;
    if (def.role === 'beat' && (arr.roll || (arr.fill && sib >= 12))) return this._beatNotes(part, sib, arr, live);
    this._w = tex.w;
    let tf = tex.tf;
    if (tf === 'groove') tf = this._groove(arr, bar);
    if (inst.remix && (tf.startsWith('g_') || tf.startsWith('f_'))) { tf = 'full'; this._w = 1; }   // a remix keeps its own part, at its own weight
    const n = LV[tf];
    if (n) {
      if (part === def.remix) tf = 'sparse';
      else { part = def.levels[Math.min(inst.level, n) - 1]; tf = 'full'; }
    }
    if (!part?._byStep) return null;
    // A texture with no transform would silence the channel without a word: say so (a sim counts it as an error).
    const fn = TRANSFORMS[tf];
    if (!fn) { this._report(`texture ${tf}`, new Error(`no transform ${tf}`)); return null; }
    const out = fn(part._byStep, stepsOf(def, part), bar, sib) ?? null;
    if (live && out && tf.startsWith('g_')) this.heard.groove += out.length;
    return out;
  }

  // The groove a groove phrase plays (src/music/grooves.js): the arr.groove-th of its band's crossover's or Fusion's
  // list, else of its top style's (the Beat channel's on a tie). Pure, from the band, so a radio edit plays the same
  // groove; read once a bar, so a pick mid-bar changes it on the next.
  _groove(arr, bar) {
    if (this._gBar !== bar) {
      const band = this.getInstruments(), c = emptyCounts();
      for (const i of band) if (i.def.style in c) c[i.def.style]++;
      const beat = band.find((i) => i.def.role === 'beat')?.def.style;
      const top = Object.keys(c).reduce((a, s) => (c[s] > c[a] || (c[s] === c[a] && s === beat) ? s : a));
      this._gList = CROSS_GROOVE[crossoverOf(c)] || STYLE_GROOVE[top];
      this._gBar = bar;
    }
    return 'g_' + this._gList[arr.groove % this._gList.length];
  }

  _play(inst, t, sib, chord, emit, A, arr, band) {
    const def = inst.def;
    const notes = this._notes(inst, arr, this.hold ? this.loopBar : this.bar, sib, band, true);
    if (!notes) return;
    const w = this._w;
    const phrase = arr ? (arr.pb * STEPS_PER_BAR + sib) / (8 * STEPS_PER_BAR) : 0;
    for (const n of notes) {
      const note = this._resolve(inst, n, chord, t, w, phrase);
      if (A) {
        try { def.sound(A.api(), t, note, A.out(def.role), inst); }
        catch (e) { this._report(def.id + '.sound', e); }
      }
      if (emit) this.events.push({ type: 'note', time: t, inst, note });
    }
  }

  // The Beat channel in a fill or roll bar. Both use the part's own fill sound (its snare, clap or rim,
  // else its kick; a remix's own pattern has its own), so every note fires with this level's stats. A fill
  // replaces steps 12-15; a roll plays that sound every `roll` steps over kicks, all bar long.
  _beatNotes(part, sib, arr, live) {
    const k = fillKind(part);
    if (arr.roll) {
      const out = [];
      const kick = arr.kicks && sib % 4 === 0;
      if (kick) out.push({ s: sib, v: 1, k: 'kick' });
      if (sib % arr.roll === 0 && !(kick && k === 'kick')) out.push({ s: sib, v: arr.v0 + ((arr.v1 - arr.v0) * sib) / 15, k });
      return out;
    }
    if (live) this.fillBar = this.bar;
    part._fill ||= FILL_V[k === 'kick' ? 'kick' : 'hit'].map((v, i) => (v ? [{ s: 12 + i, v, k }] : null));
    return part._fill[sib - 12];
  }

  _resolve(inst, n, chord, t, w = 1, phrase = 0) {
    const def = inst.def;
    const oct = 12 * (n.o || 0);
    let midi = null, midis = null;
    if (n.chord) {
      midis = voiceChord(chord, inst.voicing, (def.center ?? 62) + oct, n.chord, !!def.seventh);
      inst.voicing = midis;
      midi = midis[0];
    } else if (n.ct !== undefined) {
      midi = chordTone(chord, n.ct, (def.low ?? 48) + oct, !!def.seventh);
    } else if (n.sc !== undefined) {
      midi = scaleTone(chord, n.sc, (def.low ?? 48) + oct);
      // A held note a half step above a chord tone rubs against the chord: settle it onto the chord tone.
      if ((n.d || 1) >= 2) {
        const pc = ((midi % 12) + 12) % 12;
        if (chord.pcs.slice(0, 3).some((c) => (pc - c + 12) % 12 === 1)) midi -= 1;
      }
    } else if (n.kd !== undefined) {
      midi = keyTone(chord, n.kd, (def.low ?? 48) + oct);   // a tune in key degrees: written as heard, no settling
    }
    const high = def.high ?? ROLE_HIGH[def.role];
    if (high) {
      if (midi != null && !midis) while (midi > high) midi -= 12;
      if (midis) for (let i = 0; i < midis.length; i++) while (midis[i] > high) midis[i] -= 12;
      if (midis) { midis.sort((a, b) => a - b); midi = midis[0]; }
    }
    return {
      time: t,
      s: n.s,
      v: n.v ?? 1,
      k: n.k || null,
      dur: (n.d || 1) * STEP_SEC,
      midi,
      freq: midi != null ? mtof(midi) : 0,
      midis,
      freqs: midis ? midis.map(mtof) : null,
      pc: midi != null ? midi % 12 : -1,
      chord,
      bar: this.bar,
      w,          // damage weight from the arrangement (game.dmg multiplies by it)
      phrase,     // 0..1: where in its 8-bar phrase the note falls
    };
  }

  // Pickup chimes. A collected note ('note') rings a soft bell on the next free 8th, climbing the chord
  // while pickups keep coming and quieter the more of them there are; items and a full Drop meter
  // ('run') play three 16ths up the chord. Timed off the transport and pitched from the chord of their
  // own step, so they stay on the grid and in key. Sound only: the game never waits on them.
  ping(kind) {
    if (!this.running || this.hold || !this._audioOn()) return;
    let i = this.globalStep + Math.ceil((this.clock.now() + 0.03 - this.nextTime) / STEP_SEC);
    if (kind === 'run') {
      for (let k = 0; k < 3; k++) this._chime(i + k, 3 + k, 0.08);
      return;
    }
    i += i & 1;                                    // on the 8th-note grid
    if (i <= this.pingStep) return;                // one chime per 8th
    if (i - this.pingStep > 4) this.pingN = 0;     // a gap of more than a beat starts the climb again
    this.pingStep = i;
    let recent = 0;
    for (const s of this.pingSlots) if ((i - s) * STEP_SEC < 2) recent++;
    this.pingSlots[(i >> 1) & 7] = i;
    this._chime(i, CLIMB[this.pingN++ % CLIMB.length], 0.07 / (1 + recent / 6));
  }

  // One chime on global step i, unless a stop or a break holds the band silent there. A landed stop is
  // matched by bar and step, since a hold inside the stop bar keeps counting global steps but not bars.
  _chime(i, idx, gain) {
    const s = this.pendingStop || this.lastStop;
    const at = this.pendingStop ? Math.ceil(this.globalStep / STEPS_PER_BAR) * STEPS_PER_BAR : this.lastStop?.step;
    const bar = this.bar + Math.floor(i / STEPS_PER_BAR) - Math.floor(Math.max(0, this.globalStep - 1) / STEPS_PER_BAR);
    const sib = i % STEPS_PER_BAR;
    if (this.pendingStop ? i > at && i < at + s.len : s && bar === s.bar && sib > 0 && sib < s.len) return;
    const pos = this.song.position(bar);
    if (pos.arr.brk && sib >= pos.arr.brk) return;
    const chord = s?.home && i === at ? this.song.chord(0, pos.section.lift) : pos.chord;   // the ending's downbeat is on i
    this.audio.ping(this.nextTime + (i - this.globalStep) * STEP_SEC, chimeMidi(chord, idx), gain);
  }

  _report(where, e) {
    if (this._errors.has(where)) return;
    this._errors.add(where);
    console.error(`[sequencer] ${where} failed:`, e);
  }

  // Events whose time has come (time <= now). Returned in schedule order.
  drain(now, out) {
    const ev = this.events;
    let i = 0;
    while (i < ev.length && ev[i].time <= now) out.push(ev[i++]);
    if (i) ev.splice(0, i);
    return out;
  }

  clearEvents() { this.events.length = 0; }

  // Step within the bar that is sounding right now, for the on-screen playhead.
  sounding(now) {
    let cur = null;
    for (const s of this.stepLog) { if (s.time <= now) cur = s; else break; }
    return cur;
  }
}
