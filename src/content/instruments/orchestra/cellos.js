// BASS, Orchestra: Cellos. PLACEHOLDER: plays and fights like the Upright Bass until its own part is written.
import { placeholder } from '../placeholder.js';
import bass from '../bass.js';

export default placeholder(bass, 'upright', {
  id: 'cellos', name: 'Cellos', style: 'orchestra',
  blurb: 'A low, bowed string section. Every note fires a heavy slug that bowls through enemies.',
  remix: { id: 'maelstrom', name: 'Maelstrom' },
});
