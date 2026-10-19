# Instrument format

Every weapon in Loop Survivors is an instrument. An instrument is a plain object with a pattern per
level, a `sound()` that plays each note on the audio clock, and a `fire()` that turns the same note
into an attack at the moment it is heard. The reference implementation is
`src/content/instruments/beat.js` (808 Kick, Taiko Drums, 8-Bit Drums). Read it first.

Each role file (`beat.js`, `perc.js`, `bass.js`, `chords.js`, `lead.js`, `arp.js`) default-exports an
array of exactly three instruments, one per style: `synth`, `organic` (shown as "Live") and `chip`
(shown as "8-Bit"). The registry (`index.js`) validates them at load time and logs problems with
`console.error`.

## Why the music stays clean

These rules are what make the game's promise work: whatever the player picks sounds good.

1. **One instrument per channel.** Each role owns a frequency range and a rhythmic job. Stay in yours.
2. **Pitches are never absolute.** Patterns ask for chord tones or scale steps. The sequencer resolves
   them against the current chord of the current key, so every note is in key on every chord change.
3. **Everything is on the 16th-note grid.** Patterns are step indexes, so all channels interlock.
4. **The desk mixes for you.** Each channel has its own fader, pan, side-chain duck under the kick,
   reverb and delay sends, and the bus has a compressor and limiter. Your job is to hit the target
   loudness at the channel input, not to be loud.

### Role guide

| Role | Register (MIDI) | Rhythmic job | Target raw RMS | Spectrum (check.mjs centroid) |
|---|---|---|---|---|
| `beat` | unpitched, low | quarters, backbeat, a few syncopations | -16 to -21 dB | < 1200 Hz |
| `perc` | unpitched, high | 8ths and 16ths, off-beats, ghost notes | -22 to -30 dB | > 3500 Hz, mostly high/air |
| `bass` | 28 to 50 | roots and fifths locking with the kick, syncopated | -16 to -22 dB | 70 to 300 Hz |
| `chords` | 52 to 76 | stabs on off-beats, or sustained pads | -18 to -25 dB | 400 to 1800 Hz |
| `lead` | 62 to 86 | a melody with space in it, usually a 2-bar (32 step) phrase | -18 to -25 dB | 700 to 3000 Hz |
| `arp` | 70 to 98 | fast arpeggios or sparkly figures, 16ths | -20 to -27 dB | 1500 to 6000 Hz |

Peak at the channel input must stay below 0.98 (check.mjs flags clipping). No NaN, no silence.

## Definition

```js
{
  id: 'upright',            // unique, lowercase
  name: 'Upright Bass',     // shown on cards and HUD
  role: 'bass',             // beat | perc | bass | chords | lead | arp
  style: 'organic',         // synth | organic | chip
  blurb: 'One sentence a non-musician understands: what it sounds like and what it does.',
  steps: 16,                // pattern length: 16 (one bar) or 32 (two bars)
  low: 33,                  // pitched roles: lowest MIDI for chord-tone / scale lookups
  center: 62,               // chords: where voicings are centered
  seventh: false,           // chords/arps: include the diatonic 7th in chord tones
  levels: [                 // exactly 5 entries, level 1 first
    { text: 'What this level adds, in plain words.', pattern: [...notes], stats: { ...numbers fire() reads } },
  ],
  sound(A, t, note, out, inst) {},   // schedule audio (see below)
  fire(g, note, st, inst) {},        // spawn the attack (see below)
  setup(g, st, inst) {},             // optional: on add, level change or stat change (orbiters)
  update(g, dt, st, inst) {},        // optional: every frame while playing
  dispose(g, inst) {},               // optional: when swapped out (owned effects are cleared for you)
  remix: { id, name, pedal, text, stats, fire, setup, update },   // its remix (see Remix below)
}
```

`levels[i].stats` holds the totals at that level, never deltas. `levels[i].text` describes what that
level adds, written for someone who knows nothing about music ("Adds a clap on the backbeat that
throws a ring of shards.").

### Pattern notes

A note is `{ s, v, k, ct | sc | chord, o, d }`:

- `s` step index, `0` to `steps - 1`. Step 0 is the downbeat, 4 / 8 / 12 are beats 2 / 3 / 4.
- `v` velocity 0..1 (default 1). Scale damage and loudness by it.
- `k` optional kind string for unpitched or multi-sound instruments (`'kick'`, `'snare'`, `'open'`).
- Pitch, pick one: `ct: n` the n-th chord tone counting up from the chord root at or above `low`
  (0 root, 1 third, 2 fifth, 3 next root, negative goes down); `sc: n` the n-th scale step from the
  chord root (0 root, 2 third, 4 fifth, 7 octave); `chord: n` an n-note voice-led voicing near `center`.
- `o` octave shift for this note (added to `low` / `center`).
- `d` duration in steps (default 1). Arrives as `note.dur` in seconds.

Levels should build: each level keeps the previous pattern and adds to it (the card preview marks
added steps). Level 5 is the full part.

### Fills, rolls and rests

The song's arrangement (`src/music/song.js`) changes some bars. Every 8th bar the Beat channel plays
a fill on steps 12-15, and in the Build-Up it rolls into The Drop. Fills and rolls use the level's own
fill sound: the first note in its pattern whose `k` is not `'kick'` (808 clap, Taiko rim, 8-Bit snare),
else the kick. So **every kind a Beat level plays must fire with that level's stats**. Channels can
also rest (the Bridge breakdown) or stop short after a boss goes down. A resting note is neither heard
nor fired, so attacks always match the music.

### The resolved note

`sound()` and `fire()` receive:

```js
note = { time, s, v, k, dur, midi, freq, midis, freqs, pc, chord, bar }
```

`midi`/`freq` are null/0 for unpitched notes. `midis`/`freqs` are set for `chord:` notes.
`pc` is the pitch class (0..11). `chord.name` is e.g. `'Am'`.

### sound(A, t, note, out, inst)

Runs only when audio is on (never in the headless sim). Schedule everything at time `t` into `out`
(the channel input). Never schedule before `t`. `A` provides:

- `A.ctx` the AudioContext
- `A.v` voice helpers from `src/audio/voices.js`, each schedules one self-cleaning note:
  - `tone(ctx, out, t, { freq, wave|duty, dur, a, d, s, r, gain, unison, spread, detune, filter, pitchEnv, vibrato, sub, pan })`
  - `noise(ctx, out, t, { dur, a, d, s, r, gain, filter, pan, rate, chip })`
  - `kick(ctx, out, t, { f0, f1, pitchDecay, decay, gain, click })`
  - `fm(ctx, out, t, { freq, ratio, index, indexDecay, a, d, s, r, dur, gain, pan })`
  - `pluck(ctx, out, t, { freq, decay, bright, dur, gain, pan, filter })` (Karplus-Strong string)
  - `snare(ctx, out, t, opts)`, `hat(ctx, out, t, opts)`
  - `filter` is `{ type, freq, q, env, decay }` (starts at `freq * env`, falls to `freq` over `decay`)
    or `{ type, freq, to, time }` (sweeps from `freq` to `to`).
  - `duty` (0.125 / 0.25 / 0.5) gives band-limited pulse waves for 8-Bit sounds. `chip: n` on noise gives stepped console noise.
- `A.duck(t, amount, release)` side-chain the melodic channels. Only the beat channel should call it.
- `A.pedals` current pedal levels, if you want to react (optional).

Keep voices cheap: a few oscillators per note, short releases. Pads can sustain with `dur`.

### fire(g, note, st, inst)

Runs when the note is heard (sim and real). Spawn attacks with the game API. Always compute damage
with `g.dmg(base)` (applies pedals, chemistry and echo scaling), areas with `g.area(r)`, counts with
`g.amount(n)` (adds the Chorus pedal and 8-Bit bonus), projectile speed with `g.speed(v)`. Scale by
`note.v`. Use `g.color(inst)` (or `g.color('bass')`) so attacks wear the channel color.

Queries: `g.player` `{x, y, faceX, faceY}`, `g.aim()` facing angle, `g.nearest(x, y, range, excludeSet)`,
`g.nearestN(x, y, n, range)`, `g.inRadius(x, y, r)`, `g.randomEnemy(x, y, range)`, `g.densest(range)`
→ `{x, y, enemy, count}` or null, `g.bossInRange(x, y, range)` → the boss or null, `g.time`, `g.stats`.

Attack archetypes (`src/game/effects.js`), all record which instrument made them:

- `g.fx.bullet({ x, y, angle, speed, r, damage, pierce, life, color, shape, homing, bounce, boomerang, kb, stun, slow, drag, trail, spin, range, curve, onHit, onReturn })`
  shapes: `dot note square star seed shard coin diamond ring`. `curve` turns the shot (rad/s), `onHit(b, enemy, g)`
  runs on every hit, and `onReturn(b, g)` runs when a boomerang gets home (return true to keep it flying).
- `g.fx.ring({ x, y, follow, r0, r1, dur, damage, kb, stun, slow, width, color, yoyo, erase })` expanding shockwave.
  `yoyo` goes out to `r1` and back, hitting again on the way back. `erase` wipes out enemy shots inside that share of its radius while it moves.
- `g.fx.pulse({ x, y, r, damage, kb, stun, slow, color, max })` instant area hit with a flash
- `g.fx.beam({ x, y, angle, length, width, damage, kb, color, pierce, onHit })` instant line
- `g.fx.zap({ x, y, target, range, chain, chainRange, damage, falloff, color, onHit })` chain lightning
- `g.fx.strike({ x, y, delay, r, damage, kb, stun, color, target, style, onLand })` delayed impact with a marker (`style: 'drop' | 'star' | 'ring'`)
- `g.fx.mine({ owner: inst.def.id, x, y, r, damage, kb, color, life, max, size })` then `g.fx.detonateMines(inst.def.id, scale, { armed, chain })`
  on a later note (`armed`: only mines with an enemy on them, `chain`: a blast sets off the other mines inside it)
- `g.fx.orbit(inst, { count, radius, speed, size, color, shape })` persistent orbiters (call from `setup`), then `grp.pulse({ damage, r, kb, stun, slow, index })` from `fire`
- cosmetics: `g.fx.particles(x, y, color, n, speed, life, size)`, `g.fx.flash(x, y, r, color, life, fill)`, `g.shake = Math.max(g.shake, n)`.
  Cosmetic randomness uses `Math.random()`, never `rng()` or `rand()`, so a seed plays the same run at any frame rate.

Direct damage: `g.hit(enemy, damage, { kb, fx, fy, stun, slow, color })`. The enemy tints in the hitting
channel's color, and `color` overrides it. An enemy marked with `e.vuln` until `e.vulnUntil` (game time)
takes `1 + e.vuln` times the damage from every source. Drop meter: `g.chargeDrop(n)`.

Every attack must be launched from `fire()` by a note. Never deal damage on a timer that is not a
note. Persistent things (orbiters, mines) may exist between notes, but they strike on notes.

## Remix

Every instrument has one remix: a new attack for its finished part. It is ready once the instrument is
at level 5 and its paired pedal is on the board at any level, and the next level-up always shows it as a
gold card. Taking it keeps the instrument at level 5 for the rest of the run. The channel gets no more
swap cards, the HUD strip shows the remix name with gold pips, and the end screen lists the remix name.

```js
remix: {
  id: 'canon',              // unique, lowercase
  name: 'Canon',            // shown on the card, the HUD strip and the end screen
  pedal: 'delay',           // the paired pedal: one the desk already puts on this channel (see 2)
  text: 'What the remix does, in one or two plain sentences.',
  sound: 'optional: what you hear, for a pedal with no insert on this strip',
  stats: { canon: 0.6 },    // only what changes: merged over level 5's stats at load
  fire(g, note, st, inst) {},     // optional, replaces fire()
  setup(g, st, inst) {},          // optional, replaces setup()
  update(g, dt, st, inst) {},     // optional, replaces update()
}
```

1. **The pattern and `sound()` stay level 5.** The sequencer plays the level 5 part, so the music and
   check.mjs results do not change. `sound()` may read `inst.remix` for a strip-level signature
   (Sidechain 808's deeper duck), never to add or move notes.
2. **You hear the remix.** The paired pedal is one the desk already routes to the channel: inserts
   (Bitcrusher on Beat and Groove, Overdrive on Bass and Lead, Auto-Wah on Bass and Chords, Chorus on
   Chords and Lead) or sends (Hall Reverb on every channel, Tape Delay on Groove, Chords, Lead and
   Sparkle). `audio.applyPedals(levels, boost)` runs it at level 3 on the remixed strip only, with the
   settings a level 3 pedal already uses. The Compressor lives on the bus, so its two remixes carry their
   own signature: Sidechain 808 ducks the mix deeper on the downbeat, and a Compressor-boosted melodic
   strip (Soul Keys) pumps hard under every kick.
3. **Two ways to write the attack.** Replace `fire()`: it runs with `this` = the definition, so
   `this.fire(g, note, st, inst)` plays the level 5 attack first. Or add a stat that the level 5
   `fire()` reads as an option (`st.erase`, `st.split`, `st.curve`). No level sets those stats.
4. **Safe on any note.** Beat fills and rolls add notes, and Tape Delay echoes call `fire()` again with
   `g.dmgScale` below 1. Assume nothing about steps beyond what the level 5 pattern guarantees, and check
   `g.dmgScale === 1` before scheduling a delayed part, so an echo does not echo.
5. **Delayed parts land on the grid.** Push them onto `g.later` at whole 16th steps of game time
   (`{ at: g.time + k * STEP_SEC, fn }`), the way Tape Delay echoes do, so a pause holds them too. In `fn`,
   return if `!g.loadout.has(inst)`, and set `g.src = inst` around the attack (or call
   `g.fireNote(inst, note, scale)`).
6. **Stronger than level 5.** A remix beats its level 5 on crowds or on a single target, or gives the
   band a clear defensive or Drop role, measured with the paired pedal at 3 on both sides (see below).

## Balance targets

Measured with the solo sim (no level-ups, invincible, autopilot, 3 minutes, seed 7):

```
node tools/sim.mjs "speed=16&bot=1&minutes=3&god=1&solo=1&start=<id>&give=<id>:<level>&seed=7" --summary
```

The reference beat instruments (808 Kick, Taiko, 8-Bit Drums) deal roughly 6k to 14k total damage at
level 1 and 22k to 32k at level 5. Land in that band. Each role has a flavor: `perc` is many small hits, `bass` heavy and
close, `chords` wide area and support, `lead` precise long-range, `arp` many glittery extras.
A support effect (slow, stun, heal, knockback) can justify lower damage.

Every sound should also hurt bosses. Sounds that pick a crowd or a random enemy (Taiko, Music Box, 8-Bit
Drums) send the bar's first hit (step 0) at a boss in range with `g.bossInRange`, a visible rule instead of a
hidden boss multiplier. Solo at level 5 against The Drone, every sound lands 1.9k to 2.1k damage in its chorus.

A remix is compared with its level 5, paired pedal at 3 on both sides, by adding `remix=<id>`:

```
node tools/sim.mjs "speed=16&bot=1&minutes=2.2&god=1&solo=1&start=<id>&give=<id>:5&pedals=<pedal>:3&remix=<id>&seed=7" --summary
```

At density 1 the spawn supply runs out before the strongest sounds do, so read kills and the boss
(The Drone arrives at 96 s) as well as damage. `node tools/check.mjs --mixall --remix` checks the
remixed bands through the desk.

## Checking your work

```
node tools/check.mjs --role <role>             # levels, clipping, spectrum for each instrument level
node tools/check.mjs --mix a,b,c --level 5     # a band through the full mixing desk
node tools/check.mjs --mix a,b,c --start 140 --bars 56   # the same, bar by bar, through the arrangement
node tools/check.mjs --audit                   # every note of the song in every key: in key, on the grid
node tools/sim.mjs "<query>" --summary         # gameplay, errors, damage
```

The sim output includes `errors` and `logs`. Both must be empty (the font-loading network error in
headless runs is expected and harmless).
