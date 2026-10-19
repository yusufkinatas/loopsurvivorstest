# Loop Survivors

A survival action game where your weapons are sounds. Waves of noise close in, your instruments
attack on their own, and every attack is a note. Fighting and making music are the same action: the
run starts with a single sound and, if you survive, ends as a full song.

**Play:** open `dist/loop-survivors.html` in a browser (it is one self-contained file), or run the dev
server below. Sound on, headphones help.

## How it plays

- **Move** with WASD or the arrow keys, drag on a touch screen, or use a gamepad. Moving is all you steer.
- **Your instruments fight for you.** Each one plays a pattern locked to the beat, and each note it
  plays launches its attack at the exact moment you hear it.
- **Level up** by collecting the notes the noise drops. Pick one of three cards: a new sound, a
  stronger version of one you have, a swap to a different style, or an effect pedal. Hover (or press
  and hold) a card to hear it in your mix before you choose. You can also reroll the cards, banish a
  sound or pedal for the rest of the run (three times), or skip the level to fill the Drop meter.
- **Remix.** An instrument at level 5 with its paired pedal on your board (Canon is Wooden Flute plus
  Tape Delay) can be remixed: the same part, a new attack, and that pedal opened up on its channel.
- **The Drop.** Collected notes fill the Drop meter. Press Space when it is full: the music builds for
  one bar, then slams on the downbeat and blasts everything on screen.
- **Survive the song.** About eight minutes in nine sections (Intro, Verse, Chorus, Verse II, Chorus II,
  Bridge, Build-Up, The Drop, Finale), a boss at every chorus, and White Noise in the finale.

## The mechanic that keeps the music clean

Stacking weapons in a survivors game usually piles up into noise. Here the build *is* the
arrangement, so the game enforces the rules a producer would:

1. **One instrument per channel.** The mixer has six channels (Beat, Groove, Bass, Chords, Lead,
   Sparkle). Each owns a frequency range and a rhythmic job, and holds exactly one instrument. Taking
   a new sound for a full channel swaps out the old one (the new sound keeps the channel's level). That
   makes every card a real decision: fill an empty channel, deepen one you have, or change a channel's style.
   Channels also open with the song: two in the intro, one more each section, all six from the second
   chorus. The run literally starts as one sound and grows into a full band.
2. **Every note is in key and on the grid.** Instruments never play raw pitches. Patterns ask for
   "chord tone 2" or "scale step 4", and the sequencer resolves them against the current chord of the
   run's key, on a 16th-note grid. Whatever you pick sounds right, and you never need to know why.
3. **The desk mixes for you.** Channels are panned apart, melodic channels duck under the kick, and
   the bus compresses and limits, with the overall level eased down as the band grows.
4. **Styles belong together.** Every instrument is Synth, Live or 8-Bit. Two, four or six of a style
   unlock escalating bonuses; two of every style unlocks Fusion. Pedals change the sound and the stats
   at once (Reverb widens areas, Tape Delay makes attacks echo on the delay line, Overdrive adds damage).

## Instruments

| Channel | Synth | Live | 8-Bit |
|---|---|---|---|
| Beat | 808 Kick: shockwaves | Taiko Drums: slams the thickest crowd | 8-Bit Drums: ricocheting blocks |
| Groove | Drum Machine Hats: auto-aimed needles | Shaker: orbiting seeds | Noise Hats: chain lightning |
| Bass | Sub Bass: slowing pulse around you | Upright Bass: heavy piercing slugs | Triangle Bass: mines that go off on the next note |
| Chords | Supersaw Stabs: fans of shots | Electric Piano: healing, slowing rings | Pulse Chords: falling blocks |
| Lead | Saw Lead: lasers | Wooden Flute: homing wisps | Square Lead: pitch-steered sprays |
| Sparkle | Arp Synth: spinning spark spiral | Music Box: stars that land on the beat | Coin Arp: boomerang coins |

Taiko Drums, Music Box and 8-Bit Drums aim the first hit of each bar at a boss in range.

## Run it locally

```
npm install          # esbuild + playwright, only needed for building and tests
npm run dev          # serves the repo at http://localhost:5173 (ES modules need http, not file://)
npm run build        # writes dist/loop-survivors.html and dist/artifact.html
```

## Project layout

```
src/config.js                 tempo, channels, styles, tuning constants
src/music/theory.js           keys, diatonic chords, chord-tone and scale-step lookup, voice leading
src/music/song.js             the song: sections, progressions, where the bosses are
src/music/sequencer.js        lookahead scheduler; emits a game event for every scheduled note
src/music/replay.js           the radio edit: plays a run's track sheet back
src/audio/engine.js           the mixing desk: channel strips, pedal effects, returns, master bus
src/audio/voices.js           synth voices (subtractive, FM, Karplus-Strong pluck, noise, kick)
src/game/game.js              the run, and the API instruments use to attack
src/game/effects.js           attack archetypes (bullets, rings, beams, zaps, strikes, mines, orbiters)
src/game/enemies.js           the Noise and its bosses
src/game/bosscues.js          the sound cue a boss plays on the beat it attacks
src/game/director.js          spawns on the beat, section by section
src/game/loadout.js           channels, pedals, stats, style chemistry
src/game/upgrades.js          level-up offers
src/content/instruments/*.js  the 18 instruments, one file per channel
src/content/pedals.js         the 7 effect pedals
src/render, src/ui            canvas renderer, HUD, menus
docs/INSTRUMENTS.md           the instrument format and authoring rules
```

## Testing tools

All run headless in Chromium through Playwright.

```
node tools/sim.mjs "speed=12&bot=1&minutes=8" --summary     # autopiloted run on a simulated clock, no audio
node tools/check.mjs                                          # render every instrument level offline: level, clipping, spectrum
node tools/check.mjs --mixall                                 # whole bands through the real mixing desk
node tools/check.mjs --mixall --remix                         # the same bands remixed (remix pedals at full)
node tools/check.mjs --audit                                  # every note of the song in every key: in key, on the grid
node tools/check.mjs --replay "speed=12&bot=1&minutes=10"     # play a sim run's track sheet back as a radio edit
node tools/shots.mjs shots/ [--mobile]                        # drive the real UI and save screenshots
```

`sim.mjs --runs N` plays seeds 1 to N, `--parallel N` runs that many pages at once, and `--summary` also
lists the damage taken from each enemy, the boss fights, the remixes taken and the card screens with no
real choice. `check.mjs --mix a,b,c --start N --bars M` renders a band bar by bar through the song's
arrangement (add `--boss <type>`, `--stopAt N` or `--pickups R` for boss cues, stop-time or chimes).
check.mjs fails on clipping, NaN, or a note out of key or off the grid.

The balance targets (pacing, boss fight lengths, instrument parity) and how they were measured are in
the commit history of the balance pass.

Sim options (query string): `speed`, `bot`, `autopick=smart|random|first`, `god`, `solo` (no level-ups),
`seed`, `start=<id>`, `give=id:level,...`, `pedals=id:level,...`, `remix=id,...`, `minutes`, `key`, `density`,
`realpick` (level-ups through the real pause path) and `chaos` (random pauses, and with `realpick` also
rerolls, banishes and skips).
