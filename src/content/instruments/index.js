// Instrument registry. Each role file exports an array of three definitions (Synth, Live, 8-Bit), and the
// newer styles keep one file per instrument in their own folder (heavy/, orchestra/), each folder's index
// exporting its six. Every channel has exactly one sound per style (checked below).

import beat from './beat.js';
import perc from './perc.js';
import bass from './bass.js';
import chords from './chords.js';
import lead from './lead.js';
import arp from './arp.js';
import heavy from './heavy/index.js';
import orchestra from './orchestra/index.js';
import { ROLES, STYLES, MAX_INSTRUMENT_LEVEL, STEPS_PER_BAR } from '../../config.js';
import { PEDAL_BY_ID } from '../pedals.js';

export const INSTRUMENTS = [...beat, ...perc, ...bass, ...chords, ...lead, ...arp, ...heavy, ...orchestra];

// Index a pattern by step so the sequencer can look notes up in O(1). Beat fills and rolls play the
// part's first sound that is not a kick (else the kick).
function index(part, role) {
  part._byStep = [];
  for (const n of part.pattern) (part._byStep[n.s] ||= []).push(n);
  if (role === 'beat') part._fillKind = (part.pattern.find((n) => n.k && n.k !== 'kick') || { k: 'kick' }).k;
}

// Every level's pattern, and the remix's own part (remix.pattern, over remix.steps or the instrument's steps).
function prepare(def) {
  for (const lv of def.levels) index(lv, def.role);
  if (Array.isArray(def.remix?.pattern)) index(def.remix, def.role);
}

const stepErrs = (pattern, steps, where) => (pattern || []).filter((n) => !(Number.isInteger(n.s) && n.s >= 0 && n.s < steps)).map((n) => `${where} note step ${n.s} out of range`);

// Catch authoring mistakes early and loudly.
export function validate(def) {
  const errs = [];
  if (!def.id) errs.push('missing id');
  if (!ROLES.includes(def.role)) errs.push(`bad role ${def.role}`);
  if (!STYLES[def.style]) errs.push(`bad style ${def.style}`);
  if (!Array.isArray(def.levels) || def.levels.length !== MAX_INSTRUMENT_LEVEL) errs.push(`needs ${MAX_INSTRUMENT_LEVEL} levels`);
  if (typeof def.sound !== 'function') errs.push('missing sound()');
  if (typeof def.fire !== 'function') errs.push('missing fire()');
  const steps = def.steps || STEPS_PER_BAR;
  if (steps % STEPS_PER_BAR !== 0) errs.push('steps must be a multiple of 16');
  (def.levels || []).forEach((lv, i) => {
    if (!lv.text) errs.push(`level ${i + 1} missing text`);
    if (!lv.stats) errs.push(`level ${i + 1} missing stats`);
    if (!Array.isArray(lv.pattern) || !lv.pattern.length) errs.push(`level ${i + 1} empty pattern`);
    errs.push(...stepErrs(lv.pattern, steps, `level ${i + 1}`));
  });
  // A remix with a wrong pedal id could never be offered.
  const rm = def.remix;
  if (!rm) errs.push('missing remix');
  else {
    if (!rm.id || !rm.name || !rm.text) errs.push('remix needs id, name and text');
    if (!PEDAL_BY_ID[rm.pedal]) errs.push(`remix pedal ${rm.pedal} unknown`);
    for (const fn of ['fire', 'setup', 'update']) if (rm[fn] && typeof rm[fn] !== 'function') errs.push(`remix ${fn} is not a function`);
    // The remix's own part (optional): played instead of level 5's pattern once remixed.
    if (rm.pattern !== undefined) {
      const rs = rm.steps || steps;
      if (rs % STEPS_PER_BAR !== 0) errs.push('remix steps must be a multiple of 16');
      if (!Array.isArray(rm.pattern) || !rm.pattern.length) errs.push('remix pattern is empty');
      else errs.push(...stepErrs(rm.pattern, rs, 'remix'));
    }
  }
  return errs;
}

for (const def of INSTRUMENTS) {
  const errs = validate(def);
  if (errs.length) console.error(`[instruments] ${def.id}: ${errs.join('; ')}`);
  prepare(def);
  // A remix plays with level 5's stats and its own on top.
  if (def.remix) def.remix.stats = { ...def.levels[MAX_INSTRUMENT_LEVEL - 1]?.stats, ...def.remix.stats };
}

// One sound per channel and style, with unique instrument and remix ids.
for (const role of ROLES) {
  for (const style of Object.keys(STYLES)) {
    const n = INSTRUMENTS.filter((d) => d.role === role && d.style === style).length;
    if (n !== 1) console.error(`[instruments] ${role} x ${style}: ${n ? `${n} sounds` : 'missing'}, needs exactly one`);
  }
}
for (const key of ['id', 'remix']) {
  const seen = new Set();
  for (const def of INSTRUMENTS) {
    const id = key === 'id' ? def.id : def.remix?.id;
    if (id && seen.has(id)) console.error(`[instruments] duplicate ${key === 'id' ? 'instrument' : 'remix'} id ${id}`);
    seen.add(id);
  }
}

export const BY_ID = Object.fromEntries(INSTRUMENTS.map((d) => [d.id, d]));
export const byRole = (role) => INSTRUMENTS.filter((d) => d.role === role);
