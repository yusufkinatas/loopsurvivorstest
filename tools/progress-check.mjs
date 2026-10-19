// The career rules in src/game/progress.js, checked in Node (no browser): goals, records, the remix crate
// and Gain unlocks.
//   node tools/progress-check.mjs
import assert from 'node:assert/strict';
import { DEFAULT_STARTS, GOALS, RECORDS, newMeta, normalizeMeta, unlockedStarts, applyRun } from '../src/game/progress.js';
import { BY_ID } from '../src/content/instruments/index.js';

const now = Date.UTC(2026, 9, 19);
const sheet = [{ index: 0, band: [['kick808', 1, 0]], pedals: [] }];
const band = (ids) => ids.map((id) => [id, 5, 0]);
const run = (o) => ({
  won: false, time: 300, kills: 5000, score: 60000, level: 25, genre: 'Synthwave', key: 'A minor', keyPc: 9,
  sectionIndex: 4, bossKills: [], staggers: 0, drops: 0, peak: { synth: 0, organic: 0, chip: 0 },
  fullBand: false, fused: false, maxedAll: false, band: [], pedalLv: [], remixes: [], gain: 0, sheet, ...o,
});
const ids = (news) => news.goals.map((g) => g.id);

// Corrupt saves normalize, and a normalized meta survives a second pass unchanged.
for (const raw of [undefined, null, 7, 'x', [], { runs: -3, wins: 'a', kills: NaN, goals: [], records: 5 }]) assert.deepEqual(normalizeMeta(raw), newMeta());
const odd = normalizeMeta({
  runs: 4.5, kills: 1e3, goals: { drone: 5, nope: 1, win: 'x' }, remixes: { flute: 9, nope: 1, upright: -1 }, gainMax: 99, gainSel: 12,
  records: {
    Synthwave: { s: 900, k: 'C minor', kp: 0, w: 1, g: 2, sh: [...sheet, 'bad', { index: 99, band: [] }], d: '2026-10-01' },
    Chiptune: { s: 'lots' }, Fusion: null,
    'Live band': { s: 10, k: 3, kp: 40, w: 7, g: -1, sh: Array.from({ length: 20 }, () => sheet[0]) },
  },
});
assert.equal(odd.runs, 4);
assert.deepEqual(Object.keys(odd.goals), ['drone']);
assert.deepEqual(Object.keys(odd.remixes), ['flute']);
assert.equal(odd.gainMax, 8);
assert.equal(odd.gainSel, 8);
assert.deepEqual(Object.keys(odd.records), ['Synthwave', 'Live band']);
assert.equal(odd.records.Synthwave.sh.length, 1);
assert.deepEqual(odd.records['Live band'], { s: 10, k: '', kp: 0, w: 0, g: 0, sh: odd.records['Live band'].sh, d: '' });
assert.equal(odd.records['Live band'].sh.length, 9);
assert.deepEqual(normalizeMeta(JSON.parse(JSON.stringify(odd))), odd);
assert.equal(normalizeMeta({ gainMax: 3, gainSel: 5 }).gainSel, 3);

// The 15 goals unlock 15 distinct real sounds, none of them a default start, so all 18 open up.
assert.equal(GOALS.length, 15);
const unlocks = GOALS.map((g) => g.unlock);
assert.equal(new Set(unlocks).size, 15);
for (const id of unlocks) assert.ok(BY_ID[id] && !DEFAULT_STARTS.includes(id), id);
assert.equal(new Set([...DEFAULT_STARTS, ...unlocks]).size, Object.keys(BY_ID).length);
assert.equal(RECORDS.length, 13);

// A Chorus II death unlocks only what it earned and presses nothing.
let m = newMeta();
let news = applyRun(m, run({ bossKills: ['drone'], fullBand: true, staggers: 1, sectionIndex: 4 }), { now });
assert.deepEqual(ids(news), ['drone', 'fullband', 'stagger']);
assert.equal(news.record, null);
assert.deepEqual(m.records, {});
assert.equal(news.gain, null);
assert.deepEqual(unlockedStarts(m), [...DEFAULT_STARTS, 'taiko', 'hats909', 'chipdrums']);
assert.deepEqual([m.runs, m.wins, m.kills, m.secs], [1, 0, 5000, 300]);

// A Pure Synthwave win presses gold and unlocks Final chord and Concept album.
const pure = ['kick808', 'hats909', 'subbass', 'supersaw', 'sawlead', 'arpsynth'];
news = applyRun(m, run({ won: true, sectionIndex: 8, genre: 'Pure Synthwave', score: 200000, band: band(pure), bossKills: ['drone', 'clipper', 'glitchking', 'whitenoise'], peak: { synth: 6, organic: 0, chip: 0 }, fullBand: true, maxedAll: true }), { now });
assert.deepEqual(news.record, { genre: 'Pure Synthwave', fresh: true, gold: true, upgraded: false });
assert.ok(ids(news).includes('win') && ids(news).includes('concept') && ids(news).includes('synth4'));
assert.ok(!ids(news).includes('drone'), 'a goal is new only once');
assert.deepEqual(m.records['Pure Synthwave'], { s: 200000, k: 'A minor', kp: 9, w: 1, g: 0, sh: sheet, d: '2026-10-19' });
assert.equal(news.gain, 1, 'the first win at Gain 0 opens Gain 1');
assert.equal(m.gainMax, 1);

// A lower score never replaces a record, a demo never replaces gold, and a gold run upgrades a demo.
const finale = (o) => run({ sectionIndex: 8, genre: 'Synthwave', ...o });
applyRun(m, finale({ score: 90000 }), { now });
assert.equal(applyRun(m, finale({ score: 80000 }), { now }).record, null);
assert.equal(m.records.Synthwave.s, 90000);
assert.deepEqual(applyRun(m, finale({ score: 95000 }), { now }).record, { genre: 'Synthwave', fresh: false, gold: false, upgraded: false });
assert.deepEqual(applyRun(m, finale({ score: 70000, won: true, gain: 0 }), { now }).record, { genre: 'Synthwave', fresh: false, gold: true, upgraded: true });
assert.equal(applyRun(m, finale({ score: 500000 }), { now }).record, null);
assert.equal(m.records.Synthwave.w, 1);
// Box set: three different records.
assert.ok(ids(applyRun(m, finale({ genre: 'Chiptune' }), { now })).includes('boxset'));

// Gain only rises on a win played at the highest Gain open.
m = normalizeMeta({ gainMax: 3, gainSel: 2 });
assert.equal(applyRun(m, run({ won: true, gain: 2 }), { now }).gain, null);
assert.equal(applyRun(m, run({ won: false, gain: 3 }), { now }).gain, null);
assert.equal(applyRun(m, run({ won: true, gain: 3 }), { now }).gain, 4);
assert.equal(m.gainMax, 4);
m.gainMax = 8;
assert.equal(applyRun(m, run({ won: true, gain: 8 }), { now }).gain, null);
assert.equal(m.gainMax, 8);

// Crate digger counts remixes across runs, and a remix is new only once.
m = newMeta();
const rx = (...r) => run({ remixes: r.map((id) => ({ id, name: BY_ID[id].name, remix: BY_ID[id].remix.name })) });
news = applyRun(m, rx('flute', 'kick808', 'upright'), { now });
assert.deepEqual(news.remixes, ['flute', 'kick808', 'upright']);
assert.ok(ids(news).includes('remix') && !ids(news).includes('crate'));
assert.deepEqual(applyRun(m, rx('flute', 'taiko', 'musicbox'), { now }).remixes, ['taiko', 'musicbox']);
assert.ok(!m.goals.crate);
news = applyRun(m, rx('chiparp'), { now });
assert.ok(ids(news).includes('crate'));

// A summary with fields missing never throws and earns nothing it cannot show.
for (const sum of [{}, { won: true }, { sectionIndex: 8 }, { remixes: [null, { id: 'nope' }] }, { band: 'x', peak: null, bossKills: 7 }]) {
  m = newMeta();
  news = applyRun(m, sum, { now });
  assert.equal(m.runs, 1);
  assert.ok(Number.isFinite(m.kills) && Number.isFinite(m.secs));
  assert.equal(news.record, null);
  assert.deepEqual(news.remixes, []);
}

console.log('progress-check: ok');
