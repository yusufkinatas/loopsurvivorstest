// localStorage wrappers. Storage can be missing or throw (private mode, sandboxed frames), so every
// access is guarded and the game works without it.

import { emptyCareer, updateCareer, RECORDS } from './game/records.js';

const KEY = 'loop-survivors:v1';

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch (e) {
    return {};
  }
}

function write(data) {
  try { window.localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
}

export const DEFAULT_SETTINGS = { volume: 0.8, damageNumbers: true, shake: true, flashes: true };

export function loadSettings() {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const base = { ...DEFAULT_SETTINGS, shake: !reduced, flashes: !reduced, motion: !reduced };
  return { ...base, ...(read().settings || {}) };
}

export function saveSettings(s) { const d = read(); d.settings = s; write(d); }

export function loadBest() { return read().best || null; }

export function loadCareer() {
  const saved = read().career || {};
  const career = emptyCareer();
  for (const key of ['runs', 'wins', 'kills', 'bestCombo', 'perfectDashes']) {
    if (Number.isFinite(saved[key]) && saved[key] >= 0) career[key] = Math.floor(saved[key]);
  }
  if (Array.isArray(saved.discovered)) career.discovered = [...new Set(saved.discovered.filter((id) => typeof id === 'string'))];
  if (Array.isArray(saved.records)) career.records = [...new Set(saved.records.filter((id) => RECORDS.some((r) => r.id === id)))];
  return career;
}

export function recordRun(sum) {
  const result = updateCareer(loadCareer(), sum);
  const data = read();
  data.career = result.career;
  write(data);
  return result;
}

// Returns true when this run is the new best (by score).
export function saveBest(sum) {
  const d = read();
  const prev = d.best;
  if (prev && prev.score >= sum.score) return false;
  d.best = { score: sum.score, time: sum.time, kills: sum.kills, level: sum.level, won: sum.won, section: sum.section, genre: sum.genre };
  write(d);
  return true;
}
