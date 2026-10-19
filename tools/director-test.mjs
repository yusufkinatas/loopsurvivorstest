// Opening pacing and safety checks. Run with: node --test tools/director-test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/game.js';
import { Sequencer } from '../src/music/sequencer.js';
import { botMove } from '../src/bot.js';

function fixture({ density = 1, seed = 19, start = 'kick808' } = {}) {
  const clock = { t: 0, sim: true, now() { return this.t; } };
  const seq = new Sequencer(clock, null);
  const game = new Game({ clock, seq, opts: { sim: true, density, solo: true } });
  game.newRun({ seed, start, keyIndex: 0 });
  return { game, clock, seq };
}

test('the opening is a safe, visible front arc with a long spawn tell', () => {
  const { game } = fixture();
  game.player.x = 70;
  game.player.y = -40;
  game.player.faceX = 0;
  game.player.faceY = -1;
  game.director.onBeat({ beat: 0, bar: 0 });
  assert.equal(game.enemies.length, 5);
  for (const enemy of game.enemies) {
    const dx = enemy.x - game.player.x, dy = enemy.y - game.player.y;
    const distance = Math.hypot(dx, dy);
    assert.ok(distance >= 249.99 && distance <= 290.01);
    assert.ok(dx * game.player.faceX + dy * game.player.faceY > 0, 'retreat remains open');
    assert.equal(enemy.type, 'static');
    assert.equal(enemy.spawnT, 0.7);
  }
  for (let i = 0; i < game.enemies.length; i++) {
    for (let j = i + 1; j < game.enemies.length; j++) {
      const a = game.enemies[i], b = game.enemies[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 100, 'the targets stay clearly separated');
    }
  }
});

test('the close opening does not repeat on subsequent beats or after a pause', () => {
  const { game } = fixture();
  game.director.onBeat({ beat: 0, bar: 0 });
  const opening = new Set(game.enemies);
  game.pause();
  game.unpause();
  game.director.onBeat({ beat: 1, bar: 0 });
  assert.ok(game.enemies.length > 5, 'ordinary population filling resumes');
  const close = game.enemies.filter((e) => Math.hypot(e.x, e.y) < 400);
  assert.equal(close.length, 5);
  for (const enemy of close) assert.ok(opening.has(enemy));
  for (const enemy of game.enemies.filter((e) => !opening.has(e))) assert.ok(Math.hypot(enemy.x, enemy.y) > 700);
});

test('density zero creates no opening and fractional density reduces the group', () => {
  const empty = fixture({ density: 0 }).game;
  empty.director.onBeat({ beat: 0, bar: 0 });
  empty.director.onBeat({ beat: 1, bar: 0 });
  assert.equal(empty.enemies.length, 0);
  const light = fixture({ density: 0.5 }).game;
  light.director.onBeat({ beat: 0, bar: 0 });
  assert.equal(light.enemies.length, 3);
  const dense = fixture({ density: 3 }).game;
  dense.director.onBeat({ beat: 0, bar: 0 });
  assert.equal(dense.enemies.length, 5, 'even a dense debug run starts with a safe group');
});

test('a new run rearms the opening, and late debug starts keep ordinary spawns', () => {
  const { game } = fixture();
  game.director.onBeat({ beat: 0, bar: 0 });
  const layout = game.enemies.map(({ x, y }) => [x, y]);
  game.newRun({ seed: 20 });
  assert.equal(game.director.openingSpawned, false);
  game.director.onBeat({ beat: 0, bar: 0 });
  assert.equal(game.enemies.length, 5);
  assert.ok(game.enemies.every((e) => e.spawnT === 0.7));
  assert.deepEqual(game.enemies.map(({ x, y }) => [x, y]), layout, 'opening layout is deterministic');
  const late = fixture().game;
  late.time = 60;
  late.director.onBeat({ beat: 0, bar: 30 });
  assert.ok(late.enemies.every((e) => Math.hypot(e.x, e.y) > 700));
});

test('the first beat exposes targets and the first kick kill arrives within four seconds', () => {
  const { game, clock, seq } = fixture();
  let firstSeen = null, firstKill = null;
  for (let i = 0; i < 4 * 60; i++) {
    clock.t += 1 / 60;
    seq.tick();
    game.step(1 / 60, { x: 0, y: 0 });
    if (game.enemies.length && firstSeen === null) firstSeen = game.time;
    if (game.kills && firstKill === null) firstKill = game.time;
  }
  assert.ok(firstSeen > 0 && firstSeen < 0.2, `targets appeared at ${firstSeen}`);
  assert.ok(firstKill > 0.7 && firstKill < 4, `first kill happened at ${firstKill}`);
  assert.equal(game.player.hp, game.player.maxHp);
});

test('all three starting sounds can reach their first upgrade in the opening fifteen seconds', () => {
  for (const start of ['kick808', 'upright', 'squarelead']) {
    const { game, clock, seq } = fixture({ seed: 1, start });
    for (let i = 0; i < 15 * 60 && game.level === 1; i++) {
      clock.t += 1 / 60;
      seq.tick();
      game.step(1 / 60, botMove(game));
    }
    assert.equal(game.level, 2, `${start} should get its first upgrade promptly`);
    assert.ok(game.time >= 5 && game.time <= 15, `${start} reached level two at ${game.time}`);
    assert.equal(game.player.hp, game.player.maxHp, `${start} opening should leave safe movement choices`);
  }
});
