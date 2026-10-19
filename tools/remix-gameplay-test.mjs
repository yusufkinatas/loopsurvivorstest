// Regression coverage for consequential choices: earned rewards, build tradeoffs and rhythm power.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/game.js';
import { Sequencer } from '../src/music/sequencer.js';
import { updateSpotlights } from '../src/game/spotlights.js';
import { REMIX_BY_ID } from '../src/game/remixes.js';
import { applyOffer } from '../src/game/upgrades.js';
import { spawnEnemy } from '../src/game/enemies.js';
import { autopick, botMove } from '../src/bot.js';

function fixture() {
  const clock = { t: 0, sim: true, now() { return this.t; } };
  const seq = new Sequencer(clock, null);
  const game = new Game({ clock, seq, opts: { sim: true, density: 0, god: true } });
  game.newRun({ seed: 31, start: 'kick808', keyIndex: 0 });
  // Combat-specific tests supply their own targets. Empty channels prevent incidental notes
  // from changing the state whose gameplay contract a test is checking.
  for (const role in game.loadout.channels) game.loadout.channels[role] = null;
  game.onLoadoutChanged();
  seq.tick();
  const step = (dt, move = { x: 0, y: 0 }) => {
    clock.t += dt;
    seq.tick();
    game.step(dt, move);
  };
  const advance = (seconds) => {
    for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += 1 / 60) step(Math.min(1 / 60, seconds - elapsed));
  };
  return { game, clock, seq, step, advance };
}

function grant(game, id) { applyOffer(game, { kind: 'remix', remix: REMIX_BY_ID[id] }); }
function stage(game) {
  game.time = 12;
  updateSpotlights(game, 0);
  return game.spotlight;
}
function enter(game) {
  game.player.x = game.spotlight.x;
  game.player.y = game.spotlight.y;
  game.player.vx = game.player.vy = 0;
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} should equal ${b}`);

test('the first spotlight offers a reachable destination and captures only active time inside it', () => {
  const { game, advance } = fixture();
  advance(11.9);
  assert.equal(game.spotlight, null);
  advance(0.2);
  const s = game.spotlight;
  assert.ok(s);
  near(Math.hypot(s.x - game.player.x, s.y - game.player.y), 270);
  advance(1);
  assert.equal(s.progress, 0);
  enter(game);
  advance(2);
  near(s.progress, 2);
  assert.equal(s.entered, true);
  game.player.x += s.r * 3;
  advance(1);
  near(s.progress, 2);
  const time = s.remaining;
  game.pause();
  advance(3);
  near(s.remaining, time);
  near(s.progress, 2);
  game.unpause();
  enter(game);
  advance(4);
  assert.equal(game.spotlight, null);
  assert.equal(game.spotlightsCleared, 1);
  assert.equal(game.dropCharge, 80);
  assert.equal(game.state, 'levelup');
  assert.equal(game.draftKind, 'remix');
  assert.equal(game.offers.length, 3);
  assert.ok(game.offers.every((o) => o.kind === 'remix'));
});

test('expiring an optional stage costs no health and cannot award late capture time', () => {
  const { game } = fixture();
  const s = stage(game);
  enter(game);
  s.progress = 1;
  s.remaining = 2;
  const hp = game.player.hp;
  updateSpotlights(game, 5);
  assert.equal(game.spotlight, null);
  assert.equal(game.spotlightsCleared, 0);
  assert.equal(game.spotlightsMissed, 1);
  assert.equal(game.pendingRemixes, 0);
  assert.equal(game.dropCharge, 0);
  assert.equal(game.player.hp, hp);
  assert.ok(game.nextSpotlight > game.time);
});

test('a captured remix is chosen once, survives pause and cannot consume a normal upgrade', () => {
  const { game, step } = fixture();
  stage(game);
  enter(game);
  updateSpotlights(game, 6);
  game.pendingLevels = 1;
  step(1 / 60);
  const id = game.offers[0].remix.id;
  const rerolls = game.rerolls;
  assert.equal(game.reroll(), null);
  assert.equal(game.rerolls, rerolls);
  game.choose(0);
  assert.deepEqual(game.remixes, [id]);
  assert.equal(game.pendingRemixes, 0);
  assert.equal(game.pendingLevels, 1);
  assert.equal(game.draftKind, 'upgrade');
  game.choose(0);
  assert.equal(game.pendingLevels, 0);
  assert.equal(game.state, 'playing');
  game.choose(0);
  assert.deepEqual(game.remixes, [id]);
  game.pause();
  game.unpause();
  assert.deepEqual(game.remixes, [id]);
  game.newRun({ seed: 31 });
  assert.deepEqual(game.remixes, []);
  assert.equal(game.spotlightsCleared, 0);
});

test('the fourth spotlight gives recovery and an ordinary upgrade without a fourth remix', () => {
  const { game, step } = fixture();
  for (const id of ['aftershock', 'magnet', 'cascade']) grant(game, id);
  game.player.hp = 40;
  stage(game);
  enter(game);
  updateSpotlights(game, 6);
  near(game.player.hp, 60);
  step(1 / 60);
  assert.equal(game.draftKind, 'upgrade');
  assert.equal(game.remixes.length, 3);
  assert.equal(game.pendingRemixes, 0);
  assert.equal(game.pendingLevels, 1);
});

test('perfect rhythm changes combat and Drop charge, and its power freezes while paused', () => {
  const { game, clock, advance } = fixture();
  clock.t = 0.12;
  const baseline = game.dmg(100);
  assert.equal(game.requestDash({ x: 1, y: 0 }), true);
  assert.equal(game.player.dashPerfect, true);
  near(game.dmg(100), baseline * 1.35);
  assert.equal(game.dropCharge, 8);
  game.pause();
  advance(2);
  near(game.powerT, 1.2);
  game.unpause();
  advance(1.25);
  near(game.dmg(100), baseline);
});

test('groove and Magnetic Groove improve collected charge without multiplying XP', () => {
  const { game } = fixture();
  grant(game, 'magnet');
  game.xpNeed = 1000;
  for (let i = 0; i < 50; i++) game._chainKill();
  game.collect({ kind: 'xp', value: 10 });
  near(game.xp, 10);
  near(game.dropCharge, 15.5);
  game.dropCharge = game.dropMax - 1;
  game.collect({ kind: 'xp', value: 10 });
  assert.equal(game.dropCharge, game.dropMax);
});

test('Glass Cannon and Front Row deliver the advertised damage/safety tradeoffs', () => {
  const { game } = fixture();
  grant(game, 'glass');
  near(game.dmg(100), 135);
  assert.equal(game.player.maxHp, 80);
  assert.equal(game.player.hp, 80);
  grant(game, 'spotlight');
  game.stats.crit = 0;
  for (const [x, damage] of [[100, 140], [300, 90]]) {
    const enemy = spawnEnemy(game, 'hum', x, 0);
    enemy.hp = enemy.maxHp = 1000;
    game.hit(enemy, 100);
    near(1000 - enemy.hp, damage);
  }
});

test('Sustain heals only on rhythm and charges its off-beat recovery tradeoff', () => {
  const { game, clock } = fixture();
  grant(game, 'sustain');
  game.player.hp = 50;
  game.requestDash({ x: 1, y: 0 });
  near(game.player.hp, 50);
  near(game.player.dashCooldown, 2.8);
  game.player.dashT = game.player.dashCooldown = 0;
  clock.t = 0.12;
  game.requestDash({ x: 1, y: 0 });
  near(game.player.hp, 53);
  near(game.player.dashCooldown, 1.8);
});

test('Cascade charges once per kill and empowers the actual Drop, with paused and expiring power', () => {
  const { game, step, advance } = fixture();
  grant(game, 'cascade');
  const enemy = spawnEnemy(game, 'static', 1000, 1000);
  enemy.xp = 0;
  game.kill(enemy);
  assert.equal(game.dropCharge, 1);
  game.kill(enemy);
  assert.equal(game.dropCharge, 1, 'a corpse cannot fuel a second Drop');
  game.dropCharge = game.dropMax - 0.5;
  const other = spawnEnemy(game, 'static', 1000, 1000);
  other.xp = 0;
  game.kill(other);
  assert.equal(game.dropCharge, game.dropMax);
  const damage = game.dmg(100);
  assert.equal(game.requestDrop(), true);
  assert.equal(game.encoreT, 0, 'queuing the musical build does not start the reward');
  for (let i = 0; i < 6 * 60 && game.drops === 0; i++) step(1 / 60);
  assert.equal(game.drops, 1);
  near(game.dmg(100), damage * 1.5);
  const remaining = game.encoreT;
  game.pause();
  advance(2);
  near(game.encoreT, remaining);
  game.unpause();
  advance(5.1);
  assert.equal(game.encoreT, 0);
  near(game.dmg(100), damage);
});

test('an exposed boss takes 50 percent more damage only during its recovery window', () => {
  const { game, step } = fixture();
  game.stats.crit = 0;
  const boss = spawnEnemy(game, 'drone', 600, 0);
  boss.spawnT = 0;
  boss.exposedT = 0.25;
  const hp = boss.hp;
  game.hit(boss, 100);
  near(hp - boss.hp, 150);
  step(0.3);
  assert.equal(boss.exposedT, 0);
  game.hit(boss, 100);
  near(hp - boss.hp, 250);
});

test('Aftershock damages targets on landing once; timing the dash increases its impact', () => {
  const damageFor = (perfect) => {
    const { game, clock, step } = fixture();
    grant(game, 'aftershock');
    game.stats.crit = 0;
    const e = spawnEnemy(game, 'hum', 180, 0);
    e.hp = e.maxHp = 1000;
    e.spawnT = 0;
    e.speed = 0;
    if (perfect) clock.t = 0.12;
    game.requestDash({ x: 1, y: 0 });
    step(0.1);
    assert.equal(e.hp, 1000);
    step(0.1);
    const damage = 1000 - e.hp;
    assert.ok(damage > 0);
    step(0.1);
    near(1000 - e.hp, damage);
    return damage;
  };
  assert.ok(damageFor(true) > damageFor(false) * 2);
});

test('the bot pursues a feasible spotlight and cannot dash while a draft is open', () => {
  const { game, step } = fixture();
  game.level = 2;
  const s = stage(game);
  const before = Math.hypot(s.x - game.player.x, s.y - game.player.y);
  for (let i = 0; i < 90; i++) step(1 / 60, botMove(game));
  assert.ok(Math.hypot(s.x - game.player.x, s.y - game.player.y) < before);
  game.pendingRemixes = 1;
  game.openLevelUp();
  const dashes = game.dashes;
  assert.deepEqual(botMove(game), { x: 0, y: 0 });
  assert.equal(game.dashes, dashes);
  game.player.hp = 20;
  const offers = ['glass', 'sustain', 'spotlight'].map((id) => ({ kind: 'remix', remix: REMIX_BY_ID[id] }));
  assert.equal(offers[autopick(offers, game)].remix.id, 'sustain');
});
