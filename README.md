# Loop Survivors

A survival action game where your weapons are sounds. Waves of noise close in, your instruments
attack on their own, and every attack is a note. Fighting and making music are the same action: the
run starts with a single sound and, if you survive, ends as a full song.

**Play:** open `dist/loop-survivors.html` in a browser (it is one self-contained file), or run the dev
server below. Sound on, headphones help.

## How it plays

- **Move** with WASD or the arrow keys, drag on a touch screen, or use a gamepad.
- **Dash through danger** with Shift, right-click, gamepad B, or the touch Dash button. You are invulnerable during the dash. Time it within 80 ms of a beat for +35% attack power for 1.2 seconds, +8 Drop charge, +25 score, and faster recovery. The four beat lights help you find the rhythm.
- **Keep the groove.** Chain kills within four seconds without taking damage. At 10, 25 and 50 kills, your kill score rises to ×2, ×3 and ×4, and collected notes charge the Drop 10%, 20% and 30% faster. Taking a hit breaks the chain.
- **Claim the spotlight.** A marked stage appears after 12 seconds, then regularly throughout the set. Hold its ring for six seconds before the 32-second timer runs out while reinforcements close in. You can leave to dodge and return without losing progress, or skip it entirely. A capture earns +80 Drop charge and a permanent remix choice. Once your three remix slots are full, captures grant an upgrade and restore 20% health instead.
- **Your instruments fight for you.** Each one plays a pattern locked to the beat, and each note it
  plays launches its attack at the exact moment you hear it.
- **Level up** by collecting the notes the noise drops. Pick one of three cards: a new sound, a
  stronger version of one you have, a swap to a different style, or an effect pedal. Hover (or press
  and hold) a card to hear it in your mix before you choose. Every draft includes an upgrade to an
  owned sound when possible, and a new sound when a channel is free. Swaps keep the previous level.
- **The Drop.** Collected notes fill the Drop meter. Press Space when it is full: the music builds for
  one bar, then slams on the downbeat and blasts everything on screen.
- **Survive the song.** Nine sections build toward White Noise at 5:36. The first boss arrives at
  1:04. Dodge a boss’s signature attack, then punish its gold **EXPOSED** recovery window for +50%
  damage. The boss slows and stops firing briefly; existing projectiles still hurt.
- **Build your record collection.** Six permanent performance milestones, discovered instruments, and career totals are saved locally. All instruments are available from the start; the collection rewards mastery without adding grind or power advantages.

The stage now has a headphone-wearing performer, dash afterimages, a recovery ring, a live song timeline and readable enemy silhouettes. Menus use a custom live-show poster design, with responsive layouts for keyboard, gamepad and touch. Screen shake and flash settings also apply to the arena's lighting and hit effects.

## Make a build

Spotlights draft three of the remixes you do not own. Choose carefully: only three fit in a set.

| Remix | How it changes your play |
|---|---|
| Aftershock | Every dash lands with a damaging shockwave; on-beat landings double its damage. |
| Glass Cannon | +35% damage, but 20 less maximum health. |
| Magnetic Groove | +60% pickup radius; collected notes add another 25% Drop charge. |
| Sustain | Perfect dashes heal 3 HP; off-beat dash recovery takes 0.4 seconds longer. |
| Front Row | +40% damage within 180 units, −10% farther away. Fight close to cash in. |
| Cascade | Every kill adds 1 Drop charge. After a Drop lands, gain +50% weapon damage for five seconds. |

Try Aftershock with Front Row to dash into crowds, or Magnetic Groove with Cascade to build around
frequent Drops. Save a charged Drop for a dangerous spotlight or a boss recovery window.

## The mechanic that keeps the music clean

Stacking weapons in a survivors game usually piles up into noise. Here the build *is* the
arrangement, so the game enforces the rules a producer would:

1. **One instrument per channel.** The mixer has six channels (Beat, Groove, Bass, Chords, Lead,
   Sparkle). Each owns a frequency range and a rhythmic job, and holds exactly one instrument. Taking
   a new sound for a full channel swaps out the old one and keeps its level. That makes every
   card a real decision: fill an empty channel, deepen one you have, or change a channel's style.
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

## Run it locally

```
npm install          # esbuild + playwright, only needed for building and tests
npm run dev          # serves the repo at http://localhost:5173 (ES modules need http, not file://)
npm run build        # writes dist/loop-survivors.html and dist/artifact.html
npm test             # combat, spotlights, remix drafts, bosses, timing, career persistence
npm run test:browser # real desktop/touch control flows and screenshot checks
```

## Project layout

```
src/config.js                 tempo, channels, styles, tuning constants
src/music/theory.js           keys, diatonic chords, chord-tone and scale-step lookup, voice leading
src/music/song.js             the song: sections, progressions, where the bosses are
src/music/sequencer.js        lookahead scheduler; emits a game event for every scheduled note
src/audio/engine.js           the mixing desk: channel strips, pedal effects, returns, master bus
src/audio/voices.js           synth voices (subtractive, FM, Karplus-Strong pluck, noise, kick)
src/game/game.js              the run, and the API instruments use to attack
src/game/effects.js           attack archetypes (bullets, rings, beams, zaps, strikes, mines, orbiters)
src/game/enemies.js           the Noise and its bosses
src/game/director.js          spawns on the beat, section by section
src/game/loadout.js           channels, pedals, stats, style chemistry
src/game/upgrades.js          level-up offers
src/game/remixes.js           permanent run modifiers and spotlight reward drafts
src/game/spotlights.js        timed capture challenges, reinforcements, and rewards
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
node tools/shots.mjs shots/ [--mobile]                        # drive the real UI and save screenshots

The balance targets (pacing, boss fight lengths, instrument parity) and how they were measured are in
the commit history of the balance pass.
```

Sim options (query string): `speed`, `bot`, `autopick=smart|random|first`, `god`, `solo` (no level-ups),
`seed`, `start=<id>`, `give=id:level,...`, `pedals=id:level,...`, `minutes`, `key`, `density`.
