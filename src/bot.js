import { rng } from './util.js';

// A simple autopilot for headless balance runs (?sim=1&bot=1) and the attract demo.
// It kites away from nearby threats and drifts toward notes when it is safe.

export function botMove(g) {
  const p = g.player;
  let fx = 0, fy = 0;
  let danger = 0;
  let near = null, nd = Infinity;
  for (const e of g.enemies) {
    if (e.dead) continue;
    const dx = p.x - e.x, dy = p.y - e.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < nd) { nd = d2; near = e; }
    const reach = (e.boss ? 230 : 105) + e.r * 2;
    if (d2 > reach * reach) continue;
    const d = Math.sqrt(d2) || 1;
    const w = (e.boss ? 5 : e.elite ? 2.5 : 1) * Math.pow(Math.max(0, reach - d) / reach, 2);
    fx += (dx / d) * w; fy += (dy / d) * w;
    danger += w;
  }
  for (const s of g.shots) {
    const dx = p.x - s.x, dy = p.y - s.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 150) continue;
    // Step sideways out of the bullet's path.
    const vx = s.vx, vy = s.vy, vl = Math.hypot(vx, vy) || 1;
    const side = Math.sign((dx * vy - dy * vx) / vl) || 1;
    const w = 2.2 * (150 - d) / 150;
    fx += (-vy / vl) * side * w; fy += (vx / vl) * side * w;
    danger += w;
  }
  if (danger < 1.2) {
    let best = null, bd = 380 * 380;
    for (const gm of g.gems) {
      const d2 = (gm.x - p.x) ** 2 + (gm.y - p.y) ** 2;
      if (d2 < bd) { bd = d2; best = gm; }
    }
    if (best) {
      const d = Math.sqrt(bd) || 1;
      const w = best.kind === 'xp' ? 0.7 : 1.4;
      fx += ((best.x - p.x) / d) * w; fy += ((best.y - p.y) / d) * w;
    } else if (near && nd > 150 * 150) {
      // Nothing to collect: close in so short-range instruments get to play.
      const d = Math.sqrt(nd);
      fx += ((near.x - p.x) / d) * 0.6; fy += ((near.y - p.y) / d) * 0.6;
    } else {
      // Circle lazily so the bot does not stand still.
      const a = g.time * 0.35;
      fx += Math.cos(a) * 0.35; fy += Math.sin(a) * 0.35;
    }
  }
  const l = Math.hypot(fx, fy);
  if (l < 0.05) return { x: 0, y: 0 };
  return { x: fx / l, y: fy / l };
}

// Card choice for autopilot runs. 'smart' fills the band, then levels it; 'random' is uniform.
export function autopick(offers, g, mode = 'smart') {
  if (mode === 'random') return Math.floor(rng() * offers.length);
  if (mode === 'first') return 0;
  let best = 0, bs = -Infinity;
  offers.forEach((o, i) => {
    let s = 0;
    switch (o.kind) {
      case 'new': s = 6 + (g.loadout.filled() < 3 ? 2 : 0); break;
      case 'up': s = 4 + o.level * 0.6; break;
      case 'swap': {
        const c = g.loadout.styleCounts();
        s = c[o.def.style] >= c[o.from.def.style] ? 2.5 : 0.5;
        break;
      }
      case 'pedal-new': s = 3.5; break;
      case 'pedal-up': s = 3.2; break;
      default: s = 0.5;
    }
    s += rng() * 0.8;
    if (s > bs) { bs = s; best = i; }
  });
  return best;
}
