// The transport. Schedules every instrument's pattern slightly ahead on the audio clock and emits a
// matching game event for each note, so an attack fires at the exact moment its note is heard.
// While the game is paused ("hold"), the current bar loops as a muffled vamp and no attacks are emitted.

import { STEPS_PER_BAR, STEP_SEC, BAR_SEC, ROLE_HIGH } from '../config.js';
import { chordTone, scaleTone, voiceChord, mtof } from './theory.js';
import { SECTIONS } from './song.js';

export class Sequencer {
  constructor(clock, audio) {
    this.clock = clock;
    this.audio = audio;
    this.lookahead = 0.14;
    this.running = false;
    this.getInstruments = () => [];
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
    this.stepLog = [];         // recent {time, sib, bar} for the playhead display
    this.running = false;
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

  get position() { return this.song ? this.song.position(this.bar) : null; }

  tick() {
    if (!this.running || !this.song) return;
    const now = this.clock.now();
    if (this.nextTime < now - 0.3) this.nextTime = now + 0.04; // recovered from a stall: skip rather than flood
    const horizon = now + this.lookahead;
    let guard = 0;
    while (this.nextTime < horizon && guard++ < 48) {
      this._step(this.nextTime);
      this.nextTime += STEP_SEC;
      this.globalStep++;
    }
  }

  _audioOn() { return !this.clock.sim && this.audio && this.audio.ready; }

  _step(t) {
    const sib = this.globalStep % STEPS_PER_BAR;
    const emit = !this.hold;
    const audioOn = this._audioOn();
    const A = audioOn ? this.audio : null;

    if (sib === 0) {
      if (this.globalStep > 0) this.loopBar++;
      if (this.globalStep > 0 && !this.hold) {
        this.bar++;
        const pos = this.song.position(this.bar);
        if (pos.barInSection === 0) {
          A && A.crash(t);
          this.events.push({ type: 'section', time: t, index: pos.index, section: pos.section, bar: this.bar });
        }
        const next = SECTIONS[pos.index + 1];
        if (pos.barsLeft === 1 && next && next.riser) {
          A && A.riser(t, BAR_SEC);
          if (next.drop || next.id === 'finale') A && A.snareRoll(t, BAR_SEC);
        }
      }
      // The Drop: queued -> one bar of build -> impact on the next downbeat.
      if (this.dropState === 'building') {
        if (this.hold) {
          if (A) { A.buildSweep(t, t + BAR_SEC); A.riser(t, BAR_SEC); }
        } else {
          A && A.impact(t);
          this.events.push({ type: 'drop', time: t });
          this.dropState = null;
        }
      } else if (this.dropState === 'queued' && !this.hold) {
        this.dropState = 'building';
        if (A) { A.buildSweep(t, t + BAR_SEC); A.riser(t, BAR_SEC); A.snareRoll(t, BAR_SEC); }
        this.events.push({ type: 'build', time: t });
      }
    }

    const pos = this.song.position(this.bar);
    const chord = pos.chord;

    if (emit && sib % 4 === 0) this.events.push({ type: 'beat', time: t, beat: sib / 4, bar: this.bar, sib });
    this.stepLog.push({ time: t, sib, bar: this.bar });
    if (this.stepLog.length > 24) this.stepLog.shift();

    const previewRole = this.preview?.inst?.def.role;
    for (const inst of this.getInstruments()) {
      if (inst.def.role === previewRole) continue;
      this._play(inst, t, sib, chord, emit, A);
    }
    if (this.preview?.inst) this._play(this.preview.inst, t, sib, chord, false, A);
  }

  _play(inst, t, sib, chord, emit, A) {
    const def = inst.def;
    const lv = def.levels[inst.level - 1];
    if (!lv || !lv._byStep) return;
    const P = def.steps || STEPS_PER_BAR;
    const idx = ((this.hold ? this.loopBar : this.bar) * STEPS_PER_BAR + sib) % P;
    const notes = lv._byStep[idx];
    if (!notes) return;
    for (const n of notes) {
      const note = this._resolve(inst, n, chord, t);
      if (A) {
        try { def.sound(A.api(), t, note, A.out(def.role), inst); }
        catch (e) { this._report(def.id + '.sound', e); }
      }
      if (emit) this.events.push({ type: 'note', time: t, inst, note });
    }
  }

  _resolve(inst, n, chord, t) {
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
    };
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
