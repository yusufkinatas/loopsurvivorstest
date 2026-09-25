// The run. Owns the world, turns sequencer note events into attacks, and exposes the small API
// that instrument fire() functions use (see docs/INSTRUMENTS.md).

import { ROLES, ROLE_INFO, STEP_SEC, ECHO_STEPS, PLAYER_BASE, DROP, REROLLS_PER_RUN, MAX_INSTRUMENT_LEVEL } from '../config.js';
import { rng, seedRng, dist2, rand, TAU, swapRemove, clamp } from '../util.js';
import { KEYS } from '../music/theory.js';
import { Song, SECTIONS, FINALE_BAR } from '../music/song.js';
import { Effects } from './effects.js';
import { SpatialHash } from './grid.js';
import { Director } from './director.js';
import { updateEnemies, enemiesOnBeat, spawnEnemy } from './enemies.js';
import { dropGem, dropItem, updatePickups, magnetAll } from './pickups.js';
import { Loadout, computeStats, makeInst, genreName } from './loadout.js';
import { buildOffers, applyOffer } from './upgrades.js';
import { BY_ID } from '../content/instruments/index.js';
import { PEDAL_BY_ID } from '../content/pedals.js';

export class Game {
  constructor({ audio, clock, seq, opts = {}, settings = {}, hooks = {} }) {
    this.audio = audio;
    this.clock = clock;
    this.seq = seq;
    this.opts = opts;
    this.settings = { damageNumbers: true, shake: true, flashes: true, ...settings };
    this.hooks = hooks;
    this.fx = new Effects(this);
    this.grid = new SpatialHash(72);
    this.director = new Director(this);
    this.view = { w: 1280, h: 720 };
    this.state = 'idle';
    this.src = null;
    this.dmgScale = 1;
    this._errs = new Set();
    this._evbuf = [];
    seq.getInstruments = () => (this.loadout ? this.loadout.instruments() : []);
  }

  // ------------------------------------------------------------------ run lifecycle

  newRun({ start, keyIndex, seed } = {}) {
    if (seed !== undefined) seedRng(seed);
    this.key = KEYS[keyIndex ?? Math.floor(rng() * KEYS.length)];
    this.song = new Song(this.key.pc);
    this.seq.reset(this.song);
    this.seq.getInstruments = () => (this.loadout ? this.loadout.instruments() : []);
    this.retired = [];
    this.player = {
      x: 0, y: 0, r: PLAYER_BASE.radius, hp: PLAYER_BASE.maxHp, maxHp: PLAYER_BASE.maxHp,
      iframes: 0, faceX: 1, faceY: 0, vx: 0, vy: 0, speedNow: 0, hurtT: 0,
    };
    this.enemies = [];
    this.damageTaken = { contact: 0, shots: 0, boss: 0 };
    this.shots = [];
    this.gems = [];
    this.later = [];
    this.fx.reset();
    this.director.reset();
    this.loadout = new Loadout();
    this.stats = computeStats(this.loadout);
    this.time = 0;
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNeed = this.xpFor(1);
    this.pendingLevels = 0;
    this.rerolls = REROLLS_PER_RUN;
    this.dropCharge = 0;
    this.dropMax = DROP.charge;
    this.dropState = null;
    this.drops = 0;
    this.bonusScore = 0;
    this.beatPulse = 0;
    this.barPulse = 0;
    this.shake = 0;
    this.hurtFlash = 0;
    this.dropFlash = 0;
    this.boss = null;
    this.bossesBeaten = 0;
    this.chanPulse = Object.fromEntries(ROLES.map((r) => [r, 0]));
    this.sectionIndex = 0;
    this.section = SECTIONS[0];
    this.won = false;
    this.victoryT = 0;
    this.offers = null;
    this.preview = null;
    this.sectionBanner = null;
    const startDef = BY_ID[start] || BY_ID.kick808 || Object.values(BY_ID)[0];
    if (startDef) this.addInstrument(startDef, 1);
    for (const g of this.opts.give || []) {
      const def = BY_ID[g.id];
      if (def) this.addInstrument(def, clamp(g.level || 1, 1, MAX_INSTRUMENT_LEVEL));
    }
    for (const p of this.opts.givePedals || []) {
      const pd = PEDAL_BY_ID[p.id];
      if (pd && !this.loadout.pedal(p.id)) this.loadout.pedals.push({ def: pd, level: clamp(p.level || 1, 1, 3) });
    }
    this.onLoadoutChanged();
    this.player.hp = this.player.maxHp;
    this.state = 'playing';
    this.seq.hold = false;
    this.seq.start(this.clock.now() + 0.12);
    if (this.audio?.ready) { this.audio.setMuffle(false); this.audio.setPreviewRole(null); }
    this.banner(this.section.name, `${this.key.name} · ${Math.round(60 / (STEP_SEC * 4))} BPM`);
  }

  xpFor(level) { return Math.round(5 + level * 3.1 + level * level * 0.17); }

  // ------------------------------------------------------------------ loadout

  addInstrument(def, level) {
    const old = this.loadout.channels[def.role];
    if (old) this._disposeInst(old);
    const inst = this.loadout.set(def, level);
    inst.since = this.time;
    this._setupInst(inst);
    this.onLoadoutChanged();
    return inst;
  }

  setInstrumentLevel(inst, level) {
    inst.level = clamp(level, 1, MAX_INSTRUMENT_LEVEL);
    this._setupInst(inst);
    this.onLoadoutChanged();
  }

  _setupInst(inst) {
    if (!inst.def.setup) return;
    const prev = this.src; this.src = inst;
    this._stableAmount = true;
    try { inst.def.setup(this, inst.def.levels[inst.level - 1].stats, inst); } catch (e) { this._report(inst.def.id + '.setup', e); }
    this._stableAmount = false;
    this.src = prev;
  }

  _disposeInst(inst) {
    try { inst.def.dispose?.(this, inst); } catch (e) { this._report(inst.def.id + '.dispose', e); }
    this.fx.clearOwner(inst.def.id);
    if (inst.notes > 0 || inst.dmg > 0) (this.retired ||= []).push(inst);
  }

  onLoadoutChanged() {
    const oldMax = this.player?.maxHp ?? PLAYER_BASE.maxHp;
    this.stats = computeStats(this.loadout);
    if (this.player) {
      this.player.maxHp = this.stats.maxHp;
      if (this.player.maxHp > oldMax) this.player.hp += this.player.maxHp - oldMax;
      this.player.hp = Math.min(this.player.hp, this.player.maxHp);
    }
    // Instruments that depend on stats (orbiter counts, etc.) re-read them.
    for (const inst of this.loadout.instruments()) this._setupInst(inst);
    if (this.audio?.ready) {
      this.audio.applyPedals(this.loadout.pedalLevels());
      this.audio.setActiveCount(this.loadout.filled());
    }
    this.genre = genreName(this.loadout);
    this.hooks.onLoadout?.();
  }

  // ------------------------------------------------------------------ API for instruments

  // Scaled damage: base x global damage multiplier x echo scale.
  dmg(base) { return base * this.stats.damage * this.dmgScale; }
  area(r) { return r * this.stats.area; }
  // Counts scale by a percentage (Chorus pedal, 8-Bit chemistry), so a one-shot weapon and a
  // six-shot weapon gain the same share. Fractions round by chance per note, and deterministically
  // inside setup() so orbiter counts do not flicker.
  amount(n) {
    const v = n * (1 + this.stats.amount);
    if (this._stableAmount) return Math.max(0, Math.round(v));
    const base = Math.floor(v);
    return Math.max(0, base + (rng() < v - base ? 1 : 0));
  }

  // Heal the player (support instruments). Echo copies heal at echo strength.
  heal(n) {
    const p = this.player;
    if (!(n > 0) || p.hp >= p.maxHp) return 0;
    const amt = Math.min(p.maxHp - p.hp, n * this.dmgScale);
    p.hp += amt;
    return amt;
  }
  speed(v) { return v * this.stats.projSpeed; }
  color(roleOrInst) {
    const role = typeof roleOrInst === 'string' ? roleOrInst : roleOrInst?.def?.role;
    return ROLE_INFO[role]?.color || '#ffffff';
  }

  // Facing direction of the player (last movement direction), as an angle.
  aim() { return Math.atan2(this.player.faceY, this.player.faceX); }

  nearest(x, y, range = 500, exclude = null) {
    let best = null, bd = range * range;
    this.grid.query(x, y, range, (e) => {
      if (e.dead || e.spawnT > 0.2 || (exclude && exclude.has(e))) return;
      const d = dist2(e.x, e.y, x, y) - e.r * e.r * 0.5;
      if (d < bd) { bd = d; best = e; }
    });
    return best;
  }

  nearestN(x, y, n, range = 500) {
    const arr = [];
    this.grid.query(x, y, range, (e) => {
      if (e.dead || e.spawnT > 0.2) return;
      const d = dist2(e.x, e.y, x, y);
      if (d < range * range) arr.push([d, e]);
    });
    arr.sort((a, b) => a[0] - b[0]);
    return arr.slice(0, n).map((a) => a[1]);
  }

  inRadius(x, y, r) {
    const out = [];
    this.grid.query(x, y, r, (e) => {
      if (e.dead) return;
      const rr = r + e.r;
      if (dist2(e.x, e.y, x, y) <= rr * rr) out.push(e);
    });
    return out;
  }

  randomEnemy(x, y, range = 450) {
    const arr = this.inRadius(x, y, range);
    return arr.length ? arr[Math.floor(rng() * arr.length)] : null;
  }

  // Center of the thickest crowd near the player (sampled), or null.
  densest(range = 420, probe = 90) {
    const p = this.player;
    const arr = this.inRadius(p.x, p.y, range);
    if (!arr.length) return null;
    let best = null, bestN = -1;
    const samples = Math.min(arr.length, 18);
    for (let i = 0; i < samples; i++) {
      const e = arr[Math.floor(rng() * arr.length)];
      let n = 0;
      for (const o of arr) if (dist2(o.x, o.y, e.x, e.y) < probe * probe) n += o.boss ? 6 : 1;
      if (n > bestN) { bestN = n; best = e; }
    }
    return best ? { x: best.x, y: best.y, enemy: best, count: bestN } : null;
  }

  // Deal damage. o: kb (knockback strength), fx/fy (where the push comes from), stun (s), slow (0..1), src.
  hit(e, dmg, o = {}) {
    if (!e || e.dead || !(dmg > 0)) return;
    let crit = false;
    if (rng() < this.stats.crit) { dmg *= this.stats.critMult; crit = true; }
    const src = o.src || this.src;
    if (src) src.dmg += Math.min(dmg, Math.max(0, e.hp)); // count damage that landed, not overkill
    e.hp -= dmg;
    e.flash = 0.09;
    if (o.kb && !e.boss) {
      const fx = o.fx ?? this.player.x, fy = o.fy ?? this.player.y;
      let dx = e.x - fx, dy = e.y - fy;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      const k = (o.kb * this.stats.knockback * 3) / Math.max(0.5, e.mass);
      e.kbx += dx * k; e.kby += dy * k;
    }
    if (o.stun) e.stun = Math.max(e.stun, o.stun * (e.boss ? 0.12 : e.elite ? 0.5 : 1));
    if (o.slow) { e.slow = Math.max(e.slow, Math.min(0.8, o.slow) * (e.boss ? 0.4 : 1)); e.slowT = 1.2; }
    if (this.settings.damageNumbers && (crit || dmg >= 6 || rng() < 0.35)) {
      this.fx.text(e.x, e.y - e.r - 4, String(Math.round(dmg)), crit ? '#ffe066' : '#ffffff', crit ? 15 : 11);
    }
    if (e.hp <= 0) this.kill(e, src);
  }

  kill(e, src) {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    if (src) src.kills++;
    this.fx.particles(e.x, e.y, e.color, e.boss ? 60 : e.elite ? 20 : 7, e.boss ? 380 : 170, e.boss ? 1 : 0.4, e.boss ? 4 : 2.4);
    if (e.xp > 0) {
      if (e.boss) { for (let i = 0; i < 12; i++) dropGem(this, e.x + rand(-50, 50), e.y + rand(-50, 50), Math.ceil(e.xp / 12)); }
      else dropGem(this, e.x, e.y, e.xp);
    }
    if (e.elite) dropItem(this, e.x, e.y, 'vinyl');
    else if (!e.boss) {
      const r = rng();
      if (r < 0.005) dropItem(this, e.x, e.y, 'heal');
      else if (r < 0.0065) dropItem(this, e.x, e.y, 'magnet');
    }
    if (e.def.splits && !e.elite) {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + rand(0, 1);
        const c = spawnEnemy(this, e.def.splits, e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14, { hpMul: 0.5, scale: 0.8 });
        if (c) { c.spawnT = 0; c.kbx = Math.cos(a) * 160; c.kby = Math.sin(a) * 160; }
      }
    }
    if (e.boss) this.onBossDeath(e);
  }

  // ------------------------------------------------------------------ player

  hurt(dmg, from) {
    const p = this.player;
    if (this.state !== 'playing' || p.iframes > 0 || this.opts.god) return;
    const taken = Math.max(1, dmg - this.stats.armor);
    p.hp -= taken;
    const cause = !from ? 'shots' : from.boss ? 'boss' : 'contact';
    this.damageTaken[cause] = (this.damageTaken[cause] || 0) + taken;
    p.iframes = PLAYER_BASE.iframes;
    p.hurtT = 0.3;
    this.hurtFlash = 1;
    this.shake = Math.max(this.shake, 7);
    if (this.audio?.ready && !this.opts.sim) this.audio.hurt();
    if (from && !from.boss) {
      const dx = from.x - p.x, dy = from.y - p.y, d = Math.hypot(dx, dy) || 1;
      from.kbx += (dx / d) * 260; from.kby += (dy / d) * 260;
    }
    if (p.hp <= 0) { p.hp = 0; this.gameOver(); }
  }

  collect(gm) {
    if (gm.kind === 'xp') {
      const v = gm.value * this.stats.xpGain;
      this.xp += v;
      this.dropCharge = Math.min(this.dropMax, this.dropCharge + gm.value);
      while (this.xp >= this.xpNeed) {
        this.xp -= this.xpNeed;
        this.level++;
        this.xpNeed = this.xpFor(this.level);
        if (!this.opts.solo) this.pendingLevels++;
      }
    } else if (gm.kind === 'heal') {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.3);
      this.fx.text(this.player.x, this.player.y - 26, 'Encore!', '#ff8fa3', 14);
    } else if (gm.kind === 'magnet') {
      magnetAll(this);
    } else if (gm.kind === 'vinyl') {
      if (!this.opts.solo) this.pendingLevels++;
      this.fx.text(this.player.x, this.player.y - 26, 'Vinyl!', '#ffd166', 14);
    }
  }

  // ------------------------------------------------------------------ the Drop

  requestDrop() {
    if (this.state !== 'playing' || this.dropCharge < this.dropMax || this.dropState) return false;
    if (!this.seq.requestDrop()) return false;
    this.dropCharge = 0;
    this.dropState = 'queued';
    this.hooks.onDrop?.('queued');
    return true;
  }

  doDrop() {
    const p = this.player;
    this.dropState = null;
    this.drops++;
    this.dropFlash = 1;
    this.shake = Math.max(this.shake, 16);
    const dmg = DROP.damage * (1 + this.level * 0.08) * this.stats.damage;
    const prev = this.src; this.src = null;
    for (const e of this.inRadius(p.x, p.y, DROP.radius)) this.hit(e, e.boss ? dmg * 2.5 : dmg, { kb: 260, fx: p.x, fy: p.y, stun: 0.6 });
    this.src = prev;
    this.shots.length = 0;
    this.fx.ring({ x: p.x, y: p.y, follow: true, r0: 20, r1: DROP.radius, dur: 0.6, damage: 0, kb: 0, width: 14, color: '#ffffff' });
    this.hooks.onDrop?.('done');
  }

  // ------------------------------------------------------------------ events

  _processEvents() {
    const now = this.clock.now() - (this.opts.sim ? 0 : (this.audio?.latency || 0));
    const evs = this.seq.drain(now, this._evbuf);
    for (const ev of evs) {
      switch (ev.type) {
        case 'note': this.fireNote(ev.inst, ev.note, 1); break;
        case 'beat': this.onBeat(ev); break;
        case 'section': this.onSection(ev); break;
        case 'build': this.dropState = 'building'; this.hooks.onDrop?.('building'); break;
        case 'drop': this.doDrop(); break;
      }
    }
    evs.length = 0;
  }

  fireNote(inst, note, scale) {
    if (!this.loadout.has(inst)) return;
    const lv = inst.def.levels[inst.level - 1];
    this.src = inst;
    this.dmgScale = scale;
    try { inst.def.fire(this, note, lv.stats, inst); } catch (e) { this._report(inst.def.id + '.fire', e); }
    this.src = null;
    this.dmgScale = 1;
    inst.notes++;
    this.chanPulse[inst.def.role] = Math.max(this.chanPulse[inst.def.role], 0.4 + 0.6 * note.v);
    if (scale === 1 && this.stats.echo > 0 && rng() < this.stats.echo) {
      this.later.push({ at: this.time + ECHO_STEPS * STEP_SEC, fn: () => this.fireNote(inst, note, this.stats.echoDmg) });
    }
  }

  onBeat(ev) {
    this.beatPulse = 1;
    if (ev.beat === 0) this.barPulse = 1;
    enemiesOnBeat(this, ev);
    this.director.onBeat(ev);
  }

  onSection(ev) {
    this.sectionIndex = ev.index;
    this.section = ev.section;
    this.banner(ev.section.name, ev.section.boss ? 'Something loud is coming' : '');
    this.director.onSection(ev);
    this.hooks.onSection?.(ev.section);
  }

  onBossSpawn(e) {
    this.boss = e;
    this.hooks.onBoss?.(e);
  }

  onBossDeath(e) {
    this.bossesBeaten++;
    if (this.boss === e) this.boss = null;
    this.shake = Math.max(this.shake, 14);
    this.hooks.onBoss?.(null);
    if (e.def.final) {
      this.won = true;
      this.victoryT = 2.2;
      this.banner('Encore!', 'White Noise is silenced');
    } else {
      this.banner(`${e.def.name} is silenced`, '');
      magnetAll(this);
    }
  }

  banner(title, sub) {
    if (!title) return;
    this.sectionBanner = { title, sub, t: 0 };
    this.hooks.onBanner?.(title, sub);
  }

  // ------------------------------------------------------------------ update

  step(dt, move) {
    if (this.state !== 'playing') return;
    this._processEvents();
    if (this.state !== 'playing') return;
    this.time += dt;
    const p = this.player;

    // Movement
    const spd = this.stats.speed;
    const mx = move ? move.x : 0, my = move ? move.y : 0;
    const ml = Math.hypot(mx, my);
    const tx = ml > 0.01 ? (mx / Math.max(1, ml)) * spd : 0;
    const ty = ml > 0.01 ? (my / Math.max(1, ml)) * spd : 0;
    const acc = 1 - Math.pow(0.0005, dt);
    p.vx += (tx - p.vx) * acc;
    p.vy += (ty - p.vy) * acc;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.speedNow = Math.hypot(p.vx, p.vy);
    if (ml > 0.2) { p.faceX = mx / ml; p.faceY = my / ml; }
    p.iframes = Math.max(0, p.iframes - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);
    if (this.stats.regen > 0) p.hp = Math.min(p.maxHp, p.hp + this.stats.regen * dt);

    // Spatial hash for this frame
    this.grid.clear();
    for (const e of this.enemies) if (!e.dead) this.grid.insert(e);

    // Delayed actions (echoes)
    for (let i = this.later.length - 1; i >= 0; i--) {
      const l = this.later[i];
      if (l.at <= this.time) { swapRemove(this.later, i); l.fn(); }
    }

    for (const inst of this.loadout.instruments()) {
      if (inst.def.update) {
        this.src = inst;
        try { inst.def.update(this, dt, inst.def.levels[inst.level - 1].stats, inst); } catch (e) { this._report(inst.def.id + '.update', e); }
        this.src = null;
      }
    }

    this.fx.update(dt);
    updateEnemies(this, dt);
    this.director.update(dt);
    updatePickups(this, dt);

    // Remove the dead
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].dead) swapRemove(this.enemies, i);

    // Decays
    const k = Math.exp(-dt * 7);
    this.beatPulse *= k;
    this.barPulse *= Math.exp(-dt * 3);
    this.shake *= Math.exp(-dt * 10);
    this.hurtFlash *= Math.exp(-dt * 5);
    this.dropFlash *= Math.exp(-dt * 2.5);
    for (const r of ROLES) this.chanPulse[r] *= Math.exp(-dt * 9);
    if (this.sectionBanner) this.sectionBanner.t += dt;

    if (this.won) {
      this.victoryT -= dt;
      if (this.victoryT <= 0) { this.victory(); return; }
    }

    if (this.pendingLevels > 0 && this.state === 'playing' && !this.won) this.openLevelUp();
  }

  // ------------------------------------------------------------------ level up

  openLevelUp() {
    this.offers = buildOffers(this, 3);
    if (this.opts.autopick) {
      const i = this.hooks.autopick ? this.hooks.autopick(this.offers) : 0;
      this.pendingLevels--;
      applyOffer(this, this.offers[i] || this.offers[0]);
      this.offers = null;
      if (this.pendingLevels > 0) this.openLevelUp();
      return;
    }
    this._pause('levelup');
    if (this.audio?.ready && this.seq.position) {
      const c = this.seq.position.chord;
      const base = 72 + ((c.rootPc - 72) % 12 + 12) % 12;
      this.audio.levelUpChime([base, base + c.intervals[1], base + c.intervals[2], base + 12]);
    }
    this.hooks.onLevelUp?.(this.offers);
  }

  reroll() {
    if (this.state !== 'levelup' || this.rerolls <= 0) return null;
    this.rerolls--;
    this.previewOffer(null);
    this.offers = buildOffers(this, 3);
    return this.offers;
  }

  choose(i) {
    if (this.state !== 'levelup' || !this.offers) return;
    const o = this.offers[i];
    if (!o) return;
    this.previewOffer(null);
    this.pendingLevels--;
    applyOffer(this, o);
    this.offers = null;
    if (this.pendingLevels > 0) {
      this.offers = buildOffers(this, 3);
      this.hooks.onLevelUp?.(this.offers);
      return;
    }
    this._resume();
  }

  // Audition a card: an instrument plays in place of its channel's current sound, a pedal is switched on.
  previewOffer(o) {
    if (!this.audio?.ready) return;
    const A = this.audio;
    if (this.preview === o) return;
    this.preview = o;
    this.seq.preview = null;
    A.setPreviewRole(null);
    A.applyPedals(this.loadout.pedalLevels());
    if (!o) { if (this.state === 'levelup' || this.state === 'paused') A.setMuffle(true); return; }
    if (o.def) {
      const inst = makeInst(o.def, o.level);
      this.seq.preview = { inst };
      A.setPreviewRole(o.def.role);
    } else if (o.pedal) {
      A.applyPedals({ ...this.loadout.pedalLevels(), [o.pedal.id]: o.level });
      A.setMuffle(false);
    }
  }

  pause() { if (this.state === 'playing') { this._pause('paused'); return true; } return false; }
  unpause() { if (this.state === 'paused') this._resume(); }

  _pause(state) {
    this.state = state;
    this.seq.hold = true;
    this.seq.clearEvents();
    if (this.audio?.ready) this.audio.setMuffle(true);
  }

  _resume() {
    this.state = 'playing';
    this.seq.hold = false;
    this.seq.preview = null;
    this.preview = null;
    if (this.audio?.ready) { this.audio.setPreviewRole(null); this.audio.applyPedals(this.loadout.pedalLevels()); this.audio.setMuffle(false); }
    this.hooks.onResume?.();
  }

  // After a run the band keeps playing the song (muffled until you choose to listen). Notes are no
  // longer attacks, so the frame loop discards their events.
  gameOver() {
    this.state = 'gameover';
    this.seq.hold = false;
    this.seq.clearEvents();
    if (this.audio?.ready) this.audio.setMuffle(true);
    this.hooks.onGameOver?.(this.summary(false));
  }

  victory() {
    this.state = 'victory';
    this.seq.hold = false;
    this.seq.clearEvents();
    if (this.audio?.ready) this.audio.setMuffle(true);
    this.hooks.onVictory?.(this.summary(true));
  }

  score() {
    return Math.round(this.kills * 10 + this.time * 5 + this.level * 100 + this.bossesBeaten * 2000 + this.bonusScore + (this.won ? 10000 : 0));
  }

  summary(won) {
    const insts = [...this.loadout.instruments()];
    const rows = [...insts, ...(this.retired || [])].map((i) => ({
      id: i.def.id, name: i.def.name, role: i.def.role, style: i.def.style, level: i.level,
      dmg: Math.round(i.dmg), kills: i.kills, active: this.loadout.has(i),
    }));
    return {
      won, time: this.time, kills: this.kills, level: this.level, score: this.score(),
      genre: this.genre, key: this.key.name, section: this.section.name, bosses: this.bossesBeaten,
      instruments: rows.sort((a, b) => b.dmg - a.dmg),
      pedals: this.loadout.pedals.map((p) => ({ id: p.def.id, name: p.def.name, level: p.level })),
    };
  }

  _report(where, e) {
    if (this._errs.has(where)) return;
    this._errs.add(where);
    console.error(`[game] ${where} failed:`, e);
  }
}

export { FINALE_BAR };
