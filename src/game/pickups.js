// Dropped notes (XP) and rare items. Collecting one rings a chime on the beat grid, in key (Sequencer.ping).
// Notes left on the floor fade after 8 bars.

import { rand, dist2, rng, swapRemove } from '../util.js';
import { WORLD, BALANCE, BEAT_SEC } from '../config.js';

// A heart is pink-white, far from the danger red of everything that hurts you.
export const ITEM_INFO = {
  heal:   { color: '#ffc6de', r: 9, label: 'Breather' },
  magnet: { color: '#7fd7ff', r: 9, label: 'Magnet' },
  vinyl:  { color: '#ffd166', r: 11, label: 'Vinyl' },
  tape:   { color: '#ffd166', r: 15, label: 'Master Tape' },   // a silenced boss's remix (BALANCE.remix)
};

// Notes are warm white to gold: a color no channel uses, so pickups never read as attacks.
export function gemColor(v) {
  return v >= 20 ? '#ffd36e' : v >= 4 ? '#ffe7a3' : '#f3e7c4';
}

// Many notes on the floor merge into fewer, bigger ones. From `from` notes lying around, a new note joins the
// nearest one within `r` px (up to `rMax` px when the floor holds `full` notes) that is younger than `young` s and
// not flying to you. The total value stays the same, and the merged note sits at the value-weighted middle of its
// notes with their value-weighted age, so the floor's value keeps where it lay and how long it has left before it
// fades (the 8-bar rule) on average. Deterministic: no random numbers.
const MERGE = { from: 36, full: 160, r: 40, rMax: 90, young: 4 * BEAT_SEC };

export function dropGem(g, x, y, value) {
  if (g.gems.length >= WORLD.maxGems) {
    // Fold into an existing note instead of growing the list.
    for (let k = 0; k < 8; k++) {
      const gm = g.gems[Math.floor(rng() * g.gems.length)];
      if (gm.kind === 'xp') { addTo(gm, value, 1); return; }
    }
  }
  const nx = x + rand(-4, 4), ny = y + rand(-4, 4);
  const n = g.gems.length;
  if (n >= MERGE.from) {
    const R = MERGE.r + (MERGE.rMax - MERGE.r) * Math.min(1, (n - MERGE.from) / (MERGE.full - MERGE.from));
    let best = null, bd = R * R;
    for (const gm of g.gems) {
      if (gm.kind !== 'xp' || gm.pull || gm.age > MERGE.young) continue;
      const d = dist2(gm.x, gm.y, nx, ny);
      if (d < bd) { bd = d; best = gm; }
    }
    if (best) {
      const k = value / (best.value + value);
      best.x += (nx - best.x) * k; best.y += (ny - best.y) * k;
      best.age -= best.age * k;   // the new note's age is 0
      addTo(best, value, 1);
      return;
    }
  }
  g.gems.push({ kind: 'xp', x: nx, y: ny, value, n: 1, r: gemR(value, 1), color: gemColor(value), vx: 0, vy: 0, pull: false, age: 0 });
}

// n: how many notes a note holds; a merged note grows with it, so a pile reads as a pile.
function addTo(gm, value, n) {
  gm.value += value;
  gm.n = (gm.n || 1) + n;
  gm.r = gemR(gm.value, gm.n);
  gm.color = gemColor(gm.value);
}

function gemR(v, n = 1) { return (v >= 20 ? 7 : v >= 4 ? 5.5 : 4.2) * Math.min(1.8, 1 + 0.2 * Math.log2(n)); }

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
  const tapeR = Math.min(radius, BALANCE.remix.tapeReach);
  for (let i = g.gems.length - 1; i >= 0; i--) {
    const gm = g.gems[i];
    gm.age += dt;
    // A note left on the floor fades after BALANCE.notes.life (the renderer blinks it first). Pulled notes
    // (a magnet, a silenced boss) always arrive.
    if (gm.kind === 'xp' && !gm.pull && gm.age > BALANCE.notes.life) {
      const L = g._led?.();
      if (L) L.faded += gm.value;
      swapRemove(g.gems, i);
      continue;
    }
    // A Master Tape lies 8 bars where its boss fell, and only reaches you from close by: you go and get it.
    if (gm.kind === 'tape' && !gm.pull && gm.age > BALANCE.remix.tapeLife) {
      g.tapeLost?.(gm);
      swapRemove(g.gems, i);
      continue;
    }
    const d2 = dist2(gm.x, gm.y, p.x, p.y);
    if (!gm.pull && d2 < (gm.kind === 'tape' ? tapeR * tapeR : r2)) gm.pull = true;
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
