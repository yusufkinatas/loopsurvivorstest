// Spawns the Noise on the beat. Enemy mix and density follow the song's sections, and each chorus
// opens with a boss on its first downbeat.

import { TAU, rand, rng, pick } from '../util.js';
import { WORLD } from '../config.js';
import { spawnEnemy, randomType } from './enemies.js';

const MIX = {
  intro:   { static: 1 },
  verse1:  { static: 0.68, buzz: 0.27, stomp: 0.05 },
  chorus1: { static: 0.48, buzz: 0.28, hum: 0.19, stomp: 0.05 },
  verse2:  { static: 0.34, buzz: 0.22, hum: 0.15, glitch: 0.21, stomp: 0.08 },
  chorus2: { static: 0.28, buzz: 0.19, hum: 0.13, glitch: 0.13, screech: 0.11, feedback: 0.11, stomp: 0.05 },
  bridge:  { static: 0.22, buzz: 0.13, hum: 0.19, glitch: 0.13, screech: 0.11, feedback: 0.15, stomp: 0.07 },
  build:   { buzz: 0.52, static: 0.23, glitch: 0.19, stomp: 0.06 },
  drop:    { static: 0.24, buzz: 0.19, hum: 0.19, glitch: 0.1, screech: 0.1, feedback: 0.14, stomp: 0.04 },
  finale:  { static: 0.3, buzz: 0.22, hum: 0.18, screech: 0.14, feedback: 0.16 },
};

export class Director {
  constructor(g) { this.g = g; this.reset(); }

  reset() {
    this.eliteTimer = 58;
    this.lastFormationBar = -1;
    this.ringBar = -1;       // the bar the Stomp ring lights its lanes on (enemiesOnBeat reads it)
  }

  get mix() { return MIX[this.g.section.id] || MIX.finale; }

  // How many enemies should be around right now.
  target() {
    const t = this.g.time;
    const m = t / 60;
    let n = 12 + t * 0.5 + m * m * 3.4;
    if (this.g.section.id === 'build') n *= 1.25;
    if (this.g.boss) n *= this.g.boss.def.final ? 0.55 : 0.7;
    return Math.min(WORLD.maxEnemies, Math.floor(n * (this.g.opts.density ?? 1)));
  }

  spawnPoint(extra = 0) {
    const g = this.g, p = g.player;
    const a = rand(0, TAU);
    const d = Math.hypot(g.view.w, g.view.h) / 2 + WORLD.spawnMargin + extra + rand(0, 60);
    return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, a };
  }

  onBeat(ev) {
    const g = this.g;
    const want = this.target();
    const alive = g.enemies.length;
    if (alive < want) {
      const n = Math.min(want - alive, Math.ceil(3 + want * 0.07));
      const mix = this.mix;
      for (let i = 0; i < n; i++) {
        const s = this.spawnPoint();
        spawnEnemy(g, randomType(mix), s.x, s.y);
      }
    }
    if (ev.beat === 0 && ev.bar % 8 === 4 && g.time > 35 && ev.bar !== this.lastFormationBar) {
      this.lastFormationBar = ev.bar;
      this.formation();
    }
    // Featured elites walk in on the 16-bar downbeats of the quiet stretches between bosses, each with a vinyl.
    if (ev.beat === 0 && ev.bar % 16 === 0 && (g.section.id === 'verse2' || g.section.id === 'bridge')) this.spawnElite();
    // Set piece: on beat 3 of the Build-Up's last bar a ring of Stomps appears around you, lights its lanes on
    // beat 4 and slams in on the downbeat where the song drops (a Drop timed for that downbeat clears it).
    // Once only: a resume can replay beat 3.
    if (ev.beat === 2 && g.section.build && ev.bar !== this.ringBar && g.song.position(ev.bar).barsLeft === 1) this.stompRing(ev.bar);
  }

  // Set pieces: an encircling ring, or a swarm charging from one side.
  formation() {
    const g = this.g, p = g.player;
    const m = g.time / 60;
    const kind = pick(m < 2 ? ['ring', 'swarm'] : ['ring', 'swarm', 'swarm', 'wall']);
    if (kind === 'ring') {
      const n = Math.min(40, Math.floor(14 + m * 4));
      const d = Math.hypot(g.view.w, g.view.h) / 2 + 40;
      const type = m > 3.5 && rng() < 0.4 ? 'hum' : 'static';
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        spawnEnemy(g, type, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, { hpMul: type === 'hum' ? 0.6 : 1 });
      }
    } else if (kind === 'swarm') {
      const n = Math.min(36, Math.floor(12 + m * 3.5));
      const s = this.spawnPoint(40);
      for (let i = 0; i < n; i++) spawnEnemy(g, 'buzz', s.x + rand(-60, 60), s.y + rand(-60, 60));
    } else {
      const s = this.spawnPoint(20);
      const tx = -Math.sin(s.a), ty = Math.cos(s.a);
      const n = Math.min(30, Math.floor(10 + m * 3));
      for (let i = 0; i < n; i++) {
        const o = (i - n / 2) * 26;
        spawnEnemy(g, m > 4 ? 'feedback' : 'static', s.x + tx * o, s.y + ty * o);
      }
    }
  }

  stompRing(bar) {
    const g = this.g, p = g.player;
    const n = 10, R = Math.min(g.view.w, g.view.h) / 2 - 80;   // well inside the view on every screen
    this.ringBar = bar;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const e = spawnEnemy(g, 'stomp', p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, { hpMul: 1.5 });
      if (e) e.ai.ring = true;
    }
  }

  // An elite from the section's mix: a big gold-outlined body that drops a vinyl (one level-up).
  spawnElite() {
    const s = this.spawnPoint();
    const types = Object.keys(this.mix).filter((k) => k !== 'buzz');
    spawnEnemy(this.g, types.length ? pick(types) : 'static', s.x, s.y, { elite: true });
  }

  onSection(ev) {
    const sec = ev.section;
    if (sec.boss) {
      const s = this.spawnPoint(-40);
      spawnEnemy(this.g, sec.boss, s.x, s.y);
    }
  }

  update(dt) {
    const g = this.g;
    this.eliteTimer -= dt;
    if (this.eliteTimer <= 0) {
      this.eliteTimer = Math.max(28, 52 - g.time / 25);
      this.spawnElite();
    }
    // Recycle stragglers left far behind so the density stays around the player.
    const p = g.player;
    const far = 1300 + Math.hypot(g.view.w, g.view.h) / 2;
    for (const e of g.enemies) {
      if (e.dead || e.boss) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      if (dx * dx + dy * dy > far * far) {
        const s = this.spawnPoint();
        e.x = s.x; e.y = s.y;
      }
    }
  }
}
