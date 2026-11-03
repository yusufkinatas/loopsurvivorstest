// Menus and overlays: title, how to play, first-sound select, level-up cards, pause, the end screen and
// the Discography. Card screens show glyphs, names and sound; every explanatory line sits in the info
// layer (I, pad Y or the (i) button) and on the pause sheet, which is the home of the run's details, except
// that a card never taken shows its first words.

import { ROLE_INFO, STYLES, ROLES, GAIN, BALANCE, BAR_SEC, REROLLS_PER_RUN, BANISHES_PER_RUN, MAX_INSTRUMENT_LEVEL, MAX_PEDAL_LEVEL } from '../config.js';
import { fmtTime } from '../util.js';
import { icon } from './icons.js';
import { describeOffer, banKey, chemTiers } from '../game/upgrades.js';
import { CHEMISTRY, CROSS_TEXT } from '../game/loadout.js';
import { SECTIONS, SONGS } from '../music/song.js';
import { makeChord, NOTE_NAMES } from '../music/theory.js';
import { songMapHtml, songFraction, SONG_BARS, heardBar, drawSeq, styleColor, styleName } from './hud.js';
import { GOALS, RECORDS, unlockLabel, unlocksOf, nextGoal } from '../game/progress.js';
import { INSTRUMENTS, BY_ID } from '../content/instruments/index.js';
import { PEDAL_BY_ID } from '../content/pedals.js';

const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kick = (node, cls) => { if (!node) return; node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };
// A key cap drawn from data-k by CSS, so prompts stay glyphs: k-key for keyboards, k-pad for gamepads.
const kbd = (key, pad) => `${key ? `<kbd class="k-key" data-k="${esc(key)}"></kbd>` : ''}${pad ? `<kbd class="k-pad" data-k="${esc(pad)}"></kbd>` : ''}`;
const dots = (n, max) => `<span class="uses" aria-hidden="true">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
const pipsRow = (n, max) => `<span class="pips-sm" aria-hidden="true">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;

// The setlist: a song by id (a record or run from before it, or an unknown one: the loop), and its key named for
// the chord it comes home to (Ode, at home on III, sits in the run's relative major), never split over two lines.
const tuneOf = (id) => SONGS.find((t) => t.id === id) || SONGS[0];
const keyName = (kp, tune) => { const c = makeChord(kp, tune.home); return `${NOTE_NAMES[c.rootPc]}\u00a0${c.quality === 'maj' ? 'major' : 'minor'}`; };

// A level-up ignores picks and button presses this long after it opens, so a Drop press or the second
// half of a double tap never takes a card blind.
const ARM_MS = 350;
// The end screen's curtain call (s): each stat's count, the gap between damage bars and each bar's growth.
const CURTAIN = { stat: 0.3, gap: 0.25, grow: 0.3 };

// Kind badges are glyphs only; the words are for screen readers.
const KIND = {
  new: ['plus', 'new sound'], up: ['up', 'level up'], swap: ['swap', 'swap'], remix: ['vinyl', 'remix'],
  'pedal-new': ['pedal', 'new pedal'], 'pedal-up': ['up', 'pedal level up'], fader: ['fader', 'fader'],
  heal: [null, 'bonus'], hype: [null, 'bonus'], score: [null, 'bonus'],
};

function stepsHtml(cells) {
  if (!cells || !cells.length) return '';
  return `<span class="steps${cells.length > 16 ? ' long' : ''}" aria-hidden="true">${cells.map((c, i) => `<i class="${c.on ? 'on' : ''}${c.isNew ? ' new' : ''}${i % 4 === 0 ? ' beat' : ''}" style="--v:${c.v || 0}"></i>`).join('')}</span>`;
}

// Level pips; the levels the card brings pulse (a remix card's jump from prev to level 5, else the one level).
function pipsHtml(d) {
  if (!d.maxLevel) return '';
  const fresh = d.kind === 'new' || d.kind === 'up' || d.kind === 'pedal-new' || d.kind === 'pedal-up' || d.kind === 'fader' || d.kind === 'remix';
  const from = d.prev ?? d.level - 1;
  return `<span class="pips" aria-hidden="true">${Array.from({ length: d.maxLevel }, (_, i) => `<i class="${i < d.level ? 'on' : ''}${fresh && i >= from && i < d.level ? ' new' : ''}"></i>`).join('')}</span>`;
}

// Style gems: one dot per sound of a style the card changes (larger at its chemistry tiers), a sparkle when
// the card gains a tier, a crack when it loses one. A crossover the card forms is a disc split in its two style
// colors, Fusion the six-color gem (each cracked apart when the card breaks it).
function gemsHtml(gems) {
  return (gems || []).map((gm) => {
    if (gm.style === 'fusion') return `<span class="gems fusion${gm.tier < 0 ? ' broke' : ''}" title="Fusion"><i class="big${gm.tier > 0 ? ' new up' : ''}"></i></span>`;
    if (gm.style === 'cross') return `<span class="gems cross${gm.tier < 0 ? ' broke' : ''}" style="--s:${styleColor(gm.a)};--s2:${styleColor(gm.b)}" title="${esc(gm.name)}"><i class="${gm.tier > 0 ? 'new up' : ''}"></i></span>`;
    const th = new Set(chemTiers(gm.style).map((t) => t.n));
    if (!th.size) [2, 4, 6].forEach((n) => th.add(n));
    const n = Math.max(0, Math.min(6, gm.n));
    const out = [];
    for (let i = 1; i <= n; i++) out.push(`<i class="${th.has(i) ? 'big' : ''}${gm.delta > 0 && i === n ? ` new${gm.tier > 0 ? ' up' : ''}` : ''}"></i>`);
    if (gm.delta < 0) out.push(`<i class="gone${th.has(n + 1) ? ' big' : ''}${gm.tier < 0 ? ' down' : ''}"></i>`);
    return `<span class="gems" style="--s:${styleColor(gm.style)}" title="${esc(styleName(gm.style))}">${out.join('')}</span>`;
  }).join('');
}

// The card foot's glyphs beside the gems: a gold reel (tape: this card brings a channel to where the banked Master
// Tape remixes it), the remix's partner pedal (pair: { glyph, on }, lit once it is on the board), and the band's
// sounds a pedal powers (fit: [{ glyph, role, on, pair }], dim where it does nothing, gold-ringed for a remix partner).
function footHtml(d) {
  const tape = d.tape ? `<span class="reel">${icon('tape')}</span>` : '';
  const pair = d.pair ? `<span class="pair${d.pair.on ? ' on' : ''}">${icon(d.pair.glyph)}</span>` : '';
  const fit = d.fit?.length ? `<span class="fit">${d.fit.map((f) => `<i class="${f.on === false ? 'off' : ''}${f.pair ? ' pair' : ''}">${icon(f.glyph, f.role)}</i>`).join('')}</span>` : '';
  return tape + pair + fit + gemsHtml(d.gems);
}

export function cardHtml(d, index) {
  const [badge, word] = KIND[d.kind] || [null, ''];
  const role = d.slot?.role;
  const badgeHtml = d.kind === 'swap' && d.from
    ? `<span class="card-badge swap" aria-hidden="true">${icon('swap')}<span class="from">${icon(d.from, role)}</span></span>`
    : badge ? `<span class="card-badge" aria-hidden="true">${icon(badge)}</span>` : '';
  const hero = d.kind === 'remix'
    ? `<span class="card-hero vinyl" aria-hidden="true"><span class="vdisc"></span>${icon(d.glyph, role)}</span>`
    : `<span class="card-hero" aria-hidden="true">${icon(d.glyph, role)}</span>`;
  const label = `${d.title}, ${word}${d.maxLevel ? `, level ${d.level} of ${d.maxLevel}` : ''}`;
  const frame = d.kind === 'remix' ? 'remix' : d.style || (d.kind.startsWith('pedal') ? 'pedal' : 'plain');
  return `
  <button class="card card-${esc(d.kind)}${d.fresh ? ' fresh' : ''}" type="button" data-i="${index}" data-style="${esc(frame)}" style="--c:${d.color};--s:${styleColor(d.style)}" aria-label="${esc(label)}" aria-describedby="card-info-${index}">
    <span class="card-frame" aria-hidden="true"></span>
    <span class="card-key" data-k="${index + 1}" aria-hidden="true"></span>
    ${badgeHtml}${hero}
    <span class="card-title">${esc(d.title)}</span>
    ${pipsHtml(d)}${stepsHtml(d.cells)}
    <span class="card-foot" aria-hidden="true">${footHtml(d)}</span>
    <span class="card-info" id="card-info-${index}">${(d.info || []).map((l) => `<span>${esc(l)}</span>`).join('')}</span>
  </button>`;
}

// End screen: where the song stopped on the song map (your previous best as a dashed marker) and what took
// you out. bar and lastHitBy can be missing; their parts are left out.
function songEndHtml(sum, isBest, prev) {
  const idx = SECTIONS.findIndex((s) => s.name === sum.section);
  const out = [];
  if (sum.won || typeof sum.bar === 'number') {
    const at = sum.won ? 1 : songFraction(sum.bar);
    const marks = [{ at, cls: 'you', label: isBest ? 'New best' : 'You' }];
    const prevAt = prev?.won ? 1 : typeof prev?.bar === 'number' ? songFraction(prev.bar) : null;
    if (prevAt !== null && Math.round(prevAt * SONG_BARS) !== Math.round(at * SONG_BARS)) marks.push({ at: prevAt, cls: 'best', label: isBest ? 'Old best' : 'Best' });
    out.push(songMapHtml(sum.won ? SECTIONS.length : Math.max(0, idx), marks));
  }
  const last = !sum.won && typeof sum.lastHitBy === 'string' ? sum.lastHitBy : null;
  if (last) out.push(`<p>Taken out by <b>${esc(last)}</b></p>`);
  return out.length ? `<div class="end-song">${out.join('')}</div>` : '';
}

// The 30 sleeves (gold ring for a finished song, dashed for a demo, a G tag for its Gain, dimmed with a hint
// until pressed; a crossover's sleeve carries its sentence), then any other genre pressed, as hidden tracks.
function recordsHtml(meta) {
  const line = (genre) => (Object.hasOwn(CROSS_TEXT, genre) ? `<small>${esc(CROSS_TEXT[genre])}</small>` : '');
  const sleeve = (genre, rec, hint) => (rec
    ? `<button class="sleeve ${rec.w ? 'gold' : 'demo'}${line(genre) ? ' x' : ''}" type="button" data-genre="${esc(genre)}" ${rec.sh.length ? '' : 'disabled'}>
        <i class="disc" aria-hidden="true"></i><b>${esc(genre)}</b>${line(genre)}
        <span>${rec.w ? 'Gold' : 'Demo'} · ${esc(keyName(rec.kp, tuneOf(rec.sg)))}${rec.g ? ` <em>G${rec.g}</em>` : ''}</span></button>`
    : `<div class="sleeve empty${line(genre) ? ' x' : ''}"><i class="disc" aria-hidden="true"></i><b>${esc(genre)}</b>${line(genre)}<span>${esc(hint)}</span></div>`);
  const hidden = Object.keys(meta.records).filter((g) => !RECORDS.some((r) => r.genre === g));
  return `<p class="now-playing" aria-live="polite"></p>
    <div class="sleeves">${RECORDS.map((r) => sleeve(r.genre, meta.records[r.genre], r.hint)).join('')}</div>
    ${hidden.length ? `<p class="kicker disco-label">Hidden tracks</p><div class="sleeves">${hidden.map((g) => sleeve(g, meta.records[g])).join('')}</div>` : ''}`;
}

// The remix crate: channels in rows, styles in columns. A remix is earned with a Master Tape on its sound at
// BALANCE.remix.minLevel or more, so a tile is the sound's glyph: gold with the remix's name once found, dim with the sound's name in a
// tooltip until then.
function remixesHtml(meta) {
  const styles = Object.keys(STYLES);
  const all = INSTRUMENTS.filter((d) => d.remix);
  const tiles = ROLES.map((role) => styles.map((style) => {
    const def = INSTRUMENTS.find((d) => d.role === role && d.style === style);
    if (!def?.remix) return '<div class="rx none"></div>';
    const found = !!meta.remixes[def.id];
    return `<div class="rx${found ? ' found' : ''}" style="--c:${ROLE_INFO[role].color}" title="${esc(found ? `${def.remix.name} · ${def.name}` : def.name)}">
      <span class="rx-g">${icon(def.id, role)}</span>${found ? `<b>${esc(def.remix.name)}</b>` : ''}</div>`;
  }).join('')).join('');
  return `<p class="kicker disco-label">Found ${Object.keys(meta.remixes).length} of ${all.length}</p>
    <div class="rx-grid" style="--cols:${styles.length}">${styles.map((st) => `<span class="rx-head" style="color:${styleColor(st)}">${esc(styleName(st))}</span>`).join('')}${tiles}</div>`;
}

function notesHtml(meta) {
  return `<ol class="notes">${GOALS.map((g) => `<li class="${meta.goals[g.id] ? 'done' : ''}"><i aria-hidden="true">${meta.goals[g.id] ? '✓' : ''}</i>
    <span><b>${esc(g.name)}</b> ${esc(g.text)}</span><small>Unlocks ${esc(unlockLabel(g))}</small></li>`).join('')}</ol>`;
}

// The style rules on the pause sheet, from CHEMISTRY in either shape (tier arrays, or { name, text, tiers }), lit
// at the tiers the band plays (a crossover's lift included), under the crossover in play and its sentence.
function rulesHtml(g) {
  const counts = g.loadout.styleCounts(), R = g.stats.rules;
  const xs = Object.keys(counts).filter((st) => counts[st] >= 2).map(styleColor);
  const x = R.x ? `<li class="on x" style="--g:linear-gradient(${xs.join(', ')})"><b>${esc(R.x)}</b><p>${esc(CROSS_TEXT[R.x])}</p></li>` : '';
  return x + Object.keys(CHEMISTRY).map((st) => {
    const c = CHEMISTRY[st];
    const tiers = chemTiers(st);
    const n = counts[st] || 0, tier = R.tiers?.[st] || 0;
    const head = Array.isArray(c) ? '' : [c?.name, c?.text].filter(Boolean).map(esc).join(': ');
    return `<li class="${tier ? 'on' : ''}" style="--s:${styleColor(st)}">
      <b>${esc(styleName(st))}<span>${n}</span></b>${head ? `<p>${head}</p>` : ''}
      <ol>${tiers.map((t, i) => `<li class="${i < tier ? 'on' : ''}"><i>${t.n}</i>${esc(t.text || '')}</li>`).join('')}</ol></li>`;
  }).join('');
}

export class Screens {
  constructor(root, h) {
    this.root = root;
    this.h = h;
    this.current = null;
    this.focus = 0;
    this.lastPointer = -1e9;
    this.playing = null;     // the card being auditioned (its step lane follows the audio)
    this.info = !!h.getSettings?.().cardInfo;
    root.classList.toggle('info', this.info);
  }

  // armMs: the screen is 'arming' that long, and clicks on anything in it are dropped until then (keys wait
  // in main.js onKey). Hover, focus and hold-to-listen keep working. A track playing on the screen that
  // is left (the end screen's or a sleeve's radio edit) stops.
  _mount(name, html, armMs = 0) {
    this.h.onStopTrack();
    this.stopAttract();
    this.current = name;
    this.playing = null;
    this._lit = null;
    this.cards = null;
    this.seqCanvas = null;
    document.body.dataset.screen = name;
    this.root.innerHTML = `<div class="screen screen-${name}" role="dialog" aria-modal="true">${html}</div>`;
    this.root.hidden = false;
    this.root.scrollTop = 0;
    const el = this.root.firstElementChild;
    if (armMs) {
      el.classList.add('arming');
      el.addEventListener('click', (e) => { if (el.classList.contains('arming')) { e.stopPropagation(); e.preventDefault(); } }, true);
      setTimeout(() => el.classList.remove('arming'), armMs);
    }
    return el;
  }

  armed() { return !this.root.firstElementChild?.classList.contains('arming'); }

  hide() {
    this.h.onStopTrack();
    this.stopAttract();
    this.h.onTarget?.(null);
    this.current = null;
    this.playing = null;
    this.cards = null;
    delete document.body.dataset.screen;
    this.root.innerHTML = '';
    this.root.hidden = true;
  }

  // The info layer: every card's details (and the Gain modifiers) on the card screens. The choice is kept.
  toggleInfo(on = !this.info) {
    this.info = on;
    this.root.classList.toggle('info', on);
    this.root.querySelector('[data-act=info]')?.setAttribute('aria-pressed', String(on));
    this.h.onSettings?.({ cardInfo: on });
  }

  // ---------------------------------------------------------------------------- title

  title(best) {
    const bestLine = best ? `<p class="best">Best: ${best.won ? 'finished the song' : `reached ${esc(best.section)}`} · ${best.score.toLocaleString('en-US')}${best.gain ? ` · Gain ${best.gain}` : ''}</p>` : '';
    const el = this._mount('title', `
      <div class="title-wrap">
        <div class="logo" aria-label="Loop Survivors">
          <span class="logo-row">${'LOOP'.split('').map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}</span>
          <span class="logo-row logo-row-b">${'SURVIVORS'.split('').map((c, i) => `<span style="--i:${i + 4}">${c}</span>`).join('')}</span>
        </div>
        <p class="tagline">Every attack is a note. Every build is a song.</p>
        <div class="title-actions">
          <button class="btn btn-primary" type="button" data-act="play">Play</button>
          <button class="btn" type="button" data-act="disco">Discography</button>
          <button class="btn" type="button" data-act="howto">How to play</button>
          <button class="btn" type="button" data-act="settings">Settings</button>
        </div>
        ${bestLine}
        <p class="hint-line">Sound on. Headphones help.</p>
      </div>`);
    el.querySelector('[data-act=play]').addEventListener('click', () => this.h.onPlay());
    el.querySelector('[data-act=disco]').addEventListener('click', () => this.h.onDiscography('title'));
    el.querySelector('[data-act=howto]').addEventListener('click', () => this.howto('title'));
    el.querySelector('[data-act=settings]').addEventListener('click', () => this.settings('title'));
    el.querySelector('[data-act=play]').focus();
  }

  // The style rule's line wears a card's gems for two sounds of a style (the second at its tier).
  howto(back) {
    const rows = [
      ['keys', 'Move. Your sounds play themselves.'],
      ['heal', 'Bodies are the danger. Keep moving.'],
      ['plus', 'One sound per channel. More channels open as the song goes on.'],
      ['up', 'Pick a card on every level. Hear it before you take it.'],
      ['info', 'Press I for the details on any card.'],
      ['gems', 'Two sounds of a style turn on its rule, drawn on the floor.'],
      ['drop', 'Collect notes to fill the Drop, then set it off.'],
      ['drop', 'Land the Drop as the band slams back in (its ring doubles) for a Double Drop.'],
      ['tape', `Silence a boss in time: its Master Tape remixes a sound at level ${BALANCE.remix.minLevel} or more.`],
      ['boss', 'Survive the song. Silence White Noise to win.'],
    ].map(([g, t]) => `<li><span class="ht-icon">${g === 'gems' ? '<span class="gems"><i></i><i class="big"></i></span>' : icon(g)}</span><span>${t}</span></li>`).join('');
    const keys = [['Move', 'WASD or arrows', 'Left stick'], ['The Drop', 'Space', 'A'], ['Pick a card', '1 · 2 · 3', 'A'], ['Card info', 'I', 'Y'], ['Reroll', 'R', 'X'],
      ['Banish · Skip', 'X · Q', 'D-pad to the button, then A'], ['Pause', 'Esc or P', 'Start'], ['Back', '', 'B'], ['Mute', 'M', '']]
      .map(([act, key, pad]) => `<tr><th>${act}</th><td>${key}</td><td>${pad}</td></tr>`).join('');
    const el = this._mount('howto', `
      <div class="panel panel-wide">
        <h2>How to play</h2>
        <ul class="howto">${rows}</ul>
        <table class="keys"><thead><tr><th></th><th>Keyboard</th><th>Gamepad</th></tr></thead><tbody>${keys}</tbody></table>
        <p class="touch-note">Drag anywhere to move. Hold a card to hear it. Tap the round button when the Drop is full.</p>
        <div class="panel-actions"><button class="btn btn-primary" type="button" data-act="back">Got it</button></div>
      </div>`);
    el.querySelector('[data-act=back]').addEventListener('click', () => (back === 'pause' ? this.h.onShowPause() : this.h.onShowTitle()));
    el.querySelector('[data-act=back]').focus({ preventScroll: true });   // the screen opens at its top
  }

  settings(back) {
    const s = this.h.getSettings();
    const el = this._mount('settings', `
      <div class="panel">
        <h2>Settings</h2>
        <label class="field"><span>Volume</span><input id="set-volume" type="range" min="0" max="100" value="${Math.round(s.volume * 100)}"></label>
        <label class="toggle"><input id="set-chimes" type="checkbox" ${s.chimes ? 'checked' : ''}><span>Note chimes</span></label>
        <label class="toggle"><input id="set-dmg" type="checkbox" ${s.damageNumbers ? 'checked' : ''}><span>Damage numbers</span></label>
        <label class="toggle"><input id="set-shake" type="checkbox" ${s.shake ? 'checked' : ''}><span>Screen shake</span></label>
        <label class="toggle"><input id="set-flash" type="checkbox" ${s.flashes ? 'checked' : ''}><span>Screen flashes</span></label>
        <label class="toggle"><input id="set-info" type="checkbox" ${s.cardInfo ? 'checked' : ''}><span>Card details</span></label>
        <div class="panel-actions"><button class="btn btn-primary" type="button" data-act="back">Done</button></div>
      </div>`);
    const upd = () => {
      const cardInfo = el.querySelector('#set-info').checked;
      this.h.onSettings({
        volume: el.querySelector('#set-volume').value / 100,
        chimes: el.querySelector('#set-chimes').checked,
        damageNumbers: el.querySelector('#set-dmg').checked,
        shake: el.querySelector('#set-shake').checked,
        flashes: el.querySelector('#set-flash').checked,
        cardInfo,
      });
      this.info = cardInfo;
      this.root.classList.toggle('info', cardInfo);
    };
    el.querySelectorAll('input').forEach((i) => i.addEventListener('input', upd));
    el.querySelector('[data-act=back]').addEventListener('click', () => (back === 'pause' ? this.h.onShowPause() : this.h.onShowTitle()));
    el.querySelector('[data-act=back]').focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------------------- discography

  // The career: records pressed (a pressed sleeve plays its run's radio edit), the remix crate and the liner
  // notes. back: 'title' or 'end', where Back returns.
  discography(meta, back) {
    const h = Math.floor(meta.secs / 3600), min = Math.floor((meta.secs % 3600) / 60);
    const career = [plural(meta.runs, 'run'), plural(meta.wins, 'song finished', 'songs finished'), `${meta.kills.toLocaleString('en-US')} Noise silenced`, `${h ? `${h} h ` : ''}${min} min on stage`].join(' · ');
    const tabs = [['records', 'Records'], ['remixes', 'Remixes'], ['notes', 'Liner notes']];
    const el = this._mount('disco', `
      <div class="panel panel-wide disco">
        <h2>Discography</h2>
        <p class="sub">${career}</p>
        <div class="tabs" role="tablist">${tabs.map(([id, name]) => `<button class="tab" type="button" role="tab" data-page="${id}">${name}</button>`).join('')}</div>
        <div class="disco-page"></div>
        <div class="panel-actions"><button class="btn btn-primary" type="button" data-act="back">Back</button></div>
      </div>`);
    const show = (id) => {
      this.h.onStopTrack();
      el.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.page === id)));
      el.querySelector('.disco-page').innerHTML = id === 'records' ? recordsHtml(meta) : id === 'remixes' ? remixesHtml(meta) : notesHtml(meta);
      const np = el.querySelector('.now-playing');
      // A pressed sleeve plays its radio edit. Pressed again, or on any way off the page, it stops.
      el.querySelectorAll('button.sleeve').forEach((sl) => sl.addEventListener('click', () => {
        if (sl.classList.contains('playing')) { this.h.onStopTrack(); return; }
        const genre = sl.dataset.genre, rec = meta.records[genre];
        this.h.onPlayTrack(rec.sh, rec.kp, rec.sg, (name, n) => { np.textContent = `Now playing: ${genre} · ${tuneOf(rec.sg).name} · ${name} · ${plural(n, 'sound')}`; }, () => { sl.classList.remove('playing'); np.textContent = ''; });
        sl.classList.add('playing');
      }));
    };
    el.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => show(t.dataset.page)));
    el.querySelector('[data-act=back]').addEventListener('click', () => (back === 'end' ? this.h.onShowEnd() : this.h.onShowTitle()));
    show('records');
    el.querySelector('[data-page=records]').focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------------------- first sound

  // defs: the three featured first sounds. chips: the other sounds the career has unlocked, picked and
  // auditioned like the cards (glyphs with a style edge). Every other sound shows as a dim locked
  // silhouette (its goal in a tooltip). meta: the career when a Gain is open (the stepper), else null.
  // song: the song picked (an index into SONGS) when the song stepper shows (after the first run), else null.
  select(defs, chips, meta, song = null) {
    const descs = defs.map((def) => ({
      kind: 'new', title: def.name, color: ROLE_INFO[def.role].color, style: def.style, glyph: def.id, from: null, level: 1, maxLevel: MAX_INSTRUMENT_LEVEL,
      cells: def.levels[0].pattern.reduce((cells, n) => { if (cells[n.s]) cells[n.s] = { on: true, v: n.v ?? 1 }; return cells; }, Array.from({ length: def.steps || 16 }, () => ({ on: false }))),
      gems: [], slot: { role: def.role }, info: [def.blurb, def.levels[0].text].filter(Boolean),
    }));
    const cards = descs.map((d, i) => cardHtml(d, i)).join('');
    const chipHtml = chips.map((def, i) => `
      <button class="card chip" type="button" data-i="${defs.length + i}" data-style="${esc(def.style)}" style="--c:${ROLE_INFO[def.role].color};--s:${styleColor(def.style)}" title="${esc(`${def.name} · ${styleName(def.style)}`)}" aria-label="${esc(`${def.name}, ${styleName(def.style)}, ${ROLE_INFO[def.role].name} channel`)}">
        ${icon(def.id, def.role)}</button>`).join('');
    // Only sounds a liner-note goal opens as a first sound get a silhouette (a lock that never opens is a lie).
    const shown = new Set([...defs, ...chips].map((d) => d.id));
    const locked = INSTRUMENTS.map((def) => [def, GOALS.find((g) => unlocksOf(g).includes(def.id))]).filter(([def, goal]) => goal && !shown.has(def.id))
      .map(([def, goal]) => `<span class="chip locked" style="--c:${ROLE_INFO[def.role].color}" title="${esc(`${goal.name}: ${goal.text}`)}">${icon(def.id, def.role)}<i>${icon('lock')}</i></span>`).join('');
    const songRow = song !== null ? `
      <div class="song">
        <button class="ibtn ibtn-sm" type="button" data-song="-1" aria-label="Previous song">${icon('back')}${kbd(',', 'LT')}</button>
        <span class="song-name" aria-live="polite"></span>
        <button class="ibtn ibtn-sm flip" type="button" data-song="1" aria-label="Next song">${icon('back')}${kbd('.', 'RT')}</button>
      </div>` : '';
    const gain = meta ? `
      <div class="gain">
        <span class="gain-name"></span>
        <button class="ibtn ibtn-sm" type="button" data-gain="-1" aria-label="Less Gain">${icon('back')}${kbd('[', 'LB')}</button>
        <button class="ibtn ibtn-sm flip" type="button" data-gain="1" aria-label="More Gain">${icon('back')}${kbd(']', 'RB')}</button>
        <span class="gain-score"></span>
      </div>` : '';
    const all = [...defs, ...chips];
    const el = this._mount('select', `
      <div class="cards-wrap">
        <div class="cards">${cards}</div>
        <div class="chips">${chipHtml}${locked}</div>
        ${songRow || gain ? `<div class="dials">${songRow}${gain}</div>` : ''}
        ${meta ? '<p class="gain-mods"></p>' : ''}
        <div class="row-actions">
          <button class="btn btn-ghost" type="button" data-act="back">Back</button>
          <button class="ibtn" type="button" data-act="info" aria-label="Card details" title="Card details" aria-pressed="${this.info}">${icon('info')}${kbd('I', 'Y')}</button>
        </div>
      </div>`);
    el.querySelectorAll('[data-gain]').forEach((b) => b.addEventListener('click', () => this.h.onGain(Number(b.dataset.gain))));
    el.querySelectorAll('[data-song]').forEach((b) => b.addEventListener('click', () => this.h.onSong(Number(b.dataset.song))));
    if (meta) this.setGain(meta.gainSel);
    if (song !== null) this.setSong(song);
    this.descs = descs;
    this._wireCards(el, (i) => this.h.onPickStart(all[i].id), (i) => this.h.onPreviewStart(i === null ? null : all[i].id));
    el.querySelector('[data-act=back]').addEventListener('click', () => { this.h.onPreviewStart(null); this.h.onShowTitle(); });
    el.querySelector('[data-act=info]').addEventListener('click', () => this.toggleInfo());
    // Attract: the featured sounds take turns every two bars until the player does anything.
    const stop = () => this.stopAttract();
    ['pointerdown', 'focusin'].forEach((t) => el.addEventListener(t, stop, { once: true }));
    el.querySelectorAll('.card').forEach((c) => c.addEventListener('pointerenter', stop, { once: true }));
    if (document.body.dataset.input !== 'pad') {
      let k = 0;
      this._preview(0);
      this._attract = setInterval(() => { k = (k + 1) % defs.length; this._preview(k); }, 2 * BAR_SEC * 1000);
    }
  }

  stopAttract() { clearInterval(this._attract); this._attract = null; }

  // The song stepper: "◂ Ode ▸" over its credit. The arrows dim at the ends of the setlist; a pad or arrow-key
  // focus on the one that dims moves to the other, so it stays in the row.
  setSong(i) {
    const el = this.root.querySelector('.song');
    if (!el) return;
    const t = SONGS[i], [prev, next] = el.querySelectorAll('[data-song]'), a = document.activeElement;
    el.querySelector('.song-name').innerHTML = `<b>${esc(t.name)}</b><small>${esc(t.credit || '')}</small>`;
    prev.disabled = i <= 0;
    next.disabled = i >= SONGS.length - 1;
    if (a === prev && prev.disabled) next.focus();
    if (a === next && next.disabled) prev.focus();
  }

  // The Gain stepper: "Gain 2 ◂ ▸ ×1.2". Its name and modifiers sit in the info layer.
  setGain(n) {
    const el = this.root.querySelector('.gain');
    if (!el) return;
    el.querySelector('.gain-name').innerHTML = `Gain <b>${n}</b>`;
    el.querySelector('.gain-score').textContent = `×${(1 + 0.1 * n).toFixed(1)}`;
    el.title = n ? GAIN[n - 1].name : 'The song as written';
    this.root.querySelector('.gain-mods').textContent = n ? `${GAIN[n - 1].name}: ${GAIN.slice(0, n).map((t) => t.text).join(' · ')}` : 'The song as written.';
  }

  // ---------------------------------------------------------------------------- level up

  levelUp(g, offers) {
    const descs = this.descs = offers.map((o) => describeOffer(g, o));
    // A sound, pedal or remix never taken (in a past run or this one) shows its first info lines without the info layer.
    // A band sound is never a new or swap card, so only the swapped-out ones can have been taken this run.
    const meta = this.h.getSeen?.();
    if (meta) {
      const had = new Set((g.retired || []).map((i) => i.def.id));
      for (const d of descs) d.fresh = d.kind === 'remix' ? !meta.remixes[d.glyph] : ['new', 'swap', 'pedal-new'].includes(d.kind) && !meta.seen[d.glyph] && !had.has(d.glyph);
    }
    const cards = descs.map((d, i) => cardHtml(d, i)).join('');
    // A Master Tape's remix cards: gold cards only, no reroll, banish or skip, and a reel over them.
    const tape = !!g.tapeOffers;
    const pending = tape ? 0 : g.pendingLevels;   // chained level-ups: one dot per pick still to make, this one lit
    const canBan = !tape && g.banishes > 0 && offers.some(banKey);
    const el = this._mount('levelup', `
      <div class="cards-wrap${descs.some((d) => d.kind === 'remix') ? ' has-remix' : ''}${tape ? ' tape-pick' : ''}">
        ${tape ? `<div class="tape-mark" role="img" aria-label="Master Tape: pick the remix">${icon('tape')}</div>` : ''}
        ${pending > 1 ? `<div class="pending" role="img" aria-label="${pending} picks to make">${'<i></i>'.repeat(Math.min(pending, 12))}</div>` : ''}
        <div class="cards" style="--n:${offers.length}">${cards}</div>
        <div class="row-actions">
          ${tape ? '' : `<button class="ibtn" type="button" data-act="reroll" aria-label="Reroll, ${g.rerolls} left" title="Reroll" ${g.rerolls > 0 ? '' : 'disabled'}>${icon('reroll')}${dots(g.rerolls, Math.max(REROLLS_PER_RUN, g.rerolls))}${kbd('R', 'X')}</button>
          <button class="ibtn" type="button" data-act="banish" aria-pressed="false" aria-label="Banish a card, ${g.banishes} left. It never comes back this run, upgrades included" title="Banish" ${canBan ? '' : 'disabled'}>${icon('banish')}${dots(g.banishes, Math.max(BANISHES_PER_RUN, g.banishes))}${kbd('X')}</button>
          <button class="ibtn" type="button" data-act="skip" aria-label="Skip this level. Its notes fill the Drop meter" title="Skip">${icon('skip')}<span class="mini">${icon('drop')}</span>${kbd('Q')}</button>`}
          <button class="ibtn" type="button" data-act="info" aria-label="Card details" title="Card details" aria-pressed="${this.info}">${icon('info')}${kbd('I', 'Y')}</button>
        </div>
      </div>`, ARM_MS);
    // Banish mode: the next card picked is banished instead of taken. Remix, Fader and bonus cards cannot be.
    this.banishing = false;
    el.querySelectorAll('.card').forEach((c, i) => c.classList.toggle('no-ban', !banKey(offers[i])));
    this._wireCards(el, (i) => (this.banishing ? this.h.onBanish(i) : this.h.onChoose(i)), (i) => this.h.onPreview(i));
    el.querySelector('[data-act=reroll]')?.addEventListener('click', () => this.h.onReroll());
    el.querySelector('[data-act=banish]')?.addEventListener('click', () => this.toggleBanish());
    el.querySelector('[data-act=skip]')?.addEventListener('click', () => this.h.onSkip());
    el.querySelector('[data-act=info]').addEventListener('click', () => this.toggleInfo());
    // The first card plays at once on every device, without taking focus (so Enter never takes it blind).
    if (this.playing === null) this._preview(0);
  }

  toggleBanish(on = !this.banishing) {
    const btn = this.current === 'levelup' ? this.root.querySelector('[data-act=banish]') : null;
    if (!btn || btn.disabled) return;
    this.banishing = on;
    btn.setAttribute('aria-pressed', String(on));
    this.root.querySelector('.cards').classList.toggle('banishing', on);
  }

  // Audition card i (null: none): its sound plays in the mix, its lane follows the audio, and the HUD lights
  // the slot it plugs into.
  _preview(i) {
    const card = i === null ? null : this.cards?.[i];
    this.playing = card ? i : null;
    this.cards?.forEach((c, k) => c.classList.toggle('auditioning', k === this.playing));
    if (this._lit) { this._lit.classList.remove('now'); this._lit = null; }
    this.onPreviewCard?.(this.playing);
    const d = this.playing !== null ? this.descs?.[this.playing] : null;
    this.h.onTarget?.(d?.slot || null, d);
  }

  _wireCards(el, onPick, onPreview) {
    const cards = [...el.querySelectorAll('.card')];
    this.cards = cards;
    this.onPick = onPick;
    this.onPreviewCard = onPreview;
    let holdTimer = null, held = false;
    cards.forEach((card, i) => {
      card.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { this.focus = i; this._preview(i); } });
      card.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && this.playing === i) this._preview(null); });
      card.addEventListener('focus', () => {
        this.focus = i;
        cards.forEach((c, k) => c.classList.toggle('focused', k === i));
        // Focus that follows a tap or click is not a request to listen (hold and hover handle that).
        if (performance.now() - this.lastPointer > 700) this._preview(i);
      });
      card.addEventListener('blur', (e) => {
        if (e.relatedTarget && e.relatedTarget.classList?.contains('card')) return;
        card.classList.remove('focused');
        if (this.playing === i) this._preview(null);
      });
      card.addEventListener('pointerdown', (e) => {
        this.lastPointer = performance.now();
        held = false;
        if (e.pointerType === 'mouse') return;
        holdTimer = setTimeout(() => { held = true; this._preview(i); card.classList.add('listening'); }, 260);
      });
      const endHold = () => { this.lastPointer = performance.now(); clearTimeout(holdTimer); if (held) { this._preview(null); card.classList.remove('listening'); } };
      card.addEventListener('pointerup', endHold);
      card.addEventListener('pointercancel', endHold);
      card.addEventListener('contextmenu', (e) => e.preventDefault());
      card.addEventListener('click', (e) => {
        // A hold eats its own release's click, never a pad A or key press (detail 0): a release while arming leaves held set.
        if (held && e.detail) { held = false; e.preventDefault(); return; }
        onPick(i);
      });
    });
    this.focus = 0;
    // A gamepad always sees which card A takes: the first one has focus (and plays) from the start.
    if (document.body.dataset.input === 'pad') cards[0]?.focus();
  }

  // Every frame while a card screen or the pause sheet is up (main.js): the auditioned card's lane lights the
  // step being heard and its glyph kicks on each of its notes; the pause sheet's step grid redraws.
  tick(cur, seq, g, now) {
    if (this.current === 'pause') { if (this.seqCanvas && g?.loadout) drawSeq(this.seqCanvas, g, seq, now); return; }
    const card = this.playing !== null ? this.cards?.[this.playing] : null;
    if (!card || !cur) return;
    const lane = card.querySelectorAll('.steps i');
    if (!lane.length) return;
    const cell = lane[(heardBar(seq, cur) * 16 + cur.sib) % lane.length];
    if (cell === this._lit) return;
    this._lit?.classList.remove('now');
    this._lit = cell;
    cell.classList.add('now');
    if (cell.classList.contains('on')) kick(card.querySelector('.card-hero'), 'hit');
  }

  // Keyboard and pad navigation for card screens: left and right move along a row (the cards, the chips
  // or the buttons under them), down and up move between rows.
  cardKey(key) {
    if (!this.cards || !this.cards.length) return false;
    if (key >= '1' && key <= '9') {
      const i = Number(key) - 1;
      if (i < this.cards.length) { this.onPick(i); return true; }
    }
    // Arrow keys only: A and D are movement keys and would move focus while strafing.
    if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
      const a = document.activeElement;
      const rows = [...this.root.querySelectorAll('.cards, .chips, .song, .gain, .row-actions')].map((r) => [...r.querySelectorAll('button:not([disabled])')]).filter((r) => r.length);
      const r = rows.findIndex((row) => row.includes(a));
      if (r < 0) this.cards[0].focus();   // first press lands on the first card
      else if (key === 'ArrowDown' || key === 'ArrowUp') {
        // Into a row of cards, back to the card last focused there.
        const to = rows[r + (key === 'ArrowDown' ? 1 : -1)];
        if (to) (to.includes(this.cards[this.focus]) ? this.cards[this.focus] : to[0]).focus();
      } else {
        const row = rows[r];
        row[(row.indexOf(a) + (key === 'ArrowLeft' ? -1 : 1) + row.length) % row.length].focus();
      }
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------- pause

  // The home of the run's details: where you are in the song, the band with its damage, the pedals, the
  // style rules and the live step grid.
  pause(g) {
    const p = g.player;
    const cap = g.channelCap();
    const band = ROLES.map((role) => {
      const inst = g.loadout.channels[role];
      const c = ROLE_INFO[role].color;
      if (!inst) {
        const open = g.loadout.filled() < cap;
        return `<li class="empty" style="--c:${c}"><span class="pb-g">${icon(open ? 'plus' : 'lock')}</span><span class="pb-name">${ROLE_INFO[role].name}<small>${open ? 'free' : 'opens later'}</small></span></li>`;
      }
      const name = inst.remix ? inst.def.remix.name : inst.def.name;
      return `<li class="${inst.remix ? 'remix' : ''}" style="--c:${c};--s:${styleColor(inst.def.style)}">
        <span class="pb-g">${icon(inst.def.id, role)}</span>
        <span class="pb-name">${esc(name)}<small><em>${esc(styleName(inst.def.style))}</em>${inst.remix ? ` · ${esc(inst.def.name)}` : ''}</small></span>
        ${pipsRow(inst.level, MAX_INSTRUMENT_LEVEL)}
        <span class="pb-dmg">${Math.round(inst.dmg).toLocaleString('en-US')}</span></li>`;
    }).join('');
    const pedals = g.loadout.pedals.map((pd) => `<li style="--c:${pd.def.color}"><span class="pb-g">${icon(pd.def.id, 'pedal')}</span>
      <span class="pb-name">${esc(pd.def.name)}<small>${esc(pd.def.text(pd.def.levels[pd.level - 1]))}</small></span>${pipsRow(pd.level, MAX_PEDAL_LEVEL)}</li>`).join('');
    const el = this._mount('pause', `
      <div class="panel panel-wide pause">
        <div class="pause-head">
          <h2>${esc(g.section.name)}</h2>
          <span class="pause-time">${fmtTime(g.time)}</span>
        </div>
        ${songMapHtml(g.sectionIndex, [{ at: songFraction(g.seq.bar), cls: 'head' }])}
        <p class="pause-meta"><b>${esc(g.genre)}</b> · ${esc(g.tune.name)} · ${esc(keyName(g.key.pc, g.tune))} · ${g.kills.toLocaleString('en-US')} silenced · HP ${Math.ceil(p.hp)}/${Math.round(p.maxHp)} · Lv ${g.level}</p>
        <div class="pause-cols">
          <div>
            <ul class="pause-band">${band}</ul>
            ${pedals ? `<ul class="pause-band pause-pedals">${pedals}</ul>` : ''}
          </div>
          <div>
            <canvas class="seqgrid" aria-hidden="true"></canvas>
            <ul class="rules">${rulesHtml(g)}</ul>
          </div>
        </div>
        <div class="panel-actions">
          <button class="btn btn-primary" type="button" data-act="resume">Resume</button>
          <button class="btn" type="button" data-act="howto">How to play</button>
          <button class="btn" type="button" data-act="settings">Settings</button>
          <button class="btn btn-ghost" type="button" data-act="quit">Quit to title</button>
        </div>
      </div>`);
    this.seqCanvas = el.querySelector('.seqgrid');
    el.querySelector('[data-act=resume]').addEventListener('click', () => this.h.onResume());
    el.querySelector('[data-act=howto]').addEventListener('click', () => this.howto('pause'));
    el.querySelector('[data-act=settings]').addEventListener('click', () => this.settings('pause'));
    el.querySelector('[data-act=quit]').addEventListener('click', () => this.h.onQuit());
    el.querySelector('[data-act=resume]').focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------------------- end

  // news: what the run added to the career (applyRun), with saved = false when the device did not keep it,
  // or null (a sim). New things are only claimed once they are saved.
  end(sum, isBest, prevBest = null, news = null) {
    const maxDmg = Math.max(1, ...sum.instruments.map((i) => i.dmg));
    const rows = sum.instruments.map((i) => `
      <li style="--c:${ROLE_INFO[i.role].color}" class="${i.active ? '' : 'retired'}">
        <span class="er-icon">${icon(i.id, i.role)}</span>
        <span class="er-name">${esc(i.name)}<small>${esc(styleName(i.style))} · Lv ${i.level}${sum.remixes.some((r) => r.id === i.id) ? ' · Remix' : ''}${i.active ? '' : ' · swapped'}</small></span>
        <span class="er-bar"><i style="transform:scaleX(${i.dmg / maxDmg})"></i></span>
        <span class="er-num">${i.dmg.toLocaleString('en-US')}</span>
      </li>`).join('');
    const pedals = sum.pedals.map((p) => `<span class="end-pedal" style="--c:${PEDAL_BY_ID[p.id]?.color || '#fff'}" title="${esc(`${p.name} · Lv ${p.level}`)}">${icon(p.id, 'pedal')}${pipsRow(p.level, MAX_PEDAL_LEVEL)}</span>`).join('');
    const lines = news?.saved ? [
      ...(news.songs ? [`New songs in the lobby: ${new Intl.ListFormat('en').format(SONGS.slice(1).map((t) => t.name))}.`] : []),
      ...(news.record ? [`Record pressed: ${news.record.genre}, ${news.record.gold ? 'gold' : 'demo'}.`] : []),
      ...(news.gain ? [`Gain ${news.gain} unlocked: ${GAIN[news.gain - 1].name}.`] : []),
      ...news.goals.map((g) => `New first sound: ${unlockLabel(g)}.`),
      ...news.remixes.map((id) => `New remix in your crate: ${BY_ID[id]?.remix?.name || id}.`),
    ] : [];
    const notes = !news ? '' : !news.saved ? '<p class="end-unsaved">Progress could not be saved on this device.</p>'
      : lines.length ? `<div class="end-notes"><p class="kicker">Liner notes</p><ul>${lines.slice(0, 4).map((l) => `<li>${esc(l)}</li>`).join('')}${lines.length > 4 ? `<li class="more">and ${lines.length - 4} more</li>` : ''}</ul></div>` : '';
    // The liner-note goal to go for next, from the saved career (so never one this run met but could not keep).
    const career = news?.saved && this.h.getSeen?.();
    const goal = career ? nextGoal(career) : null;
    const next = goal ? `<p class="end-next"><b>Next:</b> ${esc(goal.text)} Opens ${esc(unlockLabel(goal))}.</p>` : '';
    const el = this._mount('end', `
      <div class="panel panel-wide end">
        <h2>${sum.won ? 'Encore!' : 'Drowned out'}</h2>
        <div class="end-stats">
          <div><b data-n="${sum.time}" data-time>${fmtTime(sum.time)}</b><span>survived</span></div>
          <div><b data-n="${sum.kills}">${sum.kills.toLocaleString('en-US')}</b><span>silenced</span></div>
          <div><b data-n="${sum.level}">${sum.level}</b><span>level</span></div>
          <div><b data-n="${sum.score}">${sum.score.toLocaleString('en-US')}</b><span>score${isBest ? ' · best' : ''}${sum.gain ? ` · G${sum.gain}` : ''}</span></div>
        </div>
        ${notes}${next}
        ${songEndHtml(sum, isBest, prevBest)}
        <p class="end-genre"><b>${esc(sum.genre)}</b> · ${esc(tuneOf(sum.songId).name)} · ${esc(keyName(sum.keyPc, tuneOf(sum.songId)))}</p>
        <p class="now-playing" aria-live="polite"></p>
        <ul class="end-rows">${rows || '<li>No instruments</li>'}</ul>
        ${pedals ? `<p class="end-pedals">${pedals}</p>` : ''}
        <div class="panel-actions">
          <button class="btn" type="button" data-act="listen" aria-pressed="false">Listen to your track</button>
          <button class="btn btn-primary" type="button" data-act="again">Play again</button>
          <button class="btn" type="button" data-act="disco">Discography</button>
          <button class="btn btn-ghost" type="button" data-act="back">Title</button>
        </div>
      </div>`);
    // Listen plays the run's radio edit and turns into Stop. Any way off the screen stops it too.
    const listen = el.querySelector('[data-act=listen]'), np = el.querySelector('.now-playing');
    const done = () => { listen.setAttribute('aria-pressed', 'false'); listen.textContent = 'Listen to your track'; np.textContent = ''; };
    listen.addEventListener('click', () => {
      if (listen.getAttribute('aria-pressed') === 'true') { this.h.onStopTrack(); return; }
      this.h.onPlayTrack(sum.sheet, sum.keyPc, sum.songId, (name, n) => { np.textContent = `Now playing: ${name} · ${plural(n, 'sound')}`; }, done);
      listen.setAttribute('aria-pressed', 'true');
      listen.textContent = 'Stop';
    });
    el.querySelector('[data-act=again]').addEventListener('click', () => this.h.onRestart());
    el.querySelector('[data-act=disco]').addEventListener('click', () => this.h.onDiscography('end'));
    el.querySelector('[data-act=back]').addEventListener('click', () => this.h.onShowTitle());
    el.querySelector('[data-act=again]').focus({ preventScroll: true });
    this._curtain(el, sum, maxDmg);
  }

  // The curtain call: the stats count up in turn, then the damage bars grow one by one from the smallest, each
  // on a chord tone a step higher (onCurtain, Note chimes), and the biggest flares in its channel color. Any key
  // (skipCurtain), click or tap shows the final state, where reduced motion and a return from the Discography
  // start. The markup holds the final state, so rows at 0 (nothing to grow) sit out.
  _curtain(el, sum, max) {
    this._skip = null;
    if (this._curtainOf === sum || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    this._curtainOf = sum;
    const { stat, gap, grow } = CURTAIN;
    const stats = [...el.querySelectorAll('.end-stats b[data-n]')];
    const lis = el.querySelectorAll('.end-rows li');
    const rows = sum.instruments.map((r, i) => ({ li: lis[i], bar: lis[i].querySelector('.er-bar i'), num: lis[i].querySelector('.er-num'), n: r.dmg })).filter((r) => r.n > 0).reverse();
    const t0 = stats.length * stat, n = rows.length, end = t0 + Math.max(0, n - 1) * gap + grow;
    const ease = (k) => 1 - (1 - Math.min(1, Math.max(0, k))) ** 3;
    let next = 0, raf = 0, chime = null;
    const draw = (t, quiet) => {
      for (const [i, b] of stats.entries()) {
        const v = b.dataset.n * ease(t / stat - i);
        b.textContent = 'time' in b.dataset ? fmtTime(v) : Math.round(v).toLocaleString('en-US');
      }
      for (const [j, r] of rows.entries()) {
        const k = ease((t - t0 - j * gap) / grow);
        r.bar.style.transform = `scaleX(${(r.n / max) * k})`;
        r.num.textContent = Math.round(r.n * k).toLocaleString('en-US');
      }
      // The biggest bar takes tone 5 (the top of the chime range), each one before it a chord tone lower (under 0
      // into the octave below), so every note climbs. Only the latest note due sounds: after a stall (a hidden
      // tab, a long frame) the missed ones stay quiet instead of landing as one stacked chord.
      for (; next < n && t >= t0 + next * gap; next++) {
        if (quiet || (next < n - 1 && t >= t0 + (next + 1) * gap)) continue;
        (chime ||= this.h.onCurtain?.())?.(next + 6 - n);   // onCurtain holds the chord sounding at the first note
        if (next === n - 1) rows[next].li.classList.add('top');
      }
    };
    const skip = () => { stop(); draw(Infinity, true); return true; };
    const stop = () => { cancelAnimationFrame(raf); if (this._skip === skip) this._skip = null; el.removeEventListener('click', onClick, true); };
    const onClick = () => skip();   // a click or tap on a button also presses it
    this._skip = skip;
    el.addEventListener('click', onClick, true);
    const start = performance.now();
    const tick = (now) => {
      if (!el.isConnected) { stop(); return; }
      const t = (now - start) / 1000;
      draw(t);
      if (t < end) raf = requestAnimationFrame(tick); else stop();
    };
    draw(0);
    raf = requestAnimationFrame(tick);
  }

  // A key on the end screen first finishes its curtain call: true when there was one to finish.
  skipCurtain() { return !!this._skip?.(); }
}
