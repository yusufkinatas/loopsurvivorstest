// Small line icons (24x24, stroke = currentColor) for channels, pedals and bonus cards.

const wrap = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  beat: wrap('<ellipse cx="12" cy="11" rx="8" ry="6.5"/><ellipse cx="12" cy="11" rx="3.2" ry="2.6"/><path d="M6 16.5 4.5 21M18 16.5l1.5 4.5"/>'),
  perc: wrap('<ellipse cx="12" cy="6.5" rx="8.5" ry="2"/><ellipse cx="12" cy="9.5" rx="8.5" ry="2"/><path d="M12 11.5V21M8.5 21h7"/>'),
  bass: wrap('<path d="M2 12c2.2-6 4.4-6 6.6 0s4.4 6 6.6 0 4.4-6 6.8 0"/><path d="M2 18h20" opacity=".45"/>'),
  chords: wrap('<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M8 4v16M13 4v16M18 4v16" opacity=".6"/><path d="M6.2 4v8.5M10.8 4v8.5M15.6 4v8.5" stroke-width="2.6"/>'),
  lead: wrap('<path d="M9 18V5l10-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
  arp: wrap('<path d="M12 2.5 13.7 9 20 11l-6.3 2L12 19.5 10.3 13 4 11l6.3-2Z"/><path d="M19 3v3M17.5 4.5h3M5 17v3M3.5 18.5h3"/>'),
  pedal: wrap('<rect x="5" y="3" width="14" height="18" rx="2.5"/><circle cx="9" cy="7.5" r="1.4"/><circle cx="15" cy="7.5" r="1.4"/><rect x="8" y="13" width="8" height="5" rx="1"/>'),
  heal: wrap('<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/>'),
  drop: wrap('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 20h16"/>'),
  score: wrap('<circle cx="12" cy="12" r="8"/><path d="M12 7.5v9M9.5 9.5h4a1.8 1.8 0 0 1 0 3.5h-3a1.8 1.8 0 0 0 0 3.5h4"/>'),
  pause: wrap('<path d="M8 5v14M16 5v14" stroke-width="2.6"/>'),
  speaker: wrap('<rect x="5" y="2.5" width="14" height="19" rx="2"/><circle cx="12" cy="14" r="4"/><circle cx="12" cy="14" r="1.2"/><circle cx="12" cy="6.5" r="1.4"/>'),
};

export function icon(name) { return ICONS[name] || ICONS.speaker; }
