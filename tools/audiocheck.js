// Browser-side audio checker. Renders instruments offline through the real sequencer and (for mix
// checks) the real mixing desk, then measures level, clipping and where the energy sits in the spectrum.
// Loaded by tools/check.mjs; can also be imported from the dev console.

import { BY_ID, INSTRUMENTS } from '../src/content/instruments/index.js';
import * as V from '../src/audio/voices.js';
import { Song } from '../src/music/song.js';
import { Sequencer } from '../src/music/sequencer.js';
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
function scheduleBars(seq, clock, bars) {
  const end = bars * 2;
  for (let t = 0; t <= end; t += 0.05) { clock.t = t; seq.tick(); }
}

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

// Full band through the real mixing desk (faders, pan, ducking, returns, compressor, limiter).
export async function checkMix(ids, { level = 5, bars = 8, keyPc = 9, pedals = {} } = {}) {
  const ctx = new OfflineAudioContext(2, Math.floor(SR * (bars * 2 + 2)), SR);
  const eng = new AudioEngine();
  eng.attach(ctx);
  eng.applyPedals(pedals);
  eng.setActiveCount(ids.length);
  const errors = [];
  const clock = { sim: false, t: 0, now() { return this.t; } };
  const seq = new Sequencer(clock, eng);
  seq._report = (w, e) => errors.push(`${w}: ${e && e.message}`);
  seq.reset(new Song(keyPc));
  const insts = ids.map((id) => makeInst(BY_ID[id], typeof level === 'number' ? level : level[id] || 1)).filter((i) => i.def);
  seq.getInstruments = () => insts;
  seq.start(0.02);
  scheduleBars(seq, clock, bars);
  const buf = await ctx.startRendering();
  return { ids, level, errors, ...analyze(buf) };
}

export async function checkAll({ roles = null, bars = 4 } = {}) {
  const out = [];
  for (const def of INSTRUMENTS) {
    if (roles && !roles.includes(def.role)) continue;
    for (let lv = 1; lv <= def.levels.length; lv++) out.push(await checkInstrument(def.id, lv, { bars }));
  }
  return out;
}
