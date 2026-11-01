// Browser-side audio checker. Renders instruments offline through the real sequencer and (for mix
// checks) the real mixing desk, then measures level, clipping and where the energy sits in the spectrum.
// The note audit and the replay check need no audio and also run in Node.
// Loaded by tools/check.mjs; can also be imported from the dev console.

import { BY_ID, INSTRUMENTS } from '../src/content/instruments/index.js';
import * as V from '../src/audio/voices.js';
import { Song, SECTIONS, FINALE_BAR, CHART, ENERGY_BANDS } from '../src/music/song.js';
import { Sequencer, chimeMidi, TRANSFORMS, TEXTURE_NAMES, partOf, stepsOf } from '../src/music/sequencer.js';
import { radioEdit, playSheet } from '../src/music/replay.js';
import { KEYS, NATURAL_MINOR, HARMONIC_MINOR } from '../src/music/theory.js';
import { STEP_SEC, BAR_SEC, ROLE_HIGH, ROLES, STEPS_PER_BAR } from '../src/config.js';
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
//   remix    play every instrument remixed, with its remix pedal at full on its own strip
//   start    song bar to begin at; a lead-in bar is rendered first so a section's first bar gets its
//            crash and riser (perBar lists the lead-in too)
//   boss     play that boss's cues (drone | clipper | glitchking | whitenoise) as if alive at frac health
//   stopAt   a boss goes down so bar stopAt is stop-time; ending: the final boss, so it is the song's ending
//   pickups  collected notes per second, chiming through seq.ping, plus a 3-note run every 4 bars
// Returns the whole render's analysis, per-bar RMS and peak, and the scheduled notes' key and grid counts.
export async function checkMix(ids, { level = 5, bars = 8, keyPc = 9, pedals = {}, remix = false, start = 0, boss = null, frac = 1, stopAt = null, ending = false, pickups = 0 } = {}) {
  // Seeded noise (this page only checks), so two renders differ only by what an option adds.
  seedRng(7);
  Math.random = rng;
  const lead = start > 0 ? 1 : 0;
  const ctx = new OfflineAudioContext(2, Math.floor(SR * ((bars + lead) * BAR_SEC + 2)), SR);
  const eng = new AudioEngine();
  eng.attach(ctx);
  const boost = remix ? Object.fromEntries(ids.map((id) => BY_ID[id]).filter((d) => d?.remix).map((d) => [d.role, d.remix.pedal])) : {};
  eng.applyPedals(pedals, boost);
  eng.setActiveCount(ids.length);
  const errors = [];
  const clock = { sim: false, t: 0, now() { return this.t; } };
  const seq = new Sequencer(clock, eng);
  seq._report = (w, e) => errors.push(`${w}: ${e && e.message}`);
  const song = new Song(keyPc);
  seq.reset(song);
  seq.bar = start - lead;
  const insts = ids.map((id) => makeInst(BY_ID[id], typeof level === 'number' ? level : level[id] || 1)).filter((i) => i.def);
  for (const i of insts) i.remix = !!(remix && i.def.remix);
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
      // The arrangement: phrase letter and bar in it (a1..a8), its class, and what the bar does.
      phrase: String.fromCharCode(97 + pos.arr.phrase) + (pos.arr.pb + 1), cls: pos.arr.cls,
      cue: [pos.arr.impact && 'impact', pos.arr.brk && 'break', pos.arr.fill && 'fill', pos.arr.roll && 'roll'].filter(Boolean).join(' '),
      notes: own.length,
      rmsDb: +(10 * Math.log10(sum / len + 1e-12)).toFixed(1), peak: +peak.toFixed(3), clip,
      brightHz: sum ? Math.round((Math.sqrt(d / sum) * SR) / (2 * Math.PI)) : 0,   // RMS-frequency estimate
    });
  }
  return { ids, level, remix, errors, ...analyze(buf), notes: notes.length, offGrid, outOfKey, perBar };
}

// Whole-song note audit, no audio. Every key x instrument x level through the song's first `bars` bars
// (fills, the textures of every phrase, the breaks, the breakdowns, the solos, the roll, the lifted
// Finale, a stop-time bar and the ending): once alone (a small band, where 'out' plays 'sparse') and once
// in a band of six (where it is tacet), and every remix the same way; then through a radio edit of every
// section; then every transform on every part (each level's and each remix's own pattern), with every
// pickup chime pitch. Counts what must stay 0: notes out of key, off the 16th grid (or with a step or
// length off the pattern's grid), above the channel's ceiling (ROLE_HIGH), a sound the part does not play
// (foreignKind: Beat fills and rolls, transforms), and notes in a bar or step the arrangement or a stop
// silences (leaks: tacet channels, the break before a breakdown, cuts and stops).
export function auditSong({ bars = FINALE_BAR + 32 } = {}) {
  const r = { runs: 0, notes: 0, chimes: 0, outOfKey: 0, offGrid: 0, aboveCeiling: 0, foreignKind: 0, leaks: 0, fillNotes: 0, rollNotes: 0, restBars: 0, stopBars: 0, breakBars: 0,
    soloBars: 0, remixRuns: 0, tfNotes: 0, transforms: Object.keys(TRANSFORMS).length };
  const edit = radioEdit(SECTIONS.map((s, index) => ({ index })));
  const editBars = edit.slice(0, -1).reduce((n, s) => n + s.bars, 0) + 2;   // and two bars of outro
  const stops = { [bars >> 1]: [8, false], [bars - 1]: [16, true] };
  for (const key of KEYS) {
    const song = new Song(key.pc);
    for (const def of INSTRUMENTS) {
      for (let lv = 1; lv <= def.levels.length; lv++) {
        auditRun(r, song, def, lv, bars, stops);
        auditRun(r, song, def, lv, bars, stops, { band: 6 });
        auditRun(r, new Song(key.pc, edit), def, lv, editBars, {});
      }
      if (def.remix) {
        auditRun(r, song, def, def.levels.length, bars, stops, { band: 6, remix: true });
        auditRun(r, new Song(key.pc, edit), def, def.levels.length, editBars, {}, { remix: true });
        r.remixRuns += 2;
      }
    }
    auditTransforms(r, song, bars);
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

// Silent stand-ins that make a band of `band` channels around the one under test (so 'out' is tacet).
const GHOST = { id: 'ghost', role: 'ghost', levels: [], sound() {}, fire() {} };
const ghosts = (n) => Array.from({ length: Math.max(0, n) }, () => ({ def: GHOST, level: 0 }));

function auditRun(r, song, def, lv, bars, stops, { band = 1, remix = false } = {}) {
  const clock = { sim: true, t: 0, now() { return this.t; } };
  const seq = new Sequencer(clock, null);
  seq.reset(song);
  const inst = makeInst(def, lv);
  inst.remix = remix;
  const insts = [inst, ...ghosts(band - 1)];
  seq.getInstruments = () => insts;
  seq.onBar = (bar) => {
    if (stops[bar]) { seq.stopNext(...stops[bar]); r.stopBars++; }
    const arr = song.position(bar).arr;
    if (arr.rest.includes(def.role)) r.restBars++;
    if (arr.brk) r.breakBars++;
    if (arr.solo) r.soloBars++;
  };
  seq.start(0);
  r.runs++;
  const part = partOf(inst);
  const own = new Set(part.pattern.map((n) => n.k || null));
  const high = ROLE_HIGH[def.role];
  for (let t = 0; t < bars * BAR_SEC; t += 0.1) {
    clock.t = t;
    seq.tick();
    for (const ev of seq.events) {
      if (ev.type !== 'note') continue;
      const n = ev.note, pos = song.position(n.bar), arr = pos.arr, sib = Math.round(n.time / STEP_SEC) % 16;
      r.notes++;
      if (!onGrid(n.time, 0) || !Number.isInteger(n.s) || n.s < 0 || n.s >= stepsOf(def, part)) r.offGrid++;
      for (const m of pitches(n)) {
        if (!inKey(song, n, m)) r.outOfKey++;
        if (high && m > high) r.aboveCeiling++;
      }
      // Tacet: the chart has the channel out, the band is bigger than 3, it is not remixed and does not hold the solo.
      const tacet = arr.tex?.[def.role]?.tf === 'out' && insts.length > 3 && !inst.remix && !(arr.solo && seq.featured?.role === def.role);
      if (tacet || (arr.brk && sib >= arr.brk) || (sib > 0 && sib < (stops[n.bar]?.[0] || arr.cut))) r.leaks++;
      if (!own.has(n.k)) r.foreignKind++;
      if (def.role === 'beat') {
        if (arr.roll) r.rollNotes++;
        else if (arr.fill && sib >= 12) r.fillNotes++;
      }
    }
    seq.events.length = 0;
  }
}

// Every transform on every part (each level's, and a remix's own pattern) over bars spread across the song
// (every chord of every section, both halves of 2-bar parts, the lifted Finale), resolved through the
// sequencer: in key, under the ceiling, a sound the part plays, the step it sounds on, a whole length.
// 'out' must give nothing.
function auditTransforms(r, song, bars) {
  const seq = new Sequencer({ sim: true, now: () => 0 }, null);
  seq.reset(song);
  for (const def of INSTRUMENTS) {
    const insts = def.levels.map((lv, i) => makeInst(def, i + 1));
    if (def.remix?.pattern?.length) { const i = makeInst(def, def.levels.length); i.remix = true; insts.push(i); }
    const high = ROLE_HIGH[def.role];
    for (const inst of insts) {
      const part = partOf(inst), P = stepsOf(def, part);
      const own = new Set(part.pattern.map((n) => n.k || null));
      for (const tf in TRANSFORMS) {
        for (let bar = 0; bar < bars; bar += 7) {
          const pos = song.position(bar);
          seq.bar = bar;
          for (let sib = 0; sib < STEPS_PER_BAR; sib++) {
            for (const n of TRANSFORMS[tf](part._byStep, P, bar, sib) || []) {
              r.tfNotes++;
              if (tf === 'out') r.leaks++;
              if (n.s !== (bar * STEPS_PER_BAR + sib) % P || !Number.isInteger(n.d ?? 1) || (n.d ?? 1) < 1) r.offGrid++;
              if (!own.has(n.k || null)) r.foreignKind++;
              const res = seq._resolve(inst, n, pos.chord, 0);
              for (const m of pitches(res)) {
                if (!inKey(song, res, m)) r.outOfKey++;
                if (high && m > high) r.aboveCeiling++;
              }
            }
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------- the arrangement check

// The standard level 5 bands: one per style that has all six roles, and a mixed band.
export function standardBands() {
  const out = {};
  for (const st of new Set(INSTRUMENTS.map((d) => d.style))) {
    const defs = ROLES.map((r) => INSTRUMENTS.find((d) => d.role === r && d.style === st));
    if (defs.every(Boolean)) out[st] = defs;
  }
  out.mixed = ROLES.map((r, i) => INSTRUMENTS.filter((d) => d.role === r)[i % 3]).filter(Boolean);
  return out;
}

// One level 5 band through the song on a simulated clock. Per bar and role: notes and their damage
// weight (v x w), and notes where the arrangement has the channel tacet or broken off (leaks).
function bandRun(defs, bars, featuredRole = null) {
  const clock = { sim: true, t: 0, now() { return this.t; } };
  const seq = new Sequencer(clock, null);
  const song = new Song(9);
  seq.reset(song);
  const insts = defs.map((d) => makeInst(d, 5));
  seq.getInstruments = () => insts;
  if (featuredRole) seq.getFeatured = () => insts.find((i) => i.def.role === featuredRole);
  seq.start(0);
  const per = [];
  for (let t = 0; t < bars * BAR_SEC; t += 0.1) {
    clock.t = t;
    seq.tick();
    for (const ev of seq.events) {
      if (ev.type !== 'note' || ev.note.bar >= bars) continue;
      const n = ev.note, role = ev.inst.def.role, b = (per[n.bar] ||= { n: {}, vw: {}, steps: new Float64Array(ROLES.length * 16), leaks: 0 });
      const arr = song.position(n.bar).arr, sib = Math.round(n.time / STEP_SEC) % 16;
      b.n[role] = (b.n[role] || 0) + 1;
      b.vw[role] = (b.vw[role] || 0) + n.v * n.w;
      b.steps[ROLES.indexOf(role) * 16 + sib] += n.v * n.w;
      if ((arr.tex[role].tf === 'out' && !(arr.solo && seq.featured?.role === role)) || (arr.brk && sib >= arr.brk)) b.leaks++;
    }
    seq.events.length = 0;
  }
  return per;
}

// Velocity of a level 5 part's plain loop in one bar.
function fullBar(def, bar) {
  const lv = def.levels[def.levels.length - 1], P = def.steps || STEPS_PER_BAR;
  let v = 0;
  for (let sib = 0; sib < STEPS_PER_BAR; sib++) for (const n of TRANSFORMS.full(lv._byStep, P, bar, sib) || []) v += n.v ?? 1;
  return v;
}

const isAllFull = (ph) => !ph.solo && ROLES.every((r) => ph.tex[r].tf === 'full' && ph.tex[r].w === 1);

// node tools/check.mjs --arrange. Per phrase of the song (two passes of the Finale): the channels playing,
// notes per bar, and the DPS ratio (the band's weighted notes against its plain level 5 loop, averaged
// over the six channels, equal parity assumed) over the standard level 5 bands, with each solo phrase
// also played with every channel featured. Failures: more than 2 all-full phrases in a row from Chorus II
// on (never a wall), a phrase's ratio outside its class band or drifted from its declared energy, two
// sections in a row with the same texture, and any note from a tacet channel or after a break.
export function arrangeReport({ cycles = 2 } = {}) {
  const finale = CHART.finale.length * 8;
  const bars = FINALE_BAR + cycles * finale;
  const bands = standardBands();
  const runs = {};
  for (const [name, defs] of Object.entries(bands)) {
    runs[name] = { defs, main: bandRun(defs, bars), solo: ROLES.map((r) => bandRun(defs, bars, r)) };
  }
  // The phrases in song order.
  const phrases = [];
  let start = 0;
  for (const s of SECTIONS) {
    const n = s.bars === Infinity ? cycles * CHART.finale.length : s.bars / 8;
    for (let p = 0; p < n; p++) phrases.push({ sec: s, p, start: start + p * 8, ph: CHART[s.id][p % CHART[s.id].length] });
    if (s.bars !== Infinity) start += s.bars;
  }
  const failures = [];
  const ratioOf = (per, defs, b0) => {
    let sum = 0;
    for (const d of defs) {
      let vw = 0, vf = 0;
      for (let b = b0; b < b0 + 8; b++) { vw += per[b]?.vw[d.role] || 0; vf += fullBar(d, b); }
      sum += vf ? vw / vf : 0;
    }
    return sum / defs.length;
  };
  const rows = phrases.map(({ sec, p, start: b0, ph }) => {
    const ratios = [], all = [], notes = [], playing = [];
    let leaks = 0;
    for (const { defs, main, solo } of Object.values(runs)) {
      const rt = ratioOf(main, defs, b0);
      ratios.push(rt); all.push(rt);
      if (ph.solo) for (const sr of solo) all.push(ratioOf(sr, defs, b0));
      let n = 0;
      const roles = new Set();
      for (let b = b0; b < b0 + 8; b++) {
        const x = main[b];
        if (!x) continue;
        leaks += x.leaks;
        for (const r in x.n) { n += x.n[r]; roles.add(r); }
      }
      for (const sr of ph.solo ? solo : []) for (let b = b0; b < b0 + 8; b++) leaks += sr[b]?.leaks || 0;
      notes.push(n / 8);
      playing.push(roles.size);
    }
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const [lo, hi] = ENERGY_BANDS[ph.cls];
    const name = `${sec.id}.${String.fromCharCode(97 + p)}`;
    const bad = [];
    if (mean < lo || mean > hi || Math.min(...all) < lo - 0.05 || Math.max(...all) > hi + 0.05) bad.push(`${ph.cls} band ${lo}-${hi}`);
    if (Math.abs(mean - ph.e) > 0.06) bad.push(`declared energy ${ph.e}, measured ${mean.toFixed(2)}`);
    if (leaks) bad.push(`${leaks} notes from tacet or broken-off channels`);
    for (const b of bad) failures.push(`${name}: ${b}`);
    const pos = new Song(9).position(b0);
    return { name, bar: b0, time: b0 * BAR_SEC, cls: ph.cls, e: ph.e, mean, min: Math.min(...all), max: Math.max(...all), notes, playing, leaks,
      impact: pos.arr.impact, brk: b0 > 0 && new Song(9).position(b0 - 1).arr.brk > 0, spec: ph.spec || 'full', bad };
  });
  // Never a wall: from Chorus II on, at most 2 all-full phrases in a row.
  let run = 0;
  const from = phrases.findIndex((x) => x.sec.id === 'chorus2');
  phrases.forEach((x, i) => {
    run = isAllFull(x.ph) ? run + 1 : 0;
    if (i >= from && run > 2) failures.push(`${rows[i].name}: ${run} all-full phrases in a row`);
  });
  // Every section has its own texture.
  const sig = (id) => CHART[id].map((ph) => `${ph.cls}:${ph.spec}:${ph.impact}`).join('|');
  for (let i = 1; i < SECTIONS.length; i++) {
    if (sig(SECTIONS[i].id) === sig(SECTIONS[i - 1].id)) failures.push(`${SECTIONS[i - 1].id} and ${SECTIONS[i].id} have the same texture`);
  }
  // How alike the late sections sound: cosine of the weighted notes per channel and step of the bar, over
  // the section (1.00 = the same texture; it was 1.00 for all three before the chart).
  const vec = (defs, per, b0, n) => {
    const v = new Float64Array(ROLES.length * 16);
    for (let b = b0; b < b0 + n; b++) if (per[b]) for (let i = 0; i < v.length; i++) v[i] += per[b].steps[i];
    return v;
  };
  const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] ** 2; y += b[i] ** 2; } return d / Math.sqrt(x * y || 1); };
  const startOf = (id) => phrases.find((x) => x.sec.id === id).start;
  const similar = {};
  for (const [name, { defs, main }] of Object.entries(runs)) {
    const v = { chorus2: vec(defs, main, startOf('chorus2'), 32), drop: vec(defs, main, startOf('drop'), 32), finale: vec(defs, main, startOf('finale'), finale) };
    similar[name] = { 'chorus2~drop': cos(v.chorus2, v.drop), 'chorus2~finale': cos(v.chorus2, v.finale), 'drop~finale': cos(v.drop, v.finale) };
  }
  return { bands: Object.keys(bands), rows, failures, similar };
}

// Plays a track sheet (Game.summary().sheet) through playSheet on a simulated clock with a stub desk.
// Checks that every section starts in order with its own band (all of it, and no sound from another
// entry), every note is in key and on the grid, the outro plays one downbeat on i in the last section's
// key (a won run ends lifted) and the edit then ends by itself, and that stop() (at the end, and when
// pressed part way through) leaves the sequencer clean.
export function checkReplay(sheet, keyPc) {
  const errors = [];
  const run = (stopAfter) => {
    const clock = { sim: true, t: 0, now() { return this.t; } };
    const seq = new Sequencer(clock, null);
    seq._report = (w, e) => errors.push(`${w}: ${e && e.message}`);
    const desk = { pedalSets: 0, applyPedals() { this.pedalSets++; }, setActiveCount() {} };
    const sections = [];
    let ended = 0, notes = 0, outOfKey = 0, offGrid = 0, wrongBand = 0, outroNotes = 0, outroLeaks = 0, outroUnlifted = 0;
    const player = playSheet({ seq, audio: desk, sheet, keyPc, onEnd: () => ended++,
      onSection: (name, size) => { if (size !== sheet[sections.length].band.length) wrongBand++; sections.push(`${name}:${size}`); } });
    const song = seq.song, t0 = seq.nextTime;
    const home = (song.keyPc + (SECTIONS[sheet[sheet.length - 1].index].lift || 0)) % 12;
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
          if (n.chord.rootPc !== home) outroUnlifted++;
        }
        if (!sheet[pos.section.end ? sheet.length - 1 : pos.index].band.some(([id]) => id === ev.inst.def.id)) wrongBand++;
      }
      seq.events.length = 0;
    }
    if (seq.running) player.stop();
    const clean = !seq.running && seq.onBar === null && seq.getInstruments().length === 0 && seq.events.length === 0;
    return { seconds: +t.toFixed(2), bars: seq.bar, sections: sections.length, playing: sections.join(' · '), pedalSets: desk.pedalSets, notes, outroNotes, outroLeaks, outroUnlifted, outOfKey, offGrid, wrongBand, ended, clean };
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
