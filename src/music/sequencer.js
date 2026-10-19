// The transport. Schedules every instrument's pattern slightly ahead on the audio clock and emits a
// matching game event for each note, so an attack fires at the exact moment its note is heard.
// While the game is paused ("hold"), the current bar loops as a muffled vamp and no attacks are emitted.
// The vamp always plays the plain loop: rests, fills, rolls and stops only happen while the song moves.

import { STEPS_PER_BAR, STEP_SEC, BAR_SEC, ROLE_HIGH } from '../config.js';
import { chordTone, scaleTone, voiceChord, mtof } from './theory.js';

const NO_CUES = [];
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

export class Sequencer {
  constructor(clock, audio) {
    this.clock = clock;
    this.audio = audio;
    this.lookahead = 0.14;
    this.running = false;
    this.getInstruments = () => [];
    this.getBossCues = () => NO_CUES;   // (bar, beat) -> cue names to play on that beat (see src/game/bosscues.js)
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
    this.stepLog = [];         // recent {time, sib, bar, rest} for the playhead display
    this.running = false;
    this.pos = null;           // song position of the bar being scheduled
    this.onBar = null;         // (bar) called as each new bar starts, before its notes are scheduled
    this.pendingStop = null;   // { len, home } waiting for the next downbeat
    this.lastStop = null;      // { bar, len, home, step, end } the latest stop bar
    this.fillBar = -1;         // last bar the Beat channel played a fill in
    this.pingStep = -1e9;      // global step of the last note chime
    this.pingN = 0;
    this.pingSlots = new Array(8).fill(-1e9);   // note chimes per 8th of the last 2 seconds
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

  // Stop-time: on the next downbeat that is not held, every channel plays its step-0 notes and rests
  // until step `len`. home: that bar's chord becomes i (of the lifted key), the song's last chord.
  stopNext(len, home = false) { this.pendingStop = { len, home }; }

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
    let impactAt = null, crash = 0, landed = false;
    const audioOn = this._audioOn();
    const A = audioOn ? this.audio : null;
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
        if (arr.impact) impactAt = t;   // The Drop drops
        if (arr.sweep && !this.dropState) A && A.buildSweep(t, t + 2 * BAR_SEC);
        const next = pos.next || this.song.sections[pos.index + 1];
        if (pos.barsLeft === 1 && next && next.riser) {
          A && A.riser(t, BAR_SEC);
          // A Beat channel rolling into The Drop replaces the system snare roll.
          const rolling = arr.roll && this.getInstruments().some((i) => i.def.role === 'beat');
          if ((next.drop || next.id === 'finale') && !rolling) A && A.snareRoll(t, BAR_SEC);
        }
      }
      // The Drop: queued -> one bar of build -> impact on the next downbeat.
      if (this.dropState === 'building') {
        if (this.hold) {
          if (A) { A.buildSweep(t, t + BAR_SEC); A.riser(t, BAR_SEC); }
        } else {
          impactAt = t;
          this.events.push({ type: 'drop', time: t, bar: this.bar });
          this.dropState = null;
        }
      } else if (this.dropState === 'queued' && !this.hold) {
        this.dropState = 'building';
        if (A) { A.buildSweep(t, t + BAR_SEC); A.riser(t, BAR_SEC); A.snareRoll(t, BAR_SEC); }
        this.events.push({ type: 'build', time: t });
      }
    }

    const pos = this.pos;
    // The arrangement applies to the band while the song moves, never to the vamp or an auditioned card.
    const arr = this.hold ? null : pos.arr;
    const stopped = arr && this.lastStop?.bar === this.bar;
    const chord = stopped && this.lastStop.home ? this.song.chord(0, pos.section.lift) : pos.chord;
    const cut = stopped ? this.lastStop.len : arr ? arr.cut : 0;
    // One hit per downbeat: an impact (it has its own crash) over stop-time over a plain crash.
    if (A && impactAt === null) { if (landed) A.silenced(t, chord.rootPc); else if (crash) A.crash(t, crash); }

    if (emit && sib % 4 === 0) {
      this.events.push({ type: 'beat', time: t, beat: sib / 4, bar: this.bar, sib });
      if (A) for (const c of this.getBossCues(this.bar, sib / 4)) A.bossCue(c, t, chord);
    }
    this.stepLog.push({ time: t, sib, bar: this.bar, rest: arr ? arr.rest : null });
    if (this.stepLog.length > 24) this.stepLog.shift();

    const previewRole = this.preview?.inst?.def.role;
    for (const inst of this.getInstruments()) {
      if (inst.def.role === previewRole) continue;
      if (arr && (arr.rest.includes(inst.def.role) || (sib > 0 && sib < cut))) continue;
      this._play(inst, t, sib, chord, emit, A, arr);
    }
    if (this.preview?.inst) this._play(this.preview.inst, t, sib, chord, false, A, null);
    if (impactAt !== null && A) A.impact(impactAt, chord.rootPc);
  }

  _play(inst, t, sib, chord, emit, A, arr) {
    const def = inst.def;
    const lv = def.levels[inst.level - 1];
    if (!lv || !lv._byStep) return;
    const P = def.steps || STEPS_PER_BAR;
    const idx = ((this.hold ? this.loopBar : this.bar) * STEPS_PER_BAR + sib) % P;
    const notes = arr && (arr.fill || arr.roll) && def.role === 'beat' ? this._beatNotes(lv, idx, sib, arr) : lv._byStep[idx];
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

  // The Beat channel in a fill or roll bar. Both use the level's own fill sound (its snare, clap or rim,
  // else its kick; see prepare() in src/content/instruments/index.js), so every note fires with this
  // level's stats. A fill replaces steps 12-15; a roll plays that sound every `roll` steps over kicks.
  _beatNotes(lv, idx, sib, arr) {
    const k = lv._fillKind;
    if (arr.roll) {
      const out = [];
      const kick = arr.kicks && sib % 4 === 0;
      if (kick) out.push({ s: sib, v: 1, k: 'kick' });
      if (sib % arr.roll === 0 && !(kick && k === 'kick')) out.push({ s: sib, v: arr.v0 + ((arr.v1 - arr.v0) * sib) / 15, k });
      return out;
    }
    if (sib < 12) return lv._byStep[idx];
    this.fillBar = this.bar;
    lv._fill ||= FILL_V[k === 'kick' ? 'kick' : 'hit'].map((v, i) => (v ? [{ s: 12 + i, v, k }] : null));
    return lv._fill[sib - 12];
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
      // A held note a half step above a chord tone rubs against the chord: settle it onto the chord tone.
      if ((n.d || 1) >= 2) {
        const pc = ((midi % 12) + 12) % 12;
        if (chord.pcs.slice(0, 3).some((c) => (pc - c + 12) % 12 === 1)) midi -= 1;
      }
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

  // One chime on global step i, unless a stop holds the band silent there.
  _chime(i, idx, gain) {
    const s = this.pendingStop || this.lastStop;
    const at = this.pendingStop ? Math.ceil(this.globalStep / STEPS_PER_BAR) * STEPS_PER_BAR : this.lastStop?.step;
    if (s && i > at && i < at + s.len) return;
    const bar = this.bar + Math.floor(i / STEPS_PER_BAR) - Math.floor(Math.max(0, this.globalStep - 1) / STEPS_PER_BAR);
    this.audio.ping(this.nextTime + (i - this.globalStep) * STEP_SEC, chimeMidi(this.song.position(bar).chord, idx), gain);
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
