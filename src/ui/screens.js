// Menus and overlays: title, how to play, first-sound select, level-up cards, pause, and the end screen.

import { ROLE_INFO, STYLES, ROLES } from '../config.js';
import { fmtTime } from '../util.js';
import { icon } from './icons.js';
import { describeOffer, banKey } from '../game/upgrades.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function stepsHtml(cells) {
  if (!cells) return '';
  const rows = [];
  for (let i = 0; i < cells.length; i += 16) rows.push(cells.slice(i, i + 16));
  return `<div class="steps" aria-hidden="true">${rows.map((row) => `<div class="steps-row">${row.map((c, i) => `<i class="${c.on ? 'on' : ''}${c.isNew ? ' new' : ''}${i % 4 === 0 ? ' beat' : ''}" style="--v:${c.v || 0}"></i>`).join('')}</div>`).join('')}</div>`;
}

function pipsHtml(level, max) {
  if (!max) return '';
  return `<div class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < level ? 'on' : ''}${i === level - 1 ? ' cur' : ''}"></i>`).join('')}</div>`;
}

export function cardHtml(d, index, opts = {}) {
  const style = d.style ? `<span class="badge" style="--s:${d.style.color}">${esc(d.style.name)}</span>` : '';
  const chem = (d.chem || []).map((c) => `<li class="${c.good === true ? 'good' : c.good === false ? 'bad' : ''}${c.remix ? ' remix' : ''}">${esc(c.text)}</li>`).join('');
  return `
  <button class="card${d.remix ? ' card-remix' : ''}" type="button" data-i="${index}" style="--c:${d.color}">
    <span class="card-key" aria-hidden="true">${index + 1}</span>
    <span class="card-top"><span class="eyebrow">${esc(d.eyebrow)}</span>${style}</span>
    <span class="card-head"><span class="card-icon">${icon(d.icon)}</span><span class="card-title">${esc(d.title)}</span></span>
    <span class="card-tag">${esc(d.tag || '')}</span>
    ${pipsHtml(d.level, d.maxLevel)}
    <span class="card-body">${esc(d.body || '')}</span>
    ${d.detail ? `<span class="card-detail">${esc(d.detail)}</span>` : ''}
    ${stepsHtml(d.cells)}
    ${chem ? `<ul class="chem-list">${chem}</ul>` : ''}
    ${opts.listen ? '<span class="card-listen" role="presentation">Tap and hold to listen</span>' : ''}
  </button>`;
}

export class Screens {
  constructor(root, h) {
    this.root = root;
    this.h = h;
    this.current = null;
    this.focus = 0;
    this.listening = false;
    this.lastPointer = -1e9;
  }

  _mount(name, html) {
    this.current = name;
    document.body.dataset.screen = name;
    this.root.innerHTML = `<div class="screen screen-${name}" role="dialog" aria-modal="true">${html}</div>`;
    this.root.hidden = false;
    return this.root.firstElementChild;
  }

  hide() {
    this.current = null;
    delete document.body.dataset.screen;
    this.root.innerHTML = '';
    this.root.hidden = true;
  }

  // ---------------------------------------------------------------------------- title

  title(best) {
    const bestLine = best ? `<p class="best">Best run: ${fmtTime(best.time)} · ${best.kills.toLocaleString('en-US')} silenced · ${best.won ? 'finished the song' : `reached ${esc(best.section)}`}</p>` : '';
    const el = this._mount('title', `
      <div class="title-wrap">
        <div class="logo" aria-label="Loop Survivors">
          <span class="logo-row">${'LOOP'.split('').map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}</span>
          <span class="logo-row logo-row-b">${'SURVIVORS'.split('').map((c, i) => `<span style="--i:${i + 4}">${c}</span>`).join('')}</span>
        </div>
        <p class="tagline">Every attack is a note. Every build is a song.</p>
        <div class="title-actions">
          <button class="btn btn-primary" type="button" data-act="play">Play</button>
          <button class="btn" type="button" data-act="howto">How to play</button>
          <button class="btn" type="button" data-act="settings">Settings</button>
        </div>
        ${bestLine}
        <p class="hint">Sound on. Headphones help.</p>
      </div>`);
    el.querySelector('[data-act=play]').addEventListener('click', () => this.h.onPlay());
    el.querySelector('[data-act=howto]').addEventListener('click', () => this.howto('title'));
    el.querySelector('[data-act=settings]').addEventListener('click', () => this.settings('title'));
    el.querySelector('[data-act=play]').focus();
  }

  howto(back) {
    const rows = ROLES.map((r) => `<li style="--c:${ROLE_INFO[r].color}"><span class="ht-icon">${icon(r)}</span><b>${ROLE_INFO[r].name}</b><span>${ROLE_INFO[r].desc}</span></li>`).join('');
    const el = this._mount('howto', `
      <div class="panel panel-wide">
        <h2>How to play</h2>
        <ol class="howto">
          <li><b>Move.</b> WASD or arrow keys. On a touch screen, drag anywhere. Moving is all you control.</li>
          <li><b>Your instruments fight for you.</b> They play on the beat by themselves, and every note they play is an attack.</li>
          <li><b>One instrument per channel.</b> Your mixer has six channels. Each one holds a single sound, so the song never turns to mush. A new sound for a full channel swaps out the old one. Channels open up as the song goes on, so your band grows with it.</li>
          <li><b>It always sounds right.</b> Every note is tuned to the song's key and locked to the beat. Pick what you like.</li>
          <li><b>Styles belong together.</b> Instruments are Synth, Live or 8-Bit. Two or more of a style unlock a bonus. Two of every style unlocks Fusion.</li>
          <li><b>Pedals</b> change your sound and your stats at the same time. You have four slots.</li>
          <li><b>The Drop.</b> Collected notes fill the Drop meter. Press Space (or tap the meter) when it is full. The music builds for one bar and slams on the downbeat.</li>
          <li><b>Survive the song.</b> Each chorus brings a boss. Silence White Noise in the finale to win.</li>
        </ol>
        <ul class="roles">${rows}</ul>
        <div class="panel-actions"><button class="btn btn-primary" type="button" data-act="back">Got it</button></div>
      </div>`);
    el.querySelector('[data-act=back]').addEventListener('click', () => (back === 'pause' ? this.h.onShowPause() : this.h.onShowTitle()));
    el.querySelector('[data-act=back]').focus();
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
        <div class="panel-actions"><button class="btn btn-primary" type="button" data-act="back">Done</button></div>
      </div>`);
    const upd = () => this.h.onSettings({
      volume: el.querySelector('#set-volume').value / 100,
      chimes: el.querySelector('#set-chimes').checked,
      damageNumbers: el.querySelector('#set-dmg').checked,
      shake: el.querySelector('#set-shake').checked,
      flashes: el.querySelector('#set-flash').checked,
    });
    el.querySelectorAll('input').forEach((i) => i.addEventListener('input', upd));
    el.querySelector('[data-act=back]').addEventListener('click', () => (back === 'pause' ? this.h.onShowPause() : this.h.onShowTitle()));
    el.querySelector('[data-act=back]').focus();
  }

  // ---------------------------------------------------------------------------- first sound

  select(defs) {
    const cards = defs.map((def, i) => cardHtml({
      title: def.name, eyebrow: `${ROLE_INFO[def.role].name} channel`, color: ROLE_INFO[def.role].color,
      style: STYLES[def.style], tag: 'Your first sound', level: 1, maxLevel: 5, body: def.blurb, detail: def.levels[0].text,
      cells: def.levels[0].pattern.reduce((cells, n) => { cells[n.s] = { on: true, v: n.v ?? 1 }; return cells; }, Array.from({ length: def.steps || 16 }, () => ({ on: false }))),
      icon: def.role, chem: [],
    }, i, { listen: true })).join('');
    const el = this._mount('select', `
      <div class="cards-wrap">
        <p class="kicker">Choose your first sound</p>
        <h2>Every song starts with one sound</h2>
        <p class="sub">Hover or hold a card to hear it. You add the rest of the band as you level up.</p>
        <div class="cards">${cards}</div>
        <div class="row-actions"><button class="btn btn-ghost" type="button" data-act="back">Back</button></div>
      </div>`);
    this._wireCards(el, (i) => this.h.onPickStart(defs[i].id), (i) => this.h.onPreviewStart(i === null ? null : defs[i].id));
    el.querySelector('[data-act=back]').addEventListener('click', () => { this.h.onPreviewStart(null); this.h.onShowTitle(); });
  }

  // ---------------------------------------------------------------------------- level up

  levelUp(g, offers) {
    const descs = offers.map((o) => describeOffer(g, o));
    const cards = descs.map((d, i) => cardHtml(d, i, { listen: true })).join('');
    const el = this._mount('levelup', `
      <div class="cards-wrap">
        <p class="kicker">Level ${g.level - g.pendingLevels + 1}</p>
        <h2>Pick your next sound</h2>
        <p class="sub">Hover or hold a card to hear it in your mix.</p>
        <div class="cards">${cards}</div>
        <div class="row-actions">
          <button class="btn btn-ghost" type="button" data-act="reroll" ${g.rerolls > 0 ? '' : 'disabled'}>Reroll <span class="muted">(${g.rerolls} left · R)</span></button>
          <button class="btn btn-ghost" type="button" data-act="banish" aria-pressed="false" title="Pick a card to remove its sound or pedal for the rest of the run, upgrades included" ${g.banishes > 0 && offers.some(banKey) ? '' : 'disabled'}>Banish <span class="muted">(${g.banishes} left · X)</span></button>
          <button class="btn btn-ghost" type="button" data-act="skip" title="Pass on this level. Its notes fill the Drop meter instead">Skip <span class="muted">(+Drop · Q)</span></button>
        </div>
      </div>`);
    // Banish mode: the next card picked is banished instead of taken. Remix, Fader and bonus cards cannot be.
    this.banishing = false;
    el.querySelectorAll('.card').forEach((c, i) => c.classList.toggle('no-ban', !banKey(offers[i])));
    this._wireCards(el, (i) => (this.banishing ? this.h.onBanish(i) : this.h.onChoose(i)), (i) => this.h.onPreview(i));
    el.querySelector('[data-act=reroll]').addEventListener('click', () => this.h.onReroll());
    el.querySelector('[data-act=banish]').addEventListener('click', () => this.toggleBanish());
    el.querySelector('[data-act=skip]').addEventListener('click', () => this.h.onSkip());
  }

  toggleBanish(on = !this.banishing) {
    const btn = this.current === 'levelup' ? this.root.querySelector('[data-act=banish]') : null;
    if (!btn || btn.disabled) return;
    this.banishing = on;
    btn.setAttribute('aria-pressed', String(on));
    this.root.querySelector('.cards').classList.toggle('banishing', on);
    this.root.querySelector('.cards-wrap h2').textContent = on ? 'Pick a card to banish' : 'Pick your next sound';
    this.root.querySelector('.cards-wrap .sub').textContent = on ? 'It never comes back this run, upgrades included.' : 'Hover or hold a card to hear it in your mix.';
  }

  _wireCards(el, onPick, onPreview) {
    const cards = [...el.querySelectorAll('.card')];
    this.cards = cards;
    this.onPick = onPick;
    this.onPreviewCard = onPreview;
    let holdTimer = null, held = false;
    cards.forEach((card, i) => {
      card.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { this.focus = i; onPreview(i); } });
      card.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') onPreview(null); });
      card.addEventListener('focus', () => {
        this.focus = i;
        cards.forEach((c, k) => c.classList.toggle('focused', k === i));
        // Focus that follows a tap or click is not a request to listen (hold and hover handle that).
        if (performance.now() - this.lastPointer > 700) onPreview(i);
      });
      card.addEventListener('blur', (e) => {
        if (e.relatedTarget && e.relatedTarget.classList?.contains('card')) return;
        card.classList.remove('focused');
        onPreview(null);
      });
      card.addEventListener('pointerdown', (e) => {
        this.lastPointer = performance.now();
        if (e.pointerType === 'mouse') return;
        held = false;
        holdTimer = setTimeout(() => { held = true; onPreview(i); card.classList.add('listening'); }, 260);
      });
      const endHold = () => { this.lastPointer = performance.now(); clearTimeout(holdTimer); if (held) { onPreview(null); card.classList.remove('listening'); } };
      card.addEventListener('pointerup', endHold);
      card.addEventListener('pointercancel', endHold);
      card.addEventListener('contextmenu', (e) => e.preventDefault());
      card.addEventListener('click', (e) => {
        if (held) { held = false; e.preventDefault(); return; }
        onPick(i);
      });
    });
    this.focus = 0;
  }

  // Keyboard navigation for card screens.
  cardKey(key) {
    if (!this.cards || !this.cards.length) return false;
    if (key >= '1' && key <= '9') {
      const i = Number(key) - 1;
      if (i < this.cards.length) { this.onPick(i); return true; }
    }
    // Arrow keys only: A and D are movement keys and would move focus while strafing.
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const focused = this.cards.includes(document.activeElement);
      if (focused) {
        const dir = key === 'ArrowLeft' ? -1 : 1;
        this.focus = (this.focus + dir + this.cards.length) % this.cards.length;
      } else this.focus = 0;   // first press lands on the first card
      this.cards[this.focus].focus();
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------- pause

  pause(g) {
    const el = this._mount('pause', `
      <div class="panel">
        <p class="kicker">Paused · ${esc(g.section.name)} · ${fmtTime(g.time)}</p>
        <h2>Taking five</h2>
        <p class="sub">${esc(g.genre)} in ${esc(g.key.name)}. ${g.loadout.filled()} of ${g.channelCap()} channels in use.</p>
        <div class="panel-actions col">
          <button class="btn btn-primary" type="button" data-act="resume">Resume</button>
          <button class="btn" type="button" data-act="howto">How to play</button>
          <button class="btn" type="button" data-act="settings">Settings</button>
          <button class="btn btn-ghost" type="button" data-act="quit">Quit to title</button>
        </div>
      </div>`);
    el.querySelector('[data-act=resume]').addEventListener('click', () => this.h.onResume());
    el.querySelector('[data-act=howto]').addEventListener('click', () => this.howto('pause'));
    el.querySelector('[data-act=settings]').addEventListener('click', () => this.settings('pause'));
    el.querySelector('[data-act=quit]').addEventListener('click', () => this.h.onQuit());
    el.querySelector('[data-act=resume]').focus();
  }

  // ---------------------------------------------------------------------------- end

  end(sum, isBest) {
    this.listening = false;
    const maxDmg = Math.max(1, ...sum.instruments.map((i) => i.dmg));
    const rows = sum.instruments.map((i) => `
      <li style="--c:${ROLE_INFO[i.role].color}" class="${i.active ? '' : 'retired'}">
        <span class="er-icon">${icon(i.role)}</span>
        <span class="er-name">${esc(i.name)}<small>${STYLES[i.style].name} · Lv ${i.level}${i.active ? '' : ' · swapped'}</small></span>
        <span class="er-bar"><i style="transform:scaleX(${i.dmg / maxDmg})"></i></span>
        <span class="er-num">${i.dmg.toLocaleString('en-US')}</span>
      </li>`).join('');
    const pedals = sum.pedals.length ? sum.pedals.map((p) => `${esc(p.name)} ${p.level}`).join(' · ') : 'No pedals';
    const el = this._mount('end', `
      <div class="panel panel-wide end">
        <p class="kicker">${sum.won ? 'The song is finished' : `The music stopped in ${esc(sum.section)}`}</p>
        <h2>${sum.won ? 'Encore!' : 'Drowned out'}</h2>
        <div class="end-stats">
          <div><b>${fmtTime(sum.time)}</b><span>survived</span></div>
          <div><b>${sum.kills.toLocaleString('en-US')}</b><span>silenced</span></div>
          <div><b>${sum.level}</b><span>level</span></div>
          <div><b>${sum.score.toLocaleString('en-US')}</b><span>score${isBest ? ' · best' : ''}</span></div>
        </div>
        <p class="end-genre">Your track: <b>${esc(sum.genre)}</b> in ${esc(sum.key)}</p>
        <ul class="end-rows">${rows || '<li>No instruments</li>'}</ul>
        <p class="end-pedals">${pedals}</p>
        <div class="panel-actions">
          <button class="btn" type="button" data-act="listen" aria-pressed="false">Listen to your track</button>
          <button class="btn btn-primary" type="button" data-act="again">Play again</button>
          <button class="btn btn-ghost" type="button" data-act="title">Title</button>
        </div>
      </div>`);
    const listen = el.querySelector('[data-act=listen]');
    listen.addEventListener('click', () => {
      this.listening = !this.listening;
      listen.setAttribute('aria-pressed', String(this.listening));
      listen.textContent = this.listening ? 'Stop listening' : 'Listen to your track';
      this.h.onListen(this.listening);
    });
    el.querySelector('[data-act=again]').addEventListener('click', () => this.h.onRestart());
    el.querySelector('[data-act=title]').addEventListener('click', () => this.h.onShowTitle());
    el.querySelector('[data-act=again]').focus();
  }
}
