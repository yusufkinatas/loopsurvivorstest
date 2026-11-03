# Loop Survivors

A survival action game where your weapons are sounds. Waves of noise close in, your instruments
attack on their own, and every attack is a note. Fighting and making music are the same action: the
run starts with a single sound and, if you survive, ends as a full song.

**Play:** open `dist/loop-survivors.html` in a browser (it is one self-contained file), or run the dev
server below. Sound on, headphones help.

## How it plays

- **Move** with WASD or the arrow keys, drag on a touch screen, or use a gamepad. Your instruments play on
  the beat, and each note launches its attack at the exact moment you hear it.
- **Level up** by collecting the notes the noise drops. Notes fade after a few bars, so you walk into the
  fight for them. Pick one of three cards: a new sound, a stronger version of one you have, a swap to a
  different style, an effect pedal, or the fader of a channel at level 5 or remixed (8% more damage a push).
  The deal follows your band: new sounds lean toward the styles you play, your top channel's next level
  comes up on about a third of screens, swaps mostly show when they gain a rule tier or form a crossover,
  and a pedal that powers none of your sounds is rare. The first card plays in your mix as soon as the screen opens; hover
  (or press and hold) another to hear it. Cards show a glyph, a name, the level and the pattern; press I
  (Y on a gamepad, or the (i) button) for the words. You can also reroll (R), banish a sound or pedal for
  the run (X), or skip the level to charge the Drop (Q).
- **You cannot max everything.** A run has about 25 level-ups for 30 instrument levels and 12 pedal
  levels, so you choose which two or three channels to push all the way.
- **Styles change how you play.** Every sound is Synth, Live, 8-Bit, Heavy or Orchestra. Two, four or six
  of a style turn on its play rule, drawn on the floor around you:
  - **Synth, Long throw:** more damage on enemies far from you.
  - **Heavy, Mosh pit:** more damage on enemies close to you.
  - **Live, In the pocket:** stand still for wider attacks and a heal on the beat.
  - **8-Bit, Combo streak:** every beat without a hit adds damage; a hit resets it.
  - **Orchestra, Ride the swell:** damage swells through each 8-bar phrase and peaks at the fill.

  Two styles with two or more sounds each form a crossover (Grunge, Film score, Chip metal...) that bends their
  two rules, named on the stamp over the mixer in one sentence. Three styles at two or more form Fusion: every rule
  plays one tier up. A card that would form or break one shows a split disc beside its style gems.
- **The song breathes.** Every section has its own texture: thin verses, full choruses, a drumless Bridge
  breakdown, a solo for your strongest part, a half-time Drop and a Finale that rises and falls. A quiet
  phrase is dangerous (the band plays thin and the mix goes dark), and the band slamming back in hits
  everything around you. The last phrase of each chorus, The Drop's third and every Finale rise put your Beat
  and Groove channels on a classic groove in their own sounds (House, Funky Drummer, When the Levee Breaks, a
  march under Ravel's Bolero, 40 in all), picked by your band's top style, or by its crossover or Fusion once
  one forms.
- **The Noise never thins.** A floor of bodies walks in from just past the screen's edge and refills on every
  beat, so you cannot clear the room. Each section brings tougher, bigger bodies, rings close in before the
  song's big downbeats and walls sweep through the quiet phrases (always with a gap to slip through). Almost
  all of the danger is bodies: being surrounded, not being shot. Your attack areas start small and grow with
  Hall Reverb and the Live rule.
- **Bosses are on the clock.** A boss arrives with each chorus and with The Drop; a thin gold line under its
  bar, ending in a tape, shows the time left in its section. Silence it in time and it drops a **Master Tape**.
- **Remix.** A tape remixes a channel at level 3 or more and finishes it to level 5 (with two ready, you
  choose; the gold cards' pips show the jump). The channel drops out for a bar under a riser, then the remix
  slams in on the next 4-bar line: a new part, a new sound, a bigger attack that reads how you move, and its
  pedal opened up on its strip. With no channel at level 3 yet the tape waits: a gold reel sits on the strips
  it could finish and on the level card that gets one there. While a tape lies on the floor, the strips it
  would remix wear a gold rim. At most three a run.
- **The Drop.** Collected notes fill the ring around your speaker. Press Space or E (A on a gamepad, the
  round button on a touch screen) when it is full: one bar of build, then a blast around you that erases
  the shots inside it. Full, a dashed white ring closes around the speaker through the two bars before each
  phrase downbeat: press while it closes and the Drop lands on that downbeat, a perfect Drop that hits harder,
  reaches further and knocks a boss off the beat. When that downbeat is one of the song's own impacts (each
  chorus start, the Bridge's drums returning, The Drop, each Finale rise) the ring is doubled, and the Drop
  lands as a **Double Drop** that hits harder and reaches further again.
- **Pause** with Escape or P (Start on a gamepad). The pause sheet has every detail the play screen leaves
  out: your band and what each sound does, the pedals, the style rules, the live pattern grid, health,
  level and kills. M mutes.
- **Survive the song.** Eight to nine minutes in nine sections (Intro, Verse, Chorus, Verse II, Chorus II,
  Bridge, Build-Up, The Drop, Finale), with White Noise in the Finale. Hearts come on a schedule (the
  quiet sections, beaten bosses and hunting elites), not from every kill, so the choruses are the exams.
- **Three songs.** Loop Survivors, Ode (Beethoven's Ninth) and Korobeiniki (the Russian folk song) have the
  same nine sections, bosses and length, each with its own chords and its own crowd (Ode's verses march in
  heavy, Korobeiniki's swarm). After your first run you pick the song on the first-sound screen. The tune
  comes to your band: in the second phrase of each chorus your Lead (else your Sparkle) plays it in its own
  rhythm, striking the tune's notes where it would rest (a held note rings on over them), and a Lead or
  Sparkle that takes the Bridge solo or a Finale solo plays it again, every note still one of its attacks. The
  original's Finale solo plays the Dies irae. Collected notes spell the song's tune on the pickup bells.
- **Keep your songs.** The end screen plays your run back as a one-minute radio edit. The Discography
  keeps what you have done across runs: 17 liner-note goals that unlock first sounds (two of them open a
  whole style), 30 record sleeves for the genres a band can become, and the crate of 30 remixes.
- **Gain.** Finishing the song opens Gain 1, and a win at the highest Gain open opens the next, up to 8.
  Each tier adds a modifier and 10% score. Gain only changes combat numbers, never the music.

## The mechanic that keeps the music clean

The build *is* the arrangement, so the game enforces the rules a producer would:

1. **One instrument per channel.** Six channels (Beat, Groove, Bass, Chords, Lead, Sparkle), each with a
   frequency range and a rhythmic job. Taking a new sound for a full channel swaps out the old one. The
   mixer opens with the song: two channels in the intro, one more each section.
2. **Every note is in key and on the grid.** Patterns ask for "chord tone 2" or "scale step 4", and the
   sequencer resolves them against the current chord of the run's key on a 16th-note grid.
3. **The arrangement thins and fills the band.** Each 8-bar phrase gives every channel a texture
   (full, out, sparse, half-time, double-time, call, answer, held, an octave down, mirrored, a lower
   level's part, a classic groove, or a song's accompaniment figure). The textures only move notes on the
   grid, so they stay in key, and an attack only fires on a note you hear. A groove moves the part's own notes
   onto its hits, the loudest on its accents (a busy part's extra notes fire with a hit they share), and a figure
   sounds its chord tones on them in the register the part played, so every attack of the part still fires.
4. **The desk mixes for you.** Channels are panned apart, melodic channels duck under the kick, the bus
   compresses and limits, and the level and brightness follow who is playing.

## Instruments

| Channel | Synth | Live | 8-Bit | Heavy | Orchestra |
|---|---|---|---|---|---|
| Beat | 808 Kick | Taiko Drums | 8-Bit Drums | Double Kick | Timpani |
| Groove | Drum Machine Hats | Shaker | Noise Hats | Ride Cymbal | Field Snare |
| Bass | Sub Bass | Upright Bass | Triangle Bass | Drop-D Bass | Cellos |
| Chords | Supersaw Stabs | Electric Piano | Pulse Chords | Power Chords | String Section |
| Lead | Saw Lead | Wooden Flute | Square Lead | Shred Guitar | French Horn |
| Sparkle | Arp Synth | Music Box | Coin Arp | Pinch Harmonics | Harp |

Each style plays its own way, and each of the five sounds in a channel works differently:

- **Synth reaches far and straight.** The 808 lances the farthest enemy, the hats needle along your path,
  the sub bass rolls a wave the way you face, supersaw shots snipe the farthest crowd, the saw lead fires
  along your facing, and the arp's pitch picks how far away its target is.
- **Live works around where you stand.** Taiko slams the ground around you (harder the longer you plant),
  the shaker orbits, the upright thumps a patch that walks around you, the electric piano's ring rolls back
  in while you stand still, flute wisps loop around you, and music box stars land on a clock face.
- **8-Bit is grid-snapped and keeps working while you dodge.** Drum blocks ricochet on straight and diagonal
  lines, a spark crawls through the crowd on its own, triangle bombs blow in a + on the floor grid, chords
  drop falling-block pieces, square pixels bounce, and coins boomerang along the compass lines.
- **Heavy fights close.** Kicks blast cones the way you move, cymbals you plant ring on every ride note, the
  bass punts enemies into each other, power chords raise walls that soak shots, the guitar cuts wedges
  around you, and pinch harmonics hook enemies and drag them in.
- **Orchestra is placed and timed.** The timpani sets a kettle on a crowd that grows on soft strokes and
  booms on accents, drummers march behind you, the cellos pull a crowd to a spot and crush it, string ranks
  march out along the bar, held horn notes release one growing blast, and the harp plucks a frame over a crowd.

## Run it locally

```
npm install          # esbuild + playwright, only needed for building and tests
npm run dev          # serves the repo at http://localhost:5173 (ES modules need http, not file://)
npm run build        # writes dist/loop-survivors.html and dist/artifact.html
```

## Project layout

```
src/config.js                 tempo, channels, styles, Gain, and BALANCE (every combat tuning number)
src/music/theory.js           keys, diatonic chords, chord-tone and scale-step lookup, voice leading
src/music/song.js             the setlist (songs, tunes, crowds), sections, progressions, the texture chart, bosses
src/music/sequencer.js        lookahead scheduler, texture transforms, solos, impacts, remix moments
src/music/grooves.js          the 40 classic grooves, their lists per style and crossover, accompaniment figures
src/music/replay.js           the radio edit: plays a run's track sheet back
src/audio/engine.js           the mixing desk: channel strips, pedals, returns, phrase level and tone, master bus
src/audio/voices.js           synth voices (subtractive, FM, Karplus-Strong pluck, noise, kick, drive)
src/game/game.js              the run, the play rules, Master Tapes, and the API instruments use to attack
src/game/effects.js           attack archetypes (bullets, rings, beams, zaps, strikes, mines, orbiters,
                              cones, walls, tethers, followers)
src/game/enemies.js           the Noise, its bosses and the Snare mortar
src/game/bosscues.js          the sound cue a boss plays on the beat it attacks, and the motif it arrives with
src/game/director.js          spawns on the beat, following the song's energy and quiet phrases
src/game/loadout.js           channels, pedals, stats, style play rules, genre names
src/game/upgrades.js          level-up offers and what each card shows
src/game/progress.js          the career between runs: goals, records, remixes, Gain (pure, runs in Node)
src/storage.js                settings, best run and career in localStorage, guarded
src/content/instruments/      the 30 instruments: one file per channel for the first three styles,
                              heavy/ and orchestra/ with one file per sound
src/content/pedals.js         the 7 effect pedals
src/render, src/ui            canvas renderer, HUD, menus, glyphs
docs/INSTRUMENTS.md           the instrument format and authoring rules
```

## Testing tools

All run headless in Chromium through Playwright, except where noted.

```
node tools/sim.mjs "speed=12&bot=1&minutes=10" --summary --runs 8 --parallel 4   # autopiloted songs, about 2 minutes
node tools/parity.mjs --ids timpani,harp [--no-remix]   # one sound solo at L1, L5 and remixed, against its channel's band
node tools/check.mjs                                    # render every instrument level: level, clipping, spectrum
node tools/check.mjs --arrange [--song ode|all]         # the texture chart in Node: who plays, notes a bar, energy
node tools/check.mjs --audit [--song all]               # every note in every key, texture, remix and tune: in key, on the grid
node tools/check.mjs --rules                            # the game's rules as asserts in Node (crossovers, tiers, key degrees)
node tools/check.mjs --mixall [--remix]                 # whole bands through the real desk
node tools/check.mjs --mix a,b,c --start N --bars M     # a band bar by bar (also --remixAt N, --boss, --stopAt, --song)
node tools/drop-check.mjs                               # the perfect Drop lands on the phrase downbeat you heard
node tools/shots.mjs shots/ [--mobile]                  # drive the real UI, save screenshots, count visible words
node tools/progress-check.mjs                           # the career rules in Node (no browser)
node tools/dummy.mjs mode=one give=sawlead:5 pedals=overdrive:3   # damage per second on unkillable dummies (Node)
node tools/fitcheck.mjs                                 # the pedals' fit lists against the measured matrix (Node)
node tools/perf.mjs a,b,c [pedal,pedal] [bodies] [rx]   # logic ms per frame for a band at 480 bodies (Node)
node tools/deal.mjs                                     # the card deal's shares over 20,000 screens per band (Node)
```

`sim.mjs --summary` prints one line per song section from the game's ledger (damage taken by cause,
healing, lowest health, level, picks, kills and their distance, hearts, Drops, Snare marks, notes that
faded) and, with `--runs`, an AGGREGATE line: wins, where runs died, lowest health before the Finale,
levels, picks, Drops, hearts, boss fight lengths, tapes and remixes. That is how balance is checked: one
batch of eight seeds takes about two minutes. Balance is checked against two autopilots: the ordinary bot
(it reacts in 0.3 s) and `botskill=1`, a sharp player (half the reaction time, more shots watched). At this
commit, on rotated starts at Gain 0, the skilled bot wins 17 of 32 (deaths mostly from the Build-Up to the
Finale, lowest health before the Finale a median 30%, 11 runs untouched through two or more late sections) and
the ordinary bot wins 9 of 24, with 20 of 24 reaching the Bridge.

Sim options (query string): `speed`, `bot`, `autopick=smart|random|first`, `god` (the ledger still
records what would have hit), `solo` (no level-ups), `seed`, `start=<id>`, `give=id:level,...`,
`pedals=id:level,...`, `remix=id,...`, `tapes=N`, `gain=N`, `minutes`, `key`, `botrules=0` (the bot
ignores the style rules), `botskill=1` (the sharper bot), `realpick` (level-ups through the real pause path) and `chaos` (random pauses,
and with `realpick` also rerolls, banishes and skips). For measurement: `start=rotate` (sim.mjs starts each run on
the next default first sound), `song=N`, `god=2` (god mode where a hit still resets the rules it touches), `xo=0`
(no crossovers), `sig=0` (no Signatures) and `tex=role:transform,...` (a transform on every full phrase of that
role). Sims never read or write the career.
