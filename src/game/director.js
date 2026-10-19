// Spawns the Noise on the beat. Enemy mix and density follow the song's sections, and each chorus
// opens with a boss on its first downbeat.

import { TAU, rand, rng, pick } from '../util.js';
import { WORLD } from '../config.js';
import { spawnEnemy, randomType } from './enemies.js';

const MIX = {
  intro:   { static: 1 },
  verse1:  { static: 0.72, buzz: 0.28 },
  chorus1: { static: 0.5, buzz: 0.3, hum: 0.2 },
  verse2:  { static: 0.38, buzz: 0.24, hum: 0.16, glitch: 0.22 },
  chorus2: { static: 0.3, buzz: 0.2, hum: 0.14, glitch: 0.14, screech: 0.11, feedback: 0.11 },
  bridge:  { static: 0.24, buzz: 0.14, hum: 0.2, glitch: 0.14, screech: 0.12, feedback: 0.16 },
  build:   { buzz: 0.55, static: 0.25, glitch: 0.2 },
  drop:    { static: 0.25, buzz: 0.2, hum: 0.2, glitch: 0.1, screech: 0.1, feedback: 0.15 },
  finale:  { static: 0.3, buzz: 0.22, hum: 0.18, screech: 0.14, feedback: 0.16 },
};

export class Director {
  constructor(g) { this.g = g; this.reset(); }

  reset() {
    this.eliteTimer = 58;
    this.lastFormationBar = -1;
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
    // While the drums sit out (the Bridge breakdown) the crowd thins and no formations arrive.
    const resting = g.song.position(ev.bar).arr.rest.includes('beat');
    const want = Math.floor(this.target() * (resting ? 0.6 : 1));
    const alive = g.enemies.length;
    if (alive < want) {
      const n = Math.min(want - alive, Math.ceil(3 + want * 0.07));
      const mix = this.mix;
      for (let i = 0; i < n; i++) {
        const s = this.spawnPoint();
        spawnEnemy(g, randomType(mix), s.x, s.y);
      }
    }
    if (!resting && ev.beat === 0 && ev.bar % 8 === 4 && g.time > 35 && ev.bar !== this.lastFormationBar) {
      this.lastFormationBar = ev.bar;
      this.formation();
    }
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
      const s = this.spawnPoint();
      const types = Object.keys(this.mix).filter((k) => k !== 'buzz');
      spawnEnemy(g, types.length ? pick(types) : 'static', s.x, s.y, { elite: true });
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
