// Instrument registry. Each role file exports an array of three definitions (Synth, Live, 8-Bit).

import beat from './beat.js';
import perc from './perc.js';
import bass from './bass.js';
import chords from './chords.js';
import lead from './lead.js';
import arp from './arp.js';
import { ROLES, STYLES, MAX_INSTRUMENT_LEVEL, STEPS_PER_BAR } from '../../config.js';
import { PEDAL_BY_ID } from '../pedals.js';

export const INSTRUMENTS = [...beat, ...perc, ...bass, ...chords, ...lead, ...arp];

// Pre-index each level's pattern by step so the sequencer can look notes up in O(1).
function prepare(def) {
  for (const lv of def.levels) {
    lv._byStep = [];
    for (const n of lv.pattern) (lv._byStep[n.s] ||= []).push(n);
  }
}

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
    for (const n of lv.pattern || []) if (!(n.s >= 0 && n.s < steps)) errs.push(`level ${i + 1} note step ${n.s} out of range`);
  });
  // A remix with a wrong pedal id could never be offered.
  const rm = def.remix;
  if (!rm) errs.push('missing remix');
  else {
    if (!rm.id || !rm.name || !rm.text) errs.push('remix needs id, name and text');
    if (!PEDAL_BY_ID[rm.pedal]) errs.push(`remix pedal ${rm.pedal} unknown`);
    for (const fn of ['fire', 'setup', 'update']) if (rm[fn] && typeof rm[fn] !== 'function') errs.push(`remix ${fn} is not a function`);
  }
  return errs;
}

for (const def of INSTRUMENTS) {
  const errs = validate(def);
  if (errs.length) console.error(`[instruments] ${def.id}: ${errs.join('; ')}`);
  prepare(def);
  // A remix plays the level 5 part, so its stats are level 5's with its own on top.
  if (def.remix) def.remix.stats = { ...def.levels[MAX_INSTRUMENT_LEVEL - 1]?.stats, ...def.remix.stats };
}

export const BY_ID = Object.fromEntries(INSTRUMENTS.map((d) => [d.id, d]));
export const byRole = (role) => INSTRUMENTS.filter((d) => d.role === role);
