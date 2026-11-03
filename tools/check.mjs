// Audio + integrity check, headless.
//   node tools/check.mjs                      # every instrument, every level, raw channel-input levels
//   node tools/check.mjs --role bass           # one role
//   node tools/check.mjs --mix kick808,upright,squarelead [--level 5]   # a band through the full mixing desk
//   node tools/check.mjs --mixall              # one band per style (all five), plus two mixed bands, at level 5
//   node tools/check.mjs --mixall --remix      # the same bands remixed: every pedal on, remix pedals at full on their strips
//   node tools/check.mjs --audit               # whole-song note audit in Node, no browser (see auditSong)
//   node tools/check.mjs --arrange             # the arrangement phrase by phrase in Node: who plays, notes a bar,
//                                              # damage against the full band, textures (see arrangeReport)
//   node tools/check.mjs --replay ["speed=12&bot=1&minutes=9"]   # play a sim run's track sheet as a radio edit
//   node tools/check.mjs --rules               # the game's rules as asserts in Node, no browser (crossovers, tiers,
//                                              # key degrees and every later rule; one named block per area)
// A band bar by bar (with --mix): --start N [--bars M] [--key pc] prints RMS, peak, clipping and
// brightness for each bar from song bar N, with the arrangement (phrase and bar in it, its class, and
// the bar's impact, break, fill or roll). Add --boss drone|clipper|glitchking|
// whitenoise [--frac 0.5] for its cues, --stopAt N [--ending] for stop-time (or the song's ending) on
// bar N, --pickups R for R collected notes a second, --remixAt N [--remixId id] for a remix queued to land on
// bar N (the game's Master Tape moment: that channel drops out on the bar before under a riser, then its remix
// part comes in with an impact; the first sound of the band with a remix pattern unless --remixId names one).
// Fails (exit 1) on clipping, NaN, notes out of key or off the grid, or errors. --timeout <s> (default 600)
// bounds page loads and the --replay wait, not a render once it runs.
import { serve, launch } from './serve.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const num = (n, d) => (args.includes(n) ? Number(flag(n)) : d);
const role = flag('--role', null);
const mix = flag('--mix', null);
const level = Number(flag('--level', 5));
const mixall = args.includes('--mixall');
const remix = args.includes('--remix');
const timeout = num('--timeout', 600) * 1000;
// A remixed band owns its remix pedals, so every pedal is on (level 1) under the boost.
const pedals = remix ? { reverb: 1, delay: 1, overdrive: 1, compressor: 1, chorus: 1, wah: 1, bitcrusher: 1 } : {};
const opts = { level, remix, pedals, bars: num('--bars', 8), keyPc: num('--key', 9), start: num('--start', 0), boss: flag('--boss', null), frac: num('--frac', 1), stopAt: num('--stopAt', null), ending: args.includes('--ending'), pickups: num('--pickups', 0) };
const remixAt = num('--remixAt', null), remixId = flag('--remixId', null);
const perBar = ['--start', '--boss', '--stopAt', '--pickups', '--remixAt'].some((f) => args.includes(f));

if (args.includes('--audit')) {
  const { auditSong } = await import('./audiocheck.js');
  const r = auditSong();
  const bad = r.outOfKey + r.offGrid + r.aboveCeiling + r.foreignKind + r.leaks;
  console.log(`audit: ${r.runs} runs (${r.remixRuns} remixed), ${r.notes} notes, ${r.tfNotes} transform notes (${r.transforms} transforms on every part), ${r.chimes} chime pitches`);
  console.log(`  ${r.fillNotes} fill notes, ${r.rollNotes} roll notes, ${r.restBars} rest bars, ${r.breakBars} break bars, ${r.soloBars} solo bars, ${r.stopBars} stop bars`);
  console.log(`out of key ${r.outOfKey}, off grid ${r.offGrid}, above ceiling ${r.aboveCeiling}, sound not in the part ${r.foreignKind}, notes where silent ${r.leaks}${bad ? '  !! FAIL' : ''}`);
  process.exit(bad ? 1 : 0);
}

// The arrangement, phrase by phrase (Node only, a few seconds). See arrangeReport in tools/audiocheck.js.
if (args.includes('--arrange')) {
  const { arrangeReport } = await import('./audiocheck.js');
  const r = arrangeReport();
  const mm = (xs, d = 0) => { const a = Math.min(...xs).toFixed(d), b = Math.max(...xs).toFixed(d); return a === b ? a : `${a}-${b}`; };
  console.log(`bands at level 5: ${r.bands.join(', ')}   dps = the band's damage against its full parts (min-max over bands, solos with every channel featured)`);
  console.log('time   phrase      class  playing  notes/bar  dps        e     cue   textures (missing roles play full)');
  for (const x of r.rows) {
    const t = `${Math.floor(x.time / 60)}:${String(Math.round(x.time % 60)).padStart(2, '0')}`;
    const cue = (x.brk ? 'brk ' : '') + (x.impact ? 'IMP' : '');
    console.log(`${t.padStart(5)}  ${x.name.padEnd(10)}  ${x.cls.padEnd(5)}  ${mm(x.playing).padEnd(7)}  ${mm(x.notes).padEnd(9)}  ${`${x.mean.toFixed(2)} (${x.min.toFixed(2)}-${x.max.toFixed(2)})`.padEnd(17)}  ${x.e.toFixed(2)}  ${cue.padEnd(8)}  ${x.spec}${x.bad.length ? '   !! ' + x.bad.join('; ') : ''}`);
  }
  console.log('energy: ' + r.rows.map((x) => x.mean.toFixed(2)).join(' '));
  for (const [band, s] of Object.entries(r.similar)) console.log(`texture similarity (1.00 = the same) ${band.padEnd(8)} ` + Object.entries(s).map(([k, v]) => `${k} ${v.toFixed(2)}`).join('  '));
  if (r.failures.length) console.log('\n!! FAIL\n' + r.failures.join('\n'));
  process.exit(r.failures.length ? 1 : 0);
}

// Rules as asserts (Node only, a second or two). Each block adds named checks; a failure prints and the rest still run.
if (args.includes('--rules')) {
  const { default: assert } = await import('node:assert/strict');
  const { STYLES } = await import('../src/config.js');
  const { CHEMISTRY, GENRES, Loadout, chemistryTier, computeStats, crossoverOf, emptyCounts, isFusion, ruleTiers } = await import('../src/game/loadout.js');
  const { KEYS, makeChord, keyTone } = await import('../src/music/theory.js');
  const { BY_ID } = await import('../src/content/instruments/index.js');
  const checks = [];
  const check = (name, fn) => checks.push({ name, fn });
  const styles = Object.keys(STYLES);
  const counts = (o) => ({ ...emptyCounts(), ...o });
  // Every band of 0 to 6 sounds, as style counts.
  const bands = [];
  const fill = (i, left, c) => {
    if (i === styles.length) { bands.push(c); return; }
    for (let n = 0; n <= left; n++) fill(i + 1, left - n, { ...c, [styles[i]]: n });
  };
  fill(0, 6, {});
  const plain = (c) => Object.fromEntries(Object.keys(CHEMISTRY).map((st) => [st, chemistryTier(st, c[st])]));

  // Lane 0: contracts
  check('crossoverOf: exactly two styles at 2+ name their crossover, three or more Fusion, else none', () => {
    for (const [pair, name] of Object.entries(GENRES.crossovers)) {
      const [a, b] = pair.split('+');
      for (const [na, nb] of [[2, 2], [3, 3], [4, 2], [2, 4]]) assert.equal(crossoverOf(counts({ [a]: na, [b]: nb })), name, pair);
      for (const c of styles.filter((x) => x !== a && x !== b)) {
        assert.equal(crossoverOf(counts({ [a]: 3, [b]: 2, [c]: 1 })), name, `${pair}+1`);
        assert.equal(crossoverOf(counts({ [a]: 2, [b]: 2, [c]: 2 })), 'Fusion', `${pair}+${c}`);
      }
    }
    assert.equal(Object.keys(GENRES.crossovers).length, (styles.length * (styles.length - 1)) / 2);
    for (const o of [{}, { heavy: 6 }, { synth: 1, organic: 1 }, { chip: 4, heavy: 1, orchestra: 1 }, { synth: 5, organic: 1 }]) assert.equal(crossoverOf(counts(o)), null, JSON.stringify(o));
    for (const c of bands) {
      const two = styles.filter((st) => c[st] >= 2).length;
      assert.equal(crossoverOf(c) === 'Fusion', isFusion(c));
      assert.equal(crossoverOf(c) === null, two < 2);
    }
  });
  check('ruleTiers: plain tiers without the crossover lift, and with it wherever no crossover forms', () => {
    for (const c of bands) {
      assert.deepEqual(ruleTiers(c, false), plain(c));
      if (!crossoverOf(c)) assert.deepEqual(ruleTiers(c), plain(c));
    }
    assert.deepEqual(ruleTiers(counts({ heavy: 6 })), { ...plain(emptyCounts()), heavy: 3 });
  });
  check('computeStats writes rules.tiers and rules.x (none with xo off)', () => {
    const L = new Loadout();
    for (const id of ['kick808', 'hats909', 'upright', 'rhodes']) L.set(BY_ID[id], 1);
    const c = L.styleCounts();
    assert.equal(crossoverOf(c), 'Indietronica');
    const s = computeStats(L);
    assert.deepEqual(s.rules.tiers, ruleTiers(c));
    assert.equal(s.rules.x, 'Indietronica');
    assert.equal(computeStats(L, null, false).rules.x, null);
    assert.equal(computeStats(new Loadout()).rules.x, null);
  });
  check('keyTone: every key degree on its scale step in all 9 tonics, an octave every 7 degrees', () => {
    const mod = (n, m) => ((n % m) + m) % m;
    const tonics = new Set(KEYS.flatMap((k) => [k.pc, (k.pc + 2) % 12]));
    assert.equal(tonics.size, 9);
    for (const pc of tonics) for (let deg = 0; deg < 7; deg++) for (const h of [false, true]) {
      const chord = makeChord(pc, deg, h);
      assert.equal(chord.keyPc, pc);
      // The chord's own degrees land on its tones (over a harmonic V, degree 6 is the raised leading tone).
      for (let k = 0; k < 4; k++) assert.equal(mod(keyTone(chord, deg + 2 * k, 60), 12), chord.pcs[k], `tonic ${pc} deg ${deg} tone ${k}`);
      for (const low of [48, 63, 74]) for (let n = -7; n <= 14; n++) {
        const m = keyTone(chord, n, low);
        assert.equal(mod(m - pc, 12), chord.scale[mod(n, 7)], `tonic ${pc} deg ${deg} n ${n}`);
        assert.ok(m >= low - 12 && m < low + 36, `tonic ${pc} n ${n} at ${m}`);
        assert.equal(keyTone(chord, n + 7, low), m + 12);
        if (n === 0) assert.ok(m >= low && m < low + 12);
      }
    }
  });

  // Lane 1: deal and tapes
  {
    const { buildOffers, describeOffer, remixReady, tapeTarget, bandMove } = await import('../src/game/upgrades.js');
    const { BALANCE } = await import('../src/config.js');
    const { PEDALS, PEDAL_BY_ID } = await import('../src/content/pedals.js');
    const { INSTRUMENTS } = await import('../src/content/instruments/index.js');
    const { seedRng } = await import('../src/util.js');
    const mn = BALANCE.remix.minLevel;
    // Enough of a Game for the deal: band [[id, level, remixed]], pedals [[id, level]].
    const dealer = (band, { cap = 6, pedals = [], banked = 0 } = {}) => {
      const L = new Loadout();
      for (const [id, lv, rx] of band) L.set(BY_ID[id], lv).remix = !!rx;
      for (const [id, lv] of pedals) L.pedals.push({ def: PEDAL_BY_ID[id], level: lv });
      return { loadout: L, channelCap: () => cap, time: 200, banished: new Set(), tapes: { banked }, remixQueued: () => false, player: { hp: 100, maxHp: 120 } };
    };
    check('a deal never shows two Faders for one channel: one L5 channel, pedals maxed, no real cards left (1,000 seeded deals)', () => {
      for (const rx of [false, true]) {
        const g = dealer([['kick808', 5, rx]], { cap: 1, pedals: PEDALS.slice(0, 4).map((p) => [p.id, 3]) });
        for (const d of INSTRUMENTS) if (d.role === 'beat' && d.id !== 'kick808') g.banished.add(d.id);
        seedRng(1);
        for (let i = 0; i < 1000; i++) {
          const f = buildOffers(g, 3).filter((c) => c.kind === 'fader');
          assert.equal(f.length, 1, `remixed ${rx}, deal ${i}: ${f.length} Faders`);
        }
      }
    });
    check(`a tape remixes a sound at level ${mn} or more; it waits for every unremixed channel at the highest level below`, () => {
      assert.equal(remixReady({ def: BY_ID.kick808, level: mn - 1 }), false);
      assert.equal(remixReady({ def: BY_ID.kick808, level: mn }), true);
      assert.equal(remixReady({ def: BY_ID.kick808, level: 5, remix: true }), false);
      const g = dealer([['kick808', mn - 1], ['upright', mn - 1], ['sawlead', 1], ['rhodes', mn], ['shaker', 5, true]], { banked: 1 });
      assert.deepEqual(tapeTarget(g).map((i) => i.def.id), ['kick808', 'upright']);
      // Two ready: the tape goes to their remix cards, so no strip waits.
      const two = dealer([['kick808', mn + 1], ['flute', mn], ['upright', mn - 1]], { banked: 1 });
      two.remixReady = () => two.loadout.instruments().filter(remixReady);
      assert.deepEqual(tapeTarget(two), []);
      const card = (gg) => describeOffer(gg, { kind: 'up', def: BY_ID.kick808, role: 'beat', level: mn, inst: gg.loadout.channels.beat });
      assert.equal(card(g).tape, true);
      assert.ok(card(g).info.includes(`Reaches level ${mn}: your Master Tape remixes it.`));
      g.tapes.banked = 0;
      assert.equal(card(g).tape, false);
      const rx = describeOffer(g, { kind: 'remix', def: BY_ID.rhodes, role: 'chords', level: 5, inst: g.loadout.channels.chords });
      assert.equal(rx.prev, mn);
      assert.ok(rx.info.includes(`Level ${mn} → 5`));
    });
    check('a swap gains when a tier or the crossover rises, loses when either falls, else moves sideways', () => {
      assert.equal(bandMove(counts({ synth: 2, organic: 1, heavy: 1 }), 'heavy', 'organic'), 1);   // forms Industrial
      assert.equal(bandMove(counts({ synth: 2, organic: 2, heavy: 1, chip: 1 }), 'heavy', 'chip'), 1);   // forms Fusion
      assert.equal(bandMove(counts({ synth: 2, organic: 2 }), 'heavy', 'organic'), -1);   // breaks Indietronica
      assert.equal(bandMove(counts({ synth: 2, organic: 2, heavy: 1 }), 'heavy', 'synth'), -1);   // Grunge, but Long throw falls
      assert.equal(bandMove(counts({ synth: 3, organic: 1, heavy: 1 }), 'chip', 'organic'), 0);
      assert.equal(bandMove(counts({ synth: 1 }), 'synth'), 1);
      assert.equal(bandMove(counts({ synth: 1 }), 'heavy'), 0);
    });
  }

  // Lane 2: rules, crossovers and the pick moment
  {   // its own scope, so another lane's block can import the same names
    const { genreName, CROSS_TEXT, RULES } = await import('../src/game/loadout.js');
    const { Game } = await import('../src/game/game.js');
    const { describeOffer } = await import('../src/game/upgrades.js');
    const { BALANCE, BEAT_SEC } = await import('../src/config.js');
    const genre = (o) => genreName({ styleCounts: () => counts(o) });
    // A bare game for the rule math: stats, rule state and a player at the origin, no run.
    const ruleGame = (o, S = {}) => {
      const L = new Loadout();
      for (const id of o) L.set(BY_ID[id], 1);
      return Object.assign(Object.create(Game.prototype), { stats: computeStats(L), rules: { combo: 0, planted: false, phrase: 0, broke: false, beatAt: 0, ...S }, player: { x: 0, y: 0 }, time: 1, lastHurtAt: -Infinity });
    };
    const HEAVY = ['doublekick', 'ride', 'dropd'], SYNTH = ['supersaw', 'sawlead', 'arpsynth'];
    check('genreName and crossoverOf agree: exactly two styles at 2+ name their crossover, three Fusion, else the ladder', () => {
      const cases = [
        [{ heavy: 2, synth: 2 }, 'Industrial', 'Industrial'], [{ heavy: 3, organic: 3 }, 'Grunge', 'Grunge'],
        [{ chip: 4, orchestra: 2 }, 'Boss theme', 'Boss theme'], [{ synth: 3, organic: 2, chip: 1 }, 'Indietronica', 'Indietronica'],
        [{ synth: 2, chip: 2, heavy: 2 }, 'Fusion', 'Fusion'], [{ chip: 4, heavy: 1, orchestra: 1 }, null, 'Chiptune'],
        [{ synth: 1, organic: 1 }, null, 'Synth solo'], [{ heavy: 6 }, null, 'Pure metal'],
      ];
      for (const [o, x, name] of cases) {
        assert.equal(crossoverOf(counts(o)), x, JSON.stringify(o));
        assert.equal(genre(o), name, JSON.stringify(o));
      }
      for (const c of bands) if (crossoverOf(c)) assert.equal(genreName({ styleCounts: () => c }), crossoverOf(c));
      for (const name of [...Object.values(GENRES.crossovers), 'Fusion']) {
        const words = CROSS_TEXT[name]?.replace(/\.$/, '').split(/\s+/) || [];
        assert.ok(words.length >= 3 && words.length <= 7, `${name}: "${CROSS_TEXT[name]}"`);
      }
    });
    check('ruleTiers: Fusion lifts every 2+ style one tier (cap 3), xo off and pairs do not, 6 Heavy is tier 3', () => {
      assert.deepEqual(ruleTiers(counts({ synth: 2, organic: 2, orchestra: 2 })), { ...plain(emptyCounts()), synth: 2, organic: 2, orchestra: 2 });
      assert.deepEqual(ruleTiers(counts({ synth: 2, organic: 2, orchestra: 2 }), false), { ...plain(emptyCounts()), synth: 1, organic: 1, orchestra: 1 });
      assert.deepEqual(ruleTiers(counts({ heavy: 4, synth: 2 })), plain(counts({ heavy: 4, synth: 2 })), 'pairTier 0: a pair plays plain tiers');
      assert.deepEqual(ruleTiers(counts({ heavy: 6 })), { ...plain(emptyCounts()), heavy: 3 });
      assert.equal(crossoverOf(counts({ heavy: 6 })), null);
      for (const c of bands) for (const st of styles) assert.ok(ruleTiers(c)[st] <= 3 && ruleTiers(c)[st] >= plain(c)[st]);
      // computeStats plays the lifted tier's values.
      const L = new Loadout();
      for (const id of ['timpani', 'hats909', 'cellos', 'supersaw', 'flute', 'musicbox']) L.set(BY_ID[id], 1);
      const R = computeStats(L).rules;
      assert.equal(R.x, 'Fusion');
      assert.equal(R.swell, CHEMISTRY.orchestra.tiers[1].swell);
      assert.equal(computeStats(L, null, false).rules.swell, CHEMISTRY.orchestra.tiers[0].swell);
    });
    check('Ride the swell: x1 at phrase 0, x(1 + swell) at phrase 1, never below 1', () => {
      for (const n of [2, 4, 6]) {
        const ids = ['timpani', 'fieldsnare', 'cellos', 'strings', 'horn', 'harp'].slice(0, n);
        const sw = CHEMISTRY.orchestra.tiers[n / 2 - 1].swell;
        const e = { x: 100, y: 0, r: 10 };
        assert.equal(ruleGame(ids, { phrase: 0 }).ruleMul(e), 1);
        assert.equal(ruleGame(ids, { phrase: 1 }).ruleMul(e), 1 + sw);
        assert.ok(ruleGame(ids, { phrase: 0.3 }).ruleMul(e) > 1);
      }
    });
    check('crossover twists: each bends its two rules, and only while it is in play', () => {
      const X = BALANCE.crossover, body = { x: 200, y: 0, r: 10 };
      const ind = ruleGame([...HEAVY, ...SYNTH]);
      assert.equal(ind.stats.rules.x, 'Industrial');
      assert.equal(ind.ruleMul(body), 1 + ind.stats.rules.near, 'Industrial: a 200 px body takes the Mosh pit bonus');
      assert.equal(ruleGame([...HEAVY, SYNTH[0]]).ruleMul(body), 1, 'Mosh pit alone does not reach it');
      const grunge = ['doublekick', 'ride', 'upright', 'rhodes'];
      assert.equal(ruleGame(grunge, { planted: true }).nearR(), RULES.near * X.grunge);
      assert.equal(ruleGame(grunge).nearR(), RULES.near);
      assert.equal(ruleGame(['doublekick', 'ride', 'cellos', 'strings'], { phrase: 1 }).nearR(), RULES.near * (1 + X.symphonic));
      assert.equal(ruleGame(['kick808', 'hats909', 'upright', 'rhodes'], { planted: true }).farR(), RULES.near);
      assert.equal(ruleGame(['kick808', 'hats909', 'cellos', 'strings'], { phrase: 1 }).farR(), RULES.far * (1 - X.film));
      assert.equal(ruleGame(['kick808', 'hats909', 'tribass', 'chipchords'], { combo: RULES.comboCap }).farR(), 0);
      assert.equal(ruleGame(['kick808', 'hats909', 'tribass', 'chipchords'], { combo: RULES.comboCap - 1 }).farR(), RULES.far);
      assert.equal(ruleGame(['taiko', 'shaker', 'cellos', 'strings'], { planted: true, phrase: 0.1 }).swellAt(), 1);
      assert.equal(ruleGame(['taiko', 'shaker', 'cellos', 'strings'], { phrase: 0.1 }).swellAt(), 0.1);
      // Chip metal: a hit halves the combo (12 -> 6); any other band resets it.
      const cm = ruleGame(['doublekick', 'ride', 'tribass', 'chipchords'], { combo: 12 });
      cm._hitRules();
      assert.equal(cm.rules.combo, 6);
      const chip = ruleGame(['chipdrums', 'chiphat', 'tribass', 'chipchords'], { combo: 12 });
      chip._hitRules();
      assert.equal(chip.rules.combo, 0);
      // Lo-fi chip: a clean planted beat adds lofi; Boss theme: the fill's downbeat fills the combo.
      const beat = (g, bar, beat) => { g.song = { position: () => ({ barInSection: bar, section: { from: 0 } }) }; g._rulesOnBeat({ bar, beat }); return g.rules.combo; };
      assert.equal(beat(ruleGame(['taiko', 'shaker', 'tribass', 'chipchords'], { combo: 3 }), 2, 1), 3 + X.lofi);
      assert.equal(beat(ruleGame(['taiko', 'shaker', 'tribass', 'chipchords'], { combo: 3, broke: true }), 2, 1), 4);
      assert.equal(beat(ruleGame(['chipdrums', 'chiphat', 'cellos', 'strings'], { combo: 3 }), 7, 0), RULES.comboCap);
      assert.equal(beat(ruleGame(['chipdrums', 'chiphat', 'cellos', 'strings'], { combo: 3 }), 6, 0), 4);
    });
    check('cards: a split gem and a line for a crossover formed or broken, the fusion gem for Fusion, a loss word on a tier dropped', () => {
      const card = (ids, o) => { const L = new Loadout(); for (const id of ids) L.set(BY_ID[id], 1); return describeOffer({ loadout: L }, { level: 1, ...o, from: o.from && L.channels[o.from] }); };
      const xs = (d) => d.gems.filter((gm) => gm.style === 'cross' || gm.style === 'fusion').map((gm) => [gm.name || gm.style, gm.tier]);
      const has = (d, ...lines) => { for (const l of lines) assert.ok(d.info.includes(l), `"${l}" in ${d.info.join(' | ')}`); };
      let d = card(['kick808', 'hats909', 'dropd'], { kind: 'new', def: BY_ID.shred });
      assert.deepEqual(d.gems.find((gm) => gm.style === 'cross'), { style: 'cross', a: 'synth', b: 'heavy', name: 'Industrial', tier: 1 });
      has(d, `Forms Industrial: ${CROSS_TEXT.Industrial}`);
      d = card(['kick808', 'hats909', 'dropd', 'powerchords'], { kind: 'swap', def: BY_ID.chiphat, from: 'perc' });
      assert.deepEqual(xs(d), [['Industrial', -1]]);
      has(d, 'Breaks Industrial');
      // A pair that turns into Fusion: the pair breaks, Fusion forms, and every style it lifts says so.
      d = card(['kick808', 'hats909', 'dropd', 'powerchords', 'flute'], { kind: 'new', def: BY_ID.musicbox });
      assert.deepEqual(xs(d), [['Industrial', -1], ['fusion', 1]]);
      has(d, 'Breaks Industrial', `Forms Fusion: ${CROSS_TEXT.Fusion}`, 'Live x2: In the pocket, +24% area, heal 1 a beat', 'Synth x2: Long throw, +40% far away', 'Heavy x2: Mosh pit, +40% up close');
      // Fusion broken into a pair: a cracked fusion gem, the new pair, and every rule that drops a tier.
      d = card(['kick808', 'hats909', 'dropd', 'powerchords', 'flute', 'musicbox'], { kind: 'swap', def: BY_ID.chiphat, from: 'perc' });
      assert.deepEqual(xs(d), [['fusion', -1], ['Grunge', 1]]);
      has(d, 'Breaks Fusion', `Forms Grunge: ${CROSS_TEXT.Grunge}`, 'Loses Synth x2: Long throw', 'Heavy x2: Mosh pit drops to +20% up close', 'Live x2: In the pocket drops to +12% area, heal 0.5 a beat');
      // One pair into another: both lines and both discs.
      d = card(['doublekick', 'ride', 'upright', 'supersaw', 'sawlead', 'chiparp'], { kind: 'swap', def: BY_ID.taiko, from: 'beat' });
      assert.deepEqual(xs(d), [['Industrial', -1], ['Indietronica', 1]]);
      has(d, 'Breaks Industrial', `Forms Indietronica: ${CROSS_TEXT.Indietronica}`);
      // A tier stepped down that keeps a tier reads as a loss.
      d = card(['kick808', 'hats909', 'subbass', 'supersaw', 'sawlead', 'arpsynth'], { kind: 'swap', def: BY_ID.squarelead, from: 'lead' });
      has(d, 'Synth x5: Long throw drops to +40% far away');
      has(card(['chipdrums', 'chiphat', 'tribass', 'chipchords', 'flute', 'musicbox'], { kind: 'swap', def: BY_ID.kick808, from: 'beat' }), '8-Bit x3: Combo streak drops to +25% damage');
      assert.deepEqual(xs(card(['kick808', 'hats909', 'dropd'], { kind: 'new', def: BY_ID.flute })), [], 'no crossover moves: no gem');
    });
    check('the pick moment: nothing at time 0, then one ring per pick (crossover > rule tier > channel), one line at most', () => {
      const clock = { sim: true, t: 0, now() { return this.t; } };
      const give = ['hats909', 'dropd', 'rhodes'].map((id) => ({ id, level: 1 }));
      const g = new Game({ audio: null, clock, seq: new (class { reset() {} start() {} })(), opts: { sim: true, give }, hooks: {} });
      g.newRun({ start: 'kick808', seed: 1, keyIndex: 0 });
      const lines = [];
      g.banner = (title, sub, compact, style, prio) => lines.push({ title, compact, prio });
      const pick = (fn) => { fn(); for (const l of g.later.splice(0)) l.fn(); return g.fx.rings.splice(0).map((r) => [r.color, r.r1]); };
      assert.equal(g.later.length, 0, 'the start sound and give= never ring');
      assert.equal(g._led().rings, undefined);
      g.time = 10;
      g.fx.rings.length = 0;
      // A level pick: the channel's small ring.
      assert.deepEqual(pick(() => g.setInstrumentLevel(g.loadout.channels.beat, 2)), [[g.color('beat'), 140]]);
      // Synth 2 + Live 2 forms Indietronica: two rings in the two style colors, the stamp is the only line.
      assert.deepEqual(pick(() => g.addInstrument(BY_ID.flute, 1)).map((r) => r[0]).sort(), [STYLES.synth.color, STYLES.organic.color].sort());
      assert.deepEqual(g.ruleBloom.styles.sort(), ['organic', 'synth']);
      // A third Live sound moves no rule: its channel ring.
      assert.deepEqual(pick(() => g.addInstrument(BY_ID.musicbox, 1)), [[g.color('arp'), 200]]);
      // A fourth Live sound steps In the pocket up and the genre stays: the rule's ring, its bloom and its line.
      assert.deepEqual(pick(() => g.addInstrument(BY_ID.upright, 1)), [[STYLES.organic.color, 260]]);
      assert.equal(g.genre, 'Indietronica');
      assert.deepEqual(g.ruleBloom, { styles: ['organic'], t: 10 });
      assert.deepEqual(lines, [{ title: `In the pocket · ${CHEMISTRY.organic.tiers[1].text}`, compact: true, prio: 1 }]);
      // Two Heavy swaps: the second forms Fusion, three rings and no line.
      pick(() => g.addInstrument(BY_ID.powerchords, 1));
      assert.equal(pick(() => g.addInstrument(BY_ID.shred, 1)).length, 3);
      assert.equal(g.stats.rules.x, 'Fusion');
      assert.equal(lines.length, 1);
      assert.equal(g._led().rings, 1 + 2 + 1 + 1 + 1 + 3);
      // Breaking Fusion into Grunge drops every rule a tier: the channel's ring, no bloom, no line.
      g.time = 20;
      assert.deepEqual(pick(() => g.addInstrument(BY_ID.chiphat, 1)), [[g.color('perc'), 200]]);
      assert.equal(g.stats.rules.x, 'Grunge');
      assert.equal(g.ruleBloom.t, 10);
      // Picks chained in one pause play a beat apart.
      g.time = 30;
      g.setInstrumentLevel(g.loadout.channels.beat, 3);
      g.setInstrumentLevel(g.loadout.channels.beat, 4);
      assert.deepEqual(g.later.map((l) => l.at), [30, 30 + BEAT_SEC]);
    });
  }

  // Lane 3: pedals and Signature
  {
    const { Game } = await import('../src/game/game.js');
    const { Sequencer } = await import('../src/music/sequencer.js');
    const { BALANCE, BEAT_SEC } = await import('../src/config.js');
    const { PEDAL_BY_ID, pedalFits } = await import('../src/content/pedals.js');
    const { describeOffer } = await import('../src/game/upgrades.js');
    const { spawnEnemy } = await import('../src/game/enemies.js');
    const SIG = BALANCE.remix.sig;
    // A run in Node with one sound (remixed if asked) and these pedals, at game time t.
    const game = ({ start = 'sawlead', give = [], remix = false, pedals = [], sig, t = 10 } = {}) => {
      const clock = { sim: true, t: 0, now() { return this.t; } };
      const banners = [];
      const g = new Game({ audio: null, clock, seq: new Sequencer(clock, null), opts: { sim: true, god: true, solo: true, give, sig }, hooks: { onBanner: (title, sub, compact, style) => banners.push({ title, compact, style }) } });
      g.newRun({ start, seed: 1, keyIndex: 0 });
      const inst = g.loadout.channels[BY_ID[start].role];
      if (remix) { inst.level = 5; inst.remix = true; }
      for (const id of pedals) g.loadout.pedals.push({ def: PEDAL_BY_ID[id], level: 1 });
      g.onLoadoutChanged();
      g.time = t;
      banners.length = 0;
      return { g, inst, banners };
    };
    const addPedal = (g, id) => { g.loadout.pedals.push({ def: PEDAL_BY_ID[id], level: 1 }); g.onLoadoutChanged(); };
    check('Signature: dmg(100) from a remix with its own pedal on the board is remix.sig times the same call without it', () => {
      const { g, inst } = game({ remix: true, pedals: ['overdrive'] });
      assert.equal(inst.sig, true);
      g.src = inst;
      const a = g.dmg(100);
      inst.sig = false;
      assert.ok(Math.abs(a / g.dmg(100) - SIG) < 1e-9, `${a} / ${g.dmg(100)}`);
    });
    check('Signature: only a remix, only with its own remix pedal, never with sig=0', () => {
      assert.equal(game({ remix: true }).inst.sig, false, 'no pedal');
      assert.equal(game({ remix: true, pedals: ['reverb'] }).inst.sig, false, 'another pedal');
      assert.equal(game({ pedals: ['overdrive'] }).inst.sig, false, 'not remixed');
      assert.equal(game({ remix: true, pedals: ['overdrive'], sig: false }).inst.sig, false, 'sig=0');
      // The Compressor and Auto-Wah pairs count like any other.
      assert.equal(game({ start: 'kick808', remix: true, pedals: ['compressor'] }).inst.sig, true, 'Sidechain 808');
      assert.equal(game({ start: 'subbass', remix: true, pedals: ['wah'] }).inst.sig, true, 'Wobble Bass');
    });
    check('Signature: the pedal coming later rings once with "<remix> ×sig" on the compact line; a landing counts it quietly', () => {
      const { g, inst, banners } = game({ remix: true });
      const n = g.later.length;
      addPedal(g, 'overdrive');
      assert.equal(inst.sig, true);
      assert.equal(g._led().sig, 1);
      assert.equal(g.later.length, n + 1, 'one moment queued');
      addPedal(g, 'reverb');   // another pedal: no second moment, no second count
      assert.equal(g.later.length, n + 1);
      assert.equal(g._led().sig, 1);
      const rings = g.fx.rings.length;
      g.later.splice(n).forEach((l) => l.fn());
      assert.equal(g.fx.rings.length, rings + 1);
      assert.equal(g.fx.rings.at(-1).color, PEDAL_BY_ID.overdrive.color);
      assert.deepEqual(banners, [{ title: `Screamer ×${SIG}`, compact: true, style: '' }]);
      // A remix landing with its pedal already on the board: counted, no moment of its own (the banner carries it).
      const b = game({ pedals: ['overdrive'] });
      b.inst.level = 5;
      const m = b.g.later.length;
      b.g._remixFlipped(Object.assign(b.inst, { remix: true }));
      assert.equal(b.inst.sig, true);
      assert.equal(b.g._led().sig, 1);
      assert.equal(b.g.later.length, m);
      b.g.landRemix({ inst: b.inst, bar: 40 });
      assert.equal(b.banners.at(-1).title, `Screamer ×${SIG}`);
      assert.equal(b.g._remixBanner.name, `Screamer ×${SIG}`);
      // Without its pedal the remix lands as before.
      const c = game({});
      c.inst.level = 5;
      c.g._remixFlipped(Object.assign(c.inst, { remix: true }));
      c.g.landRemix({ inst: c.inst, bar: 40 });
      assert.equal(c.banners.at(-1).title, 'Screamer');
    });
    check('Signature: one pedal pick that forms two Signatures is one moment (one ring, one line naming both)', () => {
      const { g, banners } = game({ start: 'upright', give: [{ id: 'sawlead', level: 5 }], remix: true });
      g.loadout.channels.lead.remix = true;
      g.onLoadoutChanged();
      const n = g.later.length, rings = g.fx.rings.length;
      addPedal(g, 'overdrive');
      assert.equal(g._led().sig, 2);
      assert.equal(g.later.length, n + 1);
      g.later.splice(n).forEach((l) => l.fn());
      assert.equal(g.fx.rings.length, rings + 1);
      assert.deepEqual(banners, [{ title: `Slap Bass + Screamer ×${SIG}`, compact: true, style: '' }]);
      // A new sound and the pedal picked in one pause (either order) ring a beat apart, on the pick moments' queue.
      for (const order of [['sound', 'pedal'], ['pedal', 'sound']]) {
        const b = game({ remix: true });
        b.g._momentAt = -Infinity;
        b.g.time = 30;
        for (const k of order) if (k === 'sound') b.g.addInstrument(BY_ID.kick808, 1); else addPedal(b.g, 'overdrive');
        assert.deepEqual(b.g.later.map((l) => l.at), [30, 30 + BEAT_SEC], order.join(' then '));
      }
    });
    check('Signature: the band multiplier (ledger bx) counts it', () => {
      const { g, inst } = game({ remix: true, pedals: ['overdrive'] });
      g.stats.crit = 0;
      g.stats.rules.on = false;
      const e = spawnEnemy(g, 'static', g.player.x + 300, g.player.y, { hpMul: 1e7 });
      const L = g._led();
      L.bx = [0, 0];
      g.src = inst;
      g.hit(e, g.dmg(100));
      assert.ok(Math.abs(L.bx[1] / L.bx[0] - SIG) < 1e-9, `${L.bx}`);
    });
    check('Remix cards show the partner pedal, lit when it is on the board, with the Signature as the last line', () => {
      for (const [pedals, on] of [[[], false], [['overdrive'], true]]) {
        const { g, inst } = game({ pedals });
        inst.level = 5;
        const d = describeOffer(g, { kind: 'remix', def: inst.def, role: inst.def.role, inst, level: 5 });
        assert.deepEqual(d.pair, { glyph: 'overdrive', on });
        assert.equal(d.info.at(-1), on ? `Overdrive is on your board: this remix deals ×${SIG}.` : `Add Overdrive later for ×${SIG}.`);
      }
      // A full board without it can never take it (pedals never leave): no glyph, no promise.
      const { g, inst } = game({ pedals: ['reverb', 'delay', 'chorus', 'bitcrusher'] });
      inst.level = 5;
      const d = describeOffer(g, { kind: 'remix', def: inst.def, role: inst.def.role, inst, level: 5 });
      assert.equal(d.pair, null);
      assert.ok(!d.info.some((l) => l.includes(`×${SIG}`)), d.info.at(-1));
      // Nor once the partner is banished (never dealt again), slots free or not.
      const b = game({});
      b.inst.level = 5;
      b.g.banished.add('overdrive');
      const db = describeOffer(b.g, { kind: 'remix', def: b.inst.def, role: b.inst.def.role, inst: b.inst, level: 5 });
      assert.equal(db.pair, null);
      assert.ok(!db.info.some((l) => l.includes(`×${SIG}`)), db.info.at(-1));
    });
    check('Pedal cards: a row of the band lit where pedalFits, gold where it is a remix partner, "Powers n of your N sounds." last', () => {
      const M = BALANCE.remix.minLevel;
      const { g, inst } = game({ start: 'taiko', give: [{ id: 'subbass', level: 1 }, { id: 'sawlead', level: M }, { id: 'hats909', level: Math.max(1, M - 1) }] });
      const band = g.loadout.instruments();
      for (const pd of Object.values(PEDAL_BY_ID)) {
        for (const kind of ['pedal-new', 'pedal-up']) {
          const d = describeOffer(g, { kind, pedal: pd, level: kind === 'pedal-new' ? 1 : 2, own: null });
          if (!pd.fits) { assert.deepEqual(d.fit, [], pd.id); assert.ok(!d.info.some((l) => l.startsWith('Powers')), pd.id); continue; }
          assert.deepEqual(d.fit.map((f) => f.glyph), band.map((i) => i.def.id), pd.id);
          assert.deepEqual(d.fit.map((f) => f.on), band.map((i) => pedalFits(pd, i)), pd.id);
          const lit = band.filter((i) => pedalFits(pd, i)).length;
          assert.equal(d.info.at(-1), `Powers ${lit} of your ${band.length} sounds.`, pd.id);
          // Saw Lead at minLevel is far enough along for a tape: Overdrive is its partner. Taiko (level 1) and 909 Hats
          // (one under) are not yet.
          assert.deepEqual(d.fit.filter((f) => f.pair).map((f) => f.glyph), pd.id === 'overdrive' ? ['sawlead'] : [], pd.id);
        }
      }
      assert.equal(describeOffer(g, { kind: 'pedal-new', pedal: PEDAL_BY_ID.reverb, level: 1 }).info.at(-1), 'Powers 2 of your 4 sounds.');
      inst.level = 5; inst.remix = true;   // remixed, Taiko reads its remix (Thunder Hall) and partners Hall Reverb
      const d = describeOffer(g, { kind: 'pedal-new', pedal: PEDAL_BY_ID.reverb, level: 1 });
      assert.deepEqual(d.fit[0], { glyph: 'taiko', role: 'beat', on: true, pair: true });
      // A pedal that powers you shows only its remix partners, lit: Sub Bass remixed finds Auto-Wah.
      g.loadout.channels.bass.level = 5; g.loadout.channels.bass.remix = true;
      const w = describeOffer(g, { kind: 'pedal-new', pedal: PEDAL_BY_ID.wah, level: 1 });
      assert.deepEqual(w.fit, [{ glyph: 'subbass', role: 'bass', on: null, pair: true }]);
      assert.ok(!w.info.some((l) => l.startsWith('Powers')));
    });
  }

  // Lane 6: grooves and figures
  {
    const { GROOVES, STYLE_GROOVE, CROSS_GROOVE, FIGURES } = await import('../src/music/grooves.js');
    const { Sequencer, TRANSFORMS, partOf, stepsOf } = await import('../src/music/sequencer.js');
    const { Song, SONGS, SECTIONS, CHART } = await import('../src/music/song.js');
    const { radioEdit } = await import('../src/music/replay.js');
    const { INSTRUMENTS } = await import('../src/content/instruments/index.js');
    const { makeInst } = await import('../src/game/loadout.js');
    const isDrum = (d) => d.role === 'beat' || d.role === 'perc';
    // Every level's part of these sounds.
    const parts = (defs) => defs.flatMap((d) => d.levels.map((l, i) => ({ d, inst: makeInst(d, i + 1), by: l._byStep, P: d.steps || 16 })));
    // A sequencer on the song with a band of these sounds at level 3.
    const rig = (ids) => {
      const seq = new Sequencer({ sim: true, now: () => 0 }, null);
      seq.reset(new Song(9));
      const band = ids.map((id) => makeInst(BY_ID[id], 3));
      seq.getInstruments = () => band;
      return { seq, band, role: (r) => band.find((i) => i.def.role === r) };
    };
    const styleBand = (st) => INSTRUMENTS.filter((d) => d.style === st).map((d) => d.id);
    // What a channel plays in a bar of the song, step by step, against that transform of its own part.
    const plays = (seq, inst, bar, tf) => {
      const part = partOf(inst), P = stepsOf(inst.def, part);
      for (let sib = 0; sib < 12; sib++) {
        assert.deepEqual(seq._notes(inst, seq.song.position(bar).arr, bar, sib, 6, false), TRANSFORMS[tf](part._byStep, P, bar, sib) ?? null, `${inst.def.id} bar ${bar} step ${sib}: not ${tf}`);
      }
    };

    check('grooves: 30 to 40, rows on the 16-step grid, every Beat bar hits step 0 on its main sound, every list 2 to 4 of them', () => {
      const ids = Object.keys(GROOVES);
      assert.ok(ids.length >= 30 && ids.length <= 40, `${ids.length} grooves`);
      for (const [id, G] of Object.entries(GROOVES)) for (const ch of ['beat', 'perc']) {
        const [K, S] = G[ch].map((r) => r.replace(/[\s|]/g, ''));
        assert.match(K + S, /^[Xxog.]*$/, `${id} ${ch}`);
        assert.ok(K.length && K.length % 16 === 0 && (S === '' || S.length === K.length), `${id} ${ch} rows ${K.length}/${S.length}`);
        if (ch === 'beat') for (let b = 0; b < K.length; b += 16) assert.ok('Xxog'.includes(K[b]), `${id} bar ${b / 16 + 1} has no step-0 hit`);
      }
      const lists = [...Object.values(STYLE_GROOVE), ...Object.values(CROSS_GROOVE)];
      assert.deepEqual(Object.keys(STYLE_GROOVE).sort(), styles.slice().sort());
      assert.deepEqual(Object.keys(CROSS_GROOVE).sort(), [...Object.values(GENRES.crossovers), 'Fusion'].sort());
      for (const l of lists) { assert.ok(l.length >= 2 && l.length <= 4, l.join()); for (const id of l) assert.ok(GROOVES[id], id); }
      assert.deepEqual([...new Set(lists.flat())].sort(), ids.slice().sort(), 'every groove is in a list');
    });
    check('as played on every level of every sound: a groove or a figure keeps each bar\'s damage per sound and length, and every note (sound, velocity, length) where the part never plays two at once; a Beat groove and a figure hit step 0; a groove plays only on its rows, sounds every hit of a row its sound has the notes for, and never leaves a half bar empty that the part and the rows fill', () => {
      const r6 = (x) => Math.round(x * 1e6) / 1e6;
      const dmg = (steps) => { const j = {}; for (const n of steps.flat()) { const k = `${n.k} ${n.d ?? 1}`; j[k] = r6((j[k] || 0) + (n.v ?? 1) * (n.w ?? 1)); } return j; };
      const notes = (steps) => steps.flat().map((n) => `${n.k} ${n.v} ${n.d ?? 1}`).sort();
      const on = (steps, lo) => steps.slice(lo, lo + 8).some((ns) => ns.length);
      for (const { d, inst, by, P } of parts(INSTRUMENTS.filter((x) => isDrum(x) || x.role === 'bass' || x.role === 'arp'))) {
        const stacks = by.some((ns) => ns?.length > 1), count = {};
        for (const n of by.flat()) if (n) count[n.k] = (count[n.k] || 0) + 1;
        const K = d.role === 'beat' ? 'kick' : Object.keys(count).sort((a, b) => count[b] - count[a])[0];
        for (const id of Object.keys(isDrum(d) ? GROOVES : FIGURES)) {
          const tf = (isDrum(d) ? 'g_' : 'f_') + id, rows = isDrum(d) && GROOVES[id][d.role].map((r) => r.replace(/[\s|]/g, ''));
          for (let bar = 0; bar < 4; bar++) {
            const at = `${d.id} L${inst.level} ${tf} bar ${bar}`, play = (t) => Array.from({ length: 16 }, (_, sib) => TRANSFORMS[t](by, P, bar, sib) || []);
            const T = play(tf), F = play('full');
            assert.deepEqual(dmg(T), dmg(F), at);
            if (!stacks) assert.deepEqual(notes(T), notes(F), `${at}: every note`);
            if (d.role !== 'perc') assert.ok(T[0].length, `${at}: no step-0 note`);
            if (!rows) continue;
            const hit = (r, sib) => !!r && r[(bar * 16 + sib) % r.length] !== '.', steps = [...Array(16).keys()];
            const ks = F.flat().filter((n) => n.k === K).length, ss = F.flat().length - ks, one = d.role === 'perc' && !ss;
            const kHit = (sib) => hit(rows[0], sib) || (one && hit(rows[1], sib)), sHit = (sib) => !one && hit(rows[1], sib);
            T.forEach((ns, sib) => assert.ok(!ns.length || kHit(sib) || hit(rows[1], sib), `${at}: a note off the rows on step ${sib}`));
            if (ks >= steps.filter(kHit).length) steps.filter((sib) => kHit(sib) && !sHit(sib)).forEach((sib) => assert.ok(T[sib].some((n) => n.k === K), `${at}: ${K} leaves step ${sib} silent`));
            if (ss && ss >= steps.filter(sHit).length) steps.filter(sHit).forEach((sib) => assert.ok(T[sib].some((n) => n.k !== K), `${at}: step ${sib} of the second row silent`));
            const G = steps.map((sib) => kHit(sib) || (ss > 0 && sHit(sib)));
            for (const lo of [0, 8]) assert.ok(on(T, lo) || !on(F, lo) || !G.slice(lo, lo + 8).some(Boolean), `${at}: steps ${lo}-${lo + 7} left empty`);
          }
        }
      }
    });
    check('a groove\'s accents are the part\'s loudest notes (no bar puts a loud note of a sound on an o or g hit and a soft one on an X); a figure sounds its chord tone on each of its hits, an octave up where the part played chord tone 3 or higher; a list\'s grooves differ, and Orchestra\'s play its Beat and Groove sounds differently at L2-L5', () => {
      const VEL = { X: 1, x: 0.8, o: 0.6, g: 0.4 }, row = (s) => [...s.replace(/[\s|]/g, '')].map((c) => VEL[c] || 0);
      const sounding = (by, P, tf, bar) => Array.from({ length: 16 }, (_, sib) => (TRANSFORMS[tf](by, P, bar, sib) || []).filter((n) => !n.mute));
      for (const { d, inst, by, P } of parts(INSTRUMENTS.filter(isDrum))) {
        const beat = by.some((ns) => ns?.some((x) => x.k === 'kick'));
        for (const [id, G] of Object.entries(GROOVES)) {
          const rows = (beat ? G.beat : G.perc).map(row), rv = (i) => Math.max(...rows.map((r) => (r.length ? r[i % r.length] : 0)));
          for (let bar = 0; bar < 4; bar++) {
            const loudWeak = new Set(), softX = new Set();
            sounding(by, P, 'g_' + id, bar).forEach((ns, sib) => ns.forEach((n) => {
              if ((n.v ?? 1) >= 0.9 && rv(bar * 16 + sib) <= 0.6) loudWeak.add(n.k);
              if ((n.v ?? 1) < 0.7 && rv(bar * 16 + sib) === 1) softX.add(n.k);
            }));
            for (const k of loudWeak) assert.ok(!softX.has(k), `${d.id} L${inst.level} g_${id} bar ${bar}: a loud ${k} on a weak hit, a soft one on an X`);
          }
        }
      }
      for (const { d, inst, by, P } of parts(INSTRUMENTS.filter((x) => x.role === 'bass' || x.role === 'arp'))) {
        if (by.some((ns) => ns?.some((n) => n.ct === undefined && n.sc === undefined))) continue;   // not a line of single pitches
        const per = (by.flat().filter(Boolean).length * 16) / P;
        for (const [id, F] of Object.entries(FIGURES)) {
          const few = (z) => Math.min(...Array.from({ length: z }, (_, b) => F.filter((n) => Math.floor((n.s * z) / 16) === b).length));
          const z = [1, 2, 4].reduce((a, c) => (Math.abs(Math.log(few(c) / per)) < Math.abs(Math.log(few(a) / per)) ? c : a));
          for (let bar = 0; bar < 4; bar++) sounding(by, P, 'f_' + id, bar).forEach((ns, sib) => {
            const f = F.find((n) => n.s === (bar % z) * (16 / z) + sib / z);
            if (sib % z || !f) return;
            for (const n of ns) assert.equal(n.ct, f.ct, `${d.id} L${inst.level} f_${id} bar ${bar} step ${sib}: not the figure's chord tone`);
          });
        }
        const T = sounding(by, P, 'f_alberti', 0).flat(), own = by.flat().filter(Boolean);
        assert.equal(T.filter((n) => n.o).length, own.filter((n) => (n.ct ?? 0) >= 3).length, `${d.id} L${inst.level}: the Alberti up an octave where the part played high`);
      }
      for (const l of [...Object.values(STYLE_GROOVE), ...Object.values(CROSS_GROOVE)]) for (const ch of ['beat', 'perc']) {
        assert.equal(new Set(l.map((id) => JSON.stringify(GROOVES[id][ch]))).size, l.length, `${l.join(', ')}: two play the same ${ch} rows`);
      }
      const pat = (by, P, tf) => Array.from({ length: 64 }, (_, i) => (TRANSFORMS[tf](by, P, i >> 4, i & 15) || []).map((n) => `${n.k}${n.v}${n.mute ? 'm' : ''}`).sort().join('+')).join(' ');
      for (const { d, inst, by, P } of parts(INSTRUMENTS.filter((x) => isDrum(x) && x.style === 'orchestra')).filter((p) => p.inst.level >= 2)) {
        const ps = STYLE_GROOVE.orchestra.map((id) => pat(by, P, 'g_' + id));
        assert.equal(new Set(ps).size, ps.length, `${d.id} L${inst.level}: two Orchestra grooves play the same notes`);
      }
    });
    check('the groove phrases (chorus I, chorus II, The Drop, every Finale rise) play the band\'s grooves in turn: a crossover\'s or Fusion\'s list over its top style\'s, the Beat\'s style on a tie; chorus II\'s Groove channel as hard as the doubled part it replaces; a remix keeps its part', () => {
      const at = [];
      let b0 = 0;
      for (const sec of SECTIONS) { CHART[sec.id].forEach((ph, i) => ph.tex.beat.tf === 'groove' && at.push(b0 + i * 8)); b0 += sec.bars; }
      assert.deepEqual(at, [72, 136, 208, 248]);
      for (const st of styles) {
        const { seq, role } = rig(styleBand(st));
        const L = STYLE_GROOVE[st];
        [...at, at[3] + 32, at[3] + 64].forEach((b, k) => { plays(seq, role('beat'), b + 2, 'g_' + L[k % L.length]); plays(seq, role('perc'), b + 2, 'g_' + L[k % L.length]); });
        plays(seq, role('bass'), at[0] + 2, 'full');
        seq.heard.groove = 0;
        for (let sib = 0; sib < 16; sib++) seq._notes(role('perc'), seq.song.position(at[0]).arr, at[0], sib, 6, true);
        assert.ok(seq.heard.groove > 0, `${st}: no groove heard`);
        const perc = partOf(role('perc')), P = stepsOf(role('perc').def, perc);
        const vel = (tf) => { let v = 0; for (let b = 0; b < 8; b++) for (let sib = 0; sib < 16; sib++) for (const n of TRANSFORMS[tf](perc._byStep, P, b, sib) || []) v += n.v ?? 1; return v; };
        seq._notes(role('perc'), seq.song.position(at[1]).arr, at[1], 0, 6, false);
        assert.ok(Math.abs(seq._w - (0.9 * vel('double')) / vel('full')) < 1e-9, `${st}: chorus II's Groove channel hits as hard as its doubled part, not ${seq._w}`);
        role('beat').remix = true;
        plays(seq, role('beat'), at[1] + 2, 'full');
        role('perc').remix = true;
        plays(seq, role('perc'), at[1] + 2, 'full');
        assert.equal(seq._w, 1, `${st}: a remixed Groove channel plays chorus II's groove phrase at its own weight`);
      }
      for (const [pair, name] of Object.entries(GENRES.crossovers)) {
        const [a, b] = pair.split('+');
        const { seq, role } = rig([...styleBand(a).slice(0, 3), ...styleBand(b).slice(3)]);
        plays(seq, role('beat'), at[0] + 2, 'g_' + CROSS_GROOVE[name][0]);
        plays(seq, role('perc'), at[1] + 2, 'g_' + CROSS_GROOVE[name][1]);
      }
      const fusion = rig(['kick808', 'shaker', 'tribass', 'supersaw', 'flute', 'chiparp']);
      plays(fusion.seq, fusion.role('beat'), at[0] + 2, 'g_' + CROSS_GROOVE.Fusion[0]);
      const tie = rig(['taiko', 'hats909', 'tribass', 'powerchords', 'horn']);
      plays(tie.seq, tie.role('perc'), at[0] + 2, 'g_' + STYLE_GROOVE.organic[0]);
    });
    check('a song\'s figures play only where the phrase has the channel full (a list in turn by phrase); the radio edit hears the song\'s groove turns', () => {
      const tune = { ...SONGS[0], fig: { verse1: { arp: 'alberti', bass: ['oompah', 'octave'] } } };
      const song = new Song(9, SECTIONS, tune), v1 = SECTIONS[0].bars;
      CHART.verse1.forEach((ph, p) => {
        const tex = song.position(v1 + p * 8).arr.tex;
        assert.equal(tex.arp.tf, ph.tex.arp.tf === 'full' ? 'f_alberti' : ph.tex.arp.tf, `verse1 phrase ${p} arp`);
        assert.equal(tex.bass.tf, ph.tex.bass.tf === 'full' ? ['f_oompah', 'f_octave'][p % 2] : ph.tex.bass.tf, `verse1 phrase ${p} bass`);
        assert.equal(tex.arp.w, ph.tex.arp.w);
      });
      assert.equal(new Song(9).position(v1 + 24).arr.tex.arp.tf, 'full', 'no figures without the song\'s');
      const edit = new Song(9, radioEdit(SECTIONS.map((s, index) => ({ index }))));
      let b = 0, grooves = 0;
      for (const s of edit.sections.slice(0, -1)) {
        const pos = edit.position(b), real = new Song(9).position(SECTIONS.slice(0, pos.index).reduce((n, x) => n + x.bars, 0) + (s.from || 0));
        assert.equal(pos.arr.groove, real.arr.groove, s.id);
        if (pos.arr.tex.beat.tf === 'groove') grooves++;
        b += s.bars;
      }
      assert.equal(grooves, 2, 'chorus II and the Finale excerpts groove');
    });
  }

  let failed = 0;
  for (const { name, fn } of checks) {
    try { await fn(); console.log(`ok    ${name}`); } catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.message.split('\n').join('\n      ')}`); }
  }
  console.log(`rules: ${checks.length - failed} of ${checks.length} ok${failed ? '  !! FAIL' : ''}`);
  process.exit(failed ? 1 : 0);
}

const { server, url } = await serve();
const browser = await launch();
const page = await browser.newPage({ ignoreHTTPSErrors: true });
page.setDefaultTimeout(timeout);
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) logs.push(m.text()); });   // web fonts offline: harmless
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));

if (args.includes('--replay')) {
  const query = args.find((a) => a.includes('=') && !a.startsWith('--')) || 'speed=12&bot=1&minutes=9';
  await page.goto(`${url}/index.html?sim=1&${query}`);
  await page.waitForFunction(() => window.__LS && window.__LS.done, null, { polling: 500 });
  const sum = await page.evaluate(() => { const g = window.__LS.game; return g.summary(g.state === 'victory'); });
  await browser.close();
  server.close();
  const { checkReplay } = await import('./audiocheck.js');
  const r = checkReplay(sum.sheet, sum.keyPc);
  console.log(`run: ${sum.won ? 'won' : `ended in ${sum.section}`}, key ${sum.key}, ${sum.sheet.length} sheet entries`);
  for (const k of ['full', 'stoppedEarly']) console.log(`${k.padEnd(12)} ${JSON.stringify(r[k])}`);
  const f = r.full;
  const bad = r.errors.length || logs.length || f.outOfKey || f.offGrid || f.wrongBand || f.outroLeaks || f.outroUnlifted || f.ended !== 1 || !f.clean || !r.stoppedEarly.clean
    || f.sections !== sum.sheet.length;
  if (r.errors.length || logs.length) console.log('ERRORS:\n' + [...r.errors, ...logs].slice(0, 20).join('\n'));
  if (bad) console.log('!! FAIL');
  process.exit(bad ? 1 : 0);
}

await page.goto(`${url}/tools/blank.html`);
let result;
try {
  result = await page.evaluate(async ({ role, mix, mixall, opts, remixAt, remixId }) => {
    const m = await import('/tools/audiocheck.js');
    const { INSTRUMENTS } = await import('/src/content/instruments/index.js');
    if (mix && remixAt !== null) {
      // Queue the remix on the render's sequencer as it starts, the way game.queueRemix does, and note where it lands.
      const { Sequencer } = await import('/src/music/sequencer.js');
      const start = Sequencer.prototype.start;
      let landed = null;
      Sequencer.prototype.start = function (t) {
        const band = this.getInstruments();
        const inst = band.find((i) => i.def.id === remixId) || band.find((i) => i.def.remix?.pattern) || band.find((i) => i.def.remix);
        if (inst) { inst.remix = false; this.remixAt = { inst, bar: remixAt, out: false }; this.onRemix = (x, bar) => { landed = { id: x.def.id, bar }; }; }
        return start.call(this, t);
      };
      const r = await m.checkMix(mix.split(','), opts);
      Sequencer.prototype.start = start;
      return [{ ...r, remixLanded: landed }];
    }
    if (mix) return [await m.checkMix(mix.split(','), opts)];
    if (mixall) {
      // One pure band per style, then two mixed bands that walk the styles across the channels (channel i takes
      // style i + shift), and the first mixed band again with every pedal at 3.
      const { ROLES, STYLES } = await import('/src/config.js');
      const styles = Object.keys(STYLES);
      const pick = (r, st) => INSTRUMENTS.find((d) => d.role === r && d.style === st);
      const byStyle = (st) => ROLES.map((r) => pick(r, st)).filter(Boolean).map((d) => d.id);
      const mixed = (shift) => ROLES.map((r, i) => pick(r, styles[(i + shift) % styles.length])).filter(Boolean).map((d) => d.id);
      const out = [];
      const { level, remix, pedals } = opts;
      for (const ids of [...styles.map(byStyle), mixed(0), mixed(2)]) out.push(await m.checkMix(ids, { level, remix, pedals }));
      out.push(await m.checkMix(mixed(0), { level, remix, pedals: { reverb: 3, delay: 3, overdrive: 3, compressor: 3, chorus: 3, wah: 3, bitcrusher: 3 } }));
      return out;
    }
    return m.checkAll({ roles: role ? [role] : null });
  }, { role, mix, mixall, opts, remixAt, remixId });
} catch (e) {
  logs.push(String(e));
}
await browser.close();
server.close();
let failed = false;
if (result) {
  for (const r of result) {
    const flags = [];
    if (r.error) flags.push(r.error);
    if (r.errors?.length) flags.push('ERRORS: ' + r.errors.join(' | '));
    if (r.nan) flags.push(`NaN x${r.nan}`);
    if (r.silent) flags.push('SILENT');
    if (r.clipSamples) flags.push(`clipped ${r.clipSamples} samples`);
    if (r.outOfKey) flags.push(`${r.outOfKey} notes out of key`);
    if (r.offGrid) flags.push(`${r.offGrid} notes off the grid`);
    if (r.errors?.length || r.nan || r.clipSamples || r.outOfKey || r.offGrid) failed = true;
    const name = r.id ? `${r.id} L${r.level}` : `MIX${r.remix ? ' REMIX' : ''} ${r.ids.join('+')}`;
    console.log(`${name.padEnd(mix || mixall ? 60 : 16)} peak ${String(r.peak).padEnd(5)} rms ${String(r.rmsDb).padStart(6)} dB  centroid ${String(r.centroidHz).padStart(5)} Hz  bands%(sub/low/mid/high/air) ${Object.values(r.bandsPct || {}).join('/')}${r.notes !== undefined ? `  notes ${r.notes}` : ''}${r.midiRange ? `  midi ${r.midiRange.join('-')}` : ''} ${flags.length ? ' !! ' + flags.join('; ') : ''}`);
    if (remixAt !== null) {
      if (r.remixLanded) console.log(`  remix ${r.remixLanded.id} lands on bar ${r.remixLanded.bar} (dropout on ${r.remixLanded.bar - 1})${r.remixLanded.bar !== remixAt ? `, moved from ${remixAt}` : ''}`);
      else { console.log(`  !! no remix landed (asked for bar ${remixAt})`); failed = true; }
    }
    const rx = r.remixLanded;
    if (perBar && r.perBar) {
      for (const b of r.perBar) console.log(`  ${String(b.bar).padStart(4)} ${b.section.padEnd(8)} ${String(b.barInSection).padStart(2)} ${(b.phrase || '').padEnd(3)} ${(b.cls || '').padEnd(5)} ${b.chord.padEnd(4)} notes ${String(b.notes).padStart(3)}  rms ${String(b.rmsDb).padStart(6)} dB  peak ${b.peak.toFixed(3)}  clip ${b.clip}  ~${String(b.brightHz).padStart(5)} Hz  ${[b.cue, rx && b.bar === rx.bar - 1 && 'dropout', rx && b.bar === rx.bar && 'REMIX'].filter(Boolean).join(' ')}`);
    }
  }
}
if (logs.length) { console.log('\nLOGS:\n' + logs.slice(0, 30).join('\n')); failed = true; }
if (failed) process.exitCode = 1;
