// Attack archetypes. An instrument's fire() calls one of these on each of its notes, so every
// projectile, shockwave and zap on screen was launched by a note you can hear.
// Every spawn records the instrument that made it (game.src) for damage attribution.
// Instant: bullet, ring, pulse, beam, zap, strike, cone. Persistent, owned by an instrument and cleared with
// it (clearOwner): mine (persist: true rings in place), orbit, wall, tether, followers. The game adds pull,
// launch and shield (src/game/game.js).

import { TAU, rand, dist2, segDist2, clamp, swapRemove } from '../util.js';

const MAX_PARTICLES = 900;
const MAX_TEXTS = 30;
const MAX_BULLETS = 700;
const NO_TARGETS = [];
// Caps for the persistent and drawn archetypes, so any band stays inside the effects budget.
const MAX_CONES = 40;          // wedge flashes on screen
const MAX_WALLS = 12;          // walls in the world
const WALLS_PER_OWNER = 2;
const MAX_TETHERS = 32;
const TETHERS_PER_OWNER = 8;
const MAX_FOLLOWERS = 12;      // followers in one trail
const MAX_MINES = 120;
const TRAIL_STEP = 6;          // px between the breadcrumbs a trail of followers walks on

// Smallest signed difference between two angles.
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

export class Effects {
  constructor(game) {
    this.g = game;
    this.reset();
  }

  reset() {
    this.bullets = [];
    this.rings = [];
    this.flashes = [];   // expanding/fading circles (pulse visuals)
    this.beams = [];
    this.zaps = [];
    this.strikes = [];
    this.mines = [];
    this.orbits = new Map();
    this.cones = [];       // wedge flashes (cosmetic: a cone hits at once)
    this.walls = [];
    this.tethers = [];
    this.trails = new Map();     // follower groups (followers()), by owner id
    this.parts = [];
    this.texts = [];
  }

  // ---------------------------------------------------------------- archetypes

  // Moving projectile. o: x, y, angle|vx+vy, speed, r, damage, pierce (extra enemies it passes through),
  // life (s), color, shape ('dot'|'note'|'square'|'star'|'seed'|'shard'|'coin'), homing (turn rad/s),
  // bounce (ricochets to new targets), kb, stun, slow, drag, trail (bool), spin, curve (turn rad/s),
  // onHit(b, enemy, g), onReturn(b, g) (a boomerang that reaches you; return true to keep it flying),
  // grow (radius px/s while it flies, up to maxR, default 60).
  bullet(o) {
    if (this.bullets.length >= MAX_BULLETS) return null;
    const speed = o.speed ?? 300;
    const ang = o.angle ?? 0;
    const b = {
      x: o.x, y: o.y,
      vx: o.vx ?? Math.cos(ang) * speed, vy: o.vy ?? Math.sin(ang) * speed,
      r: o.r ?? 5, damage: o.damage ?? 5, pierce: o.pierce ?? 0, life: o.life ?? 1.6, age: 0,
      color: o.color ?? '#fff', shape: o.shape ?? 'dot', homing: o.homing ?? 0, bounce: o.bounce ?? 0,
      kb: o.kb ?? 40, stun: o.stun ?? 0, slow: o.slow ?? 0, drag: o.drag ?? 0, trail: o.trail ?? false,
      spin: o.spin ?? 0, rot: o.rot ?? Math.random() * TAU, hit: new Set(), target: null, retarget: 0, src: this.g.src,
      range: o.range ?? 420, onHit: o.onHit ?? null, dead: false,
      boomerang: !!o.boomerang, returning: false, curve: o.curve ?? 0, onReturn: o.onReturn ?? null,
      grow: o.grow ?? 0, maxR: o.maxR ?? 60,
    };
    b.maxAge = b.boomerang ? b.life * 2.5 : b.life;
    this.bullets.push(b);
    return b;
  }

  // Expanding shockwave that damages each enemy once as it passes. o: x, y, follow (bool: stays on player),
  // r0, r1, dur, damage, kb, stun, slow, width (visual), color, yoyo (out to r1 and back, hitting again on
  // the way back), erase (wipes out enemy shots inside this share of its radius while it moves).
  ring(o) {
    const r = {
      x: o.x, y: o.y, follow: !!o.follow, r0: o.r0 ?? 10, r1: o.r1 ?? 120, dur: o.dur ?? 0.3, t: 0,
      damage: o.damage ?? 10, kb: o.kb ?? 120, stun: o.stun ?? 0, slow: o.slow ?? 0,
      width: o.width ?? 6, color: o.color ?? '#fff', hit: new Set(), src: this.g.src, r: o.r0 ?? 10,
      yoyo: !!o.yoyo, back: false, erase: o.erase ?? 0,
    };
    this.rings.push(r);
    return r;
  }

  // Instant area hit with a flash. o: x, y, r, damage, kb, stun, slow, color, max (cap targets).
  // Returns the number of enemies hit.
  pulse(o) {
    const g = this.g;
    const targets = g.inRadius(o.x, o.y, o.r);
    let n = 0;
    const max = o.max ?? Infinity;
    for (const e of targets) {
      if (n >= max) break;
      g.hit(e, o.damage, { kb: o.kb ?? 80, fx: o.x, fy: o.y, stun: o.stun, slow: o.slow, src: o.src });
      n++;
    }
    this.flash(o.x, o.y, o.r, o.color ?? '#fff', o.flashLife ?? 0.22, o.fill ?? 0.18);
    return n;
  }

  // Instant straight line. o: x, y, angle, length, width, damage, kb, color, pierce (max targets), onHit(enemy).
  beam(o) {
    const g = this.g, src = g.src;   // the instrument firing it (a remix's beam draws a gold core)
    const L = o.length ?? 400, w = o.width ?? 8;
    const x2 = o.x + Math.cos(o.angle) * L, y2 = o.y + Math.sin(o.angle) * L;
    const mx = (o.x + x2) / 2, my = (o.y + y2) / 2;
    const cand = g.inRadius(mx, my, L / 2 + w + 10);
    const hits = [];
    for (const e of cand) {
      const rr = e.r + w * 0.5;
      if (segDist2(e.x, e.y, o.x, o.y, x2, y2) <= rr * rr) hits.push(e);
    }
    hits.sort((a, b) => dist2(a.x, a.y, o.x, o.y) - dist2(b.x, b.y, o.x, o.y));
    const max = o.pierce ?? Infinity;
    for (let i = 0; i < hits.length && i < max; i++) {
      const alive = !hits[i].dead;   // an earlier hit's onHit may have killed it already
      g.hit(hits[i], o.damage, { kb: o.kb ?? 60, fx: o.x, fy: o.y, stun: o.stun, slow: o.slow });
      if (o.onHit && alive) o.onHit(hits[i]);
    }
    this.beams.push({ x1: o.x, y1: o.y, x2, y2, width: w, color: o.color ?? '#fff', life: o.life ?? 0.16, age: 0, src });
    return hits.length;
  }

  // Chain lightning. o: x, y, target (optional enemy), range (first jump), chain (number of targets),
  // chainRange, damage, falloff (per jump multiplier), color, stun, onHit(enemy).
  zap(o) {
    const g = this.g;
    const hitSet = new Set();
    let cur = o.target && !o.target.dead ? o.target : g.nearest(o.x, o.y, o.range ?? 260);
    const pts = [[o.x, o.y]];
    let dmg = o.damage ?? 8;
    const n = o.chain ?? 3;
    for (let i = 0; i < n && cur; i++) {
      hitSet.add(cur);
      pts.push([cur.x, cur.y]);
      g.hit(cur, dmg, { kb: o.kb ?? 20, fx: pts[pts.length - 2][0], fy: pts[pts.length - 2][1], stun: o.stun, slow: o.slow });
      if (o.onHit) o.onHit(cur);
      dmg *= o.falloff ?? 0.85;
      cur = g.nearest(cur.x, cur.y, o.chainRange ?? 140, hitSet);
    }
    if (pts.length > 1) this.zaps.push({ pts, color: o.color ?? '#fff', life: o.life ?? 0.18, age: 0, width: o.width ?? 2.5 });
    return pts.length - 1;
  }

  // Delayed impact at a spot: a marker shows where it will land. o: x, y, delay (s), r, damage, kb, stun,
  // slow, color, target (enemy to track until impact), style ('drop'|'star'|'ring').
  strike(o) {
    const s = {
      x: o.x, y: o.y, delay: o.delay ?? 0.25, t: 0, r: o.r ?? 50, damage: o.damage ?? 15, kb: o.kb ?? 100,
      stun: o.stun ?? 0, slow: o.slow ?? 0, color: o.color ?? '#fff', target: o.target ?? null, style: o.style ?? 'drop',
      src: this.g.src, onLand: o.onLand ?? null,
    };
    this.strikes.push(s);
    return s;
  }

  // A mine waits where it was placed until its owner calls detonateMines() on a later note, or life runs out.
  // o: owner, x, y, r (blast radius), damage, kb, stun, slow, color, life, max (cap per owner), size,
  // persist (true: never consumed; ringMines() makes it pulse in place, detonateMines() leaves it alone).
  mine(o) {
    const own = this.mines.filter((m) => m.owner === o.owner);
    if (o.max && own.length >= o.max) {
      const oldest = own[0];
      this.mines.splice(this.mines.indexOf(oldest), 1);
    }
    if (this.mines.length >= MAX_MINES) this.mines.shift();
    const m = {
      owner: o.owner, x: o.x, y: o.y, r: o.r ?? 60, damage: o.damage ?? 15, kb: o.kb ?? 120, stun: o.stun ?? 0,
      slow: o.slow ?? 0, color: o.color ?? '#fff', life: o.life ?? 6, age: 0, src: this.g.src, size: o.size ?? 7,
      persist: !!o.persist, glow: 0,
    };
    this.mines.push(m);
    return m;
  }

  // Ring the persistent mines of `owner` where they stand: each pulses its blast without being used up.
  // o (optional) overrides damage, r, kb, stun, slow; scale multiplies damage. Returns how many enemies were hit.
  ringMines(owner, o = {}) {
    const prev = this.g.src;
    let n = 0;
    for (const m of this.mines) {
      if (m.owner !== owner || !m.persist || m.age < 0.05) continue;
      this.g.src = m.src;
      m.glow = 1;
      n += this.pulse({ x: m.x, y: m.y, r: o.r ?? m.r, damage: (o.damage ?? m.damage) * (o.scale ?? 1), kb: o.kb ?? m.kb, stun: o.stun ?? m.stun, slow: o.slow ?? m.slow, color: m.color, flashLife: 0.18, fill: 0.12 });
    }
    this.g.src = prev;
    return n;
  }

  // Blow up the mines of `owner` (optionally scaling damage). With armed: true, only mines that
  // have an enemy inside their blast go off; the rest keep waiting. With chain: true, a blast also sets off
  // the owner's other mines inside it, and those set off more. Returns how many detonated.
  detonateMines(owner, scale = 1, { armed = false, chain = false } = {}) {
    const prev = this.g.src;
    const blasts = [];
    const boom = (i) => {
      const m = this.mines[i];
      this.g.src = m.src;
      this.pulse({ x: m.x, y: m.y, r: m.r, damage: m.damage * scale, kb: m.kb, stun: m.stun, slow: m.slow, color: m.color, fill: 0.3 });
      this.particles(m.x, m.y, m.color, 10, 220, 0.4, 3);
      this.mines.splice(i, 1);
      blasts.push(m);
    };
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      if (m.owner !== owner || m.persist || m.age < 0.05) continue;
      if (armed && !this.g.inRadius(m.x, m.y, m.r * 0.75).length) continue;
      boom(i);
    }
    for (let k = 0; chain && k < blasts.length; k++) {
      const b = blasts[k];
      for (let i = this.mines.length - 1; i >= 0; i--) {
        const m = this.mines[i];
        if (m.owner === owner && !m.persist && dist2(m.x, m.y, b.x, b.y) <= b.r * b.r) boom(i);
      }
    }
    this.g.src = prev;
    return blasts.length;
  }

  // Persistent group of objects circling the player, owned by an instrument instance. Calling again
  // updates its config. Returns the group; call group.pulse({...}) from fire() to make them strike.
  // cfg: count, radius, speed (rad/s), size, color, shape.
  orbit(inst, cfg) {
    const id = inst.def.id;
    let grp = this.orbits.get(id);
    if (!grp) {
      grp = { owner: id, angle: rand(0, TAU), items: [], glow: 0, src: inst, fx: this };
      grp.pulse = (p) => this._orbitPulse(grp, p);
      this.orbits.set(id, grp);
    }
    Object.assign(grp, { count: 3, radius: 70, speed: 2, size: 7, color: '#fff', shape: 'dot' }, grp.cfg || {}, cfg);
    grp.cfg = { ...(grp.cfg || {}), ...cfg };
    grp.src = inst;
    this._layoutOrbit(grp);
    return grp;
  }

  orbitOf(inst) { return this.orbits.get(inst.def.id) || null; }

  _layoutOrbit(grp) {
    const p = this.g.player;
    const n = Math.max(0, Math.floor(grp.count));
    while (grp.items.length < n) grp.items.push({ x: p.x, y: p.y, glow: 0 });
    grp.items.length = n;
    for (let i = 0; i < n; i++) {
      const a = grp.angle + (i / n) * TAU;
      grp.items[i].x = p.x + Math.cos(a) * grp.radius;
      grp.items[i].y = p.y + Math.sin(a) * grp.radius;
    }
  }

  _orbitPulse(grp, p) {
    const prev = this.g.src;
    this.g.src = grp.src;
    let n = 0;
    const idx = p.index;
    grp.items.forEach((it, i) => {
      if (idx !== undefined && idx !== i) return;
      it.glow = 1;
      n += this.pulse({ x: it.x, y: it.y, r: p.r ?? 30, damage: p.damage ?? 8, kb: p.kb ?? 90, stun: p.stun, slow: p.slow, color: p.color ?? grp.color, flashLife: 0.16, fill: 0.22 });
    });
    this.g.src = prev;
    return n;
  }

  // Instant hit in a wedge: everything whose body reaches into the cone from (x, y) along `angle`, `spread`
  // radians wide (default 70°) and r long, drawn as a wedge flash. o: x, y, angle, spread, r, damage, kb, stun,
  // slow, color, max (cap targets). Knockback pushes away from the apex. Returns the number of enemies hit.
  cone(o) {
    const g = this.g;
    const half = (o.spread ?? 1.22) / 2, max = o.max ?? Infinity;
    let n = 0;
    for (const e of g.inRadius(o.x, o.y, o.r)) {
      if (n >= max) break;
      const d = Math.hypot(e.x - o.x, e.y - o.y);
      const slack = d > e.r ? Math.asin(e.r / d) : Math.PI;   // the body's angular half-width
      if (Math.abs(angDiff(Math.atan2(e.y - o.y, e.x - o.x), o.angle)) > half + slack) continue;
      g.hit(e, o.damage ?? 10, { kb: o.kb ?? 120, fx: o.x, fy: o.y, stun: o.stun, slow: o.slow });
      n++;
    }
    if (this.cones.length >= MAX_CONES) this.cones.shift();
    this.cones.push({ x: o.x, y: o.y, angle: o.angle, half, r: o.r, color: o.color ?? '#fff', life: o.life ?? 0.2, age: 0 });
    return n;
  }

  // A persistent arc that stands between you and the crowd: `span` radians wide (default 120°) at radius r
  // around (x, y), or around the player with follow: true, facing `angle` (turning `spin` rad/s), for dur
  // seconds. Each enemy that touches it is hit once and bounced back to the side it came from, and enemy shots
  // crossing it are erased (onErase(wall, shot, g) runs for each; wall.erased counts them). At most 2 walls per
  // owner (the oldest goes). o: owner, x, y, follow, r, angle, span, spin, dur, damage, kb, stun, slow, width,
  // color, erase (false: shots pass), onErase.
  wall(o) {
    const owner = o.owner ?? this.g.src?.def.id;
    const own = this.walls.filter((w) => w.owner === owner);
    if (own.length >= WALLS_PER_OWNER) this.walls.splice(this.walls.indexOf(own[0]), 1);
    if (this.walls.length >= MAX_WALLS) this.walls.shift();
    const p = this.g.player;
    const w = {
      owner, follow: !!o.follow, x: o.follow ? p.x : o.x, y: o.follow ? p.y : o.y, r: o.r ?? 90,
      angle: o.angle ?? 0, half: (o.span ?? 2.1) / 2, spin: o.spin ?? 0, dur: o.dur ?? 1, t: 0,
      damage: o.damage ?? 10, kb: o.kb ?? 220, stun: o.stun ?? 0, slow: o.slow ?? 0, width: o.width ?? 8,
      color: o.color ?? '#fff', erase: o.erase !== false, onErase: o.onErase ?? null, erased: 0,
      hit: new Set(), src: this.g.src,
    };
    this.walls.push(w);
    return w;
  }

  // Hook an enemy to the player with a crackling tether for `life` seconds, dragging it toward you at `pull`
  // px/s (bosses and charging enemies are hooked but never dragged). Hooking it again refreshes the tether.
  // At most 8 per owner (the oldest lets go). o: life, pull, color. Returns the tether.
  tether(owner, e, o = {}) {
    if (!e || e.dead) return null;
    let t = this.tethers.find((x) => x.owner === owner && x.e === e);
    if (!t) {
      const own = this.tethers.filter((x) => x.owner === owner);
      if (own.length >= TETHERS_PER_OWNER) this.tethers.splice(this.tethers.indexOf(own[0]), 1);
      if (this.tethers.length >= MAX_TETHERS) this.tethers.shift();
      t = { owner, e, age: 0, src: this.g.src, glow: 0 };
      this.tethers.push(t);
    }
    Object.assign(t, { life: o.life ?? 4, pull: o.pull ?? 90, color: o.color ?? t.color ?? '#fff', age: 0 });
    return t;
  }

  tethersOf(owner) { return this.tethers.filter((t) => t.owner === owner && !t.e.dead); }

  // Every enemy `owner` has hooked takes a hit along its tether. o: damage, kb, stun, slow, color.
  // Returns how many were hit.
  pulseTethers(owner, o = {}) {
    const g = this.g, p = g.player;
    const prev = g.src;
    let n = 0;
    for (const t of this.tethers) {
      if (t.owner !== owner || t.e.dead) continue;
      g.src = t.src;
      t.glow = 1;
      g.hit(t.e, o.damage ?? 8, { kb: o.kb ?? 0, fx: p.x, fy: p.y, stun: o.stun, slow: o.slow });
      this.zaps.push({ pts: [[p.x, p.y], [t.e.x, t.e.y]], color: o.color ?? t.color, life: 0.12, age: 0, width: 2 });
      n++;
    }
    g.src = prev;
    return n;
  }

  // A trail of followers that walks your path, `gap` px apart (default 34) on breadcrumbs dropped every 6 px.
  // Owned by an instrument instance like orbit(): calling again updates its config (count, gap, size, color,
  // shape; count at most 12). Then grp.strike({ damage, r, kb, stun, slow, index, color }) makes them hit
  // where they stand (all of them, or only follower `index`). grp.items are their positions.
  followers(inst, cfg) {
    const id = inst.def.id;
    let grp = this.trails.get(id);
    if (!grp) {
      const p = this.g.player;
      grp = { owner: id, items: [], trail: [{ x: p.x, y: p.y }], src: inst };
      grp.strike = (s) => this._followerStrike(grp, s);
      this.trails.set(id, grp);
    }
    Object.assign(grp, { count: 3, gap: 34, size: 6, color: '#fff', shape: 'dot' }, grp.cfg || {}, cfg);
    grp.cfg = { ...(grp.cfg || {}), ...cfg };
    grp.count = clamp(Math.floor(grp.count), 0, MAX_FOLLOWERS);
    grp.src = inst;
    this._layoutFollowers(grp);
    return grp;
  }

  followersOf(inst) { return this.trails.get(inst.def.id) || null; }

  // Follower i stands (i + 1) * gap px of path behind you, walking the trail (newest last) back from where you
  // are. A trail still too short bunches the rest at its far end.
  _layoutFollowers(grp) {
    const tr = grp.trail, p = this.g.player;
    while (grp.items.length < grp.count) grp.items.push({ x: p.x, y: p.y, glow: 0 });
    grp.items.length = grp.count;
    let i = 0, acc = 0, px = p.x, py = p.y;
    for (let k = tr.length - 1; k >= 0 && i < grp.count; k--) {
      const q = tr[k], seg = Math.hypot(px - q.x, py - q.y);
      while (i < grp.count && acc + seg >= (i + 1) * grp.gap) {
        const f = ((i + 1) * grp.gap - acc) / seg;
        grp.items[i].x = px + (q.x - px) * f; grp.items[i].y = py + (q.y - py) * f;
        i++;
      }
      acc += seg; px = q.x; py = q.y;
    }
    for (; i < grp.count; i++) { grp.items[i].x = px; grp.items[i].y = py; }
  }

  _followerStrike(grp, s) {
    const prev = this.g.src;
    this.g.src = grp.src;
    let n = 0;
    grp.items.forEach((it, i) => {
      if (s.index !== undefined && s.index !== i) return;
      it.glow = 1;
      n += this.pulse({ x: it.x, y: it.y, r: s.r ?? 28, damage: s.damage ?? 8, kb: s.kb ?? 60, stun: s.stun, slow: s.slow, color: s.color ?? grp.color, flashLife: 0.16, fill: 0.22 });
    });
    this.g.src = prev;
    return n;
  }

  // A swapped-out instrument takes everything it owns with it: orbiters, mines, walls, tethers, followers and
  // the shield it raised.
  // Sub-owners ('<id>:speaker', '<id>:wire') leave with their instrument too.
  clearOwner(ownerId) {
    const mine = (o) => o === ownerId || String(o).startsWith(ownerId + ':');
    this.orbits.delete(ownerId);
    this.trails.delete(ownerId);
    this.mines = this.mines.filter((m) => !mine(m.owner));
    this.walls = this.walls.filter((w) => !mine(w.owner));
    this.tethers = this.tethers.filter((t) => !mine(t.owner));
    if (this.g.shield?.src?.def?.id === ownerId) this.g.shield = null;
  }

  // Wipe out the enemy shots inside a circle (a ring's erase). Each one pops in a small spark.
  _erase(x, y, rad) {
    const shots = this.g.shots;
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      if (dist2(s.x, s.y, x, y) > rad * rad) continue;
      this.particles(s.x, s.y, s.color, 2, 90, 0.25, 2);
      swapRemove(shots, i);
    }
  }

  // ---------------------------------------------------------------- cosmetics
  // Cosmetics use Math.random, never the seeded rng, so juice can change without changing a seeded run.

  flash(x, y, r, color, life = 0.22, fill = 0.18) {
    this.flashes.push({ x, y, r, color, life, age: 0, fill });
    if (this.flashes.length > 160) this.flashes.shift();
  }

  particles(x, y, color, n = 6, speed = 160, life = 0.45, size = 2.5) {
    const g = this.g;
    if (g.opts.sim) return;
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX_PARTICLES) this.parts.shift();
      const a = Math.random() * TAU, s = speed * (0.3 + Math.random() * 0.7);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.6), age: 0, color, size: size * (0.6 + Math.random() * 0.8) });
    }
  }

  text(x, y, str, color = '#fff', size = 12) {
    if (this.g.opts.sim || !this.g.settings.damageNumbers) return;
    if (this.texts.length >= MAX_TEXTS) this.texts.shift();
    this.texts.push({ x: x + Math.random() * 12 - 6, y, str, color, size, life: 0.6, age: 0 });
  }

  // ---------------------------------------------------------------- update

  update(dt) {
    const g = this.g;
    const p = g.player;

    // Bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.age += dt;
      if (b.dead || b.age >= b.maxAge) { swapRemove(this.bullets, i); continue; }
      if (b.boomerang) {
        // Fly out, then come back to the player, hitting everything again on the way home.
        if (!b.returning && b.age >= b.life * 0.5) { b.returning = true; b.hit.clear(); }
        if (b.returning) {
          const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
          const sp = Math.max(260, Math.hypot(b.vx, b.vy));
          b.vx += ((dx / d) * sp - b.vx) * Math.min(1, dt * 6);
          b.vy += ((dy / d) * sp - b.vy) * Math.min(1, dt * 6);
          if (d < p.r + 8) { if (!(b.onReturn && b.onReturn(b, g))) swapRemove(this.bullets, i); continue; }
        }
      }
      if (b.homing) {
        b.retarget -= dt;
        if (!b.target || b.target.dead || b.retarget <= 0) { b.target = g.nearest(b.x, b.y, b.range, b.hit); b.retarget = 0.25; }
        if (b.target) {
          const want = Math.atan2(b.target.y - b.y, b.target.x - b.x);
          const cur = Math.atan2(b.vy, b.vx);
          let d = want - cur;
          while (d > Math.PI) d -= TAU;
          while (d < -Math.PI) d += TAU;
          const turn = clamp(d, -b.homing * dt, b.homing * dt);
          const sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(cur + turn) * sp; b.vy = Math.sin(cur + turn) * sp;
        }
      }
      if (b.drag) { const k = Math.max(0, 1 - b.drag * dt); b.vx *= k; b.vy *= k; }
      if (b.curve) { const c = Math.cos(b.curve * dt), s = Math.sin(b.curve * dt), vx = b.vx; b.vx = vx * c - b.vy * s; b.vy = vx * s + b.vy * c; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.rot += b.spin * dt;
      if (b.grow) b.r = Math.min(b.maxR, b.r + b.grow * dt);
      if (b.trail && !g.opts.sim && Math.random() < 0.5) this.parts.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.22, age: 0, color: b.color, size: b.r * 0.55 });
      // Collision
      let hitOne = null;
      g.grid.query(b.x, b.y, b.r, (e) => {
        if (e.dead || b.hit.has(e)) return;
        const rr = e.r + b.r;
        if (dist2(e.x, e.y, b.x, b.y) <= rr * rr) { hitOne = e; return false; }
      });
      if (hitOne) {
        b.hit.add(hitOne);
        const prev = g.src; g.src = b.src;
        g.hit(hitOne, b.damage, { kb: b.kb, fx: b.x - b.vx * 0.05, fy: b.y - b.vy * 0.05, stun: b.stun, slow: b.slow });
        if (b.onHit) b.onHit(b, hitOne, g);
        g.src = prev;
        if (b.bounce > 0) {
          b.bounce--;
          const nxt = g.nearest(b.x, b.y, 320, b.hit);
          if (nxt) {
            const sp = Math.hypot(b.vx, b.vy);
            const a = Math.atan2(nxt.y - b.y, nxt.x - b.x);
            b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
            b.age = Math.min(b.age, b.life * 0.4);
          } else if (b.pierce <= 0) b.dead = true;
        } else if (b.pierce > 0) b.pierce--;
        else b.dead = true;
      }
    }

    // Rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.follow) { r.x = p.x; r.y = p.y; }
      const k = clamp(r.t / r.dur, 0, 1);
      if (!r.yoyo) r.r = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k));
      else {
        r.r = r.r0 + (r.r1 - r.r0) * Math.sin(Math.PI * k);
        if (k >= 0.5 && !r.back) { r.back = true; r.hit.clear(); }
      }
      if (r.erase && k < 1) this._erase(r.x, r.y, r.r * r.erase);
      const cand = r.damage > 0 ? g.inRadius(r.x, r.y, r.r) : NO_TARGETS;   // a ring with no damage hits no one
      const prev = g.src; g.src = r.src;
      for (const e of cand) {
        if (r.hit.has(e)) continue;
        r.hit.add(e);
        g.hit(e, r.damage, { kb: r.kb, fx: r.x, fy: r.y, stun: r.stun, slow: r.slow });
      }
      g.src = prev;
      // splice keeps the order, so a cosmetic ring leaving never reorders the rings that hit (their order decides crits).
      if (r.t >= r.dur + 0.12) this.rings.splice(i, 1);
    }

    // Strikes
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.t += dt;
      if (s.target && !s.target.dead && s.t < s.delay * 0.7) { s.x = s.target.x; s.y = s.target.y; }
      if (s.t >= s.delay) {
        const prev = g.src; g.src = s.src;
        this.pulse({ x: s.x, y: s.y, r: s.r, damage: s.damage, kb: s.kb, stun: s.stun, slow: s.slow, color: s.color, fill: 0.28 });
        this.particles(s.x, s.y, s.color, 8, 200, 0.4, 3);
        if (s.onLand) s.onLand(s, g);
        g.src = prev;
        swapRemove(this.strikes, i);
      }
    }

    // Mines
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.age += dt;
      if (m.glow) m.glow = Math.max(0, m.glow - dt * 4);
      if (m.age >= m.life) this.mines.splice(i, 1);
    }

    // Orbits follow the player
    for (const grp of this.orbits.values()) {
      grp.angle += grp.speed * dt;
      this._layoutOrbit(grp);
      for (const it of grp.items) it.glow = Math.max(0, it.glow - dt * 4);
    }

    if (this.walls.length) this._updateWalls(dt);

    // Tethers drag their enemy toward you (never a boss or a charging enemy), until it is close or the tether ends.
    for (let i = this.tethers.length - 1; i >= 0; i--) {
      const t = this.tethers[i], e = t.e;
      t.age += dt;
      t.glow = Math.max(0, t.glow - dt * 5);
      if (e.dead || t.age >= t.life) { this.tethers.splice(i, 1); continue; }
      if (e.boss || e.ai.charge > 0 || e.spawnT > 0 || e.launch) continue;
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy);
      const stop = p.r + e.r + 26;
      if (d > stop) { const s = Math.min(d - stop, t.pull * dt) / d; e.x += dx * s; e.y += dy * s; }
    }

    // Followers walk your path: a breadcrumb every few px, as many as the longest gap needs.
    for (const grp of this.trails.values()) {
      const tr = grp.trail, last = tr[tr.length - 1];
      if (dist2(p.x, p.y, last.x, last.y) >= TRAIL_STEP * TRAIL_STEP) {
        tr.push({ x: p.x, y: p.y });
        const keep = Math.ceil(((grp.count + 1) * grp.gap) / TRAIL_STEP) + 2;
        if (tr.length > keep) tr.splice(0, tr.length - keep);
      }
      this._layoutFollowers(grp);
      for (const it of grp.items) it.glow = Math.max(0, it.glow - dt * 4);
    }

    this.updateCosmetics(dt);
  }

  // Walls: follow, turn, hit and bounce each enemy that touches them once, and erase the shots crossing them.
  _updateWalls(dt) {
    const g = this.g, p = g.player;
    const prev = g.src;
    for (let i = this.walls.length - 1; i >= 0; i--) {
      const w = this.walls[i];
      w.t += dt;
      if (w.t >= w.dur) { this.walls.splice(i, 1); continue; }
      if (w.follow) { w.x = p.x; w.y = p.y; }
      w.angle += w.spin * dt;
      const band = w.width / 2;
      g.src = w.src;
      for (const e of g.inRadius(w.x, w.y, w.r + band)) {
        if (w.hit.has(e)) continue;
        const d = Math.hypot(e.x - w.x, e.y - w.y);
        if (Math.abs(d - w.r) > band + e.r) continue;
        const slack = d > e.r ? Math.asin(Math.min(1, e.r / d)) : Math.PI;
        if (Math.abs(angDiff(Math.atan2(e.y - w.y, e.x - w.x), w.angle)) > w.half + slack) continue;
        w.hit.add(e);
        // Bounce back to the side it came from: outward from beyond the arc, inward from inside it.
        const out = d >= w.r, k = d || 1;
        const fx = out ? w.x : w.x + ((e.x - w.x) / k) * w.r * 2, fy = out ? w.y : w.y + ((e.y - w.y) / k) * w.r * 2;
        g.hit(e, w.damage, { kb: w.kb, fx, fy, stun: w.stun, slow: w.slow });
      }
      if (w.erase) {
        const shots = g.shots;
        for (let j = shots.length - 1; j >= 0; j--) {
          const s = shots[j];
          const d = Math.hypot(s.x - w.x, s.y - w.y);
          if (Math.abs(d - w.r) > band + s.r + 2) continue;
          if (Math.abs(angDiff(Math.atan2(s.y - w.y, s.x - w.x), w.angle)) > w.half) continue;
          w.erased++;
          this.particles(s.x, s.y, w.color, 2, 90, 0.25, 2);
          swapRemove(shots, j);
          if (w.onErase) w.onErase(w, s, g);
        }
      }
    }
    g.src = prev;
  }

  // Visual-only effects: safe to run while nothing else in the world moves (the death beat).
  updateCosmetics(dt) {
    const fade = (arr) => { for (let i = arr.length - 1; i >= 0; i--) { const f = arr[i]; f.age += dt; if (f.age >= f.life) swapRemove(arr, i); } };
    fade(this.flashes); fade(this.beams); fade(this.zaps); fade(this.cones);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.age += dt;
      if (q.age >= q.life) { swapRemove(this.parts, i); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.vx *= 0.92; q.vy *= 0.92;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.age += dt; t.y -= 34 * dt;
      if (t.age >= t.life) swapRemove(this.texts, i);
    }
  }
}
