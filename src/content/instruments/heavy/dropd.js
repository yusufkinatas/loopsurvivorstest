// BASS, Heavy: Drop-D Bass. PLACEHOLDER: plays and fights like the Sub Bass until its own part is written.
import { placeholder } from '../placeholder.js';
import bass from '../bass.js';

export default placeholder(bass, 'subbass', {
  id: 'dropd', name: 'Drop-D Bass', style: 'heavy',
  blurb: 'A low, chugging bass. Every note pulses around you, hurting and slowing anything close.',
  remix: { id: 'breakdown', name: 'Breakdown' },
});
