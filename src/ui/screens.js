// Menus and overlays: title, how to play, first-sound select, level-up cards, pause, and the end screen.

import { ROLE_INFO, STYLES, ROLES } from '../config.js';
import { fmtTime } from '../util.js';
import { icon } from './icons.js';
import { describeOffer } from '../game/upgrades.js';
import { RECORDS } from '../game/records.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function stageArt() {
  const ticks = Array.from({ length: 80 }, (_, i) => {
    const a = i * Math.PI / 40;
    const r = 184 + (i % 5 === 0 ? 9 : 0);
    return `<line x1="${250 + Math.sin(a) * 176}" y1="${250 - Math.cos(a) * 176}" x2="${250 + Math.sin(a) * r}" y2="${250 - Math.cos(a) * r}"/>`;
  }).join('');
  const nodes = ROLES.map((r, i) => {
    const a = (i * 60 - 30) * Math.PI / 180;
    return `<g transform="translate(${250 + Math.cos(a) * 143} ${250 + Math.sin(a) * 143})"><circle r="12" fill="#111410" stroke="${ROLE_INFO[r].color}"/><circle r="4" fill="${ROLE_INFO[r].color}"/></g>`;
  }).join('');
  return `<div class="stage-art" aria-hidden="true">
    <div class="art-topline"><span>STEREO / SIX CHANNELS</span><span>LS—001</span></div>
    <svg viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="disc-light"><stop stop-color="#d3fa69" stop-opacity=".1"/><stop offset="1" stop-color="#d3fa69" stop-opacity="0"/></radialGradient></defs>
      <circle cx="250" cy="250" r="245" fill="url(#disc-light)"/>
      <path d="M18 250H482M250 18V482" stroke="#42483b" stroke-dasharray="2 7"/>
      <circle cx="250" cy="250" r="217" stroke="#30382d"/>
      <g stroke="#a0ae82" stroke-opacity=".55">${ticks}</g>
      <circle cx="250" cy="250" r="158" stroke="#c8f36c" stroke-width="2" stroke-dasharray="425 570" transform="rotate(-65 250 250)"/>
      <circle cx="250" cy="250" r="143" stroke="#4e6240"/>
      <g class="disc-orbit">${nodes}</g>
      <circle cx="250" cy="250" r="120" fill="#151b13" stroke="#c8f36c" stroke-opacity=".55"/>
      <circle cx="250" cy="250" r="105" stroke="#4b5c38" stroke-dasharray="1 4"/>
      <circle cx="250" cy="250" r="76" fill="#c8f36c"/>
      <path d="M65 250H147L160 238L173 267L187 214L201 286L218 176L234 314L250 209L266 272L280 227L294 257L305 244L315 250H435" stroke="#f0f2db" stroke-width="2"/>
      <path d="M177 250H187L201 286L218 176L234 314L250 209L266 272L280 227L294 257L305 244L315 250H324" stroke="#151b13" stroke-width="3"/>
      <circle cx="250" cy="33" r="4" fill="#c8f36c"/>
      <path d="M45 71H82M63 53V90M420 410H457M439 392V429" stroke="#c8f36c"/>
      <text x="250" y="147" fill="#c8f36c" font-size="9" text-anchor="middle" font-family="monospace" letter-spacing="4">MAKE SOME NOISE</text>
      <text x="250" y="357" fill="#a8b29a" font-size="9" text-anchor="middle" font-family="monospace" letter-spacing="2">YOUR BUILD. YOUR SOUND.</text>
      <text x="44" y="454" fill="#697460" font-size="10" font-family="monospace">33⅓ / ∞</text>
      <text x="455" y="48" fill="#697460" font-size="10" text-anchor="end" font-family="monospace">120 BPM</text>
    </svg>
    <div class="art-bottomline"><span class="signal-dot"></span><span>AN ORIGINAL TRACK. EVERY RUN.</span><span class="mini-wave">▂▄▆█▆▄▂</span></div>
  </div>`;
}

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
  const chem = (d.chem || []).map((c) => `<li class="${c.good === true ? 'good' : c.good === false ? 'bad' : ''}">${esc(c.text)}</li>`).join('');
  return `
  <button class="card" type="button" data-i="${index}" style="--c:${d.color}">
    <span class="card-key" aria-hidden="true">${index + 1}</span>
    <span class="card-top"><span class="eyebrow">${esc(d.eyebrow)}</span>${style}</span>
    <span class="card-head"><span class="card-icon">${icon(d.icon)}</span><span class="card-title">${esc(d.title)}</span></span>
    <span class="card-tag">${esc(d.tag || '')}</span>
    ${pipsHtml(d.level, d.maxLevel)}
    <span class="card-body">${esc(d.body || '')}</span>
    ${d.detail ? `<span class="card-detail">${esc(d.detail)}</span>` : ''}
    ${stepsHtml(d.cells)}
    ${chem ? `<ul class="chem-list">${chem}</ul>` : ''}
    ${opts.listen ? '<span class="card-listen" role="presentation">Hold to preview sound</span>' : ''}
    <span class="card-pick" aria-hidden="true"><span>${opts.start ? 'Take the stage' : 'Add to your mix'}</span><span>↗</span></span>
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
    document.addEventListener('keydown', (e) => {
      if (!this.current || e.key !== 'Tab') return;
      const targets = [...this.root.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]')].filter((el) => el.getClientRects().length);
      if (!targets.length) return;
      const active = document.activeElement;
      if (!targets.includes(active) || (e.shiftKey && active === targets[0]) || (!e.shiftKey && active === targets.at(-1))) {
        e.preventDefault();
        (e.shiftKey ? targets.at(-1) : targets[0]).focus();
      }
    }, true);
  }

  _mount(name, html) {
    this.current = name;
    document.body.dataset.screen = name;
    this.root.innerHTML = `<div class="screen screen-${name}" role="dialog" aria-modal="true" aria-label="${({ title: 'Loop Survivors', select: 'Choose your first sound', levelup: 'Choose an upgrade', records: 'Your record collection', end: 'Set results', pause: 'Game paused', settings: 'Settings', howto: 'How to play' })[name] || 'Loop Survivors'}">${html}</div>`;
    this.root.hidden = false;
    this.root.scrollTop = 0;
    const screen = this.root.firstElementChild;
    const heading = screen.querySelector('h1, h2');
    if (heading) {
      heading.id = `screen-${name}-heading`;
      screen.setAttribute('aria-labelledby', heading.id);
      screen.removeAttribute('aria-label');
    }
    return screen;
  }

  hide() {
    this.current = null;
    delete document.body.dataset.screen;
    this.root.innerHTML = '';
    this.root.hidden = true;
  }

  // ---------------------------------------------------------------------------- title

  title(best, career = {}) {
    const discovered = career.discovered?.length || 0;
    const records = career.records?.length || 0;
    const bestLine = best ? `<div class="title-best"><span>PERSONAL BEST</span><b>${(best.score || 0).toLocaleString('en-US')}</b><span>${fmtTime(best.time)} / ${best.won ? 'SET COMPLETE' : esc(best.section)}</span></div>` : `<div class="title-best"><span>THE STAGE IS YOURS</span><b>Make your first mark.</b><span>ONE RUN. ONE ORIGINAL TRACK.</span></div>`;
    const channels = ROLES.map((r, i) => `<span style="--c:${ROLE_INFO[r].color}"><i>${String(i + 1).padStart(2, '0')}</i>${ROLE_INFO[r].name}</span>`).join('');
    const el = this._mount('title', `
      <div class="title-wrap">
        <header class="title-masthead"><span class="masthead-brand"><i></i> INDEPENDENT FREQUENCY</span><span class="masthead-edition">VOL. 001 <span> / </span> PLAY IT LOUD</span></header>
        <div class="title-hero">
          <div class="title-copy">
            <p class="title-label"><span>LIVE NOW</span> A MUSICAL SURVIVAL ROGUELIKE</p>
            <h1 class="logo" aria-label="Loop Survivors"><span class="logo-main">LOOP<span class="logo-star">✳</span></span><span class="logo-sub">SURVIVORS</span></h1>
            <p class="tagline">Build the band.<br>Become the <em>headliner.</em></p>
            <p class="title-description">Every attack is a note. Every choice changes the song.<br>Outrun the noise. Find your sound.</p>
            <div class="title-actions">
              <button class="btn btn-primary btn-play" type="button" data-act="play"><span>Start a set</span><span aria-hidden="true">↗</span></button>
              <button class="btn btn-icon" type="button" data-act="settings" aria-label="Settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="8" cy="18" r="2" fill="currentColor"/></svg></button>
            </div>
            <div class="title-subactions"><button type="button" data-act="howto">How to play <span>↗</span></button><span class="headphones">◉ SOUND ON · HEADPHONES UP</span></div>
          </div>
          ${stageArt()}
        </div>
        <div class="title-bottom">
          ${bestLine}
          <button class="career-summary" type="button" data-act="records"><span class="career-icon" aria-hidden="true">◎</span><span><b>Your record collection</b><small>${career.runs || 0} sets played <i>·</i> ${discovered}/18 sounds <i>·</i> ${records}/${RECORDS.length} records</small></span><span aria-hidden="true">↗</span></button>
        </div>
        <footer class="channel-line"><span class="channel-line-label">SIX CHANNELS.<br>ENDLESS POSSIBILITIES.</span><div>${channels}</div><span class="channel-line-end">NO TWO SETS<br>THE SAME.</span></footer>
      </div>`);
    el.querySelector('[data-act=play]').addEventListener('click', () => this.h.onPlay());
    el.querySelector('[data-act=howto]').addEventListener('click', () => this.howto('title'));
    el.querySelector('[data-act=settings]').addEventListener('click', () => this.settings('title'));
    el.querySelector('[data-act=records]').addEventListener('click', () => this.records(career));
    el.querySelector('[data-act=play]').focus({ preventScroll: true });
  }

  records(career = {}) {
    const earned = career.records || [];
    const records = RECORDS.map((r, i) => `<li class="record-card ${earned.includes(r.id) ? 'earned' : 'locked'}"><span class="record-disc" aria-hidden="true"><i></i></span><span class="record-number">RECORD ${String(i + 1).padStart(2, '0')} <span>${earned.includes(r.id) ? '✓ COLLECTED' : 'LOCKED'}</span></span><h3>${esc(r.name)}</h3><p>${esc(r.description)}</p></li>`).join('');
    const el = this._mount('records', `<div class="panel panel-collection"><p class="kicker">Your story so far</p><h2>The record collection</h2><p class="sub">Make a little history. These records stay with you between sets.</p><div class="collection-stats"><div><b>${career.runs || 0}</b><span>Sets played</span></div><div><b>${career.wins || 0}</b><span>Encores</span></div><div><b>${career.discovered?.length || 0}<small>/18</small></b><span>Sounds found</span></div><div><b>${earned.length}<small>/${RECORDS.length}</small></b><span>Records earned</span></div></div><ul class="record-grid">${records}</ul><div class="panel-actions"><button class="btn btn-primary" type="button" data-act="back">Back to the stage <span aria-hidden="true">↗</span></button></div></div>`);
    el.querySelector('[data-act=back]').addEventListener('click', () => this.h.onShowTitle());
    el.querySelector('[data-act=back]').focus({ preventScroll: true });
  }

  howto(back) {
    const rows = ROLES.map((r) => `<li style="--c:${ROLE_INFO[r].color}"><span class="ht-icon">${icon(r)}</span><b>${ROLE_INFO[r].name}</b><span>${ROLE_INFO[r].desc}</span></li>`).join('');
    const el = this._mount('howto', `
      <div class="panel panel-wide">
        <p class="kicker">A quick sound check</p><h2>Find your rhythm.</h2>
        <ol class="howto">
          <li><b>Move & dash.</b> Move with WASD or arrow keys; drag on touch. Press Shift or right-click to dash through danger. On touch, use the Dash button. Dash on the beat for a perfect dash.</li>
          <li><b>Build a chain.</b> Keep silencing enemies to raise your score multiplier. Keep the pressure on and avoid damage to keep your chain alive.</li><li><b>Your instruments fight for you.</b> They play on the beat by themselves, and every note they play is an attack. Collect the glowing notes they leave behind to level up.</li>
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
    el.querySelector('[data-act=back]').focus({ preventScroll: true });
  }

  settings(back) {
    const s = this.h.getSettings();
    const el = this._mount('settings', `
      <div class="panel">
        <p class="kicker">Make yourself comfortable</p><h2>The sound booth</h2><p class="sub">Tune your volume and visual effects.</p>
        <label class="field"><span>Volume</span><input id="set-volume" type="range" min="0" max="100" value="${Math.round(s.volume * 100)}"></label>
        <label class="toggle"><input id="set-dmg" type="checkbox" ${s.damageNumbers ? 'checked' : ''}><span>Damage numbers</span></label>
        <label class="toggle"><input id="set-shake" type="checkbox" ${s.shake ? 'checked' : ''}><span>Screen shake</span></label>
        <label class="toggle"><input id="set-flash" type="checkbox" ${s.flashes ? 'checked' : ''}><span>Screen flashes</span></label>
        <div class="panel-actions"><button class="btn btn-primary" type="button" data-act="back">Done</button></div>
      </div>`);
    const upd = () => this.h.onSettings({
      volume: el.querySelector('#set-volume').value / 100,
      damageNumbers: el.querySelector('#set-dmg').checked,
      shake: el.querySelector('#set-shake').checked,
      flashes: el.querySelector('#set-flash').checked,
    });
    el.querySelectorAll('input').forEach((i) => i.addEventListener('input', upd));
    el.querySelector('[data-act=back]').addEventListener('click', () => (back === 'pause' ? this.h.onShowPause() : this.h.onShowTitle()));
    el.querySelector('[data-act=back]').focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------------------- first sound

  select(defs) {
    const cards = defs.map((def, i) => cardHtml({
      title: def.name, eyebrow: `${ROLE_INFO[def.role].name} channel`, color: ROLE_INFO[def.role].color,
      style: STYLES[def.style], tag: 'Your first sound', level: 1, maxLevel: 5, body: def.blurb, detail: def.levels[0].text,
      cells: def.levels[0].pattern.reduce((cells, n) => { cells[n.s] = { on: true, v: n.v ?? 1 }; return cells; }, Array.from({ length: def.steps || 16 }, () => ({ on: false }))),
      icon: def.role, chem: [],
    }, i, { listen: true, start: true })).join('');
    const el = this._mount('select', `
      <div class="cards-wrap">
        <p class="kicker">01 / Sound check</p>
        <h2>What’s your opening act?</h2>
        <p class="sub">Pick the first voice of your band. Hover or hold to listen.</p>
        <div class="select-caption"><span>THREE WAYS TO FIND YOUR SOUND</span><span>SELECT <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></span></div>
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
        <p class="kicker">IN THE STUDIO / LEVEL ${g.level - g.pendingLevels + 1}</p>
        <h2>Make the next move.</h2>
        <p class="sub">Your band is getting louder. Hover or hold to hear each choice in the mix.</p>
        <div class="select-caption"><span>THE STAGE CAN WAIT. MAKE IT YOURS.</span><span>SELECT <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></span></div>
        <div class="cards">${cards}</div>
        <div class="row-actions">
          <button class="btn btn-ghost" type="button" data-act="reroll" ${g.rerolls > 0 ? '' : 'disabled'}>Reroll <span class="muted">(${g.rerolls} left · R)</span></button>
        </div>
      </div>`);
    this._wireCards(el, (i) => this.h.onChoose(i), (i) => this.h.onPreview(i));
    el.querySelector('[data-act=reroll]').addEventListener('click', () => this.h.onReroll());
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
    cards[0]?.focus({ preventScroll: true });
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
        <h2>Intermission.</h2>
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
    el.querySelector('[data-act=resume]').focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------------------- end

  end(sum, isBest, career = {}, newRecords = []) {
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
        <div class="end-heading"><div><p class="kicker">${sum.won ? 'THE CROWD WANTS MORE' : `LAST PLAYED / ${esc(sum.section)}`}</p><h2>${sum.won ? 'Encore!' : 'What a set.'}</h2></div><span class="end-stamp">${sum.won ? 'SET<br>COMPLETE' : 'UNTIL<br>NEXT TIME'}</span></div>
        <div class="end-score"><div><span>FINAL SCORE ${isBest ? '<i>NEW PERSONAL BEST</i>' : ''}</span><b>${sum.score.toLocaleString('en-US')}</b></div><span class="end-score-note">${sum.won ? 'YOU SILENCED THE NOISE.' : 'EVERY GREAT BAND STARTS SOMEWHERE.'}<br>${sum.won ? 'TIME TO DO IT LOUDER.' : 'YOUR NEXT SOUND IS WAITING.'}</span></div>
        ${newRecords.length ? `<div class="new-records"><span>✳ RECORD${newRecords.length > 1 ? 'S' : ''} UNLOCKED</span>${newRecords.map((r) => `<b>${esc(r.name)}</b>`).join('')}</div>` : ''}
        <div class="end-stats">
          <div><b>${fmtTime(sum.time)}</b><span>survived</span></div>
          <div><b>${sum.kills.toLocaleString('en-US')}</b><span>silenced</span></div>
          <div><b>${sum.level}</b><span>level</span></div>
          <div><b>${sum.bestCombo || 0}</b><span>best chain</span></div>
        </div>
        <div class="end-highlights"><span><b>${sum.perfectDashes || 0}</b> perfect dashes</span><span><b>${sum.dashes || 0}</b> dashes</span><span><b>${career.records?.length || 0}/${RECORDS.length}</b> records collected</span></div>
        <p class="end-genre">The track you made <span><b>${esc(sum.genre)}</b> / ${esc(sum.key)}</span></p>
        <ul class="end-rows">${rows || '<li>No instruments</li>'}</ul>
        <p class="end-pedals">${pedals}</p>
        <div class="panel-actions">
          <button class="btn" type="button" data-act="listen" aria-pressed="false">Listen to your track</button>
          <button class="btn btn-primary" type="button" data-act="again">One more set ↗</button>
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
    el.querySelector('[data-act=again]').focus({ preventScroll: true });
  }
}
