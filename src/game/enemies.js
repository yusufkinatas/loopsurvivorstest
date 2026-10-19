// The Noise: static, buzz, hum and feedback that want to drown the song out.
// Enemies move to the beat too. They surge on every beat, and some act on specific beats.

import { TAU, rand, rng, pick, dist2, clamp } from '../util.js';
import { STEP_SEC, BEAT_SEC, BAR_SEC } from '../config.js';

export const ENEMY_TYPES = {
  static:   { name: 'Static',   hp: 9,  speed: 64,  r: 11, dmg: 7,  xp: 1, shape: 'square',  color: '#d9d4ea', mass: 1 },
  buzz:     { name: 'Buzz',     hp: 5,  speed: 116, r: 8,  dmg: 5,  xp: 1, shape: 'tri',     color: '#efe59a', mass: 0.6, wiggle: true },
  hum:      { name: 'Hum',      hp: 58, speed: 40,  r: 21, dmg: 14, xp: 4, shape: 'hex',     color: '#aaa3c8', mass: 4 },
  glitch:   { name: 'Glitch',   hp: 20, speed: 56,  r: 12, dmg: 9,  xp: 2, shape: 'glitch',  color: '#94f0ff', mass: 1, blink: true },
  screech:  { name: 'Screech',  hp: 24, speed: 62,  r: 13, dmg: 6,  xp: 3, shape: 'diamond', color: '#ffa3b6', mass: 1, ranged: true },
  feedback: { name: 'Feedback', hp: 34, speed: 50,  r: 16, dmg: 10, xp: 3, shape: 'ring',    color: '#ffd38c', mass: 2, splits: 'static' },
};

export const BOSS_TYPES = {
  drone:      { name: 'The Drone',       hp: 1600,  speed: 40, r: 46, dmg: 18, xp: 80,  shape: 'drone',  color: '#ff9fe2', mass: 40, boss: true },
  clipper:    { name: 'The Clipper',     hp: 3600,  speed: 52, r: 42, dmg: 20, xp: 140, shape: 'clipper', color: '#ffb06a', mass: 40, boss: true },
  glitchking: { name: 'The Glitch King', hp: 12100, speed: 58, r: 44, dmg: 22, xp: 250, shape: 'king',   color: '#8ff3ff', mass: 40, boss: true },
  whitenoise: { name: 'White Noise',     hp: 22800, speed: 46, r: 64, dmg: 26, xp: 0,   shape: 'noise',  color: '#ffffff', mass: 60, boss: true, final: true },
};

let nextId = 1;

export function spawnEnemy(g, type, x, y, opts = {}) {
  const def = ENEMY_TYPES[type] || BOSS_TYPES[type];
  if (!def) return null;
  const minutes = g.time / 60;
  const elite = !!opts.elite;
  const hpMul = def.boss ? 1 + minutes * 0.2 : (1 + minutes * 0.25 + minutes * minutes * 0.09) * (elite ? 9 : 1) * (opts.hpMul ?? 1);
  const e = {
    id: nextId++, type, def, x, y, vx: 0, vy: 0,
    r: def.r * (elite ? 1.55 : 1) * (opts.scale ?? 1),
    hp: def.hp * hpMul, maxHp: def.hp * hpMul,
    speed: def.speed * (1 + minutes * 0.05) * (elite ? 0.9 : 1) * rand(0.92, 1.08),
    dmg: def.dmg * (1 + minutes * 0.1) * (elite ? 1.5 : 1),
    // Notes are worth less as the song fills up, so levels and the Drop keep a steady pace while the crowd grows.
    xp: def.boss ? def.xp : def.xp * (elite ? 10 : 1) / (1 + (minutes / 2.5) ** 2),
    mass: def.mass * (elite ? 5 : 1),
    elite, boss: !!def.boss, color: def.color, shape: def.shape,
    kbx: 0, kby: 0, stun: 0, slow: 0, slowT: 0, flash: 0, dead: false,
    age: 0, phase: rand(0, TAU), ai: {}, spawnT: 0.35,
  };
  g.enemies.push(e);
  if (e.boss) g.onBossSpawn(e);
  return e;
}

// opts.from: the enemy that fired it, so a hit is credited to it by name (damageBy, lastHitBy).
export function enemyShot(g, x, y, angle, speed = 160, dmg = 8, opts = {}) {
  if (g.shots.length > 500) return;
  g.shots.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: opts.r ?? 6, dmg, life: opts.life ?? 5, age: 0, color: opts.color ?? '#ff4d6d', from: opts.from ?? null });
}

function radial(g, e, n, speed, dmg, offset = 0, color) {
  for (let i = 0; i < n; i++) enemyShot(g, e.x, e.y, offset + (i / n) * TAU, speed, dmg, { color, from: e });
}

function summonRing(g, e, type, n, dist) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rand(0, 0.3);
    spawnEnemy(g, type, e.x + Math.cos(a) * dist, e.y + Math.sin(a) * dist, { hpMul: 0.6 });
  }
}

// Called on every beat (beat 0..3 of each bar) while playing.
export function enemiesOnBeat(g, ev) {
  const p = g.player;
  for (const e of g.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    if (e.boss) { bossOnBeat(g, e, ev); continue; }
    if (e.def.blink && ev.beat % 2 === 0 && e.stun <= 0) {
      const d = Math.sqrt(dist2(e.x, e.y, p.x, p.y));
      if (d > 140 && rng() < 0.7) {
        const hop = Math.min(85, d - 90);
        const a = Math.atan2(p.y - e.y, p.x - e.x) + rand(-0.5, 0.5);
        g.fx.particles(e.x, e.y, e.color, 4, 90, 0.3, 2);
        e.x += Math.cos(a) * hop; e.y += Math.sin(a) * hop;
        e.ai.glitchT = 0.18;
      }
    }
    // Screech winds up for a beat (a growing red glow), then fires on beat 3.
    if (e.def.ranged && ev.beat === 1 && (ev.bar + e.id) % 2 === 0 && e.stun <= 0 && dist2(e.x, e.y, p.x, p.y) < 480 * 480) e.ai.windup = BEAT_SEC;
    if (e.def.ranged && ev.beat === 2 && (ev.bar + e.id) % 2 === 0 && e.stun <= 0) {
      const d2 = dist2(e.x, e.y, p.x, p.y);
      if (d2 < 480 * 480) {
        enemyShot(g, e.x, e.y, Math.atan2(p.y - e.y, p.x - e.x), 190, 14 * (1 + g.time / 60 * 0.06), { color: '#ff7a95', from: e });
        e.ai.shootT = 0.2;
      }
    }
  }
}

// The player's Drop knocks a boss off the beat: no attacks and no spiral, and any tell it was showing
// goes away. It lasts a little under two bars, so the boss comes back in on the downbeat of the bar
// after next together with the cue the sequencer schedules ahead of that downbeat (it reads offbeatT).
// Then the boss has four bars to find the groove before another Drop can stagger it again.
export function knockOffBeat(g, e) {
  if (g.time < (e.ai.restaggerAt ?? 0)) return;
  e.ai.offbeatT = 2 * BAR_SEC - 0.4;
  e.ai.restaggerAt = g.time + e.ai.offbeatT + 4 * BAR_SEC;
  e.ai.blinkTo = null;
  e.ai.chargeWarn = null;
  e.ai.spiral = false;     // restarts on a downbeat once the boss is back
  e.ai.spiralAcc = 0;
  g.banner(`${e.def.name} lost the beat`, '', true);
}

function bossOnBeat(g, e, ev) {
  if (e.ai.offbeatT > 0) return;
  const p = g.player;
  const aim = Math.atan2(p.y - e.y, p.x - e.x);
  const frac = e.hp / e.maxHp;
  switch (e.type) {
    case 'drone':
      if (ev.beat === 0 && ev.bar % 2 === 0) summonRing(g, e, 'buzz', 5, e.r + 30);
      // The charge lane is shown for a beat (beat 4), then the Drone dashes along it on the downbeat.
      if (ev.beat === 3 && ev.bar % 4 === 0) e.ai.chargeWarn = { a: aim, t: BEAT_SEC };
      if (ev.beat === 0 && ev.bar % 4 === 1) { e.ai.charge = 0.75; e.ai.chargeA = e.ai.chargeWarn ? e.ai.chargeWarn.a : aim; e.ai.chargeWarn = null; }
      if (ev.beat === 2 && frac < 0.8) radial(g, e, 10, 140, 18, ev.bar * 0.4, '#ff9fe2');
      break;
    case 'clipper':
      if (ev.beat === 0 || ev.beat === 2) radial(g, e, 14, 160, 13, (ev.beat === 2 ? Math.PI / 14 : 0) + ev.bar * 0.13, '#ffb06a');
      if (ev.beat === 0 && ev.bar % 4 === 3) summonRing(g, e, 'static', 6, e.r + 36);
      if (frac < 0.7 && (ev.beat === 1 || ev.beat === 3)) for (let k = -1; k <= 1; k++) enemyShot(g, e.x, e.y, aim + k * 0.22, 200, 13, { color: '#ffd08a', from: e });
      break;
    case 'glitchking': {
      if (ev.beat === 0 && ev.bar % 2 === 0) {
        const a = rand(0, TAU);
        e.ai.blinkTo = { x: p.x + Math.cos(a) * 220, y: p.y + Math.sin(a) * 220 };
        e.ai.blinkSetAt = g.time;
      }
      if (ev.beat === 2 && e.ai.blinkTo) {
        g.fx.particles(e.x, e.y, e.color, 18, 260, 0.5, 3);
        e.x = e.ai.blinkTo.x; e.y = e.ai.blinkTo.y; e.ai.blinkTo = null;
        radial(g, e, 20, 150, 25, rand(0, TAU), '#8ff3ff');
        summonRing(g, e, 'glitch', 4, e.r + 40);
      }
      if (ev.beat === 1 || ev.beat === 3) for (let k = -1; k <= 1; k++) enemyShot(g, e.x, e.y, aim + k * 0.18, 210, 22, { color: '#b9f7ff', from: e });
      break;
    }
    case 'whitenoise': {
      const phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
      if (e.ai.phase !== phase) {
        e.ai.phase = phase;
        e.ai.spiralAcc = 0;
        if (phase > 1) g.banner(phase === 2 ? 'White Noise is getting louder' : 'White Noise is clipping', '', true);
      }
      if (ev.beat === 0 || ev.beat === 2) radial(g, e, phase === 3 ? 22 : 18, 140 + phase * 10, 22, ev.bar * 0.21 + ev.beat, '#ffffff');
      if (ev.beat === 0 && ev.bar % 2 === 0) summonRing(g, e, phase === 3 ? 'hum' : 'static', phase === 3 ? 4 : 8, e.r + 50);
      if (phase >= 2 && ev.beat === 0) e.ai.spiral = true;
      break;
    }
  }
}

function bossUpdate(g, e, dt) {
  const p = g.player;
  if (e.type === 'drone' && e.ai.charge > 0) {
    e.ai.charge -= dt;
    const sp = e.speed * 3.4;
    e.x += Math.cos(e.ai.chargeA) * sp * dt;
    e.y += Math.sin(e.ai.chargeA) * sp * dt;
    return true;
  }
  if (e.type === 'whitenoise' && e.ai.spiral) {
    // Spiral arms on 8th notes. Started on a beat, so it stays on the grid.
    e.ai.spiralAcc = (e.ai.spiralAcc || 0) + dt;
    e.ai.spiralA = (e.ai.spiralA || 0);
    const every = STEP_SEC * 2;
    while (e.ai.spiralAcc >= every) {
      e.ai.spiralAcc -= every;
      e.ai.spiralA += 0.42;
      const arms = e.ai.phase === 3 ? 4 : 3;
      for (let k = 0; k < arms; k++) enemyShot(g, e.x, e.y, e.ai.spiralA + (k / arms) * TAU, 135, 20, { color: '#e6e6ff', r: 5, from: e });
    }
  }
  void p;
  return false;
}

// Movement, separation and contact damage.
export function updateEnemies(g, dt) {
  const p = g.player;
  const hop = 0.62 + 0.75 * g.beatPulse;
  for (const e of g.enemies) {
    if (e.dead) continue;
    e.age += dt;
    // Runs through a boss's spawn-in too, so a Drop on its arrival downbeat staggers it for the same time.
    if (e.ai.offbeatT) e.ai.offbeatT = Math.max(0, e.ai.offbeatT - dt);
    if (e.spawnT > 0) { e.spawnT -= dt; continue; }
    e.flash = Math.max(0, e.flash - dt);
    if (e.ai.glitchT) e.ai.glitchT = Math.max(0, e.ai.glitchT - dt);
    if (e.ai.shootT) e.ai.shootT = Math.max(0, e.ai.shootT - dt);
    if (e.ai.windup) e.ai.windup = Math.max(0, e.ai.windup - dt);
    if (e.ai.chargeWarn) e.ai.chargeWarn.t = Math.max(0, e.ai.chargeWarn.t - dt);
    if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }

    // Knockback impulse decays fast.
    const kd = Math.pow(0.0009, dt);
    e.x += e.kbx * dt; e.y += e.kby * dt;
    e.kbx *= kd; e.kby *= kd;

    if (e.stun > 0) { e.stun -= dt; continue; }
    if (e.boss && bossUpdate(g, e, dt)) continue;

    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    let sp = e.speed * (1 - e.slow) * (e.boss ? 1 : e.def.wiggle ? 1 : hop);
    let ux = dx / d, uy = dy / d;
    if (e.def.ranged) {
      if (d < 200) { ux = -ux; uy = -uy; }
      else if (d < 270) { const t = ux; ux = -uy; uy = t; sp *= 0.6; }
    }
    if (e.def.wiggle) {
      const w = Math.sin(e.age * 7 + e.phase) * 0.6;
      const tx = -uy, ty = ux;
      ux += tx * w; uy += ty * w;
    }
    e.x += ux * sp * dt; e.y += uy * sp * dt;
  }

  // Soft separation so crowds read as a swarm instead of a single blob.
  for (const e of g.enemies) {
    if (e.dead || e.boss) continue;
    let px = 0, py = 0, n = 0;
    g.grid.query(e.x, e.y, e.r * 2, (o) => {
      if (o === e || o.dead) return;
      const rr = e.r + o.r;
      const ddx = e.x - o.x, ddy = e.y - o.y;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 > 0.01 && d2 < rr * rr) {
        const d = Math.sqrt(d2);
        const push = (rr - d) / rr;
        const w = o.boss ? 3 : o.mass / (o.mass + e.mass);
        px += (ddx / d) * push * w; py += (ddy / d) * push * w;
        n++;
        if (n > 6) return false;
      }
    });
    if (n) { e.x += px * 90 * dt; e.y += py * 90 * dt; }
  }

  // Contact damage.
  for (const e of g.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const rr = e.r + p.r - 3;
    if (dist2(e.x, e.y, p.x, p.y) < rr * rr) g.hurt(e.dmg, e);
  }

  // Enemy shots.
  for (let i = g.shots.length - 1; i >= 0; i--) {
    const s = g.shots[i];
    s.age += dt;
    s.x += s.vx * dt; s.y += s.vy * dt;
    const rr = s.r + p.r - 4;
    if (dist2(s.x, s.y, p.x, p.y) < rr * rr) { g.hurt(s.dmg, null, s.from); g.shots.splice(i, 1); continue; }
    if (s.age > s.life) g.shots.splice(i, 1);
  }
}

export function randomType(mix) {
  let total = 0;
  for (const k in mix) total += mix[k];
  let r = rng() * total;
  for (const k in mix) { r -= mix[k]; if (r <= 0) return k; }
  return pick(Object.keys(mix));
}

