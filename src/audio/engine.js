// The mixing desk. Six channel strips (one per role) with their own inserts, panned apart and
// side-chained to the kick, feeding shared reverb and tape-delay returns and a master bus that
// compresses and limits. This is the "auto mixer" half of the clean-music rule: however many
// instruments play, each sits in its own lane and the bus keeps the total level in check.

import { ROLES, STEP_SEC, BEAT_SEC, BAR_SEC, ECHO_STEPS } from '../config.js';
import { mtof, noteAtOrAbove } from '../music/theory.js';
import * as V from './voices.js';
import { leitNotes } from '../game/bosscues.js';

const CHANNEL_LEVEL = { beat: 0.95, perc: 0.42, bass: 0.72, chords: 0.36, lead: 0.6, arp: 0.32 };
const CHANNEL_PAN = { beat: 0, perc: 0.28, bass: 0, chords: -0.12, lead: 0.06, arp: -0.3 };
const DUCKED = ['bass', 'chords', 'lead', 'arp'];
const TONE_OPEN = 20000;
const SOLO_LIFT = 1.33;
// Desk level for n channels playing: keeps the band's loudness steady as it grows.
const activeLevel = (n) => 1 / (1 + 0.09 * Math.max(0, n - 1));

function driveCurve(k) {
  if (!k) return null;
  const n = 1024, c = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / norm; }
  return c;
}

function crushCurve(bits) {
  if (!bits) return null;
  const n = 2048, c = new Float32Array(n), steps = Math.pow(2, bits);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.round(x * steps) / steps; }
  return c;
}

function impulse(ctx, seconds = 2.6, decay = 3.4) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const tt = i / len;
      lp += 0.35 * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * Math.pow(1 - tt, decay) * (i < 90 ? i / 90 : 1);
    }
  }
  return b;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.muted = false;
    this.pedals = {};
    this.boost = {};
    this.channels = {};
    this.previewRole = null;
  }

  get ready() { return !!this.ctx; }

  init() {
    if (this.ctx) return true;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return false;
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch (e) {
      console.warn('AudioContext failed', e);
      return false;
    }
    this._build();
    return true;
  }

  // Use an existing context (e.g. an OfflineAudioContext in the audio checker).
  attach(ctx) {
    this.ctx = ctx;
    this._api = null;
    this._build();
  }

  async resume() {
    if (this.ctx && this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch (e) { /* ignore */ } }
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  // Seconds between scheduling a sound and hearing it. Visual attacks wait this long so they land with the note.
  get latency() {
    const c = this.ctx;
    if (!c) return 0;
    return Math.min(0.25, (c.outputLatency || 0) + (c.baseLatency || 0));
  }

  _build() {
    const ctx = this.ctx;
    const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };

    this.master = G(this.volume);
    this.master.connect(ctx.destination);

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2.5; this.limiter.knee.value = 0; this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002; this.limiter.release.value = 0.12;
    this.limiter.connect(this.master);

    this.makeup = G(1);
    this.makeup.connect(this.limiter);
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.knee.value = 8; this.comp.ratio.value = 3;
    this.comp.attack.value = 0.008; this.comp.release.value = 0.2;
    this.comp.connect(this.makeup);

    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000; this.muffle.Q.value = 0.9;
    // Bed gain: while muffled the band also drops in level, so an auditioned card stands out clearly.
    this.bed = G(1);
    this.muffle.connect(this.bed);
    this.bed.connect(this.comp);

    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass'; this.hp.frequency.value = 10; this.hp.Q.value = 0.8;
    this.hp.connect(this.muffle);

    this.mixGain = G(1);
    this.mixGain.connect(this.hp);
    this.mix = G(1);
    this.mix.connect(this.mixGain);
    // The band (strips and their returns) passes the arrangement's tone filter: a quiet phrase starts
    // underwater and opens up across its 8 bars (arrange()). The system sounds and boss cues skip it.
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass'; this.tone.frequency.value = TONE_OPEN; this.tone.Q.value = 0.7;
    this.tone.connect(this.mix);
    this.bandBus = G(1);
    this.bandBus.connect(this.tone);

    // Preview bus skips the muffle so a hovered card is heard clearly over the dimmed mix.
    this.previewBus = G(1);
    this.previewBus.connect(this.comp);

    this.sys = G(0.8);
    this.sys.connect(this.mix);
    // Boss cues ride the system bus through their own gain, so the last boss's sounds can be cut at once.
    this.bossBus = G(1);
    this.bossBus.connect(this.sys);
    this.ui = G(0.5);
    this.ui.connect(this.limiter);

    // Reverb return.
    this.revIn = G(1);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx);
    this.revOut = G(0.85);
    this.revIn.connect(this.reverb); this.reverb.connect(this.revOut); this.revOut.connect(this.bandBus);

    // Tape delay return, timed to the echo attacks.
    this.dlyIn = G(1);
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = ECHO_STEPS * STEP_SEC;
    this.dlyFb = G(0.3);
    this.dlyTone = ctx.createBiquadFilter();
    this.dlyTone.type = 'lowpass'; this.dlyTone.frequency.value = 3200;
    this.dlyOut = G(0.8);
    this.dlyIn.connect(this.delay);
    this.delay.connect(this.dlyTone); this.dlyTone.connect(this.dlyFb); this.dlyFb.connect(this.delay);
    this.dlyTone.connect(this.dlyOut); this.dlyOut.connect(this.bandBus);

    // Shared LFOs for chorus and wah.
    this.chorusLfo = ctx.createOscillator(); this.chorusLfo.frequency.value = 0.7; this.chorusLfo.start();
    this.wahLfo = ctx.createOscillator(); this.wahLfo.frequency.value = 1; this.wahLfo.start();

    for (const role of ROLES) this.channels[role] = this._channel(role);
    this.applyPedals({});
  }

  _channel(role) {
    const ctx = this.ctx;
    const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const ch = { role };
    ch.input = G(1);
    let head = ch.input;

    if (role === 'beat' || role === 'perc') {
      const sum = G(1);
      ch.crushDry = G(1); ch.crushWet = G(0);
      ch.crusher = ctx.createWaveShaper();
      head.connect(ch.crushDry); ch.crushDry.connect(sum);
      head.connect(ch.crusher); ch.crusher.connect(ch.crushWet); ch.crushWet.connect(sum);
      head = sum;
    }
    if (role === 'bass' || role === 'lead') {
      ch.drive = ctx.createWaveShaper();
      ch.drive.oversample = '2x';
      head.connect(ch.drive); head = ch.drive;
    }
    if (role === 'chords' || role === 'bass') {
      ch.wah = ctx.createBiquadFilter();
      ch.wah.type = 'peaking'; ch.wah.Q.value = 3.5; ch.wah.gain.value = 0;
      ch.wah.frequency.value = role === 'bass' ? 500 : 1100;
      ch.wahDepth = G(0);
      this.wahLfo.connect(ch.wahDepth); ch.wahDepth.connect(ch.wah.frequency);
      head.connect(ch.wah); head = ch.wah;
    }
    if (role === 'chords' || role === 'lead') {
      const sum = G(1);
      ch.chorusDelay = ctx.createDelay(0.05);
      ch.chorusDelay.delayTime.value = 0.014;
      ch.chorusDepth = G(0.0035);
      this.chorusLfo.connect(ch.chorusDepth); ch.chorusDepth.connect(ch.chorusDelay.delayTime);
      ch.chorusWet = G(0);
      head.connect(sum);
      head.connect(ch.chorusDelay); ch.chorusDelay.connect(ch.chorusWet); ch.chorusWet.connect(sum);
      head = sum;
    }

    ch.level = CHANNEL_LEVEL[role];
    ch.fader = G(ch.level);
    head.connect(ch.fader);
    ch.pan = ctx.createStereoPanner();
    ch.pan.pan.value = CHANNEL_PAN[role];
    // A solo phrase lifts the featured strip a little and opens its sends (arrange()).
    ch.lift = G(1);
    ch.fader.connect(ch.lift);
    ch.lift.connect(ch.pan);
    ch.duck = G(1);
    ch.pan.connect(ch.duck);
    ch.post = ch.duck;
    ch.toMix = G(1); ch.toPrev = G(0);
    ch.post.connect(ch.toMix); ch.toMix.connect(this.bandBus);
    ch.post.connect(ch.toPrev); ch.toPrev.connect(this.previewBus);
    ch.sends = G(1); ch.post.connect(ch.sends);
    ch.revSend = G(0); ch.sends.connect(ch.revSend); ch.revSend.connect(this.revIn);
    ch.dlySend = G(0); ch.sends.connect(ch.dlySend); ch.dlySend.connect(this.dlyIn);
    return ch;
  }

  // Everything an instrument's sound() needs: the context, voice helpers, the kick side-chain, and pedal state.
  api() {
    if (!this._api) this._api = { ctx: this.ctx, v: V, duck: (t, amt, rel) => this.duck(t, amt, rel), pedals: this.pedals };
    this._api.pedals = this.pedals;
    return this._api;
  }

  out(role) { return this.channels[role]?.input; }

  // Side-chain pump: melodic channels dip under each kick so the low end stays clear.
  duck(t, amount = 0.45, release = 0.2) {
    if (!this.ctx) return;
    for (const role of DUCKED) {
      const g = this.channels[role].duck.gain;
      g.cancelScheduledValues(t);
      if (this.boost[role] === 'compressor') {
        // A remixed strip with the Compressor (Soul Keys) pumps hard: a deeper, slower duck, eased in so a
        // held chord does not click.
        g.setTargetAtTime(1 - Math.min(0.8, amount + 0.3), t, 0.004);
        g.setTargetAtTime(1, t + 0.02, (release * 1.8) / 3);
        continue;
      }
      g.setValueAtTime(1 - amount, t);
      g.setTargetAtTime(1, t + 0.01, release / 3);
    }
  }

  // Keep perceived loudness steady as the band grows.
  setActiveCount(n) {
    if (!this.ctx) return;
    const v = activeLevel(n);
    this.previewBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3);   // previews play at their real in-mix level
    this.mixGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3);
  }

  // The desk follows the arrangement. The sequencer calls this on every downbeat, ahead on the audio
  // clock (t), so pausing never shifts it:
  //   playing  channels sounding this bar, band: channels in the band. A thinner bar is lifted only part of
  //            the way back (half the full band's correction, in dB), so a breakdown really is quieter.
  //   level    the phrase's own level (quiet phrases 0.8)
  //   tone     [from, to, end?] Hz: the band's lowpass from t to `end` (default: the bar's end; a quiet phrase
  //            opening up), null: wide open (snaps open, as on an impact), undefined: leave it
  //   solo     the featured role: its strip comes up ~2.5 dB and its reverb and delay sends by half
  arrange(t, { playing, band, level = 1, tone, solo = null }) {
    if (!this.ctx) return;
    const full = activeLevel(band);
    this.previewBus.gain.setTargetAtTime(full, t, 0.3);
    this.mixGain.gain.setTargetAtTime(Math.sqrt(full * activeLevel(playing)) * level, t, 0.06);
    if (tone !== undefined) {
      const f = this.tone.frequency;
      // A ramp still pending from an earlier song (a quiet phrase on the end screen) must not run into this one.
      f.cancelScheduledValues(t);
      if (tone) { f.setValueAtTime(tone[0], t); f.exponentialRampToValueAtTime(tone[1], tone[2] ?? t + BAR_SEC - 0.005); }
      else f.setValueAtTime(TONE_OPEN, t);
    }
    for (const role of ROLES) {
      const ch = this.channels[role], on = role === solo;
      ch.lift.gain.setTargetAtTime(on ? SOLO_LIFT : 1, t, 0.05);
      ch.sends.gain.setTargetAtTime(on ? 1.5 : 1, t, 0.05);
    }
  }

  setVolume(v) {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05);
  }

  setMuted(m) { this.muted = m; this.setVolume(this.volume); }

  setMuffle(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setTargetAtTime(on ? 650 : 20000, t, on ? 0.06 : 0.12);
    this.bed.gain.cancelScheduledValues(t);
    this.bed.gain.setTargetAtTime(on ? 0.3 : 1, t, on ? 0.06 : 0.12);
  }

  // Route one role's channel around the muffle (level-up card preview). null restores normal routing.
  setPreviewRole(role) {
    if (!this.ctx) return;
    this.previewRole = role;
    const t = this.ctx.currentTime;
    for (const r of ROLES) {
      const ch = this.channels[r];
      const solo = r === role;
      ch.toMix.gain.setTargetAtTime(solo ? 0 : 1, t, 0.02);
      ch.toPrev.gain.setTargetAtTime(solo ? 1 : 0, t, 0.02);
    }
  }

  // Map pedal levels (0..3) onto the effects so each pedal is heard as well as felt.
  // boost: { role: pedalId } for remixed channels. That pedal runs at level 3 on that one strip (the same
  // insert settings a level 3 pedal uses everywhere), while the shared returns and the bus keep the real levels.
  applyPedals(levels, boost = {}) {
    if (!this.ctx) return;
    this.pedals = { reverb: 0, delay: 0, overdrive: 0, compressor: 0, chorus: 0, wah: 0, bitcrusher: 0, ...levels };
    this.boost = boost;
    const p = this.pedals;
    const t = this.ctx.currentTime;
    const set = (param, v) => param.setTargetAtTime(v, t, 0.08);
    const rev = { beat: 0.02, perc: 0.05, bass: 0, chords: 0.16, lead: 0.1, arp: 0.18 };
    const revPer = { beat: 0.035, perc: 0.05, bass: 0.025, chords: 0.1, lead: 0.09, arp: 0.1 };
    const dly = { beat: 0, perc: 0.05, bass: 0, chords: 0.05, lead: 0.1, arp: 0.11 };
    for (const role of ROLES) {
      const ch = this.channels[role];
      const q = boost[role] ? { ...p, [boost[role]]: 3 } : p;
      set(ch.revSend.gain, rev[role] + revPer[role] * q.reverb);
      set(ch.dlySend.gain, q.delay ? dly[role] * (0.9 + 0.35 * q.delay) : 0);
      let level = ch.level;
      if (ch.drive) {
        ch.drive.curve = driveCurve([0, 1.8, 3.2, 5][q.overdrive]);
        level *= [1, 0.6, 0.42, 0.3][q.overdrive];
      }
      if (ch.crusher) {
        ch.crusher.curve = crushCurve([0, 6, 5, 4][q.bitcrusher]);
        set(ch.crushWet.gain, [0, 0.3, 0.42, 0.55][q.bitcrusher]);
        set(ch.crushDry.gain, 1 - [0, 0.3, 0.42, 0.55][q.bitcrusher]);
      }
      if (ch.wah) {
        set(ch.wah.gain, [0, 5, 7, 9][q.wah]);
        set(ch.wahDepth.gain, [0, 1, 1.4, 1.8][q.wah] * (role === 'bass' ? 250 : 650));
      }
      if (ch.chorusWet) set(ch.chorusWet.gain, [0, 0.35, 0.5, 0.65][q.chorus]);
      set(ch.fader.gain, level);
    }
    set(this.dlyFb.gain, 0.22 + 0.08 * p.delay);
    set(this.comp.threshold, -16);
    set(this.comp.ratio, 3 + 1.6 * p.compressor);
    set(this.comp.attack, 0.008 + 0.006 * p.compressor);
    set(this.comp.release, 0.2 - 0.03 * p.compressor);
    set(this.makeup.gain, 1);
  }

  // ---- System sounds (the song's own transitions; they go through the muffle with the music) ----

  crash(t, gain = 0.28) {
    if (!this.ctx) return;
    V.noise(this.ctx, this.sys, t, { dur: 0.02, d: 1.8, r: 0.3, gain, filter: { type: 'highpass', freq: 4200, q: 0.5 } });
    V.noise(this.ctx, this.revIn, t, { dur: 0.02, d: 1.2, gain: gain * 0.5, filter: { type: 'bandpass', freq: 7000, q: 0.6 } });
  }

  riser(t, dur) {
    if (!this.ctx) return;
    V.noise(this.ctx, this.sys, t, { a: dur * 0.9, dur, d: 0.05, s: 1, r: 0.05, gain: 0.16, filter: { type: 'bandpass', freq: 300, to: 7000, time: dur, q: 1.4 } });
  }

  // Filter build before a drop: the mix thins out, then slams back on the downbeat.
  buildSweep(t0, t1) {
    if (!this.ctx) return;
    const f = this.hp.frequency;
    f.cancelScheduledValues(t0);
    f.setValueAtTime(10, t0);
    f.exponentialRampToValueAtTime(700, t1 - 0.01);
    f.setValueAtTime(10, t1);
  }

  // The sub sweeps down onto the chord root, so the hit stays in key.
  impact(t, rootPc) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const f1 = mtof(noteAtOrAbove(rootPc, 28));
    V.kick(ctx, this.sys, t, { f0: 3 * f1, f1, pitchDecay: 0.35, decay: 1.4, gain: 1, click: 0.5 });
    V.noise(ctx, this.sys, t, { dur: 0.02, d: 0.6, gain: 0.35, filter: { type: 'lowpass', freq: 1800 } });
    this.crash(t, 0.32);
    this.duck(t, 0.7, 0.6);
  }

  // Snare roll across a build bar, accelerating from 8ths to 32nds.
  snareRoll(t0, dur) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    let t = t0, i = 0;
    while (t < t0 + dur - 0.01) {
      const prog = (t - t0) / dur;
      V.snare(ctx, this.sys, t, { rattle: 0.08 + 0.22 * prog, body: 0.06 + 0.12 * prog, decay: 0.08 });
      const step = prog < 0.5 ? STEP_SEC * 2 : prog < 0.75 ? STEP_SEC : STEP_SEC / 2;
      t += step; i++;
      if (i > 64) break;
    }
  }

  // Stop-time when a boss goes down: one crash and a sub kick that falls onto the chord root.
  silenced(t, rootPc) {
    if (!this.ctx) return;
    this.crash(t, 0.3);
    V.kick(this.ctx, this.sys, t, { f0: 90, f1: mtof(noteAtOrAbove(rootPc, 28)), pitchDecay: 0.3, decay: 1.1, gain: 0.7, click: 0.3 });
  }

  // A pickup chime: a soft FM bell, kept under the Sparkle channel.
  ping(t, midi, gain) {
    if (!this.ctx) return;
    V.fm(this.ctx, this.sys, t, { freq: mtof(midi), ratio: 4, index: 0.6, indexDecay: 0.08, a: 0.002, d: 0.22, s: 0, r: 0.06, dur: 0.01, gain, pan: 0.18 });
  }

  // ---- Boss cues: each boss sounds on the beats it attacks on (src/game/bosscues.js). Pitched cues use
  // the chord root or fifth; the rest are unpitched. A leitmotif cue plays one beat of the boss's motif.

  bossCue(name, t, chord) {
    if (!this.ctx) return;
    const ctx = this.ctx, out = this.bossBus;
    if (name.startsWith('leit:')) {
      for (const n of leitNotes(name, chord)) V.tone(ctx, out, t + n.at * STEP_SEC, { freq: mtof(n.midi), wave: 'triangle', dur: n.d * STEP_SEC, a: 0.004, d: 0.15, s: 0.6, r: 0.08, gain: 0.07 });
      return;
    }
    const at = (pc, low) => mtof(noteAtOrAbove(pc, low));
    switch (name) {
      case 'swell':   // The Drone winds up for a beat on the root; its charge on the downbeat cuts it off
        V.tone(ctx, out, t, { freq: at(chord.rootPc, 40), wave: 'sawtooth', unison: 3, spread: 14, dur: BEAT_SEC, a: BEAT_SEC * 0.9, d: 0.05, s: 1, r: 0.03, gain: 0.16,
          filter: { type: 'lowpass', freq: 220, to: 1600, time: BEAT_SEC, q: 2 } });
        break;
      case 'bark':    // The Clipper clips: a short hard square on the fifth
        V.tone(ctx, out, t, { freq: at((chord.rootPc + chord.intervals[2]) % 12, 55), duty: 0.5, dur: 0.06, a: 0.001, d: 0.08, s: 0, r: 0.02, gain: 0.1, filter: { type: 'lowpass', freq: 2400, q: 6 } });
        break;
      case 'glitch':  // The Glitch King counts in its blink: four stuttering 16ths of console noise
        for (let i = 0; i < 4; i++) V.noise(ctx, out, t + i * STEP_SEC, { dur: 0.02, d: 0.05, gain: 0.05 + 0.03 * i, chip: 3, filter: { type: 'bandpass', freq: 1200 * (1 + i), q: 2 } });
        break;
      case 'blink':   // ...and blinks: a zap that drops two octaves onto the root
        V.tone(ctx, out, t, { freq: at(chord.rootPc, 52), duty: 0.25, dur: 0.12, d: 0.15, s: 0, gain: 0.12, pitchEnv: { from: 4, time: 0.12 } });
        break;
      default:        // White Noise: a bar of hiss on each downbeat, louder each phase (noise1..3)
        V.noise(ctx, out, t, { a: 0.4, dur: BAR_SEC, d: 0.1, s: 1, r: 0.3, gain: [0.03, 0.05, 0.08][name.slice(5) - 1] || 0.03,
          filter: { type: 'bandpass', freq: 1500, to: 5000, time: BAR_SEC, q: 0.7 } });
    }
  }

  // Silence the boss bus (the final boss is down) or open it again (a boss arrives).
  bossQuiet(on) {
    if (!this.ctx) return;
    const g = this.bossBus.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(on ? 0 : 1, t, 0.015);
  }

  // ---- UI sounds (not muffled; kept in key by the caller) ----

  uiBlip(freq = 880, gain = 0.25) {
    if (!this.ctx) return;
    V.tone(this.ctx, this.ui, this.ctx.currentTime + 0.005, { freq, wave: 'triangle', dur: 0.03, d: 0.12, s: 0, gain });
  }

  levelUpChime(midis) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    midis.forEach((m, i) => V.fm(this.ctx, this.ui, t + i * 0.07, { freq: 440 * Math.pow(2, (m - 69) / 12), ratio: 3.5, index: 1.2, d: 0.9, gain: 0.16 }));
  }

  hurt() {
    if (!this.ctx) return;
    V.noise(this.ctx, this.ui, this.ctx.currentTime + 0.005, { dur: 0.02, d: 0.14, gain: 0.22, chip: 12, filter: { type: 'lowpass', freq: 1400 } });
  }
}
