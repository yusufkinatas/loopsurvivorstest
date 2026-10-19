// Keyboard, touch (floating stick) and gamepad. Movement is the only thing the player steers.
// The device used last is kept on body[data-input] (key, mouse, touch or pad), so prompts can match it.

// Gamepad buttons (W3C standard mapping) and the keys they send. LB and RB step the Gain on the
// first-sound screen.
const PAD_MAP = { 0: 'pad-a', 1: 'pad-b', 2: 'r', 4: 'gain-down', 5: 'gain-up', 9: 'Escape', 12: 'pad-up', 13: 'pad-down', 14: 'pad-left', 15: 'pad-right' };

export class Input {
  constructor(canvas, stickEl, onKey) {
    this.keys = new Set();
    this.stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.stickEl = stickEl;
    this.onKey = onKey;
    this.padPrev = {};
    this.device = null;
    this.setDevice(typeof matchMedia === 'function' && matchMedia('(hover: none)').matches ? 'touch' : 'key');

    window.addEventListener('pointerdown', (e) => this.setDevice(e.pointerType === 'mouse' ? 'mouse' : 'touch'), true);
    window.addEventListener('keydown', (e) => {
      this.setDevice('key');
      if (e.target && (e.target.tagName === 'INPUT' && e.target.type === 'range')) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
      if (k === ' ' && e.repeat) e.preventDefault();   // a held Space never presses a focused button
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

  setDevice(d) {
    if (this.device === d) return;
    this.device = d;
    document.body.dataset.input = d;
  }

  // Edge-triggered gamepad buttons: A = drop / confirm, B = back, X = reroll, Start = pause, d-pad = menus.
  // Any button press, or a stick pushed past 0.5, makes the pad the current device.
  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find(Boolean);
    if (!gp) return;
    for (let i = 0; i < gp.buttons.length; i++) {
      const pressed = !!gp.buttons[i]?.pressed;
      if (pressed && !this.padPrev[i]) { this.setDevice('pad'); if (PAD_MAP[i]) this.onKey(PAD_MAP[i], null); }
      this.padPrev[i] = pressed;
    }
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const push = Math.hypot(ax, ay) > 0.5;
    if (push && !this.padPrev.push) this.setDevice('pad');
    this.padPrev.push = push;
    // The stick also steps through menus: one step per push, along the axis pushed furthest, with hysteresis
    // so a resting stick does not repeat.
    const m = Math.max(Math.abs(ax), Math.abs(ay));
    if (!this.padPrev.step && m > 0.6) {
      this.padPrev.step = true;
      this.onKey(Math.abs(ax) >= Math.abs(ay) ? (ax > 0 ? 'pad-right' : 'pad-left') : ay > 0 ? 'pad-down' : 'pad-up', null);
    } else if (this.padPrev.step && m < 0.3) this.padPrev.step = false;
  }
}
