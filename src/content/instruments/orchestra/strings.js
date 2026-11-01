// CHORDS, Orchestra: String Section. PLACEHOLDER: plays and fights like the Electric Piano until its own part is written.
import { placeholder } from '../placeholder.js';
import chords from '../chords.js';

export default placeholder(chords, 'rhodes', {
  id: 'strings', name: 'String Section', style: 'orchestra',
  blurb: 'Lush orchestral strings. Each chord sends out a soft wave that slows enemies and heals you.',
  remix: { id: 'crescendo', name: 'Crescendo' },
});
