// Effect pedals: passive upgrades you can hear. Each one changes the mix and the fight at the same time.
// Four pedal slots, three levels each. Stat values are the total at that level, not the step.

export const PEDALS = [
  {
    id: 'reverb', name: 'Hall Reverb', short: 'VERB', color: '#8fd6ff',
    sound: 'Your mix opens into a big room.',
    levels: [{ area: 0.12 }, { area: 0.24 }, { area: 0.38 }],
    text: (s) => `All attack areas +${Math.round(s.area * 100)}%.`,
  },
  {
    id: 'delay', name: 'Tape Delay', short: 'ECHO', color: '#ffcf70',
    sound: 'Notes repeat a dotted eighth later.',
    levels: [{ echo: 0.25 }, { echo: 0.4 }, { echo: 0.55 }],
    text: (s) => `${Math.round(s.echo * 100)}% of Groove, Chords, Lead and Sparkle attacks echo on the delay for 55% damage.`,
  },
  {
    id: 'overdrive', name: 'Overdrive', short: 'DRIVE', color: '#ff7b5c',
    sound: 'Bass and lead get gritty and loud.',
    levels: [{ damage: 0.1 }, { damage: 0.2 }, { damage: 0.32 }],
    text: (s) => `All damage +${Math.round(s.damage * 100)}%.`,
  },
  {
    id: 'compressor', name: 'Compressor', short: 'COMP', color: '#b7a6ff',
    sound: 'The whole mix gets tight and punchy.',
    levels: [{ armor: 0, maxHp: 15 }, { armor: 1, maxHp: 30 }, { armor: 2, maxHp: 45 }],
    text: (s) => `${s.armor ? `Take ${s.armor} less damage per hit. ` : ''}Max health +${s.maxHp}.`,
  },
  {
    id: 'chorus', name: 'Chorus', short: 'CHOR', color: '#7ff0d0',
    sound: 'Chords and lead shimmer and widen.',
    levels: [{ amount: 0.2 }, { amount: 0.32, projSpeed: 0.12 }, { amount: 0.45, projSpeed: 0.15 }],
    text: (s) => `${Math.round(s.amount * 100)}% more projectiles, orbiters and hits${s.projSpeed ? `. Projectiles ${Math.round(s.projSpeed * 100)}% faster` : ''}.`,
  },
  {
    id: 'wah', name: 'Auto-Wah', short: 'WAH', color: '#ff9bd1',
    sound: 'Chords and bass sweep with a funky filter.',
    levels: [{ moveSpeed: 0.07, pickup: 0.3 }, { moveSpeed: 0.14, pickup: 0.6 }, { moveSpeed: 0.21, pickup: 0.9 }],
    text: (s) => `Move ${Math.round(s.moveSpeed * 100)}% faster. Pickup range +${Math.round(s.pickup * 100)}%.`,
  },
  {
    id: 'bitcrusher', name: 'Bitcrusher', short: 'CRUSH', color: '#c2f25e',
    sound: 'Drums and hats turn crunchy and lo-fi.',
    levels: [{ crit: 0.06, critMult: 0.2 }, { crit: 0.12, critMult: 0.4 }, { crit: 0.18, critMult: 0.6 }],
    text: (s) => `Critical hit chance +${Math.round(s.crit * 100)}%. Critical damage +${Math.round(s.critMult * 100)}%.`,
  },
];

export const PEDAL_BY_ID = Object.fromEntries(PEDALS.map((p) => [p.id, p]));
