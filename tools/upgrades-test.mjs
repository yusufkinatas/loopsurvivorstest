import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_INSTRUMENT_LEVEL, MAX_PEDAL_LEVEL, ROLES } from '../src/config.js';
import { INSTRUMENTS } from '../src/content/instruments/index.js';
import { PEDALS } from '../src/content/pedals.js';
import { Loadout } from '../src/game/loadout.js';
import { buildOffers, applyOffer, describeOffer } from '../src/game/upgrades.js';
import { buildRemixOffers, REMIXES, MAX_REMIXES } from '../src/game/remixes.js';
import { seedRng } from '../src/util.js';

function fixture() {
  const loadout = new Loadout();
  loadout.set(INSTRUMENTS[0], 1);
  return {
    loadout, time: 30, remixes: [], changes: 0,
    player: { hp: 10, maxHp: 100, dashCooldown: 2 }, dropCharge: 0, dropMax: 100,
    channelCap() { return 3; },
    addInstrument(def, level) { return loadout.set(def, level); },
    setInstrumentLevel(inst, level) { inst.level = level; },
    onLoadoutChanged() { this.changes++; },
  };
}

const offerKey = (o) => [o.kind, o.def?.id || o.pedal?.id || o.remix?.id, o.level];

test('drafts are seeded and always allow specializing or adding a sound when both are possible', () => {
  const g = fixture();
  for (let seed = 0; seed < 100; seed++) {
    seedRng(seed);
    const offers = buildOffers(g);
    assert.equal(offers.length, 3);
    assert.ok(offers.some((o) => o.kind === 'up'));
    assert.ok(offers.some((o) => o.kind === 'new'));
    assert.ok(offers.every((o) => o.w === undefined || o.w > 0));
    assert.equal(new Set(offers.map((o) => o.def?.id || o.pedal?.id || o.kind)).size, 3);
    seedRng(seed);
    assert.deepEqual(buildOffers(g).map(offerKey), offers.map(offerKey));
  }
});

test('a nearly maxed sound remains an upgrade option and locked channels never appear', () => {
  const g = fixture();
  g.channelCap = () => 1;
  g.loadout.instruments()[0].level = MAX_INSTRUMENT_LEVEL - 1;
  for (let seed = 0; seed < 20; seed++) {
    seedRng(seed);
    const offers = buildOffers(g);
    assert.ok(offers.some((o) => o.kind === 'up' && o.level === MAX_INSTRUMENT_LEVEL));
    assert.ok(offers.every((o) => o.kind !== 'new'));
  }
});

test('swapping a fully upgraded band preserves investment and exhausted drafts offer recovery', () => {
  const g = fixture();
  g.channelCap = () => ROLES.length;
  for (const role of ROLES) g.loadout.set(INSTRUMENTS.find((d) => d.role === role), MAX_INSTRUMENT_LEVEL);
  for (const def of PEDALS.slice(0, 4)) g.loadout.pedals.push({ def, level: MAX_PEDAL_LEVEL });
  const offers = buildOffers(g);
  assert.deepEqual(offers.map((o) => o.kind).sort(), ['heal', 'hype', 'swap']);
  const swap = offers.find((o) => o.kind === 'swap');
  assert.equal(swap.level, MAX_INSTRUMENT_LEVEL);
  assert.match(describeOffer(g, swap).tag, /keep level/);
  applyOffer(g, swap);
  assert.equal(g.loadout.channels[swap.role].def.id, swap.def.id);
  assert.equal(g.loadout.channels[swap.role].level, MAX_INSTRUMENT_LEVEL);
  applyOffer(g, offers.find((o) => o.kind === 'heal'));
  assert.equal(g.player.hp, 50);
  assert.equal(g.player.dashCooldown, 0);
  applyOffer(g, offers.find((o) => o.kind === 'hype'));
  assert.equal(g.dropCharge, g.dropMax);
});

test('remix drafts are seeded, unique and exclude every owned remix', () => {
  const g = fixture();
  g.remixes = ['aftershock', 'glass'];
  seedRng(41);
  const offers = buildRemixOffers(g);
  assert.equal(offers.length, 3);
  assert.equal(new Set(offers.map((o) => o.remix.id)).size, 3);
  assert.ok(offers.every((o) => o.kind === 'remix' && !g.remixes.includes(o.remix.id)));
  seedRng(41);
  assert.deepEqual(buildRemixOffers(g).map(offerKey), offers.map(offerKey));
  assert.equal(describeOffer(g, offers[0]).tag, 'Permanent · slot 3 of 3');
});

test('remix application rejects duplicate, unknown and over-cap rewards', () => {
  const g = fixture();
  const offers = REMIXES.map((remix) => ({ kind: 'remix', remix }));
  applyOffer(g, { kind: 'remix', remix: { id: 'unknown' } });
  applyOffer(g, offers[0]);
  applyOffer(g, offers[0]);
  assert.equal(g.remixes.length, 1);
  assert.equal(g.changes, 1);
  for (const offer of offers.slice(1)) applyOffer(g, offer);
  assert.equal(g.remixes.length, MAX_REMIXES);
  assert.equal(g.changes, MAX_REMIXES);
  assert.deepEqual(buildRemixOffers(g), []);
});
