// Boss recovery windows and the musical schedule. Run: node --test tools/bosses-test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnEnemy, enemiesOnBeat, updateEnemies } from '../src/game/enemies.js';
import { Song, SECTIONS, FINALE_BAR } from '../src/music/song.js';
import { BAR_SEC, BEAT_SEC } from '../src/config.js';

function fixture(type) {
  const game = {
    time: 0, player: { x: 0, y: 0, r: 14 }, enemies: [], shots: [], beatPulse: 0,
    fx: { particles() {} }, grid: { query() {} }, banners: [], hits: [],
    onBossSpawn() {},
    banner(...args) { this.banners.push(args); },
    hurt(...args) { this.hits.push(args); },
  };
  const boss = spawnEnemy(game, type, 800, 0);
  const beat = (bar, value) => enemiesOnBeat(game, { bar, beat: value });
  const advance = (seconds) => {
    // Keep the same small updates as the game, including the frame where recovery ends.
    for (let left = seconds; left > 1e-9; left -= 1 / 60) {
      const dt = Math.min(left, 1 / 60);
      game.time += dt;
      updateEnemies(game, dt);
    }
  };
  return { game, boss, beat, advance };
}

test('the song reaches bosses promptly and every section stays on a four-bar phrase', () => {
  const song = new Song(0);
  assert.equal(song.position(32).section.boss, 'drone');
  assert.equal(32 * BAR_SEC, 64);
  assert.equal(song.position(80).section.boss, 'clipper');
  assert.equal(song.position(144).section.boss, 'glitchking');
  assert.equal(FINALE_BAR * BAR_SEC, 336);
  assert.equal(song.position(FINALE_BAR).section.boss, 'whitenoise');
  for (const section of SECTIONS.slice(0, -1)) assert.equal(section.bars % 4, 0);
});

test('spawn tells cannot start boss attacks or recovery windows', () => {
  for (const type of ['drone', 'clipper', 'glitchking', 'whitenoise']) {
    const { game, boss, beat, advance } = fixture(type);
    for (let bar = 0; bar < 4; bar++) {
      for (let value = 0; value < 4; value++) beat(bar, value);
    }
    advance(0.2);
    assert.equal(boss.x, 800, type);
    assert.equal(boss.y, 0, type);
    assert.equal(boss.exposedT, 0, type);
    assert.deepEqual(boss.ai, {}, type);
    assert.equal(game.shots.length, 0, type);
    assert.equal(game.enemies.length, 1, type);
    assert.equal(game.banners.length, 0, type);
    assert.equal(game.hits.length, 0, type);
  }
});

test('the Drone commits to its warned lane and exposes only after finishing the charge', () => {
  const { game, boss, beat, advance } = fixture('drone');
  boss.spawnT = 0;
  beat(32, 3);
  const warned = boss.ai.chargeWarn.a;
  game.player.y = 300;
  beat(33, 0);
  assert.equal(boss.ai.chargeA, warned, 'dodging the warning changes the outcome');
  advance(0.5);
  assert.equal(boss.exposedT, 0);
  advance(0.27);
  assert.ok(boss.exposedT > 2.45 && boss.exposedT <= 2.5);
  assert.ok(Math.abs(boss.x - (800 + Math.cos(warned) * boss.speed * 3.4 * 0.75)) < 1);
  assert.ok(Math.abs(boss.y) < 1);
  assert.equal(game.banners.length, 1);
  assert.match(game.banners[0][0], /\+50% damage/, 'the compact title explains the reward');
  beat(34, 0);
  assert.equal(game.enemies.length, 1, 'recovery also pauses summons');
  advance(2.5);
  beat(36, 3);
  beat(37, 0);
  advance(0.77);
  assert.ok(boss.exposedT > 0);
  assert.equal(game.banners.length, 1, 'the instruction is shown only once per boss');
});

test('the Clipper earns a bounded opening after its heavy salvo, then resumes firing', () => {
  const { game, boss, beat, advance } = fixture('clipper');
  boss.spawnT = 0;
  beat(0, 2);
  assert.equal(game.shots.length, 14);
  assert.equal(boss.exposedT, 0, 'ordinary salvos do not expose the boss');
  beat(1, 2);
  assert.equal(game.shots.length, 34);
  assert.equal(boss.exposedT, 1.75);
  const before = boss.x;
  advance(0.25);
  assert.ok(Math.abs((before - boss.x) - boss.speed * 0.25 * 0.25) < 1e-8);
  beat(2, 0);
  assert.equal(game.shots.length, 34, 'old shots remain, but recovery adds none');
  advance(1.51);
  assert.equal(boss.exposedT, 0);
  beat(2, 2);
  assert.equal(game.shots.length, 48, 'normal firing resumes after recovery');
});

test('heavy radial attacks warn for a beat and fire along the marked lanes', () => {
  for (const [type, bar, count] of [['clipper', 1, 20], ['whitenoise', 3, 28]]) {
    const { game, boss, beat, advance } = fixture(type);
    boss.spawnT = 0;
    beat(bar, 1);
    const warning = { ...boss.ai.radialWarn };
    assert.equal(warning.t, BEAT_SEC);
    assert.equal(warning.duration, BEAT_SEC);
    assert.equal(warning.n, count);
    assert.equal(game.shots.length, 0, 'the tell precedes the attack');
    assert.equal(boss.exposedT, 0);
    advance(BEAT_SEC / 2);
    assert.ok(boss.ai.radialWarn.t > 0 && boss.ai.radialWarn.t < BEAT_SEC);
    beat(bar, 2);
    assert.equal(game.shots.length, count);
    game.shots.forEach((shot, index) => {
      const angle = warning.offset + index / count * Math.PI * 2;
      const speed = Math.hypot(shot.vx, shot.vy);
      assert.ok(Math.abs(shot.vx / speed - Math.cos(angle)) < 1e-9);
      assert.ok(Math.abs(shot.vy / speed - Math.sin(angle)) < 1e-9);
    });
    assert.equal(boss.ai.radialWarn, null, 'the warning clears when the attack fires');
    assert.ok(boss.exposedT > 0);
  }
});

test('the Glitch King exposes at the telegraphed destination and pauses aimed shots', () => {
  const { game, boss, beat } = fixture('glitchking');
  boss.spawnT = 0;
  beat(2, 0);
  const destination = { ...boss.ai.blinkTo };
  assert.equal(boss.exposedT, 0, 'a warning is not yet an opening');
  beat(2, 2);
  assert.equal(boss.x, destination.x);
  assert.equal(boss.y, destination.y);
  assert.equal(boss.exposedT, 1.5);
  assert.equal(game.shots.length, 20);
  beat(2, 3);
  assert.equal(game.shots.length, 20);
});

test('White Noise pauses both beat salvos and its continuous spiral while exposed', () => {
  const { game, boss, beat, advance } = fixture('whitenoise');
  boss.spawnT = 0;
  boss.hp = boss.maxHp * 0.5;
  beat(2, 0);
  advance(0.3);
  assert.ok(game.shots.length > 18, 'phase two emits its spiral normally');
  beat(3, 2);
  const count = game.shots.length;
  assert.equal(boss.exposedT, 1.5);
  advance(0.5);
  beat(4, 0);
  assert.equal(game.shots.length, count, 'no spiral or salvos during the opening');
  advance(1.01);
  beat(5, 0);
  assert.ok(game.shots.length > count, 'firing restarts after the opening');
  assert.equal(boss.ai.spiral, true);
});

test('bosses spend most of a sustained fight outside recovery', () => {
  for (const type of ['drone', 'clipper', 'glitchking', 'whitenoise']) {
    const { boss, beat, advance } = fixture(type);
    boss.spawnT = 0;
    let recovering = 0;
    const beats = 64;
    for (let step = 0; step < beats; step++) {
      beat(Math.floor(step / 4), step % 4);
      for (let frame = 0; frame < 30; frame++) {
        if (boss.exposedT > 0) recovering += 1 / 60;
        advance(1 / 60);
      }
    }
    const share = recovering / (beats * BEAT_SEC);
    assert.ok(share > 0.1 && share < 0.45, `${type} recovery occupies ${(share * 100).toFixed(1)}% of a fight`);
  }
});
