// Level-up offers. Each card is a musical decision: add a new sound to an empty channel, push an
// existing one further, swap a channel to a different style, or add a pedal.

import { ROLES, ROLE_INFO, STYLES, MAX_INSTRUMENT_LEVEL, MAX_PEDAL_LEVEL } from '../config.js';
import { rng, weightedPick, shuffle } from '../util.js';
import { INSTRUMENTS } from '../content/instruments/index.js';
import { PEDALS } from '../content/pedals.js';
import { CHEMISTRY, FUSION } from './loadout.js';

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
      if (cur.level < MAX_INSTRUMENT_LEVEL) out.push({ kind: 'up', def: cur.def, role, level: cur.level + 1, inst: cur, w: 1.1 - 0.25 * cur.level });
      for (const d of inRole) {
        if (d === cur.def) continue;
        out.push({ kind: 'swap', def: d, role, from: cur, level: Math.max(1, cur.level - 1), w: 0.32 });
      }
    }
  }
  for (const pd of PEDALS) {
    const own = L.pedal(pd.id);
    if (own) { if (own.level < MAX_PEDAL_LEVEL) out.push({ kind: 'pedal-up', pedal: pd, level: own.level + 1, own, w: 1.4 }); }
    else if (L.pedalSlotsFree() > 0) out.push({ kind: 'pedal-new', pedal: pd, level: 1, w: g.time > 25 ? 1.0 : 0.2 });
  }
  return out;
}

const keyOf = (c) => (c.def ? c.def.id : c.pedal ? c.pedal.id : c.kind);

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
    const fills = [{ kind: 'heal' }, { kind: 'hype' }, { kind: 'score' }];
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
    const from = a[k] ?? 0, to = b[k];
    if (from === to) continue;
    const rel = from ? Math.abs(to - from) / Math.abs(from) : 1;
    const fmt = (v) => (Math.abs(v) < 1 && v !== 0 ? `${Math.round(v * 100)}%` : String(Math.round(v * 10) / 10));
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
    else if (o.kind === 'up') tag = `Level ${o.level - 1} → ${o.level}`;
    else {
      tag = `Swap · replaces ${o.from.def.name} (Lv ${o.from.level} → Lv ${o.level})`;
      chem = o.from.def.style === def.style ? [] : chemistryLine(g, def.style, { add: 1, remove: o.from.def.style });
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
      chem: [],
      icon: 'pedal',
    };
  }
  const extra = {
    heal: { title: 'Encore', body: 'Restore 40% of your health.', color: '#ff6f8a', icon: 'heal' },
    hype: { title: 'Crowd Surge', body: 'Fill the Drop meter instantly.', color: '#ffd166', icon: 'drop' },
    score: { title: 'Royalties', body: '+500 score.', color: '#c7c2ff', icon: 'score' },
  }[o.kind];
  return { ...extra, eyebrow: 'Bonus', tag: 'Everything else is maxed', style: null, cells: null, chem: [], level: 0, maxLevel: 0 };
}
