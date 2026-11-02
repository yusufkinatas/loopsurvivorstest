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

  // Lane 3: pedals and Signature

  // Lane 6: grooves and figures

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
