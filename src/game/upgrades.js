// Level-up offers. Each card is a musical decision: add a new sound to an empty channel, push an
// existing one further, swap a channel to a different style, add a pedal, or remix a finished part.

import { ROLES, ROLE_INFO, STYLES, MAX_INSTRUMENT_LEVEL, MAX_PEDAL_LEVEL, FADER } from '../config.js';
import { rng, weightedPick, shuffle } from '../util.js';
import { INSTRUMENTS } from '../content/instruments/index.js';
import { PEDALS, PEDAL_BY_ID } from '../content/pedals.js';
import { CHEMISTRY, FUSION } from './loadout.js';

// A level 5 instrument can be remixed once its remix pedal is on the board, at any level.
const remixReady = (L, inst) => !!(inst.def.remix && !inst.remix && inst.level >= MAX_INSTRUMENT_LEVEL && L.pedal(inst.def.remix.pedal));

function candidates(g) {
  const L = g.loadout;
  const filled = L.filled();
  const room = filled < g.channelCap();
  const out = [];
  for (const role of ROLES) {
    const cur = L.channels[role];
    const inRole = INSTRUMENTS.filter((d) => d.role === role);
    if (!cur) {
      if (!room) continue;
      const w = filled < 3 ? 1.1 : 0.8;
      for (const d of inRole) out.push({ kind: 'new', def: d, role, level: 1, w });
    } else {
      if (remixReady(L, cur)) out.push({ kind: 'remix', def: cur.def, role, inst: cur, level: MAX_INSTRUMENT_LEVEL, w: 3 });
      if (cur.remix) continue;   // a remixed channel is never swapped by a card
      if (cur.level < MAX_INSTRUMENT_LEVEL) out.push({ kind: 'up', def: cur.def, role, level: cur.level + 1, inst: cur, w: 1.1 - 0.25 * cur.level });
      // A swap keeps the channel's level: it changes the style, not the strength.
      for (const d of inRole) {
        if (d === cur.def) continue;
        out.push({ kind: 'swap', def: d, role, from: cur, level: cur.level, w: 0.32 });
      }
    }
  }
  for (const pd of PEDALS) {
    const own = L.pedal(pd.id);
    if (own) { if (own.level < MAX_PEDAL_LEVEL) out.push({ kind: 'pedal-up', pedal: pd, level: own.level + 1, own, w: 1.4 }); }
    else if (L.pedalSlotsFree() > 0) out.push({ kind: 'pedal-new', pedal: pd, level: 1, w: g.time > 25 ? 1.0 : 0.2 });
  }
  return out.filter((c) => !g.banished.has(banKey(c)));
}

const keyOf = (c) => (c.def ? c.def.id : c.pedal ? c.pedal.id : c.kind);

// What a banish removes for the rest of the run: a pedal, or an instrument with all its new, level and
// swap cards. Remix, Fader and bonus cards cannot be banished (null).
export const banKey = (c) => (c.pedal ? c.pedal.id : c.kind === 'new' || c.kind === 'up' || c.kind === 'swap' ? c.def.id : null);

// A screen with no real choice: only bonus cards, or swaps that would cost a level. The sim counts these.
export const deadScreen = (offers) => offers.every((o) => o.kind === 'heal' || o.kind === 'hype' || o.kind === 'score' || (o.kind === 'swap' && o.level < o.from.level));

export function buildOffers(g, count = 3) {
  const pool = candidates(g);
  const picked = [];
  const take = (c) => { if (!c) return; picked.push(c); pool.splice(pool.indexOf(c), 1); };
  const ok = (c) => {
    if (picked.some((p) => keyOf(p) === keyOf(c))) return false;
    if (c.kind === 'swap' && picked.some((p) => p.kind === 'swap')) return false;
    if (c.role && picked.filter((p) => p.role === c.role).length >= 2) return false;
    return true;
  };
  // A ready remix is always on the next screen.
  const remixes = pool.filter((c) => c.kind === 'remix');
  if (remixes.length) take(weightedPick(remixes, (c) => c.w));
  // Keep the band growing early. Upgrades are no longer forced onto the offer (chance 0): they come
  // up by weight, rarer the higher the level, so early picks also go to pedals and levels 5 land late.
  // Once the pedals are full, upgrades are most of what is left, so they still come.
  const news = pool.filter((c) => c.kind === 'new');
  if (news.length && rng() < 0.85) take(weightedPick(news, (c) => c.w));
  let guard = 0;
  while (picked.length < count && guard++ < 50) {
    const avail = pool.filter(ok);
    if (!avail.length) break;
    take(weightedPick(avail, (c) => c.w));
  }
  if (picked.length < count) {
    // Out of real cards: a Breather first when you are hurt, then a Fader card for each channel (in random
    // order), and the bonus cards only once every fader is all the way up.
    const L = g.loadout;
    const faders = shuffle(L.instruments().filter((i) => (L.faders[i.def.role] || 0) < FADER.max))
      .map((inst) => ({ kind: 'fader', role: inst.def.role, inst, level: (L.faders[inst.def.role] || 0) + 1 }));
    const heal = { kind: 'heal' }, bonus = [{ kind: 'hype' }, { kind: 'score' }];
    const fills = g.player.hp < g.player.maxHp * 0.5 ? [heal, ...faders, ...bonus] : [...faders, ...bonus, heal];
    for (const f of fills) if (picked.length < count) picked.push(f);
  }
  return shuffle(picked.slice(0, count));
}

export function applyOffer(g, o) {
  const L = g.loadout;
  switch (o.kind) {
    case 'new': g.addInstrument(o.def, 1); break;
    case 'up': g.setInstrumentLevel(o.inst, o.level); break;
    case 'swap': g.addInstrument(o.def, o.level); break;
    case 'remix': g.remixInstrument(o.inst); break;
    case 'fader': L.faders[o.role] = o.level; break;
    case 'pedal-new': L.pedals.push({ def: o.pedal, level: 1 }); g.onLoadoutChanged(); break;
    case 'pedal-up': o.own.level = o.level; g.onLoadoutChanged(); break;
    case 'heal': g.player.hp = Math.min(g.player.maxHp, g.player.hp + g.player.maxHp * 0.4); break;
    case 'hype': g.dropCharge = g.dropMax; break;
    case 'score': g.bonusScore += 500; break;
  }
}

// How a card changes your style chemistry, as a short line (or null).
function chemistryLine(g, style, delta) {
  const c = g.loadout.styleCounts();
  const before = { ...c };
  c[style] += delta.add || 0;
  if (delta.remove) c[delta.remove] -= 1;
  const lines = [];
  for (const st of Object.keys(CHEMISTRY)) {
    if (c[st] === before[st]) continue;
    const tiers = CHEMISTRY[st];
    const gained = tiers.filter((t) => c[st] >= t.n && before[st] < t.n);
    const lost = tiers.filter((t) => c[st] < t.n && before[st] >= t.n);
    if (gained.length) lines.push({ good: true, text: `${STYLES[st].name} x${c[st]}: ${gained[gained.length - 1].text}` });
    else if (lost.length) lines.push({ good: false, text: `Loses ${STYLES[st].name} x${before[st]} bonus` });
    else if (c[st] > before[st]) {
      const next = tiers.find((t) => t.n > c[st]);
      lines.push({ good: null, text: next ? `${STYLES[st].name} ${c[st]}/${next.n} toward ${next.text.toLowerCase()}` : `${STYLES[st].name} x${c[st]}` });
    }
  }
  const fusedBefore = before.synth >= 2 && before.organic >= 2 && before.chip >= 2;
  const fusedAfter = c.synth >= 2 && c.organic >= 2 && c.chip >= 2;
  if (fusedAfter && !fusedBefore) lines.push({ good: true, text: FUSION.text });
  return lines;
}

// The remix a level 5 instrument leads to: unlocked when its pedal is on the board, otherwise the recipe
// (only while that pedal can still join the board).
function recipeLine(g, def) {
  const rm = def.remix;
  if (!rm) return [];
  const pd = PEDAL_BY_ID[rm.pedal];
  if (g.loadout.pedal(pd.id)) return [{ good: true, remix: true, text: `Unlocks the ${rm.name} remix` }];
  return g.loadout.pedalSlotsFree() > 0 && !g.banished.has(pd.id) ? [{ good: null, remix: true, text: `+ ${pd.name} pedal = ${rm.name} remix` }] : [];
}

// The remixes a new pedal unlocks for instruments already in your band (not one banished below level 5:
// its level cards are gone, so it never gets there).
function pedalRecipes(g, pd) {
  return g.loadout.instruments()
    .filter((i) => i.def.remix?.pedal === pd.id && !i.remix && (i.level >= MAX_INSTRUMENT_LEVEL || !g.banished.has(i.def.id)))
    .map((i) => (i.level >= MAX_INSTRUMENT_LEVEL
      ? { good: true, remix: true, text: `Unlocks the ${i.def.remix.name} remix` }
      : { good: null, remix: true, text: `+ ${i.def.name} at Lv 5 = ${i.def.remix.name} remix` }));
}

const STAT_NAMES = {
  damage: 'damage', radius: 'area', pierce: 'pierce', count: 'shots', chain: 'jumps', speed: 'speed', length: 'reach',
  shards: 'shards', seeds: 'seeds', streams: 'streams', coins: 'coins', heal: 'heal', slow: 'slow', stun: 'stun',
  bounce: 'bounces', range: 'range', size: 'size', orbit: 'orbit', stars: 'stars', toss: 'reach',
};

// The two biggest stat changes of an upgrade, e.g. "damage 21 → 26 · area 146 → 160".
function statDiff(a, b) {
  const out = [];
  for (const k in b) {
    if (!STAT_NAMES[k] || typeof b[k] !== 'number') continue;
    const from = a[k] ?? (k === 'count' ? 1 : 0), to = b[k];
    if (from === to) continue;
    const rel = from ? Math.abs(to - from) / Math.abs(from) : 1;
    const fmt = (v) => (k === 'slow' ? `${Math.round(v * 100)}%` : k === 'stun' ? `${Math.round(v * 100) / 100}s` : String(Math.round(v * 10) / 10));
    out.push({ rel, text: from ? `${STAT_NAMES[k]} ${fmt(from)} → ${fmt(to)}` : `new: ${STAT_NAMES[k]} ${fmt(to)}` });
  }
  out.sort((x, y) => y.rel - x.rel);
  return out.slice(0, 2).map((d) => d.text).join(' · ') || null;
}

// Everything the level-up card shows.
export function describeOffer(g, o) {
  if (o.def) {
    const def = o.def;
    const role = ROLE_INFO[def.role];
    const lv = def.levels[o.level - 1];
    const prev = o.kind === 'up' ? def.levels[o.level - 2] : null;
    const prevSteps = new Set(prev ? prev.pattern.map((n) => n.s) : []);
    const steps = def.steps || 16;
    const cells = Array.from({ length: steps }, () => ({ on: false, isNew: false, v: 0 }));
    for (const n of lv.pattern) {
      const c = cells[n.s];
      c.on = true;
      c.v = Math.max(c.v, n.v ?? 1);
      if (prev && !prevSteps.has(n.s)) c.isNew = true;
    }
    let tag, chem = [];
    if (o.kind === 'new') { tag = 'New sound'; chem = chemistryLine(g, def.style, { add: 1 }); }
    else if (o.kind === 'up') { tag = `Level ${o.level - 1} → ${o.level}`; if (o.level === MAX_INSTRUMENT_LEVEL) chem = recipeLine(g, def); }
    else if (o.kind === 'swap') {
      tag = `Swap · replaces ${o.from.def.name}, keeps Lv ${o.level}`;
      chem = o.from.def.style === def.style ? [] : chemistryLine(g, def.style, { add: 1, remove: o.from.def.style });
      if (o.level === MAX_INSTRUMENT_LEVEL) chem = [...chem, ...recipeLine(g, def)];
    } else {
      // Remix: the same level 5 part (the pattern shown), a new attack, and its pedal opened up on the strip.
      const rm = def.remix, pd = PEDAL_BY_ID[rm.pedal];
      return {
        title: rm.name, eyebrow: `Remix · ${role.name}`, color: role.color, style: STYLES[def.style], tag: `${def.name} + ${pd.name}`,
        level: o.level, maxLevel: MAX_INSTRUMENT_LEVEL, body: rm.text, detail: `You hear it: ${rm.sound || `${pd.name} opens up on your ${role.name} channel.`}`,
        cells, chem: [], role: def.role, icon: def.role, remix: true,
      };
    }
    return {
      title: def.name,
      eyebrow: `${role.name} channel`,
      color: role.color,
      style: STYLES[def.style],
      tag,
      level: o.level,
      maxLevel: MAX_INSTRUMENT_LEVEL,
      body: o.kind === 'up' ? lv.text : def.blurb,
      detail: o.kind === 'up' ? statDiff(prev.stats, lv.stats) : lv.text,
      cells,
      chem,
      role: def.role,
      icon: def.role,
    };
  }
  if (o.pedal) {
    const pd = o.pedal;
    const st = pd.levels[o.level - 1];
    return {
      title: pd.name,
      eyebrow: 'Effect pedal',
      color: pd.color,
      style: null,
      tag: o.kind === 'pedal-new' ? `New pedal · ${g.loadout.pedalSlotsFree()} slot${g.loadout.pedalSlotsFree() === 1 ? '' : 's'} free` : `Level ${o.level - 1} → ${o.level}`,
      level: o.level,
      maxLevel: MAX_PEDAL_LEVEL,
      body: pd.text(st),
      detail: pd.sound,
      cells: null,
      chem: o.kind === 'pedal-new' ? pedalRecipes(g, pd) : [],
      icon: 'pedal',
    };
  }
  if (o.kind === 'fader') {
    const role = ROLE_INFO[o.role];
    return {
      title: o.inst.remix ? o.inst.def.remix.name : o.inst.def.name, eyebrow: `Fader · ${role.name} channel`, color: role.color, style: null,
      tag: `Push the fader · ${o.level - 1} → ${o.level}`, level: o.level, maxLevel: FADER.max,
      body: `Every ${role.name} attack deals ${Math.round(o.level * FADER.step * 100)}% more damage.`, detail: null, cells: null, chem: [], icon: 'fader',
    };
  }
  const extra = {
    heal: { title: 'Breather', tag: 'Catch your breath', body: 'Restore 40% of your health.', color: '#ff6f8a', icon: 'heal' },
    hype: { title: 'Crowd Surge', body: 'Fill the Drop meter instantly.', color: '#ffd166', icon: 'drop' },
    score: { title: 'Royalties', body: '+500 score.', color: '#c7c2ff', icon: 'score' },
  }[o.kind];
  return { ...extra, eyebrow: 'Bonus', tag: extra.tag || 'Everything else is maxed', style: null, cells: null, chem: [], level: 0, maxLevel: 0 };
}
