// In-run HUD, kept to what play needs and nearly free of words: health, XP, the song map, the boss bar and
// the mixer (one strip per channel: glyph, activity meter, level pips) with its pedalboard. Everything that
// needs words lives on the pause sheet (screens.js). Moments show as motion: a strip pops when its sound
// joins, a style's strips flash when its chemistry tier rises, the genre stamps once when it changes.
// The Drop meter is a ring around the speaker (renderer.js); touch gets a thumb button while it is full.

import { ROLES, ROLE_INFO, STYLES, PEDAL_SLOTS, MAX_INSTRUMENT_LEVEL, MAX_PEDAL_LEVEL, STEP_SEC, BALANCE } from '../config.js';
import { rgba } from '../util.js';
import { icon } from './icons.js';
import { CHEMISTRY, CROSS_TEXT } from '../game/loadout.js';
import { SECTIONS } from '../music/song.js';
import { tapeTarget } from '../game/upgrades.js';
import { PEDAL_BY_ID } from '../content/pedals.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const pips = (n, max, cls = '') => Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}${cls && i === n ? ` ${cls}` : ''}"></i>`).join('');
export const styleColor = (st) => STYLES[st]?.color || '#a89fc8';
export const styleName = (st) => STYLES[st]?.name || st || '';
// Restart a one-shot CSS animation class.
const kick = (node, cls) => { if (!node) return; node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };

// Textures that play fewer of a part's notes (Sequencer TRANSFORMS), and lvN below the channel's own level (a
// remix's own pattern plays lvN as 'sparse'). A solo is never thin.
const THIN = new Set(['sparse', 'hold', 'half', 'call', 'answer']);
function thinTex(x, inst) {
  if (!x || x.solo) return false;
  if (THIN.has(x.tf)) return true;
  const lv = /^lv(\d)$/.exec(x.tf);
  return !!lv && !!inst && (inst.remix || inst.level > Number(lv[1]));
}

// The song map draws the open-ended Finale as 24 bars.
const MAP_BARS = SECTIONS.map((s) => (s.bars === Infinity ? 24 : s.bars));
export const SONG_BARS = MAP_BARS.reduce((a, b) => a + b, 0);
export const songFraction = (bar) => Math.min(1, Math.max(0, bar) / SONG_BARS);
const sectionStart = (i) => MAP_BARS.slice(0, i).reduce((a, b) => a + b, 0) / SONG_BARS;

// The whole song as a strip of sections in their colors, with a red tick where each boss arrives. Sections
// before `done` are filled in. Markers: { at: 0..1, cls, label }.
export function songMapHtml(done = 0, markers = []) {
  const segs = SECTIONS.map((s, i) => `<i class="${s.boss ? 'boss' : ''}${i < done ? ' done' : ''}" style="flex:${MAP_BARS[i]};--h:hsl(${s.hue} 75% 62%)"></i>`).join('');
  const marks = markers.map((m) => `<b class="${m.cls}" style="left:${(m.at * 100).toFixed(2)}%;--a:${m.at.toFixed(3)}">${m.label ? `<span>${m.label}</span>` : ''}</b>`).join('');
  return `<div class="songmap" aria-hidden="true">${segs}${marks}</div>`;
}

// The bar the sequencer reads a part from for the step heard now: the song bar while the song moves, the
// vamp's loop bar while it is held (a level-up or pause), so 32-step parts stay in step with the audio.
export function heardBar(seq, cur) {
  if (!cur) return 0;
  if (!seq.hold || typeof seq.loopBar !== 'number') return cur.bar;
  const ahead = Math.max(0, Math.round((seq.nextTime - STEP_SEC - cur.time) / STEP_SEC));
  const gs = seq.globalStep - 1 - ahead;
  return Math.max(0, seq.loopBar - (Math.floor((seq.globalStep - 1) / 16) - Math.floor(gs / 16)));
}

// The notes a channel plays on one step of the bar heard now (empty while it rests).
function stepNotes(seq, inst, bar, sib) {
  if (typeof seq.notesFor === 'function') {
    try {
      const notes = seq.notesFor(inst, bar, sib);
      if (Array.isArray(notes) || notes == null) return notes || null;
    } catch (e) { /* fall back to the level's own part */ }
  }
  const rm = inst.remix && inst.def.remix?._byStep ? inst.def.remix : null;
  const byStep = rm ? rm._byStep : inst.def.levels[inst.level - 1]?._byStep;
  const P = (rm && rm.steps) || inst.def.steps || 16;
  return byStep ? byStep[(bar * 16 + sib) % P] || null : null;
}

// Live step sequencer: one row per channel, lit where that instrument plays, with a playhead. Drawn on the
// pause sheet (the HUD no longer carries it).
export function drawSeq(cv, g, seq, now) {
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const cur = seq.sounding(now);
  const sib = cur ? cur.sib : -1;
  const bar = heardBar(seq, cur);
  const rows = ROLES.length, cols = 16, gap = 2;
  const cw = (w - gap * (cols - 1)) / cols;
  const ch = (h - gap * (rows - 1)) / rows;
  ROLES.forEach((role, r) => {
    const inst = g.loadout.channels[role];
    const color = ROLE_INFO[role].color;
    const live = inst && !(!seq.hold && cur?.rest?.includes(role));   // resting channels draw empty
    for (let s = 0; s < cols; s++) {
      const x = s * (cw + gap), y = r * (ch + gap);
      const notes = live ? stepNotes(seq, inst, bar, s) : null;
      if (notes && notes.length) {
        const vel = Math.max(...notes.map((n) => n.v ?? 1));
        c.fillStyle = s === sib ? '#ffffff' : rgba(color, 0.35 + 0.5 * vel);
      } else c.fillStyle = s % 4 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)';
      c.fillRect(x, y, cw, ch);
    }
  });
  if (sib >= 0) {
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.fillRect(sib * (cw + gap) - 1, 0, cw + 2, h);
  }
}

export class Hud {
  // onDrop: the touch Drop button. onPause: the touch pause button. onChime(style): a chemistry tier rose.
  constructor(root, { onDrop, onPause, onChime }) {
    this.root = root;
    this.onChime = onChime || (() => {});
    root.innerHTML = '';
    this.top = el('div', 'hud-top');
    this.hp = el('div', 'meter hp', '<div class="meter-fill"></div>');
    this.xp = el('div', 'meter xp', '<div class="meter-fill"></div>');
    this.hpFill = this.hp.firstElementChild;
    this.xpFill = this.xp.firstElementChild;
    const bars = el('div', 'hud-bars');
    bars.append(this.hp, this.xp);
    this.song = el('div', 'songwrap', songMapHtml(0, [{ at: 0, cls: 'head' }, { at: 0, cls: 'open' }]));
    this.songSegs = [...this.song.querySelectorAll('.songmap i')];
    [this.songHead, this.songOpen] = this.song.querySelectorAll('.songmap b');
    this.top.append(bars, this.song);

    // The boss bar, and under it a thin clock line that drains with the bars left in the boss's section and ends in a
    // tape glyph: a boss silenced before it runs out drops a Master Tape.
    this.boss = el('div', 'bossbar', `<span class="bossbar-name"></span><div class="bossbar-track"><div class="bossbar-fill"></div></div><div class="bossbar-clock"><i></i>${icon('tape')}</div>`);
    this.boss.hidden = true;
    this.bossClock = this.boss.querySelector('.bossbar-clock');
    this.banner = el('div', 'banner', '<div class="banner-title"></div>');
    this.note = el('div', 'fightnote');
    this.stamp = el('div', 'stamp');
    this.hintEl = el('div', 'hint');
    this.hintEl.hidden = true;
    this.flash = el('div', 'hud-flash');

    this.bottom = el('div', 'hud-bottom');
    this.leds = el('div', 'leds', '<i></i>'.repeat(ROLES.length));
    this.leds.setAttribute('aria-hidden', 'true');
    this.mixer = el('div', 'mixer');
    this.strips = {};
    for (const role of ROLES) {
      const s = el('div', 'strip empty');
      s.style.setProperty('--c', ROLE_INFO[role].color);
      s.setAttribute('role', 'img');
      s.innerHTML = `<div class="strip-meter"><i></i></div><div class="strip-glyph"><span class="g-cur">${icon('plus')}</span><span class="g-ghost"></span></div><div class="strip-pips"></div><span class="strip-reel">${icon('tape')}</span><span class="strip-sig"></span>`;
      this.strips[role] = { el: s, meter: s.querySelector('.strip-meter i'), glyph: s.querySelector('.g-cur'), ghost: s.querySelector('.g-ghost'), pips: s.querySelector('.strip-pips'), sig: s.querySelector('.strip-sig'), last: null };
      this.mixer.append(s);
    }
    this.pedals = el('div', 'pedalboard');
    this.pedalSlots = [];
    for (let i = 0; i < PEDAL_SLOTS; i++) {
      const p = el('div', 'pedal empty', '<span class="pedal-glyph"></span><span class="g-ghost"></span><span class="pedal-pips"></span>');
      p.setAttribute('role', 'img');
      this.pedalSlots.push(p);
      this.pedals.append(p);
    }
    // Master Tapes waiting for a channel at BALANCE.remix.minLevel: one gold reel each, by the mixer.
    this.tapes = el('div', 'tapes');
    this.tapes.setAttribute('role', 'img');
    this.tapes.hidden = true;
    const mixWrap = el('div', 'mixwrap');
    mixWrap.append(this.leds, this.mixer, this.tapes);
    this.bottom.append(mixWrap, this.pedals);

    // Touch only, and only while the Drop is full (styles.css). Keyboard and pads use Space or A.
    this.dropBtn = el('button', 'dropbtn', icon('drop'));
    this.dropBtn.type = 'button';
    this.dropBtn.setAttribute('aria-label', 'Trigger the Drop');
    this.dropBtn.addEventListener('click', (e) => { e.stopPropagation(); onDrop(); });
    this.pauseBtn = el('button', 'pausebtn', icon('pause'));
    this.pauseBtn.type = 'button';
    this.pauseBtn.setAttribute('aria-label', 'Pause');
    this.pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); onPause(); });

    root.append(this.flash, this.top, this.boss, this.banner, this.note, this.stamp, this.hintEl, this.bottom, this.dropBtn, this.pauseBtn);
    this._last = {};
    this.reset();
  }

  // A new run: no flash or stamp is owed for the loadout it starts with.
  reset() {
    this._tiers = null;
    this._genre = null;
    this._stampOwed = false;
    this._targetEl = null;
    this.target(null);
    this.hint(null);
    this._last = {};
    this._tapesN = 0;
  }

  // Banners are for moments only: a section name, a remix name (style 'gold') or the Encore.
  showBanner(title, sub, compact = false, style = '') {
    if (compact) {
      // Mid-fight lines (none left in this game's own calls): a short note under the boss bar.
      this.note.textContent = title;
      kick(this.note, 'show');
      return;
    }
    this.banner.querySelector('.banner-title').textContent = title;
    this.banner.classList.toggle('gold', style === 'gold');
    kick(this.banner, 'show');
  }

  hideBanner() { this.banner.classList.remove('show'); }
  // Play resumes: a stamp that fired under a card screen (a pick, then another screen in the same pause) plays now.
  resumed() { if (this._stampOwed) kick(this.stamp, 'show'); this._stampOwed = false; }

  // A device glyph under the player that shows how to move ('keys', 'stick' or 'finger'), or null to hide it.
  hint(kind) {
    clearTimeout(this._hintTimer);
    this.hintEl.hidden = !kind;
    if (!kind) return;
    this.hintEl.innerHTML = icon(kind);
    this.hintEl.setAttribute('aria-label', kind === 'finger' ? 'Drag anywhere to move' : kind === 'stick' ? 'Move with the left stick' : 'Move with WASD or the arrow keys');
    this._hintTimer = setTimeout(() => { this.hintEl.hidden = true; }, 8000);
  }

  // wnPhase: the phase White Noise starts in (Gain 8 skips the first one).
  setBoss(e, wnPhase = 1) {
    this.bossEnemy = e;
    this.chipAt = -Infinity;   // the damage chip catches up on the next update
    this.boss.hidden = !e;
    if (!e) return;
    this.boss.querySelector('.bossbar-name').textContent = e.def.name;
    this.boss.style.setProperty('--c', e.def.color);
    // Notches where the boss changes its attack pattern. White Noise's break as it passes them.
    const marks = { drone: [0.8], clipper: [BALANCE.boss.clipperTriple], glitchking: [], whitenoise: [0.66, 0.33].slice(wnPhase - 1) }[e.type] || [];
    this.boss.querySelector('.bossbar-track').innerHTML = '<div class="bossbar-chip"></div><div class="bossbar-fill"></div>' + marks.map((m) => `<i class="bossbar-notch" data-at="${m}" style="left:${m * 100}%"></i>`).join('');
    this.bossClock.hidden = !e.clock;
    this._clock = null;
  }

  // A remix landed: its strip pops (it turns gold with the loadout refresh).
  onRemix(role) { kick(this.strips[role]?.el, 'pop'); }

  // Boss moments without words. 'stagger': the Drop knocked it off the beat (the bar shakes and flashes white).
  // 'phase': White Noise got louder (the passed notch breaks red, and one static flash if flashes are on).
  bossCue(kind, e, phase, flashes = true) {
    if (kind === 'stagger') { kick(this.boss, 'stagger'); return; }
    if (kind === 'phase') {
      const at = phase >= 3 ? 0.33 : 0.66;
      const notch = [...this.boss.querySelectorAll('.bossbar-notch')].find((n) => Math.abs(Number(n.dataset.at) - at) < 0.01);
      if (notch) notch.classList.add('broken');
      kick(this.boss, 'phase');
      if (flashes) kick(this.flash, 'show');
    }
  }

  // A sound joined (or took over) a channel: its strip pops.
  onJoin(role) { kick(this.strips[role]?.el, 'pop'); }

  // The slot a focused card plugs into: { role } lifts that strip, { pedal: i } that pedal slot, with the
  // card's glyph ghosted in (a swap fades the old glyph out). null clears it.
  target(slot, d = null) {
    if (this._targetEl) this._targetEl.classList.remove('target', 'swap', 'up');
    this._targetEl = null;
    if (!slot) return;
    let node = null, ghost = null;
    if (slot.role && this.strips[slot.role]) ({ el: node, ghost } = this.strips[slot.role]);
    else if (Number.isInteger(slot.pedal)) { node = this.pedalSlots[Math.min(slot.pedal, PEDAL_SLOTS - 1)]; ghost = node?.querySelector('.g-ghost'); }
    if (!node) return;
    if (ghost) ghost.innerHTML = d?.glyph ? icon(d.glyph, slot.role) : '';
    node.style.setProperty('--tc', d?.color || '#ffffff');
    node.classList.add('target');
    if (d?.kind === 'swap' || d?.kind === 'remix') node.classList.add('swap');
    if (d?.kind === 'up' || d?.kind === 'pedal-up' || d?.kind === 'fader') node.classList.add('up');
    this._targetEl = node;
  }

  // Rebuild the parts that only change when the loadout changes.
  refreshLoadout(g) {
    const cap = g.channelCap();
    const used = g.loadout.filled();
    const next = SECTIONS.findIndex((s, i) => i > g.sectionIndex && g.channelCap(i) > cap);
    this.lockedAt = next > 0 ? SECTIONS[next].name : null;
    // Where the next channel opens: a dot on the song map.
    this.songOpen.hidden = next <= 0;
    if (next > 0) this.songOpen.style.left = `${(sectionStart(next) * 100).toFixed(2)}%`;
    // Socket LEDs: lit for a channel in use, hollow and pulsing for a free one, dark for one not open yet.
    [...this.leds.children].forEach((led, i) => { led.className = i < used ? 'on' : i < cap ? 'free' : ''; });

    for (const role of ROLES) {
      const s = this.strips[role];
      const inst = g.loadout.channels[role];
      const free = !inst && used < cap;
      s.el.classList.toggle('empty', !inst);
      s.el.classList.toggle('locked', !inst && !free);
      s.el.classList.toggle('remix', !!inst?.remix);
      const key = inst ? `${inst.def.id}:${inst.level}:${inst.remix ? 1 : 0}:${inst.sig ? 1 : 0}:${g.loadout.pedalSlotsFree() ? 1 : 0}` : free ? 'free' : 'locked';
      if (s.last === key) continue;
      s.last = key;
      if (inst) {
        const name = inst.remix ? inst.def.remix.name : inst.def.name;
        s.el.style.setProperty('--s', styleColor(inst.def.style));
        s.el.dataset.style = inst.def.style;
        s.glyph.innerHTML = icon(inst.def.id, role);
        s.pips.innerHTML = pips(inst.level, MAX_INSTRUMENT_LEVEL);
        // A remixed strip wears its partner pedal: dim until that pedal is on the board, then gold with its number. No
        // tab once a full board can never take it (pedals never leave).
        const pd = inst.remix && (inst.sig || g.loadout.pedalSlotsFree() > 0) ? PEDAL_BY_ID[inst.def.remix.pedal] : null, x = `×${BALANCE.remix.sig}`;
        const sig = pd ? (inst.sig ? `${pd.name} ${x}` : `Add ${pd.name} for ${x}`) : '';
        s.sig.className = `strip-sig${inst.sig ? ' on' : ''}`;
        s.sig.innerHTML = pd ? icon(pd.id, 'pedal') + (inst.sig ? `<b>${x}</b>` : '') : '';
        s.el.title = `${name} · ${styleName(inst.def.style)} · Lv ${inst.level}${sig ? ` · ${sig}` : ''}`;
        s.el.setAttribute('aria-label', `${ROLE_INFO[role].name}: ${name}, ${styleName(inst.def.style)}, level ${inst.level}${inst.remix ? ', remixed' : ''}${sig ? `, ${sig}` : ''}`);
      } else {
        s.sig.innerHTML = '';
        s.el.style.removeProperty('--s');
        delete s.el.dataset.style;
        s.glyph.innerHTML = icon(free ? 'plus' : 'lock');
        s.pips.innerHTML = '';
        s.el.title = free ? `${ROLE_INFO[role].name}: free` : `${ROLE_INFO[role].name}: opens at ${this.lockedAt || 'a later section'}`;
        s.el.setAttribute('aria-label', s.el.title);
      }
    }
    this.pedalSlots.forEach((slot, i) => {
      const p = g.loadout.pedals[i];
      slot.classList.toggle('empty', !p);
      slot.querySelector('.pedal-glyph').innerHTML = p ? icon(p.def.id, 'pedal') : '';
      slot.querySelector('.pedal-pips').innerHTML = p ? pips(p.level, MAX_PEDAL_LEVEL) : '';
      if (p) slot.style.setProperty('--c', p.def.color);
      slot.title = p ? `${p.def.name} · Lv ${p.level}` : 'Empty pedal slot';
      slot.setAttribute('aria-label', slot.title);
    });

    // Moments: a rule tier rising (a crossover's lift included) flashes that style's strips with a chime, a new genre
    // stamps its name with one small line: the crossover's sentence, else the rule tier it turned on.
    const R = g.stats.rules, tiers = R.tiers;
    let rose = [];
    if (this._tiers && g.time > 0) {
      rose = Object.keys(tiers).filter((st) => tiers[st] > (this._tiers[st] || 0));
      for (const st of rose) for (const role of ROLES) if (g.loadout.channels[role]?.def.style === st) kick(this.strips[role].el, 'tierflash');
      if (rose.length) this.onChime(rose[0]);
    }
    this._tiers = tiers;
    if (this._genre !== null && g.genre !== this._genre && g.time > 0) {
      const st = rose.sort((a, b) => tiers[b] - tiers[a])[0], line = el('small');
      line.textContent = R.x === g.genre ? CROSS_TEXT[R.x] : st ? `${CHEMISTRY[st].name} · ${CHEMISTRY[st].tiers[tiers[st] - 1].text}` : '';
      this.stamp.textContent = g.genre;
      if (line.textContent) this.stamp.append(line);
      kick(this.stamp, 'show');
      this._stampOwed = !!document.body.dataset.screen;   // a card screen hides it: resumed() plays it again
    }
    this._genre = g.genre;
  }

  update(g, now, seq) {
    const p = g.player;
    const set = (k, v, fn) => { if (this._last[k] !== v) { this._last[k] = v; fn(v); } };
    set('hp', Math.round(1000 * Math.max(0, p.hp / p.maxHp)), (v) => { this.hpFill.style.transform = `scaleX(${v / 1000})`; });
    set('low', p.hp / p.maxHp < 0.3, (v) => this.hp.classList.toggle('low', v));
    set('xp', Math.round(1000 * Math.min(1, g.xp / g.xpNeed)), (v) => { this.xpFill.style.transform = `scaleX(${v / 1000})`; });
    // Song map: the playhead moves on every 16th note that is heard, and finished sections fill in.
    const cur = seq.sounding(now);
    set('head', cur ? cur.bar * 16 + cur.sib : 0, (v) => { this.songHead.style.left = `${songFraction(v / 16) * 100}%`; });
    set('done', g.sectionIndex, (v) => { this.songSegs.forEach((s, i) => s.classList.toggle('done', i < v)); });

    // Strips: the meter follows each channel's hits; a channel resting in this bar dims, one playing a thinned
    // texture of its part dims a little.
    for (const role of ROLES) {
      const s = this.strips[role];
      s.meter.style.transform = `scaleY(${Math.min(1, g.chanPulse[role] || 0)})`;
      set(`rest:${role}`, cur?.rest?.includes(role) ? 2 : thinTex(cur?.tex?.[role], g.loadout.channels[role]) ? 1 : 0, (v) => { s.el.classList.toggle('rest', v === 2); s.el.classList.toggle('soft', v === 1); });
    }

    set('drop', g.dropCharge >= g.dropMax && !g.dropState && !g.won && g.state === 'playing', (v) => this.root.classList.toggle('drop-ready', v));

    // Banked Master Tapes (a reel each, a pop when one comes in), and the channel a remix is queued on (its strip
    // glows gold until the remix lands; through its dropout bar it dims like any resting channel).
    const banked = Math.min(3, g.tapes?.banked || 0);
    set('tapes', banked, (n) => {
      const more = n > (this._tapesN || 0);
      this._tapesN = n;
      this.tapes.hidden = !n;
      this.tapes.innerHTML = icon('tape').repeat(n);
      if (more) kick(this.tapes, 'pop');
    });
    // The strips a banked tape waits for wear its reel, pulsing on the beat (from the frame it is banked, not on the
    // next loadout change), and while a tape lies on the floor the strips it would remix get a gold rim. A tape whose
    // remix cards are pending or open waits for nothing (tapeTarget is empty).
    const toggle = (cls) => (s) => { const on = s ? s.split(',') : []; for (const r of ROLES) this.strips[r].el.classList.toggle(cls, on.includes(r)); };
    const roles = (insts) => insts.map((i) => i.def.role).join(',');
    const wait = banked > 0 ? roles(tapeTarget(g)) : '';
    set('tapearia', `${banked} Master Tape${banked === 1 ? '' : 's'}${wait ? ` waiting for a channel at level ${BALANCE.remix.minLevel}` : ''}`, (v) => this.tapes.setAttribute('aria-label', v));
    set('tapewait', wait, toggle('tape-wait'));
    set('tapebeat', wait && cur ? cur.bar * 4 + (cur.sib >> 2) : -1, () => { if (wait) kick(this.mixer, 'beat'); });
    const onFloor = g.tapes && g.tapes.dropped > g.tapes.collected + g.tapes.lost;
    set('tapeready', onFloor ? roles(g.remixReady()) : '', toggle('tapeready'));
    const queued = [seq.remixAt?.inst, ...(g.remixQueue || [])].filter(Boolean).map((i) => i.def.role).join(',');
    set('queued', queued, toggle('queued'));

    if (this.bossEnemy) {
      const e = this.bossEnemy;
      const fill = `scaleX(${Math.max(0, e.hp / e.maxHp)})`;
      this.boss.querySelector('.bossbar-fill').style.transform = fill;
      // The chip shows the health just taken off in white, then catches up every 0.6 s of play.
      if (g.time - this.chipAt >= 0.6) { this.chipAt = g.time; this.boss.querySelector('.bossbar-chip').style.transform = fill; }
      // The clock: the bars left in the boss's section, on the 16th heard now (it holds while the song is held).
      if (e.clock && cur) {
        const left = Math.max(0, Math.min(1, (e.clock.to - (cur.bar + cur.sib / 16)) / Math.max(1, e.clock.to - e.clock.from)));
        const k = Math.round(left * 400);
        if (k !== this._clock) {
          this._clock = k;
          this.bossClock.firstElementChild.style.transform = `scaleX(${k / 400})`;
          this.bossClock.classList.toggle('late', k < 100);
        }
      }
      if (e.dead) this.setBoss(null);
    }
  }
}
