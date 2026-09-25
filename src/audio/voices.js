// Synth voice building blocks. Every function schedules one self-cleaning note at audio time `t`
// into `out` and returns the time the note fully ends. Instruments compose these.

const caches = new WeakMap();
function cacheFor(ctx) {
  let c = caches.get(ctx);
  if (!c) { c = { noise: null, step: {}, pulse: {}, pluck: new Map() }; caches.set(ctx, c); }
  return c;
}

const FLOOR = 0.0001;

export function noiseBuffer(ctx) {
  const c = cacheFor(ctx);
  if (!c.noise) {
    const len = ctx.sampleRate * 2;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    c.noise = b;
  }
  return c.noise;
}

// Sample-and-hold noise: the crunchy, stepped noise of old console sound chips.
export function stepNoiseBuffer(ctx, hold = 6) {
  const c = cacheFor(ctx);
  if (!c.step[hold]) {
    const len = ctx.sampleRate * 2;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let v = 0;
    for (let i = 0; i < len; i++) { if (i % hold === 0) v = Math.random() < 0.5 ? -1 : 1; d[i] = v * 0.8; }
    c.step[hold] = b;
  }
  return c.step[hold];
}

// Band-limited pulse wave with the given duty cycle (0.125, 0.25, 0.5 are the classic chip shapes).
export function pulseWave(ctx, duty) {
  const c = cacheFor(ctx);
  const key = duty.toFixed(3);
  if (!c.pulse[key]) {
    const n = 48;
    const real = new Float32Array(n), imag = new Float32Array(n);
    for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    c.pulse[key] = ctx.createPeriodicWave(real, imag);
  }
  return c.pulse[key];
}

// Schedule an ADSR on an AudioParam. hold = how long to stay at sustain before release.
export function env(param, t, { a = 0.003, d = 0.2, s = 0, r = 0.06, peak = 1, hold = 0 } = {}) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(FLOOR, t);
  param.linearRampToValueAtTime(Math.max(peak, FLOOR), t + a);
  const sLevel = Math.max(peak * s, FLOOR);
  param.exponentialRampToValueAtTime(sLevel, t + a + d);
  const relStart = t + a + Math.max(d, hold);
  param.setValueAtTime(sLevel, relStart);
  param.exponentialRampToValueAtTime(FLOOR, relStart + r);
  return relStart + r;
}

function chain(ctx, first, out, { filter, pan }) {
  let node = first;
  const extra = [];
  if (pan) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(p); node = p; extra.push(p);
  }
  node.connect(out);
  return extra;
}

function makeFilter(ctx, t, filter) {
  const f = ctx.createBiquadFilter();
  f.type = filter.type || 'lowpass';
  f.Q.value = filter.q ?? 0.8;
  const base = Math.max(30, filter.freq ?? 2000);
  const peak = Math.min(18000, base * (filter.env ?? 1));
  if (filter.to) {
    f.frequency.setValueAtTime(base, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, filter.to), t + (filter.time ?? 0.3));
  } else if (peak !== base) {
    f.frequency.setValueAtTime(peak, t);
    f.frequency.exponentialRampToValueAtTime(base, t + (filter.decay ?? 0.2));
  } else {
    f.frequency.setValueAtTime(base, t);
  }
  return f;
}

// Generic subtractive voice: oscillators -> amp env -> optional filter -> out.
// Options: freq, wave ('sawtooth'|'square'|'triangle'|'sine'), duty (pulse), unison, spread (cents), detune,
// dur, a, d, s, r, gain, filter {type,freq,q,env,decay,to,time}, pitchEnv {from, time}, vibrato {rate, depth, delay},
// sub (level of sine an octave below), pan.
export function tone(ctx, out, t, o) {
  const {
    freq, wave = 'sawtooth', duty = 0, dur = 0.2, a = 0.004, d = 0.15, s = 0.6, r = 0.08, gain = 0.3,
    unison = 1, spread = 10, detune = 0, filter = null, pitchEnv = null, vibrato = null, sub = 0, pan = 0,
  } = o;
  const g = ctx.createGain();
  g.gain.value = 0;
  let head = g;
  const nodes = [g];
  if (filter) { const f = makeFilter(ctx, t, filter); g.connect(f); head = f; nodes.push(f); }
  nodes.push(...chain(ctx, head, out, { pan }));
  const end = env(g.gain, t, { a, d, s, r, peak: gain / Math.sqrt(unison + (sub ? 0.5 : 0)), hold: Math.max(0, dur - a) });
  const oscs = [];
  let lfo = null, lfoGain = null;
  if (vibrato) {
    lfo = ctx.createOscillator();
    lfo.frequency.value = vibrato.rate ?? 5.5;
    lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0, t);
    lfoGain.gain.linearRampToValueAtTime(vibrato.depth ?? 15, t + (vibrato.delay ?? 0.15) + 0.1);
    lfo.connect(lfoGain);
    lfo.start(t); lfo.stop(end + 0.05);
  }
  const mk = (f, det, type) => {
    const osc = ctx.createOscillator();
    if (type === 'pulse') osc.setPeriodicWave(pulseWave(ctx, duty));
    else osc.type = type;
    if (pitchEnv) {
      osc.frequency.setValueAtTime(f * pitchEnv.from, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + (pitchEnv.time ?? 0.05));
    } else osc.frequency.setValueAtTime(f, t);
    osc.detune.setValueAtTime(det, t);
    if (lfoGain) lfoGain.connect(osc.detune);
    osc.connect(g);
    osc.start(t); osc.stop(end + 0.03);
    oscs.push(osc);
    return osc;
  };
  const type = duty ? 'pulse' : wave;
  for (let i = 0; i < unison; i++) {
    const det = detune + (unison > 1 ? (i / (unison - 1) - 0.5) * 2 * spread : 0);
    mk(freq, det, type);
  }
  if (sub) {
    const sg = ctx.createGain();
    sg.gain.value = sub;
    const so = ctx.createOscillator();
    so.type = 'sine';
    so.frequency.setValueAtTime(freq / 2, t);
    so.connect(sg); sg.connect(g);
    so.start(t); so.stop(end + 0.03);
    oscs.push(so); nodes.push(sg);
  }
  oscs[0].onended = () => { for (const n of nodes) n.disconnect(); if (lfoGain) lfoGain.disconnect(); };
  return end;
}

// Filtered noise burst. Options: dur, a, d, s, r, gain, filter, pan, rate (playback speed), chip (stepped noise hold).
export function noise(ctx, out, t, o = {}) {
  const { dur = 0.05, a = 0.001, d = 0.08, s = 0, r = 0.03, gain = 0.3, filter = { type: 'highpass', freq: 6000 }, pan = 0, rate = 1, chip = 0 } = o;
  const src = ctx.createBufferSource();
  src.buffer = chip ? stepNoiseBuffer(ctx, chip) : noiseBuffer(ctx);
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = 0;
  const nodes = [g];
  let head = g;
  if (filter) { const f = makeFilter(ctx, t, filter); g.connect(f); head = f; nodes.push(f); }
  nodes.push(...chain(ctx, head, out, { pan }));
  src.connect(g);
  const end = env(g.gain, t, { a, d, s, r, peak: gain, hold: Math.max(0, dur - a) });
  src.loop = true;
  src.start(t, Math.random() * 1.2);
  src.stop(end + 0.03);
  src.onended = () => { for (const n of nodes) n.disconnect(); };
  return end;
}

// Pitch-swept sine kick. Options: f0, f1, pitchDecay, decay, gain, click, wave, pan.
export function kick(ctx, out, t, o = {}) {
  const { f0 = 150, f1 = 45, pitchDecay = 0.07, decay = 0.42, gain = 0.9, click = 0.25, wave = 'sine', pan = 0 } = o;
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + pitchDecay);
  const g = ctx.createGain();
  g.gain.setValueAtTime(FLOOR, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.002);
  g.gain.exponentialRampToValueAtTime(FLOOR, t + decay);
  osc.connect(g);
  const nodes = [g, ...chain(ctx, g, out, { pan })];
  osc.start(t); osc.stop(t + decay + 0.03);
  osc.onended = () => { for (const n of nodes) n.disconnect(); };
  if (click > 0) noise(ctx, out, t, { dur: 0.004, d: 0.012, gain: click, filter: { type: 'highpass', freq: 2500 } });
  return t + decay;
}

// Two-operator FM voice for bells, electric pianos, mallets.
// Options: freq, ratio, index, indexDecay, a, d, s, r, dur, gain, pan, detune.
export function fm(ctx, out, t, o) {
  const { freq, ratio = 2, index = 2, indexDecay = 0.3, a = 0.002, d = 0.6, s = 0, r = 0.15, dur = 0.3, gain = 0.3, pan = 0, detune = 0 } = o;
  const car = ctx.createOscillator();
  car.type = 'sine';
  car.frequency.setValueAtTime(freq, t);
  car.detune.setValueAtTime(detune, t);
  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.setValueAtTime(freq * ratio, t);
  const mg = ctx.createGain();
  const depth = index * freq;
  mg.gain.setValueAtTime(depth, t);
  mg.gain.exponentialRampToValueAtTime(Math.max(1, depth * 0.08), t + indexDecay);
  mod.connect(mg); mg.connect(car.frequency);
  const g = ctx.createGain();
  g.gain.value = 0;
  car.connect(g);
  const nodes = [g, mg, ...chain(ctx, g, out, { pan })];
  const end = env(g.gain, t, { a, d, s, r, peak: gain, hold: Math.max(0, dur - a) });
  car.start(t); mod.start(t);
  car.stop(end + 0.03); mod.stop(end + 0.03);
  car.onended = () => { for (const n of nodes) n.disconnect(); };
  return end;
}

// Karplus-Strong plucked string, rendered once per pitch and cached.
function pluckBuffer(ctx, freq, decay, bright, dur) {
  const sr = ctx.sampleRate;
  const N = Math.max(2, Math.floor(sr / freq));
  const key = `${N}|${decay}|${bright}|${dur}`;
  const c = cacheFor(ctx);
  let hit = c.pluck.get(key);
  if (hit) return hit;
  const len = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, len, sr);
  const y = buf.getChannelData(0);
  let lp = 0;
  const k = 0.15 + bright * 0.85;
  for (let i = 0; i < N && i < len; i++) { lp += k * ((Math.random() * 2 - 1) - lp); y[i] = lp; }
  for (let i = N; i < len; i++) {
    const b = i - N - 1 >= 0 ? y[i - N - 1] : 0;
    y[i] = decay * 0.5 * (y[i - N] + b);
  }
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(y[i]));
  if (peak > 0) for (let i = 0; i < len; i++) y[i] *= 0.9 / peak;
  hit = { buf, rate: freq / (sr / (N + 0.5)) };
  c.pluck.set(key, hit);
  return hit;
}

// Options: freq, decay (0.99..0.999), bright (0..1), dur, gain, pan, filter.
export function pluck(ctx, out, t, o) {
  const { freq, decay = 0.995, bright = 0.5, dur = 1.0, gain = 0.4, pan = 0, filter = null, len = 1.6 } = o;
  const { buf, rate } = pluckBuffer(ctx, freq, decay, bright, len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  const end = t + Math.min(dur, len);
  g.gain.setValueAtTime(gain, Math.max(t, end - 0.06));
  g.gain.exponentialRampToValueAtTime(FLOOR, end);
  const nodes = [g];
  let head = g;
  if (filter) { const f = makeFilter(ctx, t, filter); g.connect(f); head = f; nodes.push(f); }
  nodes.push(...chain(ctx, head, out, { pan }));
  src.connect(g);
  src.start(t);
  src.stop(end + 0.02);
  src.onended = () => { for (const n of nodes) n.disconnect(); };
  return end;
}

// Snare: a short pitched body plus a noise rattle.
export function snare(ctx, out, t, o = {}) {
  const { tone: toneHz = 190, body = 0.35, rattle = 0.4, decay = 0.16, bright = 1800, pan = 0, chip = 0 } = o;
  tone(ctx, out, t, { freq: toneHz, wave: 'triangle', dur: 0.02, d: decay * 0.6, s: 0, r: 0.02, gain: body, pitchEnv: { from: 1.6, time: 0.03 }, pan });
  return noise(ctx, out, t, { dur: 0.01, d: decay, gain: rattle, chip, filter: { type: 'highpass', freq: bright, q: 0.7 }, pan });
}

// Hi-hat: bright noise. open=true rings longer.
export function hat(ctx, out, t, o = {}) {
  const { open = false, gain = 0.22, pan = 0, freq = 7500, chip = 0 } = o;
  return noise(ctx, out, t, { dur: 0.004, d: open ? 0.28 : 0.045, r: 0.02, gain, chip, filter: { type: 'highpass', freq, q: 0.9 }, pan });
}
