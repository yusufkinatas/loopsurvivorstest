// Run-defining rewards for taking the risk of capturing a spotlight. Mechanics live in Game;
// this registry keeps draft cards, the HUD and the pause screen on the same description.
import { shuffle } from '../util.js';

export const MAX_REMIXES = 3;

export const REMIXES = [
  {
    id: 'aftershock', name: 'Aftershock', short: 'SHOCK', color: '#8fd6ff', icon: 'beat',
    body: 'Every dash ends in a damaging shockwave. On-beat dashes deal double shockwave damage.',
    detail: 'Turn your escape into an attack. Land beside a crowd.',
  },
  {
    id: 'glass', name: 'Glass Cannon', short: 'GLASS', color: '#ff7b5c', icon: 'arp',
    body: 'All damage +35%. Maximum health −20.',
    detail: 'A louder band, with less room for mistakes.',
  },
  {
    id: 'magnet', name: 'Magnetic Groove', short: 'MAGNET', color: '#7ff0d0', icon: 'bass',
    body: 'Pickup radius +60%. Collected XP grants 25% more Drop charge.',
    detail: 'Sweep up the crowd’s energy to Drop more often.',
  },
  {
    id: 'sustain', name: 'Sustain', short: 'SUSTAIN', color: '#ff9bd1', icon: 'heal',
    body: 'On-beat dashes heal 3 HP. Off-beat dash cooldown is 0.4 seconds longer.',
    detail: 'Keep time to stay alive. On-beat recovery stays fast.',
  },
  {
    id: 'spotlight', name: 'Front Row', short: 'FRONT', color: '#ffd166', icon: 'speaker',
    body: 'Deal 40% more damage within 180 units of you, but 10% less damage beyond that range.',
    detail: 'Trade safe distance for a harder hit.',
  },
  {
    id: 'cascade', name: 'Cascade', short: 'CASCADE', color: '#b7a6ff', icon: 'drop',
    body: 'Every kill adds 1 Drop charge. After a Drop lands, gain +50% weapon damage for 5 seconds.',
    detail: 'Turn one big crowd clear into the next.',
  },
];

export const REMIX_BY_ID = Object.fromEntries(REMIXES.map((remix) => [remix.id, remix]));

export function buildRemixOffers(g, count = 3) {
  const owned = new Set(g.remixes || []);
  if (owned.size >= MAX_REMIXES) return [];
  return shuffle(REMIXES.filter((remix) => !owned.has(remix.id)))
    .slice(0, count)
    .map((remix) => ({ kind: 'remix', remix }));
}
