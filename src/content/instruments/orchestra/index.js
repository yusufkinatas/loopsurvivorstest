// Orchestra (cinematic): one file per instrument, one per channel. The registry (../index.js) spreads
// this array into INSTRUMENTS and checks there is exactly one Orchestra sound per channel.
import timpani from './timpani.js';
import fieldsnare from './fieldsnare.js';
import cellos from './cellos.js';
import strings from './strings.js';
import horn from './horn.js';
import harp from './harp.js';

export default [timpani, fieldsnare, cellos, strings, horn, harp];
