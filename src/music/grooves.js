// Classic grooves and accompaniment figures (data only; src/music/sequencer.js plays them as textures).
//
// A groove is two rows per channel on the 16-step grid: K the channel's main sound, S its second. The sequencer
// moves the part's own notes onto their hits bar by bar (Beat: K its kick, S its other sounds; Groove: K its most
// played sound, S the others), its loudest notes on the strongest hits, so a groove plays in your band's sounds at the
// part's own velocities and only on its own hits. Rows: X 1, x 0.8, o 0.6, g 0.4 (how strong a hit is: where the loud
// notes go and which hits a sparse part takes first), '.' rest, '|' starts the next bar (spaces are for reading).
// Every Beat bar hits step 0 on K (the bar's first hit goes at a boss). A second sound that runs out of S hits takes
// K's others, since it has its own job (the Ride's bell plants its cymbals). A busy part's extra notes land with the
// hit they share, so every note's damage lands: the rows set the feel, not the damage.
//
// Sources: PO Pocket Operations (P. Wenzel), the grids from darosh/pocket-patterns; ED Elephant Drums' Amen tab;
// TOU G. Toussaint, The Euclidean Algorithm Generates Traditional Musical Rhythms (2005); Wikipedia's articles
// (the scores and tabs in them) on the tresillo, the surdo, jiuchi and kuchi shoga, the blast beat, the D-beat,
// drum rudiments and Bolero; NES the Mega Cat Studios FamiTracker primer. Drum grooves are rhythms, not melodies:
// the famous breaks are used as step notation. "idiom": a genre idiom written for the game. Velocities and
// accents are the game's where a source gives hits only, a row a kit cannot play (a third sound) is folded into K
// or S, and "+ backbeat" marks an S row on 2 and 4 that the game adds where the source has one sound.

export const GROOVES = {
  // ---------------------------------------------------------------- Synth
  // House, four on the floor with off-beat hats (PO) over 16th ticks (added, so a busy part's notes keep their pace).
  house: { beat: ['X... X... X... X...', '.... X... .... X...'], perc: ['.gXg .gXg .gXg .gXg', 'o... .... .... ....'] },
  // Synthwave: kick on 1 and 3 under a big backbeat, driving 16th hats (PO).
  synthwave: { beat: ['X... .... X... ....', '.... X... .... X...'], perc: ['Xgog xgog Xgog x.og', '.... .... .... .x..'] },
  // Dembow, the reggaeton beat: four on the floor, the snare on the tresillo's off-beats (PO).
  reggaeton: { beat: ['X... X... X... X...', '...x ..x. ...x ..x.'], perc: ['X.o. x.o. X.o. x...', '.... .... .... ..x.'] },
  // Trap: half time, one snare a bar, hat rolls into the downbeat (idiom after PO's trap).
  traprolls: {
    beat: ['X... ..x. .... x... | X... ..x. ..xo ....', '.... .... X... .... | .... .... X... ....'],
    perc: ['X.o. x.o. X.o. ogox | X.o. x... X.o. gogx', '.... .... .... .... | .... ..x. .... ....'],
  },

  // ---------------------------------------------------------------- Live
  // Funky Drummer (James Brown, 1970, Clyde Stubblefield): ghost-note snare around the backbeat (PO).
  funkydrummer: { beat: ['X.x. ..x. ..x. .x..', '.... X..g .g.g X..g'], perc: ['Xgog xgo. Xgog x.og', '.... ...x .... .x..'] },
  // Matsuri ji, the taiko festival rhythm: "DON doko don DON" over a straight shime (Wikipedia: jiuchi, kuchi shoga;
  // + backbeat).
  taikomatsuri: { beat: ['X... o.o. x... X...', '.... x... .... x...'], perc: ['X.o. x.o. X.o. ..o.', '.... .... .... x...'] },
  // Impeach the President (The Honey Drippers, 1973): the kick drags into beat 3 (PO).
  impeach: { beat: ['X... ...x x... ..x.', '.... X... .... X...'], perc: ['X.o. x.ox X... x.o.', '.... .... ..x. ....'] },
  // Steppers, the reggae walk: a kick on every beat, the rim on 3 (PO).
  steppers: { beat: ['X... X... X... X...', '.... .... X... ....'], perc: ['X.o. x.o. ..o. x.o.', '.... .... x... ....'] },

  // ---------------------------------------------------------------- 8-Bit
  // Boss gallop: kick triplets on 1 and 3, noise ticks skipping the snare (NES idiom).
  chipgallop: { beat: ['X.xx .... X.xx ....', '.... X... .... X...'], perc: ['.gog .gog Xgog .gog', 'x... .... .... ....'] },
  // Mono-noise rock: one noise voice, so the ticks drop out where the snare hits (NES idiom).
  chipfour: { beat: ['X... .... x.o. ....', '.... X... .... X...'], perc: ['..o. ..o. X.o. ..o.', 'x... .... .... ....'] },
  // Fake echo: every snare repeats a 16th later, softer (consoles had no reverb) (NES idiom; + backbeat).
  chipecho: { beat: ['X... ..o. x... ....', '.... Xg.. .... Xg..'], perc: ['X.o. ..o. x.o. ..o.', '.... x... .... x...'] },

  // ---------------------------------------------------------------- Heavy
  // When the Levee Breaks (Led Zeppelin, 1971, John Bonham): the lopsided stomp (PO).
  levee: { beat: ['Xx.. ...x ..xx ....', '.... X... .... X...'], perc: ['..o. x.o. X.o. x.o.', 'x... .... .... ....'] },
  // Rock backbeat with a crash on 1 (PO).
  rock1: { beat: ['X... ...x X.x. ....', '.... X... .... X...'], perc: ['..o. X.o. x.o. X.o.', 'X... .... .... ....'] },
  // Skank, the punk polka: kick on the beat, snare on every "and" (Wikipedia: blast beat).
  skank: { beat: ['X... X... X... X...', '..x. ..x. ..x. ..x.'], perc: ['..x. X.x. X.x. X.x.', 'X... .... .... ....'] },
  // Machine-gun double kick under a backbeat (idiom).
  machinegun: { beat: ['Xoxo xoxo Xoxo xoxo', '.... X... .... X...'], perc: ['X... .... X... ....', '.... X... .... X...'] },

  // ---------------------------------------------------------------- Orchestra
  // A march on the kettle under Ravel's Bolero snare (1928, public domain), its two bars of 3/4 stretched to 4/4;
  // each 16th-triplet ruff is two soft 16ths on the snare's second sound (Wikipedia: Bolero, its score; + backbeat).
  bolero: {
    beat: ['X... o... X... o...', '.... x... .... x...'],
    perc: ['X... o... X.o. o.o. | X... o... .... ....', '..gg ..gg .... .... | ..gg ..gg ogog ogXg'],
  },
  // Paradiddle cadence, RLRR LRLL with the accent on each group, the bass drum on 1, 3 and each LL double (Wikipedia:
  // drum rudiments, PAS #16; + backbeat).
  paradiddle: { beat: ['X... ..x. X... ..x.', '.... x... .... x...'], perc: ['Xggg xggg Xggg xggg', ''] },
  // Boom-chick march: the kettle's tonic on 1 and 3 and its dominant on the "and" of 2 and on 4 (one kettle here), the
  // snare's after-beats with a buzz roll into beat 4 (idiom; + backbeat).
  march: { beat: ['X... ..o. x... x...', '.... x... .... x...'], perc: ['g.X. g.x. g.X. ..X.', '.... .... .... o...'] },

  // ---------------------------------------------------------------- crossovers
  // Industrial. Techno: four on the floor with a pickup kick into the bar (PO), off-beat hats over 16th ticks (added,
  // as in house).
  techno: { beat: ['X... X... X... X.o.', '.... X... .... X...'], perc: ['.gXg .gXg .gXg .gXg', '.... .... .g.. ....'] },
  // Industrial. Dubstep: half time, the snare on 3 (PO).
  dubstep: { beat: ['X... .... ..x. ....', '.... .... X... ....'], perc: ['.og. ..o. ...g ..o.', '.... X... .... .x..'] },
  // Indietronica. UK garage 2-step: no kick on 3, rim and tom ghosts around the claps (PO; + backbeat).
  ukg: { beat: ['X... .... ..x. ....', '.g.. Xo.g ...o Xg..'], perc: ['..Xg ..x. ..X. ..xg', '.... x... .... x...'] },
  // Indietronica. The rolling break: a kick just before beat 3 (PO).
  rollingbreak: { beat: ['X... ...x ..x. ....', '.... X... .... X...'], perc: ['X.o. x.o. X.o. x...', '.... .... .... ..x.'] },
  // Electro chip. Miami bass: the 808 kick never on beats 2 to 4, galloping hats (PO).
  miamibass: { beat: ['X... ..x. ..x. .x..', '.... X... .... X...'], perc: ['..Xg o.Xg o.Xg o.Xg', 'x... .... .... ....'] },
  // Electro chip. Rock the Planet: three kicks up front, then coast (PO).
  planet: { beat: ['X..x ..x. .... ....', '.... X... .... X...'], perc: ['..Xg o.Xg o.Xg ogXg', 'x... .... .... ....'] },
  // Film score. The half-time breakdown: one snare on 3 under chugging kicks (idiom).
  halftime: { beat: ['X..x ..x. ..xx ....', '.... .... X... ....'], perc: ['.... x... X... x...', 'X... .... .... ....'] },
  // Film score. A kuchi shoga phrase for the big drum, "don (tsu) doko don | don (tsu) don kon" (Wikipedia: kuchi
  // shoga; + backbeat).
  taikophrase: {
    beat: ['X... .... x.o. X... | X... .... X... o...', '.... x... .... x... | .... x... .... x...'],
    perc: ['X.o. x.o. X.o. ..o. | X.o. x.o. ..o. x.o.', '.... .... .... x... | .... .... x... ....'],
  },
  // Grunge. Rock with a turnaround: two extra snares end every bar (PO).
  rock4: { beat: ['X... ...x X.x. ....', '.... X... .... X.ox'], perc: ['X.o. x.o. X.o. ....', '.... .... .... ..x.'] },
  // Grunge. The standard break: kick on 1 and the "and" of 3 (PO).
  standardbreak: { beat: ['X... .... ..x. ....', '.... X... .... X...'], perc: ['X.o. x.o. Xgo. x...', '.... .... .... ..x.'] },
  // Chip metal. D-beat (Discharge), the hat version: snare on every "and" (Wikipedia: D-beat, third tab).
  dbeat3: { beat: ['X... .x.. x..x .x..', '..X. ..X. ..X. ..X.'], perc: ['..x. X.x. X.x. X.x.', 'X... .... .... ....'] },
  // Chip metal. The traditional blast, kick and snare as one 16th roll (slow at 120 BPM), the cymbal with every kick
  // (Wikipedia: blast beat).
  blasttrad: { beat: ['X.x. x.x. X.x. x.x.', '.o.o .o.o .o.o .o.o'], perc: ['X.x. x.x. X.x. x.x.', ''] },
  // Symphonic metal. The gallop, "1 . & a" on every beat (Wikipedia: jiuchi, the same rhythm as the horse-beat ji).
  gallop: { beat: ['X.og x.og X.og x.og', '.... X... .... X...'], perc: ['X... .... X... ....', '.... x... .... x...'] },
  // Symphonic metal. The hammer blast: kick and snare together on every 8th (Wikipedia: blast beat).
  blasthammer: { beat: ['X.x. x.x. X.x. x.x.', 'x.x. x.x. x.x. x.x.'], perc: ['.... x... X... x...', 'X... .... .... ....'] },
  // Lo-fi chip. Boom bap: the kicks bunch up before beat 3 (PO).
  boombap: { beat: ['X.x. ..xx .... ..x.', '.... X... .... X...'], perc: ['X.o. x.o. X.o. x...', '.... .... .... ..x.'] },
  // Lo-fi chip. Tresillo, 3+3+2 on the kick and twice as fast on the clave (Toussaint; Wikipedia: tresillo;
  // + backbeat).
  tresillo: { beat: ['X... ..x. .... x...', '.... X... .... X...'], perc: ['X..x ..x. X..x ..x.', '.... x... .... x...'] },
  // Chamber pop. Bossa nova: the cross-stick plays the bossa clave over a dotted kick (PO, Toussaint).
  bossanova: { beat: ['x..o x..o x..o x..o', 'X..x ..x. ..x. .x..'], perc: ['Xgog xgog Xgog xgog', '.... x... .... x...'] },
  // Chamber pop. Cinquillo, the danzon's x.xx.xx. on the clave over a half-note kick (Toussaint; Wikipedia:
  // tresillo; + backbeat).
  cinquillo: { beat: ['X... .... x... ....', '.... x... .... x...'], perc: ['X.xx .xx. X.xx .xx.', '.... x... .... x...'] },
  // Boss theme. Chase polka: kick on the beat, snare on the "and", ticks in between (NES idiom; + backbeat).
  chipchase: { beat: ['X... X... X... X...', '..x. ..x. ..x. ..x.'], perc: ['.g.g .g.g .g.g .g.g', '.... x... .... x...'] },
  // Boss theme. Five-stroke rolls, RRLL R, the diddles as single 16ths (Wikipedia: drum rudiments, PAS #7; + backbeat).
  fivestroke: { beat: ['X... .... X... ....', '.... x... .... x...'], perc: ['ooX. ooX. ooX. ooX.', ''] },
  // Fusion. The Amen break, bar 1 (The Winstons, 1969, G. C. Coleman), over ride 8ths (ED, PO).
  amenA: { beat: ['X.x. .... ..xx ....', '.... X..o .o.. X..o'], perc: ['..o. x.o. X.o. x.o.', 'x... .... .... ....'] },
  // Fusion. Samba: the loud surdo on beats 2 and 4, the samba timeline on the rim, ganza 16ths (Toussaint; Wikipedia: surdo).
  samba: { beat: ['o... X... o... X...', 'x.o. .x.o .x.. x.o.'], perc: ['ogoX ogoX ogoX ogoX', '.... x... .... x...'] },
};

// The grooves a band plays, in turn: the k-th groove phrase of the song plays the k-th of its list (chorus I's
// last phrase is 0, chorus II's 1, The Drop's 2, the Finale's n-th rise 3 + n). Its crossover's or Fusion's list,
// else its top style's.
export const STYLE_GROOVE = {
  synth: ['house', 'synthwave', 'reggaeton', 'traprolls'],
  organic: ['funkydrummer', 'taikomatsuri', 'impeach', 'steppers'],
  chip: ['chipgallop', 'chipfour', 'chipecho'],
  heavy: ['levee', 'rock1', 'skank', 'machinegun'],
  orchestra: ['bolero', 'paradiddle', 'march'],
};
export const CROSS_GROOVE = {
  Industrial: ['techno', 'dubstep'],
  Indietronica: ['ukg', 'rollingbreak'],
  'Electro chip': ['miamibass', 'planet'],
  'Film score': ['halftime', 'taikophrase'],
  Grunge: ['rock4', 'standardbreak'],
  'Chip metal': ['dbeat3', 'blasttrad'],
  'Symphonic metal': ['gallop', 'blasthammer'],
  'Lo-fi chip': ['boombap', 'tresillo'],
  'Chamber pop': ['bossanova', 'cinquillo'],
  'Boss theme': ['chipchase', 'fivestroke'],
  Fusion: ['amenA', 'samba'],
};

// Accompaniment figures a song gives a section's channel (tune.fig, see src/music/song.js): one bar of chord tones
// (ct: 0 root, 1 third, 2 fifth, 3 octave; o: 1 an octave up) and v, how strong a step is (a part with fewer notes
// takes the strongest first). The part's notes keep their sounds, velocities and lengths.
const C = (s, ct, v = 1, o = 0) => (o ? { s, ct, o, v } : { s, ct, v });
export const FIGURES = {
  // Sparkle. The Alberti bass (Domenico Alberti, d. 1740): root, fifth, third, fifth on every 16th. The fifth after the
  // third is the weakest, so a part with fewer notes drops it first and every group keeps its root, fifth and third.
  alberti: Array.from({ length: 16 }, (_, s) => C(s, [0, 2, 1, 2][s % 4], [1, 0.6, 0.8, 0.3][s % 4])),
  // Bass. Oom-pah: root and the fifth above on alternate beats, the left hand of Grieg's In the Hall of the
  // Mountain King (d. 1907), with a pickup into the bar.
  oompah: [C(0, 0, 1), C(4, 2, 0.85), C(8, 0, 0.95), C(12, 2, 0.85), C(14, 1, 0.55), C(15, 2, 0.6)],
  // Bass. Disco octaves: the root on the beat, the octave on the "and", 16th pickups.
  octave: [C(0, 0, 1), C(2, 0, 0.8, 1), C(4, 0, 0.95), C(6, 0, 0.8, 1), C(7, 0, 0.55, 1), C(8, 0, 1), C(10, 0, 0.8, 1),
    C(11, 2, 0.6), C(12, 0, 0.95), C(14, 0, 0.8, 1), C(15, 0, 0.55, 1)],
};
