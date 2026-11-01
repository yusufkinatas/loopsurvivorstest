// Level-up offers. Each card is a musical decision: add a new sound to an empty channel, push an
// existing one further, swap a channel to a different style, or add a pedal. Remixes are not level-up cards:
// a Master Tape from a silenced boss spends on a channel at level 5 (game.js), and when two or more are ready
// it deals remix cards of its own (describeOffer still draws them).

import { ROLES, ROLE_INFO, STYLES, MAX_INSTRUMENT_LEVEL, MAX_PEDAL_LEVEL, FADER, BALANCE } from '../config.js';
import { rng, weightedPick, shuffle } from '../util.js';
import { INSTRUMENTS } from '../content/instruments/index.js';
import { PEDALS, PEDAL_BY_ID } from '../content/pedals.js';
import { CHEMISTRY, FUSION, isFusion } from './loadout.js';

// A Master Tape can remix an instrument at level 5 that has a remix and is not remixed yet. Its remix pedal is
// what opens up on the strip once it is, not a requirement.
export const remixReady = (inst) => !!(inst?.def?.remix && !inst.remix && inst.level >= MAX_INSTRUMENT_LEVEL);

function candidates(g) {
  const L = g.loadout;
  const filled = L.filled();
  const room = filled < g.channelCap();
  const out = [];
  // A banked Master Tape waits for a channel at level 5: meanwhile the level cards of the channels nearest a remix
  // (the highest level among those not remixed yet) come up at least this often (BALANCE.remix.tapeUp, about a
  // first level's weight), so a boss's tape is worth finishing a channel for.
  const tapeUp = g.tapes?.banked > 0 ? BALANCE.remix.tapeUp || 0 : 0;
  const nearest = tapeUp ? Math.max(0, ...L.instruments().filter((i) => i.def.remix && !i.remix && i.level < MAX_INSTRUMENT_LEVEL).map((i) => i.level)) : 0;
  for (const role of ROLES) {
    const cur = L.channels[role];
    const inRole = INSTRUMENTS.filter((d) => d.role === role);
    // A channel's new and swap cards share the weight three styles gave them, however many styles there are,
    // so more sounds never crowd out level and pedal cards.
    const newW = 3 / inRole.length, swapW = 2 / Math.max(1, inRole.length - 1);
    if (!cur) {
      if (!room) continue;
      const w = (filled < 3 ? 1.1 : 0.8) * newW;
      for (const d of inRole) out.push({ kind: 'new', def: d, role, level: 1, w });
    } else {
      if (cur.remix || g.remixQueued?.(cur)) continue;   // a remixed (or remix-queued) channel is never swapped by a card
      if (cur.level < MAX_INSTRUMENT_LEVEL) {
        const w = 1.1 - 0.25 * cur.level;
        out.push({ kind: 'up', def: cur.def, role, level: cur.level + 1, inst: cur, w: tapeUp && cur.level === nearest ? Math.max(w, tapeUp) : w });
      }
      // A swap keeps the channel's level: it changes the style, not the strength.
      for (const d of inRole) {
        if (d === cur.def) continue;
        out.push({ kind: 'swap', def: d, role, from: cur, level: cur.level, w: 0.32 * swapW });
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

// A screen with no real choice: only bonus cards. The sim counts these.
export const deadScreen = (offers) => offers.every((o) => o.kind === 'heal' || o.kind === 'hype' || o.kind === 'score');

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
    case 'fader': L.faders[o.role] = o.level; break;
    case 'pedal-new': L.pedals.push({ def: o.pedal, level: 1 }); g.onLoadoutChanged(); break;
    case 'pedal-up': o.own.level = o.level; g.onLoadoutChanged(); break;
    case 'heal': g.player.hp = Math.min(g.player.maxHp, g.player.hp + g.player.maxHp * 0.4); break;
    case 'hype': g.dropCharge = g.dropMax; break;
    case 'score': g.bonusScore += 500; break;
  }
}

// How a card changes the band's play rules, as short lines: a rule tier gained ("Heavy x2: Mosh pit, +20% up
// close"), lost, or a step toward the next one. Each line carries its style and rule for the card's gems.
export function chemistryLine(g, style, delta) {
  const c = g.loadout.styleCounts();
  const before = { ...c };
  if (style in c) c[style] += delta.add || 0;
  if (delta.remove in c) c[delta.remove] -= 1;
  const lines = [];
  for (const st of Object.keys(CHEMISTRY)) {
    if (c[st] === before[st]) continue;
    const { tiers, name, rule } = CHEMISTRY[st];
    const gained = tiers.filter((t) => c[st] >= t.n && before[st] < t.n);
    const lost = tiers.filter((t) => c[st] < t.n && before[st] >= t.n);
    const base = { style: st, rule };
    if (gained.length) lines.push({ ...base, good: true, text: `${STYLES[st].name} x${c[st]}: ${name}, ${gained[gained.length - 1].text}` });
    else if (lost.length) lines.push({ ...base, good: false, text: `Loses ${STYLES[st].name} x${before[st]}: ${name}` });
    else if (c[st] > before[st]) {
      const next = tiers.find((t) => t.n > c[st]);
      const goal = next && (next === tiers[0] ? name : next.text);
      lines.push({ ...base, good: null, text: next ? `${STYLES[st].name} ${c[st]}/${next.n} toward ${goal}` : `${STYLES[st].name} x${c[st]}` });
    }
  }
  if (isFusion(c) && !isFusion(before)) lines.push({ good: true, text: FUSION.text });
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
    const from = a[k] ?? (k === 'count' ? 1 : 0), to = b[k];
    if (from === to) continue;
    const rel = from ? Math.abs(to - from) / Math.abs(from) : 1;
    const fmt = (v) => (k === 'slow' ? `${Math.round(v * 100)}%` : k === 'stun' ? `${Math.round(v * 100) / 100}s` : String(Math.round(v * 10) / 10));
    out.push({ rel, text: from ? `${STAT_NAMES[k]} ${fmt(from)} → ${fmt(to)}` : `new: ${STAT_NAMES[k]} ${fmt(to)}` });
  }
  out.sort((x, y) => y.rel - x.rel);
  return out.slice(0, 2).map((d) => d.text).join(' · ') || null;
}

// The style thresholds (2/4/6 sounds) from CHEMISTRY, read in either shape: { style: [{ n, text }] } or
// { style: { rule, name, text, tiers: [{ n, text }] } }.
export const chemTiers = (style) => { const c = CHEMISTRY[style]; return (Array.isArray(c) ? c : c?.tiers) || []; };
const tierOf = (style, n) => chemTiers(style).filter((t) => n >= t.n).length;

// How a card moves the style counts, as gems for the card's foot row: one entry per style whose count
// changes, { style, n (count after), delta (+1 or -1), tier (+1 gained, -1 lost, 0) }, and { style: 'fusion' }
// when the card turns Fusion on (2+ sounds in three different styles).
function styleGems(g, add, remove) {
  const before = g.loadout.styleCounts();
  const after = { ...before };
  if (add) after[add] = (after[add] || 0) + 1;
  if (remove) after[remove] = (after[remove] || 0) - 1;
  const gems = [];
  for (const st of new Set([add, remove])) {
    if (!st || after[st] === (before[st] || 0)) continue;
    const t0 = tierOf(st, before[st] || 0), t1 = tierOf(st, after[st]);
    gems.push({ style: st, n: after[st], delta: Math.sign(after[st] - (before[st] || 0)), tier: Math.sign(t1 - t0) });
  }
  const fused = (c) => Object.values(c).filter((n) => n >= 2).length >= 3;
  if (fused(after) && !fused(before)) gems.push({ style: 'fusion', n: 0, delta: 0, tier: 1 });
  return gems;
}

// A level's step lane: one cell per step, lit where the part plays, `isNew` where it plays and `prev` did not.
function laneCells(pattern, steps, prev) {
  const prevSteps = new Set(prev ? prev.map((n) => n.s) : []);
  const cells = Array.from({ length: steps }, () => ({ on: false, isNew: false, v: 0 }));
  for (const n of pattern || []) {
    const c = cells[n.s];
    if (!c) continue;
    c.on = true;
    c.v = Math.max(c.v, n.v ?? 1);
    if (prev && !prevSteps.has(n.s)) c.isNew = true;
  }
  return cells;
}

const texts = (lines) => (lines || []).map((l) => (typeof l === 'string' ? l : l?.text)).filter(Boolean);

// Everything a level-up card needs. The card itself draws only the glyph, title, pips, step lane and gems;
// every sentence that explains the card is in `info` (shown by the info layer and read by screen readers).
//   kind: new | up | swap | remix | pedal-new | pedal-up | fader | heal | hype | score
//   glyph: an icon id (instrument, pedal or bonus); slot: { role } or { pedal: index } it plugs into.
//   style: a STYLES id or null. from: the swapped-out instrument id. gems: see styleGems.
export function describeOffer(g, o) {
  const base = { kind: o.kind, style: null, from: null, level: o.level || 0, maxLevel: 0, cells: null, gems: [], slot: null, info: [] };
  if (o.def) {
    const def = o.def;
    const role = ROLE_INFO[def.role];
    const lv = def.levels[o.level - 1];
    const prev = o.kind === 'up' ? def.levels[o.level - 2] : null;
    const steps = def.steps || 16;
    const out = { ...base, title: def.name, color: role.color, style: def.style, glyph: def.id, level: o.level, maxLevel: MAX_INSTRUMENT_LEVEL, slot: { role: def.role } };
    if (o.kind === 'remix') {
      // A tape's remix card: its own part where it has one (else the level 5 part), a new attack, and its pedal
      // opened up on the strip.
      const rm = def.remix, pd = PEDAL_BY_ID[rm.pedal];
      return {
        ...out, title: rm.name,
        cells: rm.pattern ? laneCells(rm.pattern, rm.steps || steps, null) : laneCells(lv.pattern, steps, null),
        info: [rm.text, `You hear it: ${rm.sound || `${pd?.name || 'Its pedal'} opens up on your ${role.name} channel.`}`],
      };
    }
    out.cells = laneCells(lv.pattern, steps, prev?.pattern);
    if (o.kind === 'new') {
      out.gems = styleGems(g, def.style, null);
      out.info = [def.blurb, lv.text, ...texts(chemistryLine(g, def.style, { add: 1 }))];
    } else if (o.kind === 'up') {
      out.info = [`Level ${o.level - 1} → ${o.level}`, lv.text, statDiff(prev.stats, lv.stats)];
    } else {
      out.from = o.from.def.id;
      const restyle = o.from.def.style !== def.style;
      out.gems = restyle ? styleGems(g, def.style, o.from.def.style) : [];
      out.info = [`Swap · replaces ${o.from.def.name}, keeps Lv ${o.level}`, def.blurb, lv.text,
        ...(restyle ? texts(chemistryLine(g, def.style, { add: 1, remove: o.from.def.style })) : [])];
    }
    out.info = out.info.filter(Boolean);
    return out;
  }
  if (o.pedal) {
    const pd = o.pedal;
    const st = pd.levels[o.level - 1];
    const own = g.loadout.pedals.indexOf(o.own);
    const free = g.loadout.pedalSlotsFree();
    return {
      ...base, title: pd.name, color: pd.color, glyph: pd.id, level: o.level, maxLevel: MAX_PEDAL_LEVEL,
      slot: { pedal: o.kind === 'pedal-new' ? g.loadout.pedals.length : Math.max(0, own) },
      info: [pd.text(st), pd.sound, o.kind === 'pedal-new' ? `New pedal · ${free} slot${free === 1 ? '' : 's'} free` : `Level ${o.level - 1} → ${o.level}`],
    };
  }
  if (o.kind === 'fader') {
    const role = ROLE_INFO[o.role];
    return {
      ...base, title: o.inst.remix ? o.inst.def.remix.name : o.inst.def.name, color: role.color, glyph: 'fader', level: o.level, maxLevel: FADER.max,
      slot: { role: o.role },
      info: [`Push the fader · ${o.level - 1} → ${o.level}`, `Every ${role.name} attack deals ${Math.round(o.level * FADER.step * 100)}% more damage.`],
    };
  }
  const extra = {
    heal: { title: 'Breather', info: ['Catch your breath', 'Restore 40% of your health.'], color: '#ff6f8a', glyph: 'heal' },
    hype: { title: 'Crowd Surge', info: ['Fill the Drop meter instantly.'], color: '#f3eeff', glyph: 'drop' },
    score: { title: 'Royalties', info: ['+500 score.'], color: '#c7c2ff', glyph: 'score' },
  }[o.kind] || { title: String(o.kind), info: [], color: '#f3eeff', glyph: 'speaker' };
  return { ...base, ...extra, info: [...extra.info, 'Everything else is maxed'] };
}
