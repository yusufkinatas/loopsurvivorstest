// Your band: one instrument per mixer channel plus a pedalboard. Also computes the stats that come
// from pedals, and the play rules that come from style chemistry (how many sounds of a style you have).

import { ROLES, STYLES, PLAYER_BASE, PEDAL_SLOTS } from '../config.js';
import { PEDAL_BY_ID } from '../content/pedals.js';

// Style chemistry is a play rule, not a stat: each style rewards one way of moving, for the whole band.
// Two, four and six sounds of a style turn its rule up (tier values are totals, not steps). The rules run
// in src/game/game.js (hit, area, onBeat) and show as floor tells in src/render/renderer.js.
//   far    Synth: hits on an enemy entirely beyond RULES.far px deal +far damage
//   near   Heavy: hits on an enemy reaching inside RULES.near px deal +near damage
//   still  Live: planted (moved under RULES.plant px since the last beat) adds stillArea to areas, and
//          each beat heals stillHeal while planted and not hit for RULES.calm bars
//   combo  8-Bit: +1 combo per beat without a hit (up to RULES.comboCap), a hit resets it,
//          damage x(1 + combo * its share of the cap)
//   swell  Orchestra: damage x(1 + swell * (2 * phrase - 1)), phrase 0..1 across each 8-bar phrase (mean 1)
export const CHEMISTRY = {
  synth: {
    rule: 'far', name: 'Long throw', text: 'Hits far from you deal more damage.',
    tiers: [
      { n: 2, far: 0.2, text: '+20% far away' },
      { n: 4, far: 0.4, text: '+40% far away' },
      { n: 6, far: 0.65, text: '+65% far away' },
    ],
  },
  organic: {
    rule: 'still', name: 'In the pocket', text: 'Stand still: wider attacks, and you heal on the beat.',
    tiers: [
      { n: 2, stillHeal: 0.5, stillArea: 0.12, text: '+12% area, heal 0.5 a beat' },
      { n: 4, stillHeal: 1, stillArea: 0.24, text: '+24% area, heal 1 a beat' },
      { n: 6, stillHeal: 1.5, stillArea: 0.4, text: '+40% area, heal 1.5 a beat' },
    ],
  },
  chip: {
    rule: 'combo', name: 'Combo streak', text: 'Each beat without a hit adds damage. A hit resets it.',
    tiers: [
      { n: 2, combo: 0.25, text: 'Up to +25% damage' },
      { n: 4, combo: 0.5, text: 'Up to +50% damage' },
      { n: 6, combo: 0.8, text: 'Up to +80% damage' },
    ],
  },
  heavy: {
    rule: 'near', name: 'Mosh pit', text: 'Hits close to you deal more damage.',
    tiers: [
      { n: 2, near: 0.2, text: '+20% up close' },
      { n: 4, near: 0.4, text: '+40% up close' },
      { n: 6, near: 0.65, text: '+65% up close' },
    ],
  },
  orchestra: {
    rule: 'swell', name: 'Ride the swell', text: 'Damage swells through every 8 bars and peaks at the fill.',
    tiers: [
      { n: 2, swell: 0.25, text: '±25% with the swell' },
      { n: 4, swell: 0.5, text: '±50% with the swell' },
      { n: 6, swell: 0.8, text: '±80% with the swell' },
    ],
  },
};

// The rules' distances and timings, in one place for tuning.
export const RULES = {
  far: 240,        // Long throw: px, an enemy whose body is entirely beyond this
  near: 140,       // Mosh pit: px, an enemy whose body reaches inside this
  plant: 24,       // In the pocket: px moved since the last beat that still counts as planted
  calm: 1,         // In the pocket: bars without a hit before a planted beat heals
  comboCap: 16,    // Combo streak: clean beats to the full bonus
  phraseBars: 8,   // Ride the swell: the phrase length (the song puts a fill on every 8th bar)
};

// The rule values computeStats writes into stats.rules (all 0 when no tier is on).
export const RULE_KEYS = ['far', 'near', 'stillHeal', 'stillArea', 'combo', 'swell'];

// Fusion: 2+ sounds in three different styles. A genre name only: it turns three rules on, nothing more.
export const FUSION = { text: 'Fusion: two sounds each in three styles' };
export const isFusion = (counts) => Object.values(counts).filter((n) => n >= 2).length >= 3;

// remix: true once the instrument has been remixed (it stays at level 5 and plays its remix's attack).
export function makeInst(def, level = 1) {
  return { def, level, remix: false, state: {}, voicing: null, dmg: 0, kills: 0, notes: 0, since: 0 };
}

export class Loadout {
  constructor() {
    this.channels = {};
    for (const r of ROLES) this.channels[r] = null;
    this.pedals = [];
    this.faders = {};   // role -> Fader cards taken. A channel keeps its fader when its instrument is swapped.
  }

  instruments() {
    const out = [];
    for (const r of ROLES) if (this.channels[r]) out.push(this.channels[r]);
    return out;
  }

  has(inst) { return this.channels[inst.def.role] === inst; }
  filled() { return ROLES.reduce((n, r) => n + (this.channels[r] ? 1 : 0), 0); }

  set(def, level) {
    const inst = makeInst(def, level);
    this.channels[def.role] = inst;
    return inst;
  }

  // style -> sounds of that style in the band, for every style.
  styleCounts() {
    const c = emptyCounts();
    for (const inst of this.instruments()) if (inst.def.style in c) c[inst.def.style]++;
    return c;
  }

  pedal(id) { return this.pedals.find((p) => p.def.id === id) || null; }
  pedalSlotsFree() { return PEDAL_SLOTS - this.pedals.length; }

  pedalLevels() {
    const out = {};
    for (const p of this.pedals) out[p.def.id] = p.level;
    return out;
  }

  remixBoost() { return remixBoost(this.instruments()); }
}

export const emptyCounts = () => Object.fromEntries(Object.keys(STYLES).map((st) => [st, 0]));

// role -> pedal id for every remixed channel: the desk runs that pedal at full on the channel's strip.
// A played-back track sheet comes from storage, so a remix flag on a sound without a remix is skipped.
export function remixBoost(insts) {
  const out = {};
  for (const inst of insts) if (inst.remix && inst.def.remix) out[inst.def.role] = inst.def.remix.pedal;
  return out;
}

// How many tiers of a style's rule are on (0 to 3).
export function chemistryTier(style, count) {
  let tier = 0;
  for (const t of CHEMISTRY[style]?.tiers || []) if (count >= t.n) tier++;
  return tier;
}

export function computeStats(loadout, override = null) {
  const s = {
    damage: 1, area: 1, amount: 0, projSpeed: 1, moveSpeed: 1, pickup: 1, armor: 0,
    maxHp: PLAYER_BASE.maxHp, regen: 0, xpGain: 1, crit: 0.05, critMult: 2, knockback: 1,
    echo: 0, echoDmg: 0.55,
  };
  // Every stat stacks additively: multipliers start at 1 and flat stats at their base.
  const add = (mods) => { for (const k in mods) s[k] += mods[k]; };
  const levels = { ...loadout.pedalLevels(), ...(override || {}) };
  for (const id in levels) {
    const def = PEDAL_BY_ID[id];
    if (def && levels[id] > 0) add(def.levels[levels[id] - 1]);
  }
  // The play rules at their active tier. rules.on: any rule at all.
  const counts = loadout.styleCounts();
  const rules = Object.fromEntries(RULE_KEYS.map((k) => [k, 0]));
  for (const style in CHEMISTRY) {
    const tier = chemistryTier(style, counts[style]);
    if (!tier) continue;
    const t = CHEMISTRY[style].tiers[tier - 1];
    for (const k of RULE_KEYS) if (t[k]) rules[k] += t[k];
  }
  rules.on = RULE_KEYS.some((k) => rules[k] > 0);
  s.rules = rules;
  s.pickup = PLAYER_BASE.pickup * s.pickup;
  s.speed = PLAYER_BASE.speed * s.moveSpeed;
  return s;
}

// Genre names by style, for one sound to six of the band's top style.
const LADDERS = {
  synth: ['Synth solo', 'Synthpop', 'Synthwave', 'Synthwave', 'Neon Synthwave', 'Pure Synthwave'],
  organic: ['Solo act', 'Acoustic duo', 'Live band', 'Live band', 'Full live band', 'Pure live band'],
  chip: ['Chip solo', 'Chiptune', 'Chiptune', 'Chiptune', 'Console chiptune', 'Pure chiptune'],
  heavy: ['Riff', 'Garage rock', 'Hard rock', 'Hard rock', 'Heavy metal', 'Pure metal'],
  orchestra: ['Solo recital', 'Duet', 'Chamber orchestra', 'Chamber orchestra', 'Symphony', 'Full symphony'],
};
// Crossovers: the top two styles tied (3 and 3 in a full band). Keyed by the two style ids, sorted.
const CROSSOVERS = {
  'organic+synth': 'Indietronica', 'chip+synth': 'Electro chip', 'chip+organic': 'Lo-fi chip',
  'heavy+synth': 'Industrial', 'heavy+organic': 'Grunge', 'chip+heavy': 'Chip metal', 'heavy+orchestra': 'Symphonic metal',
  'orchestra+synth': 'Film score', 'orchestra+organic': 'Chamber pop', 'chip+orchestra': 'Boss theme',
};
export const GENRES = { ladders: LADDERS, crossovers: CROSSOVERS };

// A short name for the genre your band has become. Shown on the HUD and the end screen.
export function genreName(loadout) {
  const c = loadout.styleCounts();
  const total = Object.values(c).reduce((a, n) => a + n, 0);
  if (total === 0) return 'Silence';
  if (isFusion(c)) return 'Fusion';
  const top = Object.entries(c).sort((a, b) => b[1] - a[1]);
  const [style, n] = top[0];
  if (top[1][1] === n && total > 1) return CROSSOVERS[[style, top[1][0]].sort().join('+')] || 'Crossover';
  return LADDERS[style][Math.min(5, n - 1)];
}

export { PEDAL_SLOTS };
