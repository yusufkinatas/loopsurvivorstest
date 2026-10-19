// In-run HUD: health, XP, song position, the mixer (your six channels), pedalboard, style chemistry,
// the Drop meter and a live step-sequencer view of everything your band is playing.

import { ROLES, ROLE_INFO, STYLES, PEDAL_SLOTS, MAX_INSTRUMENT_LEVEL, MAX_PEDAL_LEVEL } from '../config.js';
import { fmtTime, rgba } from '../util.js';
import { icon } from './icons.js';
import { CHEMISTRY, chemistryTier } from '../game/loadout.js';
import { SECTIONS } from '../music/song.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

// The song map draws the open-ended Finale as 24 bars.
const MAP_BARS = SECTIONS.map((s) => (s.bars === Infinity ? 24 : s.bars));
export const SONG_BARS = MAP_BARS.reduce((a, b) => a + b, 0);
export const songFraction = (bar) => Math.min(1, Math.max(0, bar) / SONG_BARS);

// The whole song as a strip of sections in their colors, with a red tick where each boss arrives. Sections
// before `done` are filled in. Markers: { at: 0..1, cls, label }.
export function songMapHtml(done = 0, markers = []) {
  const segs = SECTIONS.map((s, i) => `<i class="${s.boss ? 'boss' : ''}${i < done ? ' done' : ''}" style="flex:${MAP_BARS[i]};--h:hsl(${s.hue} 75% 62%)"></i>`).join('');
  const marks = markers.map((m) => `<b class="${m.cls}" style="left:${(m.at * 100).toFixed(2)}%;--a:${m.at.toFixed(3)}">${m.label ? `<span>${m.label}</span>` : ''}</b>`).join('');
  return `<div class="songmap" aria-hidden="true">${segs}${marks}</div>`;
}

export class Hud {
  constructor(root, { onDrop, onPause }) {
    this.root = root;
    root.innerHTML = '';
    this.top = el('div', 'hud-top');
    this.hp = el('div', 'meter hp', '<div class="meter-fill"></div><span class="meter-text"></span>');
    this.xp = el('div', 'meter xp', '<div class="meter-fill"></div><span class="meter-text"></span>');
    this.clock = el('div', 'clock', `<span class="clock-time">0:00</span><span class="clock-section">Intro</span>${songMapHtml(0, [{ at: 0, cls: 'head' }])}`);
    this.songSegs = [...this.clock.querySelectorAll('.songmap i')];
    this.songHead = this.clock.querySelector('.songmap b');
    this.kills = el('div', 'kills', '<span class="kills-n">0</span><span class="kills-l">silenced</span>');
    const bars = el('div', 'hud-bars');
    bars.append(this.hp, this.xp);
    this.top.append(bars, this.clock, this.kills);

    this.boss = el('div', 'bossbar', '<span class="bossbar-name"></span><div class="bossbar-track"><div class="bossbar-fill"></div></div>');
    this.boss.hidden = true;
    this.banner = el('div', 'banner', '<div class="banner-title"></div><div class="banner-sub"></div>');
    this.note = el('div', 'fightnote');
    this.tipEl = el('div', 'tip');
    this.tipEl.hidden = true;

    this.side = el('div', 'hud-side');
    this.genre = el('div', 'genre');
    this.chem = el('div', 'chem');
    this.seqCanvas = el('canvas', 'seqgrid');
    this.side.append(this.genre, this.chem, this.seqCanvas);

    this.bottom = el('div', 'hud-bottom');
    this.mixer = el('div', 'mixer');
    this.strips = {};
    for (const role of ROLES) {
      const s = el('div', 'strip');
      s.style.setProperty('--c', ROLE_INFO[role].color);
      s.innerHTML = `<div class="strip-meter"><i></i></div><div class="strip-icon">${icon(role)}</div><div class="strip-body"><span class="strip-name"></span><span class="strip-sub"></span></div><div class="strip-pips"></div>`;
      this.strips[role] = { el: s, meter: s.querySelector('.strip-meter i'), name: s.querySelector('.strip-name'), sub: s.querySelector('.strip-sub'), pips: s.querySelector('.strip-pips') };
      this.mixer.append(s);
    }
    this.mixCap = el('div', 'mixcap');
    this.pedals = el('div', 'pedalboard');
    this.pedalSlots = [];
    for (let i = 0; i < PEDAL_SLOTS; i++) { const p = el('div', 'pedal empty'); this.pedalSlots.push(p); this.pedals.append(p); }

    this.drop = el('button', 'dropmeter', '<div class="dropmeter-fill"></div><span class="dropmeter-label">Drop</span><kbd class="k-key">Space</kbd><kbd class="k-pad">A</kbd>');
    this.drop.type = 'button';
    this.drop.setAttribute('aria-label', 'Trigger the Drop');
    this.drop.addEventListener('click', (e) => { e.stopPropagation(); onDrop(); });
    this.pauseBtn = el('button', 'pausebtn', icon('pause'));
    this.pauseBtn.type = 'button';
    this.pauseBtn.setAttribute('aria-label', 'Pause');
    this.pauseBtn.title = 'Pause (Esc or Start)';
    this.pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); onPause(); });

    const mixWrap = el('div', 'mixwrap');
    mixWrap.append(this.mixCap, this.mixer);
    this.bottom.append(this.drop, mixWrap, this.pedals);
    root.append(this.top, this.boss, this.banner, this.note, this.tipEl, this.side, this.bottom, this.pauseBtn);

    this._bannerTimer = null;
    this._last = {};
  }

  showBanner(title, sub, compact = false) {
    if (compact) {
      // Mid-fight messages: a short line under the boss bar, out of the way of the bullets.
      this.note.textContent = title;
      this.note.classList.remove('show');
      void this.note.offsetWidth;
      this.note.classList.add('show');
      return;
    }
    const t = this.banner.querySelector('.banner-title');
    const s = this.banner.querySelector('.banner-sub');
    t.textContent = title;
    s.textContent = sub || '';
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
  }

  // A one-line hint above the mixer that fades after `sec` seconds.
  tip(text, sec = 6) {
    clearTimeout(this._tipTimer);
    this.tipEl.textContent = text;
    this.tipEl.hidden = !text;
    if (text) this._tipTimer = setTimeout(() => { this.tipEl.hidden = true; }, sec * 1000);
  }

  hideBanner() { this.banner.classList.remove('show'); }

  setBoss(e) {
    this.bossEnemy = e;
    this.boss.hidden = !e;
    if (!e) return;
    this.boss.querySelector('.bossbar-name').textContent = e.def.name;
    this.boss.style.setProperty('--c', e.def.color);
    // Notches where the boss changes its attack pattern.
    const marks = { drone: [0.8], clipper: [0.7], glitchking: [], whitenoise: [0.66, 0.33] }[e.type] || [];
    this.boss.querySelector('.bossbar-track').innerHTML = '<div class="bossbar-fill"></div>' + marks.map((m) => `<i class="bossbar-notch" style="left:${m * 100}%"></i>`).join('');
  }

  // Rebuild the parts that only change when the loadout changes.
  refreshLoadout(g) {
    const cap = g.channelCap();
    const next = SECTIONS.findIndex((s, i) => i > g.sectionIndex && g.channelCap(i) > cap);
    const used = g.loadout.filled();
    const free = cap - used;
    this.mixCap.innerHTML = `<b>${used} of ${cap}</b> channels in use${free > 0 ? ` · <b>${free} free</b>` : ''}${next > 0 ? ` <span>· another opens at ${SECTIONS[next].name}</span>` : ''}`;
    this.lockedAt = next > 0 ? SECTIONS[next].name : null;
    for (const role of ROLES) {
      const s = this.strips[role];
      const inst = g.loadout.channels[role];
      s.el.classList.toggle('empty', !inst);
      if (inst) {
        s.el.classList.remove('locked');
        s.el.title = '';
        s.name.textContent = inst.def.name;
        s.sub.textContent = STYLES[inst.def.style].name;
        s.sub.style.color = STYLES[inst.def.style].color;
        s.pips.innerHTML = Array.from({ length: MAX_INSTRUMENT_LEVEL }, (_, i) => `<i class="${i < inst.level ? 'on' : ''}"></i>`).join('');
      } else {
        s.name.textContent = ROLE_INFO[role].name;
        const isFree = g.loadout.filled() < cap;
        s.sub.textContent = isFree ? 'free' : 'locked';
        s.el.classList.toggle('locked', !isFree);
        s.el.title = isFree ? 'Pick a sound for this channel at your next level-up' : `Opens at ${this.lockedAt || 'a later section'}`;
        s.sub.style.color = '';
        s.pips.innerHTML = '';
      }
    }
    this.pedalSlots.forEach((slot, i) => {
      const p = g.loadout.pedals[i];
      slot.className = 'pedal' + (p ? '' : ' empty');
      if (p) {
        slot.style.setProperty('--c', p.def.color);
        slot.innerHTML = `<span class="pedal-name">${p.def.short}</span><span class="pedal-pips">${Array.from({ length: MAX_PEDAL_LEVEL }, (_, k) => `<i class="${k < p.level ? 'on' : ''}"></i>`).join('')}</span>`;
        slot.title = `${p.def.name} (level ${p.level})`;
      } else { slot.innerHTML = ''; slot.title = 'Empty pedal slot'; }
    });
    const counts = g.loadout.styleCounts();
    this.chem.innerHTML = Object.keys(CHEMISTRY).map((st) => {
      const tier = chemistryTier(st, counts[st]);
      const dots = CHEMISTRY[st].map((t, i) => `<i class="${i < tier ? 'on' : ''}"></i>`).join('');
      return `<div class="chem-row${tier ? ' active' : ''}" style="--s:${STYLES[st].color}"><span class="chem-name">${STYLES[st].name}</span><span class="chem-count">${counts[st]}</span><span class="chem-dots">${dots}</span></div>`;
    }).join('');
    this.genre.innerHTML = `<span class="genre-l">Your sound</span><span class="genre-v">${g.genre}</span>`;
  }

  update(g, now, seq) {
    const p = g.player;
    const set = (k, v, fn) => { if (this._last[k] !== v) { this._last[k] = v; fn(v); } };
    set('hp', Math.ceil(p.hp) + '/' + Math.round(p.maxHp), (v) => { this.hp.querySelector('.meter-text').textContent = v; });
    this.hp.querySelector('.meter-fill').style.transform = `scaleX(${Math.max(0, p.hp / p.maxHp)})`;
    this.hp.classList.toggle('low', p.hp / p.maxHp < 0.3);
    set('lvl', g.level, (v) => { this.xp.querySelector('.meter-text').textContent = `Level ${v}`; });
    this.xp.querySelector('.meter-fill').style.transform = `scaleX(${Math.min(1, g.xp / g.xpNeed)})`;
    set('time', fmtTime(g.time), (v) => { this.clock.querySelector('.clock-time').textContent = v; });
    set('sec', g.section.name, (v) => { this.clock.querySelector('.clock-section').textContent = v; });
    // Song map: the playhead moves on every 16th note that is heard, and finished sections fill in.
    const cur = seq.sounding(now);
    set('head', cur ? cur.bar * 16 + cur.sib : 0, (v) => { this.songHead.style.left = `${songFraction(v / 16) * 100}%`; });
    set('done', g.sectionIndex, (v) => { this.songSegs.forEach((s, i) => s.classList.toggle('done', i < v)); });
    set('kills', g.kills, (v) => { this.kills.querySelector('.kills-n').textContent = v.toLocaleString('en-US'); });

    for (const role of ROLES) {
      const k = g.chanPulse[role];
      this.strips[role].meter.style.transform = `scaleY(${Math.min(1, k)})`;
    }

    const ready = g.dropCharge >= g.dropMax && !g.dropState;
    this.drop.querySelector('.dropmeter-fill').style.transform = `scaleX(${g.dropState ? 1 : g.dropCharge / g.dropMax})`;
    this.drop.classList.toggle('ready', ready);
    this.drop.classList.toggle('building', !!g.dropState);
    set('droplabel', g.dropState ? 'Build' : ready ? 'Drop ready' : 'Drop', (v) => { this.drop.querySelector('.dropmeter-label').textContent = v; });

    if (this.bossEnemy) {
      const e = this.bossEnemy;
      this.boss.querySelector('.bossbar-fill').style.transform = `scaleX(${Math.max(0, e.hp / e.maxHp)})`;
      if (e.dead) this.setBoss(null);
    }
    this._drawSeq(g, now, seq);
  }

  // Live step-sequencer: one row per channel, lit where that instrument plays, with a playhead.
  _drawSeq(g, now, seq) {
    const cv = this.seqCanvas;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const cur = seq.sounding(now);
    const sib = cur ? cur.sib : -1;
    const bar = cur ? cur.bar : 0;
    const rows = ROLES.length, cols = 16;
    const gap = 2;
    const cw = (w - gap * (cols - 1)) / cols;
    const ch = (h - gap * (rows - 1)) / rows;
    ROLES.forEach((role, r) => {
      const inst = g.loadout.channels[role];
      const color = ROLE_INFO[role].color;
      let byStep = null, P = 16;
      if (inst) { byStep = inst.def.levels[inst.level - 1]._byStep; P = inst.def.steps || 16; }
      const off = ((bar * 16) % P);
      for (let s = 0; s < cols; s++) {
        const x = s * (cw + gap), y = r * (ch + gap);
        const notes = byStep ? byStep[(off + s) % P] : null;
        if (notes && notes.length) {
          const vel = Math.max(...notes.map((n) => n.v ?? 1));
          const hot = s === sib;
          c.fillStyle = hot ? '#ffffff' : rgba(color, 0.35 + 0.5 * vel);
          c.fillRect(x, y, cw, ch);
        } else {
          c.fillStyle = s % 4 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)';
          c.fillRect(x, y, cw, ch);
        }
      }
    });
    if (sib >= 0) {
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.fillRect(sib * (cw + gap) - 1, 0, cw + 2, h);
    }
  }
}
