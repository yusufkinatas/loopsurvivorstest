// Canvas renderer. The arena is a dark stage floor whose grid pulses with the beat and whose
// color follows the song section.
//
// The visual rule: ENEMY = a solid dark body with a light neutral outline, its type told by its silhouette, never by
// a hue; threats (Screech, Snare, Stomp, hunting elites) carry one danger-red eye, elites a gold outline. DANGER = hot
// red-orange: every enemy shot, Snare mark, lane and arrival ring, drawn last (on top of everything) and never with
// 'lighter'; a shot has a white-hot core, a dark rim and a size floor. MINE = channel colors: the player's attacks are
// drawn under the enemies, in normal blending, faded by a load budget (fxAlpha) when the screen is busy, each in its
// instrument's look (src/render/looks.js: the style decides the form, the channel the hue, the sound its signature).
// PICKUPS are small and quiet: cream notes, pink-white hearts, gold tapes.

import { TAU, clamp, lerp, rgba, hexToRgb } from '../util.js';
import { BEAT_SEC, BALANCE } from '../config.js';
import { ROLE_INFO, ROLES, STYLES } from '../config.js';
import { ITEM_INFO } from '../game/pickups.js';
import { DANGER } from '../game/enemies.js';
import { CHEMISTRY, RULES } from '../game/loadout.js';
import * as looks from './looks.js';

// rule -> the color of the style it belongs to, for the floor tells.
const RULE_COLOR = Object.fromEntries(Object.entries(CHEMISTRY).map(([st, c]) => [c.rule, STYLES[st].color]));

const BODY = '#272134';          // an enemy's body: a dark slate, a step above the floor so it reads as solid
const BODY_HIT = '#6c6582';      // ...for a moment after a hit (with a white outline)
const EDGE = '#d6d1e2';          // its outline: a light neutral grey
const MARK = 'rgba(214,209,226,0.42)';   // the quiet marks inside a body
const ELITE = '#ffd166';         // an elite's outline
const EYE = '#ff3a1c';           // a threat's eye: the danger accent
const HOT = '#fff3de';           // the white-hot core of an enemy shot
const RIM = 'rgba(20,4,2,0.92)'; // the dark rim around it
const BOSS_BODY = '#0d0a14';
// Silhouettes in draw order: big slow bodies under the small fast ones.
const SHAPES = ['hex', 'stomp', 'ring', 'square', 'glitch', 'snare', 'diamond', 'tri'];
// An enemy shot is a teardrop: a round head and a tail TAIL radii long behind it (TH: where the tail meets the head).
// Its dark rim is the same teardrop RIM_K times bigger, with a slightly longer tail.
const TAIL = 2.3, TH = Math.acos(1 / TAIL);
const RIM_K = 1.38, RIM_TAIL = (TAIL + 0.6) / RIM_K, RIM_TH = Math.acos(1 / RIM_TAIL);

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.glow = new Map();
    this.cam = { x: 0, y: 0 };
    this.hue = 248;
    this.time = 0;
    this.scale = 1;
    this.zoom = 1;               // the Drop camera, on top of scale (see draw)
    this.waveAt = -Infinity;     // when the last section wave started
    this.dim = 0;                // the arena dims in quiet phrases (0.25) and flashes back on an impact (< 0)
    // The load budget: how busy the screen is (0 calm .. 1 packed, smoothed) and the alpha the player's own attacks
    // are drawn at (1 down to 0.55). draw() sets globalAlpha = fxAlpha before each attack function; one that sets its
    // own alpha multiplies it by this.fxAlpha. Particles, kill pops and damage numbers thin out with the load too.
    this.load = 0;
    this.fxAlpha = 1;
    this.nEnemies = 0;           // enemies in view this frame
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.dpr = dpr;
    this.w = w; this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    // Zoom so small screens still see a fair slice of the arena.
    this.scale = clamp(Math.sqrt(w * h) / 1000, 0.62, 1.18);
  }

  viewSize() { return { w: this.w / this.scale, h: this.h / this.scale }; }

  glowSprite(color) {
    let s = this.glow.get(color);
    if (s) return s;
    const size = 64;
    s = document.createElement('canvas');
    s.width = s.height = size;
    const c = s.getContext('2d');
    const gr = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, rgba(color, 0.9));
    gr.addColorStop(0.25, rgba(color, 0.45));
    gr.addColorStop(1, rgba(color, 0));
    c.fillStyle = gr;
    c.fillRect(0, 0, size, size);
    this.glow.set(color, s);
    return s;
  }

  drawGlow(x, y, r, color, a = 1) {
    const s = this.glowSprite(color);
    const c = this.ctx;
    const prev = c.globalAlpha;
    c.globalAlpha = prev * a;
    c.drawImage(s, x - r, y - r, r * 2, r * 2);
    c.globalAlpha = prev;
  }

  // Light tint of a channel color, for projectile cores (pure white cores sum into confetti).
  tint(color) {
    let t = this._tints?.get(color);
    if (t) return t;
    (this._tints ||= new Map());
    const [r, g, b] = hexToRgb(color);
    const m = (v) => Math.round(v + (255 - v) * 0.35);
    t = `rgb(${m(r)},${m(g)},${m(b)})`;
    this._tints.set(color, t);
    return t;
  }

  // A full-screen radial gradient from `inner` (radius r0) to `outer` (r1), drawn at alpha `a`. It is the
  // costliest fill of a frame on a software canvas, so each slot paints it once at full strength into a
  // canvas of its own and repaints only when its colors or the screen change.
  _shade(c, slot, a, r0, r1, inner, outer) {
    const w = this.w, h = this.h, dpr = this.dpr;
    const s = (this._shades ||= {})[slot] ||= { cv: document.createElement('canvas') };
    if (s.inner !== inner || s.outer !== outer || s.w !== w || s.h !== h || s.dpr !== dpr) {
      s.inner = inner; s.outer = outer; s.w = w; s.h = h; s.dpr = dpr;
      s.cv.width = Math.round(w * dpr);
      s.cv.height = Math.round(h * dpr);
      const v = s.cv.getContext('2d');
      v.setTransform(dpr, 0, 0, dpr, 0, 0);
      const vg = v.createRadialGradient(w / 2, h / 2, r0, w / 2, h / 2, r1);
      vg.addColorStop(0, inner);
      vg.addColorStop(1, outer);
      v.fillStyle = vg;
      v.fillRect(0, 0, w, h);
    }
    c.globalAlpha = a;
    c.drawImage(s.cv, 0, 0, w, h);
    c.globalAlpha = 1;
  }

  // ------------------------------------------------------------------------------------------

  begin(dt) {
    this.time += dt;
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return c;
  }

  // Starts one of the player's attack functions: normal blending at the load budget's alpha.
  _mine(c) {
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = this.fxAlpha;
  }

  // Title screen backdrop: the floor grid breathing to a slow pulse.
  drawAttract(dt, pulse) {
    const c = this.begin(dt);
    this.cam.x += dt * 22; this.cam.y += dt * 9;
    this._background(c, 258, pulse, pulse * 0.6);
  }

  // k: the arena's brightness (quiet phrases dim it, an impact flashes it back). grid: the grid lines' strength (the
  // late game and a busy screen dim them, so the fight stands out from the floor).
  _background(c, hue, beat, bar, sx = 0, sy = 0, s = this.scale, k = 1, grid = 1) {
    const w = this.w, h = this.h;
    const camX = this.cam.x + sx, camY = this.cam.y + sy;
    c.fillStyle = `hsl(${hue}, 38%, ${(6.5 * Math.min(1, k)).toFixed(2)}%)`;
    c.fillRect(0, 0, w, h);
    const hq = Math.round(hue);   // a section's color fade repaints the floor once per degree
    this._shade(c, 'floor', (0.35 + beat * 0.12) * k, 0, Math.max(w, h) * 0.7, `hsl(${hq}, 60%, 20%)`, `hsla(${hq}, 50%, 3%, 0)`);
    // Grid in world space
    const step = 64 * s;
    const ox = (-camX * s + w / 2) % step;
    const oy = (-camY * s + h / 2) % step;
    c.lineWidth = 1;
    c.strokeStyle = `hsla(${hue}, 70%, 70%, ${(0.04 + beat * 0.14) * k * grid})`;
    c.beginPath();
    for (let x = ox; x < w; x += step) { c.moveTo(Math.round(x) + 0.5, 0); c.lineTo(Math.round(x) + 0.5, h); }
    for (let y = oy; y < h; y += step) { c.moveTo(0, Math.round(y) + 0.5); c.lineTo(w, Math.round(y) + 0.5); }
    c.stroke();
    // Major lines every 4 cells flash on the downbeat
    const big = step * 4;
    const bx = (-camX * s + w / 2) % big;
    const by = (-camY * s + h / 2) % big;
    c.strokeStyle = `hsla(${hue}, 80%, 72%, ${(0.08 + bar * 0.24) * k * grid})`;
    c.lineWidth = 1.5;
    c.beginPath();
    for (let x = bx; x < w; x += big) { c.moveTo(Math.round(x), 0); c.lineTo(Math.round(x), h); }
    for (let y = by; y < h; y += big) { c.moveTo(0, Math.round(y)); c.lineTo(w, Math.round(y)); }
    c.stroke();
  }

  draw(g, dt) {
    const c = this.begin(dt);
    const p = g.player;
    const targetHue = g.section?.hue ?? 248;
    let dh = targetHue - this.hue;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    this.hue = (this.hue + dh * Math.min(1, dt * 1.5) + 360) % 360;

    // Camera
    this.cam.x = lerp(this.cam.x, p.x, Math.min(1, dt * 8));
    this.cam.y = lerp(this.cam.y, p.y, Math.min(1, dt * 8));
    const shakeAmt = g.settings.shake ? g.shake : 0;
    // Cosmetic randomness never draws from the seeded rng, so a seed plays the same run at any frame rate.
    const sx = (Math.random() * 2 - 1) * shakeAmt, sy = (Math.random() * 2 - 1) * shakeAmt;
    // The Drop camera pushes in through the build bar and punches out on the impact. It scales only the drawing,
    // never viewSize(), so spawns, the bot and the game's view are untouched. Screen shake off keeps it still.
    const building = g.dropState === 'building';
    const cur = building ? g.seq.sounding(g.clock.now() - (g.opts.sim ? 0 : g.audio?.latency || 0)) : null;
    const prog = cur ? cur.sib / 16 : 0;
    if (g.drops > this._drops) this.zoom = 0.94;
    this._drops = g.drops;
    // A remix landing punches out the same way, and so does a boss falling silent.
    const remixes = g.remixLog?.length || 0;
    if (remixes > this._remixes || g.bossesBeaten > this._beaten) this.zoom = 0.95;
    this._remixes = remixes;
    this._beaten = g.bossesBeaten;
    // A boss you can still silence in time (it has a clock) leans the camera in while it is on its last hit.
    const b = g.boss, play = g.state === 'playing';
    const lean = b && !b.dead && b.clock && b.hp < b.maxHp * BALANCE.feel.bossLean;
    if (!g.settings.shake) this.zoom = 1;
    else this.zoom += ((building && play ? 1 + 0.06 * prog : lean && play ? 1.03 : 1) - this.zoom) * Math.min(1, dt * 7);
    const s = this.scale * this.zoom;

    // A quiet phrase dims the arena by a quarter; the band slamming back in (a song impact) flashes it back (Screen
    // flashes on).
    const heard = g.seq.sounding(g.clock.now() - (g.opts.sim ? 0 : g.audio?.latency || 0));
    if (g.impactAt !== this._impactAt) { if (this._impactAt !== undefined && g.impactAt > 0 && g.settings.flashes) this.dim = -0.3; this._impactAt = g.impactAt; }
    this.dim += ((heard?.quiet && g.state === 'playing' ? 0.25 : 0) - this.dim) * Math.min(1, dt * 2.5);
    const vw = this.w / s / 2 + 80, vh = this.h / s / 2 + 80;
    const cx = this.cam.x, cy = this.cam.y;
    const inView = (x, y, r = 0) => Math.abs(x - cx) < vw + r && Math.abs(y - cy) < vh + r;

    // The load budget (see the constructor): the enemies in view and the band's effects.
    this._sortEnemies(g, inView);
    const fx = g.fx;
    const nFx = fx.bullets.length + fx.rings.length + fx.flashes.length + fx.strikes.length + fx.mines.length + fx.walls.length
      + 2 * (fx.beams.length + fx.cones.length + fx.zaps.length);
    const load = clamp((this.nEnemies + 0.5 * nFx - 50) / 230, 0, 1);
    this.load += (load - this.load) * Math.min(1, dt * 3);
    this.fxAlpha = 1 - 0.45 * this.load;
    // The grid steps back through the late game and on a busy screen.
    const grid = 1 - 0.3 * clamp((g.time / 60 - 3) / 4, 0, 1) - 0.15 * this.load;
    this._background(c, this.hue, g.beatPulse, g.barPulse, sx, sy, s, 1 - this.dim, grid);

    c.setTransform(this.dpr * s, 0, 0, this.dpr * s, this.dpr * (this.w / 2 - (this.cam.x + sx) * s), this.dpr * (this.h / 2 - (this.cam.y + sy) * s));

    // Soft stage light under the player that thumps with the kick and widens as the band grows, and a floor
    // ripple on every beat.
    c.globalCompositeOperation = 'lighter';
    const thump = Math.max(g.beatPulse, g.chanPulse.beat || 0);
    this.drawGlow(p.x, p.y, 120 + 10 * g.loadout.filled() + thump * 36, `#${hslHex(Math.round(this.hue / 10) * 10 % 360, 70, 55)}`, 0.16 + thump * 0.16);
    c.globalCompositeOperation = 'source-over';
    if (g.beatPulse > 0.05) {
      c.strokeStyle = `hsla(${Math.round(this.hue)}, 80%, 70%, ${g.beatPulse * 0.12})`;
      c.lineWidth = 2;
      circle(c, p.x, p.y, 40 + (1 - g.beatPulse) * 300); c.stroke();
    }
    // A section's downbeat sends a wave across the floor from you, landing with its crash cymbal.
    if (g.sectionIndex !== this._section) { if (g.sectionIndex > 0) this.waveAt = this.time; this._section = g.sectionIndex; }
    const wt = (this.time - this.waveAt) / 0.7;
    if (wt < 1) {
      c.strokeStyle = `hsla(${g.section.hue}, 80%, 70%, ${0.55 * (1 - wt)})`;
      c.lineWidth = (14 * (1 - wt) + 2) / s;
      circle(c, p.x, p.y, lerp(40, 0.75 * Math.max(this.w, this.h), 1 - (1 - wt) * (1 - wt)) / s); c.stroke();
    }

    this._ruleTells(c, g);
    this._pickups(c, g, inView);
    // MINE: the band's attacks, all of them under everything hostile, in normal blending (a crowd of effects no longer
    // sums to white) and inside the load budget. _mine() starts each attack function at globalAlpha = fxAlpha.
    this._mine(c); this._mines(c, g, inView);
    this._mine(c); this._strikes(c, g, inView);
    this._mine(c); this._orbits(c, g);
    this._mine(c); this._followers(c, g);
    this._mine(c); this._tethers(c, g);
    this._mine(c); this._walls(c, g, inView);
    this._mine(c); this._bullets(c, g, inView);
    this._mine(c); this._rings(c, g, inView);
    this._mine(c); this._cones(c, g, inView);
    this._mine(c); this._beams(c, g);
    this._mine(c); this._particles(c, g, inView);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    // The silence wave's front, until it has passed the far corner of the view.
    const sw = g.won && g.silence;
    if (sw && sw.r < Math.hypot(Math.abs(sw.x - cx) + vw, Math.abs(sw.y - cy) + vh)) {
      c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 28;
      circle(c, sw.x, sw.y, sw.r); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 6;
      c.stroke();
    }
    // ENEMY: solid bodies on top of the attacks, the bosses over them, then you.
    this._enemies(c, g);
    this._bosses(c, g);
    if (g.state === 'dying') this._shatter(c, g);
    else if (g.state !== 'gameover') { this._shield(c, g); this._player(c, g); }   // after the death beat the speaker is gone
    // DANGER, last: arrival rings, Snare marks, lanes and boss tells, then the enemy shots on top of everything.
    this._arrivals(c);
    this._marks(c, g, inView);
    this._telegraphs(c, g);
    this._shots(c, g, inView);
    this._texts(c, g, inView);
    this._bossArrow(c, g, s);

    // Screen-space overlays
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const low = p.hp / p.maxHp;
    if (low < 0.3 || g.hurtFlash > 0.02) {
      const a = Math.max(g.settings.flashes ? g.hurtFlash * 0.45 : g.hurtFlash * 0.15, low < 0.3 ? (0.3 - low) * 0.9 * (0.7 + 0.3 * g.beatPulse) : 0);
      this._shade(c, 'hurt', a, Math.min(this.w, this.h) * 0.3, Math.max(this.w, this.h) * 0.75, 'rgba(255,40,70,0)', 'rgb(255,40,70)');
    }
    // Player position on screen, for screen-space effects centered on them.
    const px = (p.x - this.cam.x) * s + this.w / 2, py = (p.y - this.cam.y) * s + this.h / 2;
    if (building) {
      // One bar of build: the screen darkens, a ring closes in on you, and four beat ticks light up.
      c.fillStyle = `rgba(4,2,10,${0.18 + 0.4 * prog})`;
      c.fillRect(0, 0, this.w, this.h);
      const R0 = Math.max(this.w, this.h) * 0.62;
      c.strokeStyle = `rgba(255,255,255,${0.35 + 0.5 * prog})`;
      c.lineWidth = 2 + 4 * prog;
      circle(c, px, py, lerp(R0, 26 * s, prog)); c.stroke();
      for (let i = 0; i < 4; i++) {
        const lit = cur && cur.sib >= i * 4;
        const a = -Math.PI / 2 + (i / 4) * TAU;
        c.fillStyle = lit ? '#ffffff' : 'rgba(255,255,255,0.2)';
        circle(c, px + Math.cos(a) * 46 * s, py + Math.sin(a) * 46 * s, lit ? 5 : 3.5); c.fill();
      }
    }
    if (g.dropFlash > 0.02 && g.settings.flashes) {
      // The flash covers the blast, not the whole screen: the Drop is local.
      const R = (g.dropR || 460) * s * 1.1;
      c.globalCompositeOperation = 'lighter';
      const fl = c.createRadialGradient(px, py, 0, px, py, R);
      fl.addColorStop(0, `rgba(255,255,255,${g.dropFlash * 0.5})`);
      fl.addColorStop(0.8, `rgba(255,240,255,${g.dropFlash * 0.2})`);
      fl.addColorStop(1, 'rgba(255,240,255,0)');
      c.fillStyle = fl;
      c.fillRect(0, 0, this.w, this.h);
      c.globalCompositeOperation = 'source-over';
    }
    // A perfect drop (on a phrase downbeat): a gold wash and a gold rim at the blast's edge that hold a moment longer.
    if (g.perfectFlash > 0.02) {
      const R = (g.dropR || 460) * s;
      c.globalCompositeOperation = 'lighter';
      if (g.settings.flashes) {
        const fl = c.createRadialGradient(px, py, R * 0.2, px, py, R * 1.15);
        fl.addColorStop(0, 'rgba(255,209,102,0)');
        fl.addColorStop(0.85, `rgba(255,209,102,${g.perfectFlash * 0.28})`);
        fl.addColorStop(1, 'rgba(255,209,102,0)');
        c.fillStyle = fl;
        c.fillRect(0, 0, this.w, this.h);
      }
      c.strokeStyle = `rgba(255,209,102,${g.perfectFlash * 0.9})`;
      c.lineWidth = 3 + 5 * g.perfectFlash;
      circle(c, px, py, R * (1.02 + 0.04 * (1 - g.perfectFlash))); c.stroke();
      c.globalCompositeOperation = 'source-over';
    }
    // A remix lands: a gold wash over its ring (flashes on) and a gold rim that holds at the ring's edge.
    if (g.remixFlash > 0.02) {
      const R = (g.remixR || 520) * s;
      c.globalCompositeOperation = 'lighter';
      if (g.settings.flashes) {
        const fl = c.createRadialGradient(px, py, 0, px, py, R * 1.1);
        fl.addColorStop(0, `rgba(255,209,102,${g.remixFlash * 0.32})`);
        fl.addColorStop(0.8, `rgba(255,209,102,${g.remixFlash * 0.16})`);
        fl.addColorStop(1, 'rgba(255,209,102,0)');
        c.fillStyle = fl;
        c.fillRect(0, 0, this.w, this.h);
      }
      c.strokeStyle = `rgba(255,209,102,${g.remixFlash * 0.85})`;
      c.lineWidth = 2 + 6 * g.remixFlash;
      circle(c, px, py, R * (1 + 0.05 * (1 - g.remixFlash))); c.stroke();
      c.globalCompositeOperation = 'source-over';
    }
  }

  // ------------------------------------------------------------------------------------------

  // PICKUPS, small and quiet. Notes are cream marks with no glow, drawn in one path per shade at low alpha; only the
  // ones near you (inside twice your pickup reach, or flying to you) show at full strength and pulse on the beat.
  // Hearts are pink-white with a soft glow, Master Tapes gold.
  _pickups(c, g, inView) {
    const t = this.time, p = g.player;
    // A note about to fade blinks on 16ths through its last BALANCE.notes.blink seconds.
    const N = BALANCE.notes, T = BALANCE.remix;
    // A Master Tape blinks the same way through its last BALANCE.remix.tapeBlink seconds.
    const fading = (gm) => !gm.pull && (gm.kind === 'xp' ? gm.age > N.life - N.blink : gm.kind === 'tape' && gm.age > T.tapeLife - T.tapeBlink)
      && Math.floor(gm.age / (BEAT_SEC / 4)) % 2 === 1;
    const reach = 2 * (g.stats?.pickup ?? 90), reach2 = reach * reach;
    const near = this._nearNotes ||= [];
    const shades = this._noteShades ||= new Map();
    near.length = 0;
    for (const list of shades.values()) list.length = 0;
    let items = 0;
    for (const gm of g.gems) {
      if (gm.kind !== 'xp') { items++; continue; }
      if (!inView(gm.x, gm.y, 20) || fading(gm)) continue;
      const dx = gm.x - p.x, dy = gm.y - p.y;
      if (gm.pull || dx * dx + dy * dy < reach2) { near.push(gm); continue; }
      let list = shades.get(gm.color);
      if (!list) shades.set(gm.color, list = []);
      list.push(gm);
    }
    c.globalAlpha = 0.42;
    c.lineWidth = 1.3;
    for (const [col, list] of shades) {
      if (!list.length) continue;
      c.fillStyle = col; c.strokeStyle = col;
      c.beginPath();
      for (const gm of list) noteHead(c, gm.x, gm.y, gm.r);
      c.fill();
      c.beginPath();
      for (const gm of list) noteStem(c, gm.x, gm.y, gm.r);
      c.stroke();
    }
    c.globalAlpha = 1;
    const k = 1 + 0.2 * g.beatPulse;
    for (const gm of near) drawNote(c, gm.x, gm.y, gm.r * k, gm.color);
    if (!items) return;
    // Items: a soft glow under each (normal blending), then the item.
    for (const gm of g.gems) {
      if (gm.kind === 'xp' || !inView(gm.x, gm.y, 20) || fading(gm)) continue;
      if (gm.kind === 'tape') this.drawGlow(gm.x, gm.y, gm.r * (3.4 + g.beatPulse * 0.8), gm.color, 0.6);
      else if (gm.kind === 'heal') this.drawGlow(gm.x, gm.y, gm.r * (3 + g.beatPulse * 0.6), '#ff9ccb', 0.55);
      else this.drawGlow(gm.x, gm.y, gm.r * 2.2, gm.color, 0.45);
    }
    for (const gm of g.gems) {
      if (gm.kind === 'xp' || !inView(gm.x, gm.y, 20) || fading(gm)) continue;
      if (gm.kind === 'vinyl') {
        c.save(); c.translate(gm.x, gm.y); c.rotate(t * 3);
        c.fillStyle = '#121016'; circle(c, 0, 0, gm.r); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 1; circle(c, 0, 0, gm.r * 0.72); c.stroke();
        c.fillStyle = ITEM_INFO.vinyl.color; circle(c, 0, 0, gm.r * 0.38); c.fill();
        c.fillStyle = '#121016'; circle(c, 0, 0, 1.6); c.fill();
        c.restore();
      } else if (gm.kind === 'tape') {
        this._tape(c, gm, t, g.beatPulse);
      } else if (gm.kind === 'heal') {
        // A heart: its shape, pink-white with a dark edge and a white glint (never the danger red).
        const r = gm.r * (1.1 + Math.sin(t * 6) * 0.08);
        heart(c, gm.x, gm.y, r);
        c.fillStyle = ITEM_INFO.heal.color; c.fill();
        c.strokeStyle = 'rgba(40,10,26,0.85)'; c.lineWidth = 1.5; c.stroke();
        c.fillStyle = '#ffffff'; circle(c, gm.x - r * 0.42, gm.y - r * 0.38, r * 0.2); c.fill();
      } else if (gm.kind === 'magnet') {
        c.strokeStyle = ITEM_INFO.magnet.color; c.lineWidth = 3.5; c.lineCap = 'butt';
        c.beginPath(); c.arc(gm.x, gm.y, gm.r * 0.7, Math.PI, 0, true); c.stroke();
        c.lineCap = 'round';
      }
    }
  }

  // A Master Tape: a gold reel spinning on the floor (wound tape, three windows in the flange, a hub), and a
  // ring that pulses out from it on the beat so it reads from across a fight.
  _tape(c, gm, t, pulse) {
    const r = gm.r, col = ITEM_INFO.tape.color;
    c.strokeStyle = rgba(col, 0.25 + 0.45 * pulse);
    c.lineWidth = 2;
    circle(c, gm.x, gm.y, r * (1.5 + 0.9 * (1 - pulse))); c.stroke();
    c.save(); c.translate(gm.x, gm.y); c.rotate(t * 2.4);
    c.fillStyle = col; circle(c, 0, 0, r); c.fill();
    c.fillStyle = '#3a2a0c'; circle(c, 0, 0, r * 0.66); c.fill();   // the wound tape
    c.fillStyle = '#121016';
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      c.beginPath(); c.arc(0, 0, r * 0.56, a + 0.35, a + 1.75); c.arc(0, 0, r * 0.3, a + 1.75, a + 0.35, true); c.closePath(); c.fill();
    }
    c.fillStyle = col; circle(c, 0, 0, r * 0.22); c.fill();
    c.fillStyle = '#121016'; circle(c, 0, 0, r * 0.08); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1.2; circle(c, 0, 0, r); c.stroke();
    c.restore();
  }

  // The band's play rules, as quiet tells on the floor in their style's color (no text): Long throw's dotted
  // circle, the Mosh pit's disc, In the pocket's ring that fills over the beat while you stand still, the
  // Combo streak's 16 ticks, and a halo that swells through the 8-bar phrase. A pick that turns a rule on, steps
  // it up or forms a crossover (g.ruleBloom) blooms its tells out from the speaker over one beat, brighter at first.
  _ruleTells(c, g) {
    const R = g.stats?.rules, S = g.rules;
    if (!R?.on || !S || g.state === 'dying' || g.state === 'gameover') return;
    const p = g.player, pulse = g.beatPulse, B = g.ruleBloom;
    const bk = B ? clamp((g.time - B.t) / BEAT_SEC, 0, 1) : 1;
    // A tell's bloom: its size (eased out) and an alpha lift that fades as it reaches full size; [1, 0] when not blooming.
    const bloom = (rule) => (bk < 1 && B.styles.some((st) => CHEMISTRY[st]?.rule === rule) ? [1 - (1 - bk) ** 3, 0.5 * (1 - bk)] : [1, 0]);
    if (R.far) {
      const [k, up] = bloom('far');
      c.strokeStyle = rgba(RULE_COLOR.far, 0.2 + 0.12 * pulse + up);
      c.lineWidth = 2;
      c.setLineDash([2, 12]);
      // Electro chip's full combo counts every hit as far (farR 0): the circle hugs the speaker (just outside In the
      // pocket's ring) instead of vanishing.
      circle(c, p.x, p.y, Math.max(g.farR(), p.r + 40) * k); c.stroke();
      c.setLineDash([]);
    }
    if (R.near) {
      const [k, up] = bloom('near');
      c.fillStyle = rgba(RULE_COLOR.near, 0.03 + 0.03 * pulse + up * 0.3);
      circle(c, p.x, p.y, g.nearR() * k); c.fill();
      c.strokeStyle = rgba(RULE_COLOR.near, 0.26 + up);
      c.lineWidth = 2;
      c.stroke();
    }
    if (R.stillHeal || R.stillArea) {
      const [bs, up] = bloom('still');
      // While it blooms the ring is drawn whole, planted or not.
      const k = up ? 1 : S.planted ? 1 : S.broke ? 0 : clamp((g.time - S.beatAt) / BEAT_SEC, 0, 1);
      if (k > 0) {
        const rr = (p.r + 30) * bs;
        c.strokeStyle = rgba(RULE_COLOR.still, (S.planted ? 0.5 + 0.3 * pulse : 0.3) + up);
        c.lineWidth = 3;
        c.beginPath(); c.arc(p.x, p.y, rr, -Math.PI / 2, -Math.PI / 2 + k * TAU); c.stroke();
        if (S.planted) { c.fillStyle = rgba(RULE_COLOR.still, 0.07 + 0.05 * pulse); circle(c, p.x, p.y, rr); c.fill(); }
      }
    }
    if (R.combo) {
      const [k, up] = bloom('combo');
      const n = RULES.comboCap, w = 3, gap = 1.5, x0 = p.x - (n * (w + gap) - gap) / 2, y = p.y + p.r + 34;
      for (let i = 0; i < n; i++) {
        c.fillStyle = i < S.combo ? RULE_COLOR.combo : rgba(RULE_COLOR.combo, 0.16 + up);
        c.fillRect(p.x + (x0 + i * (w + gap) - p.x) * k, y, w, 3);
      }
    }
    if (R.swell) {
      const [k, up] = bloom('swell'), sw = g.swellAt();
      c.globalCompositeOperation = 'lighter';
      this.drawGlow(p.x, p.y, (36 + 54 * sw) * k, RULE_COLOR.swell, 0.08 + 0.3 * sw + up);
      c.globalCompositeOperation = 'source-over';
    }
  }

  // MINE: the band's attacks. Each function below draws one archetype in its instrument's look (src/render/looks.js:
  // the style's grammar and the sound's own signature), in normal blending, every alpha inside the load budget.
  _mines(c, g, inView) {
    looks.begin(c, this);
    for (const m of g.fx.mines) if (inView(m.x, m.y, m.r)) looks.mine(m);
    looks.end();
  }

  _cones(c, g, inView) {
    looks.begin(c, this);
    for (const k of g.fx.cones) if (inView(k.x, k.y, k.r)) looks.cone(k);
    looks.end();
  }

  _walls(c, g, inView) {
    looks.begin(c, this);
    for (const w of g.fx.walls) if (inView(w.x, w.y, w.r + 20)) looks.wall(w);
    looks.end();
  }

  _tethers(c, g) {
    looks.begin(c, this);
    for (const t of g.fx.tethers) if (!t.e.dead) looks.tether(t, g.player);
    looks.end();
  }

  _followers(c, g) {
    looks.begin(c, this);
    for (const grp of g.fx.trails.values()) looks.followers(grp, g.player);
    looks.end();
  }

  // A shield: a bubble around the speaker in its channel color, one arc per hit it can still take, blinking out.
  _shield(c, g) {
    const s = g.shield;
    if (!s || !(s.n > 0)) return;
    const left = s.until - g.time;
    looks.begin(c, this);
    looks.shield(s, g.player, g.color(s.src), left < 0.5 ? 0.4 + 0.6 * (Math.sin(this.time * 30) * 0.5 + 0.5) : 1);
    looks.end();
    c.globalAlpha = 1;
  }

  // Strikes: what is about to land (falling blocks, stars, bow strokes, shells...). Falling ones come from above.
  _strikes(c, g, inView) {
    looks.begin(c, this);
    for (const s of g.fx.strikes) if (inView(s.x, s.y, s.r + 220)) looks.strike(s);
    looks.end();
  }

  // Sorts the enemies in view into reused lists for _enemies and _bosses: the bodies by silhouette, then the ones
  // flashing from a hit, the elites, the arriving ones and the bosses. Counts them for the load budget.
  _sortEnemies(g, inView) {
    const L = this._lists ||= { hit: [], elite: [], arriving: [], boss: [], ...Object.fromEntries(SHAPES.map((k) => [k, []])) };
    for (const k in L) L[k].length = 0;
    let n = 0;
    for (const e of g.enemies) {
      if (e.dead || !inView(e.x, e.y, e.r + 10)) continue;
      n++;
      if (e.boss) L.boss.push(e);
      else if (e.spawnT > 0) L.arriving.push(e);
      else if (e.elite) L.elite.push(e);
      else if (e.flash > 0) L.hit.push(e);
      else (L[e.shape] || L.glitch).push(e);
    }
    this.nEnemies = n;
  }

  // ENEMY: a solid dark body with a light neutral outline; the silhouette tells the type. One fill and one stroke per
  // body with the styles set once per silhouette, all inner marks in one path, all threat eyes in one path. No
  // shadows, glows or random numbers per enemy, so hundreds stay cheap.
  _enemies(c, g) {
    const L = this._lists, t = this.time;
    const bob = 1 + g.beatPulse * 0.09;
    const lw = Math.max(2, 1.6 / this.scale);
    c.lineJoin = 'round';
    c.lineWidth = lw;
    c.fillStyle = BODY; c.strokeStyle = EDGE;
    for (const k of SHAPES) for (const e of L[k]) { body(c, e, e.r * bob, t); c.fill(); c.stroke(); }
    // A hit flashes the body light and the outline white for a moment.
    if (L.hit.length) {
      c.fillStyle = BODY_HIT; c.strokeStyle = '#ffffff';
      for (const e of L.hit) { body(c, e, e.r * bob, t); c.fill(); c.stroke(); }
    }
    // Elites: a heavier gold outline (white on a hit).
    if (L.elite.length) {
      c.lineWidth = lw * 1.6;
      for (const e of L.elite) {
        body(c, e, e.r * bob, t);
        c.fillStyle = e.flash > 0 ? BODY_HIT : BODY; c.fill();
        c.strokeStyle = e.flash > 0 ? '#ffffff' : ELITE; c.stroke();
      }
      c.lineWidth = lw;
    }
    // Arriving: the body grows and fades in (its danger ring is drawn with the telegraphs).
    if (L.arriving.length) {
      c.fillStyle = BODY;
      for (const e of L.arriving) {
        const k = 1 - e.spawnT / (e.spawnDur || 0.35), r = e.r * bob * k;
        if (r <= 0.5) continue;
        c.globalAlpha = k;
        c.strokeStyle = e.elite ? ELITE : EDGE;
        body(c, e, r, t); c.fill(); c.stroke();
      }
      c.globalAlpha = 1;
    }
    // The quiet marks inside the bodies.
    c.strokeStyle = MARK; c.lineWidth = 1.5;
    c.beginPath();
    for (const k of SHAPES) for (const e of L[k]) marks(c, e, e.r * bob);
    for (const e of L.hit) marks(c, e, e.r * bob);
    for (const e of L.elite) marks(c, e, e.r * bob);
    c.stroke();
    // A threat's eye (Screech, Snare, Stomp, elites). A Screech winding up and a Snare or a Stomp about to act swell it,
    // and a danger ring closes in on the shooters for their beat.
    const tells = this._tells ||= [];
    tells.length = 0;
    c.fillStyle = EYE;
    c.beginPath();
    const eye = (e) => {
      const r = e.r * bob;
      let k = 0;
      if (e.def.ranged) k = e.ai.windup > 0 ? 1 - e.ai.windup / BEAT_SEC : e.ai.shootT ? 1 : 0;
      else if (e.def.mortar) k = e.ai.shootT ? 1 : 0;
      if (e.ai.chargeWarn) k = Math.max(k, 1 - e.ai.chargeWarn.t / BEAT_SEC);
      if (k > 0 && (e.def.ranged || e.def.mortar)) tells.push(e, k);
      const er = Math.max(2.2, r * (e.elite ? 0.16 : 0.24)) * (1 + 0.7 * k);
      c.moveTo(e.x + er, e.y); c.arc(e.x, e.y, er, 0, TAU);
    };
    for (const e of L.diamond) eye(e);
    for (const e of L.snare) eye(e);
    for (const e of L.stomp) eye(e);
    for (const e of L.elite) eye(e);
    for (const e of L.hit) if (isThreat(e)) eye(e);
    c.fill();
    if (tells.length) {
      c.strokeStyle = DANGER; c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i < tells.length; i += 2) {
        const e = tells[i], rr = e.r * (2.4 - 1.2 * tells[i + 1]);
        c.moveTo(e.x + rr, e.y); c.arc(e.x, e.y, rr, 0, TAU);
      }
      c.stroke();
    }
    // An elite's health, once hurt.
    for (const e of L.elite) {
      if (!(e.hp < e.maxHp)) continue;
      const w = e.r * 2;
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(e.x - w / 2, e.y - e.r * 1.3 - 10, w, 4);
      c.fillStyle = ELITE; c.fillRect(e.x - w / 2, e.y - e.r * 1.3 - 10, w * Math.max(0, e.hp / e.maxHp), 4);
    }
    c.lineJoin = 'miter';
  }

  _bosses(c, g) {
    for (const e of this._lists.boss) {
      const spawnK = e.spawnT > 0 ? 1 - e.spawnT / (e.spawnDur || 0.35) : 1;
      const r = e.r * (1 + g.beatPulse * 0.04) * spawnK;
      if (r <= 0.5) continue;
      c.globalAlpha = spawnK;
      this._boss(c, g, e, r);
      c.globalAlpha = 1;
    }
  }

  // A boss keeps its identity (its color, its silhouette) as a solid body: an opaque dark fill, a thick outline in its
  // color and a soft halo under it in normal blending.
  _boss(c, g, e, r) {
    const t = this.time;
    const flash = e.flash > 0;
    const col = flash ? '#ffffff' : e.color;
    // A boss the Drop knocked off the beat (enemies.js knockOffBeat) glows dim and stops pulsing until its bar is heard.
    const heard = g.seq.sounding(g.clock.now() - (g.opts.sim ? 0 : g.audio?.latency || 0));
    const staggered = heard && heard.bar < e.ai.offbeatUntil;
    this.drawGlow(e.x, e.y, r * 2.3, e.color, staggered ? 0.1 : 0.2 + g.beatPulse * 0.15);
    // ...and wears a white ring, so the stagger reads without a word.
    if (staggered) {
      c.strokeStyle = `rgba(255,255,255,${0.55 + 0.35 * Math.sin(t * 9) ** 2})`; c.lineWidth = 2.5;
      circle(c, e.x, e.y, r * 1.4 + 6); c.stroke();
    }
    // Bosses are hit constantly: keep the silhouette dark and flash only the outline.
    c.fillStyle = BOSS_BODY;
    c.strokeStyle = col;
    c.lineWidth = flash ? 4.5 : 3.5;
    switch (e.shape) {
      case 'drone': {
        circle(c, e.x, e.y, r); c.fill(); c.stroke();
        for (let i = 0; i < 3; i++) {
          c.beginPath();
          c.arc(e.x, e.y, r * (0.45 + i * 0.18), t * (1 + i) + i, t * (1 + i) + i + Math.PI * 1.2);
          c.stroke();
        }
        c.fillStyle = col; circle(c, e.x, e.y, r * 0.16); c.fill();
        break;
      }
      case 'clipper': {
        c.beginPath();
        const n = 16;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * TAU + t * 0.5;
          const rr = r * (i % 2 ? 0.78 : 1.08);
          c.lineTo(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr);
        }
        c.closePath(); c.fill(); c.stroke();
        c.beginPath();
        for (let x = -r * 0.6; x <= r * 0.6; x += r * 0.3) {
          const up = Math.round((x + r) / (r * 0.3)) % 2 ? -1 : 1;
          c.lineTo(e.x + x, e.y + up * r * 0.22);
          c.lineTo(e.x + x + r * 0.3, e.y + up * r * 0.22);
        }
        c.stroke();
        break;
      }
      case 'king': {
        const ox = e.ai.blinkTo ? (Math.random() - 0.5) * 8 : 0;
        c.beginPath(); c.rect(e.x - r + ox, e.y - r * 0.7, r * 2, r * 1.5); c.fill(); c.stroke();
        c.beginPath();
        c.moveTo(e.x - r, e.y - r * 0.7);
        for (let i = 0; i < 5; i++) {
          const x = e.x - r + (i + 0.5) * (r * 2 / 5);
          c.lineTo(x, e.y - r * (i % 2 ? 1.1 : 1.45));
          c.lineTo(e.x - r + (i + 1) * (r * 2 / 5), e.y - r * 0.7);
        }
        c.stroke();
        c.fillStyle = 'rgba(255,60,200,0.5)'; c.fillRect(e.x - r + 6, e.y - 4, r * 2 - 12, 4);
        c.fillStyle = rgba(e.color, 0.7); c.fillRect(e.x - r + 3, e.y + 6, r * 2 - 12, 3);
        break;
      }
      case 'noise': default: {
        circle(c, e.x, e.y, r); c.fill();
        c.save();
        circle(c, e.x, e.y, r); c.clip();
        for (let i = 0; i < 60; i++) {
          const v = Math.floor(Math.random() * 255);
          c.fillStyle = `rgba(${v},${v},${v},0.8)`;
          c.fillRect(e.x - r + Math.random() * r * 2, e.y - r + Math.random() * r * 2, 3 + Math.random() * 5, 2);
        }
        c.restore();
        c.lineWidth = 4;
        c.beginPath();
        for (let i = 0; i <= 40; i++) {
          const a = (i / 40) * TAU;
          const rr = r + (Math.random() - 0.5) * 10 * (1 + g.beatPulse);
          c.lineTo(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr);
        }
        c.closePath();
        c.stroke();
        break;
      }
    }
  }

  // DANGER, an enemy shot: a teardrop in the danger family (a boss's shade) with a white-hot core and a dark rim, its
  // head never under 5.5 px on screen (bigger than any of your projectiles), drawn on top of everything in normal
  // blending. Batched: one fill for every rim, one per shade for the bodies, one for every core.
  _shots(c, g, inView) {
    if (!g.shots.length) return;
    const list = this._shotList ||= [];
    list.length = 0;
    for (const s of g.shots) if (inView(s.x, s.y, 14)) list.push(s);
    if (!list.length) return;
    const minR = 5.5 / this.scale;
    const R = (s) => Math.max(s.r, minR);
    const A = (s) => Math.atan2(s.vy, s.vx);
    c.fillStyle = RIM;
    c.beginPath();
    for (const s of list) tear(c, s.x, s.y, A(s), R(s) * RIM_K, RIM_TAIL, RIM_TH);
    c.fill();
    const shades = this._shotShades ||= new Map();
    for (const l of shades.values()) l.length = 0;
    for (const s of list) {
      let l = shades.get(s.color);
      if (!l) shades.set(s.color, l = []);
      l.push(s);
    }
    for (const [col, l] of shades) {
      if (!l.length) continue;
      c.fillStyle = col;
      c.beginPath();
      for (const s of l) tear(c, s.x, s.y, A(s), R(s), TAIL, TH);
      c.fill();
    }
    c.fillStyle = HOT;
    c.beginPath();
    for (const s of list) { const r = R(s) * 0.5; c.moveTo(s.x + r, s.y); c.arc(s.x, s.y, r, 0, TAU); }
    c.fill();
  }

  // A telegraphed arrival (a drop-in, a formation ring): a dashed danger ring closes in on the spot for its beat.
  _arrivals(c) {
    const A = this._lists.arriving;
    if (!A.length) return;
    c.lineWidth = 2;
    c.setLineDash([6, 5]);
    for (const e of A) {
      if (!(e.spawnDur > 0.4)) continue;
      const k = 1 - e.spawnT / e.spawnDur;
      c.strokeStyle = rgba(DANGER, 0.45 + 0.5 * k);
      circle(c, e.x, e.y, e.r * (1.2 + 2.4 * (1 - k))); c.stroke();
    }
    c.setLineDash([]);
  }

  // Boss tells and Stomp lanes, drawn wherever the tell is (the boss itself may be off-screen), all in the danger
  // family. Snare marks: a dashed danger outline where the shell will land, filling toward its beat, with a white-hot
  // tick ring closing in.
  _marks(c, g, inView) {
    const H = g.hazards;
    if (!H?.length) return;
    for (const h of H) {
      if (!inView(h.x, h.y, h.r)) continue;
      const k = clamp((g.time - h.t0) / (h.dur || 1), 0, 1);
      c.fillStyle = rgba(DANGER, 0.06 + 0.2 * k);
      circle(c, h.x, h.y, h.r * k); c.fill();
      c.strokeStyle = rgba(DANGER, 0.6 + 0.35 * k);
      c.lineWidth = 2;
      c.setLineDash([7, 5]);
      circle(c, h.x, h.y, h.r); c.stroke();
      c.setLineDash([]);
      c.strokeStyle = rgba(HOT, 0.2 + 0.5 * k);
      c.lineWidth = 1.5;
      circle(c, h.x, h.y, h.r * (1.5 - 0.5 * k)); c.stroke();
    }
  }

  _telegraphs(c, g) {
    for (const e of g.enemies) {
      if (e.dead || (!e.boss && !e.ai.chargeWarn)) continue;
      const bt = e.ai.blinkTo;
      if (bt) {
        // The Glitch King's landing spot: a danger disc filling for its two beats, a white-hot ring closing in and
        // a dashed line from the king.
        const k = clamp((g.time - (e.ai.blinkSetAt ?? g.time)) / (BEAT_SEC * 2), 0, 1);
        const blink = 0.6 + 0.4 * Math.sin(this.time * 18);
        c.fillStyle = rgba(DANGER, 0.1 + 0.16 * k);
        circle(c, bt.x, bt.y, e.r); c.fill();
        c.strokeStyle = rgba(HOT, (0.55 + 0.4 * k) * blink);
        c.lineWidth = 3.5;
        circle(c, bt.x, bt.y, e.r * (2 - k)); c.stroke();
        c.strokeStyle = rgba(DANGER, 0.95);
        c.lineWidth = 2.5;
        circle(c, bt.x, bt.y, e.r); c.stroke();
        c.setLineDash([8, 8]);
        c.strokeStyle = rgba(DANGER, 0.6);
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(bt.x, bt.y); c.stroke();
        c.setLineDash([]);
        c.strokeStyle = rgba(HOT, 0.8);
        c.beginPath();
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * TAU;
          c.moveTo(bt.x + Math.cos(a) * e.r * 1.1, bt.y + Math.sin(a) * e.r * 1.1);
          c.lineTo(bt.x + Math.cos(a) * e.r * 1.35, bt.y + Math.sin(a) * e.r * 1.35);
        }
        c.stroke();
      }
      const cw = e.ai.chargeWarn;
      // A charge lane (the Drone's, a Stomp's, a hunting elite's) lights up a beat before the dash: a danger strip
      // with a dashed edge, filling white-hot toward its downbeat. A Stomp's stays lit until its downbeat, even when a
      // pause stretched the beat.
      if (cw && (cw.t > 0 || e.def.charger || cw.hold)) {
        const L = cw.len ?? e.speed * 3.4 * 0.75 + e.r;
        const k = 1 - cw.t / BEAT_SEC;
        c.save();
        c.translate(e.x, e.y); c.rotate(cw.a);
        c.fillStyle = rgba(DANGER, 0.08 + 0.14 * k);
        c.fillRect(0, -e.r, L, e.r * 2);
        // A dashed edge on the whole lane, so crossing lanes stay separate shapes.
        c.strokeStyle = rgba(DANGER, 0.75);
        c.lineWidth = 2;
        c.setLineDash([10, 6]);
        c.strokeRect(0, -e.r, L, e.r * 2);
        c.setLineDash([]);
        c.strokeStyle = rgba(HOT, 0.3 + 0.45 * k);
        c.lineWidth = 2;
        c.strokeRect(0, -e.r, L * k, e.r * 2);
        c.restore();
      }
    }
  }

  // An arrow pointing at a boss that is off-screen or hidden under the HUD, drawn inside the clear play area.
  // An arrow at the edge of the view toward the boss, and toward a Master Tape lying off screen (gold).
  _bossArrow(c, g, s) {
    for (const gm of g.gems) if (gm.kind === 'tape') this._edgeArrow(c, gm, ITEM_INFO.tape.color, s, 12);
    const e = g.boss;
    if (!e || e.dead) return;
    this._edgeArrow(c, e, e.color, s, 15);
  }

  _edgeArrow(c, e, color, s, sz) {
    // Clear of the HUD: the top bar, the boss bar and the fight note under it (styles.css), and the mixer.
    const top = this.w < 760 ? 140 : 152, bottom = this.w < 760 ? 150 : 104, side = 24;
    const sxp = (e.x - this.cam.x) * s + this.w / 2, syp = (e.y - this.cam.y) * s + this.h / 2;
    if (sxp > side && sxp < this.w - side && syp > top && syp < this.h - bottom) return;
    // Center of the clear area, and the point where the ray toward the boss leaves it.
    const cx = this.w / 2, cy = (top + this.h - bottom) / 2;
    const dx = sxp - cx, dy = syp - cy;
    const a = Math.atan2(dy, dx);
    const hw = this.w / 2 - side - 8, hh = (this.h - bottom - top) / 2 - 8;
    const k = Math.min(hw / Math.abs(Math.cos(a) || 1e-6), hh / Math.abs(Math.sin(a) || 1e-6));
    const x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k;
    c.save();
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.translate(x, y); c.rotate(a);
    c.fillStyle = color;
    c.strokeStyle = 'rgba(8,4,12,0.9)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(sz, 0); c.lineTo(-sz * 0.7, sz * 0.75); c.lineTo(-sz * 0.35, 0); c.lineTo(-sz * 0.7, -sz * 0.75); c.closePath();
    c.stroke(); c.fill();
    c.restore();
  }

  _player(c, g) {
    const p = g.player;
    if (p.iframes > 0 && Math.floor(this.time * 24) % 2 === 0) c.globalAlpha = 0.45;
    const r = p.r * (1 + g.beatPulse * 0.06);
    // A dark halo under the rings and the Drop meter's light track at its edge: you read on top of any attack, crowd
    // or floor.
    let n = 0;
    for (const role of ROLES) if (g.loadout.channels[role]) n++;
    c.fillStyle = 'rgba(6,4,12,0.82)';
    circle(c, p.x, p.y, r + 12 + n * 3.8); c.fill();
    // Channel rings: each instrument that just played lights its ring, and a ring thickens as its sound levels up.
    let i = 0;
    for (const role of ROLES) {
      const inst = g.loadout.channels[role];
      if (!inst) continue;
      const k = g.chanPulse[role];
      const rr = r + 5 + i * 3.8;
      c.strokeStyle = rgba(ROLE_INFO[role].color, 0.22 + k * 0.7);
      c.lineWidth = 1.2 + 0.45 * inst.level + k * 1.6;
      circle(c, p.x, p.y, rr + k * 2); c.stroke();
      i++;
    }
    this._dropRing(c, g, p, r + 9 + i * 3.8);
    // Speaker body
    c.fillStyle = '#16121f';
    circle(c, p.x, p.y, r); c.fill();
    c.strokeStyle = '#f4efff'; c.lineWidth = 2.5;
    circle(c, p.x, p.y, r); c.stroke();
    c.strokeStyle = 'rgba(244,239,255,0.55)'; c.lineWidth = 1.5;
    circle(c, p.x, p.y, r * (0.58 + g.beatPulse * 0.1)); c.stroke();
    c.fillStyle = '#f4efff';
    circle(c, p.x, p.y, r * 0.22); c.fill();
    // Facing tick
    const a = Math.atan2(p.faceY, p.faceX);
    c.fillStyle = '#f4efff';
    c.beginPath();
    c.moveTo(p.x + Math.cos(a) * (r + 7), p.y + Math.sin(a) * (r + 7));
    c.lineTo(p.x + Math.cos(a + 0.35) * (r + 1), p.y + Math.sin(a + 0.35) * (r + 1));
    c.lineTo(p.x + Math.cos(a - 0.35) * (r + 1), p.y + Math.sin(a - 0.35) * (r + 1));
    c.closePath(); c.fill();
    c.globalAlpha = 1;
  }

  // The Drop meter: the outermost arc around the speaker, filling clockwise from 12 o'clock. White, or the
  // section's hue through the build bar (gold is kept for remixes). Full, it closes and pulses on the beat,
  // and the first time it fills in a run a key cap shows beside it (Space, or A on a pad; touch has a button).
  _dropRing(c, g, p, rr) {
    const frac = g.dropState ? 1 : clamp(g.dropCharge / (g.dropMax || 1), 0, 1);
    const full = frac >= 1 && !g.dropState && !g.won;
    if (g.time < (this._dropT ?? 0)) this._dropCap = 0;   // a new run
    this._dropT = g.time;
    if (full && !this._dropCap) this._dropCap = 1;
    if (g.dropState && this._dropCap === 1) this._dropCap = 2;   // used once: the cap is not shown again this run
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(244,239,255,0.3)'; c.lineWidth = 2;
    circle(c, p.x, p.y, rr); c.stroke();
    if (frac > 0.002) {
      const pulse = full ? g.beatPulse : 0;
      c.strokeStyle = g.dropState ? `hsla(${g.section?.hue ?? 260}, 85%, 72%, 0.95)` : full ? `rgba(255,255,255,${0.75 + 0.25 * pulse})` : 'rgba(244,239,255,0.6)';
      c.lineWidth = full || g.dropState ? 2.6 + pulse * 2.2 : 2;
      c.beginPath(); c.arc(p.x, p.y, rr + pulse * 2, -Math.PI / 2, -Math.PI / 2 + frac * TAU); c.stroke();
    }
    c.lineCap = 'butt';
    // The count-in: full, with a press now landing on the phrase downbeat (a perfect Drop), a dashed white ring closes
    // from rr + 26 to rr + 4 over the two bars heard before it, doubled 8 px outside when that downbeat is one of the
    // song's own impacts (a Double Drop). Dashed and white, it stays apart from In the pocket's solid ring.
    if (full && g.dropPerfectNow()) {
      const cur = g.seq.sounding(g._heardNow());
      const k = cur ? clamp(((cur.bar - g.dropLandsOn() + 2) * 16 + cur.sib) / 32, 0, 1) : 0;
      const r = rr + 26 - 22 * k;
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.5;
      c.setLineDash([3, 5]);
      circle(c, p.x, p.y, r); c.stroke();
      if (g.dropDoubleNow()) { circle(c, p.x, p.y, r + 8); c.stroke(); }
      c.setLineDash([]);
    }
    if (!(full && this._dropCap === 1) || typeof document === 'undefined') return;
    const dev = document.body.dataset.input;
    if (dev === 'touch') return;
    const x = p.x + rr * 0.78 + 16, y = p.y - rr * 0.78 - 10;
    c.fillStyle = 'rgba(13,10,23,0.85)'; c.strokeStyle = `rgba(255,255,255,${0.7 + 0.3 * g.beatPulse})`; c.lineWidth = 1.5;
    if (dev === 'pad') {
      circle(c, x, y, 9); c.fill(); c.stroke();
      c.fillStyle = '#ffffff'; c.font = '700 11px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('A', x, y + 0.5);
    } else {
      c.beginPath(); c.roundRect ? c.roundRect(x - 17, y - 8, 34, 16, 3) : c.rect(x - 17, y - 8, 34, 16); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(x - 9, y - 2); c.lineTo(x - 9, y + 2.5); c.lineTo(x + 9, y + 2.5); c.lineTo(x + 9, y - 2); c.stroke();
    }
  }

  // The death beat: the channel rings break into arcs that fly off and fade, and the speaker splits into four
  // wedges that drift apart. Cracks show from the first frame, so no intact speaker appears after the lethal hit.
  _shatter(c, g) {
    const p = g.player;
    const k = clamp(1 - g.dyingT / 0.9, 0, 1);
    const e = 1 - (1 - k) * (1 - k);
    let i = 0;
    c.globalAlpha = 1 - k;
    for (const role of ROLES) {
      const inst = g.loadout.channels[role];
      if (!inst) continue;
      const rr = p.r + 5 + i * 3.8 + e * (70 + 18 * i);
      const a0 = i * 0.9 + (i % 2 ? 1.2 : -1.2) * e;
      c.strokeStyle = ROLE_INFO[role].color;
      c.lineWidth = 1.2 + 0.45 * inst.level;
      for (let j = 0; j < 3; j++) { c.beginPath(); c.arc(p.x, p.y, rr, a0 + (j / 3) * TAU, a0 + (j / 3) * TAU + 1.5); c.stroke(); }
      i++;
    }
    c.globalAlpha = 1 - k * k;
    const d = 3 + 28 * e, q = Math.PI / 2;
    for (let j = 0; j < 4; j++) {
      const a = j * q + q / 2, x = p.x + Math.cos(a + q / 2) * d, y = p.y + Math.sin(a + q / 2) * d;
      c.beginPath(); c.moveTo(x, y); c.arc(x, y, p.r, a, a + q); c.closePath();
      c.fillStyle = '#16121f'; c.fill();
      c.strokeStyle = '#f4efff'; c.lineWidth = 2.5; c.stroke();
      c.strokeStyle = 'rgba(244,239,255,0.55)'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, p.r * 0.58, a, a + q); c.stroke();
      c.fillStyle = '#f4efff';
      c.beginPath(); c.moveTo(x, y); c.arc(x, y, p.r * 0.22, a, a + q); c.closePath(); c.fill();
    }
    c.globalAlpha = 1;
  }

  _orbits(c, g) {
    looks.begin(c, this);
    for (const grp of g.fx.orbits.values()) looks.orbit(grp, g.player);
    looks.end();
  }

  // Shots, batched by look and color (looks.bullets).
  _bullets(c, g, inView) {
    looks.begin(c, this);
    looks.bullets(g.fx.bullets, inView);
    looks.end();
  }

  // Shockwaves, then the flashes of instant hits, landings and kills.
  _rings(c, g, inView) {
    looks.begin(c, this);
    for (const r of g.fx.rings) if (inView(r.x, r.y, r.r)) looks.ring(r);
    for (const f of g.fx.flashes) if (inView(f.x, f.y, f.r)) looks.area(f);
    looks.end();
  }

  // Lines (lances, lasers, strings, wires) and chain zaps.
  _beams(c, g) {
    looks.begin(c, this);
    for (const b of g.fx.beams) looks.beam(b);
    for (const z of g.fx.zaps) looks.zap(z);
    looks.end();
  }

  // Sparks (kill pops and the like) inside the load budget: on a busy screen half of them (always the same half: the
  // key is each spark's own random size) and smaller. One fillStyle per run of a color, the fade in globalAlpha.
  // Bodies the band sent flying first: each wears its launcher's wake (looks.launches).
  _particles(c, g, inView) {
    looks.begin(c, this);
    looks.launches(g.enemies, inView);
    looks.end();
    const fa = c.globalAlpha, thin = this.load > 0.45, shrink = 1 - 0.35 * this.load;
    let col = null;
    for (const q of g.fx.parts) {
      if (!inView(q.x, q.y) || (thin && ((q.size * 977) | 0) & 1)) continue;
      const k = 1 - q.age / q.life;
      if (q.color !== col) c.fillStyle = col = q.color;
      c.globalAlpha = fa * 0.9 * k;
      const s = q.size * k * shrink;
      c.fillRect(q.x - s / 2, q.y - s / 2, s, s);
    }
    c.globalAlpha = fa;
  }

  // Damage numbers on top. On a busy screen only the big ones stay: crits on a boss or an elite (and the words, like
  // Breather!).
  _texts(c, g, inView) {
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const busy = this.load > 0.4, L = this._lists;
    const onBig = (t) => {
      for (const e of L.boss) if (Math.abs(t.x - e.x) < e.r + 24 && t.y > e.y - e.r - 60 && t.y < e.y + e.r) return true;
      for (const e of L.elite) if (Math.abs(t.x - e.x) < e.r + 24 && t.y > e.y - e.r - 60 && t.y < e.y + e.r) return true;
      return false;
    };
    for (const t of g.fx.texts) {
      if (!inView(t.x, t.y)) continue;
      if (busy) {
        const ch = t.str.charCodeAt(0);
        if (ch >= 48 && ch <= 57 && !(t.size >= 14 && onBig(t))) continue;
      }
      const k = 1 - t.age / t.life;
      c.globalAlpha = Math.min(1, k * 2);
      c.font = `700 ${t.size}px "JetBrains Mono", ui-monospace, monospace`;
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(10,8,16,0.85)';
      c.strokeText(t.str, t.x, t.y);
      c.fillStyle = t.color;
      c.fillText(t.str, t.x, t.y);
    }
    c.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------------------------------ shapes

function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, TAU); }

function star(c, x, y, r, n = 5) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * TAU - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}

// A heart's path (the caller fills and strokes it).
function heart(c, x, y, r) {
  c.beginPath();
  c.moveTo(x, y + r * 0.9);
  c.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.6, y - r * 1.2, x, y - r * 0.4);
  c.bezierCurveTo(x + r * 0.6, y - r * 1.2, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
  c.closePath();
}

// A note's head and its stem with the flag, as subpaths added to the current path (so a floor of notes is one fill
// and one stroke). The same shape drawNote draws.
const NOTE_C = Math.cos(-0.35), NOTE_S = Math.sin(-0.35);
function noteHead(c, x, y, r) {
  c.moveTo(x + r * 1.05 * NOTE_C, y + r * 1.05 * NOTE_S);
  c.ellipse(x, y, r * 1.05, r * 0.78, -0.35, 0, TAU);
}
function noteStem(c, x, y, r) {
  c.moveTo(x + r * 0.9, y - r * 0.2);
  c.lineTo(x + r * 0.9, y - r * 2.6);
  c.quadraticCurveTo(x + r * 2, y - r * 2, x + r * 1.7, y - r * 1.2);
}

// An enemy's silhouette as a fresh path, at radius r.
function body(c, e, r, t) {
  const x = e.x, y = e.y;
  c.beginPath();
  switch (e.shape) {
    case 'square': c.rect(x - r, y - r, r * 2, r * 2); break;
    case 'tri': {
      const a = t * 3 + e.phase;
      for (let i = 0; i < 3; i++) { const aa = a + (i / 3) * TAU; c.lineTo(x + Math.cos(aa) * r * 1.25, y + Math.sin(aa) * r * 1.25); }
      c.closePath();
      break;
    }
    case 'hex': {
      for (let i = 0; i < 6; i++) { const aa = (i / 6) * TAU + e.phase; c.lineTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r); }
      c.closePath();
      break;
    }
    case 'diamond': c.moveTo(x, y - r * 1.3); c.lineTo(x + r, y); c.lineTo(x, y + r * 1.3); c.lineTo(x - r, y); c.closePath(); break;
    case 'ring': case 'snare': c.arc(x, y, r, 0, TAU); break;
    case 'stomp': {
      // A speaker cabinet: a flat-sided octagon.
      for (let i = 0; i < 8; i++) { const aa = ((i + 0.5) / 8) * TAU; c.lineTo(x + Math.cos(aa) * r * 1.08, y + Math.sin(aa) * r * 1.08); }
      c.closePath();
      break;
    }
    case 'glitch': default: {
      // A torn block: its two halves slide apart, wider for a moment after a blink.
      const o = r * (e.ai.glitchT ? 0.55 : 0.25);
      c.rect(x - r + o, y - r * 0.8, r * 2, r * 0.8);
      c.rect(x - r - o, y, r * 2, r * 0.8);
      break;
    }
  }
}

// The quiet marks inside a body, added to the current path: Static's scan lines, the Hum's core, the Feedback's
// inner ring, the Snare's wires, the Stomp's speaker cone (it pumps while its lane is lit).
function marks(c, e, r) {
  const x = e.x, y = e.y;
  switch (e.shape) {
    case 'square':
      c.moveTo(x - r * 0.55, y - r * 0.25); c.lineTo(x + r * 0.55, y - r * 0.25);
      c.moveTo(x - r * 0.55, y + r * 0.25); c.lineTo(x + r * 0.15, y + r * 0.25);
      break;
    case 'hex': c.moveTo(x + r * 0.42, y); c.arc(x, y, r * 0.42, 0, TAU); break;
    case 'ring': c.moveTo(x + r * 0.55, y); c.arc(x, y, r * 0.55, 0, TAU); break;
    case 'snare':
      c.moveTo(x - r * 0.65, y - r * 0.3); c.lineTo(x + r * 0.65, y - r * 0.3);
      c.moveTo(x - r * 0.65, y + r * 0.3); c.lineTo(x + r * 0.65, y + r * 0.3);
      break;
    case 'stomp': {
      const k = e.ai.chargeWarn ? 1 - e.ai.chargeWarn.t / BEAT_SEC : 0;
      const rr = r * (0.55 + 0.25 * k);
      c.moveTo(x + rr, y); c.arc(x, y, rr, 0, TAU);
      break;
    }
  }
}

// A threat: it shoots, marks the floor, charges down a lane or hunts you (an elite).
const isThreat = (e) => e.elite || e.def.ranged || e.def.mortar || e.def.charger;

// An enemy shot's teardrop, added to the current path: head radius R at (x, y), the tail k*R long behind it along
// angle a, meeting the head at th.
function tear(c, x, y, a, R, k, th) {
  c.moveTo(x - Math.cos(a) * R * k, y - Math.sin(a) * R * k);
  c.arc(x, y, R, a - Math.PI + th, a + Math.PI - th);
  c.closePath();
}

// A little eighth note: the XP pickup.
function drawNote(c, x, y, r, color) {
  c.fillStyle = color;
  c.save();
  c.translate(x, y);
  c.rotate(-0.35);
  c.beginPath(); c.ellipse(0, 0, r * 1.05, r * 0.78, 0, 0, TAU); c.fill();
  c.restore();
  c.strokeStyle = color;
  c.lineWidth = Math.max(1.2, r * 0.32);
  c.beginPath();
  c.moveTo(x + r * 0.9, y - r * 0.2);
  c.lineTo(x + r * 0.9, y - r * 2.6);
  c.quadraticCurveTo(x + r * 2, y - r * 2, x + r * 1.7, y - r * 1.2);
  c.stroke();
}

export function shape(c, kind, x, y, r, rot = 0) {
  switch (kind) {
    case 'square':
      c.save(); c.translate(x, y); c.rotate(rot); c.fillRect(-r, -r, r * 2, r * 2); c.restore(); break;
    case 'star':
      c.save(); c.translate(x, y); c.rotate(rot); star(c, 0, 0, r * 1.3, 5); c.fill(); c.restore(); break;
    case 'seed':
      c.save(); c.translate(x, y); c.rotate(rot); c.beginPath(); c.ellipse(0, 0, r * 1.3, r * 0.7, 0, 0, TAU); c.fill(); c.restore(); break;
    case 'note':
      drawNote(c, x, y, r * 0.8, c.fillStyle); break;
    case 'coin':
      c.beginPath(); c.ellipse(x, y, r * Math.abs(Math.cos(rot)) + 0.8, r, 0, 0, TAU); c.fill(); break;
    case 'diamond':
      c.save(); c.translate(x, y); c.rotate(rot + Math.PI / 4); c.fillRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6); c.restore(); break;
    case 'ring':
      c.lineWidth = Math.max(1.5, r * 0.4); c.strokeStyle = c.fillStyle; circle(c, x, y, r); c.stroke(); break;
    case 'dot':
    default:
      circle(c, x, y, r); c.fill();
  }
}

function hslHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `${to(f(0))}${to(f(8))}${to(f(4))}`;
}
