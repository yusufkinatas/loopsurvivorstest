// Dropped notes (XP) and rare items. Pickups make no sound of their own, so the music stays clean.

import { rand, dist2, rng, swapRemove } from '../util.js';
import { WORLD } from '../config.js';

export const ITEM_INFO = {
  heal:   { color: '#ff6f8a', r: 9, label: 'Encore' },
  magnet: { color: '#7fd7ff', r: 9, label: 'Magnet' },
  vinyl:  { color: '#ffd166', r: 11, label: 'Vinyl' },
};

export function gemColor(v) {
  return v >= 20 ? '#ffd36e' : v >= 4 ? '#8dffb9' : '#a6e9ff';
}

export function dropGem(g, x, y, value) {
  if (g.gems.length >= WORLD.maxGems) {
    // Fold into an existing far-away gem instead of growing the list.
    const i = Math.floor(rng() * g.gems.length);
    const gm = g.gems[i];
    if (gm.kind === 'xp') { gm.value += value; gm.r = gemR(gm.value); gm.color = gemColor(gm.value); return; }
  }
  g.gems.push({ kind: 'xp', x: x + rand(-4, 4), y: y + rand(-4, 4), value, r: gemR(value), color: gemColor(value), vx: 0, vy: 0, pull: false, age: 0 });
}

function gemR(v) { return v >= 20 ? 7 : v >= 4 ? 5.5 : 4.2; }

export function dropItem(g, x, y, kind) {
  const info = ITEM_INFO[kind];
  g.gems.push({ kind, x, y, value: 0, r: info.r, color: info.color, vx: 0, vy: 0, pull: false, age: 0 });
}

export function magnetAll(g) {
  for (const gm of g.gems) if (gm.kind === 'xp') gm.pull = true;
}

export function updatePickups(g, dt) {
  const p = g.player;
  const radius = g.stats.pickup;
  const r2 = radius * radius;
  for (let i = g.gems.length - 1; i >= 0; i--) {
    const gm = g.gems[i];
    gm.age += dt;
    const d2 = dist2(gm.x, gm.y, p.x, p.y);
    if (!gm.pull && d2 < r2) gm.pull = true;
    if (gm.pull) {
      const d = Math.sqrt(d2) || 1;
      const sp = 380 + gm.age * 20;
      gm.vx += ((p.x - gm.x) / d) * sp * dt * 6;
      gm.vy += ((p.y - gm.y) / d) * sp * dt * 6;
      const v = Math.hypot(gm.vx, gm.vy);
      const max = Math.max(sp, p.speedNow + 120);
      if (v > max) { gm.vx *= max / v; gm.vy *= max / v; }
      gm.x += gm.vx * dt; gm.y += gm.vy * dt;
    }
    const pr = p.r + gm.r + 4;
    if (dist2(gm.x, gm.y, p.x, p.y) < pr * pr) {
      g.collect(gm);
      swapRemove(g.gems, i);
    }
  }
}
