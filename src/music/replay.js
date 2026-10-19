// Your track. The game records a track sheet: for each section reached, the band and pedals as that
// section ended ({ index, band: [[id, level, remixed 0|1]...], pedals: [[id, level]...] }). This plays
// it back as a radio edit through the real sequencer and desk, so it sounds exactly like the run: a few
// bars of every section, growing from one sound to the full band, then the last chord.

import { MAX_INSTRUMENT_LEVEL, MAX_PEDAL_LEVEL } from '../config.js';
import { clamp } from '../util.js';
import { Song, SECTIONS } from './song.js';
import { makeInst, remixBoost } from '../game/loadout.js';
import { BY_ID } from '../content/instruments/index.js';

// Bars per section in the edit, and the bar each excerpt starts from: the roll and sweep into The Drop,
// the Drop's impact, else the end of an 8-bar phrase, so each excerpt ends on a fill (and the Bridge's
// is the breakdown with the groove back in).
const EDIT_BARS = { intro: 2, build: 2 };
const EDIT_FROM = { build: 14, drop: 0 };

const valid = (e) => Number.isInteger(e?.index) && !!SECTIONS[e.index];
const pairs = (a) => (Array.isArray(a) ? a.filter(Array.isArray) : []);

// The edit's sections: one excerpt per sheet entry, then an outro that plays one last downbeat on i
// (in the last section's key, so a won run ends lifted) and rests.
export function radioEdit(sheet) {
  const out = sheet.filter(valid).map((e) => {
    const s = SECTIONS[e.index];
    const bars = EDIT_BARS[s.id] || 4;
    return { ...s, bars, from: EDIT_FROM[s.id] ?? 8 - bars };
  });
  out.push({ id: 'outro', name: 'Outro', bars: Infinity, prog: [0], lift: out[out.length - 1]?.lift, end: true });
  return out;
}

// Play a track sheet (it may come from storage, so anything malformed is skipped). onSection(name,
// bandSize) fires as each excerpt starts, for a now-playing line; onEnd() once the last chord has rung
// for a bar. Returns { stop() }.
export function playSheet({ seq, audio, sheet, keyPc, onSection, onEnd }) {
  const takes = (Array.isArray(sheet) ? sheet : []).filter(valid);
  const edit = radioEdit(takes);
  const bands = takes.map((e) => pairs(e.band).filter(([id]) => BY_ID[id]).map(([id, level, remixed]) => {
    const inst = makeInst(BY_ID[id], clamp(level | 0, 1, MAX_INSTRUMENT_LEVEL));
    inst.remix = !!remixed;
    return inst;
  }));
  let band = [];
  const enter = (i) => {
    band = bands[i];
    const levels = {};
    for (const [id, lv] of pairs(takes[i].pedals)) levels[id] = clamp(lv | 0, 1, MAX_PEDAL_LEVEL);
    audio.applyPedals(levels, remixBoost(band));
    audio.setActiveCount(Math.max(1, band.length));
    onSection?.(edit[i].name, band.length);
  };
  const onBar = (bar) => {
    const pos = seq.song.position(bar);
    if (!pos.section.end) { if (pos.barInSection === 0) enter(pos.index); }
    else if (pos.barInSection === 1) { player.stop(); onEnd?.(); }
  };
  const player = {
    stop() {
      if (seq.onBar !== onBar) return;   // the sequencer has moved on to something else
      seq.onBar = null;
      seq.getInstruments = () => [];
      seq.stop();
      seq.clearEvents();
    },
  };
  seq.reset(new Song((((keyPc | 0) % 12) + 12) % 12, edit));
  seq.getInstruments = () => band;
  seq.onBar = onBar;
  if (takes.length) enter(0);
  seq.start(seq.clock.now() + 0.1);
  return player;
}
