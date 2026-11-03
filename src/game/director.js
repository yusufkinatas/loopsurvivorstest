// Spawns the Noise on the beat as a horde: a floor of bodies near you that refills every beat (the screen never
// clears), a stream on top of it that piles up when the band cannot keep up, waves that swap weak bodies for
// tougher variants of the same silhouettes each section, and set pieces on the song's moments: a ring the bar
// before each impact, a wall that sweeps in when a phrase goes quiet, swarms that cross the screen on the Build-Up's
// roll, and a slow rotation of the three in between. Each chorus opens with a boss on its first downbeat, and the
// floor steps back while it is up so the boss stays the fight. Healing comes on the song's schedule: breather hearts
// in the calm sections, hearts on timed elites. Every number lives in BALANCE (horde, waves, variants, sets).

import { TAU, rand, rng, pick, clamp } from '../util.js';
import { WORLD, BEAT_SEC, BALANCE } from '../config.js';
import { spawnEnemy, randomType, ENEMY_TYPES } from './enemies.js';

const RANGED = ['screech', 'snare'];
const SAMPLE_EVERY = 8;   // frames between the ledger's crowd samples
const KD_BIN = 50, KD_BINS = 13;   // kill distance bins (px) in the ledger
const ON_BIN = 5, ON_BINS = 81;    // on-screen count bins in the ledger

export class Director {
  constructor(g) { this.g = g; this.reset(); }

  reset() {
    this.eliteTimer = 58;
    this.hearts = 0;         // timed elites' heart share (below 1 per elite at Gain 8)
    this.lastFormationBar = -1;
    this.lastImpactBar = -1;
    this.lastBreatherBar = -1;
    this.lastQuietBar = -1;
    this.lastSwarmBar = -1;
    this.lastDropBar = -1;   // the player's last Drop the refill grace has seen (g._dropBar)
    this.ringBar = -1;       // the bar the Stomp ring lights its lanes on (enemiesOnBeat reads it)
    this.quiet = false;      // the phrase playing now is a quiet one (the band plays thin)
    this.rot = 0;            // the next mid-phrase set piece in BALANCE.sets.rotation
    this.streamAcc = 0;      // fractional stream bodies carried to the next beat
    this.near = 0;           // bodies near the view at the last beat
    this.live = {};          // live bodies by type at the last beat (caps on the shooters and the chargers)
    this.graceUntil = -1;    // the bar until which the refill runs at horde.refill.grace (after a clear)
    this.frame = 0;
  }

  get wave() { const id = this.g.section?.id; return this.g.tune?.waves?.[id] || BALANCE.waves[id] || BALANCE.waves.finale; }   // a song may bring its own crowd
  // The wave's base types (elites draw from them).
  get types() { return [...new Set(Object.keys(this.wave).map((k) => k.split(':')[0]))]; }

  bossUp() { const b = this.g.boss; return b && !b.dead ? b : null; }

  // 0..1 through the section. The open-ended Finale ramps over its first horde.finaleBars, then holds.
  progress(pos) {
    const bars = Number.isFinite(pos.section.bars) ? pos.section.bars : BALANCE.horde.finaleBars;
    return Math.min(1, pos.barInSection / Math.max(1, bars - 1));
  }

  // The floor scales with the view's area (clamped), so a phone and a wide monitor see about the same density.
  viewK() { const v = this.g.view, H = BALANCE.horde; return clamp((v.w * v.h) / H.view.ref, H.view.min, H.view.max); }

  density() { return BALANCE.horde.scale * (this.g.opts.density ?? 1) * this.g.mods.density * this.viewK(); }

  // The minimum number of bodies near the view right now: the section's ramp, stepped back while a boss is up
  // and in a quiet phrase.
  floor(pos) {
    const H = BALANCE.horde, g = this.g;
    const F = H.floor[g.section.id] ?? H.floor.finale;
    const [a, b] = Array.isArray(F) ? F : [F, F];
    let n = a + (b - a) * this.progress(pos);
    const boss = this.bossUp();
    if (boss) n *= boss.def.final ? H.finalBoss : H.boss;
    if (this.quiet) n *= BALANCE.quiet.floor;
    return Math.floor(n * this.density());
  }

  // Bodies inside the view grown by horde.near px (set pieces count once they are inside, so a ring or a wall
  // pauses the refill instead of adding to it), and live bodies by type.
  census() {
    const g = this.g, p = g.player, H = BALANCE.horde;
    const hw = g.view.w / 2 + H.near, hh = g.view.h / 2 + H.near;
    const live = {};
    let near = 0;
    for (const e of g.enemies) {
      if (e.dead || e.boss) continue;
      live[e.type] = (live[e.type] || 0) + 1;
      if (Math.abs(e.x - p.x) < hw && Math.abs(e.y - p.y) < hh) near++;
    }
    this.live = live;
    return (this.near = near);
  }

  // A wave key 'type' or 'type:variant'. A shooter or a Stomp past its live cap falls back to the section's
  // fallback key; in a quiet phrase quiet.upgrade of the plain bodies come loud.
  pickKey(quiet, mix = this.wave) {
    const H = BALANCE.horde;
    let [type, variant] = randomType(mix).split(':');
    const cap = H.liveMax[type];
    if (cap !== undefined && (this.live[type] || 0) >= cap * this.viewK()) [type, variant] = (H.fallback[this.g.section.id] || 'static').split(':');
    if (H.liveMax[type] !== undefined) this.live[type] = (this.live[type] || 0) + 1;
    if (quiet && !variant && !RANGED.includes(type) && type !== 'stomp' && rng() < BALANCE.quiet.upgrade) variant = 'loud';
    return [type, variant];
  }

  // spawnEnemy with a variant's multipliers (BALANCE.variants) folded into its opts.
  spawn(type, variant, x, y, opts = {}) {
    const V = variant && BALANCE.variants[variant];
    if (!V) return spawnEnemy(this.g, type, x, y, opts);
    return spawnEnemy(this.g, type, x, y, {
      ...opts, variant,
      hpMul: (opts.hpMul ?? 1) * V.hp, scale: (opts.scale ?? 1) * V.scale, speedMul: (opts.speedMul ?? 1) * V.speed,
      dmgMul: (opts.dmgMul ?? 1) * V.dmg, xpMul: (opts.xpMul ?? 1) * V.xp, massMul: (opts.massMul ?? 1) * V.mass,
    });
  }
  spawnKey(key, x, y, opts) { const [t, v] = key.split(':'); return this.spawn(t, v, x, y, opts); }

  // A body's radius for a key's type and variant (set pieces space their bodies by it).
  bodyR(type, variant) { return (ENEMY_TYPES[type]?.r ?? 11) * (BALANCE.variants[variant]?.scale ?? 1); }

  moving() { const p = this.g.player, m = BALANCE.horde.moving; return p.vx * p.vx + p.vy * p.vy > m * m; }

  // The edge the player is heading to (0 right, 1 left, 2 bottom, 3 top).
  aheadSide() {
    const g = this.g, p = g.player;
    return Math.abs(p.vx) * g.view.h > Math.abs(p.vy) * g.view.w ? (p.vx > 0 ? 0 : 1) : (p.vy > 0 ? 2 : 3);
  }

  // A point just outside the view's edge, horde.edge px past it: on a side picked by its length, or (horde.ahead of
  // the time while you move) on the side you are heading to, so running away runs into the horde. Spawns on that
  // side land horde.aheadExtra px further out, for about two seconds of warning.
  edgePoint(extra = 0, side = null) {
    const g = this.g, p = g.player, H = BALANCE.horde, hw = g.view.w / 2, hh = g.view.h / 2;
    const heading = this.moving() ? this.aheadSide() : -1;
    if (side === null) {
      if (heading >= 0 && rng() < H.ahead) side = heading;
      else side = rng() * (hw + hh) < hh ? (rng() < 0.5 ? 0 : 1) : (rng() < 0.5 ? 2 : 3);
    }
    const m = rand(H.edge[0], H.edge[1]) + extra + (side === heading ? H.aheadExtra : 0);
    let x, y;
    if (side < 2) { x = p.x + (side === 0 ? hw + m : -hw - m); y = p.y + rand(-hh - m, hh + m); }
    else { y = p.y + (side === 2 ? hh + m : -hh - m); x = p.x + rand(-hw - m, hw + m); }
    return { x, y, side, a: Math.atan2(y - p.y, x - p.x) };
  }

  // A radial point outside the view (bosses walk in from it).
  spawnPoint(extra = 0) {
    const g = this.g, p = g.player;
    const a = rand(0, TAU);
    const d = Math.hypot(g.view.w, g.view.h) / 2 + WORLD.spawnMargin + extra + rand(0, 60);
    return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, a };
  }

  // A drop-in: a plain light body of the wave lands close to you after a one-beat ring.
  dropIn() {
    const g = this.g, p = g.player, D = BALANCE.dropIns;
    const sub = {};
    for (const k in this.wave) {
      const [t, v] = k.split(':');
      if (D.types.includes(t) && !(D.plainOnly && v)) sub[k] = this.wave[k];
    }
    if (!Object.keys(sub).length) return false;
    const a = rand(0, TAU), d = rand(D.min, D.max);
    return !!this.spawnKey(randomType(sub), p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, { telegraph: D.telegraph * BEAT_SEC });
  }

  // A song impact lands within the next `bars` bars.
  impactAhead(bar, bars) {
    for (let i = 1; i <= bars; i++) if (this.g.song.position(bar + i).arr.impact) return true;
    return false;
  }

  onBeat(ev) {
    const g = this.g, H = BALANCE.horde, R = H.refill, S = BALANCE.sets, D = BALANCE.dropIns;
    const pos = g.song.position(ev.bar);
    const id = g.section.id;
    // A quiet phrase (the song's arrangement says so; before it does, the drums sitting out): a thinner floor and
    // stream, louder bodies, elites sooner, a wall on its downbeat, no drop-ins and no rotation.
    const quiet = this.quiet = !!(pos.arr.quiet ?? pos.arr.rest?.includes('beat') ?? false);
    const near = this.census();
    const floor = this.floor(pos);
    // A clear reads as a clear: the refill runs at R.grace for R.graceBars after a song impact downbeat and after
    // the player's Drop, and the room fills back from the edges.
    if (pos.arr.impact && ev.beat === 0) this.graceUntil = Math.max(this.graceUntil, ev.bar + R.graceBars);
    if (R.afterDrop && g._dropBar >= 0 && g._dropBar !== this.lastDropBar) {
      this.lastDropBar = g._dropBar;
      this.graceUntil = Math.max(this.graceUntil, g._dropBar + R.graceBars);
    }
    const grace = ev.bar < this.graceUntil;
    // The floor: whatever is missing comes back on this beat, up to the refill cap.
    let n = near < floor ? Math.min(floor - near, Math.ceil(Math.max(R.base, floor * R.share) * (grace ? R.grace : 1))) : 0;
    // The stream: bodies per second on top, while the crowd near you is under cap x floor.
    this.streamAcc += (H.stream[id] ?? 0) * (quiet ? BALANCE.quiet.stream : 1) * this.density() * BEAT_SEC;
    const s = Math.floor(this.streamAcc);
    this.streamAcc -= s;
    if (near + n < floor * H.cap) n += s;
    // The floor and the stream leave horde.reserve under the cap for set pieces, summons, splits and elites.
    n = Math.max(0, Math.min(n, WORLD.maxEnemies - H.reserve - g.enemies.length));
    const share = quiet || grace ? 0 : D.share[id] ?? 0;
    let drops = 0;
    for (let i = 0; i < n; i++) {
      if (share > 0 && drops < D.perBeat && rng() < share && this.dropIn()) { drops++; continue; }
      const [t, v] = this.pickKey(quiet);
      const q = this.edgePoint();
      this.spawn(t, v, q.x, q.y);
    }
    // Mid-phrase set pieces in a fixed rotation, every S.rotationEvery bars: not in a quiet phrase or the Build-Up,
    // not before 35 s, and not when a song impact is about to land (its own ring is the set piece then). While a
    // boss is up a ring turn sends a swarm instead, so a ring and a boss never pin you together.
    if (!quiet && ev.beat === 0 && ev.bar % S.rotationEvery === S.rotationAt && g.time > 35 && ev.bar !== this.lastFormationBar
      && !g.section.build && !this.impactAhead(ev.bar, S.skipNearImpact)) {
      this.lastFormationBar = ev.bar;
      let kind = S.rotation[this.rot++ % S.rotation.length];
      if (kind === 'ring' && this.bossUp()) kind = 'swarm';
      this.formation(kind);
    }
    // The bar before an arrangement impact a ring closes in, so the band's release lands on a crowd. It belongs to
    // the section the impact opens. The Build-Up has its own set piece (the Stomp ring) before The Drop.
    if (BALANCE.formation.impactRing && ev.beat === 0 && !g.section.build && ev.bar !== this.lastImpactBar) {
      const next = g.song.position(ev.bar + 1);
      if (next.arr.impact) {
        this.lastImpactBar = ev.bar;
        this.formation('ring', { sec: next.section.id });
      }
    }
    // A phrase going quiet: a wall sweeps in while the band plays thin (in the pincer sections two, from the two
    // ends of the view's long axis).
    if (quiet && pos.arr.pb === 0 && ev.beat === 0 && ev.bar !== this.lastQuietBar && g.time > 35) {
      this.lastQuietBar = ev.bar;
      this.formation('wall', { pincer: S.wall.pincer.includes(id) });
    }
    // The Build-Up's roll: swarms cross the screen on its set bars.
    if (g.section.build && ev.beat === 0 && S.buildSwarms.includes(pos.barInSection) && ev.bar !== this.lastSwarmBar) {
      this.lastSwarmBar = ev.bar;
      this.formation('swarm');
    }
    // Featured elites walk in on a crash in the quiet stretches between bosses, each with a vinyl: Verse II's bars
    // 80 and 96, and the Bridge's 152 (the drums come back after the breakdown) and 168 (after a phrase fill).
    const featured = id === 'verse2' ? 0 : id === 'bridge' ? 8 : -1;
    if (ev.beat === 0 && ev.bar % 16 === featured) this.spawnElite();
    // Breathers: the calm sections put a heart near you on set bars.
    const hb = BALANCE.hearts.breathers[id];
    if (ev.beat === 0 && hb?.includes(pos.barInSection) && ev.bar !== this.lastBreatherBar) {
      this.lastBreatherBar = ev.bar;
      const a = rand(0, TAU), d = BALANCE.hearts.breatherDist;
      g.dropHeart(g.player.x + Math.cos(a) * d, g.player.y + Math.sin(a) * d);
    }
    // Set piece: on beat 3 of the Build-Up's last bar a ring of Stomps appears around you, lights its lanes on
    // beat 4 and slams in on the downbeat where the song drops (a Drop timed for that downbeat clears it).
    // Once only: a resume can replay beat 3.
    if (ev.beat === 2 && g.section.build && ev.bar !== this.ringBar && g.song.position(ev.bar).barsLeft === 1) this.stompRing(ev.bar);
  }

  // Set pieces. Their bodies carry e.set for the ledger.
  // ring: closes in from sets.ring.dist after a one-beat telegraph, a door of empty slots facing away from the boss
  //   (or anywhere), a second ring behind it in the late sections with no boss up. opts.sec: the section it
  //   belongs to (an impact's ring belongs to the section the impact opens).
  // swarm: a dense block marching across the screen through where you will be in a second, then hunting.
  // wall: a line across the view marching straight in from one edge, then hunting (opts.pincer: two, from the two
  //   ends of the view's long axis, so each spans the short side and the way out is close).
  formation(kind, opts = {}) {
    const g = this.g, p = g.player, id = opts.sec || g.section.id;
    const m = g.time / 60, S = BALANCE.sets, k = this.density();
    if (kind === 'ring') {
      const R = S.ring;
      const [t, v] = (R.key[id] || R.key.default || 'static').split(':');
      const step0 = 2 * this.bodyR(t, v) + R.gapMin;   // at least gapMin px between bodies when they appear
      const boss = this.bossUp();
      const rings = [[R.dist, 1]];
      if (R.double.includes(id) && !boss) rings.push([R.dist + R.gap, 0.75]);
      const want = Math.floor((R.base + m * R.perMin) * k);
      // The door faces away from the boss: the way out is on your side, not through it.
      const door = boss ? Math.atan2(p.y - boss.y, p.x - boss.x) : rand(0, TAU);
      let halfDoor = 0;
      rings.forEach(([d, share], j) => {
        const c = Math.min(Math.floor(want * share), j === 0 ? R.max : Math.floor(R.max * share), Math.floor((TAU * d) / step0));
        if (c < 3) return;
        if (j === 0) halfDoor = (R.door / 2) * (TAU / c);   // R.door slots of the first ring, lined up through the second
        for (let i = 0; i < c; i++) {
          const a = door + ((i + j * 0.5) / c) * TAU;
          const off = Math.abs(Math.atan2(Math.sin(a - door), Math.cos(a - door)));
          if (off < halfDoor) continue;
          this.spawn(t, v, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, { telegraph: BALANCE.formation.telegraph * BEAT_SEC, set: 'ring' });
        }
      });
    } else if (kind === 'swarm') {
      const W = S.swarm;
      const n = Math.min(W.max, Math.floor((W.base + m * W.perMin) * k));
      const key = W.key[id] || W.key.default || 'buzz';
      const R = W.spread * Math.sqrt(n);
      const s = this.edgePoint(Math.max(30, R * 0.7));
      const a = Math.atan2(p.y + p.vy - s.y, p.x + p.vx - s.x);
      const ux = Math.cos(a), uy = Math.sin(a);
      for (let i = 0; i < n; i++) {
        const r = R * Math.sqrt(rng()), b = rand(0, TAU);
        const e = this.spawnKey(key, s.x + Math.cos(b) * r, s.y + Math.sin(b) * r, { set: 'swarm' });
        if (e) e.ai.march = { ux, uy, until: g.time + W.march };
      }
    } else if (kind === 'wall') {
      const W = S.wall, vw = g.view.w, vh = g.view.h;
      const [t, v] = (W.key[id] || W.key.default || 'static').split(':');
      const step = 2 * this.bodyR(t, v) * (v === 'heavy' ? W.heavySpacing : W.spacing);
      let sides;
      if (opts.pincer) sides = (W.pincerAxis === 'long') === (vw >= vh) ? [0, 1] : [2, 3];
      else sides = [rng() * (vw + vh) < vh ? (rng() < 0.5 ? 0 : 1) : (rng() < 0.5 ? 2 : 3)];
      for (const side of sides) {
        const across = side < 2 ? vh : vw;
        const c = Math.min(W.max, Math.floor((across * W.span) / step));
        const o = this.edgePoint(20, side);
        const ux = side === 0 ? -1 : side === 1 ? 1 : 0, uy = side === 2 ? -1 : side === 3 ? 1 : 0;
        for (let i = 0; i < c; i++) {
          const off = (i - (c - 1) / 2) * step;
          const x = side < 2 ? o.x : p.x + off, y = side < 2 ? p.y + off : o.y;
          const e = this.spawn(t, v, x, y, { set: 'wall' });
          if (e) e.ai.march = { ux, uy, until: g.time + W.march };
        }
      }
    }
  }

  stompRing(bar) {
    const g = this.g, p = g.player;
    // Well inside the view on every screen, and on big screens still inside a Stomp's 520 px arm range.
    const n = 10, R = Math.min(400, Math.min(g.view.w, g.view.h) / 2 - 80);
    this.ringBar = bar;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const e = spawnEnemy(g, 'stomp', p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, { hpMul: 1.5 });
      if (e) e.ai.ring = true;
    }
  }

  // An elite from the wave's types (minus BALANCE.elites.exclude): a big gold-outlined body that hunts you and drops
  // a vinyl (one level-up) when featured, or a heart when it is one of the timed ones. It walks in from the edge.
  spawnElite(vinyl = true, heart = false) {
    const s = this.edgePoint(60);
    const ex = BALANCE.elites.exclude || [];
    const types = this.types.filter((k) => !ex.includes(k));
    spawnEnemy(this.g, types.length ? pick(types) : 'static', s.x, s.y, { elite: true, vinyl, heart });
  }

  onSection(ev) {
    const sec = ev.section;
    if (sec.boss) {
      const s = this.spawnPoint(-40);
      spawnEnemy(this.g, sec.boss, s.x, s.y);
    }
  }

  update(dt) {
    const g = this.g, H = BALANCE.horde;
    // Gain 8: elites come more often. Quiet phrases bring them sooner too.
    this.eliteTimer -= dt * g.mods.elite * (this.quiet ? BALANCE.quiet.elite : 1);
    if (this.eliteTimer <= 0) {
      this.eliteTimer = Math.max(28, 52 - g.time / 25);
      this.hearts += 1 / g.mods.elite;   // the extra ones carry no heart, so they add fights, not healing
      this.spawnElite(false, this.hearts >= 1 && BALANCE.hearts.eliteHeart);
      if (this.hearts >= 1) this.hearts--;
    }
    // Recycle: a body left horde.recycle px beyond the view's edge comes back on the edge ahead of you (its health
    // kept), so the floor stays around the player and running away runs into it. Bodies in flight, charging or
    // still arriving stay where they are.
    // The same pass bins how far from you this frame's kills died, for the sims' ledger (dead bodies are removed
    // right after the director runs, so each is seen once).
    const p = g.player, hw = g.view.w / 2 + H.recycle, hh = g.view.h / 2 + H.recycle;
    const ahead = this.moving() ? this.aheadSide() : null;
    const L = g._led?.();
    const kd = L ? (L.kd ||= new Array(KD_BINS).fill(0)) : null;
    for (const e of g.enemies) {
      if (e.dead) {
        if (kd && !e.boss && !e._kd) { e._kd = true; kd[Math.min(KD_BINS - 1, Math.floor(Math.hypot(e.x - p.x, e.y - p.y) / KD_BIN))]++; }
        continue;
      }
      if (e.boss || e.launch || e.ai.charge > 0 || e.spawnT > 0) continue;
      if (Math.abs(e.x - p.x) > hw || Math.abs(e.y - p.y) > hh) {
        const s = this.edgePoint(0, ahead);
        e.x = s.x; e.y = s.y; e.ai.march = null; e.kbx = 0; e.kby = 0;
      }
    }
    if (L) this.sample(L);
  }

  // The sims' ledger (tools/sim.mjs --summary): every few frames, the bodies on screen and within 150 px of you.
  sample(L) {
    const g = this.g, p = g.player;
    if (++this.frame % SAMPLE_EVERY || g.state !== 'playing') return;
    const hw = g.view.w / 2, hh = g.view.h / 2;
    let on = 0, w150 = 0;
    for (const e of g.enemies) {
      if (e.dead || e.boss) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      if (Math.abs(dx) < hw && Math.abs(dy) < hh) on++;
      const r = 150 + e.r;
      if (dx * dx + dy * dy < r * r) w150++;
    }
    L.onN = (L.onN || 0) + 1;
    L.onscr = (L.onscr || 0) + on;
    L.onMax = Math.max(L.onMax || 0, on);
    L.w150 = (L.w150 || 0) + w150;
    (L.onBins ||= new Array(ON_BINS).fill(0))[Math.min(ON_BINS - 1, Math.floor(on / ON_BIN))]++;
  }
}
