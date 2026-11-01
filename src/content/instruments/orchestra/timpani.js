// BEAT, Orchestra: Timpani. PLACEHOLDER: plays and fights like the Taiko Drums until its own part is written.
import { placeholder } from '../placeholder.js';
import beat from '../beat.js';

export default placeholder(beat, 'taiko', {
  id: 'timpani', name: 'Timpani', style: 'orchestra',
  blurb: 'Rolling kettle drums. Every hit slams down on the thickest crowd and stuns it.',
  remix: { id: 'overture1812', name: '1812' },
});
