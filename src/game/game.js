// The run. Owns the world, turns sequencer note events into attacks, and exposes the small API
// that instrument fire() functions use (see docs/INSTRUMENTS.md).

import { ROLES, ROLE_INFO, STYLES, STEP_SEC, BAR_SEC, ECHO_STEPS, PLAYER_BASE, DROP, BALANCE, REROLLS_PER_RUN, BANISHES_PER_RUN, FADER, MAX_INSTRUMENT_LEVEL, CHANNEL_UNLOCKS, GAIN } from '../config.js';
import { rng, seedRng, dist2, rand, TAU, swapRemove, clamp } from '../util.js';
import { KEYS } from '../music/theory.js';
import { Song, SECTIONS, FINALE_BAR, SONGS, sectionsOf } from '../music/song.js';
import { Effects } from './effects.js';
import { SpatialHash } from './grid.js';
import { Director } from './director.js';
import { updateEnemies, enemiesOnBeat, spawnEnemy, knockOffBeat } from './enemies.js';
import { bossCue } from './bosscues.js';
import { dropGem, dropItem, updatePickups, magnetAll } from './pickups.js';
import { Loadout, computeStats, makeInst, genreName, isFusion, RULES, CHEMISTRY } from './loadout.js';
import { buildOffers, applyOffer as applyCard, banKey, deadScreen, remixReady } from './upgrades.js';
import { BY_ID } from '../content/instruments/index.js';
import { PEDAL_BY_ID } from '../content/pedals.js';

// Channels with a send into the tape delay: only these echo, so every echo attack is also heard.
const ECHO_ROLES = new Set(['perc', 'chords', 'lead', 'arp']);
// A shield blocks at most this many hits, however many charges a sound gives it.
const SHIELD_MAX = 3;

// A card taken: the sims' ledger counts picks (by kind) per section and what the Breather card healed.
function applyOffer(g, o) {
  const L = g._led(), hp = g.player.hp;
  L.picks++;
  L.taken[o.kind] = (L.taken[o.kind] || 0) + 1;
  applyCard(g, o);
  if (o.kind === 'heal') L.heal.card += g.player.hp - hp;
}

export class Game {
  constructor({ audio, clock, seq, opts = {}, settings = {}, hooks = {} }) {
    this.audio = audio;
    this.clock = clock;
    this.seq = seq;
    this.opts = opts;
    this.settings = { damageNumbers: true, shake: true, flashes: true, chimes: true, ...settings };
    this.hooks = hooks;
    this.fx = new Effects(this);
    this.grid = new SpatialHash(72);
    this.director = new Director(this);
    this.view = { w: 1280, h: 720 };
    this.state = 'idle';
    this.src = null;
    this.dmgScale = 1;
    this.noteW = 1;          // the arrangement's damage weight for the note being fired (note.w)
    this._errs = new Set();
    this._evbuf = [];
    seq.getInstruments = () => (this.loadout ? this.loadout.instruments() : []);
    seq.getFeatured = () => this.featured();
  }

  // ------------------------------------------------------------------ run lifecycle

  // song: an index into SONGS (the setlist), never drawn from rng(), so a seed plays the same in every song.
  newRun({ start, keyIndex, seed, gain = 0, song = 0 } = {}) {
    if (seed !== undefined) seedRng(seed);
    // Gain: every tier up to this one multiplies its combat numbers. Set before the director resets and
    // anything spawns.
    this.gain = clamp(gain | 0, 0, GAIN.length);
    this.mods = { hp: 1, drop: 1, dmgIn: 1, xp: 1, density: 1, bossHp: 1, shotSpeed: 1, wnPhase: 1, elite: 1 };
    for (const t of GAIN.slice(0, this.gain)) Object.assign(this.mods, t.mods);
    this.key = KEYS[keyIndex ?? Math.floor(rng() * KEYS.length)];
    this.tune = SONGS[song] || SONGS[0];
    this.songIndex = SONGS.indexOf(this.tune);
    this.song = new Song(this.key.pc, sectionsOf(this.tune), this.tune);
    this.seq.reset(this.song);
    this.seq.getInstruments = () => (this.loadout ? this.loadout.instruments() : []);
    this.seq.getFeatured = () => this.featured();
    this.seq.onRemix = (inst, bar) => this._remixFlipped(inst, bar);
    this.seq.onRemixLost = (inst) => this._remixLost(inst);
    // The sequencer asks a beat ahead which boss cues to play on it (sound only, while playing).
    const cues = [];
    this.seq.getBossCues = (bar, beat) => {
      cues.length = 0;
      if (this.state === 'playing') for (const e of this.enemies) {
        const c = e.boss && !e.dead ? bossCue(e, bar, beat, this.mods.wnPhase) : null;
        if (c && !cues.includes(c)) cues.push(c);
      }
      return cues;
    };
    this.sheet = [];   // the track sheet: one snapshot per finished section (src/music/replay.js)
    this.retired = [];
    this.player = {
      x: 0, y: 0, r: PLAYER_BASE.radius, hp: PLAYER_BASE.maxHp, maxHp: PLAYER_BASE.maxHp,
      iframes: 0, faceX: 1, faceY: 0, vx: 0, vy: 0, speedNow: 0, hurtT: 0,
    };
    this.enemies = [];
    this.nextId = 1;         // enemy ids pace Stomps and Screeches, so each run counts from 1
    this.damageTaken = { contact: 0, shots: 0, boss: 0, mark: 0 };
    this.damageBy = {};      // enemy name -> damage taken from it (bodies and shots)
    this.ledger = [];        // per section, for balance sims (_led)
    this.hazards = [];       // Snare marks waiting for their beat (enemies.js)
    this.lastHurtAt = -Infinity;
    this._godUntil = -1;     // god mode (?god=1): the ledger's own i-frames
    this._downbeat = -1;     // the last bar whose downbeat ran (onBeat)
    this.perfectDrops = 0;   // Drops that landed on a phrase downbeat
    this.doubleDrops = 0;    // perfect Drops that landed on one of the song's own impact downbeats
    this.perfectFlash = 0;
    this.dropR = DROP.radius;
    this.lastHitBy = null;
    this.bossLog = [];       // { type, spawn, end, how: 'silenced' | 'faded' } in game seconds
    this.shots = [];
    this.gems = [];
    this.later = [];
    // The play rules' live state (CHEMISTRY in loadout.js): the clean-beat combo, planted (stood within
    // RULES.plant of where the last beat found you), phrase (0..1 through the 8-bar phrase), the last beat's
    // spot and time, and broke (moved off that spot since). Tracked whatever the band, applied by its tiers.
    this.rules = { combo: 0, planted: false, phrase: 0, lastBeatX: 0, lastBeatY: 0, beatAt: 0, broke: false };
    this.shield = null;      // { n, until, src, onBreak }: blocks the next n hits until game time `until`
    this.fx.reset();
    this.director.reset();
    this.loadout = new Loadout();
    this.stats = computeStats(this.loadout, null, this.opts.xo);
    this.time = 0;
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNeed = this.xpFor(1);
    this.pendingLevels = 0;
    this.rerolls = REROLLS_PER_RUN;
    this.banishes = BANISHES_PER_RUN;
    this.banished = new Set();   // ids of the sounds and pedals banished from the cards
    this.remixed = [];           // ids of the instruments remixed this run, in order
    // Master Tapes (BALANCE.remix): dropped by silenced bosses, collected, banked (no channel ready yet), spent
    // on a remix, or lost (left on the floor). remixQueue waits for the sequencer's one queued remix to land.
    this.tapes = { dropped: 0, collected: 0, banked: 0, spent: 0, lost: 0 };
    this.remixQueue = [];
    this.remixLog = [];          // { t, id, bar, sec } each remix as it lands
    this.tapePick = false;       // two or more channels were ready: the remix cards open when play allows
    this.tapeOffers = false;     // the cards up are a tape's remix cards (no reroll, banish or skip)
    this._remixLanding = 0;      // remixes flipped by the sequencer whose downbeat has not been heard yet
    this._remixHold = 0;         // card screens wait until this game time (a remix's ring landing)
    this._remixBanner = null;    // the last remix name shown, re-shown after a card screen that covered it
    this.remixFlash = 0;
    this.remixR = BALANCE.remix.radius;
    this.cardScreens = 0;
    this.deadScreens = 0;
    this.dropCharge = 0;
    this.dropReady = false;
    this.dropMax = DROP.charge * this.mods.drop;
    this.dropState = null;
    this.drops = 0;
    this.songImpacts = 0;        // the song's own impacts that hit (songImpact)
    this.impactAt = -Infinity;   // game time of the last one (the arena flashes back)
    this.solos = 0;              // solo phrases featured so far
    this.soloN = {};             // instrument id -> solo phrases it took (remixes take turns)
    this._dropBar = -1;          // the bar the player's last Drop landed on
    this.bonusScore = 0;
    this.beatPulse = 0;
    this.barPulse = 0;
    this.shake = 0;
    this.hurtFlash = 0;
    this.dropFlash = 0;
    this.boss = null;
    this.bossesBeaten = 0;
    this.bossesSpawned = [];
    this.bossKills = [];         // boss types silenced, in order
    this.staggers = 0;           // Drops that knocked a boss off the beat
    // The career's goals read the band at its peak, not only at the end (src/game/progress.js).
    this.peak = Object.fromEntries(Object.keys(STYLES).map((st) => [st, 0]));
    this.fullBand = this.fused = this.maxedAll = false;
    this.chanPulse = Object.fromEntries(ROLES.map((r) => [r, 0]));
    this.sectionIndex = 0;
    this.section = SECTIONS[0];
    this.won = false;
    this.victoryT = 0;
    this.offers = null;
    this.preview = null;
    this.sectionBanner = null;
    this._tierSnap = null;   // the rules as the last pick left them (_pickMoment)
    this._momentAt = -Infinity;   // when the last pick's moment plays (_pickMoment)
    this.ruleBloom = null;   // { styles, t }: rule tells blooming out from the speaker (renderer _ruleTells)
    const startDef = BY_ID[start] || BY_ID.kick808 || Object.values(BY_ID)[0];
    if (startDef) this.addInstrument(startDef, 1);
    for (const g of this.opts.give || []) {
      const def = BY_ID[g.id];
      if (def) this.addInstrument(def, clamp(g.level || 1, 1, MAX_INSTRUMENT_LEVEL));
    }
    // Sims: remix=id,id remixes instruments already in the band (at level 5).
    for (const id of this.opts.remix || []) {
      const inst = this.loadout.channels[BY_ID[id]?.role];
      if (inst?.def.id === id && inst.def.remix) { inst.level = MAX_INSTRUMENT_LEVEL; inst.remix = true; this.remixed.push(id); }
    }
    for (const p of this.opts.givePedals || []) {
      const pd = PEDAL_BY_ID[p.id];
      if (pd && !this.loadout.pedal(p.id)) this.loadout.pedals.push({ def: pd, level: clamp(p.level || 1, 1, 3) });
    }
    // Sims: tapes=N starts with N Master Tapes banked (spent as soon as a channel is ready).
    this.tapes.banked = clamp(this.opts.tapes | 0, 0, 9);
    this.onLoadoutChanged();
    this.player.hp = this.player.maxHp;
    this.state = 'playing';
    this.seq.hold = false;
    this.seq.start(this.clock.now() + 0.12);
    if (this.audio?.ready) { this.audio.setMuffle(false); this.audio.setPreviewRole(null); }
    this.banner(this.section.name);
  }

  // A level costs more the higher you are, up to a cap: about 30 card screens a run, so a band cannot max out.
  xpFor(level) {
    const X = BALANCE.xp;
    return Math.round(Math.min(X.cap, X.base + level * X.lin + level * level * X.quad) * this.mods.xp);
  }

  // ------------------------------------------------------------------ ledger (balance sims)

  // This section's entry: what happened in it, for tools/sim.mjs --summary.
  _led() {
    const i = this.sectionIndex ?? 0;
    return (this.ledger ||= [])[i] ||= {
      sec: this.section?.id, t0: this.time, lv0: this.level, levels: 0, picks: 0,
      dmg: { contact: 0, shots: 0, boss: 0, mark: 0 }, by: {}, hits: 0,
      heal: { regen: 0, inst: 0, drop: 0, card: 0 }, hearts: 0, heartsTaken: 0,
      minHp: 1, kills: 0, nd: 0, killDist: 0, near120: 0, alive: 0, frames: 0,
      drops: 0, perfect: 0, marks: 0, markHits: 0, faded: 0,
      // doubles: Double Drops. multi: kill runs. bx: [damage, damage x the band's multiplier (rules, Lullaby marks,
      // Signature; no crits or pedals)] over every hit, before the overkill cap. x: the crossover in play (as the
      // section ends). sig: Signatures formed. offered / taken: cards dealt / picked, by kind.
      doubles: 0, multi: 0, bx: [0, 0], x: null, sig: 0, offered: {}, taken: {},
    };
  }

  // Once a frame, before regen: lowest health, crowd size and regen healing.
  _ledFrame(dt) {
    const L = this._led(), p = this.player;
    if (this.stats.regen > 0) L.heal.regen += Math.min(p.maxHp - p.hp, this.stats.regen * dt);
    L.minHp = Math.min(L.minHp, p.hp / p.maxHp);
    L.alive += this.enemies.length;
    L.frames++;
    L.x = this.stats.rules.x;
  }

  // A heart on the floor (a breather, a timed elite, a silenced boss).
  dropHeart(x, y) {
    dropItem(this, x, y, 'heal');
    this._led().hearts++;
  }

  // ------------------------------------------------------------------ loadout

  addInstrument(def, level) {
    const old = this.loadout.channels[def.role];
    if (old) this._disposeInst(old);
    const inst = this.loadout.set(def, level);
    inst.since = this.time;
    this._setupInst(inst);
    this.onLoadoutChanged();
    this._pickMoment(def.role, true);
    return inst;
  }

  setInstrumentLevel(inst, level) {
    inst.level = clamp(level, 1, MAX_INSTRUMENT_LEVEL);
    this._setupInst(inst);
    this.onLoadoutChanged();
    this._pickMoment(inst.def.role);
  }

  // A pick's one moment on the floor, once play resumes after it (never at time 0: the start sound and give=): its
  // strip pops on the HUD and exactly one kind of ring plays. A crossover that forms (or Fusion) rings in its styles'
  // colors and blooms their floor tells (the genre stamp is its line). Else a rule tier that rises rings in its
  // style's color, blooms its tell and names itself on the compact line, unless the genre changed (the stamp
  // speaks). Else the channel rings: a sound that joins (a new card or a swap), smaller for a level pick. Breaking
  // Fusion into a pair drops every rule a tier, so it is no crossover formed: the channel rings. Picks chained in
  // one pause (several levels, a remix after a level-up) play a beat apart, so no frame stacks two moments.
  // Only addInstrument changes style counts, so every tier and crossover change passes through here.
  _pickMoment(role, join = false) {
    const R = this.stats.rules, prev = this._tierSnap;
    this._tierSnap = { tiers: R.tiers, x: R.x, genre: this.genre };
    if (this.time <= 0 || !prev) return;
    const rose = Object.keys(R.tiers).filter((st) => R.tiers[st] > (prev.tiers[st] || 0)).sort((a, b) => R.tiers[b] - R.tiers[a]);
    const formed = R.x && R.x !== prev.x && prev.x !== 'Fusion' ? Object.keys(R.tiers).filter((st) => R.tiers[st] > 0) : null;
    const st = rose[0], line = st && !formed && this.genre === prev.genre ? `${CHEMISTRY[st].name} · ${CHEMISTRY[st].tiers[R.tiers[st] - 1].text}` : null;
    this._momentAt = Math.max(this.time, this._momentAt + 4 * STEP_SEC);
    this.later.push({ at: this._momentAt, fn: () => {
      const p = this.player, L = this._led();
      const ring = (o) => this.fx.ring({ x: p.x, y: p.y, follow: true, dur: 0.6, damage: 0, kb: 0, ...o });
      this.hooks.onJoin?.(role);
      if (formed) formed.forEach((s, i) => ring({ r0: 20, r1: 240 + 40 * i, width: 4, color: STYLES[s].color }));
      else if (st) ring({ r0: 20, r1: 260, width: 8, color: STYLES[st].color });
      else ring({ r0: 14, r1: join ? 200 : 140, width: join ? 6 : 4, color: this.color(role) });
      if (formed || st) this.ruleBloom = { styles: formed || [st], t: this.time };
      if (line) { this.banner(line, '', true, '', 1); L.lines = (L.lines || 0) + 1; }
      L.rings = (L.rings || 0) + (formed ? formed.length : 1);
    } });
  }

  // ------------------------------------------------------------------ Master Tapes and remixes
  //
  // A non-final boss silenced in its own section drops a Master Tape where it fell (onBossDeath). Walking into
  // it spends it on a channel at BALANCE.remix.minLevel or more that is not remixed yet (remixReady, finished to
  // level 5 as it lands): none ready banks it (the HUD puts a reel on the strips it waits for), one is queued, two or
  // more open the remix cards. A queued remix lands on the song's next free 4-bar line (Sequencer.remixBar): the
  // channel drops out for a bar under a riser, then on the downbeat the remix's own part comes in with an impact ring
  // (landRemix).

  // Channels a tape can remix: minLevel or more, a remix of their own, not remixed or queued yet.
  remixReady() { return this.loadout.instruments().filter((i) => remixReady(i) && !this.remixQueued(i)); }
  remixQueued(inst) { return this.seq.remixAt?.inst === inst || this.remixQueue.includes(inst); }

  // A tape reached you.
  _collectTape() {
    this.tapes.collected++;
    this.tapes.banked++;
    this.fx.ring({ x: this.player.x, y: this.player.y, follow: true, r0: 16, r1: 140, dur: 0.5, damage: 0, kb: 0, width: 8, color: '#ffd166' });
    this._spendTape();
  }

  // A tape left on the floor too long (pickups.js).
  tapeLost() { this.tapes.lost++; }

  // Spend banked tapes while channels are ready: one ready is queued at once, two or more wait for the cards.
  _spendTape() {
    if (!(this.tapes?.banked > 0) || this.won || this.state === 'dying') return;
    const ready = this.remixReady();
    if (ready.length === 1) {
      this.tapes.banked--;
      this.tapes.spent++;
      this.queueRemix(ready[0]);
    } else if (ready.length > 1) this.tapePick = true;
  }

  // Queue a remix: the sequencer holds one at a time, the rest wait their turn (each on the next free line).
  queueRemix(inst) {
    if (!remixReady(inst) || this.remixQueued(inst)) return;
    if (this.seq.remixAt) { this.remixQueue.push(inst); return; }
    this.seq.remixAt = { inst, bar: this.seq.remixBar(this.seq.bar + BALANCE.remix.lead, BALANCE.remix.line), out: false };
  }

  // The next queued remix goes to the sequencer once the last one has landed. One whose channel left the band
  // (or can no longer be remixed) gives its tape back.
  _nextRemix() {
    let refund = false;
    while (!this.seq.remixAt && this.remixQueue.length) {
      const inst = this.remixQueue.shift();
      if (this.loadout.has(inst) && remixReady(inst)) this.queueRemix(inst);
      else { this.tapes.banked++; this.tapes.spent--; refund = true; }
    }
    if (refund) this._spendTape();
  }

  // The sequencer flips inst.remix as it schedules the remix's downbeat, so the remix part is what plays there.
  // The game follows at once (the remix's setup and stats, its pedal on the strip) and the moment itself waits
  // for that downbeat to be heard (the 'remix' event, landRemix). The strip turns gold then too.
  _remixFlipped(inst) {
    inst.level = MAX_INSTRUMENT_LEVEL;
    this.remixed.push(inst.def.id);
    this._remixLanding++;
    this.onLoadoutChanged(true);
    this._nextRemix();
  }

  // A queued remix whose channel was swapped out before it landed: the tape comes back.
  _remixLost() {
    this.tapes.banked++;
    this.tapes.spent--;
    this._nextRemix();
    this._spendTape();
  }

  // Spend a tape on the remix card picked: it queues like any other.
  _takeRemix(o) {
    if (!o?.inst || !remixReady(o.inst) || this.remixQueued(o.inst) || !(this.tapes.banked > 0)) return;
    this.tapes.banked--;
    this.tapes.spent++;
    this.queueRemix(o.inst);
  }

  // The remix cards for a banked tape (the highest level first, then the most damage, at most three), or false when
  // fewer than two channels are ready any more (then one ready is queued at once).
  _dealTape() {
    this.tapePick = false;
    const ready = this.remixReady();
    if (ready.length < 2 || !(this.tapes.banked > 0)) { this._spendTape(); return false; }
    this.offers = ready.sort((a, b) => b.level - a.level || b.dmg - a.dmg).slice(0, 3)
      .map((inst) => ({ kind: 'remix', def: inst.def, role: inst.def.role, inst, level: MAX_INSTRUMENT_LEVEL }));
    this.tapeOffers = true;
    return true;
  }

  // Open the remix cards (the run pauses, like a level-up). With autopick (sims) the pick is made at once.
  openTapePick() {
    if (!this._dealTape()) return;
    if (this.opts.autopick) {
      const i = this.hooks.autopick ? this.hooks.autopick(this.offers) : 0;
      this._takeRemix(this.offers[i] || this.offers[0]);
      this.offers = null;
      this.tapeOffers = false;
      this._spendTape();
      return;
    }
    this._pause('levelup');
    this._cardChime();
    this.hooks.onLevelUp?.(this.offers);
  }

  // The remix's downbeat, as it is heard: the band slams back in with the new part. A gold ring (BALANCE.remix)
  // hits and knocks back the crowd, erases enemy shots inside it and knocks a boss in it off the beat; the strip
  // flips gold with the remix's name as the banner.
  landRemix(ev) {
    this._remixLanding = Math.max(0, this._remixLanding - 1);
    const inst = ev.inst, def = inst.def;
    this.remixLog.push({ t: this.time, id: def.id, bar: ev.bar, sec: this.section?.id });
    this.hooks.onLoadout?.();
    this.hooks.onRemix?.(def);
    if (this.state !== 'playing' || this.won) return;
    const K = BALANCE.remix, p = this.player;
    const dmg = K.damage * DROP.damage * (1 + this.level * K.perLevel) * this.stats.damage;
    this.remixFlash = 1;
    this.remixR = K.radius;
    this.shake = Math.max(this.shake, 12);
    this.chanPulse[def.role] = 1;
    const prev = this.src; this.src = null;
    this.fx.ring({ x: p.x, y: p.y, follow: true, r0: 20, r1: K.radius, dur: K.dur, damage: dmg, kb: K.kb, stun: K.stun, erase: 1, width: 16, color: '#ffd166' });
    this.fx.ring({ x: p.x, y: p.y, follow: true, r0: 14, r1: K.radius * 0.8, dur: K.dur * 1.3, damage: 0, kb: 0, width: 8, color: this.color(def.role) });
    this.src = prev;
    // A boss can arrive on the same downbeat: index this frame's spawns before the query.
    this.grid.clear();
    for (const e of this.enemies) if (!e.dead) this.grid.insert(e);
    const b = this.bossInRange(p.x, p.y, K.radius);
    if (b) knockOffBeat(this, b, ev.bar);
    this.banner(def.remix.name, '', false, 'gold');
    // Cards wait for the ring to land, and a card screen that opens over the gold name shows it again on resume.
    this._remixHold = this.time + BALANCE.remix.dur;
    this._remixBanner = { name: def.remix.name, t: this.time };
  }

  // A remixed instrument plays with its remix's stats, and its remix's fire/setup/update where it has them.
  // They run with `this` = the definition, so a remix can call this.fire() for the level 5 attack.
  _st(inst) { return inst.remix ? inst.def.remix.stats : inst.def.levels[inst.level - 1].stats; }
  _fn(inst, name) { return (inst.remix && inst.def.remix[name]) || inst.def[name]; }

  _setupInst(inst) {
    const setup = this._fn(inst, 'setup');
    if (!setup) return;
    const prev = this.src; this.src = inst;
    this._stableAmount = true;
    try { setup.call(inst.def, this, this._st(inst), inst); } catch (e) { this._report(inst.def.id + '.setup', e); }
    this._stableAmount = false;
    this.src = prev;
  }

  _disposeInst(inst) {
    try { inst.def.dispose?.(this, inst); } catch (e) { this._report(inst.def.id + '.dispose', e); }
    this.fx.clearOwner(inst.def.id);
    if (inst.notes > 0 || inst.dmg > 0) (this.retired ||= []).push(inst);
  }

  // quiet: the HUD waits (a remix flips its strip when its downbeat is heard, landRemix).
  onLoadoutChanged(quiet = false) {
    const oldMax = this.player?.maxHp ?? PLAYER_BASE.maxHp;
    this.stats = computeStats(this.loadout, null, this.opts.xo);
    if (this.player) {
      this.player.maxHp = this.stats.maxHp;
      if (this.player.maxHp > oldMax) this.player.hp += this.player.maxHp - oldMax;
      this.player.hp = Math.min(this.player.hp, this.player.maxHp);
    }
    // Instruments that depend on stats (orbiter counts, etc.) re-read them.
    for (const inst of this.loadout.instruments()) this._setupInst(inst);
    if (this.audio?.ready) {
      this.audio.applyPedals(this.loadout.pedalLevels(), this.loadout.remixBoost());
      // The desk levels by the channels actually playing in the bar (the sequencer re-levels every downbeat).
      this.seq.deskNow();
    }
    this.genre = genreName(this.loadout);
    const counts = this.loadout.styleCounts();
    for (const st in counts) this.peak[st] = Math.max(this.peak[st], counts[st]);
    const full = this.loadout.filled() === ROLES.length;
    this.fullBand ||= full;
    this.fused ||= isFusion(counts);
    this.maxedAll ||= full && this.loadout.instruments().every((i) => i.level >= MAX_INSTRUMENT_LEVEL);
    // A channel that just reached minLevel takes a banked tape.
    this._spendTape();
    if (!quiet) this.hooks.onLoadout?.();
  }

  // ------------------------------------------------------------------ API for instruments

  // Scaled damage: base x global damage multiplier x echo scale x the channel's fader (Fader cards) x the
  // arrangement's weight for the note being fired (a thinner part hits harder, a solo hardest).
  dmg(base) { return base * this.stats.damage * this.dmgScale * this.noteW * (1 + FADER.step * (this.loadout.faders[this.src?.def.role] || 0)); }
  // In the pocket (Live): a planted player's areas grow by the rule's stillArea.
  area(r) { return r * (this.stats.area + (this.rules?.planted ? this.stats.rules.stillArea : 0)) * BALANCE.player.area; }
  // Counts scale by a percentage (the Chorus pedal), so a one-shot weapon and a
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
    this._led().heal.inst += amt;
    return amt;
  }
  speed(v) { return v * this.stats.projSpeed; }
  // Pay into the Drop meter (a skipped level, Soul Keys, Jackpot).
  chargeDrop(n) { if (n > 0) this.dropCharge = Math.min(this.dropMax, this.dropCharge + n); }
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

  // The boss when it is alive and in range (some sounds aim the bar's first hit at it), else null.
  bossInRange(x, y, range) {
    const b = this.boss;
    return b && !b.dead && b.spawnT <= 0.2 && dist2(b.x, b.y, x, y) < (range + b.r) * (range + b.r) ? b : null;
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
    let crit = false, mul = 1;
    const d0 = dmg;
    if (rng() < this.stats.crit) { dmg *= this.stats.critMult; crit = true; }
    if (e.vulnUntil > this.time) { dmg *= 1 + e.vuln; mul *= 1 + e.vuln; }   // marked by Lullaby: takes more from every source
    if (this.stats.rules.on) { const r = this.ruleMul(e); dmg *= r; mul *= r; }   // the band's play rules (echoes too)
    const src = o.src || this.src;
    const L = this.ledger?.[this.sectionIndex];   // never opens a section's entry (_ledFrame does)
    if (L) { L.bx[0] += d0; L.bx[1] += d0 * mul; }
    if (src) src.dmg += Math.min(dmg, Math.max(0, e.hp)); // count damage that landed, not overkill
    e.hp -= dmg;
    // An enemy under fire tints in the color of the channel hitting it. Bosses are hit constantly, so they
    // flash once per 1% of their health: the outline keeps its color and the flash rate reads as your damage.
    e.hitColor = o.color || (src ? this.color(src) : '#ffffff');
    if (!e.boss) e.flash = 0.09;
    else if ((e.flashAcc = (e.flashAcc || 0) + dmg) >= e.maxHp * 0.01) { e.flashAcc = 0; e.flash = 0.09; }
    if (o.kb && !e.boss && !(e.ai.charge > 0)) {   // a charging enemy holds its lane
      const fx = o.fx ?? this.player.x, fy = o.fy ?? this.player.y;
      let dx = e.x - fx, dy = e.y - fy;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      const k = (o.kb * this.stats.knockback * 3) / Math.max(0.5, e.mass);
      e.kbx += dx * k; e.kby += dy * k;
    }
    if (o.stun) {
      e.stun = Math.max(e.stun, o.stun * (e.boss ? 0.12 : e.elite ? 0.5 : 1));
      if (!e.boss && e.ai.charge > 0) e.ai.charge = 0;   // a stun hit stops a Stomp mid-dash
    }
    if (o.slow) { e.slow = Math.max(e.slow, Math.min(0.8, o.slow) * (e.boss ? 0.4 : 1)); e.slowT = 1.2; }
    // Numbers only for hits worth reading: big crits always, and on a calm screen also other crits, killing
    // blows and big chunks. Otherwise they flood the screen.
    const big = crit && (e.boss || e.elite || dmg >= e.maxHp * 0.25);
    if (this.settings.damageNumbers && (big || (this.fx.texts.length < 8 && (crit || e.hp <= 0 || dmg >= e.maxHp * 0.2)))) {
      this.fx.text(e.x, e.y - e.r - 4, String(Math.round(dmg)), crit ? '#ffe066' : '#ffffff', crit ? 14 : 10);
    }
    if (e.hp <= 0) this.kill(e, src);
  }

  // The damage multiplier from the band's play rules on a hit on `e` (1 with no rule on). Long throw and Mosh
  // pit read where the enemy's body is (one distance per hit), Combo streak and Ride the swell the rule state.
  ruleMul(e) {
    const R = this.stats.rules, S = this.rules;
    let m = 1;
    if (R.far || R.near) {
      const d2 = dist2(e.x, e.y, this.player.x, this.player.y);
      if (R.far && d2 > (this.farR() + e.r) ** 2) m *= 1 + R.far;
      if (R.near && d2 < (this.nearR() + e.r) ** 2) m *= 1 + R.near;
    }
    if (R.combo) m *= 1 + R.combo * Math.min(1, S.combo / RULES.comboCap);
    if (R.swell) m *= 1 + R.swell * this.swellAt();   // x1 after each fill, never below it
    return m;
  }

  // The rules' live reach and swell, as every reader sees them (ruleMul, the floor tells, the autopilot): Mosh pit's
  // radius, Long throw's radius (px) and Ride the swell's place in the phrase (0..1). Crossovers bend them (pure
  // math on the band and the rule state, CROSS_TEXT in loadout.js says each in words).
  nearR() {
    const x = this.stats.rules.x, X = BALANCE.crossover;
    if (x === 'Industrial') return RULES.far;
    if (x === 'Grunge' && this.rules.planted) return RULES.near * X.grunge;
    if (x === 'Symphonic metal') return RULES.near * (1 + X.symphonic * this.rules.phrase);
    return RULES.near;
  }
  farR() {
    const x = this.stats.rules.x, S = this.rules;
    if (x === 'Indietronica' && S.planted) return RULES.near;
    if (x === 'Film score') return RULES.far * (1 - BALANCE.crossover.film * S.phrase);
    if (x === 'Electro chip' && S.combo >= RULES.comboCap) return 0;
    return RULES.far;
  }
  swellAt() { return this.stats.rules.x === 'Chamber pop' && this.rules.planted ? 1 : this.rules.phrase; }

  kill(e, src) {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    if (src) src.kills++;
    const L = this._led();
    L.kills++;
    if (!e.boss) {
      const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
      L.nd++; L.killDist += d;
      if (d < 120) L.near120++;
    }
    // A kill pops in the color of the hit that landed it. Off-screen kills skip the pop, so a Drop's far
    // kills leave the particle budget to the ones you can see.
    if (e.boss || this.onScreen(e)) {
      const col = e.hitColor || e.color;
      this.fx.particles(e.x, e.y, col, e.boss ? 60 : e.elite ? 20 : 8, e.boss ? 380 : e.elite ? 170 : 190, e.boss ? 1 : e.elite ? 0.4 : 0.42, e.boss ? 4 : e.elite ? 2.4 : 2.8);
      if (!e.boss) this.fx.flash(e.x, e.y, e.r * (e.elite ? 2.4 : 1.8), col, 0.16, 0);
    }
    if (e.xp > 0) {
      if (e.boss) { for (let i = 0; i < 12; i++) dropGem(this, e.x + rand(-50, 50), e.y + rand(-50, 50), Math.ceil(e.xp / 12)); }
      else dropGem(this, e.x, e.y, e.xp);
    }
    // Hearts come on the song's schedule (BALANCE.hearts), never from ordinary kills: featured elites drop a
    // vinyl, timed elites a heart, and now and then an ordinary kill leaves a magnet.
    if (e.vinyl) dropItem(this, e.x, e.y, 'vinyl');
    else if (e.heart) this.dropHeart(e.x, e.y);
    else if (!e.boss && !e.elite && rng() < BALANCE.hearts.killMagnet) dropItem(this, e.x, e.y, 'magnet');
    if (e.def.splits && !e.elite && !this.won) {   // nothing new spawns once White Noise is silenced
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + rand(0, 1);
        const c = spawnEnemy(this, e.def.splits, e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14, { hpMul: 0.5, scale: 0.8 });
        if (c) { c.spawnT = 0; c.kbx = Math.cos(a) * 160; c.kby = Math.sin(a) * 160; }
      }
    }
    if (e.boss) this.onBossDeath(e);
  }

  // Inside the visible arena (with a margin), for effects that only matter when seen.
  onScreen(e) {
    const v = this.view, p = this.player;
    return Math.abs(e.x - p.x) < v.w / 2 + 60 && Math.abs(e.y - p.y) < v.h / 2 + 60;
  }

  // ------------------------------------------------------------------ player

  // from: the enemy body that touched the player (null for a shot). shotFrom: the enemy that fired the shot.
  // kind: the cause when it is neither (a Snare's 'mark'). With god=1 nothing is taken, but the ledger still
  // records what would have been (with the usual invulnerability window), so one run maps the whole threat curve.
  // god=2 also lets the hit reach the play rules (_hitRules), so a rule that reads hits can be measured.
  hurt(dmg, from, shotFrom, kind) {
    const p = this.player;
    if (this.state !== 'playing' || this.won) return;
    const god = this.opts.god;
    if (god ? this.time < (this._godUntil ?? -1) : p.iframes > 0) return;
    if (!god && this.shield && this._blockHit(from)) return;   // a shield takes the hit
    const taken = Math.max(1, dmg * this.mods.dmgIn * BALANCE.player.dmgIn - this.stats.armor);
    const cause = kind || (!from ? 'shots' : from.boss ? 'boss' : 'contact');
    const by = (from || shotFrom)?.def.name;
    const L = this._led();
    L.dmg[cause] = (L.dmg[cause] || 0) + taken;
    L.hits++;
    if (by) L.by[by] = (L.by[by] || 0) + taken;
    if (god) { if (god === 2) this._hitRules(); this._godUntil = this.time + PLAYER_BASE.iframes; return; }
    p.hp -= taken;
    this._hitRules();
    this.damageTaken[cause] = (this.damageTaken[cause] || 0) + taken;
    if (by) { this.damageBy[by] = (this.damageBy[by] || 0) + taken; this.lastHitBy = by; }
    p.iframes = PLAYER_BASE.iframes;
    p.hurtT = 0.3;
    this.hurtFlash = 1;
    this.shake = Math.max(this.shake, 7);
    if (this.audio?.ready && !this.opts.sim) this.audio.hurt();
    if (from && !from.boss && !(from.ai.charge > 0)) {
      const dx = from.x - p.x, dy = from.y - p.y, d = Math.hypot(dx, dy) || 1;
      from.kbx += (dx / d) * 260; from.kby += (dy / d) * 260;
    }
    if (p.hp <= 0) { p.hp = 0; this._die(); }
  }

  // What a hit does to the play rules: In the pocket's calm restarts and the Combo streak resets.
  _hitRules() {
    this.lastHurtAt = this.time;
    this.rules.combo = this.stats.rules.x === 'Chip metal' ? this.rules.combo >> 1 : 0;
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
        this._led().levels++;
      }
    } else if (gm.kind === 'heal') {
      const L = this._led(), hp = this.player.hp;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * BALANCE.hearts.heal);
      L.heal.drop += this.player.hp - hp;
      L.heartsTaken++;
      this.fx.text(this.player.x, this.player.y - 26, 'Breather!', '#ff8fa3', 14);
    } else if (gm.kind === 'magnet') {
      magnetAll(this);
    } else if (gm.kind === 'vinyl') {
      if (!this.opts.solo) this.pendingLevels++;
      this._led().levels++;
      this.fx.text(this.player.x, this.player.y - 26, 'Vinyl!', '#ffd166', 14);
    } else if (gm.kind === 'tape') {
      this._collectTape();
    }
    this._ping(gm.kind === 'xp' ? 'note' : 'run');
  }

  // Pickup chimes (Note chimes setting): sound only, on the beat grid and in key (Sequencer.ping).
  _ping(kind) { if (this.settings.chimes) this.seq.ping(kind); }

  // ------------------------------------------------------------------ the Drop

  // A press during a phrase's fill bar (bar % 8 === 7, nothing else waiting on the next downbeat) lets the fill
  // be the build: the Drop lands on the phrase downbeat. Otherwise it builds through the next bar.
  _fillBuild() {
    const s = this.seq;
    return !s.hold && !s.pendingStop && !s.dropState && !this._remixDue() && (s.bar + 1) % DROP.phrase === 0;
  }

  // The fill is judged by ear: the sequencer schedules lookahead plus output latency ahead of what is heard, so
  // a press on the fill's last hits can come once the phrase downbeat is already scheduled. The Drop still lands
  // on that downbeat while it is not heard yet and is free (Sequencer.dropDownbeat). Returns that bar, else -1.
  _lateFill() {
    const s = this.seq, now = this._heardNow();
    if (s.bar % DROP.phrase !== 0) return -1;
    const heard = s.sounding(now);
    if (!heard || heard.bar !== s.bar - 1) return -1;
    // The downbeat's own events (its beat, impact, boss attack) must not have run yet: _processEvents drains one
    // frame ahead of what is heard, so judge against that horizon too.
    if (this._downbeat === s.bar) return -1;
    const d = s.dropDownbeat(s.bar);
    return d && d.time > now && d.time > this._drainNow() ? s.bar : -1;
  }

  // Audio time _processEvents drains up to (one frame ahead of what is heard, so attacks draw on time).
  _drainNow() { return this.clock.now() - (this.opts.sim ? 0 : (this.audio?.latency || 0) - 1 / 60); }

  // Audio time of what is heard now (the output latency behind the audio clock; none in a sim).
  _heardNow() { return this.clock.now() - (this.opts.sim ? 0 : this.audio?.latency || 0); }

  // The bar a Drop pressed now would land on. A perfect drop lands on a phrase downbeat (dropPerfectNow), so the
  // HUD and the autopilot can read the window. The same rules as requestDrop.
  dropLandsOn() {
    const s = this.seq;
    if (this._fillBuild()) return s.bar + 1;
    const late = this._lateFill();
    return late >= 0 ? late : s.bar + 2 + (s.pendingStop || this._remixDue() ? 1 : 0);
  }
  dropPerfectNow() { return this.dropLandsOn() % DROP.phrase === 0; }
  // A Drop pressed now would land as a Double Drop (on one of the song's own impact downbeats).
  dropDoubleNow() { return false; }

  // A remix whose dropout is playing lands on the next downbeat, and a Drop pressed meanwhile waits a bar for
  // it (Sequencer._step): queued now, it builds on the bar after the remix and lands on the one after that.
  _remixDue() { const R = this.seq.remixAt; return !!R && R.out; }

  requestDrop() {
    // Safety net: if the game still thinks a Drop is building but the sequencer has none pending, clear it.
    if (this.dropState && !this.seq.dropState && !this.seq.events.some((ev) => ev.type === 'drop')) this.dropState = null;
    if (this.state !== 'playing' || this.won || this.dropCharge < this.dropMax || this.dropState) return false;
    const fill = this._fillBuild();
    const late = fill ? -1 : this._lateFill();
    // A late press lands on the downbeat already scheduled (its 'drop' event is queued, nothing is left to build).
    if (late >= 0 ? !this.seq.landDropAt(late) : !this.seq.requestDrop()) return false;
    this.dropCharge = 0;
    this.dropState = 'queued';
    this.hooks.onDrop?.('queued');
    if (fill || late >= 0) {
      if (fill) this.seq.dropState = 'building';
      this.dropState = 'building';
      this.hooks.onDrop?.('building');
    }
    return true;
  }

  // The Drop lands on the downbeat of `bar`: a blast around you (BALANCE.drop) that erases the shots and Snare
  // marks inside it. A perfect drop (on a phrase downbeat) hits harder and wider and knocks a boss in it off
  // the beat.
  doDrop(bar) {
    const p = this.player, D = DROP;
    const perfect = bar % D.phrase === 0;
    this.dropState = null;
    this.drops++;
    const L = this._led();
    L.drops++;
    if (perfect) { L.perfect++; this.perfectDrops++; }
    this.dropFlash = 1;
    this.perfectFlash = perfect ? 1 : 0;
    this.shake = Math.max(this.shake, perfect ? 18 : 13);
    const R = this.dropR = D.radius * (perfect ? D.perfectRadius : 1);
    const dmg = D.damage * (1 + this.level * D.perLevel) * this.stats.damage * (perfect ? D.perfectDmg : 1);
    const prev = this.src; this.src = null;
    // Kills color by distance as a spectrum of your band: Beat nearest, Sparkle outermost.
    const band = ROLES.filter((r) => this.loadout.channels[r]).map((r) => ROLE_INFO[r].color);
    const colorAt = (e) => band[Math.min(band.length - 1, Math.floor(Math.hypot(e.x - p.x, e.y - p.y) / (R / band.length)))];
    // A boss can arrive on the same downbeat as the Drop: index this frame's spawns before the query.
    this.grid.clear();
    for (const e of this.enemies) if (!e.dead) this.grid.insert(e);
    for (const e of this.inRadius(p.x, p.y, R)) {
      this.hit(e, e.boss ? dmg * D.boss : dmg, { kb: D.kb, fx: p.x, fy: p.y, stun: D.stun, color: colorAt(e) });
      if (perfect && e.boss && !e.dead) knockOffBeat(this, e, bar);
    }
    this.src = prev;
    this.fx._erase(p.x, p.y, R);
    this.hazards = this.hazards.filter((h) => dist2(h.x, h.y, p.x, p.y) > R * R);
    this.fx.ring({ x: p.x, y: p.y, follow: true, r0: 20, r1: R, dur: 0.6, damage: 0, kb: 0, width: 14, color: '#ffffff' });
    // One ring per channel in its color. The outer channels run faster, so the rings spread into the same order
    // as the kill spectrum (Sparkle outermost). Cosmetic.
    band.forEach((color, i) => this.fx.ring({ x: p.x, y: p.y, follow: true, r0: 20, r1: R, dur: 0.42 + 0.06 * (band.length - 1 - i), damage: 0, kb: 0, width: 8, color }));
    // A perfect drop: a gold ring that lingers at the edge of the blast, and a second one a 16th later.
    if (perfect) {
      this.fx.ring({ x: p.x, y: p.y, follow: true, r0: R * 0.9, r1: R * 1.04, dur: 0.5, damage: 0, kb: 0, width: 10, color: '#ffd166' });
      this.later.push({ at: this.time + STEP_SEC, fn: () => this.fx.ring({ x: this.player.x, y: this.player.y, follow: true, r0: 30, r1: R, dur: 0.5, damage: 0, kb: 0, width: 6, color: '#ffd166' }) });
    }
    this.hooks.onDrop?.('done', perfect);
  }

  // ------------------------------------------------------------------ the song's own impacts and solos

  // The arrangement's impact downbeats (chorus starts, the Bridge's return, The Drop, each Finale cycle):
  // the band slams back in around you. A moderate ring: it knocks back and stuns the crowd and erases enemy
  // shots near you, but never knocks a boss off its beat and pulls no notes. The sequencer never sends one
  // on a downbeat the player's Drop lands on (that Drop is the hit), and on the song's ending it only sounds.
  songImpact(bar) {
    if (this.state !== 'playing' || this.won || bar === this._dropBar) return;
    const p = this.player;
    const K = BALANCE.songImpact;
    const dmg = K.damage * DROP.damage * (1 + this.level * 0.05) * this.stats.damage;
    this.songImpacts++;
    this.impactAt = this.time;
    this.shake = Math.max(this.shake, 8);
    const prev = this.src; this.src = null;
    // A boss can arrive on the same downbeat: index this frame's spawns before the query.
    this.grid.clear();
    for (const e of this.enemies) if (!e.dead) this.grid.insert(e);
    for (const e of this.inRadius(p.x, p.y, K.radius)) this.hit(e, dmg, { kb: K.kb, fx: p.x, fy: p.y, stun: e.boss ? 0 : K.stun, color: '#ffffff' });
    this.src = prev;
    const er = K.radius * K.erase;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      if (dist2(s.x, s.y, p.x, p.y) < er * er) { this.fx.particles(s.x, s.y, '#ffffff', 2, 80, 0.25, 2); swapRemove(this.shots, i); }
    }
    this.fx.ring({ x: p.x, y: p.y, follow: true, r0: 20, r1: K.radius, dur: 0.45, damage: 0, kb: 0, width: 10, color: '#ffffff' });
    this.hooks.onImpact?.(bar);
  }

  // Who takes a solo phrase (the sequencer asks on its first bar): a remix, the remixes taking turns across
  // solos (the one that has soloed least, ties: the most damage, so a new remix gets the next one); else the
  // highest level (ties: the most damage). It hits about 1.8x its full part, held to 1.4x while the final boss plays.
  featured() {
    const band = this.loadout?.instruments() || [];
    if (!band.length) return null;
    const n = (i) => this.soloN[i.def.id] || 0;
    const remixed = band.filter((i) => i.remix).sort((a, b) => n(a) - n(b) || b.dmg - a.dmg);
    const inst = remixed.length ? remixed[0]
      : band.reduce((a, b) => (b.level > a.level || (b.level === a.level && b.dmg > a.dmg) ? b : a));
    if (inst.remix) this.soloN[inst.def.id] = n(inst) + 1;
    this.solos++;
    const finalBoss = this.boss && !this.boss.dead && this.boss.def?.final;
    return { inst, gain: finalBoss ? 1.4 : 1.8 };
  }

  // ------------------------------------------------------------------ events

  _processEvents() {
    // Fire when the note is heard (output latency), one frame early since the attack is drawn next frame.
    const now = this._drainNow();
    const evs = this.seq.drain(now, this._evbuf);
    for (const ev of evs) {
      switch (ev.type) {
        case 'note': this.fireNote(ev.inst, ev.note, 1); break;
        case 'beat': this.onBeat(ev); break;
        case 'section': this.onSection(ev); break;
        case 'build': this.dropState = 'building'; this.hooks.onDrop?.('building'); break;
        case 'drop': this._dropBar = ev.bar; if (this.won) this.dropState = null; else this.doDrop(ev.bar); break;   // on the ending it only sounds
        case 'impact': this.songImpact(ev.bar); break;
        case 'remix': this.landRemix(ev); break;
      }
    }
    evs.length = 0;
  }

  fireNote(inst, note, scale) {
    if (!this.loadout.has(inst)) return;
    this.src = inst;
    this.dmgScale = scale;
    this.noteW = note.w ?? 1;
    try { this._fn(inst, 'fire').call(inst.def, this, note, this._st(inst), inst); } catch (e) { this._report(inst.def.id + '.fire', e); }
    this.src = null;
    this.dmgScale = 1;
    this.noteW = 1;
    inst.notes++;
    this.chanPulse[inst.def.role] = Math.max(this.chanPulse[inst.def.role], 0.4 + 0.6 * note.v);
    if (scale === 1 && this.stats.echo > 0 && ECHO_ROLES.has(inst.def.role) && rng() < this.stats.echo) {
      this.later.push({ at: this.time + ECHO_STEPS * STEP_SEC, fn: () => this.fireNote(inst, note, this.stats.echoDmg) });
    }
  }

  onBeat(ev) {
    // A bar's downbeat runs once, so its set pieces and attacks never repeat (a pause keeps a queued one for
    // the first frame after resume).
    if (ev.beat === 0) {
      if (ev.bar === this._downbeat) return;
      this._downbeat = ev.bar;
    }
    this.beatPulse = 1;
    if (ev.beat === 0) this.barPulse = 1;
    if (this.won) return;   // White Noise is silenced: no more spawns, beats or shots, only the silence wave
    this._rulesOnBeat(ev);
    enemiesOnBeat(this, ev);
    this.director.onBeat(ev);
  }

  // The play rules on each beat. Combo streak counts a beat with no hit since the last one. In the pocket:
  // a beat that finds you where the last one did (never more than RULES.plant away in between) plants you,
  // and a planted beat heals once you have not been hit for RULES.calm bars. Ride the swell: the phrase
  // runs 0..1 from the bar after each 8-bar fill to the fill itself. Lo-fi chip: a clean planted beat adds
  // crossover.lofi. Boss theme: the fill's downbeat fills the combo.
  _rulesOnBeat(ev) {
    const S = this.rules, R = this.stats.rules, p = this.player;
    const planted = !S.broke;
    if (this.lastHurtAt < S.beatAt) S.combo = Math.min(RULES.comboCap, S.combo + (planted && R.x === 'Lo-fi chip' ? BALANCE.crossover.lofi : 1));
    S.planted = planted;
    S.broke = false;
    S.lastBeatX = p.x; S.lastBeatY = p.y;
    S.beatAt = this.time;
    if (S.planted && R.stillHeal > 0 && this.time - this.lastHurtAt >= RULES.calm * BAR_SEC) this.heal(R.stillHeal);
    const pos = this.song.position(ev.bar);
    const b = pos.barInSection + (pos.section.from || 0);
    S.phrase = ((b % RULES.phraseBars) * 4 + ev.beat) / (RULES.phraseBars * 4 - 1);
    if (R.x === 'Boss theme' && ev.beat === 0 && b % RULES.phraseBars === RULES.phraseBars - 1) S.combo = RULES.comboCap;
  }

  // ------------------------------------------------------------------ crowd control and defense (attack API)

  // Pull every enemy within r toward (x, y): an impulse on its knockback, scaled by mass and never past the
  // point. Bosses and charging enemies hold their ground. Returns how many moved.
  pull(x, y, r, strength) {
    let n = 0;
    for (const e of this.inRadius(x, y, r)) {
      if (e.boss || e.ai.charge > 0 || e.spawnT > 0) continue;
      const dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy);
      if (d < 1) continue;
      // An impulse k travels about k / 7 before it decays (updateEnemies), so cap it to stop short of the point.
      const k = Math.min((strength * 3) / Math.max(0.5, e.mass), d * 6);
      e.kbx += (dx / d) * k; e.kby += (dy / d) * k;
      n++;
    }
    return n;
  }

  // Launch an enemy: it flies at `speed` px/s along `angle` for o.t seconds (default 0.35), deaf to its own
  // steering and harmless to touch, and hits every other enemy it crashes into once for `dmg`. One generation
  // only: what it hits is not launched. Bosses, charging enemies and enemies already in flight cannot be
  // launched (returns false). o.onLand(e, g) runs where it stops. Damage is credited to the current g.src.
  launch(e, angle, speed, dmg, o = {}) {
    if (!e || e.dead || e.boss || e.spawnT > 0 || e.ai.charge > 0 || e.launch) return false;   // never a body still arriving
    e.launch = { t: o.t ?? 0.35, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, dmg, src: this.src, hit: new Set([e]), max: o.max ?? 8, onLand: o.onLand ?? null };
    e.kbx = e.kby = 0;
    return true;
  }

  // One frame of a launched enemy's flight (updateEnemies). Returns true while it is in the air.
  _flyLaunched(e, dt) {
    const L = e.launch;
    L.t -= dt;
    e.x += L.vx * dt; e.y += L.vy * dt;
    const drag = Math.pow(0.15, dt);
    L.vx *= drag; L.vy *= drag;
    const prev = this.src; this.src = L.src;
    if (L.hit.size <= L.max) {
      this.grid.query(e.x, e.y, e.r + 12, (o) => {
        if (o.dead || L.hit.has(o) || o.spawnT > 0) return;
        const rr = e.r + o.r + 4;
        if (dist2(o.x, o.y, e.x, e.y) > rr * rr) return;
        L.hit.add(o);
        this.hit(o, L.dmg, { kb: 140, fx: e.x, fy: e.y });
        this.fx.particles(o.x, o.y, this.color(L.src), 4, 160, 0.3, 2.5);
        if (L.hit.size > L.max) return false;
      });
    }
    if (L.t <= 0 || e.dead) {
      e.launch = null;
      if (L.onLand && !e.dead) { try { L.onLand(e, this); } catch (err) { this._report('launch.onLand', err); } }
    }
    this.src = prev;
    return !!e.launch;
  }

  // A shield (this.shield = { n, until, src, onBreak }) blocks a hit: the player gets the usual iframes and the
  // body that touched it is pushed off. When the last charge goes, onBreak(g, shield) runs with g.src = src.
  _blockHit(from) {
    const s = this.shield, p = this.player;
    if (!(s.n > 0) || this.time > s.until) { this.shield = null; return false; }
    s.n = Math.min(s.n, SHIELD_MAX) - 1;
    p.iframes = PLAYER_BASE.iframes;
    if (from && !from.boss && !(from.ai.charge > 0)) {
      const dx = from.x - p.x, dy = from.y - p.y, d = Math.hypot(dx, dy) || 1;
      from.kbx += (dx / d) * 320; from.kby += (dy / d) * 320;
    }
    const col = this.color(s.src);
    this.fx.flash(p.x, p.y, p.r + 26, col, 0.25, 0.25);
    this.fx.particles(p.x, p.y, col, 10, 220, 0.4, 2.5);
    if (s.n <= 0) {
      this.shield = null;
      if (s.onBreak) {
        const prev = this.src; this.src = s.src;
        try { s.onBreak(this, s); } catch (e) { this._report('shield.onBreak', e); }
        this.src = prev;
      }
    }
    return true;
  }

  // How many mixer channels the song has opened so far.
  channelCap(index = this.sectionIndex) { return CHANNEL_UNLOCKS[Math.min(index, CHANNEL_UNLOCKS.length - 1)]; }

  onSection(ev) {
    this.sheet.push(this._snapshot());
    const before = this.channelCap();
    this.sectionIndex = ev.index;
    this.section = ev.section;
    const opened = this.channelCap() > before;
    this.banner(ev.section.name);
    if (opened) this.hooks.onLoadout?.();
    // A boss belongs to its chorus. One still alive when the section ends fades out unbeaten (no notes,
    // no credit, no stop), so the next boss always arrives alone.
    for (const e of this.enemies) {
      if (!e.boss || e.dead || e.def.final) continue;
      e.dead = true;
      this._logBossEnd(e, 'faded');
      this.fx.particles(e.x, e.y, e.color, 40, 300, 1, 3);
    }
    if (this.boss?.dead) { this.boss = null; this.hooks.onBoss?.(null); }
    this.director.onSection(ev);
    this.hooks.onSection?.(ev.section);
  }

  onBossSpawn(e) {
    if (this.audio?.ready) this.audio.bossQuiet(false);
    this.boss = e;
    // A boss belongs to its section and fades when it ends: the boss bar's clock line runs over those bars
    // (from the section's start to its end; the open-ended Finale has none).
    const pos = this.song?.position(this.seq.bar);
    if (pos && !e.def.final && Number.isFinite(pos.barsLeft)) e.clock = { from: pos.sectionStart, to: pos.sectionStart + pos.section.bars };
    (this.bossesSpawned ||= []).push(e.type);
    this.bossLog.push({ type: e.type, spawn: this.time, end: null, how: null });
    this.hooks.onBoss?.(e);
  }

  onBossDeath(e) {
    this.bossesBeaten++;
    this.bossKills.push(e.type);
    this._logBossEnd(e, 'silenced');
    if (this.boss === e) {
      this.boss = null;
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const x = this.enemies[i];
        if (x.boss && !x.dead && x !== e) { this.boss = x; break; }
      }
    }
    this.shake = Math.max(this.shake, 14);
    // Its noise turns into music: every shot still in the air pops into a small note (at most 60).
    this.shots.forEach((s, i) => {
      if (i < 60) dropGem(this, s.x, s.y, 0.25);
      this.fx.particles(s.x, s.y, '#ffffff', 3, 90, 0.3, 2);
    });
    this.shots.length = 0;
    this.hooks.onBoss?.(this.boss);
    if (e.def.final) {
      this.won = true;
      this.hazards.length = 0;   // no more beats: marks still waiting would never land
      // The song's ending: stop-time on i on the next downbeat, and the win lands as that bar ends.
      this.seq.stopNext(16, true);
      this.victoryT = this._stopLeft();
      if (this.audio?.ready) this.audio.bossQuiet(true);
      // The ending is one hit and a silent bar, so a Drop still waiting for its build bar is called off.
      if (this.seq.dropState === 'queued') this.seq.dropState = this.dropState = null;
      this.banner('Encore!');
      // The silence wave grows from where it fell and silences the arena (see step()). A remix still waiting for
      // its line is called off: the song is ending.
      this.silence = { x: e.x, y: e.y, r: 0 };
      this.seq.remixAt = null;
      this.remixQueue.length = 0;
      this.tapePick = false;
    } else {
      magnetAll(this);
      // A heart where it fell: silencing a boss inside its chorus is how a fight pays you back.
      if (BALANCE.hearts.bossHeart) this.dropHeart(e.x, e.y);
      // And its Master Tape (at most BALANCE.remix.tapes a run): the magnet leaves it where it fell.
      if (this.tapes.dropped < BALANCE.remix.tapes) {
        this.tapes.dropped++;
        dropItem(this, e.x, e.y, 'tape');
      }
      // The boss implodes, then bursts outward in its color (cosmetic).
      this.fx.ring({ x: e.x, y: e.y, r0: e.r * 3.2, r1: 6, dur: 0.22, damage: 0, kb: 0, width: 12, color: e.color });
      this.later.push({ at: this.time + 2 * STEP_SEC, fn: () => this.fx.ring({ x: e.x, y: e.y, r0: 10, r1: 640, dur: 0.7, damage: 0, kb: 0, width: 16, color: e.color }) });
      // Stop-time on the next downbeat.
      this.seq.stopNext(8);
    }
  }

  _logBossEnd(e, how) {
    const b = this.bossLog.find((b) => b.type === e.type && b.end === null);
    if (b) { b.end = this.time; b.how = how; }
  }

  // Banners are for moments only: section names, remix names (style 'gold') and the Encore.
  // compact: a short line under the boss bar instead of the big center banner (for mid-fight messages).
  // prio: a compact moment's rank (3 Double Drop, 2 Signature, 1 a rule tier, 0 anything else).
  banner(title, sub = '', compact = false, style = '', prio = 0) {
    if (!title) return;
    this.sectionBanner = { title, sub, t: 0 };
    this.hooks.onBanner?.(title, sub, compact, style);
  }

  // ------------------------------------------------------------------ update

  // A short beat between the lethal hit and the end screen: the speaker shatters in channel colors
  // while the band drops to a muffled vamp.
  _die() {
    const p = this.player;
    this.state = 'dying';
    this.dyingT = 0.9;
    this.seq.hold = true;
    this.seq.events = this.seq.events.filter((ev) => ev.type !== 'note' && ev.type !== 'beat' && ev.type !== 'build' && ev.type !== 'drop');
    this.seq.dropState = null;
    this.seq.pendingStop = null;
    this.seq.remixAt = null;   // no remix lands on the band playing on after the run
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
    this._ledFrame(dt);
    if (this.stats.regen > 0) p.hp = Math.min(p.maxHp, p.hp + this.stats.regen * dt);
    // In the pocket: stepping off the last beat's spot unplants you at once (one distance a frame).
    const S = this.rules;
    if (!S.broke && dist2(p.x, p.y, S.lastBeatX, S.lastBeatY) > RULES.plant * RULES.plant) { S.broke = true; S.planted = false; }
    if (this.shield && this.time > this.shield.until) this.shield = null;

    // Spatial hash for this frame
    this.grid.clear();
    for (const e of this.enemies) if (!e.dead) this.grid.insert(e);

    // Delayed actions (echoes). splice keeps the queue in order, so a cosmetic entry never reorders the echoes.
    for (let i = this.later.length - 1; i >= 0; i--) {
      const l = this.later[i];
      if (l.at <= this.time) { this.later.splice(i, 1); l.fn(); }
    }

    for (const inst of this.loadout.instruments()) {
      const update = this._fn(inst, 'update');
      if (update) {
        this.src = inst;
        try { update.call(inst.def, this, dt, this._st(inst), inst); } catch (e) { this._report(inst.def.id + '.update', e); }
        this.src = null;
      }
    }

    this.fx.update(dt);
    updateEnemies(this, dt);
    if (!this.won) this.director.update(dt);   // no elites or recycling while the silence wave clears the arena
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
    this.perfectFlash *= Math.exp(-dt * 2);
    this.remixFlash *= Math.exp(-dt * 2);
    for (const r of ROLES) this.chanPulse[r] *= Math.exp(-dt * 9);
    if (this.sectionBanner) this.sectionBanner.t += dt;

    if (this.won && this.state === 'playing') {
      // The silence wave grows at 900 px/s. Each enemy it reaches is silenced: no notes, items or splits, a pop
      // in a band color and one more on the counter. It runs on dt, never on victoryT, so it works however
      // long the final cadence holds the win.
      const w = this.silence;
      if (w) {
        w.r += 900 * dt;
        const band = this.loadout.instruments();
        for (const x of this.enemies) {
          if (x.dead || dist2(x.x, x.y, w.x, w.y) > (w.r + x.r) * (w.r + x.r)) continue;
          x.dead = true;
          this.kills++;
          if (!this.onScreen(x)) continue;
          const col = this.color(band[x.id % band.length]);
          this.fx.particles(x.x, x.y, col, 6, 190, 0.42, 2.8);
          this.fx.flash(x.x, x.y, x.r * 1.8, col, 0.16, 0);
        }
      }
      this.victoryT -= dt;
      if (this.victoryT <= 0) { this.victory(); return; }
    }

    // A full Drop meter rings a run, whatever filled it.
    const ready = this.dropCharge >= this.dropMax;
    if (ready && !this.dropReady) this._ping('run');
    this.dropReady = ready;

    // Card screens wait until a pending or playing stop bar is over (two bars at most), until a Drop that has
    // started its build bar has landed (one more bar), so the vamp never loops the build, and until a remix whose
    // dropout is playing has landed and been heard. A tape's remix cards come before the level-ups.
    // Safety net: a remix counted as landing has its event waiting in the sequencer.
    if (this._remixLanding > 0 && !this.seq.events.some((ev) => ev.type === 'remix')) this._remixLanding = 0;
    const building = this.dropState === 'building' || this.seq.dropState === 'building' || this._remixDue() || this._remixLanding > 0 || this.time < this._remixHold;
    const clear = this.state === 'playing' && !this.won && !building && this._stopLeft() <= 0;
    if (clear && this.tapePick) this.openTapePick();
    if (clear && this.state === 'playing' && this.pendingLevels > 0) this.openLevelUp();
  }

  // Seconds until the pending or playing stop bar has been heard to its end (negative when there is none).
  _stopLeft() { return this.seq.stopEnd() - this.clock.now() + (this.audio?.latency || 0); }

  // ------------------------------------------------------------------ level up

  openLevelUp() {
    this._deal();
    if (this.opts.autopick) {
      const i = this.hooks.autopick ? this.hooks.autopick(this.offers) : 0;
      this.pendingLevels--;
      applyOffer(this, this.offers[i] || this.offers[0]);
      this.offers = null;
      if (this.pendingLevels > 0) this.openLevelUp();
      return;
    }
    this._pause('levelup');
    this._cardChime();
    this.hooks.onLevelUp?.(this.offers);
  }

  // A card screen opens on an arpeggio of the chord.
  _cardChime() {
    if (this.audio?.ready && this.seq.position) {
      const c = this.seq.position.chord;
      const base = 72 + ((c.rootPc - 72) % 12 + 12) % 12;
      this.audio.levelUpChime([base, base + c.intervals[1], base + c.intervals[2], base + 12]);
    }
  }

  // Deal a new set of cards. Screens with no real choice are counted for the sim metrics.
  _deal() {
    this.offers = buildOffers(this, 3);
    const L = this._led();
    for (const o of this.offers) L.offered[o.kind] = (L.offered[o.kind] || 0) + 1;
    this.cardScreens++;
    if (deadScreen(this.offers)) this.deadScreens++;
    return this.offers;
  }

  // A tape's remix cards cannot be rerolled, banished or skipped.
  reroll() {
    if (this.state !== 'levelup' || this.rerolls <= 0 || this.tapeOffers) return null;
    this.rerolls--;
    this.previewOffer(null);
    return this._deal();
  }

  // Banish card i: its sound or pedal never comes back this run (Remix, Fader and bonus cards cannot go).
  // The cards are dealt again, like a reroll.
  banish(i) {
    const key = this.state === 'levelup' && !this.tapeOffers && this.banishes > 0 && this.offers?.[i] ? banKey(this.offers[i]) : null;
    if (!key) return null;
    this.banished.add(key);
    this.banishes--;
    this.previewOffer(null);
    return this._deal();
  }

  // Pass on this level: its notes go to the Drop meter instead.
  skip() {
    if (this.state !== 'levelup' || !this.offers || this.tapeOffers) return;
    this.chargeDrop(DROP.charge * DROP.skip);
    this.choose(-1);
  }

  // i = -1 takes no card (a skip). On a tape's remix cards the pick queues that remix.
  choose(i) {
    if (this.state !== 'levelup' || !this.offers) return;
    const o = this.offers[i];
    if (!o && (i !== -1 || this.tapeOffers)) return;
    this.previewOffer(null);
    if (this.tapeOffers) {
      this._takeRemix(o);
      this.tapeOffers = false;
      this._spendTape();   // another banked tape, if two channels are still ready, deals its cards next
    } else {
      this.pendingLevels--;
      if (o) applyOffer(this, o);
    }
    this.offers = null;
    // Next: the remaining level-ups, then a tape's remix cards, then back to the song.
    if (this.pendingLevels > 0) {
      this._deal();
      this.hooks.onLevelUp?.(this.offers);
      return;
    }
    if (this.tapePick && this._dealTape()) {
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
    // A remix card plays the remix: its pedal opens up on the channel strip.
    const boost = this.loadout.remixBoost();
    if (o?.kind === 'remix') boost[o.role] = o.def.remix.pedal;
    A.applyPedals(this.loadout.pedalLevels(), boost);
    // The mix stays dimmed while a card screen is up, except when auditioning a pedal on the whole band.
    const held = this.state === 'levelup' || this.state === 'paused';
    A.setMuffle(held && !(o && o.pedal));
    if (!o) return;
    if (o.def) {
      const inst = makeInst(o.def, o.level);
      inst.remix = o.kind === 'remix';
      this.seq.preview = { inst };
      A.setPreviewRole(o.def.role);
    } else if (o.pedal) {
      A.applyPedals({ ...this.loadout.pedalLevels(), [o.pedal.id]: o.level }, boost);
    } else if (o.kind === 'fader') {
      // A Fader card lifts its channel out of the dimmed mix (the channel already plays in the vamp).
      A.setPreviewRole(o.role);
    }
  }

  pause() { if (this.state === 'playing') { this._pause('paused'); return true; } return false; }
  unpause() { if (this.state === 'paused') this._resume(); }

  _pause(state) {
    this.state = state;
    this.seq.hold = true;
    // Drop queued notes and beats, but keep song-structure events (section, build, drop, impact, remix) and
    // downbeats: losing one would skip a boss, keep a channel shut, leave the Drop stuck or lose a bar's set
    // pieces (a breather heart, a featured elite's vinyl, an impact ring). The held bar plays on from where the
    // vamp is, never from its downbeat again, so they play out once, on the first frame after resume.
    this.seq.events = this.seq.events.filter((ev) => ev.type !== 'note' && (ev.type !== 'beat' || ev.beat === 0));
    if (this.audio?.ready) this.audio.setMuffle(true);
  }

  _resume() {
    this.state = 'playing';
    this.seq.hold = false;
    if (this.won) this.victoryT = this._stopLeft();   // the ending waited out the pause
    this.seq.preview = null;
    this.preview = null;
    if (this.audio?.ready) { this.audio.setPreviewRole(null); this.audio.applyPedals(this.loadout.pedalLevels(), this.loadout.remixBoost()); this.audio.setMuffle(false); }
    this.hooks.onResume?.();
    const rb = this._remixBanner;   // the gold banner runs 1.9 s: show it again if a card screen covered it
    if (rb && this.time - rb.t < 1.9) this.banner(rb.name, '', false, 'gold');
    this._remixBanner = null;
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
    // A Drop still queued or building would play its build and impact over the end screen: call it off, as _die() does.
    this.seq.dropState = null;
    this.seq.remixAt = null;
    this.dropState = null;
    if (this.audio?.ready) this.audio.setMuffle(true);
    this.hooks.onVictory?.(this.summary(true));
  }

  score() {
    return Math.round((this.kills * 10 + this.time * 5 + this.level * 100 + this.bossesBeaten * 2000 + this.bonusScore + (this.state === 'victory' || (this.won && this.state === 'playing') ? 10000 : 0)) * (1 + 0.1 * this.gain));
  }

  summary(won) {
    const insts = [...this.loadout.instruments()];
    const byId = new Map();
    for (const i of [...insts, ...(this.retired || [])]) {
      const r = byId.get(i.def.id) || { id: i.def.id, name: i.remix ? i.def.remix.name : i.def.name, role: i.def.role, style: i.def.style, level: 0, dmg: 0, kills: 0, active: false };
      r.level = Math.max(r.level, i.level);
      r.dmg += Math.round(i.dmg);
      r.kills += i.kills;
      r.active = r.active || this.loadout.has(i);
      byId.set(i.def.id, r);
    }
    const rows = [...byId.values()];
    const snap = this._snapshot();
    return {
      won, time: this.time, kills: this.kills, level: this.level, score: this.score(),
      genre: this.genre, key: this.key.name, section: this.section.name, bosses: this.bossesBeaten, gain: this.gain,
      bar: this.seq.bar, damageBy: this.damageBy, lastHitBy: this.lastHitBy,
      instruments: rows.sort((a, b) => b.dmg - a.dmg),
      pedals: this.loadout.pedals.map((p) => ({ id: p.def.id, name: p.def.name, level: p.level })),
      remixes: this.remixed.map((id) => ({ id, name: BY_ID[id].name, remix: BY_ID[id].remix.name })),
      sheet: [...this.sheet, snap], keyPc: this.key.pc,
      // What the career's goals read (src/game/progress.js).
      drops: this.drops, perfectDrops: this.perfectDrops, sectionIndex: this.sectionIndex, bossKills: this.bossKills, staggers: this.staggers, peak: this.peak,
      fullBand: this.fullBand, fused: this.fused, maxedAll: this.maxedAll, band: snap.band, pedalLv: snap.pedals,
      songId: this.tune.id, doubleDrops: this.doubleDrops,
    };
  }

  // The band and pedals as they stand: one track sheet entry.
  _snapshot() {
    return {
      index: this.sectionIndex,
      band: this.loadout.instruments().map((i) => [i.def.id, i.level, i.remix ? 1 : 0]),
      pedals: this.loadout.pedals.map((p) => [p.def.id, p.level]),
    };
  }

  _report(where, e) {
    if (this._errs.has(where)) return;
    this._errs.add(where);
    console.error(`[game] ${where} failed:`, e);
  }
}

export { FINALE_BAR };
