// Focused gameplay regression checks. No browser or audio device required.
// Run with: node --test tools/gameplay-test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/game.js';
import { Sequencer } from '../src/music/sequencer.js';
import { spawnEnemy } from '../src/game/enemies.js';

function fixture({ latency = 0, sim = true } = {}) {
  const clock = { t: 0, sim: true, now() { return this.t; } };
  const audio = { ready: false, latency };
  const seq = new Sequencer(clock, audio);
  const game = new Game({ audio, clock, seq, opts: { sim, density: 0, solo: true } });
  game.newRun({ seed: 19, start: 'kick808', keyIndex: 0 });
  seq.tick();
  const step = (dt, move = { x: 0, y: 0 }) => {
    clock.t += dt;
    seq.tick();
    game.step(dt, move);
  };
  return { game, seq, clock, step };
}

function kill(game) {
  const enemy = spawnEnemy(game, 'static', 1000, 1000);
  enemy.xp = 0;
  game.kill(enemy, null);
  return enemy;
}

function near(actual, expected, epsilon = 1e-8) {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} should be near ${expected}`);
}

test('dash normalizes input, travels a fixed distance, and stops without unwanted momentum', () => {
  const { game, step } = fixture();
  assert.equal(game.requestDash({ x: 3, y: 4 }), true);
  assert.equal(game.requestDash({ x: -1, y: 0 }), false);
  assert.equal(game.player.dashMaxCooldown, 2.4);
  near(game.player.dashCooldown, 2.4);
  step(0.2);
  const travel = game.stats.speed * 4.6 * 0.18;
  near(game.player.x, travel * 0.6);
  near(game.player.y, travel * 0.8);
  assert.equal(game.player.dashT, 0);
  assert.equal(game.player.vx, 0);
  assert.equal(game.player.vy, 0);
  assert.equal(game.dashes, 1);
  assert.equal(game.perfectDashes, 0);
});

test('dash distance is consistent across frame rates', () => {
  const run = (fps) => {
    const { game, step } = fixture();
    game.requestDash({ x: 1, y: 0 });
    for (let i = 0; i < fps; i++) step(1 / fps);
    return game.player.x;
  };
  near(run(30), run(144));
});

test('dash falls back to facing and ignores invalid direction components', () => {
  const { game } = fixture();
  game.player.faceX = 0;
  game.player.faceY = -1;
  assert.equal(game.requestDash({ x: NaN, y: Infinity }), true);
  assert.equal(game.player.dashX, 0);
  assert.equal(game.player.dashY, -1);
});

test('dash protects the player and their groove, then expires and obeys cooldown', () => {
  const { game, step } = fixture();
  for (let i = 0; i < 10; i++) kill(game);
  game.requestDash();
  const hp = game.player.hp;
  game.hurt(12, null);
  assert.equal(game.player.hp, hp);
  assert.equal(game.combo, 10);
  step(0.24);
  game.hurt(12, null);
  assert.equal(game.player.hp, hp - 12);
  assert.equal(game.combo, 0);
  assert.equal(game.requestDash(), false);
  step(2.2);
  assert.equal(game.requestDash(), true);
});

test('perfect dash accepts either side of the audible beat and refunds cooldown', () => {
  for (const t of [0.04, 0.12, 0.20]) {
    const { game, clock } = fixture();
    clock.t = t;
    const score = game.score();
    assert.equal(game.requestDash(), true);
    assert.equal(game.player.dashPerfect, true, `beat timing at ${t}`);
    near(game.player.dashCooldown, 1.8);
    assert.equal(game.perfectDashes, 1);
    assert.equal(game.score() - score, 25);
  }
  for (const t of [0.039, 0.201, 0.245]) {
    const { game, clock } = fixture();
    clock.t = t;
    game.requestDash();
    assert.equal(game.player.dashPerfect, false, `offbeat timing at ${t}`);
  }
});

test('perfect timing accounts for speaker latency and never treats a sixteenth as a beat', () => {
  const { game, clock } = fixture({ latency: 0.14, sim: false });
  clock.t = 0.26;
  game.requestDash();
  assert.equal(game.player.dashPerfect, true);
  const other = fixture();
  other.clock.t = 0.245;
  other.seq.tick();
  other.game.requestDash();
  assert.equal(other.game.player.dashPerfect, false);
});

test('a perfect dash plays a quiet fifth from the sounding chord', () => {
  const { game, clock, seq } = fixture({ sim: false });
  const sounds = [];
  game.audio.ready = true;
  game.audio.uiBlip = (...args) => sounds.push(args);
  clock.t = 0.12;
  game.requestDash();
  assert.equal(sounds.length, 1);
  const chord = seq.position.chord;
  const midi = 72 + (chord.rootPc + chord.intervals[2]) % 12;
  near(sounds[0][0], 440 * 2 ** ((midi - 69) / 12));
  assert.equal(sounds[0][1], 0.08);
});

test('groove thresholds multiply kill score, leave combat intact and cap at four', () => {
  const { game } = fixture();
  const damage = game.stats.damage;
  const xp = game.xp;
  for (let i = 0; i < 9; i++) kill(game);
  assert.equal(game.comboMultiplier, 1);
  assert.equal(game.grooveBonus, 0);
  const enemy = kill(game);
  assert.equal(game.comboMultiplier, 2);
  assert.equal(game.grooveBonus, 10);
  game.kill(enemy, null);
  assert.equal(game.combo, 10, 'dead enemies cannot be counted twice');
  for (let i = 10; i < 25; i++) kill(game);
  assert.equal(game.comboMultiplier, 3);
  for (let i = 25; i < 75; i++) kill(game);
  assert.equal(game.comboMultiplier, 4);
  assert.equal(game.bestCombo, 75);
  assert.equal(game.comboTimer, 4);
  assert.equal(game.stats.damage, damage);
  assert.equal(game.xp, xp);
  assert.equal(game.grooveBonus, 15 * 10 + 25 * 20 + 26 * 30);
});

test('kill chains refresh on kills, expire after four seconds and preserve the personal best', () => {
  const { game, step } = fixture();
  kill(game);
  step(3.9);
  kill(game);
  assert.equal(game.combo, 2);
  assert.equal(game.comboTimer, 4);
  step(4.01);
  assert.equal(game.combo, 0);
  assert.equal(game.comboTimer, 0);
  assert.equal(game.comboMultiplier, 1);
  assert.equal(game.bestCombo, 2);
  kill(game);
  assert.equal(game.combo, 1);
  assert.equal(game.bestCombo, 2);
});

test('pausing and upgrade screens freeze dash and groove, and reject new dashes', () => {
  const { game, step } = fixture();
  kill(game);
  game.requestDash();
  step(0.04);
  const fields = ['dashT', 'dashCooldown', 'iframes', 'x', 'y'];
  const before = Object.fromEntries(fields.map((key) => [key, game.player[key]]));
  const timer = game.comboTimer;
  assert.equal(game.pause(), true);
  step(2);
  assert.equal(game.requestDash(), false);
  for (const key of fields) assert.equal(game.player[key], before[key]);
  assert.equal(game.comboTimer, timer);
  game.unpause();
  step(0.04);
  assert.ok(game.player.dashCooldown < before.dashCooldown);
  assert.ok(game.comboTimer < timer);
  game._pause('levelup');
  const cooldown = game.player.dashCooldown;
  step(2);
  assert.equal(game.player.dashCooldown, cooldown);
  assert.equal(game.requestDash(), false);
});

test('death and a fresh run cannot retain a dash or kill chain', () => {
  const { game, step } = fixture();
  for (let i = 0; i < 10; i++) kill(game);
  game.player.dashCooldown = 1;
  game.hurt(1000, null);
  assert.equal(game.state, 'dying');
  assert.equal(game.player.dashT, 0);
  assert.equal(game.combo, 0);
  assert.equal(game.bestCombo, 10);
  assert.equal(game.requestDash(), false);
  step(1);
  assert.equal(game.state, 'gameover');
  assert.equal(game.requestDash(), false);
  game.newRun({ seed: 20 });
  assert.equal(game.player.dashCooldown, 0);
  assert.equal(game.player.dashPerfect, false);
  assert.equal(game.bestCombo, 0);
  assert.equal(game.grooveBonus, 0);
  assert.equal(game.dashes, 0);
  assert.equal(game.perfectDashes, 0);
  assert.equal(game.requestDash(), true);
});

test('the result preserves dash accuracy and best groove', () => {
  const { game, clock } = fixture();
  clock.t = 0.12;
  game.requestDash();
  for (let i = 0; i < 12; i++) kill(game);
  const summary = game.summary(false);
  assert.equal(summary.dashes, 1);
  assert.equal(summary.perfectDashes, 1);
  assert.equal(summary.bestCombo, 12);
  assert.equal(summary.grooveBonus, 30);
});
