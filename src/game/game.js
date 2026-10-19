// The run. Owns the world, turns sequencer note events into attacks, and exposes the small API
// that instrument fire() functions use (see docs/INSTRUMENTS.md).

import { ROLES, ROLE_INFO, STEP_SEC, ECHO_STEPS, PLAYER_BASE, DROP, REROLLS_PER_RUN, MAX_INSTRUMENT_LEVEL, CHANNEL_UNLOCKS } from '../config.js';
import { rng, seedRng, dist2, rand, TAU, swapRemove, clamp } from '../util.js';
import { KEYS, mtof } from '../music/theory.js';
import { Song, SECTIONS, FINALE_BAR } from '../music/song.js';
import { Effects } from './effects.js';
import { SpatialHash } from './grid.js';
import { Director } from './director.js';
import { updateEnemies, enemiesOnBeat, spawnEnemy, BOSS_TYPES } from './enemies.js';
import { dropGem, dropItem, updatePickups, magnetAll } from './pickups.js';
import { Loadout, computeStats, makeInst, genreName } from './loadout.js';
import { buildOffers, applyOffer } from './upgrades.js';
import { BY_ID } from '../content/instruments/index.js';
import { PEDAL_BY_ID } from '../content/pedals.js';

// Channels with a send into the tape delay: only these echo, so every echo attack is also heard.
const ECHO_ROLES = new Set(['perc', 'chords', 'lead', 'arp']);
const DASH = { duration: 0.18, cooldown: 2.4, speed: 4.6, grace: 0.05, perfectWindow: 0.08, refund: 0.6 };
const COMBO_DURATION = 4;

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
      dashT: 0, dashCooldown: 0, dashMaxCooldown: DASH.cooldown, dashPerfect: false,
      dashX: 1, dashY: 0, dashTrailT: 0,
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
    this.dashes = 0;
    this.perfectDashes = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.comboMultiplier = 1;
    this.bestCombo = 0;
    this.grooveBonus = 0;
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
    this.bossesSpawned = [];
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

  xpFor(level) { return Math.round(Math.min(176, 5 + level * 0.34 + level * level * 0.44)); }

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
    if (!e || e.dead || !(dmg > 0) || this.state !== 'playing') return;
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
    // Numbers only for hits worth reading: crits, killing blows and big chunks. Otherwise they flood the screen.
    if (this.settings.damageNumbers && (crit || e.hp <= 0 || dmg >= e.maxHp * 0.2)) {
      this.fx.text(e.x, e.y - e.r - 4, String(Math.round(dmg)), crit ? '#ffe066' : '#ffffff', crit ? 14 : 10);
    }
    if (e.hp <= 0) this.kill(e, src);
  }

  kill(e, src) {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    this._chainKill();
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

  // Dash immediately in the requested direction, or along the last movement direction.
  // Timing follows the audible transport, including its output latency and paused vamp.
  requestDash(move) {
    const p = this.player;
    if (this.state !== 'playing' || this.won || !p || p.dashCooldown > 0 || p.dashT > 0) return false;
    let dx = Number.isFinite(move?.x) ? move.x : 0;
    let dy = Number.isFinite(move?.y) ? move.y : 0;
    let d = Math.hypot(dx, dy);
    if (d < 0.1) { dx = p.faceX; dy = p.faceY; d = Math.hypot(dx, dy); }
    if (d < 0.01) { dx = 1; dy = 0; d = 1; }
    p.dashX = p.faceX = dx / d;
    p.dashY = p.faceY = dy / d;
    p.dashPerfect = this._dashOnBeat();
    p.dashT = DASH.duration;
    p.dashTrailT = 0;
    p.dashCooldown = p.dashMaxCooldown - (p.dashPerfect ? DASH.refund : 0);
    p.iframes = Math.max(p.iframes, DASH.duration + DASH.grace);
    this.dashes++;
    const color = p.dashPerfect ? '#ffe28a' : '#6fffe9';
    this.fx.flash(p.x, p.y, p.dashPerfect ? 48 : 30, color, 0.26, 0.12);
    this.fx.particles(p.x, p.y, color, 10, 150, 0.3, 2.5);
    if (p.dashPerfect) {
      this.perfectDashes++;
      this.bonusScore += 25;
      this.fx.text(p.x, p.y - 35, 'ON BEAT +25', color, 14);
      if (this.audio?.ready && !this.opts.sim) {
        const sounding = this.seq.sounding(this.clock.now() - (this.audio.latency || 0));
        const chord = sounding ? this.song.position(sounding.bar).chord : this.seq.position?.chord;
        const fifth = chord ? (chord.rootPc + chord.intervals[2]) % 12 : (this.key.pc + 7) % 12;
        this.audio.uiBlip(mtof(72 + fifth), 0.08);
      }
    }
    this.hooks.onDash?.({ perfect: p.dashPerfect, cooldown: p.dashCooldown });
    return true;
  }

  _dashOnBeat() {
    const now = this.clock.now() - (this.opts.sim ? 0 : (this.audio?.latency || 0));
    // A beat in the lookahead is eligible too: pressing just before a beat feels as fair as just after.
    for (const step of this.seq.stepLog || []) {
      if (step.sib % 4 === 0 && Math.abs(step.time - now) <= DASH.perfectWindow + 1e-8) return true;
    }
    return false;
  }

  _chainKill() {
    const before = this.comboMultiplier;
    this.combo++;
    this.comboTimer = COMBO_DURATION;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.comboMultiplier = this.combo >= 50 ? 4 : this.combo >= 25 ? 3 : this.combo >= 10 ? 2 : 1;
    // Only kill score is multiplied; weapon damage and XP keep their existing balance.
    const bonus = (this.comboMultiplier - 1) * 10;
    this.grooveBonus += bonus;
    this.bonusScore += bonus;
    if (this.comboMultiplier > before) {
      const names = ['', '', 'IN THE GROOVE', 'ON FIRE', 'UNSTOPPABLE'];
      this.fx.text(this.player.x, this.player.y - 48, `${names[this.comboMultiplier]} ×${this.comboMultiplier}`, '#ffe28a', 16);
      this.hooks.onCombo?.(this.combo, this.comboMultiplier);
    }
  }

  _resetCombo() {
    this.combo = 0;
    this.comboTimer = 0;
    this.comboMultiplier = 1;
  }

  hurt(dmg, from) {
    const p = this.player;
    if (this.state !== 'playing' || this.won || p.iframes > 0 || p.dashT > 0 || this.opts.god) return;
    const taken = Math.max(1, dmg - this.stats.armor);
    p.hp -= taken;
    if (this.combo >= 10) this.fx.text(p.x, p.y - 40, 'GROOVE BROKEN', '#ff8fa3', 12);
    this._resetCombo();
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
    if (p.hp <= 0) { p.hp = 0; this._die(); }
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
    // Safety net: if the game still thinks a Drop is building but the sequencer has none pending, clear it.
    if (this.dropState && !this.seq.dropState && !this.seq.events.some((ev) => ev.type === 'drop')) this.dropState = null;
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
    magnetAll(this);
    this.hooks.onDrop?.('done');
  }

  // ------------------------------------------------------------------ events

  _processEvents() {
    // Fire when the note is heard (output latency), one frame early since the attack is drawn next frame.
    const now = this.clock.now() - (this.opts.sim ? 0 : (this.audio?.latency || 0) - 1 / 60);
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
    if (scale === 1 && this.stats.echo > 0 && ECHO_ROLES.has(inst.def.role) && rng() < this.stats.echo) {
      this.later.push({ at: this.time + ECHO_STEPS * STEP_SEC, fn: () => this.fireNote(inst, note, this.stats.echoDmg) });
    }
  }

  onBeat(ev) {
    this.beatPulse = 1;
    if (ev.beat === 0) this.barPulse = 1;
    enemiesOnBeat(this, ev);
    this.director.onBeat(ev);
  }

  // How many mixer channels the song has opened so far.
  channelCap(index = this.sectionIndex) { return CHANNEL_UNLOCKS[Math.min(index, CHANNEL_UNLOCKS.length - 1)]; }

  onSection(ev) {
    const before = this.channelCap();
    this.sectionIndex = ev.index;
    this.section = ev.section;
    const opened = this.channelCap() > before;
    this.banner(ev.section.name, ev.section.boss ? `${BOSS_TYPES[ev.section.boss]?.name || 'A boss'} is here` : opened ? 'A new channel opens on the mixer' : '');
    if (opened) this.hooks.onLoadout?.();
    this.director.onSection(ev);
    this.hooks.onSection?.(ev.section);
  }

  onBossSpawn(e) {
    this.boss = e;
    (this.bossesSpawned ||= []).push(e.type);
    this.hooks.onBoss?.(e);
  }

  onBossDeath(e) {
    this.bossesBeaten++;
    if (this.boss === e) {
      this.boss = null;
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const x = this.enemies[i];
        if (x.boss && !x.dead && x !== e) { this.boss = x; break; }
      }
    }
    this.shake = Math.max(this.shake, 14);
    this.hooks.onBoss?.(this.boss);
    if (e.def.final) {
      this.won = true;
      this.victoryT = 2.2;
      this.banner('Encore!', 'White Noise is silenced');
    } else {
      this.banner(`${e.def.name} is silenced`, '', true);
      magnetAll(this);
    }
  }

  // compact: a short line under the boss bar instead of the big center banner (for mid-fight messages).
  banner(title, sub, compact = false) {
    if (!title) return;
    this.sectionBanner = { title, sub, t: 0 };
    this.hooks.onBanner?.(title, sub, compact);
  }

  // ------------------------------------------------------------------ update

  // A short beat between the lethal hit and the end screen: the speaker shatters in channel colors
  // while the band drops to a muffled vamp.
  _die() {
    const p = this.player;
    p.dashT = 0;
    p.dashPerfect = false;
    this._resetCombo();
    this.state = 'dying';
    this.dyingT = 0.9;
    this.seq.hold = true;
    this.seq.events = this.seq.events.filter((ev) => ev.type !== 'note' && ev.type !== 'beat' && ev.type !== 'build' && ev.type !== 'drop');
    this.seq.dropState = null;
    this.dropState = null;
    if (this.audio?.ready) this.audio.setMuffle(true);
    for (const inst of this.loadout.instruments()) this.fx.particles(p.x, p.y, this.color(inst), 16, 340, 1.1, 3.5);
    this.fx.particles(p.x, p.y, '#f4efff', 20, 260, 0.9, 3);
    this.shake = Math.max(this.shake, 12);
  }

  step(dt, move) {
    if (this.state === 'dying') {
      this.dyingT -= dt;
      this.fx.updateCosmetics(dt * 0.5);
      this.shake *= Math.exp(-dt * 6);
      this.hurtFlash *= Math.exp(-dt * 3);
      if (this.dyingT <= 0) this.gameOver();
      return;
    }
    if (this.state !== 'playing') return;
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer === 0 && this.combo > 0) this._resetCombo();
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
    const dashDt = Math.min(dt, p.dashT);
    if (dashDt > 0) {
      p.vx = p.dashX * spd * DASH.speed;
      p.vy = p.dashY * spd * DASH.speed;
      p.x += p.vx * dashDt; p.y += p.vy * dashDt;
      p.dashT = Math.max(0, p.dashT - dt);
      p.dashTrailT -= dashDt;
      if (p.dashTrailT <= 0) {
        p.dashTrailT += 0.025;
        this.fx.particles(p.x, p.y, p.dashPerfect ? '#ffe28a' : '#6fffe9', 3, 28, 0.22, 3);
      }
      // No slippery burst of leftover velocity after the dash: normal movement takes over immediately.
      if (p.dashT === 0) { p.vx = tx; p.vy = ty; }
    }
    const moveDt = dt - dashDt;
    if (moveDt > 0) {
      const acc = 1 - Math.pow(0.0005, moveDt);
      p.vx += (tx - p.vx) * acc;
      p.vy += (ty - p.vy) * acc;
      p.x += p.vx * moveDt; p.y += p.vy * moveDt;
    }
    p.speedNow = Math.hypot(p.vx, p.vy);
    if (ml > 0.2 && p.dashT === 0) { p.faceX = mx / ml; p.faceY = my / ml; }
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);
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

    if (this.won && this.state === 'playing') {
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
    // The mix stays dimmed while a card screen is up, except when auditioning a pedal on the whole band.
    const held = this.state === 'levelup' || this.state === 'paused';
    A.setMuffle(held && !(o && o.pedal));
    if (!o) return;
    if (o.def) {
      this.seq.preview = { inst: makeInst(o.def, o.level) };
      A.setPreviewRole(o.def.role);
    } else if (o.pedal) {
      A.applyPedals({ ...this.loadout.pedalLevels(), [o.pedal.id]: o.level });
    }
  }

  pause() { if (this.state === 'playing') { this._pause('paused'); return true; } return false; }
  unpause() { if (this.state === 'paused') this._resume(); }

  _pause(state) {
    this.state = state;
    this.seq.hold = true;
    // Drop queued notes and beats, but keep song-structure events (section, build, drop): losing one would
    // skip a boss, keep a channel shut or leave the Drop stuck. They play out on the first frame after resume.
    this.seq.events = this.seq.events.filter((ev) => ev.type !== 'note' && ev.type !== 'beat');
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
    if (this.state === 'gameover' || this.state === 'victory') return;
    this.state = 'gameover';
    this.seq.hold = false;
    this.seq.clearEvents();
    if (this.audio?.ready) this.audio.setMuffle(true);
    this.hooks.onGameOver?.(this.summary(false));
  }

  victory() {
    if (this.state === 'gameover' || this.state === 'victory') return;
    this.state = 'victory';
    this.seq.hold = false;
    this.seq.clearEvents();
    if (this.audio?.ready) this.audio.setMuffle(true);
    this.hooks.onVictory?.(this.summary(true));
  }

  score() {
    return Math.round(this.kills * 10 + this.time * 5 + this.level * 100 + this.bossesBeaten * 2000 + this.bonusScore + (this.state === 'victory' || (this.won && this.state === 'playing') ? 10000 : 0));
  }

  summary(won) {
    const insts = [...this.loadout.instruments()];
    const byId = new Map();
    for (const i of [...insts, ...(this.retired || [])]) {
      const r = byId.get(i.def.id) || { id: i.def.id, name: i.def.name, role: i.def.role, style: i.def.style, level: 0, dmg: 0, kills: 0, active: false };
      r.level = Math.max(r.level, i.level);
      r.dmg += Math.round(i.dmg);
      r.kills += i.kills;
      r.active = r.active || this.loadout.has(i);
      byId.set(i.def.id, r);
    }
    const rows = [...byId.values()];
    return {
      won, time: this.time, kills: this.kills, level: this.level, score: this.score(),
      dashes: this.dashes, perfectDashes: this.perfectDashes, bestCombo: this.bestCombo, grooveBonus: this.grooveBonus,
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
