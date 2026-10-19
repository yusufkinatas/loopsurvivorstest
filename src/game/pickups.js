// Dropped notes (XP) and rare items. Collecting one rings a chime on the beat grid, in key (Sequencer.ping).

import { rand, dist2, rng, swapRemove } from '../util.js';
import { WORLD } from '../config.js';

export const ITEM_INFO = {
  heal:   { color: '#ff6f8a', r: 9, label: 'Encore' },
  magnet: { color: '#7fd7ff', r: 9, label: 'Magnet' },
  vinyl:  { color: '#ffd166', r: 11, label: 'Vinyl' },
};

// Notes are warm white to gold: a color no channel uses, so pickups never read as attacks.
export function gemColor(v) {
  return v >= 20 ? '#ffd36e' : v >= 4 ? '#ffe7a3' : '#f3e7c4';
}

export function dropGem(g, x, y, value) {
  if (g.gems.length >= WORLD.maxGems) {
    // Fold into an existing note instead of growing the list.
    for (let k = 0; k < 8; k++) {
      const gm = g.gems[Math.floor(rng() * g.gems.length)];
      if (gm.kind === 'xp') { gm.value += value; gm.r = gemR(gm.value); gm.color = gemColor(gm.value); return; }
    }
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
      // Fly straight at the player, accelerating. Steering straight in (instead of by force) means a
      // pulled note can never fall into an orbit around the player.
      gm.pullT = (gm.pullT || 0) + dt;
      const d = Math.sqrt(dist2(gm.x, gm.y, p.x, p.y)) || 1;
      const sp = Math.min(1600, Math.max(320 + gm.pullT * 1100, p.speedNow + 180));
      const step = Math.min(d, sp * dt);
      gm.x += ((p.x - gm.x) / d) * step;
      gm.y += ((p.y - gm.y) / d) * step;
    }
    const pr = p.r + gm.r + 4;
    if (dist2(gm.x, gm.y, p.x, p.y) < pr * pr) {
      g.collect(gm);
      swapRemove(g.gems, i);
    }
  }
}
