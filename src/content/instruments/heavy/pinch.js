// SPARKLE, Heavy: Pinch Harmonics. PLACEHOLDER: plays and fights like the Arp Synth until its own part is written.
import { placeholder } from '../placeholder.js';
import arp from '../arp.js';

export default placeholder(arp, 'arpsynth', {
  id: 'pinch', name: 'Pinch Harmonics', style: 'heavy',
  blurb: 'Squealing guitar harmonics. Every note flicks a spark, spinning a spiral around you.',
  remix: { id: 'whammy', name: 'Whammy' },
});
