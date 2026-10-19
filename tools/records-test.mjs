import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCareer, updateCareer, RECORDS } from '../src/game/records.js';
import { loadCareer, recordRun, saveSettings, loadSettings, saveBest, loadBest } from '../src/storage.js';

const set = { won: false, time: 62, kills: 30, bestCombo: 25, perfectDashes: 2, instruments: [{ id: 'kick808', role: 'beat', active: true }] };

test('a set earns records and discovers sounds without mutating the previous career', () => {
  const previous = emptyCareer();
  const { career, newRecords } = updateCareer(previous, set);
  assert.deepEqual(newRecords.map((r) => r.id), ['first-set', 'crowd-control']);
  assert.equal(career.runs, 1);
  assert.equal(career.perfectDashes, 2);
  assert.deepEqual(career.discovered, ['kick808']);
  assert.deepEqual(previous, emptyCareer());
  const second = updateCareer(career, set);
  assert.equal(second.newRecords.length, 0);
  assert.equal(second.career.kills, 60);
  assert.equal(second.career.discovered.length, 1);
});

test('a complete performance earns every record; retired sounds do not count as active channels', () => {
  const instruments = ['beat', 'perc', 'bass', 'chords', 'lead', 'arp'].map((role) => ({ id: role, role, active: true }));
  const result = updateCareer(emptyCareer(), { ...set, won: true, kills: 1000, perfectDashes: 10, instruments });
  assert.equal(result.career.records.length, RECORDS.length);
  assert.equal(result.career.wins, 1);
  instruments[0].active = false;
  assert.ok(!updateCareer(emptyCareer(), { ...set, instruments }).career.records.includes('full-band'));
});

test('career, settings and personal best coexist and survive a reload', () => {
  const data = new Map();
  globalThis.window = { localStorage: { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) } };
  saveSettings({ volume: 0.35 });
  saveBest({ ...set, score: 1000, level: 5, section: 'Verse' });
  recordRun(set);
  assert.equal(loadSettings().volume, 0.35);
  assert.equal(loadBest().score, 1000);
  assert.equal(loadCareer().runs, 1);
  data.set('loop-survivors:v1', 'null');
  assert.deepEqual(loadCareer(), emptyCareer());
  data.set('loop-survivors:v1', JSON.stringify({ career: { runs: -4, records: ['invalid', 'first-set', 'first-set'], discovered: 'oops' } }));
  assert.equal(loadCareer().runs, 0);
  assert.deepEqual(loadCareer().records, ['first-set']);
});

test('unavailable storage never interrupts a run', () => {
  globalThis.window = { localStorage: { getItem() { throw new Error('unavailable'); }, setItem() { throw new Error('unavailable'); } } };
  assert.doesNotThrow(() => recordRun(set));
  assert.deepEqual(loadCareer(), emptyCareer());
});
