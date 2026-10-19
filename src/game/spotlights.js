// Optional stages turn movement into a wager: hold your ground for a permanent remix,
// or leave the reward behind and preserve your health. All timers use active game time.
import { rand, TAU } from '../util.js';
import { spawnEnemy } from './enemies.js';

export function resetSpotlights(g) {
  g.spotlight = null;
  g.nextSpotlight = 12;
  g.spotlightsCleared = 0;
  g.spotlightsMissed = 0;
}

function openSpotlight(g) {
  const p = g.player;
  const angle = Math.atan2(p.faceY, p.faceX) + rand(-0.7, 0.7);
  g.spotlight = {
    x: p.x + Math.cos(angle) * 270, y: p.y + Math.sin(angle) * 270,
    r: 105, progress: 0, required: 6, remaining: 32,
    entered: false, inside: false, guardTimer: 0, waves: 0,
  };
  g.banner(g.remixes.length < 3 ? 'Spotlight live · hold the stage to earn a remix' : 'Spotlight live · hold for an upgrade + healing', '', true);
}

function reinforce(g, stage) {
  if (stage.waves >= 3) return;
  stage.waves++;
  const density = Math.max(0, g.opts.density ?? 1);
  const n = Math.min(10, Math.ceil((4 + g.time / 65) * density));
  // A long tell and generous ring leave room to dodge inside the objective.
  const offset = rand(0, TAU);
  const guards = g.time > 180 ? ['hum', 'glitch', 'screech', 'buzz']
    : g.time > 90 ? ['static', 'buzz', 'screech'] : ['static', 'buzz', 'static'];
  for (let i = 0; i < n; i++) {
    const a = offset + i / n * TAU;
    const type = guards[i % guards.length];
    const e = spawnEnemy(g, type, stage.x + Math.cos(a) * 250, stage.y + Math.sin(a) * 250);
    e.spawnT = 0.8;
  }
}

export function updateSpotlights(g, dt) {
  if (g.state !== 'playing' || g.won) return;
  if (!g.spotlight) {
    if (g.time >= g.nextSpotlight) openSpotlight(g);
    return;
  }
  const s = g.spotlight;
  const activeDt = Math.min(dt, s.remaining);
  s.remaining = Math.max(0, s.remaining - dt);
  s.inside = Math.hypot(g.player.x - s.x, g.player.y - s.y) <= s.r;
  if (s.inside) {
    s.entered = true;
    s.progress = Math.min(s.required, s.progress + activeDt);
    s.guardTimer -= activeDt;
    if (s.guardTimer <= 0) { reinforce(g, s); s.guardTimer = 2.4; }
  }
  if (s.progress >= s.required - 1e-8) {
    g.spotlightsCleared++;
    g.dropCharge = Math.min(g.dropMax, g.dropCharge + 80);
    g.bonusScore += 300;
    if (!g.opts.solo) {
      if (g.remixes.length < 3) g.pendingRemixes++;
      else {
        g.pendingLevels++;
        g.player.hp = Math.min(g.player.maxHp, g.player.hp + g.player.maxHp * 0.2);
      }
    }
    g.fx.ring({ x: s.x, y: s.y, r0: 15, r1: 180, dur: 0.55, damage: 0, color: '#d8fa75', width: 5 });
    g.fx.text(s.x, s.y - 35, 'STAGE CLAIMED · +80 DROP', '#d8fa75', 16);
    g.spotlight = null;
    g.nextSpotlight = g.time + 36;
  } else if (s.remaining <= 0) {
    g.spotlightsMissed++;
    g.spotlight = null;
    g.nextSpotlight = g.time + 16;
    g.banner('Spotlight faded · another chance soon', '', true);
  }
}
