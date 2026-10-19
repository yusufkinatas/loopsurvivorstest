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
    this.dashTrail = [];
    this.trailClock = 0;
    this.reducedFlash = false;
    this.motionPreference = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
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

  // ------------------------------------------------------------------------------------------

  begin(dt) {
    this.time += dt;
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return c;
  }

  // Attract mode borrows the stage's vinyl geometry, leaving the center quiet for the title.
  drawAttract(dt, pulse, settings = {}) {
    const c = this.begin(dt);
    this.reducedFlash = settings.flashes === false;
    const motion = settings.motion !== false && !this.motionPreference?.matches;
    if (motion) { this.cam.x += dt * 9; this.cam.y += dt * 3; }
    this._background(c, 64, motion ? pulse * 0.35 : 0, 0, 0, 0);
    const r = Math.max(this.w, this.h) * 0.36;
    const x = this.w * 0.79, y = this.h * 0.56;
    c.save();
    c.translate(x, y);
    c.rotate(motion ? this.time * 0.025 : 0);
    c.strokeStyle = 'rgba(229,233,211,0.035)';
    c.lineWidth = 1;
    for (let i = 0; i < 28; i++) { circle(c, 0, 0, r * (0.39 + i * 0.021)); c.stroke(); }
    c.strokeStyle = 'rgba(202,255,113,0.13)';
    c.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      c.beginPath(); c.arc(0, 0, r * (0.96 + i * 0.045), 0.12 + i * 0.35, 1.48 + i * 0.35); c.stroke();
    }
    c.strokeStyle = 'rgba(229,233,211,0.07)';
    circle(c, 0, 0, r * 0.3); c.stroke();
    circle(c, 0, 0, r * 0.13); c.stroke();
    c.restore();
  }

  _background(c, hue, beat, bar, sx = 0, sy = 0) {
    const w = this.w, h = this.h, s = this.scale;
    const pulse = this.reducedFlash ? 0 : beat;
    const camX = this.cam.x + sx, camY = this.cam.y + sy;
    c.fillStyle = '#101210';
    c.fillRect(0, 0, w, h);
    const vg = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.68);
    vg.addColorStop(0, `hsla(${hue}, 36%, 25%, ${0.19 + pulse * 0.04})`);
    vg.addColorStop(1, 'rgba(8,10,9,0)');
    c.fillStyle = vg;
    c.fillRect(0, 0, w, h);
    // A low-contrast stage grid provides movement cues without competing with attacks.
    const step = 64 * s;
    const ox = ((-camX * s + w / 2) % step + step) % step;
    const oy = ((-camY * s + h / 2) % step + step) % step;
    c.lineWidth = 1;
    c.strokeStyle = `rgba(194,209,177,${0.027 + pulse * 0.018})`;
    c.beginPath();
    for (let x = ox; x < w; x += step) { c.moveTo(Math.round(x) + 0.5, 0); c.lineTo(Math.round(x) + 0.5, h); }
    for (let y = oy; y < h; y += step) { c.moveTo(0, Math.round(y) + 0.5); c.lineTo(w, Math.round(y) + 0.5); }
    c.stroke();
    // Registration crosses and record-shaped floor inlays make the arena a recognizable place.
    const tile = 768;
    const left = camX - w / s / 2, top = camY - h / s / 2;
    c.save();
    c.translate(w / 2 - camX * s, h / 2 - camY * s);
    c.scale(s, s);
    for (let ty = Math.floor(top / tile); ty <= Math.ceil((top + h / s) / tile); ty++) {
      for (let tx = Math.floor(left / tile); tx <= Math.ceil((left + w / s) / tile); tx++) {
        const x = tx * tile, y = ty * tile;
        c.strokeStyle = 'rgba(211,218,192,0.065)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x - 8, y); c.lineTo(x + 8, y);
        c.moveTo(x, y - 8); c.lineTo(x, y + 8);
        c.stroke();
        c.strokeStyle = 'rgba(211,218,192,0.035)';
        for (let i = 0; i < 4; i++) { circle(c, x + 384, y + 384, 112 + i * 9); c.stroke(); }
        c.beginPath(); c.arc(x + 384, y + 384, 82, -Math.PI * 0.15, Math.PI * 1.15); c.stroke();
        c.fillStyle = 'rgba(216,225,198,0.065)';
        c.font = '600 9px ui-monospace, monospace';
        c.textAlign = 'left';
        c.fillText('LOOP / LIVE', x + 290, y + 391);
        c.fillText('33⅓', x + 414, y + 391);
        // Eight level bars double as stage tape markings. They breathe, but never blink.
        for (let i = 0; i < 8; i++) {
          const amp = 9 + (Math.sin(i * 2.1 + tx + ty) + 1) * 8 + pulse * (i % 3 + 1) * 3;
          c.fillStyle = i === 7 ? 'rgba(202,255,113,0.09)' : 'rgba(211,218,192,0.045)';
          c.fillRect(x + 36 + i * 7, y + 58 - amp, 3, amp);
        }
        c.strokeStyle = 'rgba(211,218,192,0.045)';
        c.beginPath();
        c.moveTo(x + 20, y + 19); c.lineTo(x + 20, y + 71); c.lineTo(x + 102, y + 71);
        c.moveTo(x + 748, y + 697); c.lineTo(x + 748, y + 749); c.lineTo(x + 666, y + 749);
        c.stroke();
      }
    }
    c.restore();
  }

  draw(g, dt) {
    const c = this.begin(dt);
    const p = g.player;
    this.reducedFlash = g.settings.flashes === false;
    if (this._game !== g || g.time < (this._gameTime ?? 0)) { this.dashTrail.length = 0; this._game = g; }
    this._gameTime = g.time;
    const targetHue = g.section?.hue ?? 248;
    let dh = targetHue - this.hue;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    this.hue = (this.hue + dh * Math.min(1, dt * 1.5) + 360) % 360;

    // Camera
    this.cam.x = lerp(this.cam.x, p.x, Math.min(1, dt * 8));
    this.cam.y = lerp(this.cam.y, p.y, Math.min(1, dt * 8));
    const shakeAmt = g.settings.shake ? g.shake : 0;
    // Visual jitter must not consume the simulation's seeded random stream.
    const sx = shakeAmt ? (Math.random() * 2 - 1) * shakeAmt : 0;
    const sy = shakeAmt ? (Math.random() * 2 - 1) * shakeAmt : 0;

    this._background(c, this.hue, g.beatPulse, g.barPulse, sx, sy);

    const s = this.scale;
    c.setTransform(this.dpr * s, 0, 0, this.dpr * s, this.dpr * (this.w / 2 - (this.cam.x + sx) * s), this.dpr * (this.h / 2 - (this.cam.y + sy) * s));
    const vw = this.w / s / 2 + 80, vh = this.h / s / 2 + 80;
    const cx = this.cam.x, cy = this.cam.y;
    const inView = (x, y, r = 0) => Math.abs(x - cx) < vw + r && Math.abs(y - cy) < vh + r;

    // Soft stage light under the player that thumps with the kick, and a floor ripple on every beat.
    c.globalCompositeOperation = 'lighter';
    const thump = this.reducedFlash ? 0 : Math.max(g.beatPulse, g.chanPulse.beat || 0);
    this.drawGlow(p.x, p.y, 100 + thump * 16, `#${hslHex(Math.round(this.hue / 10) * 10 % 360, 70, 55)}`, 0.11 + thump * 0.07);
    c.globalCompositeOperation = 'source-over';
    if (g.beatPulse > 0.05 && !this.reducedFlash) {
      c.strokeStyle = `hsla(${Math.round(this.hue)}, 80%, 70%, ${g.beatPulse * 0.07})`;
      c.lineWidth = 2;
      circle(c, p.x, p.y, 36 + (1 - g.beatPulse) * 140); c.stroke();
    }

    this._dashTrail(c, g, dt);
    this._pickups(c, g, inView);
    this._mines(c, g, inView);
    this._strikes(c, g, inView);
    c.globalCompositeOperation = 'lighter';
    this._orbits(c, g);
    this._bullets(c, g, inView);
    this._rings(c, g);
    this._beams(c, g);
    this._particles(c, g, inView);
    c.globalCompositeOperation = 'source-over';
    // The player and everything that can hurt them go on top of the band's effects, so they stay readable.
    this._enemies(c, g, inView);
    this._player(c, g);
    this._telegraphs(c, g);
    this._shots(c, g, inView);
    this._texts(c, g, inView);
    this._bossArrow(c, g);

    // Screen-space overlays
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const low = p.hp / p.maxHp;
    if (low < 0.3 || g.hurtFlash > 0.02) {
      const a = Math.max(g.settings.flashes ? g.hurtFlash * 0.34 : 0, low < 0.3 ? (0.3 - low) * 0.8 * (this.reducedFlash ? 1 : 0.8 + 0.2 * g.beatPulse) : 0);
      const vg = c.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.3, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
      vg.addColorStop(0, 'rgba(255,40,70,0)');
      vg.addColorStop(1, `rgba(255,40,70,${a})`);
      c.fillStyle = vg;
      c.fillRect(0, 0, this.w, this.h);
    }
    // Player position on screen, for screen-space effects centered on them.
    const px = (p.x - this.cam.x) * s + this.w / 2, py = (p.y - this.cam.y) * s + this.h / 2;
    if (g.dropState === 'building') {
      // One bar of build: the screen darkens, a ring closes in on you, and four beat ticks light up.
      const cur = g.seq.sounding(g.clock.now() - (g.opts.sim ? 0 : g.audio?.latency || 0));
      const prog = cur ? cur.sib / 16 : 0;
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
    const bob = 1 + (this.reducedFlash ? 0 : g.beatPulse * 0.055);
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
    const flash = !this.reducedFlash && e.flash > 0;
    const stroke = flash ? '#f0eedb' : e.elite ? '#ffd166' : e.color;
    c.fillStyle = flash ? '#32382e' : '#171b19';
    c.beginPath();
    switch (e.shape) {
      case 'square':
        // Clipped corners give the common enemy a little speaker-cabinet silhouette.
        c.moveTo(e.x - r * 0.7, e.y - r); c.lineTo(e.x + r * 0.7, e.y - r);
        c.lineTo(e.x + r, e.y - r * 0.7); c.lineTo(e.x + r, e.y + r * 0.7);
        c.lineTo(e.x + r * 0.7, e.y + r); c.lineTo(e.x - r * 0.7, e.y + r);
        c.lineTo(e.x - r, e.y + r * 0.7); c.lineTo(e.x - r, e.y - r * 0.7); c.closePath();
        break;
      case 'tri': {
        const a = Math.atan2(e.ai.faceY ?? 0, e.ai.faceX ?? 1) + Math.sin(t * 3 + e.phase) * 0.3;
        for (let i = 0; i < 3; i++) { const aa = a + (i / 3) * TAU; c.lineTo(e.x + Math.cos(aa) * r * 1.2, e.y + Math.sin(aa) * r * 1.2); }
        c.closePath();
        break;
      }
      case 'hex':
        for (let i = 0; i < 6; i++) { const aa = (i / 6) * TAU; c.lineTo(e.x + Math.cos(aa) * r, e.y + Math.sin(aa) * r); }
        c.closePath();
        break;
      case 'diamond':
        c.moveTo(e.x, e.y - r * 1.25); c.lineTo(e.x + r, e.y); c.lineTo(e.x, e.y + r * 1.25); c.lineTo(e.x - r, e.y); c.closePath();
        break;
      case 'ring': c.arc(e.x, e.y, r, 0, TAU); break;
      case 'glitch': default: {
        const ox = e.ai.glitchT && !this.reducedFlash ? Math.sin(t * 28) * 3 : 0;
        c.moveTo(e.x - r + ox, e.y - r * 0.8); c.lineTo(e.x + r, e.y - r * 0.8);
        c.lineTo(e.x + r, e.y); c.lineTo(e.x + r * 0.7, e.y);
        c.lineTo(e.x + r * 0.7, e.y + r * 0.8); c.lineTo(e.x - r, e.y + r * 0.8); c.closePath();
        break;
      }
    }
    // A dark outer keyline protects silhouettes when bright attacks pass behind them.
    c.strokeStyle = '#0b0e0c'; c.lineWidth = e.elite ? 7 : 5; c.stroke();
    c.fill();
    c.strokeStyle = stroke; c.lineWidth = e.elite ? 2.8 : 1.7; c.stroke();
    c.fillStyle = stroke;
    if (e.shape === 'tri') {
      circle(c, e.x, e.y, Math.max(1.4, r * 0.19)); c.fill();
    } else if (e.shape === 'hex' || e.shape === 'ring') {
      c.strokeStyle = rgba(e.color, 0.64); c.lineWidth = 1.4;
      circle(c, e.x, e.y, r * 0.6); c.stroke();
      circle(c, e.x, e.y, r * 0.28); c.stroke();
      if (e.shape === 'hex') {
        c.fillRect(e.x - r * 0.14, e.y - r * 0.72, r * 0.28, r * 0.22);
        c.fillRect(e.x - r * 0.14, e.y + r * 0.5, r * 0.28, r * 0.22);
      }
    } else if (e.shape === 'diamond') {
      c.beginPath(); c.moveTo(e.x - r * 0.4, e.y); c.lineTo(e.x, e.y - r * 0.4);
      c.lineTo(e.x + r * 0.4, e.y); c.lineTo(e.x, e.y + r * 0.4); c.closePath(); c.fill();
    } else {
      c.fillRect(e.x - r * 0.54, e.y - r * 0.24, r * 0.3, r * 0.24);
      c.fillRect(e.x + r * 0.24, e.y - r * 0.24, r * 0.3, r * 0.24);
      c.fillStyle = rgba(e.color, 0.35);
      c.fillRect(e.x - r * 0.48, e.y + r * 0.33, r * 0.96, 1.4);
    }
    if (e.def.ranged && (e.ai.windup > 0 || e.ai.shootT)) {
      const k = e.ai.windup > 0 ? 1 - e.ai.windup / BEAT_SEC : 1;
      c.strokeStyle = rgba('#ff4d6d', 0.55 + k * 0.4); c.lineWidth = 1.5;
      circle(c, e.x, e.y, r * (1.15 + 0.5 * k)); c.stroke();
      c.globalCompositeOperation = 'lighter';
      this.drawGlow(e.x, e.y, r * (1.2 + k), '#ff4d6d', this.reducedFlash ? 0.12 : 0.12 + 0.23 * k);
      c.globalCompositeOperation = 'source-over';
    }
  }

  _boss(c, g, e, r) {
    const t = this.time;
    const flash = !this.reducedFlash && e.flash > 0;
    const col = flash ? '#ffffff' : e.color;
    c.globalCompositeOperation = 'lighter';
    this.drawGlow(e.x, e.y, r * 2.6, e.color, this.reducedFlash ? 0.2 : 0.2 + g.beatPulse * 0.12);
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
        const ox = e.ai.blinkTo && !this.reducedFlash ? Math.sin(t * 32) * 4 : 0;
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
        for (let i = 0; i < 28; i++) {
          const drift = this.reducedFlash ? 0 : t * 9;
          const yy = ((i * 13.7 + drift) % (r * 2)) - r;
          const xx = Math.sin(i * 7.13) * r * 0.8;
          c.fillStyle = `rgba(230,235,220,${0.2 + (i % 4) * 0.08})`;
          c.fillRect(e.x + xx, e.y + yy, 4 + (i % 5) * 4, 2);
        }
        c.restore();
        c.lineWidth = 4;
        c.beginPath();
        for (let i = 0; i <= 40; i++) {
          const a = (i / 40) * TAU;
          const rr = r + Math.sin(i * 4.7 + (this.reducedFlash ? 0 : t * 4)) * 3;
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
        const blink = this.reducedFlash ? 1 : 0.8 + 0.2 * Math.sin(this.time * 8);
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
  _bossArrow(c, g) {
    const e = g.boss;
    if (!e || e.dead) return;
    const s = this.scale;
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

  _dashTrail(c, g, dt) {
    const p = g.player;
    this.trailClock += dt;
    for (const q of this.dashTrail) q.age += dt;
    this.dashTrail = this.dashTrail.filter((q) => q.age < 0.25);
    if (p.dashT > 0 && this.trailClock > 0.02) {
      this.dashTrail.push({ x: p.x, y: p.y, age: 0, color: p.dashPerfect ? '#ffe28a' : '#6fffe9', lean: p.faceX * 0.13 });
      this.trailClock = 0;
    }
    for (const q of this.dashTrail) {
      const k = 1 - q.age / 0.25;
      c.save(); c.translate(q.x, q.y); c.rotate(q.lean);
      c.globalAlpha = k * (this.reducedFlash ? 0.16 : 0.3);
      c.fillStyle = q.color;
      c.beginPath(); c.ellipse(0, 5, p.r * 0.83, p.r * 0.6, 0, 0, TAU); c.fill();
      circle(c, 0, -p.r * 0.25, p.r * 0.65); c.fill();
      c.strokeStyle = q.color; c.lineWidth = 3;
      c.beginPath(); c.arc(0, -p.r * 0.25, p.r * 0.84, Math.PI, TAU); c.stroke();
      c.restore();
    }
  }

  _player(c, g) {
    const p = g.player;
    const beat = this.reducedFlash ? 0 : g.beatPulse;
    const r = p.r;
    const dash = p.dashT > 0;
    const accent = dash ? (p.dashPerfect ? '#ffe28a' : '#6fffe9') : '#caff71';
    c.save();
    if ((g.comboMultiplier || 1) > 1) {
      this.drawGlow(p.x, p.y, r * 3, '#caff71', 0.035 * g.comboMultiplier);
    }
    if (p.iframes > 0 && !dash) c.globalAlpha = this.reducedFlash ? 0.8 : 0.7 + Math.sin(this.time * 20) * 0.2;
    // Ground shadow and one segmented mixer halo frame the character without hiding their feet.
    c.fillStyle = 'rgba(4,8,5,0.78)';
    c.beginPath(); c.ellipse(p.x, p.y + 6, r + 7, r + 5, 0, 0, TAU); c.fill();
    for (let i = 0; i < ROLES.length; i++) {
      const role = ROLES[i];
      if (!g.loadout.channels[role]) continue;
      const k = this.reducedFlash ? 0.3 : (g.chanPulse[role] || 0);
      const a = -Math.PI / 2 + i / 6 * TAU;
      c.strokeStyle = rgba(ROLE_INFO[role].color, 0.38 + k * 0.5);
      c.lineWidth = 1.7 + k * 0.8;
      c.beginPath(); c.arc(p.x, p.y, r + 7 + k * 1.4, a + 0.12, a + TAU / 6 - 0.12); c.stroke();
    }
    // A small, stable cooldown arc is readable even when the HUD is outside peripheral vision.
    if (p.dashCooldown !== undefined) {
      const ready = p.dashCooldown <= 0;
      const recovery = clamp(1 - p.dashCooldown / (p.dashMaxCooldown || 1), 0, 1);
      c.strokeStyle = 'rgba(219,230,210,0.12)'; c.lineWidth = 2;
      c.beginPath(); c.arc(p.x, p.y, r + 12, Math.PI * 0.2, Math.PI * 0.8); c.stroke();
      c.strokeStyle = ready ? '#caff71' : 'rgba(219,230,210,0.65)';
      c.beginPath(); c.arc(p.x, p.y, r + 12, Math.PI * 0.2, Math.PI * (0.2 + 0.6 * recovery)); c.stroke();
    }
    // Headphones, visor, and a lime bomber jacket make the player a musician, not another projectile.
    c.translate(p.x, p.y);
    const moving = Math.min(1, Math.hypot(p.vx || 0, p.vy || 0) / 160);
    const walk = Math.sin(this.time * 14) * moving;
    c.rotate(p.faceX * (dash ? 0.2 : 0.075));
    c.fillStyle = '#e9e9d9';
    c.beginPath(); c.ellipse(-r * 0.4, r * 0.69 + walk * 1.2, r * 0.21, r * 0.3, -0.15, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(r * 0.4, r * 0.69 - walk * 1.2, r * 0.21, r * 0.3, 0.15, 0, TAU); c.fill();
    c.fillStyle = accent;
    c.beginPath(); c.ellipse(0, r * 0.3, r * 0.82, r * 0.63, 0, 0, TAU); c.fill();
    c.strokeStyle = '#181e16'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, r * 0.2); c.lineTo(0, r * 0.79); c.stroke();
    c.fillStyle = '#e9e9d9';
    circle(c, -r * 0.77, r * 0.3 + walk, r * 0.2); c.fill();
    circle(c, r * 0.77, r * 0.3 - walk, r * 0.2); c.fill();
    const headY = -r * 0.31 - beat * 0.6;
    c.fillStyle = '#efedda'; circle(c, 0, headY, r * 0.64); c.fill();
    // A dark visor points slightly toward the movement direction.
    c.fillStyle = '#19221c';
    c.beginPath(); c.ellipse(p.faceX * 1.8, headY + 1.5 + p.faceY * 1.1, r * 0.47, r * 0.19, 0, 0, TAU); c.fill();
    c.fillStyle = accent;
    c.fillRect(p.faceX * 1.8 - r * 0.23, headY + 0.4 + p.faceY * 1.1, 2, 2);
    c.fillRect(p.faceX * 1.8 + r * 0.14, headY + 0.4 + p.faceY * 1.1, 2, 2);
    c.strokeStyle = '#0c110e'; c.lineWidth = 5.8;
    c.beginPath(); c.arc(0, headY, r * 0.8, Math.PI * 0.9, TAU + Math.PI * 0.1); c.stroke();
    c.strokeStyle = '#f3f0dc'; c.lineWidth = 2.7;
    c.beginPath(); c.arc(0, headY, r * 0.8, Math.PI * 0.96, TAU + Math.PI * 0.04); c.stroke();
    c.fillStyle = '#253322';
    c.fillRect(-r * 0.94, headY - 2, r * 0.3, r * 0.48);
    c.fillRect(r * 0.64, headY - 2, r * 0.3, r * 0.48);
    c.fillStyle = accent;
    c.fillRect(-r * 0.91, headY - 0.7, 2.4, r * 0.3);
    c.fillRect(r * 0.74, headY - 0.7, 2.4, r * 0.3);
    c.restore();
  }

  _orbits(c, g) {
    for (const grp of g.fx.orbits.values()) {
      for (const it of grp.items) {
        const sz = grp.size * (1 + it.glow * 0.6);
        this.drawGlow(it.x, it.y, sz * 3 + it.glow * 12, grp.color, 0.55 + it.glow * 0.45);
        c.fillStyle = it.glow > 0.3 && !this.reducedFlash ? this.tint(grp.color) : grp.color;
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

  _rings(c, g) {
    for (const r of g.fx.rings) {
      const k = clamp(r.t / r.dur, 0, 1);
      const a = ((1 - k) * 0.9 + 0.05) * (this.reducedFlash ? 0.55 : 1);
      c.strokeStyle = rgba(r.color, a);
      c.lineWidth = r.width * (1 - k * 0.6);
      circle(c, r.x, r.y, r.r); c.stroke();
      c.strokeStyle = rgba('#ffffff', a * 0.2);
      c.lineWidth = 1.5;
      circle(c, r.x, r.y, r.r); c.stroke();
    }
    for (const f of g.fx.flashes) {
      const k = f.age / f.life;
      c.fillStyle = rgba(f.color, (this.reducedFlash ? 0.025 : f.fill * 0.65) * (1 - k));
      circle(c, f.x, f.y, f.r * (0.7 + 0.3 * k)); c.fill();
      c.strokeStyle = rgba(f.color, (this.reducedFlash ? 0.4 : 0.8) * (1 - k));
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
      c.strokeStyle = rgba(this.tint(b.color), (this.reducedFlash ? 0.55 : 0.9) * k);
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
          const jx = s < segs && !this.reducedFlash ? (Math.random() - 0.5) * 16 : 0, jy = s < segs && !this.reducedFlash ? (Math.random() - 0.5) * 16 : 0;
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
