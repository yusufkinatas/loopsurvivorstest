// Boot: wires audio, sequencer, game, renderer, HUD and screens together and runs the frame loop.
//
// Test hooks (query string, local only): ?sim=1 runs without audio on a simulated clock.
// Also: speed=N (sim steps per frame), bot=1, autopick=smart|random|first, god=1, seed=N,
// start=<instrumentId>, give=id:level,id:level, pedals=id:level, minutes=N (stop the sim), render=0, key=N.

import { AudioEngine } from './audio/engine.js';
import { Sequencer } from './music/sequencer.js';
import { Song } from './music/song.js';
import { KEYS } from './music/theory.js';
import { Game } from './game/game.js';
import { makeInst } from './game/loadout.js';
import { Renderer } from './render/renderer.js';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { Input } from './input.js';
import { botMove, autopick } from './bot.js';
import { loadSettings, saveSettings, loadBest, saveBest } from './storage.js';
import { BY_ID, byRole } from './content/instruments/index.js';

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
    minutes: Number(get('minutes')) || 0,
    render: get('render') !== '0',
    key: get('key') !== null ? Number(get('key')) : undefined,
    density: get('density') !== null ? Number(get('density')) : 1,
    debug: get('debug') === '1',
    solo: get('solo') === '1',
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
let listening = false;

const hooks = {
  onLevelUp: (offers) => screens.levelUp(game, offers),
  onResume: () => { screens.hide(); input.releaseStick(); },
  onGameOver: (sum) => endRun(sum),
  onVictory: (sum) => endRun(sum),
  onBanner: (t, s) => hud.showBanner(t, s),
  onBoss: (e) => hud.setBoss(e),
  onLoadout: () => { if (mode === 'run') hud.refreshLoadout(game); },
  onDrop: () => {},
  autopick: (offers) => autopick(offers, game, opts.autopick),
};

const game = new Game({ audio, clock, seq, opts: { ...opts, autopick: opts.sim ? opts.autopick : null }, settings, hooks });

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
  onChoose: (i) => { audio.uiBlip(660, 0.12); game.choose(i); },
  onPreview: (i) => game.previewOffer(i === null ? null : game.offers?.[i] ?? null),
  onReroll: () => { const o = game.reroll(); if (o) screens.levelUp(game, o); },
  onResume: () => { game.unpause(); screens.hide(); },
  onQuit: () => showTitle(),
  onListen: (on) => { listening = on; audio.setMuffle(!on); },
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
  listening = false;
  if (audio.ready) { audio.setMuffle(false); audio.setPreviewRole(null); }
  screens.title(loadBest());
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
  screens.select(startOptions());
}

function previewStart(id) {
  seq.preview = id && BY_ID[id] ? { inst: makeInst(BY_ID[id], 1) } : null;
}

function startRun(id) {
  lastStart = id;
  mode = 'run';
  screens.hide();
  hudRoot.hidden = false;
  listening = false;
  game.newRun({ start: id, keyIndex: lobbyKey, seed: opts.seed });
  hud.refreshLoadout(game);
  hud.setBoss(null);
}

function pauseRun() {
  if (mode !== 'run') return;
  if (game.pause()) screens.pause(game);
}

function endRun(sum) {
  const best = saveBest(sum);
  hud.setBoss(null);
  screens.end(sum, best);
  if (opts.sim) window.__LS.done = true;
}

function onKey(k) {
  if (screens.current === 'levelup' || screens.current === 'select') {
    if (k === 'r' && screens.current === 'levelup') { const o = game.reroll(); if (o) screens.levelUp(game, o); return true; }
    if (k === 'pad-a' && screens.cards?.[screens.focus]) { screens.onPick(screens.focus); return true; }
    return screens.cardKey(k);
  }
  if (mode === 'run' && game.state === 'playing') {
    if (k === ' ' || k === 'pad-a' || k === 'e') { game.requestDrop(); return true; }
    if (k === 'Escape' || k === 'p') { pauseRun(); return true; }
  } else if (mode === 'run' && game.state === 'paused' && (k === 'Escape' || k === 'p') && screens.current === 'pause') {
    game.unpause(); screens.hide(); return true;
  } else if (screens.current === 'title' && (k === 'Enter' || k === 'pad-a')) {
    enterLobby(); return true;
  } else if (k === 'm') {
    audio.setMuted(!audio.muted); return true;
  }
  return false;
}

document.addEventListener('visibilitychange', () => {
  if (opts.sim) return;
  if (document.hidden) {
    if (mode === 'run' && game.state === 'playing') pauseRun();
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
      const mv = opts.bot ? botMove(game) : input.move();
      game.step(dt, mv);
      // Anything the sequencer emitted while the run is not playing is stale.
      if (game.state !== 'playing' && game.state !== 'idle') { seq.drain(clock.now(), scratch); scratch.length = 0; }
    } else {
      seq.drain(clock.now() + 1, scratch); scratch.length = 0;
    }
  }

  if (mode === 'run' && game.player) {
    renderer.draw(game, dt);
    hud.update(game, clock.now() - (opts.sim ? 0 : audio.latency), seq);
  } else {
    renderer.drawAttract(dt, mode === 'lobby' ? pulseFromSeq() : 0.3 + 0.3 * Math.sin(ts / 500));
  }
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

function simFrame() {
  if (mode !== 'run') return;
  if (window.__LS.done) return;
  const step = 1 / 60;
  for (let i = 0; i < opts.speed; i++) {
    clock.t += step;
    seq.tick();
    game.view = { w: 1280, h: 720 };
    game.step(step, opts.bot ? botMove(game) : { x: 0, y: 0 });
    if (game.time >= nextSample) {
      nextSample += 10;
      samples.push(snapshot());
    }
    if (game.state !== 'playing') {
      if (game.state === 'levelup') game.choose(autopick(game.offers, game, opts.autopick || 'smart'));
      else { window.__LS.done = true; break; }
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
      hp: game.player?.hp, section: game.section?.id, bosses: game.bossesBeaten, errors, fps: Math.round(fpsAvg),
      genre: game.genre, key: game.key?.name,
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
