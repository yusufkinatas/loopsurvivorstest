// GROOVE, Heavy: Ride Cymbal. PLACEHOLDER: plays and fights like the Drum Machine Hats until its own part is written.
import { placeholder } from '../placeholder.js';
import perc from '../perc.js';

export default placeholder(perc, 'hats909', {
  id: 'ride', name: 'Ride Cymbal', style: 'heavy',
  blurb: 'A washy ride cymbal. Every ping fires a fast needle at the nearest enemy.',
  remix: { id: 'chinacrash', name: 'China Crash' },
});
