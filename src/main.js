// Boot: wires audio, sequencer, game, renderer, HUD and screens together and runs the frame loop.
//
// Test hooks (query string, local only): ?sim=1 runs without audio on a simulated clock.
// Also: speed=N (sim steps per frame), bot=1, autopick=smart|random|first, god=1, seed=N,
// start=<instrumentId>, give=id:level,id:level, pedals=id:level, remix=id,id (remix given instruments),
// minutes=N (stop the sim), render=0, key=N.

import { AudioEngine } from './audio/engine.js';
import { Sequencer } from './music/sequencer.js';
import { Song, SECTIONS } from './music/song.js';
import { playSheet } from './music/replay.js';
import { KEYS } from './music/theory.js';
import { Game } from './game/game.js';
import { makeInst } from './game/loadout.js';
import { Renderer } from './render/renderer.js';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { Input } from './input.js';
import { botMove, autopick } from './bot.js';
import { loadSettings, saveSettings, loadBest, saveBest, loadMeta, saveMeta } from './storage.js';
import { applyRun, unlockedStarts } from './game/progress.js';
import { BY_ID, byRole, INSTRUMENTS } from './content/instruments/index.js';

function parseOpts() {
  let q;
  try { q = new URLSearchParams(window.location.search); } catch (e) { q = new URLSearchParams(''); }
  const extra = window.LOOP_SURVIVORS_OPTS || {};
  const get = (k) => (extra[k] !== undefined ? String(extra[k]) : q.get(k));
  const list = (s) => (s ? s.split(',').filter(Boolean).map((x) => { const [id, lv] = x.split(':'); return { id, level: Number(lv) || 1 }; }) : []);
  return {
    sim: get('sim') === '1',
    speed: Math.max(1, Number(get('speed')) || 1),
    bot: get('bot') === '1',
    autopick: get('autopick') || (get('sim') === '1' ? 'smart' : null),
    god: get('god') === '1',
    seed: get('seed') !== null ? Number(get('seed')) : undefined,
    start: get('start'),
    give: list(get('give')),
    givePedals: list(get('pedals')),
    remix: (get('remix') || '').split(',').filter(Boolean),
    minutes: Number(get('minutes')) || 0,
    render: get('render') !== '0',
    key: get('key') !== null ? Number(get('key')) : undefined,
    density: get('density') !== null ? Number(get('density')) : 1,
    debug: get('debug') === '1',
    solo: get('solo') === '1',
    realpick: get('realpick') === '1',   // sim: level-ups go through the real pause path
    chaos: get('chaos') === '1',         // sim: pause and resume at random moments; with realpick, also reroll, banish and skip
  };
}

const opts = parseOpts();
const settings = loadSettings();

const audio = new AudioEngine();
audio.volume = settings.volume;
const clock = opts.sim ? { sim: true, t: 0, now() { return this.t; } } : { sim: false, now: () => audio.now() };
const seq = new Sequencer(clock, audio);

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const hudRoot = document.getElementById('hud');
const screensRoot = document.getElementById('screens');
const stickEl = document.getElementById('stick');

let mode = 'title';        // title | lobby | run
let lobbyKey = 0;
let lastStart = null;
let lastEnd = null;        // the end screen's arguments, for Back from the Discography

const hooks = {
  onLevelUp: (offers) => { hud.hideBanner(); screens.levelUp(game, offers); },
  onResume: () => { screens.hide(); input.releaseStick(); },
  onGameOver: (sum) => endRun(sum),
  onVictory: (sum) => endRun(sum),
  onBanner: (t, s, compact) => hud.showBanner(t, s, compact),
  onBoss: (e) => hud.setBoss(e),
  onLoadout: () => { if (mode === 'run') hud.refreshLoadout(game); },
  onDrop: (state) => { if (state === 'queued') hud.tip(''); },
  autopick: (offers) => autopick(offers, game, opts.autopick),
};

const game = new Game({ audio, clock, seq, opts: { ...opts, autopick: opts.sim && !opts.realpick ? opts.autopick : null }, settings, hooks });

const hud = new Hud(hudRoot, {
  onDrop: () => game.requestDrop(),
  onPause: () => pauseRun(),
});

const screens = new Screens(screensRoot, {
  onPlay: () => enterLobby(),
  onShowTitle: () => showTitle(),
  onShowPause: () => screens.pause(game),
  onPickStart: (id) => startRun(id),
  onPreviewStart: (id) => previewStart(id),
  onChoose: (i) => {
    const c = seq.position?.chord;
    audio.uiBlip(c ? 440 * Math.pow(2, (84 + ((c.rootPc + c.intervals[2]) % 12) - 69) / 12) : 660, 0.12);   // the chord's fifth
    game.choose(i);
  },
  onPreview: (i) => game.previewOffer(i === null ? null : game.offers?.[i] ?? null),
  onReroll: () => { const o = game.reroll(); if (o) screens.levelUp(game, o); },
  onBanish: (i) => { const o = game.banish(i); if (o) screens.levelUp(game, o); },
  onSkip: () => skipLevel(),
  onResume: () => { game.unpause(); screens.hide(); },
  onQuit: () => { recordRun(game.summary(false)); showTitle(); },
  onDiscography: (back) => screens.discography(loadMeta(), back),
  onShowEnd: () => screens.end(...lastEnd),
  onPlayTrack: (sheet, keyPc, onSection, onEnd) => playTrack(sheet, keyPc, onSection, onEnd),
  onStopTrack: () => stopTrack(),
  onRestart: () => enterLobby(),
  onSettings: (s) => applySettings(s),
  getSettings: () => settings,
});

const input = new Input(canvas, stickEl, onKey);

function applySettings(s) {
  Object.assign(settings, s);
  Object.assign(game.settings, s);
  audio.setVolume(settings.volume);
  saveSettings(settings);
}

// Three starting sounds from three different channels and styles, so the first pick already
// points the run toward a genre.
function startOptions() {
  const want = [['kick808', 'beat'], ['upright', 'bass'], ['squarelead', 'lead']];
  const out = [];
  for (const [id, role] of want) {
    const def = BY_ID[id] || byRole(role)[0];
    if (def && !out.includes(def)) out.push(def);
  }
  if (out.length < 3) for (const d of Object.values(BY_ID)) if (out.length < 3 && !out.includes(d)) out.push(d);
  return out;
}

function showTitle() {
  mode = 'title';
  seq.stop();
  game.state = 'idle';
  hudRoot.hidden = true;
  if (audio.ready) { audio.setMuffle(false); audio.setPreviewRole(null); }
  screens.title(loadBest(), loadMeta());
}

// The radio edit of a track sheet (src/music/replay.js), from the end screen or a Discography sleeve. One plays
// at a time. Screens stop it whenever they change, and so does hiding the page. onEnd runs however it stops.
let track = null;
let trackId = 0;
async function playTrack(sheet, keyPc, onSection, onEnd) {
  stopTrack();
  const id = trackId;
  audio.init();
  await audio.resume();
  if (id !== trackId) { onEnd(); return; }   // stopped while the audio woke up
  audio.setVolume(settings.volume);
  if (audio.ready) { audio.setMuffle(false); audio.setPreviewRole(null); }
  track = { player: playSheet({ seq, audio, sheet, keyPc, onSection, onEnd: () => stopTrack() }), onEnd };
}

function stopTrack() {
  trackId++;
  const t = track;
  track = null;
  if (t) { t.player.stop(); t.onEnd(); }
}

async function enterLobby() {
  audio.init();
  await audio.resume();
  audio.setVolume(settings.volume);
  mode = 'lobby';
  game.state = 'idle';
  hudRoot.hidden = true;
  lobbyKey = opts.key ?? Math.floor(Math.random() * KEYS.length);
  seq.reset(new Song(KEYS[lobbyKey].pc));
  seq.getInstruments = () => [];
  if (audio.ready) { audio.applyPedals({}); audio.setActiveCount(1); audio.setMuffle(false); audio.setPreviewRole(null); }
  seq.start(clock.now() + 0.08);
  const featured = startOptions();
  const open = unlockedStarts(loadMeta());
  screens.select(featured, INSTRUMENTS.filter((d) => open.includes(d.id) && !featured.includes(d)));
}

function previewStart(id) {
  seq.preview = id && BY_ID[id] ? { inst: makeInst(BY_ID[id], 1) } : null;
}

function startRun(id) {
  lastStart = id;
  mode = 'run';
  screens.hide();
  hudRoot.hidden = false;
  game.newRun({ start: id, keyIndex: lobbyKey, seed: opts.seed });
  hud.refreshLoadout(game);
  hud.setBoss(null);
  dropTipShown = false;
  hud.tip(`${byDevice('Drag anywhere to move.', 'Move with the left stick.', 'Move with WASD or the arrow keys.')} Your sounds attack on their own.`, 7);
}

let dropTipShown = false;
// Prompts in the words of the device used last (touch, gamepad, or keyboard and mouse).
const byDevice = (touch, pad, keys) => (input.device === 'touch' ? touch : input.device === 'pad' ? pad : keys);
function tips() {
  if (!dropTipShown && game.state === 'playing' && game.dropCharge >= game.dropMax && !game.dropState) {
    dropTipShown = true;
    hud.tip(`The Drop is ready. ${byDevice('Tap the Drop meter.', 'Press A.', 'Press Space.')}`, 6);
  }
}

function pauseRun() {
  if (mode !== 'run') return;
  if (game.pause()) screens.pause(game);
}

function endRun(sum) {
  const prevBest = loadBest();
  const best = saveBest(sum);
  hud.setBoss(null);
  const news = recordRun(sum);
  lastEnd = [sum, best, prevBest, news];
  screens.end(...lastEnd);
  // Something new for the career: the level-up chime in the key the run ended in.
  if (news?.saved && (news.goals.length || news.record || news.remixes.length) && audio.ready) {
    const root = 72 + ((sum.keyPc + (SECTIONS[sum.sectionIndex]?.lift || 0)) % 12);
    audio.levelUpChime([root, root + 3, root + 7, root + 12]);
  }
  if (opts.sim) window.__LS.done = true;
}

// Fold a finished (or quit) run into the career: goals, records, the remix crate and Gain. Returns what is
// new, with saved = false when the device did not keep it. Sims never read or write the career.
function recordRun(sum) {
  if (opts.sim) return null;
  const meta = loadMeta();
  const news = applyRun(meta, sum, { now: Date.now() });
  news.saved = saveMeta(meta);
  return news;
}

// Skip a level-up: a lower blip (the chord's root) than a pick, and the notes go to the Drop meter.
function skipLevel() {
  const c = seq.position?.chord;
  audio.uiBlip(c ? 440 * Math.pow(2, (72 + (c.rootPc % 12) - 69) / 12) : 523, 0.12);
  game.skip();
}

// Keys that only move focus: they work on a level-up before it arms, everything else waits.
const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'pad-left', 'pad-right', 'pad-up', 'pad-down']);

function onKey(k) {
  if (k === 'm') { audio.setMuted(!audio.muted); return true; }
  // Space and E are the Drop keys: on menus they must never press a focused button by accident.
  if (screens.current && screens.current !== 'title' && (k === ' ' || k === 'e')) return true;
  // Escape and B leave banish mode. B is no other level-up action, so it never banishes or skips.
  if (screens.current === 'levelup' && screens.banishing && (k === 'Escape' || k === 'pad-b')) { screens.toggleBanish(false); return true; }
  // B is Back (or Resume) on every screen that has one. Escape too on the Discography.
  if (screens.current && (k === 'pad-b' || (k === 'Escape' && screens.current === 'disco'))) { screensRoot.querySelector('[data-act=back], [data-act=resume]')?.click(); return true; }
  if (screens.current === 'title' && k === 'Enter' && !(document.activeElement instanceof HTMLButtonElement)) { enterLobby(); return true; }
  if (screens.current === 'levelup' || screens.current === 'select') {
    if (!screens.armed() && !NAV_KEYS.has(k)) return true;
    if (k === 'r' && screens.current === 'levelup') { const o = game.reroll(); if (o) screens.levelUp(game, o); return true; }
    if (k === 'x' && screens.current === 'levelup') { screens.toggleBanish(); return true; }
    if (k === 'q' && screens.current === 'levelup') { skipLevel(); return true; }
    if (k === 'pad-a') {
      // A presses what has focus: a card or a button under the cards. With nothing focused it only focuses card 1.
      const a = document.activeElement;
      if (a && a !== document.body && screensRoot.contains(a)) a.click(); else screens.cards?.[0]?.focus();
      return true;
    }
    if (k === 'pad-left') return screens.cardKey('ArrowLeft');
    if (k === 'pad-right') return screens.cardKey('ArrowRight');
    if (k === 'pad-up') return screens.cardKey('ArrowUp');
    if (k === 'pad-down') return screens.cardKey('ArrowDown');
    return screens.cardKey(k);
  }
  // Other menus (title, pause, settings, end): the pad steps through buttons and inputs, A presses the focused
  // one (a checkbox toggles), and left and right move a focused slider in steps of 5.
  if (screens.current && (k === 'pad-left' || k === 'pad-right' || k === 'pad-up' || k === 'pad-down' || k === 'pad-a')) {
    const els = [...screensRoot.querySelectorAll('button:not([disabled]), input')];
    const a = document.activeElement;
    const i = els.indexOf(a);
    if (k === 'pad-a') { (i >= 0 ? a : els[0])?.click(); return true; }
    if (i >= 0 && a.type === 'range' && (k === 'pad-left' || k === 'pad-right')) {
      a.value = Number(a.value) + (k === 'pad-right' ? 5 : -5);
      a.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    const n = els.length;
    if (n) els[i < 0 ? 0 : (i + (k === 'pad-right' || k === 'pad-down' ? 1 : -1) + n) % n].focus();
    return true;
  }
  if (mode === 'run' && game.state === 'playing') {
    if (k === ' ' || k === 'pad-a' || k === 'e') { game.requestDrop(); return true; }
    if (k === 'Escape' || k === 'p') { pauseRun(); return true; }
  } else if (mode === 'run' && game.state === 'paused' && (k === 'Escape' || k === 'p') && screens.current === 'pause') {
    game.unpause(); screens.hide(); return true;
  }
  return false;
}

document.addEventListener('visibilitychange', () => {
  if (opts.sim) return;
  if (document.hidden) {
    if (mode === 'run' && game.state === 'playing') pauseRun();
    stopTrack();
    audio.suspend();
  } else if (mode !== 'title') {
    audio.resume();
  }
});

// ---------------------------------------------------------------------------- frame loop

const scratch = [];
let last = performance.now();
let fpsAvg = 60;

function frame(ts) {
  requestAnimationFrame(frame);
  let dt = (ts - last) / 1000;
  last = ts;
  if (!(dt > 0)) dt = 1 / 60;
  fpsAvg = fpsAvg * 0.95 + (1 / dt) * 0.05;
  dt = Math.min(dt, 0.05);
  input.pollPad();

  if (opts.sim) {
    simFrame();
  } else {
    seq.tick();
    if (mode === 'run') {
      game.view = renderer.viewSize();
      if (opts.bot) botDrop();
      const mv = opts.bot ? botMove(game) : input.move();
      game.step(dt, mv);
      // After a run ends the band keeps playing; its note events are no longer attacks.
      // (While paused the sequencer is held and emits nothing, and structural events must survive.)
      if (game.state === 'gameover' || game.state === 'victory') { seq.drain(clock.now(), scratch); scratch.length = 0; }
    } else {
      seq.drain(clock.now() + 1, scratch); scratch.length = 0;
    }
  }

  if (mode === 'run' && game.player) {
    if (!opts.sim) tips();
    renderer.draw(game, dt);
    hud.update(game, clock.now() - (opts.sim ? 0 : audio.latency), seq);
  } else {
    renderer.drawAttract(dt, mode === 'lobby' ? pulseFromSeq() : 0.3 + 0.3 * Math.sin(ts / 500));
  }
}

// Autopilot uses the Drop when the meter is full and a crowd (or a boss) is close, or once it has sat full a while.
let dropFullSince = null;
function botDrop() {
  if (game.state !== 'playing' || game.dropCharge < game.dropMax || game.dropState) { dropFullSince = null; return; }
  if (dropFullSince === null || dropFullSince > game.time) dropFullSince = game.time;
  const p = game.player;
  if (game.boss || game.inRadius(p.x, p.y, 320).length >= 12 || game.time - dropFullSince > 10) game.requestDrop();
}

function pulseFromSeq() {
  const cur = seq.sounding(clock.now());
  if (!cur) return 0;
  return cur.sib % 4 === 0 ? 1 : 0.4;
}

// ---------------------------------------------------------------------------- headless sim

const samples = [];
let nextSample = 0;
let errors = 0;
const origErr = console.error.bind(console);
console.error = (...a) => { errors++; origErr(...a); };
window.addEventListener('error', () => { errors++; });

let pausedFor = 0;
function simFrame() {
  if (mode !== 'run') return;
  if (window.__LS.done) return;
  const step = 1 / 60;
  for (let i = 0; i < opts.speed; i++) {
    clock.t += step;
    seq.tick();
    game.view = { w: 1280, h: 720 };
    if (opts.bot) botDrop();
    game.step(step, opts.bot ? botMove(game) : { x: 0, y: 0 });
    if (game.time >= nextSample) {
      nextSample += 10;
      samples.push(snapshot());
    }
    if (opts.chaos && game.state === 'playing' && Math.random() < 0.004) { game.pause(); pausedFor = 1 + Math.floor(Math.random() * 30); }
    if (game.state === 'paused') { if (--pausedFor <= 0) game.unpause(); continue; }
    if (game.state !== 'playing' && game.state !== 'dying') {
      if (game.state === 'levelup') {
        // chaos: now and then skip the level, or banish or reroll first (the calls the buttons make). It only
        // banishes sounds and pedals you do not have, so the run still reaches the late game.
        const r = opts.chaos ? Math.random() : 1;
        const spare = game.offers.findIndex((o) => o.kind === 'new' || o.kind === 'swap' || o.kind === 'pedal-new');
        if (r < 0.05) game.skip();
        else if ((r < 0.1 && spare >= 0 && game.banish(spare)) || (r < 0.15 && game.reroll())) continue;
        else game.choose(autopick(game.offers, game, opts.autopick || 'smart'));
      } else { window.__LS.done = true; break; }
    }
    if (opts.minutes && game.time >= opts.minutes * 60) { window.__LS.done = true; break; }
  }
}

function snapshot() {
  return {
    t: Math.round(game.time), level: game.level, kills: game.kills, hp: Math.round(game.player.hp),
    maxHp: Math.round(game.player.maxHp), enemies: game.enemies.length, bullets: game.fx.bullets.length,
    filled: game.loadout.filled(), section: game.section.id, boss: game.boss ? game.boss.type : null,
    bossHp: game.boss ? Math.round(game.boss.hp) : null,
  };
}

window.__LS = {
  game, seq, audio, opts, done: false,
  metrics() {
    return {
      state: game.state, time: game.time, level: game.level, kills: game.kills, score: game.player ? game.score() : 0,
      damageTaken: game.damageTaken, drops: game.drops, bossesAlive: game.boss ? game.boss.type : null,
      damageBy: game.damageBy, lastHitBy: game.lastHitBy, bossLog: game.bossLog,
      // What the career's goals read.
      bossKills: game.bossKills, staggers: game.staggers, peak: game.peak, fullBand: game.fullBand, fused: game.fused, maxedAll: game.maxedAll,
      bossesSpawned: game.bossesSpawned, sectionIndex: game.sectionIndex, cap: game.channelCap(), dropState: game.dropState,
      hp: game.player?.hp, section: game.section?.id, bosses: game.bossesBeaten, errors, fps: Math.round(fpsAvg),
      genre: game.genre, key: game.key?.name,
      // Remixes taken (ids, in order) and card screens with no real choice (only bonus cards or level-losing swaps).
      remixes: game.remixed || [], deadScreens: game.deadScreens || 0, cardScreens: game.cardScreens || 0,
      loadout: game.loadout ? game.loadout.instruments().map((i) => ({ id: i.def.id, level: i.level, dmg: Math.round(i.dmg), kills: i.kills, notes: i.notes })) : [],
      retired: (game.retired || []).map((i) => ({ id: i.def.id, level: i.level, dmg: Math.round(i.dmg) })),
      pedals: game.loadout ? game.loadout.pedals.map((p) => ({ id: p.def.id, level: p.level })) : [],
      samples,
    };
  },
};

// ---------------------------------------------------------------------------- go

if (opts.sim) {
  mode = 'run';
  hudRoot.hidden = false;
  screens.hide();
  game.newRun({ start: opts.start || 'kick808', keyIndex: opts.key, seed: opts.seed ?? 1 });
  hud.refreshLoadout(game);
} else {
  showTitle();
}
setInterval(() => { if (!opts.sim) seq.tick(); }, 40);
requestAnimationFrame(frame);
