// CHORDS, Heavy: Power Chords. PLACEHOLDER: plays and fights like the Supersaw Stabs until its own part is written.
import { placeholder } from '../placeholder.js';
import chords from '../chords.js';

export default placeholder(chords, 'supersaw', {
  id: 'powerchords', name: 'Power Chords', style: 'heavy',
  blurb: 'Big distorted guitar chords. Each one fires a fan of shots that turns around you.',
  remix: { id: 'callresponse', name: 'Call and Response' },
});
