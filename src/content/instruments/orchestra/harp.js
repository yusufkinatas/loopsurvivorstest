// SPARKLE, Orchestra: Harp. PLACEHOLDER: plays and fights like the Music Box until its own part is written.
import { placeholder } from '../placeholder.js';
import arp from '../arp.js';

export default placeholder(arp, 'musicbox', {
  id: 'harp', name: 'Harp', style: 'orchestra',
  blurb: 'Rippling harp strings. Each note calls down a falling star that lands on an enemy one beat later.',
  remix: { id: 'aeolian', name: 'Aeolian' },
});
