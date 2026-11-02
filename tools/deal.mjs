// The deal, measured: 20,000 card screens per band state from the shipped buildOffers ('today') next to a proposed
// deal (propose, weights in K), with the share of pedal, level, swap and Fader cards, how often the top channel's level
// card shows, swap screens, all-pedal screens and the share of swaps that gain a tier or a crossover. Node only.
//   node tools/deal.mjs
import { buildOffers, bandMove } from '../src/game/upgrades.js';
import { Loadout } from '../src/game/loadout.js';
import { INSTRUMENTS, BY_ID } from '../src/content/instruments/index.js';
import { PEDALS, PEDAL_BY_ID } from '../src/content/pedals.js';
import { ROLES } from '../src/config.js';
import { weightedPick, shuffle } from '../src/util.js';
const TIERS = [2, 4, 6], tierOf = (n) => TIERS.filter((t) => n >= t).length;
function propose(g, K) {
  const L = g.loadout, filled = L.filled(), room = filled < g.channelCap(), out = [];
  const counts = L.styleCounts();
  const top = L.instruments().filter((i) => i.level < 5).sort((a, b) => b.level - a.level)[0];
  for (const role of ROLES) {
    const cur = L.channels[role], inRole = INSTRUMENTS.filter((d) => d.role === role);
    const newW = 3 / inRole.length, swapW = 2 / (inRole.length - 1);
    const mom = (st) => 1 + K.mom * counts[st];
    if (!cur) { if (!room) continue; for (const d of inRole) out.push({ kind: 'new', def: d, role, w: (filled < 3 ? 1.1 : 0.8) * newW * mom(d.style) }); }
    else {
      if (cur.level < 5) { let w = K.upA - K.upB * cur.level; if (cur === top) w = Math.max(w, K.topFloor); out.push({ kind: 'up', def: cur.def, role, level: cur.level + 1, inst: cur, w }); }
      for (const d of inRole) { if (d === cur.def) continue;
        const c2 = { ...counts }; c2[d.style]++; c2[cur.def.style]--;
        const gain = tierOf(c2[d.style]) > tierOf(counts[d.style]), loss = tierOf(c2[cur.def.style]) < tierOf(counts[cur.def.style]);
        out.push({ kind: 'swap', def: d, role, w: 0.32 * swapW * (gain ? 3 : loss ? 0.25 : counts[d.style] >= counts[cur.def.style] ? 1 : 0.4) }); }
      if (cur.level >= 5) out.push({ kind: 'fader', role, w: K.fader });
    }
  }
  for (const pd of PEDALS) { const own = L.pedal(pd.id);
    if (own) { if (own.level < 3) out.push({ kind: 'pedal-up', pedal: pd, w: K.pup }); }
    else if (L.pedalSlotsFree() > 0) out.push({ kind: 'pedal-new', pedal: pd, w: L.pedals.length >= 2 ? K.pnew2 : K.pnew }); }
  const keyOf = (c) => (c.def ? c.def.id : c.pedal ? c.pedal.id : c.kind + c.role);
  const picked = [], pool = out;
  const take = (c) => { if (!c) return; picked.push(c); pool.splice(pool.indexOf(c), 1); };
  const ok = (c) => !picked.some((p) => keyOf(p) === keyOf(c)) && !(c.kind === 'swap' && picked.some((p) => p.kind === 'swap')) && !(c.role && picked.filter((p) => p.role === c.role).length >= 2);
  const news = pool.filter((c) => c.kind === 'new'); if (news.length && Math.random() < 0.85) take(weightedPick(news, (c) => c.w));
  const ups = pool.filter((c) => c.kind === 'up' && ok(c)); if (ups.length && Math.random() < K.upGuar) take(weightedPick(ups, (c) => c.w));
  let guard = 0; while (picked.length < 3 && guard++ < 50) { const a = pool.filter(ok); if (!a.length) break; take(weightedPick(a, (c) => c.w)); }
  return picked;
}
const K = { mom: 0.35, upA: 0.95, upB: 0.12, topFloor: 0.75, upGuar: 0.75, pup: 0.8, pnew: 0.75, pnew2: 0.5, fader: 0.45 };
function state(name, band, pedals, cap) {
  const L = new Loadout();
  for (const [id, lv] of band) L.set(BY_ID[id], lv);
  for (const [id, lv] of pedals) L.pedals.push({ def: PEDAL_BY_ID[id], level: lv });
  const g = { loadout: L, channelCap: () => cap, time: 200, banished: new Set(), tapes: { banked: 0 }, remixQueued: () => false, player: { hp: 100, maxHp: 120 } };
  const top = L.instruments().filter((i) => i.level < 5).sort((a, b) => b.level - a.level)[0];
  for (const [label, fn] of [['today', () => buildOffers(g, 3)], ['proposed', () => propose(g, K)]]) {
    const N = 20000, kinds = {}, counts = L.styleCounts(); let topUp = 0, swapS = 0, pedalScreens = 0, gainSwaps = 0;
    for (let i = 0; i < N; i++) { const o = fn();
      for (const c of o) { kinds[c.kind] = (kinds[c.kind] || 0) + 1; if (c.kind === 'swap' && bandMove(counts, c.def.style, L.channels[c.role].def.style) > 0) gainSwaps++; }
      if (o.some((c) => c.kind === 'up' && c.inst === top)) topUp++;
      if (o.some((c) => c.kind === 'swap')) swapS++;
      if (o.every((c) => c.kind.startsWith('pedal'))) pedalScreens++; }
    const tot = Object.values(kinds).reduce((a, b) => a + b, 0);
    const ped = ((kinds['pedal-new'] || 0) + (kinds['pedal-up'] || 0)) / tot;
    console.log(`${name.padEnd(28)} ${label.padEnd(9)} pedals ${Math.round(100 * ped)}% | up ${Math.round(100 * (kinds.up || 0) / tot)}% | swap ${Math.round(100 * (kinds.swap || 0) / tot)}% | fader ${Math.round(100 * (kinds.fader || 0) / tot)}% | top-channel up card on ${Math.round(100 * topUp / N)}% of screens | swap screens ${Math.round(100 * swapS / N)}% | all-pedal screens ${(100 * pedalScreens / N).toFixed(1)}% | gain swaps ${Math.round(100 * gainSwaps / Math.max(1, kinds.swap || 0))}%`);
  }
}
state('early 3/3 lv2/1/1, 1 pedal', [['kick808', 2], ['upright', 1], ['sawlead', 1]], [['reverb', 1]], 3);
state('mid 5/5 lv4/3/2/2/1, 3 ped', [['kick808', 4], ['upright', 3], ['sawlead', 2], ['rhodes', 2], ['shaker', 1]], [['reverb', 1], ['overdrive', 2], ['delay', 1]], 5);
state('late 6/6 lv5/4/3/2/2/1 4 ped', [['kick808', 5], ['upright', 4], ['sawlead', 3], ['rhodes', 2], ['shaker', 2], ['musicbox', 1]], [['reverb', 2], ['overdrive', 2], ['delay', 1], ['wah', 1]], 6);
// A swap can form a crossover (Synth 2, Live 1, Heavy 1, 8-Bit 1) or Fusion (Synth 2, Live 2, Heavy 1, 8-Bit 1).
state('mid pair-forming s2 l1 h1 c1', [['kick808', 4], ['hats909', 3], ['upright', 2], ['powerchords', 2], ['squarelead', 1]], [['reverb', 1], ['overdrive', 2], ['delay', 1]], 5);
state('late fusion-forming s2 l2 h1 c1', [['kick808', 5], ['hats909', 4], ['upright', 3], ['rhodes', 2], ['shred', 2], ['chiparp', 1]], [['reverb', 2], ['overdrive', 2], ['delay', 1], ['wah', 1]], 6);
