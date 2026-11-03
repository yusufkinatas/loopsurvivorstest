// The career rules in src/game/progress.js, checked in Node (no browser): goals, records, the remix crate
// and Gain unlocks.
//   node tools/progress-check.mjs
import assert from 'node:assert/strict';
import { DEFAULT_STARTS, GOALS, RECORDS, newMeta, normalizeMeta, unlockedStarts, unlocksOf, unlockLabel, applyRun, nextGoal, lobbySong } from '../src/game/progress.js';
import { SONGS, sectionsOf } from '../src/music/song.js';
import { Sequencer } from '../src/music/sequencer.js';
import { playSheet } from '../src/music/replay.js';
import { BY_ID, INSTRUMENTS } from '../src/content/instruments/index.js';
import { genreName, isFusion } from '../src/game/loadout.js';
import { STYLES } from '../src/config.js';

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
assert.deepEqual(odd.records['Live band'], { s: 10, k: '', kp: 0, w: 0, g: 0, sh: odd.records['Live band'].sh, d: '', sg: 'loop' });
assert.equal(odd.records['Live band'].sh.length, 9);
assert.deepEqual(normalizeMeta(JSON.parse(JSON.stringify(odd))), odd);
assert.equal(normalizeMeta({ gainMax: 3, gainSel: 5 }).gainSel, 3);

// The setlist and first-run fields: songSel stays a song this version has, played keeps only known songs' bits (a
// career with runs has played the loop), seen keeps known sound and pedal ids marked 1 (not Object.prototype names),
// a record's song is known or the loop.
const sel = normalizeMeta({ runs: 0, songSel: 7, played: 2 | 64, seen: { kick808: 1, reverb: 1, nope: 1, upright: 2, flute: true, constructor: 1, toString: 1, hasOwnProperty: 1 }, records: { Duet: { s: 1, sg: 'kazoo' }, Riff: { s: 2, sg: 'loop' } } });
assert.equal(sel.songSel, 2);   // the last of the three songs
assert.equal(sel.played, 2);    // Ode's bit; bit 6 is no song
assert.deepEqual(sel.seen, { kick808: 1, reverb: 1 });
assert.deepEqual([sel.records.Duet.sg, sel.records.Riff.sg], ['loop', 'loop']);
for (const played of ['x', -1, 1.5, null]) assert.equal(normalizeMeta({ played }).played, 0);
assert.equal(normalizeMeta({ runs: 3 }).played, 1);
assert.equal(normalizeMeta({ songSel: -2 }).songSel, 0);
assert.deepEqual(normalizeMeta(JSON.parse(JSON.stringify(sel))), sel);

// The lobby's song: run 1 plays the loop (no stepper), and its end screen names the other songs once. Then the lobby
// starts on the first song not played yet (after the loop Ode, after Ode Korobeiniki), and once every song has been
// played on the one picked last.
{
  const m = newMeta();
  assert.equal(lobbySong(m), 0);
  SONGS.forEach((t, k) => {
    assert.equal(applyRun(m, { songId: t.id }, { now: 1 }).songs, k === 0 && SONGS.length > 1);
    assert.equal(lobbySong(m), k + 1 < SONGS.length ? k + 1 : m.songSel);
  });
  m.songSel = SONGS.length - 1;
  assert.equal(lobbySong(m), SONGS.length - 1);
  // A career that skipped a song (a stepper pick) still gets the first one it has not played.
  assert.equal(lobbySong(normalizeMeta({ runs: 2, played: 1 | (1 << (SONGS.length - 1)) })), SONGS.length > 2 ? 1 : 0);
}

// A record replays in the song it was made in (its sections, ending on its home chord); one without a song, or with
// a song this version does not know, replays in the loop.
{
  const seq = new Sequencer({ now: () => 0 }, null), desk = { applyPedals() {}, setActiveCount() {} };
  const bare = normalizeMeta({ records: { Duet: { s: 1, sh: [{ index: 0, band: [['kick808', 1, 0]] }] } } }).records.Duet;
  for (const [sg, tune] of [[bare.sg, SONGS[0]], ['kazoo', SONGS[0]], [undefined, SONGS[0]], ...SONGS.map((t) => [t.id, t])]) {
    playSheet({ seq, audio: desk, sheet: [{ index: 0, band: [] }, { index: 2, band: [] }], keyPc: 9, songId: sg }).stop();
    const S = seq.song.sections, own = sectionsOf(tune);
    assert.equal(seq.song.tune, tune, String(sg));
    assert.deepEqual([S[0].prog, S[1].prog, S[2].prog], [own[0].prog, own[2].prog, [tune.home]], String(sg));
  }
}

// The 17 goals unlock 27 distinct real sounds (one each, and all six of a style for Heavy and Orchestra), none
// of them a default start, so all 30 open up.
assert.equal(GOALS.length, 17);
const unlocks = GOALS.flatMap(unlocksOf);
assert.equal(new Set(unlocks).size, 27);
for (const id of unlocks) assert.ok(BY_ID[id] && !DEFAULT_STARTS.includes(id), id);
assert.equal(new Set([...DEFAULT_STARTS, ...unlocks]).size, Object.keys(BY_ID).length);
assert.equal(Object.keys(BY_ID).length, 30);
for (const id of ['heavy4', 'orch4']) {
  const g = GOALS.find((x) => x.id === id);
  const style = id === 'heavy4' ? 'heavy' : 'orchestra';
  assert.deepEqual([...unlocksOf(g)].sort(), INSTRUMENTS.filter((d) => d.style === style).map((d) => d.id).sort(), id);
  assert.equal(unlockLabel(g), `all six ${STYLES[style].name} sounds`);
}
assert.equal(unlockLabel(GOALS[0]), 'Taiko Drums');

// The 30 records: unique, every one is a genre some six-channel band ends as (any mix of the five styles), and
// every genre a six-channel band can end as has its sleeve.
assert.equal(RECORDS.length, 30);
assert.equal(new Set(RECORDS.map((r) => r.genre)).size, 30);
const styles = Object.keys(STYLES);
const fullBands = [];
const fill = (i, left, c) => {
  if (i === styles.length - 1) { fullBands.push({ ...c, [styles[i]]: left }); return; }
  for (let n = 0; n <= left; n++) fill(i + 1, left - n, { ...c, [styles[i]]: n });
};
fill(0, 6, {});
assert.equal(fullBands.length, 210);
const genres = new Set(fullBands.map((c) => genreName({ styleCounts: () => c })));
for (const r of RECORDS) assert.ok(genres.has(r.genre), `no band presses ${r.genre}`);
for (const g of genres) assert.ok(RECORDS.some((r) => r.genre === g), `${g} has no sleeve`);
const counts = (o) => ({ ...Object.fromEntries(styles.map((s) => [s, 0])), ...o });
const named = (o) => genreName({ styleCounts: () => counts(o) });
assert.equal(named({}), 'Silence');
assert.equal(named({ heavy: 6 }), 'Pure metal');
assert.equal(named({ heavy: 5, synth: 1 }), 'Heavy metal');
assert.equal(named({ orchestra: 3, chip: 1, synth: 1, heavy: 1 }), 'Chamber orchestra');
// Exactly two styles at 2+ press their crossover whatever the split (the stamp, the record and the twist agree).
assert.equal(named({ orchestra: 3, chip: 2, synth: 1 }), 'Boss theme');
assert.equal(named({ heavy: 4, synth: 2 }), 'Industrial');
assert.equal(named({ synth: 1, organic: 1 }), 'Synth solo');
assert.equal(named({ chip: 4, heavy: 1, orchestra: 1 }), 'Chiptune');
assert.equal(named({ orchestra: 6 }), 'Full symphony');
assert.equal(named({ heavy: 3, orchestra: 3 }), 'Symphonic metal');
assert.equal(named({ orchestra: 3, chip: 3 }), 'Boss theme');
assert.equal(named({ synth: 3, organic: 3 }), 'Indietronica');
assert.equal(named({ heavy: 2, orchestra: 2, chip: 2 }), 'Fusion');
assert.equal(named({ heavy: 2, orchestra: 2, chip: 1, synth: 1 }), 'Symphonic metal');
assert.ok(isFusion(counts({ synth: 2, organic: 2, heavy: 2 })) && !isFusion(counts({ synth: 2, organic: 2, heavy: 1, chip: 1 })));

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
assert.deepEqual(m.records['Pure Synthwave'], { s: 200000, k: 'A minor', kp: 9, w: 1, g: 0, sh: sheet, d: '2026-10-19', sg: 'loop' });
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

// A run marks its song played and every sound (retired ones too) and pedal it took as seen; nextGoal is the first
// goal not met yet.
m = newMeta();
assert.equal(nextGoal(m).name, 'Soundcheck');
applyRun(m, run({ songId: 'loop', bossKills: ['drone'], instruments: [{ id: 'kick808' }, { id: 'taiko' }, { id: 'nope' }, { id: 'constructor' }, null], pedals: [{ id: 'delay' }, { id: 'kazoo' }, { id: 'toString' }] }), { now });
assert.equal(m.played, 1);
assert.deepEqual(m.seen, { kick808: 1, taiko: 1, delay: 1 });
assert.equal(nextGoal(m).name, 'Full band');
for (const g of GOALS) m.goals[g.id] = now;
assert.equal(nextGoal(m), null);

// A summary with fields missing never throws and earns nothing it cannot show.
for (const sum of [{}, { won: true }, { sectionIndex: 8 }, { remixes: [null, { id: 'nope' }] }, { band: 'x', peak: null, bossKills: 7 }]) {
  m = newMeta();
  news = applyRun(m, sum, { now });
  assert.equal(m.runs, 1);
  assert.ok(Number.isFinite(m.kills) && Number.isFinite(m.secs));
  assert.equal(news.record, null);
  assert.deepEqual(news.remixes, []);
}

// Four Heavy sounds at once opens all six Heavy first sounds; the Orchestra goal waits for its own four.
m = newMeta();
news = applyRun(m, run({ peak: { synth: 1, organic: 0, chip: 0, heavy: 4, orchestra: 3 } }), { now });
assert.deepEqual(ids(news), ['heavy4']);
assert.deepEqual(unlockedStarts(m), [...DEFAULT_STARTS, 'doublekick', 'ride', 'dropd', 'powerchords', 'shred', 'pinch']);
news = applyRun(m, run({ peak: { orchestra: 5 } }), { now });
assert.deepEqual(ids(news), ['orch4']);
assert.equal(unlockedStarts(m).length, 15);
// A Pure metal win presses its record and earns Concept album (5+ of one style, here Heavy).
const metal = ['doublekick', 'ride', 'dropd', 'powerchords', 'shred', 'pinch'];
news = applyRun(m, run({ won: true, sectionIndex: 8, genre: 'Pure metal', band: band(metal), peak: { heavy: 6 } }), { now });
assert.deepEqual(news.record, { genre: 'Pure metal', fresh: true, gold: true, upgraded: false });
assert.ok(ids(news).includes('concept'));
// The new styles' remixes go in the crate under their instrument ids.
assert.deepEqual(applyRun(m, rx('doublekick', 'harp'), { now }).remixes, ['doublekick', 'harp']);

// An old save (three styles, no Heavy or Orchestra anywhere) loads unchanged, keeps its starts, and a
// save from a later version with goals, sounds or remixes this one does not know drops just those.
const old = {
  v: 1, runs: 12, wins: 3, kills: 50000, secs: 4000, goals: { drone: 1, synth4: 2, fusion: 3 }, gainMax: 1, gainSel: 1,
  records: { Synthwave: { s: 90000, k: 'A minor', kp: 9, w: 1, g: 0, sh: sheet, d: '2026-10-01' } }, remixes: { flute: 5 },
};
const loaded = normalizeMeta(JSON.parse(JSON.stringify(old)));
assert.deepEqual(loaded, { ...old, songSel: 0, played: 1, seen: {}, records: { Synthwave: { ...old.records.Synthwave, sg: 'loop' } } });
assert.deepEqual(unlockedStarts(loaded), [...DEFAULT_STARTS, 'taiko', 'supersaw', 'musicbox']);
const later = normalizeMeta({ ...old, goals: { ...old.goals, heavy4: 4, kazoo9: 5 }, remixes: { flute: 5, doublekick: 6, kazoo: 7 } });
assert.deepEqual(Object.keys(later.goals), ['drone', 'synth4', 'fusion', 'heavy4']);
assert.deepEqual(Object.keys(later.remixes), ['flute', 'doublekick']);
assert.equal(unlockedStarts(later).length, 12);

console.log('progress-check: ok');
