// The Noise: static, buzz, hum and feedback that want to drown the song out.
// Enemies move to the beat too. They surge on every beat, and some act on specific beats.

import { TAU, rand, rng, pick, dist2 } from '../util.js';
import { STEP_SEC, BEAT_SEC, BALANCE } from '../config.js';

export const ENEMY_TYPES = {
  static:   { name: 'Static',   hp: 9,  speed: 64,  r: 11, dmg: 7,  xp: 1, shape: 'square',  color: '#d9d4ea', mass: 1 },
  buzz:     { name: 'Buzz',     hp: 5,  speed: 116, r: 8,  dmg: 5,  xp: 1, shape: 'tri',     color: '#efe59a', mass: 0.6, wiggle: true },
  hum:      { name: 'Hum',      hp: 58, speed: 40,  r: 21, dmg: 14, xp: 4, shape: 'hex',     color: '#aaa3c8', mass: 4 },
  glitch:   { name: 'Glitch',   hp: 20, speed: 56,  r: 12, dmg: 9,  xp: 2, shape: 'glitch',  color: '#94f0ff', mass: 1, blink: true },
  screech:  { name: 'Screech',  hp: 24, speed: 62,  r: 13, dmg: 6,  xp: 3, shape: 'diamond', color: '#ffa3b6', mass: 1, ranged: true },
  feedback: { name: 'Feedback', hp: 34, speed: 50,  r: 16, dmg: 10, xp: 3, shape: 'ring',    color: '#ffd38c', mass: 2, splits: 'static' },
  stomp:    { name: 'Stomp',    hp: 30, speed: 54,  r: 15, dmg: 12, xp: 2, shape: 'stomp',   color: '#ff8a5c', mass: 3, charger: true },
  // A mortar: it keeps its distance, marks where you will be on beat 4 and lands there on the next backbeat.
  snare:    { name: 'Snare',    hp: 22, speed: 48,  r: 12, dmg: 6,  xp: 3, shape: 'snare',   color: '#ff6b9a', mass: 1, mortar: true },
};

// Stomp: a speaker cabinet that lights a lane on beat 4 and slams down it on the downbeat, for one beat at
// `speed`. It only arms on screen with the player `min` to `max` px away, and at most `lanes` light per beat.
const STOMP = { speed: 900, time: BEAT_SEC, min: 120, max: 520, lanes: 6 };
// px a Screech keeps from you: it backs off inside the first and circles inside the second.
const RANGED_KEEP = [200, 270];

export const BOSS_TYPES = {
  drone:      { name: 'The Drone',       hp: 1600,  speed: 40, r: 46, dmg: 18, xp: 80,  shape: 'drone',  color: '#ff9fe2', mass: 40, boss: true },
  clipper:    { name: 'The Clipper',     hp: 3600,  speed: 52, r: 42, dmg: 20, xp: 140, shape: 'clipper', color: '#ffb06a', mass: 40, boss: true },
  glitchking: { name: 'The Glitch King', hp: 12100, speed: 58, r: 44, dmg: 22, xp: 150, shape: 'king',   color: '#8ff3ff', mass: 40, boss: true },
  whitenoise: { name: 'White Noise',     hp: 34000, speed: 46, r: 64, dmg: 26, xp: 0,   shape: 'noise',  color: '#ffffff', mass: 60, boss: true, final: true },
};

// opts.telegraph: seconds the enemy takes to arrive (it cannot move, attack or touch you meanwhile, and the
// renderer draws its arrival for spawnDur). Default 0.35 s.
export function spawnEnemy(g, type, x, y, opts = {}) {
  const def = ENEMY_TYPES[type] || BOSS_TYPES[type];
  if (!def) return null;
  const minutes = g.time / 60;
  const elite = !!opts.elite;
  const B = BALANCE.boss;
  const hpMul = def.boss ? (1 + minutes * B.hpPerMin) * (B.hp?.[type] ?? 1) * g.mods.bossHp : (1 + minutes * 0.25 + minutes * minutes * 0.09) * (elite ? BALANCE.elites.hp : 1) * (opts.hpMul ?? 1) * g.mods.hp;
  const arrive = opts.telegraph ?? 0.35;
  const e = {
    id: g.nextId++, type, def, x, y, vx: 0, vy: 0,
    r: def.r * (elite ? 1.55 : 1) * (opts.scale ?? 1),
    hp: def.hp * hpMul, maxHp: def.hp * hpMul,
    speed: def.speed * (1 + minutes * 0.05) * (elite ? BALANCE.elites.speed : 1) * rand(0.92, 1.08),
    dmg: def.dmg * (1 + minutes * 0.1) * (elite ? 1.5 : 1),
    // Notes are worth less as the song fills up, so levels and the Drop keep a steady pace while the crowd grows
    // (and Gain's bigger crowd shares the same notes).
    xp: def.boss ? def.xp : def.xp * (elite ? 10 : 1) / (1 + (minutes / 2.5) ** 2) / g.mods.density,
    mass: def.mass * (elite ? 5 : 1),
    elite, vinyl: elite && opts.vinyl !== false, heart: elite && !!opts.heart, boss: !!def.boss, color: def.color, shape: def.shape,
    kbx: 0, kby: 0, stun: 0, slow: 0, slowT: 0, flash: 0, dead: false,
    age: 0, phase: rand(0, TAU), ai: {}, spawnT: arrive, spawnDur: arrive,
  };
  g.enemies.push(e);
  if (e.boss) g.onBossSpawn(e);
  return e;
}

// opts.from: the enemy that fired it, so a hit is credited to it by name (damageBy, lastHitBy).
export function enemyShot(g, x, y, angle, speed = 160, dmg = 8, opts = {}) {
  if (g.shots.length > 500) return;
  speed *= g.mods.shotSpeed;
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

// Snare marks (g.hazards): each lands on one beat, hurting you if you stand in it. A mark whose beat was never
// heard (a pause swallowed it) goes away without landing, like a Stomp lane.
function hazardsOnBeat(g, ev) {
  const H = g.hazards;
  if (!H?.length) return;
  const p = g.player;
  for (let i = H.length - 1; i >= 0; i--) {
    const h = H[i];
    if (ev.bar < h.bar || (ev.bar === h.bar && ev.beat < h.beat)) continue;
    H.splice(i, 1);
    if (ev.bar !== h.bar || ev.beat !== h.beat) continue;
    const L = g._led?.();
    if (L) L.marks++;
    if (g.onScreen(h)) {
      g.fx.ring({ x: h.x, y: h.y, r0: h.r * 0.3, r1: h.r * 1.1, dur: 0.22, damage: 0, kb: 0, width: 5, color: '#ff6b9a' });
      g.fx.particles(h.x, h.y, '#ff6b9a', 6, 160, 0.3, 2);
    }
    const rr = h.r + p.r - 4;
    if (dist2(h.x, h.y, p.x, p.y) < rr * rr) {
      if (L) L.markHits++;
      g.hurt(h.dmg, null, h.from, 'mark');
    }
  }
}

// A lane (a Stomp's, a hunting elite's): lit on beat 4 and dashed down on the next downbeat for one beat at
// `speed`. It leads the player: keep going and it cuts you off. Only on screen, `min` to `max` px away.
function lightLane(g, e, ev, speed, min, max) {
  const p = g.player;
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy);
  if (!(d > min && d < max && Math.abs(dx) < g.view.w / 2 && Math.abs(dy) < g.view.h / 2)) return false;
  const lead = BEAT_SEC + d / speed;
  e.ai.chargeWarn = { a: Math.atan2(dy + p.vy * lead, dx + p.vx * lead), t: BEAT_SEC, len: speed * STOMP.time + e.r, bar: ev.bar, speed, hold: true };
  return true;
}

// Called on every beat (beat 0..3 of each bar) while playing.
export function enemiesOnBeat(g, ev) {
  const p = g.player;
  hazardsOnBeat(g, ev);
  const isRingBar = ev.bar === g.director.ringBar;   // the Build-Up's last bar: only the Stomp ring arms
  // Stomp lanes lit this bar. A resume can replay beat 4, so lanes already lit count toward the cap.
  let lanes = 0;
  if (ev.beat === 3) for (const e of g.enemies) if (!e.dead && e.def.charger && e.ai.chargeWarn?.bar === ev.bar) lanes++;
  const S = BALANCE.snare, EL = BALANCE.elites;
  for (const e of g.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    if (e.boss) { bossOnBeat(g, e, ev); continue; }
    // A Glitch blinks on beats 1 and 3, never while its lane is lit or it dashes down it (a hunting elite).
    if (e.def.blink && !e.ai.chargeWarn && !(e.ai.charge > 0) && ev.beat % 2 === 0 && e.stun <= 0) {
      const d = Math.sqrt(dist2(e.x, e.y, p.x, p.y));
      if (d > 140 && rng() < 0.7) {
        const hop = Math.min(85, d - 90);
        const a = Math.atan2(p.y - e.y, p.x - e.x) + rand(-0.5, 0.5);
        g.fx.particles(e.x, e.y, e.color, 4, 90, 0.3, 2);
        e.x += Math.cos(a) * hop; e.y += Math.sin(a) * hop;
        e.ai.glitchT = 0.18;
      }
    }
    // Stomp: lights its lane on beat 4 of every other bar and dashes on the next downbeat only. A lane never
    // outlives the next bar's first beat, so a pause cannot release a dash nobody saw lit.
    // The lane leads the player: keep going and it cuts you off.
    // Hunting elites do the same every few bars, slower than a Stomp but far faster than they walk.
    const hunter = e.elite && !e.def.charger;
    if (e.def.charger || hunter) {
      const cw = e.ai.chargeWarn;
      if (cw && ev.bar > cw.bar) {
        if (ev.beat === 0 && ev.bar === cw.bar + 1 && e.stun <= 0) { e.ai.charge = STOMP.time; e.ai.chargeA = cw.a; e.ai.chargeSpeed = cw.speed ?? STOMP.speed; }
        e.ai.chargeWarn = null;
      } else if (!cw && ev.beat === 3 && e.stun <= 0) {
        if (hunter) { if (!isRingBar && (ev.bar + e.id) % EL.every === 0) lightLane(g, e, ev, EL.dash, EL.min, EL.max); }
        else if ((isRingBar ? e.ai.ring : (ev.bar + e.id) % 2 === 0 && lanes < STOMP.lanes) && lightLane(g, e, ev, STOMP.speed, STOMP.min, STOMP.max)) lanes++;
      }
    }
    // Snare: on beat 4 of every other bar it marks where you will be in a second; the mark lands on the next
    // bar's backbeat (beat 2). Only on screen and in range, and at most S.cap marks live at once. One mark a bar:
    // a resume can replay beat 4.
    if (e.def.mortar && ev.beat === 3 && (ev.bar + e.id) % 2 === 0 && e.ai.markBar !== ev.bar && e.stun <= 0 && (g.hazards ||= []).length < S.cap) {
      const dx = p.x - e.x, dy = p.y - e.y;
      if (dx * dx + dy * dy < S.range * S.range && Math.abs(dx) < g.view.w / 2 && Math.abs(dy) < g.view.h / 2) {
        let lx = p.vx * S.lead, ly = p.vy * S.lead;
        const ll = Math.hypot(lx, ly);
        if (ll > S.leadCap) { lx *= S.leadCap / ll; ly *= S.leadCap / ll; }
        g.hazards.push({ x: p.x + lx, y: p.y + ly, r: S.r, bar: ev.bar + 1, beat: 1, dmg: S.dmg * (1 + g.time / 60 * S.dmgPerMin), from: e, t0: g.time, dur: 2 * BEAT_SEC });
        e.ai.markBar = ev.bar;
        e.ai.shootT = 0.25;
      }
    }
    // Screech winds up for a beat (a growing red glow), then fires on beat 3.
    if (e.def.ranged && ev.beat === 1 && (ev.bar + e.id) % 2 === 0 && e.stun <= 0 && dist2(e.x, e.y, p.x, p.y) < 480 * 480) e.ai.windup = BEAT_SEC;
    if (e.def.ranged && ev.beat === 2 && (ev.bar + e.id) % 2 === 0 && e.stun <= 0) {
      const d2 = dist2(e.x, e.y, p.x, p.y);
      if (d2 < 480 * 480) {
        enemyShot(g, e.x, e.y, Math.atan2(p.y - e.y, p.x - e.x), 190, BALANCE.screech.dmg * (1 + g.time / 60 * 0.06), { color: '#ff7a95', from: e });
        e.ai.shootT = 0.2;
      }
    }
  }
}

// The player's Drop on the downbeat of `bar` knocks a boss off the beat: no attacks and no spiral, and any
// tell it was showing goes away. It is counted in bars, so a pause or a slow frame cannot move it: the boss
// comes back in on the downbeat of the bar after next (offbeatUntil), which its cue reads too (bosscues.js).
// Then the boss has four bars to find the groove before another Drop can stagger it again.
export function knockOffBeat(g, e, bar) {
  if (bar < (e.ai.offbeatUntil ?? -Infinity) + 4) return;
  g.staggers++;
  e.ai.offbeatUntil = bar + 2;
  e.ai.blinkTo = null;
  e.ai.chargeWarn = null;
  e.ai.spiral = false;     // restarts on a downbeat once the boss is back
  g.hooks?.onBossCue?.('stagger', e);   // no words: the boss bar shakes and flashes, the boss wears a white ring
}

// White Noise's attack phase from its health. start: the phase it starts in (Gain 8 starts it in phase 2).
export function whiteNoisePhase(e, start) {
  const frac = e.hp / e.maxHp;
  return Math.max(start, frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3);
}

function bossOnBeat(g, e, ev) {
  if (ev.bar < e.ai.offbeatUntil) return;
  const p = g.player;
  const aim = Math.atan2(p.y - e.y, p.x - e.x);
  const frac = e.hp / e.maxHp;
  switch (e.type) {
    case 'drone':
      if (ev.beat === 0 && ev.bar % 2 === 0) summonRing(g, e, 'buzz', 5, e.r + 30);
      // The charge lane is shown for a beat (beat 4), then the Drone dashes along it on the downbeat.
      // No lane, no dash: a Drop stagger or a pause can swallow beat 4.
      if (ev.beat === 3 && ev.bar % 4 === 0) e.ai.chargeWarn = { a: aim, t: BEAT_SEC };
      if (ev.beat === 0 && ev.bar % 4 === 1 && e.ai.chargeWarn) { e.ai.charge = 0.75; e.ai.chargeA = e.ai.chargeWarn.a; e.ai.chargeWarn = null; }
      if (ev.beat === 2 && frac < 0.8) radial(g, e, 10, 140, 18, ev.bar * 0.4, '#ff9fe2');
      break;
    case 'clipper': {
      const n = BALANCE.boss.clipperRadial;
      if (ev.beat === 0 || ev.beat === 2) radial(g, e, n, 160, 13, (ev.beat === 2 ? Math.PI / n : 0) + ev.bar * 0.13, '#ffb06a');
      if (ev.beat === 0 && ev.bar % 4 === 3) summonRing(g, e, 'static', 6, e.r + 36);
      if (frac < BALANCE.boss.clipperTriple && (ev.beat === 1 || ev.beat === 3)) for (let k = -1; k <= 1; k++) enemyShot(g, e.x, e.y, aim + k * 0.22, 200, 13, { color: '#ffd08a', from: e });
      break;
    }
    case 'glitchking': {
      if (ev.beat === 0 && ev.bar % 2 === 0) {
        const a = rand(0, TAU);
        e.ai.blinkTo = { x: p.x + Math.cos(a) * 220, y: p.y + Math.sin(a) * 220 };
        e.ai.blinkSetAt = g.time;
      }
      if (ev.beat === 2 && e.ai.blinkTo) {
        g.fx.particles(e.x, e.y, e.color, 18, 260, 0.5, 3);
        e.x = e.ai.blinkTo.x; e.y = e.ai.blinkTo.y; e.ai.blinkTo = null;
        radial(g, e, 20, 150, BALANCE.boss.kingRadialDmg, rand(0, TAU), '#8ff3ff');
        summonRing(g, e, 'glitch', 4, e.r + 40);
      }
      if (ev.beat === 1 || ev.beat === 3) for (let k = -1; k <= 1; k++) enemyShot(g, e.x, e.y, aim + k * 0.18, 210, BALANCE.boss.kingTripleDmg, { color: '#b9f7ff', from: e });
      break;
    }
    case 'whitenoise': {
      const phase = whiteNoisePhase(e, g.mods.wnPhase);
      if (e.ai.phase !== phase) {
        // Each change breaks the notch it passed on the boss bar (one static flash), none for the phase it starts in.
        if (e.ai.phase && phase > 1) g.hooks?.onBossCue?.('phase', e, phase);
        e.ai.phase = phase;
      }
      if (ev.beat === 0 || ev.beat === 2) radial(g, e, phase === 3 ? 22 : 18, 140 + phase * 10, BALANCE.boss.noiseRadialDmg, ev.bar * 0.21 + ev.beat, '#ffffff');
      if (ev.beat === 0 && ev.bar % 2 === 0) summonRing(g, e, phase === 3 ? 'hum' : 'static', phase === 3 ? 4 : 8, e.r + 50);
      if (phase >= 2 && ev.beat === 0) e.ai.spiral = true;
      // Spiral arms on 8th notes: one set on the beat and one on the 8th after it. A stun holds them.
      if (e.ai.spiral && e.stun <= 0) {
        spiral(g, e);
        g.later.push({ at: g.time + 2 * STEP_SEC, fn: () => { if (!e.dead && e.ai.spiral && e.stun <= 0) spiral(g, e); } });
      }
      break;
    }
  }
}

function spiral(g, e) {
  e.ai.spiralA = (e.ai.spiralA || 0) + 0.42;
  const arms = e.ai.phase === 3 ? 4 : 3;
  for (let k = 0; k < arms; k++) enemyShot(g, e.x, e.y, e.ai.spiralA + (k / arms) * TAU, 135, BALANCE.boss.noiseSpiralDmg, { color: '#e6e6ff', r: 5, from: e });
}

// Movement, separation and contact damage.
export function updateEnemies(g, dt) {
  const p = g.player;
  const hop = 0.62 + 0.75 * g.beatPulse;
  for (const e of g.enemies) {
    if (e.dead) continue;
    e.age += dt;
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
    if (e.launch && g._flyLaunched(e, dt)) continue;   // launched (g.launch): flying, not walking

    if (e.stun > 0) { e.stun -= dt; continue; }
    // A charge (the Drone, a Stomp) runs straight down its lane, deaf to knockback.
    if (e.ai.charge > 0) {
      const t = Math.min(dt, e.ai.charge);   // the last frame stops at the end of the lane
      e.ai.charge -= dt;
      const sp = e.ai.chargeSpeed ?? e.speed * 3.4;
      e.x += Math.cos(e.ai.chargeA) * sp * t;
      e.y += Math.sin(e.ai.chargeA) * sp * t;
      if (e.ai.charge <= 0 && !e.boss) e.stun = 0.45;   // winded for about a beat: the window to punish it
      continue;
    }
    if ((e.def.charger || e.elite) && e.ai.chargeWarn) continue;   // a Stomp or a hunting elite stands its ground while its lane is lit

    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    let sp = e.speed * (1 - e.slow) * (e.boss ? 1 : e.def.wiggle ? 1 : hop);
    let ux = dx / d, uy = dy / d;
    if (e.def.ranged || e.def.mortar) {
      // Shooters keep their distance: back off when too close, circle inside the band, close in from beyond it.
      const [near, far] = e.def.mortar ? BALANCE.snare.keep : RANGED_KEEP;
      if (d < near) { ux = -ux; uy = -uy; }
      else if (d < far) { const t = ux; ux = -uy; uy = t; sp *= 0.6; }
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
    if (e.dead || e.spawnT > 0 || e.launch) continue;   // a launched enemy flying past does not hurt
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

