// Effect pedals: passive upgrades you can hear. Each one changes the mix and the fight at the same time.
// Four pedal slots, three levels each. Stat values are the total at that level, not the step.
//
// fits: the sounds a pedal powers, as instrument and remix ids ('all': every sound; none: it powers you, not a
// sound). A sound fits when the pedal at level 3 lifts its damage 1.15x or more, measured on unkillable training
// dummies (node tools/dummy.mjs: god, solo, level 5 or remixed): tools/data/pedal-fit.json, compared with these
// lists by node tools/fitcheck.mjs. Re-measure when any instrument's fire() changes.

export const PEDALS = [
  {
    id: 'reverb', name: 'Hall Reverb', short: 'VERB', color: '#8fd6ff',
    sound: 'Your mix opens into a big room.',
    levels: [{ area: 0.12 }, { area: 0.24 }, { area: 0.38 }],
    text: (s) => `All attack areas +${Math.round(s.area * 100)}%.`,
    fits: [
      'sidechain808', 'taiko', 'thunderhall', 'shaker', 'rainstick', 'subbass', 'wobblebass', 'upright', 'slapbass',
      'tribass', 'blownspeaker', 'rhodes', 'soulkeys', 'chipchords', 'lineclear', 'screamer', 'musicbox', 'lullaby',
      'doublekick', 'wallofdeath', 'ride', 'chinacrash', 'breakdown', 'shred', 'windmill', 'whammy', 'timpani',
      'overture1812', 'maelstrom', 'strings', 'crescendo', 'harp', 'aeolian',
    ],
  },
  {
    id: 'delay', name: 'Tape Delay', short: 'ECHO', color: '#ffcf70',
    sound: 'Notes repeat a dotted eighth later.',
    levels: [{ echo: 0.25 }, { echo: 0.4 }, { echo: 0.55 }],
    text: (s) => `${Math.round(s.echo * 100)}% of Groove, Chords, Lead and Sparkle attacks echo on the delay for 55% damage.`,
    fits: [
      'hats909', 'pingponghats', 'shaker', 'rainstick', 'chiphat', 'shortcircuit', 'supersaw', 'hypersaw', 'rhodes',
      'soulkeys', 'chipchords', 'lineclear', 'sawlead', 'flute', 'canon', 'squarelead', 'twinlead', 'arpsynth',
      'galaxy', 'musicbox', 'lullaby', 'chiparp', 'jackpot', 'ride', 'chinacrash', 'powerchords', 'callresponse',
      'pinch', 'whammy', 'fieldsnare', 'parade', 'strings', 'crescendo', 'horn', 'harp', 'aeolian',
    ],
  },
  {
    id: 'overdrive', name: 'Overdrive', short: 'DRIVE', color: '#ff7b5c',
    sound: 'Bass and lead get gritty and loud.',
    levels: [{ damage: 0.1 }, { damage: 0.2 }, { damage: 0.32 }],
    text: (s) => `All damage +${Math.round(s.damage * 100)}%.`,
    fits: 'all',
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
    fits: [
      'chipdrums', 'glitchkit', 'hats909', 'pingponghats', 'shaker', 'rainstick', 'chiphat', 'supersaw', 'hypersaw',
      'chipchords', 'flute', 'canon', 'squarelead', 'twinlead', 'arpsynth', 'galaxy', 'musicbox', 'lullaby',
      'chiparp', 'jackpot', 'dropd', 'breakdown', 'parade', 'horn',
    ],
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
    fits: 'all',
  },
];

export const PEDAL_BY_ID = Object.fromEntries(PEDALS.map((p) => [p.id, p]));

// Does pedal pd power this sound (its remix's attack once remixed)? null for a pedal that powers you instead.
export function pedalFits(pd, inst) {
  if (!pd.fits) return null;
  return pd.fits === 'all' || pd.fits.includes((inst.remix && inst.def.remix?.id) || inst.def.id);
}
