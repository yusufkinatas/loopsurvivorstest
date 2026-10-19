// Your band: one instrument per mixer channel plus a pedalboard. Also computes the stats that come
// from pedals and from "chemistry", the bonus for instruments whose styles belong together.

import { ROLES, PLAYER_BASE, PEDAL_SLOTS } from '../config.js';
import { PEDAL_BY_ID } from '../content/pedals.js';

// Style chemistry. Each tier's mods add on top of the tiers below it.
export const CHEMISTRY = {
  synth: [
    { n: 2, mods: { damage: 0.12 }, text: '+12% damage' },
    { n: 4, mods: { damage: 0.13 }, text: '+25% damage' },
    { n: 6, mods: { damage: 0.15, crit: 0.08 }, text: '+40% damage, +8% crit' },
  ],
  organic: [
    { n: 2, mods: { regen: 0.6 }, text: 'Heal 0.6 HP/s' },
    { n: 4, mods: { regen: 0.6, area: 0.15 }, text: 'Heal 1.2 HP/s, +15% area' },
    { n: 6, mods: { regen: 0.8, area: 0.15, maxHp: 25 }, text: 'Heal 2 HP/s, +30% area, +25 max HP' },
  ],
  chip: [
    { n: 2, mods: { projSpeed: 0.15, moveSpeed: 0.08 }, text: '+15% projectile speed, +8% move speed' },
    { n: 4, mods: { amount: 0.25 }, text: 'Also 25% more projectiles' },
    { n: 6, mods: { amount: 0.25, crit: 0.08 }, text: 'Also 50% more projectiles, +8% crit' },
  ],
};
export const FUSION = { mods: { damage: 0.1, area: 0.1, xpGain: 0.15 }, text: 'Fusion: 2+ of every style. +10% damage, +10% area, +15% XP' };
export const FULL_BAND = { mods: { damage: 0.1 }, text: 'Full band: all six channels. +10% damage' };

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

  styleCounts() {
    const c = { synth: 0, organic: 0, chip: 0 };
    for (const inst of this.instruments()) c[inst.def.style]++;
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

// role -> pedal id for every remixed channel: the desk runs that pedal at full on the channel's strip.
// A played-back track sheet comes from storage, so a remix flag on a sound without a remix is skipped.
export function remixBoost(insts) {
  const out = {};
  for (const inst of insts) if (inst.remix && inst.def.remix) out[inst.def.role] = inst.def.remix.pedal;
  return out;
}

export function chemistryTier(style, count) {
  let tier = 0;
  for (const t of CHEMISTRY[style]) if (count >= t.n) tier++;
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
  const counts = loadout.styleCounts();
  for (const style in CHEMISTRY) {
    for (const t of CHEMISTRY[style]) if (counts[style] >= t.n) add(t.mods);
  }
  if (counts.synth >= 2 && counts.organic >= 2 && counts.chip >= 2) add(FUSION.mods);
  if (loadout.filled() === ROLES.length) add(FULL_BAND.mods);
  s.pickup = PLAYER_BASE.pickup * s.pickup;
  s.speed = PLAYER_BASE.speed * s.moveSpeed;
  return s;
}

// A short name for the genre your band has become. Shown on the HUD and the end screen.
export function genreName(loadout) {
  const c = loadout.styleCounts();
  const total = c.synth + c.organic + c.chip;
  if (total === 0) return 'Silence';
  if (c.synth >= 2 && c.organic >= 2 && c.chip >= 2) return 'Fusion';
  const top = Object.entries(c).sort((a, b) => b[1] - a[1]);
  const [style, n] = top[0];
  const names = {
    synth: ['Synth solo', 'Synthpop', 'Synthwave', 'Synthwave', 'Neon Synthwave', 'Pure Synthwave'],
    organic: ['Solo act', 'Acoustic duo', 'Live band', 'Live band', 'Full live band', 'Pure live band'],
    chip: ['Chip solo', 'Chiptune', 'Chiptune', 'Chiptune', 'Console chiptune', 'Pure chiptune'],
  };
  if (top[1][1] === n && n > 0 && total > 1) {
    const pair = [style, top[1][0]].sort().join('+');
    const mixes = { 'organic+synth': 'Indietronica', 'chip+synth': 'Electro chip', 'chip+organic': 'Lo-fi chip' };
    return mixes[pair] || 'Crossover';
  }
  return names[style][Math.min(5, n - 1)];
}

export { PEDAL_SLOTS };
