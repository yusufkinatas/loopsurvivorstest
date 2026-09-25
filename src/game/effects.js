// Attack archetypes. An instrument's fire() calls one of these on each of its notes, so every
// projectile, shockwave and zap on screen was launched by a note you can hear.
// Every spawn records the instrument that made it (game.src) for damage attribution.

import { TAU, rand, rng, dist2, segDist2, clamp, swapRemove } from '../util.js';

const MAX_PARTICLES = 900;
const MAX_TEXTS = 70;
const MAX_BULLETS = 700;

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
    this.parts = [];
    this.texts = [];
  }

  // ---------------------------------------------------------------- archetypes

  // Moving projectile. o: x, y, angle|vx+vy, speed, r, damage, pierce (extra enemies it passes through),
  // life (s), color, shape ('dot'|'note'|'square'|'star'|'seed'|'shard'|'coin'), homing (turn rad/s),
  // bounce (ricochets to new targets), kb, stun, slow, drag, trail (bool), spin.
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
      spin: o.spin ?? 0, rot: o.rot ?? rand(0, TAU), hit: new Set(), target: null, retarget: 0, src: this.g.src,
      range: o.range ?? 420, onHit: o.onHit ?? null, dead: false,
      boomerang: !!o.boomerang, returning: false,
    };
    this.bullets.push(b);
    return b;
  }

  // Expanding shockwave that damages each enemy once as it passes. o: x, y, follow (bool: stays on player),
  // r0, r1, dur, damage, kb, stun, slow, width (visual), color.
  ring(o) {
    const r = {
      x: o.x, y: o.y, follow: !!o.follow, r0: o.r0 ?? 10, r1: o.r1 ?? 120, dur: o.dur ?? 0.3, t: 0,
      damage: o.damage ?? 10, kb: o.kb ?? 120, stun: o.stun ?? 0, slow: o.slow ?? 0,
      width: o.width ?? 6, color: o.color ?? '#fff', hit: new Set(), src: this.g.src, r: o.r0 ?? 10,
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

  // Instant straight line. o: x, y, angle, length, width, damage, kb, color, pierce (max targets).
  beam(o) {
    const g = this.g;
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
      g.hit(hits[i], o.damage, { kb: o.kb ?? 60, fx: o.x, fy: o.y, stun: o.stun, slow: o.slow });
    }
    this.beams.push({ x1: o.x, y1: o.y, x2, y2, width: w, color: o.color ?? '#fff', life: o.life ?? 0.16, age: 0 });
    return hits.length;
  }

  // Chain lightning. o: x, y, target (optional enemy), range (first jump), chain (number of targets),
  // chainRange, damage, falloff (per jump multiplier), color, stun.
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
  // o: owner, x, y, r (blast radius), damage, kb, stun, slow, color, life, max (cap per owner).
  mine(o) {
    const own = this.mines.filter((m) => m.owner === o.owner);
    if (o.max && own.length >= o.max) {
      const oldest = own[0];
      this.mines.splice(this.mines.indexOf(oldest), 1);
    }
    const m = {
      owner: o.owner, x: o.x, y: o.y, r: o.r ?? 60, damage: o.damage ?? 15, kb: o.kb ?? 120, stun: o.stun ?? 0,
      slow: o.slow ?? 0, color: o.color ?? '#fff', life: o.life ?? 6, age: 0, src: this.g.src, size: o.size ?? 7,
    };
    this.mines.push(m);
    return m;
  }

  // Blow up the mines of `owner` (optionally scaling damage). With armed: true, only mines that
  // have an enemy inside their blast go off; the rest keep waiting. Returns how many detonated.
  detonateMines(owner, scale = 1, { armed = false } = {}) {
    let n = 0;
    const prev = this.g.src;
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      if (m.owner !== owner || m.age < 0.05) continue;
      if (armed && !this.g.inRadius(m.x, m.y, m.r * 0.75).length) continue;
      this.g.src = m.src;
      this.pulse({ x: m.x, y: m.y, r: m.r, damage: m.damage * scale, kb: m.kb, stun: m.stun, slow: m.slow, color: m.color, fill: 0.3 });
      this.particles(m.x, m.y, m.color, 10, 220, 0.4, 3);
      this.mines.splice(i, 1);
      n++;
    }
    this.g.src = prev;
    return n;
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

  clearOwner(ownerId) {
    this.orbits.delete(ownerId);
    this.mines = this.mines.filter((m) => m.owner !== ownerId);
  }

  // ---------------------------------------------------------------- cosmetics

  flash(x, y, r, color, life = 0.22, fill = 0.18) {
    this.flashes.push({ x, y, r, color, life, age: 0, fill });
    if (this.flashes.length > 160) this.flashes.shift();
  }

  particles(x, y, color, n = 6, speed = 160, life = 0.45, size = 2.5) {
    const g = this.g;
    if (g.opts.sim) return;
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX_PARTICLES) this.parts.shift();
      const a = rand(0, TAU), s = speed * (0.3 + rng() * 0.7);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + rng() * 0.6), age: 0, color, size: size * (0.6 + rng() * 0.8) });
    }
  }

  text(x, y, str, color = '#fff', size = 12) {
    if (this.g.opts.sim || !this.g.settings.damageNumbers) return;
    if (this.texts.length >= MAX_TEXTS) this.texts.shift();
    this.texts.push({ x: x + rand(-6, 6), y, str, color, size, life: 0.6, age: 0 });
  }

  // ---------------------------------------------------------------- update

  update(dt) {
    const g = this.g;
    const p = g.player;

    // Bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.age += dt;
      if (b.dead || b.age >= (b.boomerang ? b.life * 2.5 : b.life)) { swapRemove(this.bullets, i); continue; }
      if (b.boomerang) {
        // Fly out, then come back to the player, hitting everything again on the way home.
        if (!b.returning && b.age >= b.life * 0.5) { b.returning = true; b.hit.clear(); }
        if (b.returning) {
          const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
          const sp = Math.max(260, Math.hypot(b.vx, b.vy));
          b.vx += ((dx / d) * sp - b.vx) * Math.min(1, dt * 6);
          b.vy += ((dy / d) * sp - b.vy) * Math.min(1, dt * 6);
          if (d < p.r + 8) { swapRemove(this.bullets, i); continue; }
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
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.rot += b.spin * dt;
      if (b.trail && !g.opts.sim && rng() < 0.5) this.parts.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.22, age: 0, color: b.color, size: b.r * 0.55 });
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
      r.r = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k));
      const cand = g.inRadius(r.x, r.y, r.r);
      const prev = g.src; g.src = r.src;
      for (const e of cand) {
        if (r.hit.has(e)) continue;
        r.hit.add(e);
        g.hit(e, r.damage, { kb: r.kb, fx: r.x, fy: r.y, stun: r.stun, slow: r.slow });
      }
      g.src = prev;
      if (r.t >= r.dur + 0.12) swapRemove(this.rings, i);
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
      if (m.age >= m.life) this.mines.splice(i, 1);
    }

    // Orbits follow the player
    for (const grp of this.orbits.values()) {
      grp.angle += grp.speed * dt;
      this._layoutOrbit(grp);
      for (const it of grp.items) it.glow = Math.max(0, it.glow - dt * 4);
    }

    // Cosmetics
    const fade = (arr) => { for (let i = arr.length - 1; i >= 0; i--) { const f = arr[i]; f.age += dt; if (f.age >= f.life) swapRemove(arr, i); } };
    fade(this.flashes); fade(this.beams); fade(this.zaps);
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
