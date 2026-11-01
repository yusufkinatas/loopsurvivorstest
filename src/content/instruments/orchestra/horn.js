// LEAD, Orchestra: French Horn. PLACEHOLDER: plays and fights like the Wooden Flute until its own part is written.
import { placeholder } from '../placeholder.js';
import lead from '../lead.js';

export default placeholder(lead, 'flute', {
  id: 'horn', name: 'French Horn', style: 'orchestra',
  blurb: 'A warm, heroic horn. Each note floats off as a glowing wisp that hunts down an enemy.',
  remix: { id: 'fanfare', name: 'Fanfare' },
});
