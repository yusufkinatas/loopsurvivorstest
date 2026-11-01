// LEAD, Heavy: Shred Guitar. PLACEHOLDER: plays and fights like the Saw Lead until its own part is written.
import { placeholder } from '../placeholder.js';
import lead from '../lead.js';

export default placeholder(lead, 'sawlead', {
  id: 'shred', name: 'Shred Guitar', style: 'heavy',
  blurb: 'A screaming lead guitar. Every note fires a laser that cuts through a line of enemies.',
  remix: { id: 'windmill', name: 'Windmill' },
});
