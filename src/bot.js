import { rng } from './util.js';
import { BALANCE } from './config.js';
import { bandMove } from './game/upgrades.js';
import { pedalFits } from './content/pedals.js';

// A simple autopilot for headless balance runs (?sim=1&bot=1) and the attract demo.
// It plays roughly like a careful but ordinary human: a few times a second it tries a handful of
// directions, looks a fraction of a second ahead, and takes the one that keeps it out of enemy shots
// and bodies, stays a safe distance from bosses and out of lit lanes and Snare marks, and still drifts toward
// notes, hearts and vinyl.
// Like a person it reacts late (REACT), only keeps track of the closest few shots (FOCUS), and
// sticks with a decision for a moment (REPLAN), so dense bullet patterns still catch it.

// ?botskill=1 plays like a sharp player instead: it reacts in half the time, rethinks more often and watches
// more shots at once. Balance targets both: the ordinary bot should lose more often than it wins, the skilled one
// should still have to fight for its wins.
const skilled = (() => { try { return String(window.LOOP_SURVIVORS_OPTS?.botskill ?? new URLSearchParams(window.location.search).get('botskill')) === '1'; } catch (e) { return false; } })();
const DIRS = 16;
const HORIZON = 0.6;    // seconds of look-ahead
const REACT = skilled ? 0.15 : 0.3;    // reaction time: a decision takes effect this long after it is made
const REPLAN = skilled ? 0.12 : 0.2;   // how often it rethinks
const FOCUS = skilled ? 9 : 5;         // how many of the nearest shots it can watch at once
const LAG = REACT + 0.08; // until the new heading actually moves the player
// It also plays the band's style rules (g.stats.rules) the way a player would: close to the crowd for the Mosh
// pit, at arm's length for Long throw, standing its ground for In the pocket and dodging harder for a Combo
// streak. ?botrules=0 turns that off and leaves the plain kiting bot, to see how hard the rules are without it.
const RULES_ON = (() => {
  try { return String(window.LOOP_SURVIVORS_OPTS?.botrules ?? new URLSearchParams(window.location.search).get('botrules')) !== '0'; } catch (e) { return true; }
})();

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
  // The style rules it plays (see RULES_ON). On a Combo streak it watches more shots and gives them a wider berth.
  const rules = RULES_ON ? g.stats.rules : null;
  const mosh = rules?.near > 0, kite = rules?.far > 0, plant = rules?.stillHeal > 0, careful = rules?.combo > 0;
  const nearR = g.nearR(), farR = g.farR();   // the rules' reach as the game reads it
  const focus = careful ? FOCUS + 3 : FOCUS, berth = careful ? 30 : 14, missW = careful ? 2.2 : 1.2, shotW = careful ? 1.4 : 1;

  // What it is watching: the closest shots that can reach it within the horizon, enemies close enough to touch.
  let shots = [];
  for (const s of g.shots) {
    const dx = s.x - p.x, dy = s.y - p.y;
    const reach = Math.hypot(s.vx, s.vy) * HORIZON + speed * HORIZON + 30;
    const d2 = dx * dx + dy * dy;
    if (d2 < reach * reach) shots.push([d2, s]);
  }
  if (shots.length > focus) { shots.sort((a, b) => a[0] - b[0]); shots.length = focus; }
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

  // Snare marks that can land on it: it treats them like lit lanes and does not end a move inside one.
  const marks = [];
  for (const h of g.hazards || []) {
    const dx = h.x - p.x, dy = h.y - p.y, reach = h.r + speed * HORIZON + 40;
    if (dx * dx + dy * dy < reach * reach) marks.push(h);
  }

  // Something to walk toward when it is safe: hearts when hurt, vinyl, magnets, else the nearest notes.
  let goal = null, goalW = 0;
  for (const gm of g.gems) {
    if (gm.pull) continue;   // already flying to us
    const d = Math.hypot(gm.x - p.x, gm.y - p.y);
    let w;
    if (gm.kind === 'heal') w = hurt < 0.75 ? 3 : 0.3;
    else if (gm.kind === 'tape') w = 4;   // a Master Tape: worth walking into the fight for
    else if (gm.kind === 'vinyl') w = 2.5;
    else if (gm.kind === 'magnet') w = 1.6;
    else w = 1.1;
    const lim = gm.kind === 'xp' ? 420 : gm.kind === 'tape' ? 1000 : 700;
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

  // The crowd the distance rules read: the nearest 60 enemies within 420 px.
  let crowdNear = null, closeNow = 0;
  if (mosh || kite || plant) {
    const arr = [];
    for (const e of g.enemies) {
      if (e.dead || e.boss) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d2 = dx * dx + dy * dy;
      if (d2 < 420 * 420) arr.push([d2, e]);
    }
    if (arr.length > 60) { arr.sort((a, b) => a[0] - b[0]); arr.length = 60; }
    crowdNear = arr.map((x) => x[1]);
    for (const e of crowdNear) if (Math.hypot(e.x - p.x, e.y - p.y) - e.r < nearR) closeNow++;
  }
  // How close it walks in before it stops closing on the nearest enemy.
  const approach = mosh ? 110 : kite ? 280 : 170;
  const pvx = p.vx, pvy = p.vy;
  // In the pocket stands still only with nothing close, off every Snare mark (standing still is where a mark
  // lands), and with nothing it wants to fetch: a heart while hurt, a tape, vinyl or notes close by.
  const stillX = p.x + pvx * LAG, stillY = p.y + pvy * LAG;   // where standing still ends up
  const onMark = marks.some((h) => Math.hypot(stillX - h.x, stillY - h.y) < h.r + p.r + 6);
  const wantGoal = !!goal && (goal.kind === 'heal' ? hurt < 0.75 : goalW > 0.5);
  const planting = plant && closeNow === 0 && !onMark && !wantGoal;

  let best = null, bestScore = Infinity;
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
        else if (d2 < (R + berth) * (R + berth)) cost += missW;   // too close for comfort
      }
      if (hitT >= 0) cost += 14 * shotW * (1.4 - hitT / HORIZON);
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

    // Deeper in a mark costs more, so stepping toward its edge always beats staying in its middle.
    for (const h of marks) {
      const d = Math.hypot(endX - h.x, endY - h.y), R = h.r + p.r + 6;
      if (d < R) cost += 4 + 6 * (1 - d / R);
    }
    // The style rules: Mosh pit wants bodies inside its reach, Long throw wants them outside its circle, and
    // In the pocket stands still when nothing is close (shots and bodies still cost more than it pays).
    if (crowdNear && (mosh || kite)) {
      let inNear = 0, inFar = 0;
      for (const e of crowdNear) {
        const gap = Math.hypot(e.x - endX, e.y - endY) - e.r;
        if (gap < nearR) inNear++;
        if (gap < farR) inFar++;
      }
      if (mosh) cost -= 0.1 * Math.min(inNear, 10);
      if (kite) cost += 0.08 * Math.min(inFar, 12);
    }
    if (planting && k === DIRS) cost -= 0.9;

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
    } else if (nearE && nearD > approach) {
      const d1 = Math.hypot(nearE.x - endX, nearE.y - endY);
      cost -= (mosh ? 0.8 : 0.5) * (nearD - d1) / (speed * HORIZON);
    } else if (!nearE) {
      // Drift in a lazy circle so the bot does not stand still.
      const a = g.time * 0.35;
      cost -= 0.3 * (ux * Math.cos(a) + uy * Math.sin(a));
    }
    // Keep moving: standing still in a crowd is how you get cornered (unless planting with nothing close).
    if (k === DIRS && crowd > 6 && !planting) cost += 0.4;
    // A little inertia so the bot does not jitter between equal choices.
    const vl = Math.hypot(pvx, pvy);
    if (vl > 1 && k !== DIRS) cost -= 0.35 * (ux * pvx + uy * pvy) / vl;

    if (cost < bestScore) { bestScore = cost; best = [ux, uy]; }
  }
  return { x: best[0], y: best[1] };
}

// The channels a focused build deepens first: the highest levels (ties: the most damage), best first.
function focus(g) {
  return g.loadout.instruments().slice().sort((a, b) => b.level - a.level || b.dmg - a.dmg);
}

// Card choice for autopilot runs. 'smart' fills the band toward the styles it plays (rule tiers and crossovers
// first), then plays a focused build: once four channels are filled, level cards on its two highest channels come
// first (the third next), and a banked Master Tape pulls the card that brings a channel to its level. 'random' is
// uniform. A tape's remix cards (all 'remix'): the channel with the most damage, counting the Signature where its
// pedal is already on the board.
export function autopick(offers, g, mode = 'smart') {
  if (offers.length && offers.every((o) => o.kind === 'remix')) {
    const worth = (o) => (o.inst?.dmg || 0) * (o.inst && g.loadout.pedal(o.inst.def.remix.pedal) ? BALANCE.remix.sig : 1);
    let best = 0;
    offers.forEach((o, i) => { if (worth(o) > worth(offers[best])) best = i; });
    return mode === 'random' ? Math.floor(rng() * offers.length) : best;
  }
  if (mode === 'random') return Math.floor(rng() * offers.length);
  if (mode === 'first') return 0;
  const top = g.loadout.filled() >= 4 ? focus(g) : null;
  const counts = g.loadout.styleCounts();
  let best = 0, bs = -Infinity;
  offers.forEach((o, i) => {
    let s = 0;
    switch (o.kind) {
      case 'new': s = 6 + (g.loadout.filled() < 3 ? 2 : 0) + 0.5 * counts[o.def.style] + (bandMove(counts, o.def.style) > 0 ? 1 : 0); break;
      case 'up': {
        const rank = top ? top.indexOf(o.inst) : -1;
        s = !top ? 4 + o.level * 0.6 : rank >= 0 && rank < 2 ? 7.5 + o.level * 0.3 : rank === 2 ? 6.2 : 3 + o.level * 0.2;
        if (o.level >= BALANCE.remix.minLevel && g.tapes?.banked > 0) s = 9.5;   // a banked Master Tape is waiting for this level
        break;
      }
      case 'swap': {
        const m = bandMove(counts, o.def.style, o.from.def.style);
        s = m > 0 ? 5.5 : m < 0 || counts[o.def.style] < counts[o.from.def.style] ? 0.5 : 2.5;
        break;
      }
      case 'pedal-new':
      case 'pedal-up': {
        // By the band's sounds it powers (pedals.js fits), more for a remix partner (a remixed channel or one a tape
        // can remix: a Signature). Compressor and Auto-Wah power the player, not a sound: flat, partner aside.
        const band = g.loadout.instruments();
        const lit = band.filter((i) => pedalFits(o.pedal, i)).length;
        const partner = band.some((i) => i.def.remix.pedal === o.pedal.id && (i.remix || i.level >= BALANCE.remix.minLevel));
        if (o.kind === 'pedal-up') s = lit >= 2 || partner ? 3.2 : o.pedal.fits ? 1.5 : 2.8;
        else s = (o.pedal.fits ? 2.6 + 0.35 * lit : 2.8) + (partner ? 2 : 0);
        break;
      }
      case 'remix': s = 9; break;
      case 'fader': { const rank = (top || focus(g)).indexOf(o.inst); s = rank >= 0 && rank < 2 ? 5.5 : 3; break; }
      default: s = 0.5;
    }
    s += rng() * 0.8;
    if (s > bs) { bs = s; best = i; }
  });
  return best;
}
