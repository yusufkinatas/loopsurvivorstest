# Instrument format

Every weapon in Loop Survivors is an instrument. An instrument is a plain object with a pattern per
level, a `sound()` that plays each note on the audio clock, and a `fire()` that turns the same note
into an attack at the moment it is heard. The reference implementation is
`src/content/instruments/beat.js` (808 Kick, Taiko Drums, 8-Bit Drums). Read it first.

There are five styles: `synth`, `organic` (shown as "Live"), `chip` (shown as "8-Bit"), `heavy` and
`orchestra`, and every channel has exactly one sound of each (30 in all). The first three live in the
role files (`beat.js`, `perc.js`, `bass.js`, `chords.js`, `lead.js`, `arp.js`), each default-exporting an
array of its Synth, Live and 8-Bit sounds. Heavy and Orchestra keep one file per instrument:

```
src/content/instruments/heavy/doublekick.js      export default { id: 'doublekick', role: 'beat', style: 'heavy', ... }
src/content/instruments/heavy/index.js           export default [doublekick, ride, dropd, powerchords, shred, pinch]
src/content/instruments/orchestra/timpani.js     ... and fieldsnare, cellos, strings, horn, harp
src/content/instruments/orchestra/index.js       export default [timpani, fieldsnare, cellos, strings, horn, harp]
```

Each file default-exports one definition and imports only what it needs, so a sound is written (or
replaced) without touching any other file. The registry (`index.js`) spreads both
arrays into `INSTRUMENTS`, validates every definition at load time, checks one sound per channel and
style and unique instrument and remix ids, and logs problems with `console.error` (which fails the sims).

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
  style: 'organic',         // synth | organic | chip | heavy | orchestra
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
  remix: { id, name, pedal, text, stats, pattern, steps, fire, setup, update },   // its remix (see Remix below)
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
  - `tone(ctx, out, t, { freq, wave|duty, dur, a, d, s, r, gain, unison, spread, detune, filter, pitchEnv, vibrato, sub, pan, drive })`
  - `noise(ctx, out, t, { dur, a, d, s, r, gain, filter, pan, rate, chip })`
  - `kick(ctx, out, t, { f0, f1, pitchDecay, decay, gain, click })`
  - `fm(ctx, out, t, { freq, ratio, index, indexDecay, a, d, s, r, dur, gain, pan })`
  - `pluck(ctx, out, t, { freq, decay, bright, dur, gain, pan, filter, drive })` (Karplus-Strong string)
  - `drive: k` (tone and pluck) runs the oscillators or the string through a `tanh(kx)/tanh(k)` soft clipper
    before the note's gain, so `gain` still sets the level (about 1.5 warm, 3 crunchy, 6 fuzz). A tone's `sub`
    stays clean. Distortion raises the RMS (a driven tone about +2 to +3 dB, a driven pluck far more, since its
    string no longer dies away), and a filter after it can ring a little over `gain`: check the level and the
    centroid with `check.mjs --role`. The curve is cached per `k`.
  - `snare(ctx, out, t, opts)`, `hat(ctx, out, t, opts)`
  - `filter` is `{ type, freq, q, env, decay }` (starts at `freq * env`, falls to `freq` over `decay`)
    or `{ type, freq, to, time }` (sweeps from `freq` to `to`).
  - `duty` (0.125 / 0.25 / 0.5) gives band-limited pulse waves for 8-Bit sounds. `chip: n` on noise gives stepped console noise.
- `A.duck(t, amount, release)` side-chain the melodic channels. Only the beat channel should call it.
- `A.pedals` current pedal levels, if you want to react (optional).

Keep voices cheap: a few oscillators per note, short releases. Pads can sustain with `dur`.

### fire(g, note, st, inst)

Runs when the note is heard (sim and real). Spawn attacks with the game API. Always compute damage
with `g.dmg(base)` (applies pedals, faders and echo scaling), areas with `g.area(r)` (pedals and the Live
rule), counts with `g.amount(n)` (adds the Chorus pedal), projectile speed with `g.speed(v)`. Scale by
`note.v`. Use `g.color(inst)` (or `g.color('bass')`) so attacks wear the channel color. The band's play
rules (below) are applied to every hit in `g.hit()`, so an attack never multiplies them in itself.

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
- `g.fx.cone({ x, y, angle, spread, r, damage, kb, stun, slow, color, max })` instant hit in a wedge (`spread` in radians,
  default 70°), knockback away from the apex, drawn as a wedge flash. Aim it with `g.aim()` to steer it with movement.
- `g.fx.wall({ follow, x, y, r, angle, span, spin, dur, damage, kb, stun, slow, width, color, erase, onErase })` a persistent
  arc (`span` radians, default 120°) at radius `r` around a spot or around the player (`follow: true`), turning `spin`
  rad/s, for `dur` seconds. Each enemy that touches it is hit once and bounced back to the side it came from, and
  enemy shots crossing it are erased (`erase: false` lets them through; `onErase(wall, shot, g)` runs for each one and
  `wall.erased` counts them). At most 2 walls per instrument (the oldest goes).
- `g.fx.tether(inst.def.id, enemy, { life, pull, color })` hooks an enemy with a crackling line and drags it toward the
  player at `pull` px/s (bosses and charging enemies are hooked but never dragged); hooking it again refreshes it.
  `g.fx.pulseTethers(inst.def.id, { damage, kb, stun, slow, color })` hits everything hooked, `g.fx.tethersOf(id)` lists
  them. At most 8 per instrument (the oldest lets go).
- `g.fx.followers(inst, { count, gap, size, color, shape })` a trail of up to 12 followers walking the player's path
  `gap` px apart (call from `setup`), then `grp.strike({ damage, r, kb, stun, slow, index, color })`; `grp.items` are
  their positions, `g.fx.followersOf(inst)` finds the group.
- `g.fx.mine({ ..., persist: true })` a mine that is never used up: `g.fx.ringMines(inst.def.id, { damage, r, scale })`
  makes every one of them pulse where it stands, and `detonateMines` leaves them alone. Keep `life` and `max` set.
- `bullet({ ..., grow, maxR })` widens the shot by `grow` px/s while it flies (up to `maxR`, default 60).
- cosmetics: `g.fx.particles(x, y, color, n, speed, life, size)`, `g.fx.flash(x, y, r, color, life, fill)`, `g.shake = Math.max(g.shake, n)`.
  Cosmetic randomness uses `Math.random()`, never `rng()` or `rand()`, so a seed plays the same run at any frame rate.

The persistent archetypes (orbiters, mines, walls, tethers, followers, a shield) belong to the instrument that
made them and are cleared with it when it leaves the band. Every one records its source for damage credit.

Direct damage: `g.hit(enemy, damage, { kb, fx, fy, stun, slow, color })`. The enemy tints in the hitting
channel's color, and `color` overrides it. An enemy marked with `e.vuln` until `e.vulnUntil` (game time)
takes `1 + e.vuln` times the damage from every source. Drop meter: `g.chargeDrop(n)`.

Crowd control and defense:

- `g.pull(x, y, r, strength)` pulls every enemy within `r` toward the point (an impulse on its knockback, never past
  the point; bosses and charging enemies hold). Returns how many moved.
- `g.launch(enemy, angle, speed, damage, { t, max, onLand })` sends an enemy flying for `t` seconds (default 0.35). It
  hits every other enemy it crashes into once for `damage` (at most `max`, default 8) and deals no contact damage
  while in the air. One generation: what it hits is not launched. Bosses, charging enemies and enemies already in
  flight cannot be launched (returns false). `onLand(enemy, g)` runs where it stops.
- `g.shield = { n, until, src: inst, onBreak }` blocks the next `n` hits (at most 3) until game time `until`; each
  block gives the usual invulnerability and pushes the body away, and `onBreak(g, shield)` runs when the last charge
  goes. Set it from `fire()` with `until: g.time + seconds`, and only when `g.dmgScale === 1` (an echo must not raise a
  shield).

### Play rules (style chemistry)

A style is also a way to move. Two, four and six sounds of one style turn its rule up for the whole band
(`CHEMISTRY` in `src/game/loadout.js`, tier values are totals; distances in `RULES`):

| Style | Rule | What it rewards | Tiers 2 / 4 / 6 |
|---|---|---|---|
| Synth | Long throw (`far`) | hits on enemies whose body is beyond 240 px | +20 / 40 / 65% damage |
| Heavy | Mosh pit (`near`) | hits on enemies reaching inside 140 px | +20 / 40 / 65% damage |
| Live | In the pocket (`still`) | planted: moved under 24 px since the last beat | +12 / 24 / 40% area, heal 0.5 / 1 / 1.5 a planted beat after a bar without a hit |
| 8-Bit | Combo streak (`combo`) | every beat without a hit (up to 16), reset by a hit | up to +25 / 50 / 80% damage |
| Orchestra | Ride the swell (`swell`) | late in each 8-bar phrase (weak right after a fill, strong at the next) | x(1 ± 25 / 50 / 80%), mean 1 |

`g.stats.rules` holds the totals (`far, near, stillHeal, stillArea, combo, swell`, and `on`), `g.rules` the live
state (`combo, planted, phrase, lastBeatX, lastBeatY`), and `g.lastHurtAt` the time of the last hit taken.
An instrument may read them (an Orchestra sound that saves its big hit for `g.rules.phrase` near 1), but never
multiplies its damage by them: `g.hit()` already does. Fusion (2+ sounds in three styles) is a genre name only.

Every attack must be launched from `fire()` by a note. Never deal damage on a timer that is not a
note. Persistent things (orbiters, mines) may exist between notes, but they strike on notes.

## Remix

Every instrument has one remix: a new part for its channel, a new timbre and a bigger attack. It is earned,
never dealt on a level-up. A non-final boss silenced inside its own section drops a **Master Tape** where it
fell (at most three a run, `BALANCE.remix`). The tape lies 8 bars, blinks through its last 2 s and is never
pulled in by magnets or the boss's pull-all, so you walk into the fight to get it; the boss bar's thin clock
line shows how many bars of its section are left. A tape spends on a channel at level 5 that is not remixed yet:

- none ready: it is banked (a gold reel by the mixer) and spent the moment a channel reaches level 5;
- one ready: that remix is queued;
- two or more: the run pauses on gold remix cards (name, glyph in a vinyl, the remix's step lane, auditioned on
  hover or hold; no reroll, banish or skip). The pick is queued.

The paired pedal is not a requirement any more. It is what opens up on the channel's strip once the remix lands.

**The moment.** A queued remix lands on the first 4-bar line at least two bars ahead that is not a stop bar,
the player's Drop (its build or impact), a Build-Up roll bar, an arrangement impact or a breakdown's first bar
(`Sequencer.remixBar`; else the next line). The bar before it the channel drops out while a riser plays. On
the downbeat `inst.remix` flips before that step's notes are scheduled, so the first thing heard is the
remix's own part, with an impact as the downbeat's one hit. The game answers when it is heard: a gold ring
(about half a Drop's damage, 520 px, knockback and stun, enemy shots inside it erased, a boss inside it knocked
off the beat), a gold flash, the remix's name as a gold banner and the strip turning gold. One remix is queued
at a time; a second lands on the next free line. A pause or a card screen during the dropout holds the song
(bars do not advance), and card screens wait for a remix that is dropping out to land. A stop or a Drop that
lands on the dropout or the downbeat after it was queued moves the remix to the next free line.

```js
remix: {
  id: 'canon',              // unique, lowercase, stable (the career stores it)
  name: 'Canon',            // shown on the card, the banner, the HUD strip and the end screen
  pedal: 'delay',           // opens up on this channel's strip once remixed: one the desk routes here (see 3)
  text: 'What the remix does, in one short sentence.',
  sound: 'optional: what you hear, for the card\'s info layer',
  stats: { canon: 0.6 },    // only what changes: merged over level 5's stats at load
  pattern: [...notes],      // the remix's own part, played instead of level 5's from the remix bar on (see 1)
  steps: 32,                // optional: its length, when it differs from the instrument's `steps`
  fire(g, note, st, inst) {},     // optional, replaces fire()
  setup(g, st, inst) {},          // optional, replaces setup()
  update(g, dt, st, inst) {},     // optional, replaces update()
}
```

1. **A new part.** `remix.pattern` (over `remix.steps`, else the instrument's `steps`) is what the channel plays
   from the remix's downbeat on; a listener notices it within one bar. The registry indexes and validates it like
   a level's pattern (in key, on the grid), and on the Beat channel its first sound that is not a kick plays the
   fills. A remixed channel never goes fully out in the arrangement (it plays 'sparse'), and it takes the solo
   phrases first. Without a pattern the level 5 part keeps playing, and the moment lands on nothing new.
2. **A new timbre.** `sound()` reads `inst.remix` for the remix's own voice (a different wave, drive, an octave,
   a strip-level signature such as Sidechain 808's deeper duck). Every kind the remix part plays must fire with
   the remix's stats.
3. **You hear the pedal.** The paired pedal is one the desk already routes to the channel: inserts
   (Bitcrusher on Beat and Groove, Overdrive on Bass and Lead, Auto-Wah on Bass and Chords, Chorus on
   Chords and Lead) or sends (Hall Reverb on every channel, Tape Delay on Groove, Chords, Lead and
   Sparkle). `audio.applyPedals(levels, boost)` runs it at level 3 on the remixed strip only, with the
   settings a level 3 pedal already uses. The Compressor lives on the bus, so its two remixes carry their
   own signature: Sidechain 808 ducks the mix deeper on the downbeat, and a Compressor-boosted melodic
   strip (Soul Keys) pumps hard under every kick.
4. **A bigger, different attack.** Replace `fire()`: it runs with `this` = the definition, so
   `this.fire(g, note, st, inst)` plays the level 5 attack first. Or add a stat that the level 5 `fire()`
   reads as an option (`st.erase`, `st.split`, `st.curve`). Where it fits, the attack reads your movement:
   `g.aim()` (facing), `g.player.vx`/`vy`, where you stood a beat ago. Target about 1.6x to 2.0x its level 5
   damage on The Drone in `tools/parity.mjs`. The remix's `fire`, `setup` and `update` take over from the remix
   bar on: `setup` runs as the flip is scheduled (a fraction of a beat before the downbeat is heard), so
   `update` never runs without it.
5. **Safe on any note.** Beat fills and rolls add notes, and Tape Delay echoes call `fire()` again with
   `g.dmgScale` below 1. Assume nothing about steps beyond what the remix pattern guarantees, and check
   `g.dmgScale === 1` before scheduling a delayed part or spawning anything that stays (walls, followers,
   shields, tethers), so an echo does not echo.
6. **Delayed parts land on the grid.** Push them onto `g.later` at whole 16th steps of game time
   (`{ at: g.time + k * STEP_SEC, fn }`), the way Tape Delay echoes do, so a pause holds them too. In `fn`,
   return if `!g.loadout.has(inst)`, and set `g.src = inst` around the attack (or call
   `g.fireNote(inst, note, scale)`).

Hearing a remix arrive: `node tools/check.mjs --mix kick808,subbass,supersaw --start 92 --bars 8 --remixAt 96
--remixId subbass` renders the band bar by bar with that remix queued on bar 96 (the dropout on 95). In a sim,
`tapes=N` starts a run with N tapes banked, and `--summary` prints `tapes` and `remixLog` (each remix's bar).

## Balance targets

The quick way: `tools/parity.mjs` runs every sound you name alone at level 1, at level 5, and remixed next to
level 5 with the same pedal, and prints one table of damage, kills and damage on The Drone, flagging anything
outside its channel's band (measured from that channel's Synth, Live and 8-Bit sounds, `BANDS` in the tool) or a
remix no better than its level 5 (about 6 s a run, two at once):

```
node tools/parity.mjs --style heavy              # the six Heavy sounds (24 runs, about 2 minutes)
node tools/parity.mjs --ids doublekick,kick808   # a sound next to a reference
node tools/parity.mjs --role beat --no-remix     # a whole channel, levels only
```

Each number comes from the solo sim (no level-ups, invincible, autopilot, 3 minutes, seed 7):

```
node tools/sim.mjs "speed=16&bot=1&minutes=3&god=1&solo=1&start=<id>&give=<id>:<level>&seed=7" --summary
```

The reference beat instruments (808 Kick, Taiko, 8-Bit Drums) deal roughly 6k to 14k total damage at
level 1 and 22k to 32k at level 5. Land in that band. Each role has a flavor: `perc` is many small hits, `bass` heavy and
close, `chords` wide area and support, `lead` precise long-range, `arp` many glittery extras.
A support effect (slow, stun, heal, knockback) can justify lower damage.

Every sound should also hurt bosses. Sounds that aim somewhere other than at the nearest enemy (around you,
on a grid, at a crowd, along your facing) send the bar's first hit (step 0) at a boss in range with
`g.bossInRange`, a visible rule instead of a hidden boss multiplier. Solo at level 5 against The Drone, every sound lands 1.9k to 2.1k damage in its chorus.

A remix is compared with its level 5, paired pedal at 3 on both sides, by adding `remix=<id>`:

```
node tools/sim.mjs "speed=16&bot=1&minutes=2.2&god=1&solo=1&start=<id>&give=<id>:5&pedals=<pedal>:3&remix=<id>&seed=7" --summary
```

The spawn supply runs out before the strongest sounds do, so read kills and the boss
(The Drone arrives at 96 s) as well as damage. `node tools/check.mjs --mixall --remix` checks the
remixed bands through the desk.

## Checking your work

```
node tools/check.mjs --role <role>             # levels, clipping, spectrum for each instrument level
node tools/check.mjs --mix a,b,c --level 5     # a band through the full mixing desk
node tools/check.mjs --mix a,b,c --start 140 --bars 56   # the same, bar by bar, through the arrangement
node tools/check.mjs --audit                   # every note of the song in every key: in key, on the grid
node tools/check.mjs --mixall                  # one pure band per style and two mixed bands through the desk
node tools/parity.mjs --ids <id>               # damage, kills and Drone damage at L1, L5 and remixed, against the band
node tools/sim.mjs "<query>" --summary         # gameplay, errors, damage
```

Sims that play the style rules use the bot's rule-aware movement; add `botrules=0` to the query to see the same
band with the plain kiting bot.

The sim output includes `errors` and `logs`. Both must be empty (the font-loading network error in
headless runs is expected and harmless).
