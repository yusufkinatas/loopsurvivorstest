// BEAT, Heavy: Double Kick. PLACEHOLDER: plays and fights like the 808 Kick until its own part is written.
import { placeholder } from '../placeholder.js';
import beat from '../beat.js';

export default placeholder(beat, 'kick808', {
  id: 'doublekick', name: 'Double Kick', style: 'heavy',
  blurb: 'Pounding metal kicks. Each one sends a shockwave rolling out from you.',
  remix: { id: 'wallofdeath', name: 'Wall of Death' },
});
