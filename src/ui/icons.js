// Line glyphs (24x24, stroke = currentColor, 1.8 px, round caps) for channels, every instrument, every
// pedal, the bonus cards and the UI actions. An instrument's glyph draws its attack (or the instrument
// where the attack is not settled yet), so the five sounds of a channel read apart at strip size (22 px).
// icon(id, fallback): an unknown id falls back to `fallback` (a role), then to the speaker.

const wrap = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const dot = (x, y, r = 1.3) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;
const box = (x, y, s, fill = false) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx=".6"${fill ? ' fill="currentColor" stroke="none"' : ''}/>`;

// Channel (role) glyphs, also the fallback for a sound without its own.
const ROLE_ICONS = {
  beat: wrap('<ellipse cx="12" cy="11" rx="8" ry="6.5"/><ellipse cx="12" cy="11" rx="3.2" ry="2.6"/><path d="M6 16.5 4.5 21M18 16.5l1.5 4.5"/>'),
  perc: wrap('<ellipse cx="12" cy="6.5" rx="8.5" ry="2"/><ellipse cx="12" cy="9.5" rx="8.5" ry="2"/><path d="M12 11.5V21M8.5 21h7"/>'),
  bass: wrap('<path d="M2 12c2.2-6 4.4-6 6.6 0s4.4 6 6.6 0 4.4-6 6.8 0"/><path d="M2 18h20" opacity=".45"/>'),
  chords: wrap('<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M8 4v16M13 4v16M18 4v16" opacity=".6"/><path d="M6.2 4v8.5M10.8 4v8.5M15.6 4v8.5" stroke-width="2.6"/>'),
  lead: wrap('<path d="M9 18V5l10-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
  arp: wrap('<path d="M12 2.5 13.7 9 20 11l-6.3 2L12 19.5 10.3 13 4 11l6.3-2Z"/><path d="M19 3v3M17.5 4.5h3M5 17v3M3.5 18.5h3"/>'),
};

// One glyph per instrument id. Rows: Synth, Live, 8-Bit, Heavy, Orchestra.
const SOUND_ICONS = {
  // Beat
  kick808: wrap(`${dot(12, 12, 2.4)}<circle cx="12" cy="12" r="5.6"/><path d="M12 2.4a9.6 9.6 0 0 1 9.6 9.6M12 21.6A9.6 9.6 0 0 1 2.4 12" opacity=".7"/><path d="M21.6 12a9.6 9.6 0 0 1-3.6 7.5M2.4 12A9.6 9.6 0 0 1 6 4.5" opacity=".35"/>`),
  taiko: wrap('<path d="M4 12c0-1.9 3.6-3.4 8-3.4s8 1.5 8 3.4v5.6c0 1.9-3.6 3.4-8 3.4s-8-1.5-8-3.4Z"/><path d="M4 12c0 1.9 3.6 3.4 8 3.4s8-1.5 8-3.4"/><path d="M15.5 2.5 12.6 9.6" stroke-width="2.4"/><path d="M5 3.5 7 6M2.5 7.5l3 .8M9.5 2.2 9.7 5" opacity=".7"/>'),
  chipdrums: wrap(`${box(3, 14.5, 6.5)}<path d="M9.5 14.5 14 6.5l4.5 6.5 3-4.5" stroke-dasharray="2.2 2.2"/>${box(12.6, 4, 2.8, true)}${box(17.4, 11.2, 2.4, true)}`),
  doublekick: wrap('<circle cx="8" cy="12.5" r="5.5"/><circle cx="16" cy="12.5" r="5.5"/><path d="M5.5 21.5 8 18M18.5 21.5 16 18" stroke-width="2.2"/><path d="M8 3v2.5M16 3v2.5" opacity=".6"/>'),
  timpani: wrap('<ellipse cx="12" cy="10" rx="8.5" ry="2.2"/><path d="M3.5 10c0 4.6 3.8 8 8.5 8s8.5-3.4 8.5-8"/><path d="M7.5 16.6 6 21.5M16.5 16.6l1.5 4.9M12 18v3.5"/><path d="M15 2.5l2.5 4.5"/>' + dot(17.8, 7.6, 1.6)),
  // Groove
  hats909: wrap('<path d="M3 21 18.5 5.5" stroke-width="2"/><path d="M13.5 4.5h6v6" stroke-width="2"/><path d="M3.5 14.5l2-2M8 19l2-2" opacity=".55"/>'),
  shaker: wrap(`<ellipse cx="12" cy="12" rx="3.2" ry="4.4"/><circle cx="12" cy="12" r="8.6" stroke-dasharray="1.6 3.4" opacity=".6"/>${dot(12, 3.4, 1.5)}${dot(19.5, 15.8, 1.5)}${dot(4.5, 15.8, 1.5)}`),
  chiphat: wrap('<path d="M13.5 2.5 6 13.2h5.2L9.5 21.5 18 10h-5.4Z"/>'),
  ride: wrap(`<ellipse cx="12" cy="9.5" rx="9.5" ry="3"/><path d="M10 8a2 1.4 0 0 1 4 0"/><path d="M12 12.5V21"/><path d="M18.5 15.5c1.4.8 2.4 1.9 2.8 3.2M4.6 15.5C3.2 16.3 2.2 17.4 1.8 18.7" opacity=".6"/>`),
  fieldsnare: wrap('<path d="M5 12.5h14v6.5c0 1-3.1 2-7 2s-7-1-7-2Z"/><ellipse cx="12" cy="12.5" rx="7" ry="1.8"/><path d="M5.2 15l3.4 5 3.4-5 3.4 5 3.4-5" opacity=".7"/><path d="M4 2.5l6 7M20 2.5l-6 7"/>'),
  // Bass
  subbass: wrap(`${dot(12, 12, 2.2)}<path d="M8 8.2a5.4 5.4 0 0 0 0 7.6M16 8.2a5.4 5.4 0 0 1 0 7.6"/><path d="M5 5.2a9.6 9.6 0 0 0 0 13.6M19 5.2a9.6 9.6 0 0 1 0 13.6" opacity=".55"/>`),
  upright: wrap('<circle cx="15" cy="12" r="4.6" fill="currentColor" fill-opacity=".25"/><path d="M2.5 9h5.5M2.5 12h6.5M2.5 15h5.5" opacity=".7"/><path d="M21.5 4.5v15" stroke-dasharray="3 2.4"/>'),
  tribass: wrap(`<path d="M12 3.5 19.5 12 12 20.5 4.5 12Z"/>${dot(12, 12, 1.8)}<path d="M12 1v1M23 12h-1M12 23v-1M1 12h1" opacity=".6"/>`),
  dropd: wrap('<path d="M2 8h4l2.5 9L12 5l3 13 2.5-8H22" stroke-width="2"/><path d="M2 21h20" opacity=".45"/>'),
  cellos: wrap('<path d="M12 8.5c-2.8 0-4.2 1.4-4.2 3.2 0 1.2.9 1.8.9 2.3s-1.9 1.1-1.9 3.2c0 2.2 2.3 3.3 5.2 3.3s5.2-1.1 5.2-3.3c0-2.1-1.9-2.7-1.9-3.2s.9-1.1.9-2.3c0-1.8-1.4-3.2-4.2-3.2Z"/><path d="M12 2.5v15"/><path d="M3 13.5 21 8" opacity=".75"/>'),
  // Chords
  supersaw: wrap(`<path d="M4 20 19.5 5.5M4 20 11.5 3.2M4 20l17.2-6.5"/>${dot(4, 20, 1.8)}`),
  rhodes: wrap('<circle cx="10.5" cy="13.5" r="7.2"/><circle cx="10.5" cy="13.5" r="3.2" opacity=".55"/><path d="M19 2.5v6M16 5.5h6" stroke-width="2"/>'),
  chipchords: wrap(`${box(3.5, 13.5, 5)}${box(9.5, 6.5, 5)}${box(15.5, 15, 5)}<path d="M6 4.5v6M12 1.5v3M18 6v6" opacity=".55"/>`),
  powerchords: wrap(`<rect x="4" y="2.5" width="16" height="7" rx="1"/><rect x="4" y="11" width="16" height="10.5" rx="1"/><circle cx="12" cy="16.2" r="3.2"/>${dot(7.5, 6, 1)}${dot(10.5, 6, 1)}<path d="M14 6h3.5"/>`),
  strings: wrap('<path d="M6.5 3v18M10.2 3v18M13.8 3v18M17.5 3v18" opacity=".6"/><path d="M2.5 15 21.5 9"/><path d="M2.5 17.6 21.5 11.6" opacity=".5"/>'),
  // Lead
  sawlead: wrap(`<path d="M5 19 21 5" stroke-width="2.4"/><path d="M5 19 21 5" stroke-width="5" opacity=".18"/>${dot(4, 20, 2.2)}<path d="M18 2.5l.6 2.2M21.5 7.5l-2.3-.4" opacity=".7"/>`),
  flute: wrap(`<path d="M2.5 19c4.5 0 5.5-7 10-7 3 0 3.7 3.4 1.6 4.2-2 .8-3-1.6-1.6-3.4C14.4 10 18 8.8 21 5"/>${dot(21, 5, 1.8)}`),
  squarelead: wrap(`${dot(3.5, 12, 1.8)}${box(9, 4.5, 3, true)}${box(13.5, 10.5, 3, true)}${box(9, 16.5, 3, true)}${box(18.5, 6.5, 2.4, true)}${box(18.5, 15, 2.4, true)}<path d="M5.5 11 8 7.5M5.5 13 8 16.5M6 12h5.5" opacity=".45"/>`),
  shred: wrap('<path d="M12 21c-3.9-3.6-7.5-8.6-7.5-12.6C4.5 5.3 7.7 3 12 3s7.5 2.3 7.5 5.4c0 4-3.6 9-7.5 12.6Z"/><path d="M13 6.5 10 11h3.2l-2.4 4.5" stroke-width="1.6"/>'),
  horn: wrap('<circle cx="9.5" cy="13.5" r="6.5"/><circle cx="9.5" cy="13.5" r="3"/><path d="M14.5 9.4 20 3.6"/><path d="M17.6 2.3c1.5.9 2.9 2.2 4 4l-3.3.9Z"/><path d="M3 13.5H1.5" opacity=".7"/>'),
  // Sparkle
  arpsynth: wrap('<path d="M12 12.2c.7 0 1.1-.6.8-1.2-.5-1-2.1-.8-2.5.4-.6 1.7 1 3.2 2.8 2.8 2.4-.5 3.2-3.5 1.7-5.3-2-2.4-5.9-1.8-7.1 1-1.5 3.4.8 7.3 4.4 7.9 4.4.7 8.1-3 7.4-7.4"/>' + dot(19.6, 9.3, 1.6)),
  musicbox: wrap('<path d="M12 9.2l1.5 3.1 3.4.5-2.5 2.4.6 3.4L12 17l-3 1.6.6-3.4-2.5-2.4 3.4-.5Z"/><path d="M12 2v4" stroke-dasharray="1.6 2"/><path d="M5 21.3h14" opacity=".55"/>'),
  chiparp: wrap('<circle cx="7.5" cy="15.5" r="5"/><path d="M7.5 13v5"/><path d="M11.5 11.5C13 5 19.5 3.5 21 8c1.2 3.6-2.3 5.6-6 4.6"/><path d="M15.4 10.4 14.6 12.8l2.3.9" opacity=".8"/>'),
  pinch: wrap('<path d="M2 17h5.5l2.5-12.5 2.5 15 1.8-5.5H22"/><path d="M10 1.8v2.6M8.7 3.1h2.6" opacity=".8"/>'),
  harp: wrap('<path d="M6 21.5V3c5.5 0 9.5 2.2 13 6.5L9 21.5Z"/><path d="M9.5 4.5v13M13 6v7.5M16.2 8v1.6" opacity=".55"/>'),
};

// Pedals by id.
const PEDAL_ICONS = {
  reverb: wrap('<path d="M3 20a9 9 0 0 1 18 0"/><path d="M6.8 20a5.2 5.2 0 0 1 10.4 0" opacity=".7"/><path d="M10.4 20a1.6 1.6 0 0 1 3.2 0" opacity=".45"/>'),
  delay: wrap(`${dot(4.5, 12, 2.8)}<circle cx="11" cy="12" r="2.3" opacity=".75"/><circle cx="16.4" cy="12" r="1.8" opacity=".5"/><circle cx="20.6" cy="12" r="1.3" opacity=".3"/>`),
  overdrive: wrap('<path d="M2 12c1-3 2.2-5.5 3.2-5.5h3.6c1 0 2 2.5 3.2 5.5s2.2 5.5 3.2 5.5h3.6c1 0 2.2-2.5 3.2-5.5"/><path d="M2 6.5h20M2 17.5h20" opacity=".35"/>'),
  compressor: wrap('<path d="M2 12c1.7-2.8 3.3-2.8 5 0s3.3 2.8 5 0 3.3-2.8 5 0 3.3 2.8 5 0"/><path d="M12 2.5v4M10 4.6l2 2 2-2M12 21.5v-4M10 19.4l2-2 2 2"/>'),
  chorus: wrap('<path d="M2 12c2.2-5 4.4-5 6.6 0s4.4 5 6.6 0 4.4-5 6.8 0"/><path d="M2 15.5c2.2-5 4.4-5 6.6 0s4.4 5 6.6 0 4.4-5 6.8 0" opacity=".5"/>'),
  wah: wrap('<path d="M2 17h7.5c2.5 0 3-10 5-10s2.2 7 7.5 14"/><path d="M5 9.5l4-2.5M7.5 10.6l1.5-3.6" opacity=".6"/>'),
  bitcrusher: wrap('<path d="M2 15h3v-4h3V7h4v4h3v4h3v4h4"/><path d="M2 13c2.5-7 6.5-7 10 0s7.5 7 10 0" opacity=".3"/>'),
};

// Bonus cards, UI actions and HUD pieces.
const UI_ICONS = {
  pedal: wrap('<rect x="5" y="3" width="14" height="18" rx="2.5"/><circle cx="9" cy="7.5" r="1.4"/><circle cx="15" cy="7.5" r="1.4"/><rect x="8" y="13" width="8" height="5" rx="1"/>'),
  fader: wrap('<path d="M7 3v18M17 3v18" opacity=".45"/><rect x="4" y="12" width="6" height="4" rx="1"/><rect x="14" y="6" width="6" height="4" rx="1"/>'),
  heal: wrap('<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/>'),
  drop: wrap('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 20h16"/>'),
  score: wrap('<circle cx="12" cy="12" r="8"/><path d="M12 7.5v9M9.5 9.5h4a1.8 1.8 0 0 1 0 3.5h-3a1.8 1.8 0 0 0 0 3.5h4"/>'),
  pause: wrap('<path d="M8 5v14M16 5v14" stroke-width="2.6"/>'),
  speaker: wrap('<rect x="5" y="2.5" width="14" height="19" rx="2"/><circle cx="12" cy="14" r="4"/><circle cx="12" cy="14" r="1.2"/><circle cx="12" cy="6.5" r="1.4"/>'),
  plus: wrap('<path d="M12 5v14M5 12h14" stroke-width="2.2"/>'),
  up: wrap('<path d="M6 15.5 12 9.5l6 6" stroke-width="2.4"/>'),
  swap: wrap('<path d="M4 8.5h15M15.5 5l3.5 3.5-3.5 3.5"/><path d="M20 15.5H5M8.5 12 5 15.5 8.5 19"/>'),
  lock: wrap('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>' + dot(12, 15.5, 1.4)),
  reroll: wrap('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 3.5v4.2h-4.2"/>'),
  banish: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>'),
  skip: wrap('<path d="M5 5.5 14 12l-9 6.5Z"/><path d="M18.5 5.5v13" stroke-width="2.2"/>'),
  info: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 11v6" stroke-width="2.2"/>' + dot(12, 7.6, 1.4)),
  tape: wrap('<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8.5" cy="11" r="2.2"/><circle cx="15.5" cy="11" r="2.2"/><path d="M10.7 11h2.6M6 19l1.5-3h9l1.5 3"/>'),
  vinyl: wrap(`<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="6.5" opacity=".45"/><circle cx="12" cy="12" r="3"/>${dot(12, 12, 1)}`),
  back: wrap('<path d="M14.5 6 8.5 12l6 6" stroke-width="2.2"/>'),
  boss: wrap('<path d="M4 18 3 7l5 4 4-6 4 6 5-4-1 11Z"/><path d="M4 21h16"/>'),
  // Move hints: keycaps with arrows, a pushed stick, a dragging finger.
  keys: wrap('<rect x="8.5" y="3" width="7" height="7" rx="1.5"/><rect x="1.5" y="12" width="7" height="7" rx="1.5"/><rect x="8.5" y="12" width="7" height="7" rx="1.5"/><rect x="15.5" y="12" width="7" height="7" rx="1.5"/><path d="M10.8 7.4 12 6.2l1.2 1.2M6 14.3l-1.2 1.2L6 16.7M10.8 14.3l1.2 1.2 1.2-1.2M18 14.3l1.2 1.2-1.2 1.2" stroke-width="1.4"/>'),
  stick: wrap('<circle cx="12" cy="12" r="9"/><circle cx="14.2" cy="9.8" r="3.6" fill="currentColor" fill-opacity=".25"/><path d="M5.5 12h1.5M12 18.5V17M12 5.5V7M18.5 12H17" opacity=".55"/>'),
  finger: wrap('<circle cx="15" cy="9" r="3.4" fill="currentColor" fill-opacity=".25"/><circle cx="15" cy="9" r="6" opacity=".4"/><path d="M12 12.2 4 20" stroke-dasharray="2 2.4"/>'),
  // Gamepad buttons for the HUD's prompts: a face button (A) and a wide key (Space).
  padA: wrap('<circle cx="12" cy="12" r="9"/><path d="M9 16l3-8 3 8M10 13.5h4" stroke-width="1.6"/>'),
  space: wrap('<rect x="1.5" y="7" width="21" height="10" rx="2"/><path d="M7 11v2.5h10V11" stroke-width="1.6"/>'),
};

export const ICONS = { ...ROLE_ICONS, ...SOUND_ICONS, ...PEDAL_ICONS, ...UI_ICONS };
export const SOUND_GLYPHS = Object.keys(SOUND_ICONS);
export const PEDAL_GLYPHS = Object.keys(PEDAL_ICONS);

export function icon(name, fallback) { return ICONS[name] || ICONS[fallback] || ICONS.speaker; }
