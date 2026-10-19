// localStorage wrappers. Storage can be missing or throw (private mode, sandboxed frames), so every
// access is guarded and the game works without it.

import { normalizeMeta } from './game/progress.js';

const KEY = 'loop-survivors:v1';

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

// True when the data was stored. Nothing on screen may claim a save that did not happen.
function write(data) {
  try { window.localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
}

export const DEFAULT_SETTINGS = { volume: 0.8, damageNumbers: true, shake: true, flashes: true, chimes: true };

export function loadSettings() {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const base = { ...DEFAULT_SETTINGS, shake: !reduced, flashes: !reduced };
  return { ...base, ...(read().settings || {}) };
}

export function saveSettings(s) { const d = read(); d.settings = s; write(d); }

export function loadBest() { return read().best || null; }

// Returns true when this run is the new best and was stored. A finished song ranks above any run that
// did not finish, then the score decides.
export function saveBest(sum) {
  const d = read();
  const prev = d.best;
  if (prev && (!!prev.won > !!sum.won || (!!prev.won === !!sum.won && prev.score >= sum.score))) return false;
  d.best = { score: sum.score, time: sum.time, kills: sum.kills, level: sum.level, won: sum.won, section: sum.section, bar: sum.bar, genre: sum.genre, gain: sum.gain };
  return write(d);
}

// The career (src/game/progress.js). saveMeta returns false when the device did not keep it.
export function loadMeta() { return normalizeMeta(read().meta); }

export function saveMeta(meta) { const d = read(); d.meta = meta; return write(d); }
