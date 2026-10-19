// Browser-side audio checker. Renders instruments offline through the real sequencer and (for mix
// checks) the real mixing desk, then measures level, clipping and where the energy sits in the spectrum.
// The note audit and the replay check need no audio and also run in Node.
// Loaded by tools/check.mjs; can also be imported from the dev console.

import { BY_ID, INSTRUMENTS } from '../src/content/instruments/index.js';
import * as V from '../src/audio/voices.js';
import { Song, SECTIONS } from '../src/music/song.js';
import { Sequencer, chimeMidi } from '../src/music/sequencer.js';
import { radioEdit, playSheet } from '../src/music/replay.js';
import { KEYS, NATURAL_MINOR, HARMONIC_MINOR } from '../src/music/theory.js';
import { STEP_SEC, BAR_SEC, ROLE_HIGH } from '../src/config.js';
import { rng, seedRng } from '../src/util.js';
import { bossCue } from '../src/game/bosscues.js';
import { makeInst } from '../src/game/loadout.js';
import { AudioEngine } from '../src/audio/engine.js';

const SR = 44100;

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

function analyze(buf) {
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  let peak = 0, sum = 0, nan = 0, clip = 0;
  for (let i = 0; i < L.length; i++) {
    const m = (L[i] + R[i]) * 0.5;
    if (!Number.isFinite(L[i]) || !Number.isFinite(R[i])) { nan++; continue; }
    const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    if (a > peak) peak = a;
    if (a >= 0.999) clip++;
    sum += m * m;
  }
  const rms = Math.sqrt(sum / L.length);
  // Average magnitude spectrum over 4096-sample windows.
  const N = 4096;
  const mag = new Float64Array(N / 2);
  let windows = 0;
  for (let off = 0; off + N <= L.length; off += N) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = ((L[off + i] + R[off + i]) * 0.5) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
    fft(re, im);
    for (let k = 0; k < N / 2; k++) mag[k] += Math.hypot(re[k], im[k]);
    windows++;
  }
  const bands = { sub: [20, 90], low: [90, 250], mid: [250, 1000], high: [1000, 4000], air: [4000, 16000] };
  const energy = {};
  let total = 0, cen = 0;
  for (let k = 1; k < N / 2; k++) {
    const f = (k * SR) / N;
    const e = mag[k] * mag[k];
    total += e; cen += f * e;
  }
  for (const b in bands) {
    let e = 0;
    for (let k = 1; k < N / 2; k++) { const f = (k * SR) / N; if (f >= bands[b][0] && f < bands[b][1]) e += mag[k] * mag[k]; }
    energy[b] = total ? Math.round((e / total) * 100) : 0;
  }
  return {
    peak: +peak.toFixed(3), rmsDb: rms > 0 ? +(20 * Math.log10(rms)).toFixed(1) : -120, nan, clipSamples: clip,
    centroidHz: total ? Math.round(cen / total) : 0, bandsPct: energy, silent: peak < 0.01, windows,
  };
}

// Schedule `bars` bars of the given instruments through a Sequencer into an offline context.
// each(t, dt) runs on every tick (simulated pickups).
function scheduleBars(seq, clock, bars, each) {
  const end = bars * BAR_SEC;
  for (let t = 0; t <= end; t += 0.05) { clock.t = t; each?.(t, 0.05); seq.tick(); }
}

// A note is in key when its pitch class is in its section's (lifted) minor key: harmonic minor on a V chord.
function inKey(song, n, m) {
  const kp = song.keyPc + (song.position(n.bar).section.lift || 0);
  return (n.chord.harm ? HARMONIC_MINOR : NATURAL_MINOR).includes((((m - kp) % 12) + 12) % 12);
}
const onGrid = (time, t0) => { const k = (time - t0) / STEP_SEC; return Math.abs(k - Math.round(k)) < 1e-6; };
const pitches = (n) => n.midis || (n.midi != null ? [n.midi] : []);

// One instrument at one level, raw (before the channel fader), as it arrives at its channel input.
export async function checkInstrument(id, level, { bars = 4, keyPc = 9 } = {}) {
  const def = BY_ID[id];
  if (!def) return { id, error: 'unknown instrument' };
  const ctx = new OfflineAudioContext(2, Math.floor(SR * (bars * 2 + 1.5)), SR);
  const out = ctx.createGain();
  out.connect(ctx.destination);
  const api = { ctx, v: V, duck: () => {}, pedals: {} };
  const errors = [];
  const fake = {
    ready: true, api: () => api, out: () => out,
    crash() {}, riser() {}, snareRoll() {}, buildSweep() {}, impact() {},
  };
  const clock = { sim: false, t: 0, now() { return this.t; } };
  const seq = new Sequencer(clock, fake);
  seq._report = (w, e) => errors.push(`${w}: ${e && e.message}`);
  seq.reset(new Song(keyPc));
  const inst = makeInst(def, level);
  seq.getInstruments = () => [inst];
  seq.start(0.02);
  scheduleBars(seq, clock, bars);
  const notes = seq.events.filter((e) => e.type === 'note');
  const midis = notes.map((e) => e.note.midi).filter((m) => m != null);
  const buf = await ctx.startRendering();
  const a = analyze(buf);
  return {
    id, level, notes: notes.length, midiRange: midis.length ? [Math.min(...midis), Math.max(...midis)] : null,
    chordNotes: notes.find((e) => e.note.midis) ? notes.find((e) => e.note.midis).note.midis : null,
    errors, ...a,
  };
}

// Full band through the real mixing desk (faders, pan, ducking, returns, compressor, limiter), with the
// song's arrangement. Options:
//   start    song bar to begin at; a lead-in bar is rendered first so a section's first bar gets its
//            crash and riser (perBar lists the lead-in too)
//   boss     play that boss's cues (drone | clipper | glitchking | whitenoise) as if alive at frac health
//   stopAt   a boss goes down so bar stopAt is stop-time; ending: the final boss, so it is the song's ending
//   pickups  collected notes per second, chiming through seq.ping, plus a 3-note run every 4 bars
// Returns the whole render's analysis, per-bar RMS and peak, and the scheduled notes' key and grid counts.
export async function checkMix(ids, { level = 5, bars = 8, keyPc = 9, pedals = {}, start = 0, boss = null, frac = 1, stopAt = null, ending = false, pickups = 0 } = {}) {
  // Seeded noise (this page only checks), so two renders differ only by what an option adds.
  seedRng(7);
  Math.random = rng;
  const lead = start > 0 ? 1 : 0;
  const ctx = new OfflineAudioContext(2, Math.floor(SR * ((bars + lead) * BAR_SEC + 2)), SR);
  const eng = new AudioEngine();
  eng.attach(ctx);
  eng.applyPedals(pedals);
  eng.setActiveCount(ids.length);
  const errors = [];
  const clock = { sim: false, t: 0, now() { return this.t; } };
  const seq = new Sequencer(clock, eng);
  seq._report = (w, e) => errors.push(`${w}: ${e && e.message}`);
  const song = new Song(keyPc);
  seq.reset(song);
  seq.bar = start - lead;
  const insts = ids.map((id) => makeInst(BY_ID[id], typeof level === 'number' ? level : level[id] || 1)).filter((i) => i.def);
  seq.getInstruments = () => insts;
  if (boss) {
    const e = { type: boss, hp: frac, maxHp: 1, spawnT: 0, ai: { blinkTo: {} } };
    seq.getBossCues = (bar, beat) => { const c = bossCue(e, bar, beat); return c ? [c] : []; };
  }
  if (stopAt !== null) seq.onBar = (bar) => { if (bar === stopAt) seq.stopNext(ending ? 16 : 8, ending); };
  let due = 0, runs = 0;
  const each = pickups ? (t, dt) => {
    for (due += pickups * dt; due >= 1; due--) seq.ping('note');
    if (t >= runs * 4 * BAR_SEC) { runs++; seq.ping('run'); }
  } : null;
  seq.start(0.02);
  scheduleBars(seq, clock, bars + lead, each);
  const notes = seq.events.filter((e) => e.type === 'note');
  let offGrid = 0, outOfKey = 0;
  for (const { note } of notes) {
    if (!onGrid(note.time, 0.02)) offGrid++;
    for (const m of pitches(note)) if (!inKey(song, note, m)) outOfKey++;
  }
  const buf = await ctx.startRendering();
  const perBar = [];
  const L = buf.getChannelData(0), R = buf.getChannelData(1), len = Math.floor(BAR_SEC * SR);
  for (let b = 0; b < bars + lead; b++) {
    const bar = start - lead + b, pos = song.position(bar), off = Math.floor((0.02 + b * BAR_SEC) * SR);
    let sum = 0, peak = 0, clip = 0, d = 0, prev = 0;
    for (let i = off; i < off + len && i < L.length; i++) {
      const m = (L[i] + R[i]) * 0.5;
      const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
      sum += m * m; d += (m - prev) * (m - prev); prev = m;
      if (a > peak) peak = a;
      if (a >= 0.999) clip++;
    }
    const own = notes.filter((e) => e.note.bar === bar);
    perBar.push({
      bar, section: pos.section.id, barInSection: pos.barInSection, chord: (own[0]?.note.chord || pos.chord).name,   // the chord played (the ending's is i)
      notes: own.length,
      rmsDb: +(10 * Math.log10(sum / len + 1e-12)).toFixed(1), peak: +peak.toFixed(3), clip,
      brightHz: sum ? Math.round((Math.sqrt(d / sum) * SR) / (2 * Math.PI)) : 0,   // RMS-frequency estimate
    });
  }
  return { ids, level, errors, ...analyze(buf), notes: notes.length, offGrid, outOfKey, perBar };
}

// Whole-song note audit, no audio. Every key x instrument x level through the song's first `bars` bars
// (fills, the breakdown, the roll, the lifted Finale, a stop-time bar and the ending), then through a
// radio edit of every section; plus every pickup chime pitch. Counts what must stay 0: notes out of key,
// off the 16th grid, above the channel's ceiling (ROLE_HIGH), Beat fills and rolls on a sound the level
// does not play (foreignKind), and notes in a bar or step the arrangement or a stop silences (leaks).
export function auditSong({ bars = 240 } = {}) {
  const r = { runs: 0, notes: 0, chimes: 0, outOfKey: 0, offGrid: 0, aboveCeiling: 0, foreignKind: 0, leaks: 0, fillNotes: 0, rollNotes: 0, restBars: 0, stopBars: 0 };
  const edit = radioEdit(SECTIONS.map((s, index) => ({ index })));
  const editBars = edit.slice(0, -1).reduce((n, s) => n + s.bars, 0) + 2;   // and two bars of outro
  const stops = { [bars >> 1]: [8, false], [bars - 1]: [16, true] };
  for (const key of KEYS) {
    const song = new Song(key.pc);
    for (const def of INSTRUMENTS) {
      for (let lv = 1; lv <= def.levels.length; lv++) {
        auditRun(r, song, def, lv, bars, stops);
        auditRun(r, new Song(key.pc, edit), def, lv, editBars, {});
      }
    }
    for (let b = 0; b < bars; b++) {
      const chord = song.position(b).chord;
      for (let idx = 0; idx < 6; idx++) {
        const m = chimeMidi(chord, idx);
        r.chimes++;
        if (!inKey(song, { bar: b, chord }, m)) r.outOfKey++;
        if (m > ROLE_HIGH.arp) r.aboveCeiling++;
      }
    }
  }
  return r;
}

function auditRun(r, song, def, lv, bars, stops) {
  const clock = { sim: true, t: 0, now() { return this.t; } };
  const seq = new Sequencer(clock, null);
  seq.reset(song);
  const inst = makeInst(def, lv);
  seq.getInstruments = () => [inst];
  seq.onBar = (bar) => {
    if (stops[bar]) { seq.stopNext(...stops[bar]); r.stopBars++; }
    if (song.position(bar).arr.rest.includes(def.role)) r.restBars++;
  };
  seq.start(0);
  r.runs++;
  const own = new Set(def.levels[lv - 1].pattern.map((n) => n.k || null));
  const high = ROLE_HIGH[def.role];
  for (let t = 0; t < bars * BAR_SEC; t += 0.1) {
    clock.t = t;
    seq.tick();
    for (const ev of seq.events) {
      if (ev.type !== 'note') continue;
      const n = ev.note, pos = song.position(n.bar), sib = Math.round(n.time / STEP_SEC) % 16;
      r.notes++;
      if (!onGrid(n.time, 0)) r.offGrid++;
      for (const m of pitches(n)) {
        if (!inKey(song, n, m)) r.outOfKey++;
        if (high && m > high) r.aboveCeiling++;
      }
      if (pos.arr.rest.includes(def.role) || (sib > 0 && sib < (stops[n.bar]?.[0] || pos.arr.cut))) r.leaks++;
      if (def.role === 'beat') {
        if (!own.has(n.k)) r.foreignKind++;
        if (pos.arr.roll) r.rollNotes++;
        else if (pos.arr.fill && sib >= 12) r.fillNotes++;
      }
    }
    seq.events.length = 0;
  }
}

// Plays a track sheet (Game.summary().sheet) through playSheet on a simulated clock with a stub desk.
// Checks that every section starts in order with its own band (all of it, and no sound from another
// entry), every note is in key and on the grid, the outro plays one downbeat and the edit then ends by
// itself, and that stop() (at the end, and when pressed part way through) leaves the sequencer clean.
export function checkReplay(sheet, keyPc) {
  const errors = [];
  const run = (stopAfter) => {
    const clock = { sim: true, t: 0, now() { return this.t; } };
    const seq = new Sequencer(clock, null);
    seq._report = (w, e) => errors.push(`${w}: ${e && e.message}`);
    const desk = { pedalSets: 0, applyPedals() { this.pedalSets++; }, setActiveCount() {} };
    const sections = [];
    let ended = 0, notes = 0, outOfKey = 0, offGrid = 0, wrongBand = 0, outroNotes = 0, outroLeaks = 0;
    const player = playSheet({ seq, audio: desk, sheet, keyPc, onEnd: () => ended++,
      onSection: (name, size) => { if (size !== sheet[sections.length].band.length) wrongBand++; sections.push(`${name}:${size}`); } });
    const song = seq.song, t0 = seq.nextTime;
    let t = 0;
    for (; t < 200 && t < stopAfter && seq.running; t += 0.05) {
      clock.t = t;
      seq.tick();
      for (const ev of seq.events) {
        if (ev.type !== 'note') continue;
        const n = ev.note, pos = song.position(n.bar);
        notes++;
        if (!onGrid(n.time, t0)) offGrid++;
        for (const m of pitches(n)) if (!inKey(song, n, m)) outOfKey++;
        if (pos.section.end) {
          outroNotes++;
          if (pos.barInSection > 0 || Math.round((n.time - t0) / STEP_SEC) % 16) outroLeaks++;   // only the outro's first downbeat sounds
        }
        if (!sheet[pos.section.end ? sheet.length - 1 : pos.index].band.some(([id]) => id === ev.inst.def.id)) wrongBand++;
      }
      seq.events.length = 0;
    }
    if (seq.running) player.stop();
    const clean = !seq.running && seq.onBar === null && seq.getInstruments().length === 0 && seq.events.length === 0;
    return { seconds: +t.toFixed(2), bars: seq.bar, sections: sections.length, playing: sections.join(' · '), pedalSets: desk.pedalSets, notes, outroNotes, outroLeaks, outOfKey, offGrid, wrongBand, ended, clean };
  };
  return { full: run(Infinity), stoppedEarly: run(9), errors };
}

export async function checkAll({ roles = null, bars = 4 } = {}) {
  const out = [];
  for (const def of INSTRUMENTS) {
    if (roles && !roles.includes(def.role)) continue;
    for (let lv = 1; lv <= def.levels.length; lv++) out.push(await checkInstrument(def.id, lv, { bars }));
  }
  return out;
}
