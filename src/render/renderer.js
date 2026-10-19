// Canvas renderer. The arena is a dark stage floor whose grid pulses with the beat and whose
// color follows the song section. Music is color: every attack wears its channel's color.

import { TAU, clamp, lerp, rgba, hexToRgb } from '../util.js';
import { BEAT_SEC } from '../config.js';
import { ROLE_INFO, ROLES } from '../config.js';
import { ITEM_INFO } from '../game/pickups.js';

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

  // Half-transparent channel color: the body of an enemy under that channel's fire.
  hitFill(color) {
    let f = this._fills?.get(color);
    if (f) return f;
    (this._fills ||= new Map()).set(color, f = rgba(color, 0.5));
    return f;
  }

  // ------------------------------------------------------------------------------------------

  begin(dt) {
    this.time += dt;
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return c;
  }

  // Title screen backdrop: the floor grid breathing to a slow pulse.
  drawAttract(dt, pulse) {
    const c = this.begin(dt);
    this.cam.x += dt * 22; this.cam.y += dt * 9;
    this._background(c, 258, pulse, pulse * 0.6);
  }

  _background(c, hue, beat, bar, sx = 0, sy = 0, s = this.scale) {
    const w = this.w, h = this.h;
    const camX = this.cam.x + sx, camY = this.cam.y + sy;
    c.fillStyle = `hsl(${hue}, 38%, 6.5%)`;
    c.fillRect(0, 0, w, h);
    const vg = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    vg.addColorStop(0, `hsla(${hue}, 60%, 20%, ${0.35 + beat * 0.12})`);
    vg.addColorStop(1, `hsla(${hue}, 50%, 3%, 0)`);
    c.fillStyle = vg;
    c.fillRect(0, 0, w, h);
    // Grid in world space
    const step = 64 * s;
    const ox = (-camX * s + w / 2) % step;
    const oy = (-camY * s + h / 2) % step;
    c.lineWidth = 1;
    c.strokeStyle = `hsla(${hue}, 70%, 70%, ${0.04 + beat * 0.14})`;
    c.beginPath();
    for (let x = ox; x < w; x += step) { c.moveTo(Math.round(x) + 0.5, 0); c.lineTo(Math.round(x) + 0.5, h); }
    for (let y = oy; y < h; y += step) { c.moveTo(0, Math.round(y) + 0.5); c.lineTo(w, Math.round(y) + 0.5); }
    c.stroke();
    // Major lines every 4 cells flash on the downbeat
    const big = step * 4;
    const bx = (-camX * s + w / 2) % big;
    const by = (-camY * s + h / 2) % big;
    c.strokeStyle = `hsla(${hue}, 80%, 72%, ${0.08 + bar * 0.24})`;
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
    const shakeAmt = g.settings.shake ? g.shake : g.shake * 0.2;
    // Cosmetic randomness never draws from the seeded rng, so a seed plays the same run at any frame rate.
    const sx = (Math.random() * 2 - 1) * shakeAmt, sy = (Math.random() * 2 - 1) * shakeAmt;
    // The Drop camera pushes in through the build bar and punches out on the impact. It scales only the drawing,
    // never viewSize(), so spawns, the bot and the game's view are untouched. Screen shake off keeps it still.
    const building = g.dropState === 'building';
    const cur = building ? g.seq.sounding(g.clock.now() - (g.opts.sim ? 0 : g.audio?.latency || 0)) : null;
    const prog = cur ? cur.sib / 16 : 0;
    if (g.drops !== this._drops) { if (g.drops > this._drops) this.zoom = 0.94; this._drops = g.drops; }
    if (!g.settings.shake) this.zoom = 1;
    else if (g.state === 'playing') this.zoom += ((building ? 1 + 0.06 * prog : 1) - this.zoom) * Math.min(1, dt * 7);
    const s = this.scale * this.zoom;

    this._background(c, this.hue, g.beatPulse, g.barPulse, sx, sy, s);

    c.setTransform(this.dpr * s, 0, 0, this.dpr * s, this.dpr * (this.w / 2 - (this.cam.x + sx) * s), this.dpr * (this.h / 2 - (this.cam.y + sy) * s));
    const vw = this.w / s / 2 + 80, vh = this.h / s / 2 + 80;
    const cx = this.cam.x, cy = this.cam.y;
    const inView = (x, y, r = 0) => Math.abs(x - cx) < vw + r && Math.abs(y - cy) < vh + r;

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

    this._pickups(c, g, inView);
    this._mines(c, g, inView);
    this._strikes(c, g, inView);
    this._enemies(c, g, inView);
    c.globalCompositeOperation = 'lighter';
    this._orbits(c, g);
    this._bullets(c, g, inView);
    this._rings(c, g, inView);
    // The silence wave's front, until it has passed the far corner of the view.
    const sw = g.won && g.silence;
    if (sw && sw.r < Math.hypot(Math.abs(sw.x - cx) + vw, Math.abs(sw.y - cy) + vh)) {
      c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 28;
      circle(c, sw.x, sw.y, sw.r); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 6;
      c.stroke();
    }
    this._beams(c, g);
    this._particles(c, g, inView);
    c.globalCompositeOperation = 'source-over';
    // The player and everything that can hurt them go on top of the band's effects, so they stay readable.
    if (g.state === 'dying' || g.state === 'gameover') this._shatter(c, g);
    else this._player(c, g);
    this._telegraphs(c, g);
    this._shots(c, g, inView);
    this._texts(c, g, inView);
    this._bossArrow(c, g, s);

    // Screen-space overlays
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const low = p.hp / p.maxHp;
    if (low < 0.3 || g.hurtFlash > 0.02) {
      const a = Math.max(g.settings.flashes ? g.hurtFlash * 0.45 : g.hurtFlash * 0.15, low < 0.3 ? (0.3 - low) * 0.9 * (0.7 + 0.3 * g.beatPulse) : 0);
      const vg = c.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.3, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
      vg.addColorStop(0, 'rgba(255,40,70,0)');
      vg.addColorStop(1, `rgba(255,40,70,${a})`);
      c.fillStyle = vg;
      c.fillRect(0, 0, this.w, this.h);
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
      c.globalCompositeOperation = 'lighter';
      const fl = c.createRadialGradient(px, py, 0, px, py, Math.max(this.w, this.h) * 0.8);
      fl.addColorStop(0, `rgba(255,255,255,${g.dropFlash * 0.5})`);
      fl.addColorStop(1, `rgba(255,240,255,${g.dropFlash * 0.15})`);
      c.fillStyle = fl;
      c.fillRect(0, 0, this.w, this.h);
      c.globalCompositeOperation = 'source-over';
    }
  }

  // ------------------------------------------------------------------------------------------

  _pickups(c, g, inView) {
    const t = this.time;
    c.globalCompositeOperation = 'lighter';
    for (const gm of g.gems) {
      if (!inView(gm.x, gm.y, 20)) continue;
      this.drawGlow(gm.x, gm.y, gm.r * 2.2, gm.color, gm.kind === 'xp' ? 0.25 : 0.5);
    }
    c.globalCompositeOperation = 'source-over';
    for (const gm of g.gems) {
      if (!inView(gm.x, gm.y, 20)) continue;
      if (gm.kind === 'xp') {
        drawNote(c, gm.x, gm.y + Math.sin(t * 4 + gm.x) * 1.2, gm.r, gm.color);
      } else if (gm.kind === 'vinyl') {
        c.save(); c.translate(gm.x, gm.y); c.rotate(t * 3);
        c.fillStyle = '#121016'; circle(c, 0, 0, gm.r); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 1; circle(c, 0, 0, gm.r * 0.72); c.stroke();
        c.fillStyle = ITEM_INFO.vinyl.color; circle(c, 0, 0, gm.r * 0.38); c.fill();
        c.fillStyle = '#121016'; circle(c, 0, 0, 1.6); c.fill();
        c.restore();
      } else if (gm.kind === 'heal') {
        c.fillStyle = ITEM_INFO.heal.color;
        heart(c, gm.x, gm.y, gm.r * (1 + Math.sin(t * 6) * 0.08));
      } else if (gm.kind === 'magnet') {
        c.strokeStyle = ITEM_INFO.magnet.color; c.lineWidth = 3.5; c.lineCap = 'butt';
        c.beginPath(); c.arc(gm.x, gm.y, gm.r * 0.7, Math.PI, 0, true); c.stroke();
        c.lineCap = 'round';
      }
    }
  }

  _mines(c, g, inView) {
    for (const m of g.fx.mines) {
      if (!inView(m.x, m.y, m.r)) continue;
      const k = Math.min(1, m.age * 6);
      const pulse = 0.6 + 0.4 * g.beatPulse;
      c.strokeStyle = rgba(m.color, 0.18 * k);
      c.lineWidth = 1;
      c.setLineDash([4, 6]);
      circle(c, m.x, m.y, m.r * k); c.stroke();
      c.setLineDash([]);
      c.globalCompositeOperation = 'lighter';
      this.drawGlow(m.x, m.y, m.size * 3.5 * pulse, m.color, 0.7);
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = m.color;
      c.save(); c.translate(m.x, m.y); c.rotate(Math.PI / 4 + m.age);
      c.fillRect(-m.size * 0.6 * k, -m.size * 0.6 * k, m.size * 1.2 * k, m.size * 1.2 * k);
      c.restore();
    }
  }

  _strikes(c, g, inView) {
    for (const s of g.fx.strikes) {
      if (!inView(s.x, s.y, s.r)) continue;
      const k = clamp(s.t / s.delay, 0, 1);
      c.strokeStyle = rgba(s.color, 0.25 + 0.5 * k);
      c.lineWidth = 2;
      circle(c, s.x, s.y, s.r * (1.4 - 0.4 * k)); c.stroke();
      c.fillStyle = rgba(s.color, 0.08 + 0.12 * k);
      circle(c, s.x, s.y, s.r * k); c.fill();
      if (s.style === 'drop' || s.style === 'star') {
        const fall = (1 - k) * 260;
        c.globalCompositeOperation = 'lighter';
        this.drawGlow(s.x, s.y - fall, 14, s.color, 0.9);
        if (s.style === 'star') { c.fillStyle = s.color; star(c, s.x, s.y - fall, 7, 5); c.fill(); }
        c.globalCompositeOperation = 'source-over';
      }
    }
  }

  _enemies(c, g, inView) {
    const bob = 1 + g.beatPulse * 0.09;
    const t = this.time;
    for (const e of g.enemies) {
      if (e.dead || !inView(e.x, e.y, e.r + 10)) continue;
      const spawnK = e.spawnT > 0 ? 1 - e.spawnT / 0.35 : 1;
      const r = e.r * (e.boss ? 1 + g.beatPulse * 0.04 : bob) * spawnK;
      if (r <= 0.5) continue;
      c.globalAlpha = spawnK;
      if (e.boss) this._boss(c, g, e, r);
      else this._enemyShape(c, e, r, t);
      c.globalAlpha = 1;
      if (e.elite && e.hp < e.maxHp) {
        const w = e.r * 2;
        c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(e.x - w / 2, e.y - e.r - 10, w, 4);
        c.fillStyle = '#ffd166'; c.fillRect(e.x - w / 2, e.y - e.r - 10, w * Math.max(0, e.hp / e.maxHp), 4);
      }
    }
  }

  _enemyShape(c, e, r, t) {
    const j = () => (Math.random() - 0.5) * r * 0.16;
    const flash = e.flash > 0;
    // Under fire the body tints in the hitting channel's color and the outline flashes white. Elites keep
    // their dark body and flash only their outline, so they stay recognizable under fire.
    const fill = flash && !e.elite ? this.hitFill(e.hitColor || '#ffffff') : 'rgba(18,14,28,0.92)';
    const stroke = flash ? '#ffffff' : e.elite ? '#ffd166' : e.color;
    c.lineWidth = e.elite ? 3 : 2;
    c.fillStyle = fill;
    c.strokeStyle = stroke;
    c.beginPath();
    switch (e.shape) {
      case 'square': {
        c.moveTo(e.x - r + j(), e.y - r + j()); c.lineTo(e.x + r + j(), e.y - r + j());
        c.lineTo(e.x + r + j(), e.y + r + j()); c.lineTo(e.x - r + j(), e.y + r + j()); c.closePath();
        break;
      }
      case 'tri': {
        const a = Math.atan2(e.ai.faceY ?? 0, e.ai.faceX ?? 1) + t * 3 + e.phase;
        for (let i = 0; i < 3; i++) { const aa = a + (i / 3) * TAU; c.lineTo(e.x + Math.cos(aa) * r * 1.2 + j(), e.y + Math.sin(aa) * r * 1.2 + j()); }
        c.closePath();
        break;
      }
      case 'hex': {
        for (let i = 0; i < 6; i++) { const aa = (i / 6) * TAU + e.phase; c.lineTo(e.x + Math.cos(aa) * r + j(), e.y + Math.sin(aa) * r + j()); }
        c.closePath();
        break;
      }
      case 'diamond': {
        c.moveTo(e.x, e.y - r * 1.25); c.lineTo(e.x + r, e.y); c.lineTo(e.x, e.y + r * 1.25); c.lineTo(e.x - r, e.y); c.closePath();
        break;
      }
      case 'ring': { c.arc(e.x, e.y, r, 0, TAU); break; }
      case 'glitch': default: {
        const ox = e.ai.glitchT ? 4 : 0;
        c.rect(e.x - r + ox, e.y - r * 0.8, r * 2, r * 1.6);
        break;
      }
    }
    c.fill();
    c.stroke();
    if (flash) return;
    // Static inside the shell: flickering scanlines.
    c.fillStyle = rgba(e.color, 0.55);
    const lines = e.shape === 'hex' ? 3 : 2;
    for (let i = 0; i < lines; i++) {
      const yy = e.y - r * 0.5 + ((i + 1) / (lines + 1)) * r + (Math.random() - 0.5) * r * 0.4;
      c.fillRect(e.x - r * 0.55, yy, r * 1.1 * (0.4 + Math.random() * 0.6), 1.5);
    }
    if (e.shape === 'glitch') {
      c.fillStyle = 'rgba(255,60,200,0.35)';
      c.fillRect(e.x - r - 3, e.y - r * 0.5, r * 2, 3);
    }
    if (e.shape === 'ring') {
      c.strokeStyle = rgba(e.color, 0.6); c.lineWidth = 1.5;
      circle(c, e.x, e.y, r * 0.5); c.stroke();
    }
    if (e.def.ranged && (e.ai.windup > 0 || e.ai.shootT)) {
      // Wind-up tell: the glow swells for a beat before the shot.
      const k = e.ai.windup > 0 ? 1 - e.ai.windup / BEAT_SEC : 1;
      c.globalCompositeOperation = 'lighter';
      this.drawGlow(e.x, e.y, r * (1.2 + 1.6 * k), '#ff4d6d', 0.35 + 0.55 * k);
      c.globalCompositeOperation = 'source-over';
    }
  }

  _boss(c, g, e, r) {
    const t = this.time;
    const flash = e.flash > 0;
    const col = flash ? '#ffffff' : e.color;
    c.globalCompositeOperation = 'lighter';
    this.drawGlow(e.x, e.y, r * 2.6, e.color, 0.35 + g.beatPulse * 0.25);
    c.globalCompositeOperation = 'source-over';
    // Bosses are hit constantly: keep the silhouette dark and flash only the outline.
    c.fillStyle = 'rgba(14,10,22,0.95)';
    c.strokeStyle = col;
    c.lineWidth = flash ? 4 : 3;
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
        for (let i = 0; i < 90; i++) {
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

  // Enemy shots use a look no player attack has: a dark halo, a white outline and a colored rim,
  // with a minimum on-screen size so they stay visible on small screens.
  _shots(c, g, inView) {
    const minR = 5 / this.scale;
    for (const s of g.shots) {
      if (!inView(s.x, s.y, 10)) continue;
      const r = Math.max(s.r, minR);
      c.fillStyle = 'rgba(8,4,12,0.85)';
      circle(c, s.x, s.y, r * 1.45); c.fill();
      c.strokeStyle = '#ffffff'; c.lineWidth = 1.2;
      circle(c, s.x, s.y, r * 1.45); c.stroke();
      c.strokeStyle = s.color; c.lineWidth = 2.6;
      circle(c, s.x, s.y, r * 0.95); c.stroke();
      c.fillStyle = '#ff2d55';
      circle(c, s.x, s.y, r * 0.38); c.fill();
    }
  }

  // Boss tells, drawn wherever the tell is (the boss itself may be off-screen).
  _telegraphs(c, g) {
    for (const e of g.enemies) {
      if (!e.boss || e.dead) continue;
      const bt = e.ai.blinkTo;
      if (bt) {
        // Landing marker in the danger palette (red and white), so it never looks like a player attack.
        const k = clamp((g.time - (e.ai.blinkSetAt ?? g.time)) / (BEAT_SEC * 2), 0, 1);
        const blink = 0.6 + 0.4 * Math.sin(this.time * 18);
        c.fillStyle = `rgba(255,45,85,${0.1 + 0.14 * k})`;
        circle(c, bt.x, bt.y, e.r); c.fill();
        c.strokeStyle = `rgba(255,255,255,${(0.55 + 0.4 * k) * blink})`;
        c.lineWidth = 3.5;
        circle(c, bt.x, bt.y, e.r * (2 - k)); c.stroke();
        c.strokeStyle = 'rgba(255,45,85,0.9)';
        c.lineWidth = 2;
        circle(c, bt.x, bt.y, e.r); c.stroke();
        c.setLineDash([8, 8]);
        c.strokeStyle = 'rgba(255,45,85,0.55)';
        c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(bt.x, bt.y); c.stroke();
        c.setLineDash([]);
        c.strokeStyle = 'rgba(255,255,255,0.8)';
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * TAU;
          c.beginPath();
          c.moveTo(bt.x + Math.cos(a) * e.r * 1.1, bt.y + Math.sin(a) * e.r * 1.1);
          c.lineTo(bt.x + Math.cos(a) * e.r * 1.35, bt.y + Math.sin(a) * e.r * 1.35);
          c.stroke();
        }
      }
      const cw = e.ai.chargeWarn;
      if (cw && cw.t > 0) {
        // The Drone's charge lane lights up a beat before it dashes.
        const L = e.speed * 3.4 * 0.75 + e.r;
        const k = 1 - cw.t / BEAT_SEC;
        c.save();
        c.translate(e.x, e.y); c.rotate(cw.a);
        c.fillStyle = `rgba(255,45,85,${0.08 + 0.14 * k})`;
        c.fillRect(0, -e.r, L, e.r * 2);
        c.strokeStyle = rgba('#ffffff', 0.3 + 0.4 * k);
        c.lineWidth = 2;
        c.strokeRect(0, -e.r, L * k, e.r * 2);
        c.restore();
      }
    }
  }

  // An arrow pointing at a boss that is off-screen or hidden under the HUD, drawn inside the clear play area.
  _bossArrow(c, g, s) {
    const e = g.boss;
    if (!e || e.dead) return;
    const top = 72, bottom = this.w < 760 ? 150 : 104, side = 24;
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
    const sz = 15;
    c.fillStyle = e.color;
    c.strokeStyle = 'rgba(8,4,12,0.9)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(sz, 0); c.lineTo(-sz * 0.7, sz * 0.75); c.lineTo(-sz * 0.35, 0); c.lineTo(-sz * 0.7, -sz * 0.75); c.closePath();
    c.stroke(); c.fill();
    c.restore();
  }

  _player(c, g) {
    const p = g.player;
    if (p.iframes > 0 && Math.floor(this.time * 24) % 2 === 0) c.globalAlpha = 0.45;
    const r = p.r * (1 + g.beatPulse * 0.06);
    c.fillStyle = 'rgba(8,6,14,0.6)';
    circle(c, p.x, p.y, r + 9); c.fill();
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

  // The death beat: the channel rings break into arcs that fly off and fade, and the speaker splits into four
  // wedges that drift apart. Cracks show from the first frame, so no intact speaker appears after the lethal hit.
  _shatter(c, g) {
    const p = g.player;
    const k = g.state === 'dying' ? clamp(1 - g.dyingT / 0.9, 0, 1) : 1;
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
    for (const grp of g.fx.orbits.values()) {
      for (const it of grp.items) {
        const sz = grp.size * (1 + it.glow * 0.6);
        this.drawGlow(it.x, it.y, sz * 3 + it.glow * 12, grp.color, 0.55 + it.glow * 0.45);
        c.fillStyle = it.glow > 0.3 ? '#ffffff' : grp.color;
        shape(c, grp.shape, it.x, it.y, sz, this.time * 2);
      }
    }
  }

  _bullets(c, g, inView) {
    // Glows (additive) first, then cores in their channel tint (normal blend, so crowds don't sum to white).
    const fades = this._fades || (this._fades = []);
    fades.length = 0;
    for (const b of g.fx.bullets) {
      const end = b.maxAge ?? b.life;
      let fade = b.age > end - 0.15 ? Math.max(0, (end - b.age) / 0.15) : 1;
      fade *= clamp(b.age / 0.08, 0.15, 1);   // grow in, so shots leaving the player don't bury it
      fades.push(fade);
      if (!inView(b.x, b.y, 20)) continue;
      this.drawGlow(b.x, b.y, b.r * 3, b.color, 0.5 * fade);
    }
    c.globalCompositeOperation = 'source-over';
    let k = 0;
    for (const b of g.fx.bullets) {
      const fade = fades[k++];
      if (!inView(b.x, b.y, 20) || fade <= 0) continue;
      c.globalAlpha = fade;
      c.fillStyle = this.tint(b.color);
      if (b.shape === 'shard') {
        const a = Math.atan2(b.vy, b.vx);
        c.save(); c.translate(b.x, b.y); c.rotate(a);
        c.beginPath(); c.moveTo(b.r * 1.8, 0); c.lineTo(-b.r * 1.2, b.r * 0.55); c.lineTo(-b.r * 1.2, -b.r * 0.55); c.closePath(); c.fill();
        c.restore();
      } else {
        shape(c, b.shape, b.x, b.y, b.r * 0.8, b.rot);
        if (b.r >= 6) { c.fillStyle = '#ffffff'; circle(c, b.x, b.y, b.r * 0.22); c.fill(); }
      }
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'lighter';
  }

  _rings(c, g, inView) {
    for (const r of g.fx.rings) {
      if (!inView(r.x, r.y, r.r)) continue;
      const k = clamp(r.t / r.dur, 0, 1);
      const a = (1 - k) * 0.9 + 0.05;
      c.strokeStyle = rgba(r.color, a);
      c.lineWidth = r.width * (1 - k * 0.6);
      circle(c, r.x, r.y, r.r); c.stroke();
      c.strokeStyle = rgba('#ffffff', a * 0.2);
      c.lineWidth = 1.5;
      circle(c, r.x, r.y, r.r); c.stroke();
    }
    for (const f of g.fx.flashes) {
      if (!inView(f.x, f.y, f.r)) continue;
      const k = f.age / f.life;
      if (f.fill > 0) { c.fillStyle = rgba(f.color, f.fill * (1 - k)); circle(c, f.x, f.y, f.r * (0.7 + 0.3 * k)); c.fill(); }
      c.strokeStyle = rgba(f.color, 0.8 * (1 - k));
      c.lineWidth = 2.5 * (1 - k) + 0.5;
      circle(c, f.x, f.y, f.r * (0.7 + 0.3 * k)); c.stroke();
    }
  }

  _beams(c, g) {
    for (const b of g.fx.beams) {
      const k = 1 - b.age / b.life;
      c.lineCap = 'round';
      c.strokeStyle = rgba(b.color, 0.35 * k);
      c.lineWidth = b.width * 2.2 * k;
      c.beginPath(); c.moveTo(b.x1, b.y1); c.lineTo(b.x2, b.y2); c.stroke();
      c.strokeStyle = rgba('#ffffff', 0.9 * k);
      c.lineWidth = Math.max(1, b.width * 0.45 * k);
      c.beginPath(); c.moveTo(b.x1, b.y1); c.lineTo(b.x2, b.y2); c.stroke();
    }
    for (const z of g.fx.zaps) {
      const k = 1 - z.age / z.life;
      c.strokeStyle = rgba(z.color, 0.9 * k);
      c.lineWidth = z.width;
      c.beginPath();
      for (let i = 0; i < z.pts.length - 1; i++) {
        const [x1, y1] = z.pts[i], [x2, y2] = z.pts[i + 1];
        c.moveTo(x1, y1);
        const segs = 4;
        for (let s = 1; s <= segs; s++) {
          const tt = s / segs;
          const jx = s < segs ? (Math.random() - 0.5) * 16 : 0, jy = s < segs ? (Math.random() - 0.5) * 16 : 0;
          c.lineTo(x1 + (x2 - x1) * tt + jx, y1 + (y2 - y1) * tt + jy);
        }
      }
      c.stroke();
      for (let i = 1; i < z.pts.length; i++) this.drawGlow(z.pts[i][0], z.pts[i][1], 16, z.color, 0.7 * k);
    }
  }

  _particles(c, g, inView) {
    for (const q of g.fx.parts) {
      if (!inView(q.x, q.y)) continue;
      const k = 1 - q.age / q.life;
      c.fillStyle = rgba(q.color, 0.9 * k);
      const s = q.size * k;
      c.fillRect(q.x - s / 2, q.y - s / 2, s, s);
    }
  }

  _texts(c, g, inView) {
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const t of g.fx.texts) {
      if (!inView(t.x, t.y)) continue;
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

function heart(c, x, y, r) {
  c.beginPath();
  c.moveTo(x, y + r * 0.9);
  c.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.6, y - r * 1.2, x, y - r * 0.4);
  c.bezierCurveTo(x + r * 0.6, y - r * 1.2, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
  c.fill();
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
