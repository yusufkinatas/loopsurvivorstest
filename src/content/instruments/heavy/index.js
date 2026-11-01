// Heavy (rock and metal): one file per instrument, one per channel. The registry (../index.js) spreads
// this array into INSTRUMENTS and checks there is exactly one Heavy sound per channel.
import doublekick from './doublekick.js';
import ride from './ride.js';
import dropd from './dropd.js';
import powerchords from './powerchords.js';
import shred from './shred.js';
import pinch from './pinch.js';

export default [doublekick, ride, dropd, powerchords, shred, pinch];
