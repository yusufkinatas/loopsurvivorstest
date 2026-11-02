// The pedals' fit lists (src/content/pedals.js) against the measured matrix (tools/data/pedal-fit.json: each sound
// and remix at level 5 alone on training dummies, its damage with each pedal at 3 over its damage with none, from
// node tools/dummy.mjs). A sound fits a pedal at FIT or more. Exits 1 on any mismatch. Node only, no browser.
//   node tools/fitcheck.mjs
import { readFileSync } from 'node:fs';
import { PEDALS, pedalFits } from '../src/content/pedals.js';
import { INSTRUMENTS } from '../src/content/instruments/index.js';

const FIT = 1.15;
const rows = JSON.parse(readFileSync(new URL('./data/pedal-fit.json', import.meta.url), 'utf8'));
const sounds = INSTRUMENTS.flatMap((def) => [{ def, remix: false }, { def, remix: true }]);
const idOf = (i) => (i.remix ? i.def.remix.id : i.def.id);
const bad = [];
for (const i of sounds) if (!rows.some((r) => r.id === idOf(i))) bad.push(`${idOf(i)}: not measured`);
for (const pd of PEDALS) {
  const measured = rows.length && pd.id in rows[0];
  for (const i of sounds) {
    const fits = pedalFits(pd, i), r = rows.find((x) => x.id === idOf(i));
    if (!measured) { if (fits !== null) bad.push(`${pd.id}: fits a sound but is not measured`); break; }
    if (r && fits !== r[pd.id] >= FIT) bad.push(`${pd.id} ${idOf(i)}: ${r[pd.id]}x but listed as ${fits ? 'a fit' : 'no fit'}`);
  }
  if (Array.isArray(pd.fits)) for (const id of pd.fits) if (!sounds.some((i) => idOf(i) === id)) bad.push(`${pd.id}: unknown id ${id}`);
}
for (const pd of PEDALS) console.log(`${pd.id.padEnd(11)} ${pd.fits === 'all' ? 'all' : Array.isArray(pd.fits) ? `${pd.fits.length} of ${sounds.length}` : 'powers you (no fit)'}`);
console.log(`fitcheck: ${bad.length} mismatches at ${FIT}x${bad.length ? '\n' + bad.join('\n') : ''}`);
process.exit(bad.length ? 1 : 0);
