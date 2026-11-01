// GROOVE, Orchestra: Field Snare. PLACEHOLDER: plays and fights like the Shaker until its own part is written.
import { placeholder } from '../placeholder.js';
import perc from '../perc.js';

export default placeholder(perc, 'shaker', {
  id: 'fieldsnare', name: 'Field Snare', style: 'orchestra',
  blurb: 'A crisp marching snare. Drumsticks circle you and flash on every tap, hitting anything close.',
  remix: { id: 'parade', name: 'Parade' },
});
