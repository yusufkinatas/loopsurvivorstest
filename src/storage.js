// localStorage wrappers. Storage can be missing or throw (private mode, sandboxed frames), so every
// access is guarded and the game works without it.

const KEY = 'loop-survivors:v1';

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
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
  const base = { ...DEFAULT_SETTINGS, shake: !reduced, flashes: !reduced };
  return { ...base, ...(read().settings || {}) };
}

export function saveSettings(s) { const d = read(); d.settings = s; write(d); }

export function loadBest() { return read().best || null; }

// Returns true when this run is the new best (by score).
export function saveBest(sum) {
  const d = read();
  const prev = d.best;
  if (prev && prev.score >= sum.score) return false;
  d.best = { score: sum.score, time: sum.time, kills: sum.kills, level: sum.level, won: sum.won, section: sum.section, bar: sum.bar, genre: sum.genre };
  write(d);
  return true;
}
