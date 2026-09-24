// Keyboard, touch (floating stick) and gamepad. Movement is the only thing the player steers.

export class Input {
  constructor(canvas, stickEl, onKey) {
    this.keys = new Set();
    this.stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.stickEl = stickEl;
    this.onKey = onKey;
    this.touchUsed = false;
    this.padPrev = {};

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' && e.target.type === 'range')) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k) && !(e.target && e.target.tagName === 'BUTTON' && k === ' ')) e.preventDefault();
      if (!e.repeat) { if (this.onKey(k, e) === true) e.preventDefault(); }
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.delete(k);
    });
    window.addEventListener('blur', () => this.keys.clear());

    const R = 56;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      this.touchUsed = true;
      if (this.stick.active) return;
      this.stick = { active: true, id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      this._drawStick(R);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.stick.active || e.pointerId !== this.stick.id) return;
      let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { this.stick.ox += (dx / d) * (d - R); this.stick.oy += (dy / d) * (d - R); dx = (dx / d) * R; dy = (dy / d) * R; }
      this.stick.x = dx / R; this.stick.y = dy / R;
      this._drawStick(R);
    });
    const end = (e) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick.active = false; this.stick.x = 0; this.stick.y = 0;
      this._drawStick(R);
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  _drawStick(R) {
    const el = this.stickEl;
    if (!el) return;
    if (!this.stick.active) { el.hidden = true; return; }
    el.hidden = false;
    el.style.transform = `translate(${this.stick.ox - R}px, ${this.stick.oy - R}px)`;
    const knob = el.firstElementChild;
    if (knob) knob.style.transform = `translate(${this.stick.x * R * 0.7}px, ${this.stick.y * R * 0.7}px)`;
  }

  releaseStick() { this.stick.active = false; this.stick.x = 0; this.stick.y = 0; this._drawStick(56); }

  move() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('a') || k.has('ArrowLeft')) x -= 1;
    if (k.has('d') || k.has('ArrowRight')) x += 1;
    if (k.has('w') || k.has('ArrowUp')) y -= 1;
    if (k.has('s') || k.has('ArrowDown')) y += 1;
    if (this.stick.active) { x += this.stick.x; y += this.stick.y; }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.22) { x += ax; y += ay; }
      if (gp.buttons[14]?.pressed) x -= 1;
      if (gp.buttons[15]?.pressed) x += 1;
      if (gp.buttons[12]?.pressed) y -= 1;
      if (gp.buttons[13]?.pressed) y += 1;
      break;
    }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  // Edge-triggered gamepad buttons: A = drop / confirm, Start = pause.
  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find(Boolean);
    if (!gp) return;
    const map = { 0: 'pad-a', 9: 'Escape', 2: 'r' };
    for (const idx in map) {
      const pressed = !!gp.buttons[idx]?.pressed;
      if (pressed && !this.padPrev[idx]) this.onKey(map[idx], null);
      this.padPrev[idx] = pressed;
    }
  }
}
