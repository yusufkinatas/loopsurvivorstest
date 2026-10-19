import { rng } from './util.js';

// A simple autopilot for headless balance runs (?sim=1&bot=1) and the attract demo.
// It plays roughly like a careful but ordinary human: a few times a second it tries a handful of
// directions, looks a fraction of a second ahead, and takes the one that keeps it out of enemy shots
// and bodies, stays a safe distance from bosses, and still drifts toward notes, hearts and vinyl.
// Like a person it reacts late (REACT), only keeps track of the closest few shots (FOCUS), and
// sticks with a decision for a moment (REPLAN), so dense bullet patterns still catch it.

const DIRS = 16;
const HORIZON = 0.6;    // seconds of look-ahead
const REACT = 0.3;      // reaction time: a decision takes effect this long after it is made
const REPLAN = 0.2;     // how often it rethinks
const FOCUS = 5;        // how many of the nearest shots it can watch at once
const LAG = REACT + 0.08; // until the new heading actually moves the player

// Closest approach of two points moving linearly, relative offset r0 and relative velocity w, over [0, T].
function closest(rx, ry, wx, wy, T) {
  const ww = wx * wx + wy * wy;
  let t = ww > 1e-6 ? -(rx * wx + ry * wy) / ww : 0;
  t = t < 0 ? 0 : t > T ? T : t;
  const x = rx + wx * t, y = ry + wy * t;
  return [x * x + y * y, t];
}

const bots = new WeakMap();

export function botMove(g) {
  let b = bots.get(g);
  if (!b || g.time < b.t) { b = { t: g.time, next: 0, queue: [], dir: { x: 0, y: 0 } }; bots.set(g, b); }
  b.t = g.time;
  if (g.time >= b.next) {
    b.next = g.time + REPLAN;
    b.queue.push({ at: g.time + REACT, dir: plan(g) });
  }
  while (b.queue.length && b.queue[0].at <= g.time) b.dir = b.queue.shift().dir;
  return b.dir;
}

function plan(g) {
  const p = g.player;
  const speed = g.stats.speed;
  const hurt = p.hp / p.maxHp;

  // What it is watching: the closest shots that can reach it within the horizon, enemies close enough to touch.
  let shots = [];
  for (const s of g.shots) {
    const dx = s.x - p.x, dy = s.y - p.y;
    const reach = Math.hypot(s.vx, s.vy) * HORIZON + speed * HORIZON + 30;
    const d2 = dx * dx + dy * dy;
    if (d2 < reach * reach) shots.push([d2, s]);
  }
  if (shots.length > FOCUS) { shots.sort((a, b) => a[0] - b[0]); shots.length = FOCUS; }
  shots = shots.map((x) => x[1]);
  const foes = [];
  let crowd = 0;
  for (const e of g.enemies) {
    if (e.dead) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const d2 = dx * dx + dy * dy;
    const near = e.boss ? 1e5 : (e.ai.chargeWarn || e.ai.charge > 0) ? 480 : 260;   // a lit lane reaches far
    if (d2 < near * near) foes.push(e);
    if (!e.boss && d2 < 220 * 220) crowd++;
  }

  // Something to walk toward when it is safe: hearts when hurt, vinyl, magnets, else the nearest notes.
  let goal = null, goalW = 0;
  for (const gm of g.gems) {
    if (gm.pull) continue;   // already flying to us
    const d = Math.hypot(gm.x - p.x, gm.y - p.y);
    let w;
    if (gm.kind === 'heal') w = hurt < 0.75 ? 3 : 0.3;
    else if (gm.kind === 'vinyl') w = 2.5;
    else if (gm.kind === 'magnet') w = 1.6;
    else w = 1.1;
    const lim = gm.kind === 'xp' ? 420 : 700;
    if (d > lim) continue;
    const s = w / (1 + d / 160);
    if (s > goalW) { goalW = s; goal = gm; }
  }
  // The Drop is ready: head for the thickest crowd to use it on, like a player saving it for the right moment.
  const pack = [];
  if (g.dropCharge >= g.dropMax && !g.dropState && !g.boss) {
    for (const e of g.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      if (dx * dx + dy * dy < 700 * 700) pack.push(e);
    }
    if (pack.length >= 25) goal = null;
  }
  // A boss that has drifted out of reach: go back and fight it.
  if (g.boss && !g.boss.dead) {
    const bd = Math.hypot(g.boss.x - p.x, g.boss.y - p.y);
    if (bd > 360 + g.boss.r) { goal = g.boss; goalW = 2; }
  }
  // With nothing to collect it closes in on the nearest enemy, so close-range sounds still connect.
  let nearE = null, nearD = Infinity;
  for (const e of foes) {
    if (e.boss) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < nearD) { nearD = d; nearE = e; }
  }

  let best = null, bestScore = Infinity;
  const pvx = p.vx, pvy = p.vy;
  for (let k = 0; k <= DIRS; k++) {
    const ux = k === DIRS ? 0 : Math.cos((k / DIRS) * Math.PI * 2);
    const uy = k === DIRS ? 0 : Math.sin((k / DIRS) * Math.PI * 2);
    const vx = ux * speed, vy = uy * speed;
    // Two legs: current velocity for LAG seconds, then the new heading.
    const mx = p.x + pvx * LAG, my = p.y + pvy * LAG;
    const endX = mx + vx * (HORIZON - LAG), endY = my + vy * (HORIZON - LAG);
    let cost = 0;

    for (const s of shots) {
      const R = s.r + p.r + 2;
      // Leg 1
      let [d2, t] = closest(p.x - s.x, p.y - s.y, pvx - s.vx, pvy - s.vy, LAG);
      let hitT = d2 < R * R ? t : -1;
      if (hitT < 0) {
        const sx = s.x + s.vx * LAG, sy = s.y + s.vy * LAG;
        [d2, t] = closest(mx - sx, my - sy, vx - s.vx, vy - s.vy, HORIZON - LAG);
        if (d2 < R * R) hitT = LAG + t;
        else if (d2 < (R + 14) * (R + 14)) cost += 1.2;   // too close for comfort
      }
      if (hitT >= 0) cost += 14 * (1.4 - hitT / HORIZON);
    }

    for (const e of foes) {
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      let evx, evy;
      if (e.ai.charge > 0) { const sp = e.ai.chargeSpeed ?? e.speed * 3.4; evx = Math.cos(e.ai.chargeA) * sp; evy = Math.sin(e.ai.chargeA) * sp; }
      else if (e.stun > 0 || (e.def.charger && e.ai.chargeWarn)) { evx = 0; evy = 0; }   // stunned, or planted on its lane
      else { const sp = e.speed * (1 - e.slow); evx = (dx / d) * sp; evy = (dy / d) * sp; }
      const R = e.r + p.r + 2;
      const [d2, t] = closest(p.x - e.x, p.y - e.y, (endX - p.x) / HORIZON - evx, (endY - p.y) / HORIZON - evy, HORIZON);
      if (d2 < R * R) cost += (e.boss ? 30 : 6 + e.dmg * 0.5) * (1.4 - t / HORIZON);
      // Where we end up relative to this enemy.
      const ex = e.x + evx * HORIZON, ey = e.y + evy * HORIZON;
      const de = Math.hypot(endX - ex, endY - ey);
      if (e.boss) {
        // Bosses: stay out of reach, but not so far that the band stops hitting them.
        const want = 130 + e.r, reach = 260 + e.r;
        if (de < want) cost += 4 * ((want - de) / 120) ** 2;
        else if (de > reach) cost += Math.min(2, (de - reach) / 150);   // but stay close enough to keep hitting it
        // The Glitch King shows where it will blink to: do not stand there.
        const bt = e.ai.blinkTo;
        if (bt) {
          const db = Math.hypot(endX - bt.x, endY - bt.y);
          if (db < want) cost += 5 * ((want - db) / 120) ** 2;
        }
      } else {
        // A lit Stomp lane: do not end up standing in it.
        const cw = e.ai.chargeWarn;
        if (cw) {
          const lx = Math.cos(cw.a), ly = Math.sin(cw.a);
          const ax = endX - e.x, ay = endY - e.y;
          const along = ax * lx + ay * ly, side = Math.abs(ax * ly - ay * lx);
          if (along > -e.r && along < cw.len + p.r && side < e.r + p.r + 8) cost += 6 + e.dmg * 0.4;
        }
        const room = de - e.r - p.r;
        if (room < 60) cost += (e.elite ? 1.2 : 0.3) * ((60 - room) / 60) ** 2;
      }
    }

    if (pack.length >= 25) {
      // Count who would be within the Drop's trigger range from where this heading leads.
      const fx = p.x + ux * 220, fy = p.y + uy * 220;
      let n = 0;
      for (const e of pack) { const dx = e.x - fx, dy = e.y - fy; if (dx * dx + dy * dy < 320 * 320) n++; }
      cost -= 0.06 * Math.min(n, 40);
    }
    // Goals pull, but a shot or a body in the way always costs more than a note is worth.
    if (goal) {
      const d0 = Math.hypot(goal.x - p.x, goal.y - p.y);
      const d1 = Math.hypot(goal.x - endX, goal.y - endY);
      cost -= goalW * 1.6 * (d0 - d1) / (speed * HORIZON);
    } else if (nearE && nearD > 170) {
      const d1 = Math.hypot(nearE.x - endX, nearE.y - endY);
      cost -= 0.5 * (nearD - d1) / (speed * HORIZON);
    } else if (!nearE) {
      // Drift in a lazy circle so the bot does not stand still.
      const a = g.time * 0.35;
      cost -= 0.3 * (ux * Math.cos(a) + uy * Math.sin(a));
    }
    // Keep moving: standing still in a crowd is how you get cornered.
    if (k === DIRS && crowd > 6) cost += 0.4;
    // A little inertia so the bot does not jitter between equal choices.
    const vl = Math.hypot(pvx, pvy);
    if (vl > 1 && k !== DIRS) cost -= 0.35 * (ux * pvx + uy * pvy) / vl;

    if (cost < bestScore) { bestScore = cost; best = [ux, uy]; }
  }
  return { x: best[0], y: best[1] };
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
