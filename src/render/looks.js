// How the band's attacks look. The channel color stays the hue (so you can tell which channel hit), the STYLE
// decides the form, and every instrument (and its remix) picks its own signature inside that form, so each of the
// 30 weapons reads at a glance:
//
//   Synth      clean neon vectors: a thin bright core in a soft sheath, straight and precise lines, reticles, ticks.
//   Live       soft organic shapes: brush and ink edges that wobble and breathe, blots, spatter, ripples.
//   8-Bit      pixel-snapped squares on a 4 px grid, stepped (staircase) rings, quantized falls, no glow at all.
//   Heavy      jagged angular wedges and plates, cracks, sparks and impact chips, hard mitred edges.
//   Orchestra  elegant thin arcs: staff lines, bow strokes, curling flourishes, a slow refined turn.
//
// The clarity rules the whole renderer follows hold here too: an attack AREA is an outline with a faint fill (never
// a glowing disc), projectiles are small and crisp, nothing uses 'lighter', nothing of the band wears the danger hue,
// and every alpha is multiplied by the renderer's load budget (fxAlpha, see begin()); only instant hits and the gold
// accents keep a floor under it. A remixed attack keeps a thin gold accent on top of its own look, always partial (an
// arc, a tick, a gold line or crack): a closed gold outline round a thing is how elites are marked. Nothing of the
// band draws a filled band between two rails either (that is an enemy's charge lane), or an eighth note (a pickup).
//
// Speed: the late game draws hundreds of effects a frame. Bullets and flying bodies are batched into one path per
// look and color (fades shrink a shot instead of fading it, so a batch shares one alpha); colors are plain strings set
// through globalAlpha (no per-effect rgba strings); no shadowBlur, no sprites, no dash patterns (dashes are subpaths);
// outlines round many-sided shapes are hairlines, doubled where they need weight. Each effect caches its look (_L) and
// a cosmetic seed (_sd) the first time it is drawn; jitter is a hash of that seed and the clock, re-rolled 20 times a
// second, so nothing shimmers frame to frame.

import { TAU, clamp } from '../util.js';
import { ROLE_INFO } from '../config.js';

export const GOLD = '#ffd166';
const PX = 4;                                   // the 8-Bit grid, in world px
const snap = (v, p = PX) => Math.round(v / p) * p;

// The grammar: what each archetype is drawn as in each style, before an instrument's own entry.
const STYLE = {
  synth:     { area: 'reticle', ring: 'neon', beam: 'neon', zap: 'neon', bullet: 'streak', strike: 'reticle', mine: 'diamond', cone: 'scan', tether: 'neon', wall: 'neon', orbit: 'dot', shield: 'neon', launch: 'streak', pop: 'circle' },
  organic:   { area: 'blob', ring: 'brush', beam: 'brush', zap: 'brush', bullet: 'blob', strike: 'ripple', mine: 'pod', cone: 'brush', tether: 'vine', wall: 'brush', orbit: 'seed', shield: 'bubble', launch: 'smear', pop: 'blob' },
  chip:      { area: 'stepped', ring: 'stepped', beam: 'blocks', zap: 'manhattan', bullet: 'pixel', strike: 'pixel', mine: 'pixel', cone: 'stepped', tether: 'dashes', wall: 'blocks', orbit: 'pixel', shield: 'stepped', launch: 'ghosts', pop: 'square' },
  heavy:     { area: 'cracked', ring: 'jagged', beam: 'blade', zap: 'bolt', bullet: 'shard', strike: 'jagged', mine: 'cymbal', cone: 'jagged', tether: 'barbed', wall: 'plates', orbit: 'shard', shield: 'jagged', launch: 'speedlines', pop: 'burst' },
  orchestra: { area: 'staff', ring: 'staff', beam: 'bow', zap: 'bow', bullet: 'notehead', strike: 'circle', mine: 'kettle', cone: 'fan', tether: 'thread', wall: 'arcs', orbit: 'notehead', shield: 'staff', launch: 'curl', pop: 'arc' },
};

// Each instrument's signature (sig says it in words) and its remix's variant (rx: only what changes).
export const LOOKS = {
  // Beat
  kick808: { sig: 'sub spear: a solid tapered shaft with a bright core, chevrons along it pointing out to a chevron head', beam: 'lance',
    rx: { sig: 'the downbeat boom is a neon ring of inward chevrons, every kick a tight erase ring', ring: 'pump' } },
  taiko: { sig: 'ink splash: a blotchy brush circle with spatter dots, thunder as a thick-thin brush ring', area: 'splash', ring: 'brush', spatter: 6,
    rx: { sig: 'heavier splashes with more spatter, the hall boom as a doubled brush ring', spatter: 11, ring: 'brush2' } },
  chipdrums: { sig: 'pixel bricks with a highlight corner, two ghost blocks stepping behind', bullet: 'block',
    rx: { sig: 'glitched bricks: split copies torn in two halves' } },
  doublekick: { sig: 'boot wedge: a sawtooth-fronted wedge with cracks from the apex and chips flying off', cone: 'jagged',
    rx: { sig: 'the wall of death: a jagged ring and wedge, the hurled crowd leaving speed lines', ring: 'jagged' } },
  timpani: { sig: 'a solid kettle drum with a rim highlight and tuning pegs, booms as staff bundles riding out', mine: 'kettle', ring: 'staff', area: 'staff',
    rx: { sig: 'cannon shells lobbed from your side onto the crowd with a dotted trail', strike: 'shell' } },
  // Groove
  hats909: { sig: 'neon needles: a short shaft, a bright white head and a double tick across the tail', bullet: 'needle',
    rx: { sig: 'needles fletched with a double chevron, ping-ponging ahead and behind', bullet: 'needle2' } },
  shaker: { sig: 'seed pods spinning with a dotted dust trail, shakes as rattling double brush rings', orbit: 'seed', area: 'rattle', blast: 'rattle',
    rx: { sig: 'raindrops falling onto ripples', strike: 'raindrop', land: 'ripple' } },
  chiphat: { sig: 'pixel static: stepped right-angle bolts with square nodes', zap: 'manhattan', area: 'stepped',
    rx: { sig: 'live wires: marching dashed right-angle cables to the hooked crowd', tether: 'dashes', beam: 'wire8' } },
  ride: { sig: 'a cymbal seen from above: one rim, a groove, the bell and a turning shine, rung as a thin ring with spark ticks', mine: 'cymbal', area: 'cymring', blast: 'cymring',
    rx: { sig: 'taut jagged wires sparking between the cymbals', beam: 'wire' } },
  fieldsnare: { sig: 'marching drums with crossed sticks on a dashed staff, jabs as short bow strokes', follower: 'drummer', beam: 'bow', area: 'staff',
    bullet: { shard: 'stick', diamond: 'confetti' },
    rx: { sig: 'thrown sticks and confetti diamonds' } },
  // Bass
  subbass: { sig: 'pressure front: a straight neon line across the lane with two fading echoes and end brackets', bullet: 'front',
    rx: { sig: 'the lane breathes: fronts roll out and back in' } },
  upright: { sig: 'finger pads: an oval thumb print with ridges across it on a plucked string vibrating under it', area: 'print', cone: 'brush',
    rx: { sig: 'slap pops as brush wedges, dead notes as wide finger pads', area: 'print' } },
  tribass: { sig: 'pixel bombs with a blinking fuse and a dotted cross telegraph, blowing in rows of blocks', mine: 'bomb', beam: 'cross', area: 'stepped',
    rx: { sig: 'a pixel speaker cabinet that pumps out square rings', mine2: 'speaker', ring: 'square' } },
  dropd: { sig: 'bowling punts: jagged speed lines behind every punted body, cracked hits on the heavy ones', launch: 'speedlines', area: 'cracked',
    rx: { sig: 'gold-streaked punts landing in hard spiked bursts with chips and a gold crack', area: 'shatter' } },
  cellos: { sig: 'a spiral whirl on the crowd, staff rings closing in, crushes as turning staff arcs', mine: 'whirl', ring: 'staff', area: 'staff',
    rx: { sig: 'the maelstrom: three spiral arms turning the way you circle', mine: 'maelstrom' } },
  // Chords
  supersaw: { sig: 'neon kites with a sawtooth wake', bullet: 'kite',
    rx: { sig: 'double-outlined kites fanning ahead and behind', bullet: 'kite2' } },
  rhodes: { sig: 'a breathing double brush wave, a soft bubble shield', ring: 'breath', shield: 'bubble', area: 'blob',
    rx: { sig: 'the push wave and a soft bubble shield' } },
  chipchords: { sig: 'falling blocks: cells dropping in steps onto cornered tiles, landing as bevelled squares', strike: 'block', land: 'block',
    rx: { sig: 'line clears: rows of bevelled blocks', beam: 'line' } },
  powerchords: { sig: 'amp-plate wall: square-cut notched plates with rivets and a spark off every plate, jagged shards', wall: 'plates',
    rx: { sig: 'plates closing into a ring, caught shots flying back as shards' } },
  strings: { sig: 'bow strokes drawn across a rank of staff lines, landing as crescents, a staff-ring shield', strike: 'bow', land: 'crescent', shield: 'staff',
    rx: { sig: 'stacked ranks, the full stack erasing shots with a staff ring' } },
  // Lead
  sawlead: { sig: 'laser: a hair-thin core in a soft sheath, a muzzle dot and a cross flare at the end', beam: 'laser',
    rx: { sig: 'screaming lasers, kills bursting into neon star rays', area: 'starburst' } },
  flute: { sig: 'wisps: small solid heads with a light core trailing wavy ink tails', bullet: 'wisp',
    rx: { sig: 'a second flute of wisps from where you were' } },
  squarelead: { sig: 'pixel square waves ricocheting, ghost pixels stepping behind', bullet: 'pixwave',
    rx: { sig: 'mirrored harmony waves' } },
  shred: { sig: 'blade slash: crescent swooshes with a bright edge, jabs as sharp spikes', cone: 'slash',
    rx: { sig: 'the windmill: four crescent blades with bright edges flinging bodies', beam: 'edge' } },
  horn: { sig: 'brass bells: fans of concentric arcs with curled ends, bolts as oval heads with a flared bell behind', bullet: { note: 'notehead', ring: 'bell' }, area: 'staff',
    rx: { sig: 'answering bells flying back through you' } },
  // Sparkle
  arpsynth: { sig: 'neon darts with a spinning twinkle at the head', bullet: { shard: 'dart', star: 'sparkstar' },
    rx: { sig: 'spiral arms of sparkle stars with dotted trails' } },
  musicbox: { sig: 'falling stars with a wavy tail onto breathing rings, landing as soft stars', strike: 'fallstar', land: 'softstar',
    rx: { sig: 'rings of stars and crescent moons over the sleepers', launch: 'sleep' } },
  chiparp: { sig: 'pixel coins flipping in steps with a slot and a sparkle', bullet: 'coin8',
    rx: { sig: 'jackpot coins turning gold' } },
  pinch: { sig: 'barbed hooks: jagged lines with barbs pointing home, a hook at the enemy, bolts on each squeal', tether: 'barbed', zap: 'bolt',
    rx: { sig: 'the whammy dive slams a jagged ring', strike: 'jagged', land: 'cracked' } },
  harp: { sig: 'harp frames: two peg bars with three strings between them, each vibrating in its own phase', beam: 'string', area: 'staff',
    rx: { sig: 'crossed frames of ringing strings' } },
};

// The default bullet per style, and the shapes a style draws its own way.
const BULLET = { synth: 'streak', organic: 'blob', chip: 'pixel', heavy: 'shard', orchestra: 'notehead' };
const NONE = Object.freeze({ style: null, rx: false });

const cache = new Map();
// The look of an effect's source (an instrument instance, or null for the game's own rings and flashes).
export function lookOf(src) {
  const def = src?.def;
  if (!def) return NONE;
  let e = cache.get(def.id);
  if (!e) {
    const own = LOOKS[def.id] || {};
    const base = { ...(STYLE[def.style] || STYLE.synth), ...own, style: def.style, id: def.id, rx: false };
    e = { base, rx: { ...base, ...(own.rx || {}), rx: true } };
    cache.set(def.id, e);
  }
  return src.remix ? e.rx : e.base;
}

function bulletKind(L, b) {
  if (b.wave) return 'front';
  const m = L.bullet;
  if (typeof m === 'string') return m;
  return (m && m[b.shape]) || BULLET[L.style] || 'blob';
}

// ------------------------------------------------------------------ frame state and small helpers

let c = null, FA = 1, T = 0, REN = null, BUSY = false, SC = 1, HL = 1, TH = 1.8;
// Every attack function starts here: the context, the load budget, the clock. On a busy screen the secondary strokes
// go (second brush edges, spatter, chips, ticks): the form that tells the style and the weapon stays, the frame stays
// cheap and the screen calmer. BUSY switches on past a load of 0.55 and off under 0.45, so details hovering near the
// threshold do not pop on and off frame to frame.
// Line widths that must survive the zoom are set in screen px: HL is one screen px (a hairline: thin enough for the
// canvas's fast path at device pixel ratio 1, and never thinner than a pixel on a phone's 0.62 zoom), TH the 1.8 px
// stroke every look keeps for its main form (so the form reads at any zoom and under the load budget).
export function begin(ctx, ren) {
  c = ctx; FA = ren.fxAlpha; T = ren.time; REN = ren;
  if (BUSY ? ren.load < 0.45 : ren.load > 0.55) BUSY = !BUSY;
  SC = (ren.scale || 1) * (ren.zoom || 1); HL = 0.999 / SC; TH = 1.8 / SC;
}
// ... and leaves the context the way the rest of the frame expects it (no dash pattern, no dash offset).
export function end() {
  c.globalAlpha = FA;
  c.lineCap = 'round'; c.lineJoin = 'miter';
  c.setLineDash([]); c.lineDashOffset = 0;
}
const al = (a) => { c.globalAlpha = FA * (a < 0 ? 0 : a > 1 ? 1 : a); };
// A remix's gold accent is a thin line, so it keeps an alpha floor of 0.85 under the load budget: faded further, gold
// over the dark floor turns brown-orange, toward the danger hue.
const alG = (a) => { c.globalAlpha = Math.max(FA, 0.85) * (a < 0 ? 0 : a > 1 ? 1 : a); };
const tint = (col) => REN.tint(col);
// A gap between staff lines, at least 5 screen px apart.
const gapOf = (g) => Math.max(5 / SC, g);

// A cosmetic seed per effect (golden-ratio steps, so neighbors differ), and a cheap hash of it.
let seedN = 0;
const seedOf = (o) => o._sd ?? (o._sd = (seedN = (seedN + 0.6180339887) % 1));
function h1(s, i) {
  let x = (Math.floor(s * 1e6) * 374761393 + i * 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

const N = 24, CS = [], SN = [];
for (let i = 0; i <= N; i++) { CS.push(Math.cos((i / N) * TAU)); SN.push(Math.sin((i / N) * TAU)); }

// Path pieces: each adds subpaths to the current path; the caller begins, fills and strokes.
function circ(x, y, r) { r = Math.max(0.1, r); c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }

// A soft blob: a circle whose edge breathes in a few lobes.
function blob(x, y, r, s, amp, ph = 0) {
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    const w = 1 + amp * (0.6 * Math.sin(3 * a + s * 20 + ph) + 0.4 * Math.sin(5 * a - s * 31 + ph * 0.6));
    const px = x + CS[i] * r * w, py = y + SN[i] * r * w;
    if (i) c.lineTo(px, py); else c.moveTo(px, py);
  }
  c.closePath();
}
// An open wobbly arc (a fingerprint ridge, a brush stroke round a ring).
function blobArc(x, y, r, a0, a1, s, amp) {
  const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 0.28));
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n, w = 1 + amp * Math.sin(4 * a + s * 20);
    const px = x + Math.cos(a) * r * w, py = y + Math.sin(a) * r * w;
    if (i) c.lineTo(px, py); else c.moveTo(px, py);
  }
}
// A pixel circle: points round the ring snapped to the grid and joined by right-angle steps.
function stepRing(x, y, r, p = PX) {
  const n = clamp(Math.round((TAU * r) / (p * 2.5)), 8, 56);
  let ly = 0;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU, qx = snap(x + Math.cos(a) * r, p), qy = snap(y + Math.sin(a) * r, p);
    if (!i) c.moveTo(qx, qy); else { c.lineTo(qx, ly); c.lineTo(qx, qy); }
    ly = qy;
  }
  c.closePath();
}
// A dashed circle as n short arcs (subpaths): cheaper than a dash pattern, which is a slow path effect.
function dashCircle(x, y, r, n, duty, rot = 0) {
  if (r <= 1) return;
  const st = TAU / n, len = st * duty;
  for (let i = 0; i < n; i++) { const a = rot + i * st; c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); c.arc(x, y, r, a, a + len); }
}
// A ring of pixel blocks: z-sized squares on the grid all round the edge, for one fill (no stroke).
function pixRing(x, y, r, z) {
  const n = clamp(Math.round((TAU * r) / z), 8, 120);
  let lx = NaN, ly = NaN;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, qx = snap(x + Math.cos(a) * r, z), qy = snap(y + Math.sin(a) * r, z);
    if (qx === lx && qy === ly) continue;
    c.rect(qx - z / 2, qy - z / 2, z, z);
    lx = qx; ly = qy;
  }
}
// A jagged ring: alternating spikes and notches, irregular by the seed.
function jag(x, y, r, s, depth = 0.08, step = 14) {
  const n = clamp(Math.round((TAU * r) / step) & ~1, 10, BUSY ? 24 : 36);
  for (let i = 0; i <= n; i++) {
    const j = i % n, a = ((j + 0.35 * (h1(s, j) - 0.5)) / n) * TAU + s * TAU;
    const rr = r * (j & 1 ? 1 - depth * (0.5 + h1(s, j + 50)) : 1 + depth * 0.4 * h1(s, j + 90));
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i) c.lineTo(px, py); else c.moveTo(px, py);
  }
  c.closePath();
}
// n zigzag cracks from r0 out to r1, spread over the angles a0 .. a0 + spread.
function cracks(x, y, r0, r1, s, n, a0 = 0, spread = TAU) {
  for (let k = 0; k < n; k++) {
    const a = a0 + ((k + 0.5) / n) * spread + (h1(s, k) - 0.5) * (spread / n) * 0.7;
    c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    for (let j = 1; j <= 3; j++) {
      const rr = r0 + ((r1 - r0) * j) / 3, aa = a + (h1(s, k * 7 + j) - 0.5) * (j < 3 ? 0.4 : 0.15);
      c.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr);
    }
  }
}
// n small triangular chips thrown out past radius r as k goes 0 .. 1.
function chips(x, y, r, s, n, k, a0 = 0, spread = TAU) {
  for (let i = 0; i < n; i++) {
    const a = a0 + h1(s, i + 200) * spread, d = r * (0.95 + 0.5 * k * (0.6 + h1(s, i + 300))), z = 2 + 2.2 * h1(s, i + 400);
    const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d, sp = a + k * 7 + i;
    c.moveTo(px + Math.cos(sp) * z, py + Math.sin(sp) * z);
    c.lineTo(px + Math.cos(sp + 2.3) * z, py + Math.sin(sp + 2.3) * z);
    c.lineTo(px + Math.cos(sp + 4.1) * z * 0.6, py + Math.sin(sp + 4.1) * z * 0.6);
    c.closePath();
  }
}
// n short radial ticks from radius r, len long, starting at angle rot.
function ticks(x, y, r, len, n, rot) {
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    c.moveTo(x + ca * r, y + sa * r); c.lineTo(x + ca * (r + len), y + sa * (r + len));
  }
}
// Staff arcs: `lines` concentric partial arcs gap px apart, each a little shorter and turned on from the last.
// Returns the end angle of the outer arc (for a curl).
function staff(x, y, r, s, rot, lines = 3, gap = 4, span = 0.62) {
  const a0 = rot + s * TAU;
  for (let j = 0; j < lines; j++) {
    const rr = r - j * gap;
    if (rr <= 1) break;
    const b0 = a0 + j * 0.9, b1 = b0 + TAU * (span - 0.08 * j);
    c.moveTo(x + Math.cos(b0) * rr, y + Math.sin(b0) * rr); c.arc(x, y, rr, b0, b1);
  }
  return a0 + TAU * span;
}
// A small curling flourish starting at (x, y), heading `a`, winding in the `dir` way.
function curl(x, y, a, size, dir = 1) {
  c.moveTo(x, y);
  let px = x, py = y, h = a, st = size * 0.42;
  for (let i = 0; i < 8; i++) { h += dir * 0.62; st *= 0.8; px += Math.cos(h) * st; py += Math.sin(h) * st; c.lineTo(px, py); }
}
// A curl at the end of an arc of radius r ending at angle a (heading on round the arc, curling inward).
function arcCurl(x, y, r, a, size) { curl(x + Math.cos(a) * r, y + Math.sin(a) * r, a + Math.PI / 2, size, 1); }
// A soft five-point star (rounded points).
function softStar(x, y, r, rot) {
  for (let i = 0; i <= 10; i++) {
    const a = rot + (i / 10) * TAU - Math.PI / 2, rr = i & 1 ? r * 0.48 : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (!i) c.moveTo(px, py);
    else { const m = rot + ((i - 0.5) / 10) * TAU - Math.PI / 2, mr = r * 0.7; c.quadraticCurveTo(x + Math.cos(m) * mr, y + Math.sin(m) * mr, px, py); }
  }
  c.closePath();
}
// A four-point sparkle.
function sparkle(x, y, r, rot) {
  for (let i = 0; i <= 8; i++) {
    const a = rot + (i / 8) * TAU, rr = i & 1 ? r * 0.28 : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i) c.lineTo(px, py); else c.moveTo(px, py);
  }
  c.closePath();
}
// A crescent facing `a`: outer arc r, inner arc cut back by `cut`.
function lune(x, y, r, a, half, cut) {
  c.moveTo(x + Math.cos(a - half) * r, y + Math.sin(a - half) * r);
  c.arc(x, y, r, a - half, a + half);
  const bx = x - Math.cos(a) * r * cut, by = y - Math.sin(a) * r * cut;
  c.arc(bx, by, r * (1 - cut * 0.4), a + half * 0.92, a - half * 0.92, true);
  c.closePath();
}
// Bracket corners of a square of half-size h round (x, y), arm len long, turned by rot.
function brackets(x, y, h, len, rot) {
  for (let i = 0; i < 4; i++) {
    const a = rot + Math.PI / 4 + (i * Math.PI) / 2, cx = x + Math.cos(a) * h * Math.SQRT2, cy = y + Math.sin(a) * h * Math.SQRT2;
    const a1 = a + Math.PI * 0.75, a2 = a - Math.PI * 0.75;
    c.moveTo(cx + Math.cos(a1) * len, cy + Math.sin(a1) * len); c.lineTo(cx, cy); c.lineTo(cx + Math.cos(a2) * len, cy + Math.sin(a2) * len);
  }
}
// Pixel corners of the square (x0, y0, z): four L marks.
function corners(x0, y0, z, len) {
  c.moveTo(x0, y0 + len); c.lineTo(x0, y0); c.lineTo(x0 + len, y0);
  c.moveTo(x0 + z - len, y0); c.lineTo(x0 + z, y0); c.lineTo(x0 + z, y0 + len);
  c.moveTo(x0 + z, y0 + z - len); c.lineTo(x0 + z, y0 + z); c.lineTo(x0 + z - len, y0 + z);
  c.moveTo(x0 + len, y0 + z); c.lineTo(x0, y0 + z); c.lineTo(x0, y0 + z - len);
}
// A dashed line as subpaths (on px drawn, off px skipped, marching by `ofs`): cheaper than a dash pattern, and it
// leaves no dash state behind for the danger strokes drawn later.
function dashLine(x1, y1, x2, y2, on, off, ofs = 0) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  const ux = dx / len, uy = dy / len, st = on + off;
  for (let d = (((ofs % st) + st) % st) - st; d < len; d += st) {
    const a = Math.max(0, d), b = Math.min(len, d + on);
    if (b > a) { c.moveTo(x1 + ux * a, y1 + uy * a); c.lineTo(x1 + ux * b, y1 + uy * b); }
  }
}
// Staff bundles: `n` groups of `lines` concentric arcs (gap apart) spread evenly round (x, y), each `span` radians
// long and curled at its end. The form of an Orchestra boom: it shows the reach without closing a circle.
// The outer line of each bundle goes on the current path; the inner ones on `inner` (an array of [x, y, r, a0, a1]).
function staffBundles(x, y, r, rot, n, span, lines, gap, inner, curlSize) {
  for (let b = 0; b < n; b++) {
    const a0 = rot + (b / n) * TAU, a1 = a0 + span;
    c.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r); c.arc(x, y, r, a0, a1);
    if (curlSize > 0) arcCurl(x, y, r, a1, curlSize);
    for (let j = 1; j < lines; j++) { const rr = r - j * gap; if (rr > 1) inner.push(x, y, rr, a0 + j * 0.12, a1 - j * 0.1); }
  }
}
const INNER = [];
function strokeInner(a) {
  if (!INNER.length) return;
  c.beginPath();
  for (let i = 0; i < INNER.length; i += 5) { const x = INNER[i], y = INNER[i + 1], r = INNER[i + 2], a0 = INNER[i + 3]; c.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r); c.arc(x, y, r, a0, INNER[i + 4]); }
  INNER.length = 0;
  al(a); c.lineWidth = HL; c.stroke();
}
// A remix's gold accent: a quarter arc (or, in 8-Bit, three gold pixels) on the edge of the attack, never a closed
// outline. Gold rings round things are how elites are marked, so the band's gold stays partial.
function goldMark(x, y, r, a, style, rot) {
  if (style === 'chip') {
    c.beginPath();
    for (let i = -1; i <= 1; i++) { const an = rot + i * 0.3; c.rect(snap(x + Math.cos(an) * r, 2) - 2, snap(y + Math.sin(an) * r, 2) - 2, 4, 4); }
    c.fillStyle = GOLD; alG(0.9 * a); c.fill();
    return;
  }
  c.beginPath(); c.moveTo(x + Math.cos(rot - 0.78) * r, y + Math.sin(rot - 0.78) * r); c.arc(x, y, r, rot - 0.78, rot + 0.78);
  c.strokeStyle = GOLD; c.lineCap = 'round'; alG(0.85 * a); c.lineWidth = 1.4; c.stroke();
}

// ------------------------------------------------------------------ areas: pulses, landings, kill pops

export function area(f) {
  const L = f._L ?? (f._L = lookOf(f.src));
  const k = f.age / f.life, a = 1 - k;
  if (a <= 0.01) return;
  const x = f.x, y = f.y, r = f.r * (0.7 + 0.3 * k), col = f.color, s = seedOf(f);
  c.fillStyle = col; c.strokeStyle = col;
  if (!L.style) {
    // The game's own (a remix landing, a Drop): the plain ring.
    if (f.fill > 0) { al(Math.min(0.14, f.fill * 0.5) * a); c.beginPath(); circ(x, y, r); c.fill(); }
    al(0.8 * a); c.lineWidth = 2.5 * a + 0.5; c.beginPath(); circ(x, y, r); c.stroke();
    return;
  }
  if (!(f.fill > 0)) { pop(L, x, y, r, a, s); return; }
  const kind = (f.kind === 'strike' && L.land) || (f.kind === 'mine' && L.blast) || L.area;
  const fill = Math.min(0.15, f.fill * 0.5) * a;
  // Strokes here are hairlines (1 px): a wide stroke round a many-sided path is the costliest thing a busy frame
  // draws, and an area wants a thin outline anyway. Weight comes from doubling a line, not from widening it.
  c.lineJoin = 'bevel'; c.lineWidth = HL;
  switch (kind) {
    case 'reticle':
      c.beginPath(); circ(x, y, r); al(fill); c.fill(); al(0.95 * a); c.stroke();
      c.beginPath(); circ(x, y, r - 1.5); al(0.5 * a); c.stroke();
      if (BUSY) break;
      c.strokeStyle = tint(col); al(0.6 * a);
      c.beginPath(); circ(x, y, r * 0.62); ticks(x, y, r + 2, 5, 4, s * TAU + k * 0.8); c.stroke();
      break;
    case 'starburst':
      c.beginPath(); circ(x, y, r * 0.55); al(fill); c.fill(); al(0.8 * a); c.stroke();
      c.strokeStyle = tint(col); al(a);
      c.beginPath(); ticks(x, y, r * 0.3, r * 0.85, 8, s * TAU); ticks(x, y, r * 0.3, r * 0.6, 8, s * TAU + Math.PI / 8); c.stroke();
      break;
    case 'splash': {
      // Ink: a blotchy edge inked twice (thick-thin), an inner wash line and spatter round it.
      c.beginPath(); circ(x, y, r * 0.97); al(fill); c.fill();
      c.beginPath(); blob(x, y, r, s, 0.08, k * 2); blob(x, y, r - 2.2, s + 0.02, 0.085, k * 2 + 0.4); al(0.9 * a); c.stroke();
      if (!BUSY) { c.beginPath(); blob(x, y, r * 0.8, s + 0.3, 0.1, k * 3); al(0.45 * a); c.stroke(); }
      c.beginPath();
      for (let i = 0, n = BUSY ? 4 : L.spatter || 6; i < n; i++) {
        const aa = h1(s, i) * TAU, d = r * (1.1 + 0.32 * h1(s, i + 9) + 0.25 * k), z = 1.2 + 2.4 * h1(s, i + 17);
        circ(x + Math.cos(aa) * d, y + Math.sin(aa) * d, z);
      }
      al(0.8 * a); c.fill();
      break;
    }
    case 'rattle':
      c.beginPath(); circ(x, y, r * 0.95); al(fill * 0.5); c.fill();
      c.beginPath(); blob(x, y, r, s, 0.1, T * 9); if (!BUSY) blob(x, y, r * 0.66, s + 0.5, 0.14, -T * 11); al(0.9 * a); c.stroke();
      break;
    case 'print': {
      // A finger pad on the string: an oval thumb print (a few straight-ish ridges across it, no circles) with the
      // plucked string under it, vibrating out past both ends of the pad.
      const an = (f.mark?.a ?? s * TAU), ca = Math.cos(an), sa = Math.sin(an), ry = r * 0.62;
      c.beginPath(); c.ellipse(x, y, r, ry, an, 0, TAU); al(fill); c.fill();
      c.lineWidth = TH; c.lineCap = 'round'; al(0.95 * a); c.stroke();
      c.beginPath();
      for (let j = -2; j <= 2; j++) {
        if (BUSY && j & 1) continue;
        const o = j * ry * 0.3, hl = r * Math.sqrt(Math.max(0, 1 - (o / ry) * (o / ry))) * 0.72, bw = (h1(s, j + 5) - 0.5) * 3;
        c.moveTo(x - ca * hl - sa * o, y - sa * hl + ca * o); c.quadraticCurveTo(x - sa * (o + bw + 2), y + ca * (o + bw + 2), x + ca * hl - sa * o, y + sa * hl + ca * o);
      }
      c.lineWidth = HL; al(0.7 * a); c.stroke();
      const sl = r * 1.55, amp = 3 * a, ph = T * 50 + s * 9;
      c.beginPath(); c.moveTo(x - sa * sl, y + ca * sl);
      for (let i = 1; i <= 12; i++) { const t = i / 12, o = Math.sin(t * Math.PI) * amp * Math.sin(ph + t * 9); c.lineTo(x - sa * sl * (1 - 2 * t) + ca * o, y + ca * sl * (1 - 2 * t) + sa * o); }
      c.strokeStyle = tint(col); al(0.9 * a); c.lineWidth = HL * 1.5; c.stroke();
      break;
    }
    case 'cymring': {
      // A cymbal rung: one smooth thin ring at the reach and a few short spark ticks off it, in the light tint (a
      // warm color at a low alpha must never darken toward the danger hue).
      c.strokeStyle = tint(col);
      c.beginPath(); circ(x, y, r); al(0.9 * a); c.lineWidth = HL * 1.5; c.stroke();
      c.beginPath(); ticks(x, y, r + 2, 4 + 6 * k, BUSY ? 6 : 8, s * TAU + k * 0.5); al(0.85 * a); c.lineWidth = HL; c.stroke();
      break;
    }
    case 'shatter': {
      // Breakdown's landing: a hard burst of long and short spikes, chips flying off and a gold crack through it.
      const n = BUSY ? 10 : 14, rot = s * TAU;
      c.beginPath();
      for (let i = 0; i <= n * 2; i++) { const an = rot + (i / (n * 2)) * TAU, rr = i & 1 ? r * (0.42 + 0.1 * h1(s, i)) : r * (0.9 + 0.2 * h1(s, i + 40)); const px = x + Math.cos(an) * rr, py = y + Math.sin(an) * rr; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
      c.closePath(); c.lineJoin = 'miter'; al(Math.min(0.07, fill * 0.5)); c.fill();
      c.strokeStyle = tint(col); al(0.95 * a); c.lineWidth = TH * 0.8; c.stroke();
      if (!BUSY) { c.beginPath(); chips(x, y, r * 0.9, s, 6, k); c.fillStyle = tint(col); al(0.9 * a); c.fill(); }
      c.beginPath(); cracks(x, y, 2, r * 0.85, s + 0.5, 1, rot + 0.4, 0.4); c.strokeStyle = GOLD; alG(0.95 * a); c.lineWidth = 1.4; c.stroke();
      return;
    }
    case 'ripple':
      for (let j = 0, n = BUSY ? 1 : 3; j < n; j++) {
        const u = (k * 0.9 + j / 3) % 1;
        c.beginPath(); blob(x, y, r * (0.3 + 0.75 * u), s + j, 0.04); al((1 - u) * 0.9 * a); c.stroke();
      }
      c.beginPath(); circ(x, y, r); al(fill * 0.7); c.fill();
      break;
    case 'softstar':
      if (!BUSY) { c.beginPath(); circ(x, y, r * 0.98); al(fill * 0.35); c.fill(); }
      c.beginPath(); blob(x, y, r, s, 0.04, T * 2); al(0.6 * a); c.stroke();
      c.strokeStyle = tint(col); al(a);
      c.beginPath(); softStar(x, y, r * 0.5, s * TAU + k * 0.6); softStar(x, y, r * 0.5 - 1.5, s * TAU + k * 0.6); c.stroke();
      break;
    case 'stepped':
      // A ring of pixels: blocks on the grid round the edge (filled squares, no stroke at all).
      c.beginPath(); circ(x, y, r * 0.95); al(fill); c.fill();
      c.beginPath(); pixRing(x, y, r, PX); al(0.95 * a); c.fill();
      break;
    case 'block': {
      const z = snap((f.mark?.block || r * 1.6) * (0.92 + 0.16 * k)), x0 = snap(x) - z / 2, y0 = snap(y) - z / 2;
      al(Math.min(0.3, fill * 2)); c.fillRect(x0, y0, z, z);
      al(a); c.fillRect(x0, y0, z, 3); c.fillRect(x0, y0 + z - 3, z, 3); c.fillRect(x0, y0, 3, z); c.fillRect(x0 + z - 3, y0, 3, z);
      c.fillStyle = tint(col); al(0.85 * a); c.fillRect(x0 + 5, y0 + 5, Math.max(4, z * 0.32), 3); c.fillRect(x0 + 5, y0 + 5, 3, Math.max(4, z * 0.32));
      break;
    }
    case 'cracked':
      c.beginPath(); circ(x, y, r * 0.95); al(fill); c.fill();
      c.beginPath(); jag(x, y, r, s); jag(x, y, r - 1.8, s, 0.07); cracks(x, y, r * 0.15, r * 0.98, s, BUSY ? 3 : 4); al(0.95 * a); c.stroke();
      if (BUSY) break;
      c.fillStyle = tint(col); al(0.85 * a); c.beginPath(); chips(x, y, r, s, 5, k); c.fill();
      break;
    case 'crescent': {
      const ang = f.mark?.rank?.a ?? s * TAU;
      c.beginPath(); lune(x, y, r, ang, 1.15, 0.38); al(Math.min(0.15, fill)); c.fill();
      c.strokeStyle = tint(col); al(0.95 * a);
      c.beginPath(); c.moveTo(x + Math.cos(ang - 1.15) * r, y + Math.sin(ang - 1.15) * r); c.arc(x, y, r, ang - 1.15, ang + 1.15); arcCurl(x, y, r, ang + 1.15, 9); c.lineWidth = TH; c.stroke();
      const g2 = gapOf(3);
      c.beginPath(); c.moveTo(x + Math.cos(ang - 1) * (r - g2), y + Math.sin(ang - 1) * (r - g2)); c.arc(x, y, r - g2, ang - 1, ang + 1); c.lineWidth = HL; c.stroke();
      break;
    }
    case 'blob':
      c.beginPath(); circ(x, y, r * 0.97); al(fill); c.fill();
      c.beginPath(); blob(x, y, r, s, 0.07, k * 2); blob(x, y, r - 2, s + 0.02, 0.075, k * 2 + 0.4); al(0.9 * a); c.stroke();
      if (!BUSY) { c.beginPath(); blob(x, y, r * 0.84, s + 0.4, 0.09, k * 3); al(0.4 * a); c.stroke(); }
      break;
    case 'staff':
    default: {
      // Two staff bundles (a 1.8 px outer line, hairlines inside, 5 screen px or more apart) turning slowly round the
      // spot, curled at their ends: the reach shows without closing a circle.
      c.beginPath(); circ(x, y, r); al(fill * 0.6); c.fill();
      c.strokeStyle = tint(col);
      c.beginPath(); staffBundles(x, y, r, s * TAU + T * 0.7 + k, 2, TAU * 0.3, BUSY ? 2 : 3, gapOf(r * 0.09), INNER, Math.min(14, 5 + r * 0.1));
      al(0.95 * a); c.lineWidth = TH; c.stroke();
      strokeInner(0.75 * a);
      break;
    }
  }
  if (L.rx) goldMark(x, y, r + 3, a, L.style, s * TAU + Math.PI);
}

// A kill or a breath: the style's smallest mark, one stroke.
function pop(L, x, y, r, a, s) {
  al(0.75 * a); c.beginPath();
  switch (L.pop) {
    case 'square': { const z = snap(r * 1.5); c.lineWidth = 2; c.lineJoin = 'miter'; c.rect(snap(x) - z / 2, snap(y) - z / 2, z, z); break; }
    case 'burst': c.lineWidth = HL; ticks(x, y, r * 0.45, r * 0.6, BUSY ? 4 : 6, s * TAU); break;
    case 'arc': c.lineWidth = HL; staff(x, y, r, s, 0, BUSY ? 1 : 2, gapOf(3)); break;
    case 'blob': c.lineWidth = HL; if (BUSY) circ(x, y, r); else blob(x, y, r, s, 0.08); break;
    default: c.lineWidth = HL; circ(x, y, r);
  }
  c.stroke();
}

// ------------------------------------------------------------------ rings: expanding shockwaves

export function ring(o) {
  const L = o._L ?? (o._L = lookOf(o.src));
  const k = clamp(o.t / o.dur, 0, 1), a = (1 - k) * 0.9 + 0.05;
  const x = o.x, y = o.y, rr = o.r, w = o.width * (1 - 0.6 * k), col = o.color, s = seedOf(o);
  if (!(rr > 1)) return;
  c.strokeStyle = col;
  if (!L.style) {
    c.beginPath(); circ(x, y, rr); al(a); c.lineWidth = w; c.stroke();
    c.strokeStyle = '#ffffff'; al(a * 0.2); c.lineWidth = 1.5; c.stroke();
    return;
  }
  switch (L.ring) {
    case 'neon': case 'pump': {
      c.beginPath(); circ(x, y, rr); al(0.2 * a); c.lineWidth = w * 1.4 + 2; c.stroke();
      c.strokeStyle = tint(col); al(a); c.lineWidth = Math.max(1.2, w * 0.28); c.stroke();
      if (L.ring === 'pump' || o.kb < 0) {
        // Chevrons pointing in: a ring that pulls.
        const n = clamp(Math.round(rr / 16), 6, 16), z = Math.min(7, 3 + w * 0.3);
        c.beginPath();
        for (let i = 0; i < n; i++) {
          const an = s * TAU + (i / n) * TAU + k * 0.6, ca = Math.cos(an), sa = Math.sin(an);
          c.moveTo(x + ca * (rr + z) - sa * z, y + sa * (rr + z) + ca * z); c.lineTo(x + ca * (rr - z), y + sa * (rr - z)); c.lineTo(x + ca * (rr + z) + sa * z, y + sa * (rr + z) - ca * z);
        }
        c.lineWidth = 1.5; c.lineJoin = 'miter'; c.stroke();
      }
      break;
    }
    case 'brush': case 'brush2': {
      // Thick-thin ink: the edge inked twice as hairlines a little apart, wobbling out of phase, so the weight comes
      // from the doubling (a wide stroke round a many-sided blob is the costliest thing a frame draws).
      const amp = Math.min(0.08, 5 / rr), d = Math.min(3, 1 + w * 0.2);
      c.lineJoin = 'bevel';
      c.beginPath(); blob(x, y, rr, s, amp, T * 3); blob(x, y, Math.max(1, rr - d), s + 0.03, amp * 1.1, T * 3 + 0.5);
      al(0.9 * a); c.lineWidth = HL; c.stroke();
      if (BUSY) break;
      c.beginPath(); blob(x, y, Math.max(1, rr * 0.95 - 2 - d), s + 0.4, amp * 1.3, T * 2.2);
      if (L.ring === 'brush2') { blob(x, y, rr * 0.82, s + 0.7, amp, -T * 2); blob(x, y, rr * 0.82 - d, s + 0.73, amp, -T * 2 + 0.5); }
      al(0.45 * a); c.stroke();
      break;
    }
    case 'breath': {
      // A soft wave that breathes: a doubled hairline edge and a thinner echo lagging inside.
      const amp = Math.min(0.05, 4 / rr);
      c.lineJoin = 'bevel';
      c.beginPath(); blob(x, y, rr, s, amp, T * 1.6); blob(x, y, Math.max(1, rr - 2.5), s, amp, T * 1.6 + 0.3);
      al(0.85 * a); c.lineWidth = HL; c.stroke();
      if (!BUSY) { c.beginPath(); blob(x, y, Math.max(1, rr - 8 - w * 0.6), s + 0.5, amp, T * 1.2 + 1); al(0.45 * a); c.stroke(); }
      break;
    }
    case 'square': {
      c.lineJoin = 'miter'; c.lineCap = 'butt';
      const q = snap(rr, 6);
      c.beginPath(); c.rect(snap(x) - q, snap(y) - q, 2 * q, 2 * q);
      al(a); c.lineWidth = Math.max(3, Math.round(w * 0.6)); c.stroke();
      break;
    }
    case 'stepped': {
      // A ring of pixel blocks (one fill, no stroke round a many-cornered path).
      c.beginPath(); pixRing(x, y, snap(rr, 6), Math.max(4, snap(w * 0.6, 2))); al(a); c.fill();
      break;
    }
    case 'jagged': {
      c.lineJoin = 'bevel';
      c.beginPath(); jag(x, y, rr, s, 0.07, 14); jag(x, y, Math.max(1, rr - 2), s, 0.07, 14); al(a); c.lineWidth = HL; c.stroke();
      if (BUSY) break;
      c.strokeStyle = tint(col); al(0.8 * a); c.lineWidth = 1.2;
      c.beginPath(); ticks(x, y, rr + 3, 6 + w * 0.4, 8, s * TAU + k); c.stroke();
      break;
    }
    case 'staff':
    default: {
      // A boom as three staff bundles riding out on the wave, never a full circle.
      c.strokeStyle = tint(col);
      c.beginPath(); staffBundles(x, y, rr, s * TAU + T * 1.1, 3, TAU * 0.2, BUSY ? 2 : 3, gapOf(w * 0.45), INNER, Math.min(12, 4 + rr * 0.05));
      al(0.95 * a); c.lineWidth = TH; c.stroke();
      strokeInner(0.7 * a);
      break;
    }
  }
  if (L.rx) goldMark(x, y, rr + 2, a, L.style, s * TAU + k * 2);
}

// ------------------------------------------------------------------ beams and zaps

// An instant hit (a beam that lives under a quarter second) keeps an alpha floor of 0.85 under the load budget: it is
// on screen for a few frames only, and the late game's loudest weapons are exactly these.
export function beam(b) {
  const fa = FA;
  if (b.life < 0.25) FA = Math.max(FA, 0.85);
  beam0(b);
  FA = fa;
}
function beam0(b) {
  const L = b._L ?? (b._L = lookOf(b.src));
  const k = 1 - b.age / b.life;
  if (k <= 0) return;
  const x1 = b.x1, y1 = b.y1, x2 = b.x2, y2 = b.y2, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux, w = b.width, col = b.color, s = seedOf(b);
  c.strokeStyle = col; c.fillStyle = col; c.lineCap = 'round'; c.lineJoin = 'bevel';
  if (!L.style) {
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
    al(0.35 * k); c.lineWidth = w * 2.2 * k; c.stroke();
    c.strokeStyle = '#ffffff'; al(0.9 * k); c.lineWidth = Math.max(1, w * 0.45 * k); c.stroke();
    return;
  }
  switch (L.beam) {
    case 'lance': {
      // A sub spear thrown from you: a solid tapered shaft (thin at your end, thickening toward the head), a bright
      // core, chevrons along it all pointing out to a solid chevron head. No band, no rails: nothing of the band
      // looks like an enemy's charge lane. It stays bright through its short life and thins out instead of fading.
      const ka = Math.min(1, 0.35 + k), hw = Math.max(5, w * 0.5) * (0.55 + 0.45 * k), s0 = Math.max(1.5, hw * 0.12), s1 = Math.max(2.5, hw * 0.3), hl = Math.min(len * 0.3, hw * 1.6);
      const hx = x2 - ux * hl, hy = y2 - uy * hl;
      c.beginPath();
      c.moveTo(x1 + nx * s0, y1 + ny * s0); c.lineTo(hx + nx * s1, hy + ny * s1); c.lineTo(hx + nx * hw * 0.62, hy + ny * hw * 0.62);
      c.lineTo(x2, y2);
      c.lineTo(hx - nx * hw * 0.62, hy - ny * hw * 0.62); c.lineTo(hx - nx * s1, hy - ny * s1); c.lineTo(x1 - nx * s0, y1 - ny * s0); c.closePath();
      c.lineJoin = 'miter'; al(0.75 * ka); c.fill();
      // Chevrons on the shaft, every 30 px, opening back toward you and growing toward the head.
      c.beginPath();
      const n = Math.min(20, Math.floor((len - hl) / 30));
      for (let i = 1; i <= n; i++) {
        const d = len - hl - i * 30;
        if (d < 14) break;
        const px = x1 + ux * d, py = y1 + uy * d, z = s0 + (s1 - s0) * (d / len) + 3.5;
        c.moveTo(px - ux * z + nx * z, py - uy * z + ny * z); c.lineTo(px, py); c.lineTo(px - ux * z - nx * z, py - uy * z - ny * z);
      }
      c.strokeStyle = tint(col); al(ka); c.lineWidth = 1.6; c.lineCap = 'butt'; c.stroke();
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(hx, hy); c.lineWidth = 2.5; c.lineCap = 'round'; c.stroke();
      c.beginPath(); c.moveTo(hx + nx * hw * 0.62, hy + ny * hw * 0.62); c.lineTo(x2, y2); c.lineTo(hx - nx * hw * 0.62, hy - ny * hw * 0.62);
      c.lineJoin = 'miter'; c.lineWidth = 2; c.stroke();
      break;
    }
    case 'laser': {
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
      al(0.16 * k); c.lineWidth = w * 1.1; c.stroke();
      al(0.35 * k); c.lineWidth = w * 0.45; c.stroke();
      c.strokeStyle = tint(col); al(k); c.lineWidth = Math.max(1.2, w * 0.16); c.stroke();
      c.beginPath(); circ(x1 + ux * 6, y1 + uy * 6, 2.5 + w * 0.12); c.fillStyle = tint(col); c.fill();
      const f = 3 + w * 0.5;
      c.beginPath(); c.moveTo(x2 - nx * f, y2 - ny * f); c.lineTo(x2 + nx * f, y2 + ny * f); c.moveTo(x2 - ux * f * 0.6, y2 - uy * f * 0.6); c.lineTo(x2 + ux * f * 0.6, y2 + uy * f * 0.6);
      c.lineWidth = 1.2; c.stroke();
      break;
    }
    case 'blocks': case 'cross': case 'line': {
      const line = L.beam === 'line', z = line ? snap(Math.max(8, w * 0.82)) : snap(clamp(w * (L.beam === 'cross' ? 0.6 : 0.5), 4, 14));
      const step = L.beam === 'blocks' ? z * 1.6 : z + PX;
      const n = Math.min(90, Math.floor(len / step)), blink = Math.floor(T * 12) & 1;
      c.beginPath();
      for (let i = 0; i <= n; i++) {
        if (L.beam === 'cross' && k < 0.45 && ((i + blink) & 1)) continue;
        c.rect(snap(x1 + ux * i * step) - z / 2, snap(y1 + uy * i * step) - z / 2, z, z);
      }
      al((line ? 0.55 : 0.85) * k); c.fill();
      if (line) { c.strokeStyle = tint(col); c.lineJoin = 'miter'; al(0.95 * k); c.lineWidth = 2; c.stroke(); }
      break;
    }
    case 'wire8': {
      // A live wire: a right-angle cable of marching dashes, a square node at each end.
      const ax = snap(x1), ay = snap(y1), bx = snap(x2), by = snap(y2);
      const o = T * 60, l1 = Math.abs(bx - ax);
      c.beginPath(); dashLine(ax, ay, bx, ay, 6, 4, o); dashLine(bx, ay, bx, by, 6, 4, o - l1);
      c.lineCap = 'butt'; al(k); c.lineWidth = 3; c.stroke();
      c.fillStyle = tint(col); c.fillRect(bx - 4, by - 4, 8, 8);
      break;
    }
    case 'wire': {
      // A taut jagged wire crackling between two points, sparks at both ends.
      const n = clamp(Math.floor(len / 22), 3, 24), q = (s + Math.floor(T * 24) * 0.6180339887) % 1;
      c.beginPath(); c.moveTo(x1, y1);
      for (let i = 1; i < n; i++) { const o = (i & 1 ? 1 : -1) * (2 + 5 * h1(q, i)); c.lineTo(x1 + ux * (len * i) / n + nx * o, y1 + uy * (len * i) / n + ny * o); }
      c.lineTo(x2, y2);
      c.lineJoin = 'miter'; al(0.9 * k); c.lineWidth = 2.4; c.stroke();
      c.strokeStyle = tint(col); al(k); c.lineWidth = 1; c.stroke();
      c.beginPath(); ticks(x1, y1, 3, 6, 5, T * 9); ticks(x2, y2, 3, 6, 5, -T * 9); c.lineWidth = 1.2; c.stroke();
      break;
    }
    case 'blade': {
      // A hard tapered blade with notched edges.
      const hw = w * 0.55, n = 5;
      c.beginPath(); c.moveTo(x1 + nx * hw, y1 + ny * hw);
      for (let i = 1; i < n; i++) { const t = i / n, o = hw * (1 - t) * (i & 1 ? 0.7 : 1); c.lineTo(x1 + ux * len * t + nx * o, y1 + uy * len * t + ny * o); }
      c.lineTo(x2, y2);
      for (let i = n - 1; i >= 1; i--) { const t = i / n, o = hw * (1 - t) * (i & 1 ? 1 : 0.75); c.lineTo(x1 + ux * len * t - nx * o, y1 + uy * len * t - ny * o); }
      c.lineTo(x1 - nx * hw, y1 - ny * hw); c.closePath();
      c.lineJoin = 'miter'; al(0.32 * k); c.fill(); c.strokeStyle = tint(col); al(0.95 * k); c.lineWidth = 1.4; c.stroke();
      break;
    }
    case 'edge':
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); al(0.22 * k); c.lineWidth = w * 0.6; c.stroke();
      c.strokeStyle = tint(col); al(k); c.lineWidth = 2; c.stroke();
      break;
    case 'string': {
      // A harp frame: a peg bar at each end and three parallel strings strung between them, each vibrating in its own
      // phase and settling as it fades (no sheath: the three strings are the body).
      const amp = (2 + w * 0.3) * k, ph = T * 46 + s * 20, n = 12, sp = clamp(w * 0.22, 3, 6), pb = sp * 1.8 + 3;
      const str = (off, p) => {
        c.moveTo(x1 + nx * off, y1 + ny * off);
        for (let i = 1; i <= n; i++) { const t = i / n, o = off + Math.sin(t * Math.PI) * amp * Math.sin(p + t * 3); c.lineTo(x1 + dx * t + nx * o, y1 + dy * t + ny * o); }
      };
      c.beginPath(); str(-sp, ph + 1.9); str(sp, ph + 3.7); c.strokeStyle = tint(col); al(0.9 * k); c.lineWidth = HL; c.stroke();
      c.beginPath(); str(0, ph); c.strokeStyle = tint(col); al(k); c.lineWidth = TH; c.stroke();
      c.beginPath(); c.moveTo(x1 + nx * pb, y1 + ny * pb); c.lineTo(x1 - nx * pb, y1 - ny * pb); c.moveTo(x2 + nx * pb, y2 + ny * pb); c.lineTo(x2 - nx * pb, y2 - ny * pb);
      c.lineCap = 'round'; al(k); c.lineWidth = 3.2; c.stroke();
      break;
    }
    case 'bow': {
      // A bow stroke: a slightly curved tapered line, a dot where it ends.
      const bend = (s < 0.5 ? -1 : 1) * Math.min(len * 0.14, 18), mx = (x1 + x2) / 2 + nx * bend, my = (y1 + y2) / 2 + ny * bend;
      c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo(mx, my, x2, y2);
      al(0.3 * k); c.lineWidth = Math.max(2, w * 0.5); c.stroke();
      c.strokeStyle = tint(col); al(k); c.lineWidth = TH; c.stroke();
      c.beginPath(); circ(x2, y2, 2); c.fillStyle = tint(col); c.fill();
      break;
    }
    case 'brush': {
      const w0 = w * 0.55 * k, w1 = w * 0.15, bend = (h1(s, 1) - 0.5) * w;
      const mx = (x1 + x2) / 2 + nx * bend, my = (y1 + y2) / 2 + ny * bend;
      c.beginPath(); c.moveTo(x1 + nx * w0, y1 + ny * w0);
      c.quadraticCurveTo(mx + nx * w0 * 0.7, my + ny * w0 * 0.7, x2 + nx * w1, y2 + ny * w1);
      c.lineTo(x2 - nx * w1, y2 - ny * w1);
      c.quadraticCurveTo(mx - nx * w0 * 0.7, my - ny * w0 * 0.7, x1 - nx * w0, y1 - ny * w0); c.closePath();
      al(0.4 * k); c.fill(); al(0.7 * k); c.lineWidth = HL; c.stroke();
      break;
    }
    case 'neon':
    default:
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
      al(0.2 * k); c.lineWidth = w * 0.8; c.stroke();
      c.strokeStyle = tint(col); al(k); c.lineWidth = Math.max(1.2, w * 0.2); c.stroke();
  }
  if (L.rx) { c.strokeStyle = GOLD; c.lineCap = 'round'; alG(0.9 * k); c.lineWidth = 1.2; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
}

export function zap(z) {
  const L = z._L ?? (z._L = lookOf(z.src));
  const k = 1 - z.age / z.life;
  if (k <= 0) return;
  const pts = z.pts, col = z.color;
  c.strokeStyle = col; c.fillStyle = col;
  switch (L.style ? L.zap : 'old') {
    case 'manhattan': {
      // Pixel static: right-angle hops on the grid, re-routed a few times a second, square nodes.
      const q = (Math.floor(T * 20) * 0.6180339887) % 1;
      c.beginPath();
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = snap(pts[i][0]), ay = snap(pts[i][1]), bx = snap(pts[i + 1][0]), by = snap(pts[i + 1][1]);
        const mx = snap((ax + bx) / 2 + (h1(q, i) - 0.5) * 24), my = snap((ay + by) / 2 + (h1(q, i + 7) - 0.5) * 16);
        c.moveTo(ax, ay); c.lineTo(mx, ay); c.lineTo(mx, my); c.lineTo(bx, my); c.lineTo(bx, by);
      }
      c.lineCap = 'butt'; c.lineJoin = 'miter'; al(k); c.lineWidth = Math.max(2, z.width * 0.9); c.stroke();
      c.beginPath(); for (let i = 1; i < pts.length; i++) c.rect(snap(pts[i][0]) - 3, snap(pts[i][1]) - 3, 6, 6);
      c.fillStyle = tint(col); c.fill();
      break;
    }
    case 'bolt': {
      // The jitter re-rolls 20 times a second (a hash of the clock), not every frame: it crackles without shimmering.
      const q = (seedOf(z) + Math.floor(T * 20) * 0.6180339887) % 1;
      c.beginPath();
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        c.moveTo(x1, y1);
        for (let st = 1; st <= 5; st++) { const t = st / 5, j = st < 5 ? 14 : 0; c.lineTo(x1 + (x2 - x1) * t + (h1(q, i * 16 + st) - 0.5) * j, y1 + (y2 - y1) * t + (h1(q, i * 16 + st + 8) - 0.5) * j); }
      }
      c.lineJoin = 'miter'; al(0.9 * k); c.lineWidth = z.width + 0.5; c.stroke();
      c.strokeStyle = tint(col); al(k); c.lineWidth = HL; c.stroke();
      c.beginPath(); for (let i = 1; i < pts.length; i++) ticks(pts[i][0], pts[i][1], 4, 6, 5, Math.floor(T * 20) * 0.7 + i); c.lineWidth = 1.3; c.stroke();
      break;
    }
    case 'old': {
      const q = (seedOf(z) + Math.floor(T * 20) * 0.6180339887) % 1;
      c.beginPath();
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        c.moveTo(x1, y1);
        for (let st = 1; st <= 4; st++) { const t = st / 4, j = st < 4 ? 16 : 0; c.lineTo(x1 + (x2 - x1) * t + (h1(q, i * 16 + st) - 0.5) * j, y1 + (y2 - y1) * t + (h1(q, i * 16 + st + 8) - 0.5) * j); }
      }
      al(0.9 * k); c.lineWidth = z.width; c.stroke();
      break;
    }
    default: {
      // Smooth curves for Live and Orchestra, a straight jittered line for Synth; a bright core and node dots.
      const smooth = L.style === 'organic' || L.style === 'orchestra', q = (seedOf(z) + Math.floor(T * 20) * 0.6180339887) % 1;
      c.beginPath();
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        c.moveTo(x1, y1);
        if (smooth) c.quadraticCurveTo((x1 + x2) / 2 + (y2 - y1) * 0.18, (y1 + y2) / 2 - (x2 - x1) * 0.18, x2, y2);
        else for (let st = 1; st <= 4; st++) { const t = st / 4, j = st < 4 ? 8 : 0; c.lineTo(x1 + (x2 - x1) * t + (h1(q, i * 16 + st) - 0.5) * j, y1 + (y2 - y1) * t + (h1(q, i * 16 + st + 8) - 0.5) * j); }
      }
      al(0.3 * k); c.lineWidth = z.width * 2.4; c.stroke();
      c.strokeStyle = tint(col); al(k); c.lineWidth = Math.max(1, z.width * 0.6); c.stroke();
      c.beginPath(); for (let i = 1; i < pts.length; i++) circ(pts[i][0], pts[i][1], 2.5); c.fillStyle = tint(col); c.fill();
    }
  }
}

// ------------------------------------------------------------------ bullets, batched by look and color

let UX = 1, UY = 0, SP = 0;
function dirOf(b) {
  const sp = Math.hypot(b.vx, b.vy);
  SP = sp;
  if (sp > 1) { UX = b.vx / sp; UY = b.vy / sp; } else { UX = Math.cos(b.rot); UY = Math.sin(b.rot); }
}

// Streaks along the flight: back = how far the tail reaches, from the head one radius ahead.
function streaks(list, back, k) {
  c.beginPath();
  for (const b of list) {
    dirOf(b);
    const sc = b._sc, L = (b.r * back + Math.min(SP * k, 24)) * sc;
    c.moveTo(b.x - UX * L, b.y - UY * L); c.lineTo(b.x + UX * b.r * sc, b.y + UY * b.r * sc);
  }
}
function glowCore(col, wide, core) {
  c.lineCap = 'round'; c.strokeStyle = col; al(0.3); c.lineWidth = wide; c.stroke();
  c.strokeStyle = tint(col); al(1); c.lineWidth = core; c.stroke();
}

const PAINT = {
  streak(list, col) { streaks(list, 2.5, 0.015); glowCore(col, list[0].r * 1.6, Math.max(1.4, list[0].r * 0.55)); },
  needle(list, col, rx, chev = false) {
    // A short neon needle: a thin shaft, a bright 3 px head and a double tick across its tail (a chevron of two
    // fletchings on the remix).
    const len = (b) => (b.r * 3.2 + Math.min(SP * 0.02, 10)) * b._sc;
    c.beginPath();
    for (const b of list) { dirOf(b); const L = len(b); c.moveTo(b.x - UX * L, b.y - UY * L); c.lineTo(b.x, b.y); }
    c.lineCap = 'butt'; c.strokeStyle = col; al(1); c.lineWidth = Math.max(1.6, list[0].r * 0.45); c.stroke();
    c.beginPath();
    for (const b of list) {
      dirOf(b);
      const L = len(b), z = Math.max(2.5, b.r * 0.9) * b._sc;
      for (let j = 0; j < 2; j++) {
        const d = L - j * 3, tx = b.x - UX * d, ty = b.y - UY * d;
        if (chev) { c.moveTo(tx - UX * z - UY * z, ty - UY * z + UX * z); c.lineTo(tx, ty); c.lineTo(tx - UX * z + UY * z, ty - UY * z - UX * z); }
        else { c.moveTo(tx - UY * z, ty + UX * z); c.lineTo(tx + UY * z, ty - UX * z); }
      }
    }
    c.strokeStyle = tint(col); c.lineWidth = 1.3; c.stroke();
    c.beginPath(); for (const b of list) circ(b.x, b.y, 1.7 * b._sc + 0.5); c.fillStyle = tint(col); al(1); c.fill();
  },
  needle2(list, col, rx) { PAINT.needle(list, col, rx, true); },
  dart(list, col) {
    streaks(list, 2.2, 0.012); glowCore(col, list[0].r * 1.4, Math.max(1.2, list[0].r * 0.4));
    c.beginPath(); for (const b of list) sparkle(b.x, b.y, b.r * 1.5 * b._sc, T * 9 + seedOf(b) * 6);
    c.fillStyle = tint(col); al(1); c.fill();
  },
  sparkstar(list, col) {
    c.beginPath();
    for (const b of list) { dirOf(b); const r = b.r * b._sc; for (let i = 1; i <= 3; i++) circ(b.x - UX * r * 1.8 * i, b.y - UY * r * 1.8 * i, Math.max(0.8, r * (0.45 - 0.1 * i))); }
    c.fillStyle = col; al(0.6); c.fill();
    c.beginPath(); for (const b of list) sparkle(b.x, b.y, b.r * 1.5 * b._sc, b.rot);
    c.fillStyle = tint(col); al(1); c.fill();
  },
  kite(list, col, rx, twin = false) {
    c.beginPath();
    for (const b of list) {
      dirOf(b);
      const r = b.r * b._sc, px = -UY * r * 0.72, py = UX * r * 0.72;
      c.moveTo(b.x + UX * r * 2.2, b.y + UY * r * 2.2); c.lineTo(b.x + px, b.y + py); c.lineTo(b.x - UX * r * 1.5, b.y - UY * r * 1.5); c.lineTo(b.x - px, b.y - py); c.closePath();
    }
    c.fillStyle = col; al(0.45); c.fill();
    c.strokeStyle = tint(col); al(1); c.lineWidth = 1.5; c.lineJoin = 'miter'; c.stroke();
    c.beginPath();
    for (const b of list) {
      if (!b.trail) continue;
      dirOf(b);
      const r = b.r * b._sc;
      c.moveTo(b.x - UX * r * 1.5, b.y - UY * r * 1.5);
      for (let i = 1; i <= 4; i++) { const d = r * 1.5 + i * r * 1.3, o = (i & 1 ? 1 : -1) * r * 0.7; c.lineTo(b.x - UX * d - UY * o, b.y - UY * d + UX * o); }
    }
    c.strokeStyle = col; al(0.6); c.lineWidth = 1; c.stroke();
    // The twin's outer kite (Hypersaw); a remix's gold is a chevron over the kite's nose (never a closed outline).
    if (twin) {
      c.beginPath();
      for (const b of list) {
        dirOf(b);
        const r = b.r * b._sc, px = -UY * r * 1.05, py = UX * r * 1.05;
        c.moveTo(b.x + UX * r * 3, b.y + UY * r * 3); c.lineTo(b.x + px, b.y + py); c.lineTo(b.x - UX * r * 1.9, b.y - UY * r * 1.9); c.lineTo(b.x - px, b.y - py); c.closePath();
      }
      c.strokeStyle = col; al(0.6); c.lineWidth = HL; c.stroke();
    }
    if (!rx) return;
    c.beginPath();
    for (const b of list) {
      dirOf(b);
      const r = b.r * b._sc, px = -UY * r * 0.95, py = UX * r * 0.95, tip = twin ? 3.6 : 3;
      c.moveTo(b.x + px * 0.9 + UX * r * 0.6, b.y + py * 0.9 + UY * r * 0.6); c.lineTo(b.x + UX * r * tip, b.y + UY * r * tip); c.lineTo(b.x - px * 0.9 + UX * r * 0.6, b.y - py * 0.9 + UY * r * 0.6);
    }
    c.strokeStyle = GOLD; alG(0.9); c.lineWidth = 1.3; c.stroke();
  },
  kite2(list, col, rx) { PAINT.kite(list, col, rx, true); },
  front(list, col, rx) {
    // A pressure front: each piece is its share of one straight line across the lane.
    c.beginPath();
    for (const b of list) {
      dirOf(b);
      const hw = (b.r / 0.55) * 0.5 * b._sc, ox = -UY * hw, oy = UX * hw;
      c.moveTo(b.x - ox, b.y - oy); c.lineTo(b.x + ox, b.y + oy);
      if (b.wave && (b.wave.i === 0 || b.wave.i === b.wave.n - 1)) {
        const e = b.wave.i === 0 ? -1 : 1;
        c.moveTo(b.x + e * ox - UX * 12, b.y + e * oy - UY * 12); c.lineTo(b.x + e * ox, b.y + e * oy); c.lineTo(b.x + e * ox + UX * 6, b.y + e * oy + UY * 6);
      }
    }
    c.lineCap = 'butt'; c.strokeStyle = col; al(0.26); c.lineWidth = 9; c.stroke();
    c.strokeStyle = tint(col); al(1); c.lineWidth = 2.4; c.stroke();
    for (let e = 1; e <= 2; e++) {
      c.beginPath();
      for (const b of list) { dirOf(b); const hw = (b.r / 0.55) * 0.5 * b._sc * (1 - 0.12 * e), d = 9 * e; c.moveTo(b.x - UX * d + UY * hw, b.y - UY * d - UX * hw); c.lineTo(b.x - UX * d - UY * hw, b.y - UY * d + UX * hw); }
      c.strokeStyle = col; al(e === 1 ? 0.45 : 0.2); c.lineWidth = 1.4; c.stroke();
    }
    if (rx) {
      c.beginPath();
      for (const b of list) { dirOf(b); const hw = (b.r / 0.55) * 0.5 * b._sc, d = 4; c.moveTo(b.x + UX * d - UY * hw, b.y + UY * d + UX * hw); c.lineTo(b.x + UX * d + UY * hw, b.y + UY * d - UX * hw); }
      c.strokeStyle = GOLD; alG(0.9); c.lineWidth = 1.3; c.stroke();
    }
  },
  blob(list, col) {
    c.beginPath(); for (const b of list) circ(b.x, b.y, b.r * 0.85 * b._sc);
    c.fillStyle = col; al(1); c.fill();
    c.beginPath(); for (const b of list) circ(b.x - b.r * 0.2, b.y - b.r * 0.2, b.r * 0.3 * b._sc);
    c.fillStyle = tint(col); c.fill();
  },
  wisp(list, col) {
    // A wisp: a solid head with a light core trailing a wavy ink tail (no glow sprite: small and crisp).
    c.beginPath(); for (const b of list) circ(b.x, b.y, b.r * 0.95 * b._sc);
    c.fillStyle = col; al(1); c.fill();
    c.beginPath();
    for (const b of list) {
      dirOf(b);
      const r = b.r * b._sc, L = r * 4.5, wv = Math.sin(T * 7 + seedOf(b) * 20) * r * 1.3;
      c.moveTo(b.x, b.y); c.quadraticCurveTo(b.x - UX * L * 0.5 - UY * wv, b.y - UY * L * 0.5 + UX * wv, b.x - UX * L, b.y - UY * L);
    }
    c.lineCap = 'round'; c.strokeStyle = col; al(0.55); c.lineWidth = Math.max(1.5, list[0].r * 0.4); c.stroke();
    c.beginPath(); for (const b of list) circ(b.x, b.y, b.r * 0.5 * b._sc);
    c.fillStyle = tint(col); al(1); c.fill();
  },
  pixel(list, col) {
    c.beginPath(); for (const b of list) { const z = Math.max(4, snap(b.r * 1.6 * b._sc, 2)); c.rect(snap(b.x) - z / 2, snap(b.y) - z / 2, z, z); }
    c.fillStyle = col; al(1); c.fill();
  },
  block(list, col) {
    // Bricks on the grid with a highlight corner, two smaller ghosts stepping behind; a glitched copy is torn in two.
    c.beginPath();
    for (const b of list) {
      dirOf(b);
      const z = Math.max(4, snap(b.r * 1.7 * b._sc, 2));
      for (let i = 1; i <= 2; i++) { const gz = Math.max(2, snap(z * (1 - 0.3 * i), 2)), d = z * 1.3 * i; c.rect(snap(b.x - UX * d) - gz / 2, snap(b.y - UY * d) - gz / 2, gz, gz); }
    }
    c.fillStyle = col; al(0.4); c.fill();
    c.beginPath();
    for (const b of list) {
      const z = Math.max(4, snap(b.r * 1.7 * b._sc, 2)), x0 = snap(b.x) - z / 2, y0 = snap(b.y) - z / 2;
      if (b.glitch) { c.rect(x0 - PX, y0, z, z / 2); c.rect(x0 + PX, y0 + z / 2, z, z / 2); } else c.rect(x0, y0, z, z);
    }
    al(1); c.fill();
    c.beginPath(); for (const b of list) { const z = Math.max(4, snap(b.r * 1.7 * b._sc, 2)), q = Math.max(2, snap(z * 0.3, 2)); c.rect(snap(b.x) - z / 2 + 2, snap(b.y) - z / 2 + 2, q, q); }
    c.fillStyle = tint(col); c.fill();
  },
  pixwave(list, col) {
    // A square-wave glyph in pixels (low, up, high, down, low: one cycle of the Square Lead's wave), a lit pixel on
    // its crest and two ghost pixels stepping behind it. Not a note: the eighth note is the pickups' glyph.
    c.beginPath();
    for (const b of list) {
      dirOf(b);
      const p = Math.max(2, Math.round(b.r * 0.45 * b._sc));
      for (let i = 1; i <= 2; i++) { const d = b.r * (1.6 + 1.3 * i) * b._sc; c.rect(snap(b.x - UX * d, 2) - p / 2, snap(b.y - UY * d, 2) - p / 2, p, p); }
    }
    c.fillStyle = col; al(0.55); c.fill();
    c.beginPath();
    for (const b of list) {
      const p = Math.max(2, Math.round(b.r * 0.45 * b._sc)), x0 = snap(b.x, 2) - 3 * p, y0 = snap(b.y, 2) - 1.5 * p;
      c.rect(x0, y0 + 2 * p, 2 * p, p); c.rect(x0 + p, y0, p, 3 * p); c.rect(x0 + p, y0, 4 * p, p); c.rect(x0 + 4 * p, y0, p, 3 * p); c.rect(x0 + 4 * p, y0 + 2 * p, 2 * p, p);
    }
    c.fillStyle = col; al(1); c.fill();
    c.beginPath();
    for (const b of list) { const p = Math.max(2, Math.round(b.r * 0.45 * b._sc)); c.rect(snap(b.x, 2) - 0.5 * p, snap(b.y, 2) - 1.5 * p, p, p); }
    c.fillStyle = tint(col); c.fill();
  },
  coin8(list, col) {
    // A pixel coin flipping in whole pixels, its slot dark, a sparkle when it faces you.
    c.beginPath();
    for (const b of list) {
      const r = b.r * b._sc, h = Math.max(4, snap(r * 2, 2)), w = Math.max(2, snap(r * 2 * Math.abs(Math.cos(b.rot)), 2)), x0 = snap(b.x, 2) - w / 2, y0 = snap(b.y, 2) - h / 2;
      c.rect(x0, y0 + 2, w, h - 4); if (w > 4) c.rect(x0 + 2, y0, w - 4, h);
    }
    c.fillStyle = col; al(1); c.fill();
    c.beginPath();
    for (const b of list) {
      const r = b.r * b._sc, cs = Math.abs(Math.cos(b.rot)), w = snap(r * 2 * cs, 2);
      if (w >= 6) c.rect(snap(b.x, 2) - 1, snap(b.y, 2) - snap(r * 0.55, 2), 2, snap(r * 1.1, 2));
    }
    c.fillStyle = '#2a1f3d'; al(0.6); c.fill();
    c.beginPath();
    for (const b of list) { if (Math.abs(Math.cos(b.rot)) < 0.85) continue; const r = b.r * b._sc; c.rect(snap(b.x + r, 2), snap(b.y - r, 2) - 2, 2, 2); }
    c.fillStyle = '#ffffff'; al(0.9); c.fill();
  },
  shard(list, col) {
    c.beginPath();
    for (const b of list) {
      dirOf(b);
      const r = b.r * b._sc, px = -UY * r, py = UX * r;
      c.moveTo(b.x + UX * r * 2.3, b.y + UY * r * 2.3);
      c.lineTo(b.x - UX * r * 1.1 + px * 0.85, b.y - UY * r * 1.1 + py * 0.85);
      c.lineTo(b.x - UX * r * 0.35, b.y - UY * r * 0.35);
      c.lineTo(b.x - UX * r * 1.4 - px * 0.55, b.y - UY * r * 1.4 - py * 0.55);
      c.closePath();
    }
    c.fillStyle = col; al(1); c.fill();
    c.strokeStyle = tint(col); al(0.9); c.lineWidth = 1; c.lineJoin = 'miter'; c.stroke();
  },
  stick(list, col) {
    c.beginPath();
    for (const b of list) { const L = b.r * 2.4 * b._sc, ca = Math.cos(b.rot) * L, sa = Math.sin(b.rot) * L; c.moveTo(b.x - ca, b.y - sa); c.lineTo(b.x + ca, b.y + sa); }
    c.lineCap = 'round'; c.strokeStyle = tint(col); al(1); c.lineWidth = TH; c.stroke();
    c.beginPath(); for (const b of list) { const L = b.r * 2.4 * b._sc; circ(b.x + Math.cos(b.rot) * L, b.y + Math.sin(b.rot) * L, 2); }
    c.fillStyle = col; c.fill();
  },
  confetti(list, col) {
    c.beginPath();
    for (const b of list) {
      const r = b.r * 0.9 * b._sc, ca = Math.cos(b.rot), sa = Math.sin(b.rot);
      c.moveTo(b.x + ca * r * 1.3, b.y + sa * r * 1.3); c.lineTo(b.x - sa * r * 0.6, b.y + ca * r * 0.6); c.lineTo(b.x - ca * r * 1.3, b.y - sa * r * 1.3); c.lineTo(b.x + sa * r * 0.6, b.y - ca * r * 0.6); c.closePath();
    }
    c.fillStyle = col; al(1); c.fill(); c.strokeStyle = tint(col); c.lineWidth = 1; c.stroke();
  },
  notehead(list, col) {
    // A brass bolt: a filled oval head along the flight (no stem, no flag: the eighth note is the pickups' glyph)
    // with a flared bell behind it, two curved horns opening back toward you, and a wavy trail on the slow ones.
    c.beginPath();
    for (const b of list) { if (!b.trail) continue; dirOf(b); const r = b.r * b._sc, L = r * 5, wv = Math.sin(T * 5 + seedOf(b) * 20) * r * 1.4; c.moveTo(b.x, b.y); c.quadraticCurveTo(b.x - UX * L * 0.5 - UY * wv, b.y - UY * L * 0.5 + UX * wv, b.x - UX * L, b.y - UY * L); }
    c.lineCap = 'round'; c.strokeStyle = col; al(0.45); c.lineWidth = 1.2; c.stroke();
    c.beginPath();
    for (const b of list) {
      dirOf(b);
      const r = b.r * b._sc, bx = b.x - UX * r * 0.6, by = b.y - UY * r * 0.6, L = r * 2.6, f = r * 1.25;
      for (let e = -1; e <= 1; e += 2) {
        c.moveTo(bx - UY * e * r * 0.3, by + UX * e * r * 0.3);
        c.quadraticCurveTo(bx - UX * L * 0.7 - UY * e * r * 0.35, by - UY * L * 0.7 + UX * e * r * 0.35, bx - UX * L - UY * e * f, by - UY * L + UX * e * f);
      }
    }
    c.strokeStyle = tint(col); al(1); c.lineWidth = TH; c.stroke();
    c.beginPath();
    for (const b of list) { dirOf(b); const r = b.r * 0.85 * b._sc, an = Math.atan2(UY, UX); c.moveTo(b.x + Math.cos(an) * r * 1.2, b.y + Math.sin(an) * r * 1.2); c.ellipse(b.x, b.y, r * 1.2, r * 0.8, an, 0, TAU); }
    c.fillStyle = col; al(1); c.fill();
    c.beginPath();
    for (const b of list) { dirOf(b); const r = b.r * 0.85 * b._sc; circ(b.x + UX * r * 0.2, b.y + UY * r * 0.2, r * 0.38); }
    c.fillStyle = tint(col); c.fill();
  },
  bell(list, col, rx) {
    // A brass bell's call: a fan of concentric arcs facing the flight, curled at the ends, a faint sector behind.
    c.beginPath();
    for (const b of list) { dirOf(b); const r = b.r * b._sc, an = Math.atan2(UY, UX), cx = b.x - UX * r * 0.55, cy = b.y - UY * r * 0.55; c.moveTo(cx, cy); c.arc(cx, cy, r, an - 0.95, an + 0.95); c.closePath(); }
    c.fillStyle = col; al(0.09); c.fill();
    c.beginPath();
    for (const b of list) {
      dirOf(b);
      const r = b.r * b._sc, an = Math.atan2(UY, UX), cx = b.x - UX * r * 0.55, cy = b.y - UY * r * 0.55;
      c.moveTo(cx + Math.cos(an - 0.95) * r, cy + Math.sin(an - 0.95) * r); c.arc(cx, cy, r, an - 0.95, an + 0.95);
      arcCurl(cx, cy, r, an + 0.95, Math.min(12, r * 0.4));
      curl(cx + Math.cos(an - 0.95) * r, cy + Math.sin(an - 0.95) * r, an - 0.95 - Math.PI / 2, Math.min(12, r * 0.4), -1);
    }
    c.lineCap = 'round'; c.strokeStyle = tint(col); al(1); c.lineWidth = TH; c.stroke();
    c.beginPath();
    for (const b of list) {
      dirOf(b);
      const r = b.r * b._sc, an = Math.atan2(UY, UX), cx = b.x - UX * r * 0.55, cy = b.y - UY * r * 0.55;
      for (let j = 1; j <= 2; j++) { const rr = r * (1 - 0.3 * j), sp = 0.95 - 0.15 * j; c.moveTo(cx + Math.cos(an - sp) * rr, cy + Math.sin(an - sp) * rr); c.arc(cx, cy, rr, an - sp, an + sp); }
    }
    c.strokeStyle = col; al(0.85); c.lineWidth = 1.3; c.stroke();
    if (rx) {
      c.beginPath();
      for (const b of list) { dirOf(b); const r = b.r * b._sc + 3, an = Math.atan2(UY, UX), cx = b.x - UX * (r - 3) * 0.55, cy = b.y - UY * (r - 3) * 0.55; c.moveTo(cx + Math.cos(an - 0.8) * r, cy + Math.sin(an - 0.8) * r); c.arc(cx, cy, r, an - 0.8, an + 0.8); }
      c.strokeStyle = GOLD; alG(0.9); c.lineWidth = 1.3; c.stroke();
    }
  },
};

const SQUARE = new Set(['block', 'pixel', 'pixwave', 'coin8']);
const OWN_GOLD = new Set(['front', 'bell', 'kite', 'kite2']);   // these draw a remix's gold themselves
const buckets = new Map();
const rimmed = [], rimSq = [];

// All the band's shots, one path per look and color. A shot grows in as it leaves you and shrinks out at the end
// of its life (a scale, not an alpha, so a batch shares one alpha).
export function bullets(all, inView) {
  for (const bk of buckets.values()) bk.list.length = 0;
  rimmed.length = 0; rimSq.length = 0;
  for (const b of all) {
    if (!inView(b.x, b.y, 24)) continue;
    const end = b.maxAge ?? b.life;
    let sc = b.age > end - 0.15 ? Math.max(0, (end - b.age) / 0.15) : 1;
    sc *= clamp(b.age / 0.08, 0.35, 1);
    if (sc <= 0.05) continue;
    b._sc = sc;
    let key = b._bk;
    if (!key) {
      const L = (b._L = lookOf(b.src));
      key = b._bk = bulletKind(L, b) + '|' + b.color + (L.rx ? '|rx' : '');
    }
    let bk = buckets.get(key);
    if (!bk) { bk = { kind: key.slice(0, key.indexOf('|')), color: b.color, rx: b._L.rx, list: [] }; buckets.set(key, bk); }
    bk.list.push(b);
    if (bk.rx && sc > 0.3 && b.color !== GOLD && !OWN_GOLD.has(bk.kind)) (SQUARE.has(bk.kind) ? rimSq : rimmed).push(b);
  }
  for (const bk of buckets.values()) if (bk.list.length) (PAINT[bk.kind] || PAINT.blob)(bk.list, bk.color, bk.rx);
  if (rimmed.length) goldRims(rimmed, (b) => b.r * 1.15 * b._sc + 1.5);
  if (rimSq.length) goldRims(rimSq, (b) => b.r * 1.1 * b._sc + 2, true);
}

// Remixed attacks wear a thin gold accent on their edge: one path, one stroke. Never a closed ring (a gold outline
// round a thing is how elites are marked): a round shot gets a gold arc across its front (the flight's front, or a
// turning one on an orbiter), a square one two gold corner ticks. A shot already gold (Jackpot's coins) gets none.
function goldRims(items, radius, square = false, inView = null) {
  c.beginPath();
  let n = 0, i = 0;
  for (const it of items) {
    i++;
    if (inView && !inView(it.x, it.y, 20)) continue;
    const rr = radius(it);
    if (!(rr > 0)) continue;
    if (square) {
      const x0 = snap(it.x, 2) - rr, y0 = snap(it.y, 2) - rr, z = 2 * rr, l = Math.max(3, rr * 0.7);
      c.moveTo(x0, y0 + l); c.lineTo(x0, y0); c.lineTo(x0 + l, y0);
      c.moveTo(x0 + z, y0 + z - l); c.lineTo(x0 + z, y0 + z); c.lineTo(x0 + z - l, y0 + z);
    } else {
      let an;
      if (it.vx !== undefined) { dirOf(it); an = Math.atan2(UY, UX); } else an = T * 3 + i * 1.7;
      c.moveTo(it.x + Math.cos(an - 1) * rr, it.y + Math.sin(an - 1) * rr); c.arc(it.x, it.y, rr, an - 1, an + 1);
    }
    n++;
  }
  if (!n) return;
  c.strokeStyle = GOLD; alG(0.9); c.lineWidth = 1.5; c.lineJoin = 'miter'; c.lineCap = 'butt'; c.stroke();
}

// ------------------------------------------------------------------ strikes: what is about to land

export function strike(o) {
  const L = o._L ?? (o._L = lookOf(o.src));
  const k = clamp(o.t / o.delay, 0, 1), col = o.color, s = seedOf(o), x = o.x, y = o.y, r = o.r;
  c.strokeStyle = col; c.fillStyle = col; c.lineJoin = 'bevel'; c.lineCap = 'round';
  const kind = !L.style ? 'old' : o.block ? 'block' : L.strike;
  switch (kind) {
    case 'old':
      al(0.25 + 0.5 * k); c.lineWidth = 2; c.beginPath(); circ(x, y, r * (1.4 - 0.4 * k)); c.stroke();
      al(0.08 + 0.12 * k); c.beginPath(); circ(x, y, r * k); c.fill();
      break;
    case 'reticle':
      c.beginPath(); circ(x, y, r * k); al(0.03 + 0.05 * k); c.fill();
      c.beginPath(); brackets(x, y, r * (1.25 - 0.45 * k), Math.max(5, r * 0.3), (1 - k) * Math.PI / 2);
      c.moveTo(x - 5, y); c.lineTo(x + 5, y); c.moveTo(x, y - 5); c.lineTo(x, y + 5);
      c.lineCap = 'butt'; c.lineJoin = 'miter'; al(0.35 + 0.6 * k); c.lineWidth = 1.6; c.stroke();
      break;
    case 'raindrop': {
      c.beginPath(); blob(x, y, r * (1.25 - 0.25 * k), s, 0.05, T * 2); al(0.25 + 0.5 * k); c.lineWidth = 1.4; c.stroke();
      c.beginPath(); circ(x, y, r * k); al(0.06 + 0.08 * k); c.fill();
      const dy = y - (1 - k) * 170, z = 4.5;
      c.beginPath(); c.moveTo(x, dy - z * 2.6); c.quadraticCurveTo(x + z * 1.3, dy - z * 0.4, x, dy + z); c.quadraticCurveTo(x - z * 1.3, dy - z * 0.4, x, dy - z * 2.6);
      al(0.95); c.fill();
      break;
    }
    case 'fallstar': {
      c.beginPath(); blob(x, y, r * (1.2 - 0.2 * k), s, 0.05, T * 2.4); al(0.2 + 0.45 * k); c.lineWidth = 1.4; c.stroke();
      c.beginPath(); circ(x, y, r * k); al(0.03 + 0.05 * k); c.fill();
      const u = 1 - k, sx = x - u * 80, sy = y - u * 210;
      c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(sx - 22 + Math.sin(T * 8 + s * 9) * 8, sy - 22, sx - 34, sy - 64);
      al(0.5); c.lineWidth = 2; c.stroke();
      c.beginPath(); softStar(sx, sy, 6 + 3 * k, s * TAU + T * 3); c.fillStyle = tint(col); al(1); c.fill();
      break;
    }
    case 'block': {
      const z = Math.max(8, snap((o.block || r * 1.7) * 0.92, 2)), x0 = snap(x) - z / 2, y0 = snap(y) - z / 2, fall = snap((1 - k) * 190, 12);
      c.lineJoin = 'miter'; c.lineCap = 'butt';
      c.beginPath(); corners(x0, y0, z, Math.max(4, snap(z * 0.25))); al(0.3 + 0.55 * k); c.lineWidth = 2; c.stroke();
      al(0.4 + 0.4 * k); c.fillRect(x0, y0 - fall, z, z);
      c.strokeStyle = tint(col); al(0.9); c.lineWidth = 2; c.strokeRect(x0 + 1, y0 - fall + 1, z - 2, z - 2);
      break;
    }
    case 'pixel': {
      const z = snap(r * (1.6 - 0.5 * k) * 2, 8), x0 = snap(x) - z / 2, y0 = snap(y) - z / 2;
      c.lineJoin = 'miter'; c.lineCap = 'butt';
      c.beginPath(); corners(x0, y0, z, 8); al(0.3 + 0.6 * k); c.lineWidth = 3; c.stroke();
      c.fillRect(snap(x) - 2, snap(y) - 2, 4, 4);
      break;
    }
    case 'jagged':
      c.lineJoin = 'miter';
      c.beginPath(); jag(x, y, r * (1.5 - 0.5 * k), s, 0.1, 12); al(0.3 + 0.55 * k); c.lineWidth = 2; c.stroke();
      c.beginPath(); circ(x, y, r * k); al(0.03 + 0.05 * k); c.fill();
      c.strokeStyle = tint(col); c.beginPath(); cracks(x, y, 3, r * 0.5 * k, s, 4); al(0.8 * k); c.lineWidth = 1.2; c.stroke();
      break;
    case 'bow': {
      // A bow drawn across the spot along its rank; the rank's first stroke lays the staff the rank sits on. No disc:
      // the spot is a hairline at most, the bow stroke carries it.
      const a = o.rank?.a ?? 0, nx = -Math.sin(a), ny = Math.cos(a), ax = Math.cos(a), ay = Math.sin(a);
      if (!BUSY) { c.beginPath(); circ(x, y, r * 0.9); al(0.12 + 0.2 * k); c.lineWidth = HL; c.stroke(); }
      if (o.rank && o.rank.i === 0) {
        const span = r * 1.7 * (o.rank.n - 1), gp = gapOf(5);
        c.beginPath();
        for (let j = -1; j <= 1; j++) { const ox = ax * j * gp, oy = ay * j * gp; c.moveTo(x - nx * r + ox, y - ny * r + oy); c.lineTo(x + nx * (span + r) + ox, y + ny * (span + r) + oy); }
        al(0.25 + 0.25 * k); c.lineWidth = HL; c.stroke();
      }
      const L0 = 2 * r * (0.25 + 0.75 * k), bx = x - nx * r - ax * r * 0.15, by = y - ny * r - ay * r * 0.15;
      c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx + nx * L0 * 0.5 + ax * r * 0.35, by + ny * L0 * 0.5 + ay * r * 0.35, bx + nx * L0, by + ny * L0);
      c.strokeStyle = tint(col); al(0.5 + 0.5 * k); c.lineWidth = Math.max(2.2, TH * 1.2); c.stroke();
      break;
    }
    case 'shell': {
      // A cannon shell lobbed from where you stood when it fired (so it visibly leaves your side), its dotted trail
      // behind; the target two staff bundles closing on the spot, with four ticks.
      const R = r * (1.2 - 0.2 * k);
      c.strokeStyle = tint(col);
      c.beginPath(); staffBundles(x, y, R, s * TAU + k * 1.5, 2, TAU * 0.28, 2, gapOf(4), INNER, 0); ticks(x, y, R + 2, 6, 4, s * TAU + Math.PI / 4);
      al(0.35 + 0.5 * k); c.lineWidth = TH; c.stroke();
      strokeInner(0.3 + 0.4 * k);
      const sx = o.ox ?? x - 150, sy = o.oy ?? y - 40, hgt = 40 + 0.35 * Math.hypot(x - sx, y - sy), at = (u) => [sx + (x - sx) * u, sy + (y - sy) * u - Math.sin(Math.PI * u) * hgt];
      c.beginPath();
      for (let i = 1; i <= 4; i++) { const u = k - i * 0.07; if (u <= 0) break; const [px, py] = at(u); circ(px, py, 1.6); }
      c.fillStyle = col; al(0.6); c.fill();
      const [px, py] = at(k);
      c.beginPath(); circ(px, py, 4.5); al(1); c.fill(); c.lineWidth = 1.3; c.stroke();
      break;
    }
    case 'ripple':
      c.beginPath(); blob(x, y, r * (1.3 - 0.3 * k), s, 0.06, T * 2); al(0.25 + 0.5 * k); c.lineWidth = 1.8; c.stroke();
      c.beginPath(); circ(x, y, r * k); al(0.03 + 0.05 * k); c.fill();
      break;
    case 'circle':
    default: {
      // Orchestra: two staff bundles closing in on the spot as it comes due.
      const R = r * (1.4 - 0.4 * k);
      c.strokeStyle = tint(col);
      c.beginPath(); staffBundles(x, y, R, s * TAU + k * 2, 2, TAU * 0.3, 2, gapOf(4), INNER, 0); al(0.3 + 0.6 * k); c.lineWidth = TH; c.stroke();
      strokeInner(0.25 + 0.4 * k);
    }
  }
  if (L.rx && kind !== 'old') goldMark(x, y, r * Math.max(0.4, k) + 3, 0.6 * k + 0.3, L.style, s * TAU + Math.PI);
}

// ------------------------------------------------------------------ mines: what waits on the floor

export function mine(m) {
  const L = m._L ?? (m._L = lookOf(m.src));
  const k = Math.min(1, m.age * 6), col = m.color, s = seedOf(m), x = m.x, y = m.y, g = m.glow || 0;
  c.strokeStyle = col; c.fillStyle = col; c.lineJoin = 'bevel'; c.lineCap = 'round';
  const kind = !L.style ? 'diamond' : m.cross ? 'bomb' : m.persist && typeof m.owner === 'string' && m.owner.indexOf(':') > 0 ? (L.mine2 || L.mine) : L.mine;
  let body = m.size;
  switch (kind) {
    case 'bomb': {
      // A pixel bomb: a stepped round body, a fuse with a blinking spark; armed, its cross shows as dotted rows.
      const bx = snap(x, 2), by = snap(y, 2), z = Math.max(6, m.size * 1.35 * k);
      body = z;
      if (m.age >= 0.45 && m.cross) {
        const blink = Math.floor(T * 6) & 1, arm = m.cross.arm, st = 16;
        c.beginPath();
        for (let d = st; d <= arm; d += st) { c.rect(bx + d - 1.5, by - 1.5, 3, 3); c.rect(bx - d - 1.5, by - 1.5, 3, 3); c.rect(bx - 1.5, by + d - 1.5, 3, 3); c.rect(bx - 1.5, by - d - 1.5, 3, 3); }
        al(blink ? 0.35 : 0.18); c.fill();
      }
      c.beginPath(); stepRing(bx, by, z, 2); al(0.95); c.fill();
      c.fillStyle = tint(col); c.fillRect(bx - z * 0.5, by - z * 0.5, 3, 3);
      c.lineCap = 'butt'; c.beginPath(); c.moveTo(bx + z * 0.5, by - z * 0.6); c.lineTo(bx + z * 0.9, by - z * 1.1); al(1); c.lineWidth = 2; c.stroke();
      if (Math.floor(T * 8) & 1) { c.fillStyle = '#ffffff'; c.fillRect(snap(bx + z * 0.9, 2) - 2, snap(by - z * 1.1, 2) - 2, 4, 4); }
      break;
    }
    case 'speaker': {
      const z = snap(m.size * 2.2, 2), bx = snap(x), by = snap(y), q = snap(z * (0.55 + 0.15 * g), 2);
      c.lineJoin = 'miter'; c.lineCap = 'butt';
      c.beginPath(); corners(snap(x - m.r), snap(y - m.r), snap(2 * m.r), 10); al(0.15 + 0.2 * g); c.lineWidth = 2; c.stroke();
      c.fillStyle = col; al(0.25); c.fillRect(bx - z / 2, by - z / 2, z, z);
      al(1); c.lineWidth = 3; c.strokeRect(bx - z / 2, by - z / 2, z, z);
      c.strokeStyle = tint(col); c.lineWidth = 2; c.strokeRect(bx - q / 2, by - q / 2, q, q);
      c.fillStyle = tint(col); c.fillRect(bx - 2, by - 2, 4, 4);
      break;
    }
    case 'cymbal': {
      // A cymbal from above, drawn in the light tint only (no body fill: a warm color at a low alpha darkens toward
      // the danger hue): one rim (jagged on a calm screen, smooth on a busy one), one groove ring, the bell, and a
      // shine turning across it; rung, a few spark ticks fly off the rim.
      const R = m.size * 2.3 * (1 + 0.25 * g) * k, tc = tint(col);
      body = R;
      c.lineJoin = 'bevel'; c.strokeStyle = tc; c.fillStyle = tc;
      if (!BUSY) { c.beginPath(); dashCircle(x, y, m.r * k, Math.max(8, Math.round(m.r / 6)), 0.4, s * TAU); al(0.22); c.lineWidth = HL; c.stroke(); }
      c.beginPath(); if (BUSY) circ(x, y, R); else jag(x, y, R, s, 0.06, 8); al(0.95); c.lineWidth = 1.5; c.stroke();
      const sh = T * 1.8 + s * TAU;
      c.beginPath(); circ(x, y, R * 0.6); c.moveTo(x - Math.cos(sh) * R * 0.85, y - Math.sin(sh) * R * 0.85); c.lineTo(x + Math.cos(sh) * R * 0.85, y + Math.sin(sh) * R * 0.85);
      al(0.6); c.lineWidth = HL; c.stroke();
      c.beginPath(); circ(x, y, Math.max(1.5, R * 0.2)); al(0.9); c.fill();
      if (g > 0.05) { c.beginPath(); ticks(x, y, R + 2, 3 + 7 * g, 6, T * 3 + s); al(g); c.lineWidth = 1.2; c.stroke(); }
      break;
    }
    case 'kettle': {
      // A kettle drum: a solid bowl with a bright rim highlight, a darker skin ring and six 2.5 px tuning pegs; its
      // reach a single dashed circle that lights up when it booms.
      const R = (6 + m.size * 1.8) * k;
      body = R;
      const nd = Math.max(10, Math.round(m.r / 9)), rot = T * 0.15;
      c.beginPath(); dashCircle(x, y, m.r * k, nd, 0.62, rot); al(0.3 + 0.45 * g); c.lineWidth = HL; c.stroke();
      c.beginPath(); circ(x, y, R); al(0.9); c.fill();
      c.beginPath(); circ(x, y, R * 0.62); c.strokeStyle = '#1b1530'; al(0.45); c.lineWidth = HL; c.stroke();
      c.strokeStyle = tint(col); c.lineCap = 'round';
      c.beginPath(); c.arc(x, y, Math.max(1, R - TH * 0.5), Math.PI * 0.9, Math.PI * 1.8); al(1); c.lineWidth = TH; c.stroke();
      c.beginPath(); for (let i = 0; i < 6; i++) { const a = T * 0.5 + (i / 6) * TAU; circ(x + Math.cos(a) * (R + 4), y + Math.sin(a) * (R + 4), 2.5); }
      c.fillStyle = tint(col); al(0.95); c.fill();
      break;
    }
    case 'whirl': case 'maelstrom': {
      // A spiral whirl on the crowd, turning: 64 points an arm joined by quadratic curves (every other point a
      // control point), so it curves rather than kinks; the maelstrom has three arms turning the way you circle.
      const arms = kind === 'maelstrom' ? 3 : 1, dir = m.src?.state?.turn || 1, rot = T * (arms > 1 ? 3.6 : 1.8) * dir, R = m.r * 0.92 * k, np = 64;
      c.beginPath(); circ(x, y, m.r * k); al(0.04); c.fill(); al(0.3); c.lineWidth = HL; c.stroke();
      c.beginPath();
      const turns = TAU * (arms > 1 ? 1.2 : 2.2);
      for (let j = 0; j < arms; j++) {
        const a0 = rot + (j * TAU) / arms;
        c.moveTo(x + Math.cos(a0) * 3, y + Math.sin(a0) * 3);
        for (let i = 2; i <= np; i += 2) {
          const t1 = (i - 1) / np, t2 = i / np, a1 = a0 - dir * t1 * turns, a2 = a0 - dir * t2 * turns;
          // the control point sits a little outside the curve so the segment bows like the spiral does
          const r1 = (3 + t1 * R) / Math.cos(turns / np), r2 = 3 + t2 * R;
          c.quadraticCurveTo(x + Math.cos(a1) * r1, y + Math.sin(a1) * r1, x + Math.cos(a2) * r2, y + Math.sin(a2) * r2);
        }
      }
      c.strokeStyle = tint(col); c.lineJoin = 'bevel'; al(0.75 + 0.25 * g); c.lineWidth = TH; c.stroke();
      body = 6;
      break;
    }
    default: {
      // Any other mine: a dashed reach and a small turning diamond.
      c.beginPath(); dashCircle(x, y, m.r * k, Math.max(8, Math.round(m.r / 6)), 0.4); al(0.18); c.lineWidth = HL; c.stroke();
      const z = m.size * 0.6 * k * (1 + 0.5 * g), a = Math.PI / 4 + m.age * (m.persist ? 4 : 1), ca = Math.cos(a) * z * 1.4, sa = Math.sin(a) * z * 1.4;
      c.beginPath(); c.moveTo(x + ca, y + sa); c.lineTo(x - sa, y + ca); c.lineTo(x - ca, y - sa); c.lineTo(x + sa, y - ca); c.closePath();
      al(1); c.fill();
      if (g > 0.02) { c.beginPath(); circ(x, y, m.r * (1 - 0.5 * g)); al(0.6 * g); c.lineWidth = 2; c.stroke(); }
    }
  }
  if (L.rx) goldMark(x, y, body + 4, 1, L.style, T * 1.2 + s * TAU);
}

// ------------------------------------------------------------------ orbiters, followers, tethers, walls

export function orbit(grp, p) {
  const L = lookOf(grp.src), col = grp.color, items = grp.items, n = items.length;
  if (!n) return;
  if (L.orbit === 'seed') {
    // Seed pods with a dotted trail of dust along the orbit behind each one.
    const back = grp.speed >= 0, R = grp.radius;
    c.beginPath();
    const st = 6.5 / Math.max(10, R), nd = Math.floor(0.6 / st);
    for (let i = 0; i < n; i++) {
      const a = grp.angle + (i / n) * TAU;
      for (let j = 1; j <= nd; j++) { const aj = back ? a - j * st : a + j * st; circ(p.x + Math.cos(aj) * R, p.y + Math.sin(aj) * R, 1); }
    }
    c.fillStyle = col; al(0.45); c.fill();
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const it = items[i], a = grp.angle + (i / n) * TAU + Math.PI / 2, z = grp.size * (1 + 0.5 * it.glow);
      c.moveTo(it.x + Math.cos(a) * z * 1.45, it.y + Math.sin(a) * z * 1.45); c.ellipse(it.x, it.y, z * 1.45, z * 0.75, a, 0, TAU);
    }
    c.fillStyle = col; al(1); c.fill();
    c.beginPath();
    for (let i = 0; i < n; i++) { const it = items[i], a = grp.angle + (i / n) * TAU + Math.PI / 2, z = grp.size * 0.8; c.moveTo(it.x - Math.cos(a) * z, it.y - Math.sin(a) * z); c.lineTo(it.x + Math.cos(a) * z, it.y + Math.sin(a) * z); }
    c.strokeStyle = tint(col); al(0.85); c.lineWidth = 1; c.stroke();
    c.beginPath(); for (const it of items) if (it.glow > 0.3) blob(it.x, it.y, grp.size * (2 + it.glow), seedOf(it), 0.12, T * 9);
    al(0.7); c.lineWidth = 1.2; c.stroke();
  } else {
    c.beginPath(); for (const it of items) circ(it.x, it.y, grp.size * (1 + 0.6 * it.glow));
    c.fillStyle = col; al(1); c.fill();
    c.strokeStyle = tint(col); c.lineWidth = 1.2; c.stroke();
  }
  if (L.rx) goldRims(items, () => grp.size * 1.5 + 2);
}

export function followers(grp, p) {
  const L = lookOf(grp.src), col = grp.color, items = grp.items;
  if (!items.length) return;
  // The march, drawn as a dashed staff line from you through the line (dashes as subpaths, no dash pattern).
  c.beginPath();
  let lx = p.x, ly = p.y, d = 0;
  for (const it of items) { dashLine(lx, ly, it.x, it.y, 6, 5, -d); d += Math.hypot(it.x - lx, it.y - ly); lx = it.x; ly = it.y; }
  c.lineCap = 'butt'; c.strokeStyle = col; al(0.4); c.lineWidth = HL; c.stroke();
  if (L.follower === 'drummer') {
    // Each drummer a small drum with two sticks, raised between taps and down on the tap.
    c.beginPath();
    for (const it of items) { const z = grp.size * (1 + 0.35 * it.glow); c.moveTo(it.x + z * 1.4, it.y); c.ellipse(it.x, it.y, z * 1.4, z * 0.85, 0, 0, TAU); }
    c.fillStyle = col; al(0.5); c.fill(); c.strokeStyle = tint(col); al(1); c.lineWidth = TH; c.stroke();
    c.beginPath();
    for (const it of items) {
      const z = grp.size, up = 1 - it.glow, tipY = it.y - z * (0.4 + 1.3 * up);
      c.moveTo(it.x - z * 1.9, it.y - z * 1.9); c.lineTo(it.x + z * 0.3, tipY);
      c.moveTo(it.x + z * 1.9, it.y - z * 1.9); c.lineTo(it.x - z * 0.3, tipY);
    }
    c.lineCap = 'round'; c.lineWidth = Math.max(1.3, HL * 1.3); c.stroke();
  } else {
    c.beginPath(); for (const it of items) circ(it.x, it.y, grp.size * (1 + 0.6 * it.glow));
    c.fillStyle = col; al(1); c.fill();
  }
  if (L.rx) goldRims(items, () => grp.size * 1.7 + 2);
}

export function tether(t, p) {
  const L = lookOf(t.src), e = t.e, col = t.color, g = t.glow;
  const dx = e.x - p.x, dy = e.y - p.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  c.strokeStyle = col; c.fillStyle = col;
  switch (L.tether) {
    case 'barbed': {
      // A crackling line with barbs pointing home and a hook at the enemy.
      const q = (seedOf(t) + Math.floor(T * 20) * 0.6180339887) % 1;
      c.beginPath(); c.moveTo(p.x, p.y);
      for (let i = 1; i < 6; i++) { const t0 = i / 6, j = (h1(q, i) - 0.5) * 12; c.lineTo(p.x + dx * t0 + nx * j, p.y + dy * t0 + ny * j); }
      c.lineTo(e.x, e.y);
      c.lineJoin = 'miter'; al(0.35 + 0.55 * g); c.lineWidth = 1.5 + 1.5 * g; c.stroke();
      c.beginPath();
      for (let i = 1; i <= 3; i++) { const t0 = i / 4, bx = p.x + dx * t0, by = p.y + dy * t0; c.moveTo(bx + ux * 6 + nx * 5, by + uy * 6 + ny * 5); c.lineTo(bx, by); c.lineTo(bx + ux * 6 - nx * 5, by + uy * 6 - ny * 5); }
      const hx = e.x - ux * (e.r + 4), hy = e.y - uy * (e.r + 4);
      c.moveTo(hx + nx * 7 - ux * 3, hy + ny * 7 - uy * 3); c.lineTo(hx - nx * 2 + ux * 3, hy - ny * 2 + uy * 3); c.lineTo(hx - nx * 6 - ux * 4, hy - ny * 6 - uy * 4);
      c.strokeStyle = tint(col); al(0.6 + 0.4 * g); c.lineWidth = 1.5; c.stroke();
      break;
    }
    case 'dashes': {
      // A live wire: a right-angle cable of marching dashes on the grid.
      const ax = snap(p.x), ay = snap(p.y), bx = snap(e.x), by = snap(e.y);
      const o = T * 40;
      c.beginPath(); dashLine(ax, ay, bx, ay, 4, 4, o); dashLine(bx, ay, bx, by, 4, 4, o - Math.abs(bx - ax));
      c.lineCap = 'butt'; al(0.45 + 0.5 * g); c.lineWidth = 2 + 1.5 * g; c.stroke();
      c.fillStyle = tint(col); c.fillRect(bx - 3, ay - 3, 6, 6);
      break;
    }
    default: {
      const q = (seedOf(t) + Math.floor(T * 20) * 0.6180339887) % 1;
      c.beginPath(); c.moveTo(p.x, p.y);
      for (let st = 1; st <= 4; st++) { const k = st / 4, j = st < 4 ? 10 : 0; c.lineTo(p.x + dx * k + (h1(q, st) - 0.5) * j, p.y + dy * k + (h1(q, st + 8) - 0.5) * j); }
      al(0.3 + 0.55 * g); c.lineWidth = 1.5 + 1.5 * g; c.stroke();
    }
  }
  // A remix marks the line itself: a straight gold core from you to the hook, stopping short of the enemy (a gold
  // ring round an ordinary enemy would mark it as an elite).
  if (L.rx) {
    const hx = e.x - ux * (e.r + 5), hy = e.y - uy * (e.r + 5);
    c.beginPath(); c.moveTo(p.x + ux * 10, p.y + uy * 10); c.lineTo(hx, hy);
    c.strokeStyle = GOLD; c.lineCap = 'round'; alG(0.55 + 0.35 * g); c.lineWidth = 1.2; c.stroke();
  }
}

export function wall(w) {
  const L = w._L ?? (w._L = lookOf(w.src));
  const a = Math.min(1, w.t / 0.08) * Math.min(1, (w.dur - w.t) / 0.15);
  if (a <= 0) return;
  const col = w.color, r = w.r, hw = Math.max(3, w.width / 2), a0 = w.angle - w.half, span = w.half * 2;
  c.strokeStyle = col; c.fillStyle = col;
  if (L.wall === 'plates') {
    // A row of hard amp plates: straight square-cut slabs with gaps between, a bright notched front edge, a spark tick
    // off every plate (longer when the wall is slammed wider) and two rivets. The slabs are one fill; the front edges
    // and ticks one stroke (an outline round every plate costs more than it reads, at a retina pixel ratio most).
    const n = clamp(Math.round((span * r) / 26), 2, 40), st = span / n, gap = Math.min(st * 0.25, 3 / r), ri = r - hw;
    const g = w.base && w.width > w.base * 1.15 ? Math.min(1, (w.width - w.base) / w.base) : 0;
    const P = (t, rr) => [w.x + Math.cos(t) * rr, w.y + Math.sin(t) * rr];
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const t0 = a0 + i * st + gap, t1 = a0 + (i + 1) * st - gap, ro = r + hw * (i & 1 ? 1 : 0.85);
      let q = P(t0, ro); c.moveTo(q[0], q[1]); q = P(t1, ro); c.lineTo(q[0], q[1]); q = P(t1, ri); c.lineTo(q[0], q[1]); q = P(t0, ri); c.lineTo(q[0], q[1]); c.closePath();
    }
    al(0.34 * a); c.fill();
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const t0 = a0 + i * st + gap, t1 = a0 + (i + 1) * st - gap, tm = (t0 + t1) / 2, dn = (t1 - t0) * 0.14, ro = r + hw * (i & 1 ? 1 : 0.85), nd = Math.min(4, hw * 0.4);
      let q = P(t0, ro); c.moveTo(q[0], q[1]); q = P(tm - dn, ro); c.lineTo(q[0], q[1]); q = P(tm, ro - nd); c.lineTo(q[0], q[1]); q = P(tm + dn, ro); c.lineTo(q[0], q[1]); q = P(t1, ro); c.lineTo(q[0], q[1]);
      const r0 = ro + 2, r1 = r0 + 3 + 9 * g + 2 * h1(seedOf(w), i);
      q = P(tm, r0); c.moveTo(q[0], q[1]); q = P(tm + (h1(seedOf(w), i + 40) - 0.5) * 0.08, r1); c.lineTo(q[0], q[1]);
    }
    c.strokeStyle = tint(col); c.lineJoin = 'miter'; c.lineCap = 'butt'; al(a); c.lineWidth = 2; c.stroke();
    if (!BUSY) {
      c.beginPath();
      for (let i = 0; i < n; i++) { const t0 = a0 + i * st + gap, t1 = a0 + (i + 1) * st - gap, rm = r - hw * 0.35; for (const t of [t0 + (t1 - t0) * 0.2, t1 - (t1 - t0) * 0.2]) { const q = P(t, rm); c.rect(q[0] - 1, q[1] - 1, 2, 2); } }
      c.fillStyle = tint(col); al(0.8 * a); c.fill();
    }
    if (L.rx) {
      c.beginPath();
      for (let i = 1; i < n; i += 3) { const tm = a0 + (i + 0.5) * st, ro = r + hw * (i & 1 ? 1 : 0.85) + 2; let q = P(tm - 0.5 * st, ro); c.moveTo(q[0], q[1]); q = P(tm - 0.15 * st, ro); c.lineTo(q[0], q[1]); }
      c.strokeStyle = GOLD; alG(0.9 * a); c.lineWidth = 1.4; c.stroke();
    }
    return;
  }
  c.beginPath(); c.arc(w.x, w.y, r, a0, a0 + span);
  c.lineCap = 'round'; al(0.6 * a); c.lineWidth = w.width; c.stroke();
  c.strokeStyle = tint(col); al(0.6 * a); c.lineWidth = Math.max(1.5, w.width * 0.3); c.stroke();
  if (L.rx) { const m = w.angle, h = Math.min(w.half, 0.4); c.beginPath(); c.arc(w.x, w.y, r + hw + 3, m - h, m + h); c.strokeStyle = GOLD; alG(0.85 * a); c.lineWidth = 1.3; c.stroke(); }
}

// ------------------------------------------------------------------ cones: wedges that hit at once

export function cone(o) {
  const L = o._L ?? (o._L = lookOf(o.src));
  const t = o.age / o.life, a = 1 - t;
  if (a <= 0) return;
  const R = o.r * (0.75 + 0.25 * Math.min(1, t * 4)), x = o.x, y = o.y, an = o.angle, h = o.half, col = o.color, s = seedOf(o);
  c.strokeStyle = col; c.fillStyle = col; c.lineJoin = 'bevel'; c.lineCap = 'round';
  let kind = L.style ? L.cone : 'old';
  if (kind === 'slash' && h < 0.3) kind = 'spike';
  switch (kind) {
    case 'jagged': {
      // A boot wedge: a sawtooth front, cracks running from the apex, chips thrown off the front.
      const n = clamp(Math.round((2 * h * R) / 11), 6, 40);
      c.beginPath(); c.moveTo(x, y);
      for (let i = 0; i <= n; i++) { const th = an - h + (2 * h * i) / n, rr = R * (i & 1 ? 0.88 : 1.02); c.lineTo(x + Math.cos(th) * rr, y + Math.sin(th) * rr); }
      c.closePath(); c.lineJoin = 'bevel'; al(0.13 * a); c.fill();
      // The front inked twice (a doubled sawtooth) and the two sides, in one stroke.
      c.beginPath();
      for (let j = 0; j < 2; j++) {
        for (let i = 0; i <= n; i++) { const th = an - h + (2 * h * i) / n, rr = R * (i & 1 ? 0.88 : 1.02) - j * 1.6, px = x + Math.cos(th) * rr, py = y + Math.sin(th) * rr; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
      }
      c.moveTo(x + Math.cos(an - h) * R * 1.02, y + Math.sin(an - h) * R * 1.02); c.lineTo(x, y); c.lineTo(x + Math.cos(an + h) * R * 1.02, y + Math.sin(an + h) * R * 1.02);
      c.strokeStyle = tint(col); c.lineWidth = HL; al(0.95 * a); c.stroke();
      c.beginPath(); cracks(x, y, R * 0.18, R * 0.86, s, 3, an - h * 0.7, h * 1.4); al(0.6 * a); c.stroke();
      if (!BUSY) { c.beginPath(); chips(x, y, R, s, 5, t, an - h, 2 * h); c.fillStyle = tint(col); al(0.9 * a); c.fill(); }
      break;
    }
    case 'slash': {
      // A blade's swoosh: a crescent along the front, its edge bright, sparks off the leading tip.
      c.beginPath(); lune(x, y, R, an, h, 0.32); al(0.42 * a); c.fill();
      c.beginPath(); c.arc(x, y, R, an - h, an + h); c.moveTo(x + Math.cos(an - h * 0.9) * (R - 1.6), y + Math.sin(an - h * 0.9) * (R - 1.6)); c.arc(x, y, R - 1.6, an - h * 0.9, an + h);
      c.strokeStyle = tint(col); al(a); c.lineWidth = HL; c.stroke();
      c.beginPath(); const tx = x + Math.cos(an + h) * R, ty = y + Math.sin(an + h) * R; ticks(tx, ty, 3, 7, 4, s * TAU + t * 4); al(0.8 * a); c.stroke();
      break;
    }
    case 'spike': {
      const w0 = Math.max(4, R * Math.sin(h) * 0.9), bx = x + Math.cos(an) * R * 0.15, by = y + Math.sin(an) * R * 0.15, nx = -Math.sin(an), ny = Math.cos(an);
      c.beginPath(); c.moveTo(bx + nx * w0, by + ny * w0); c.lineTo(x + Math.cos(an) * R, y + Math.sin(an) * R); c.lineTo(bx - nx * w0, by - ny * w0); c.lineTo(bx + Math.cos(an) * R * 0.18, by + Math.sin(an) * R * 0.18); c.closePath();
      c.lineJoin = 'miter'; al(0.5 * a); c.fill();
      c.beginPath(); c.moveTo(bx, by); c.lineTo(x + Math.cos(an) * R, y + Math.sin(an) * R); c.strokeStyle = tint(col); al(a); c.lineWidth = HL; c.stroke();
      break;
    }
    case 'brush': {
      const n = 14;
      c.beginPath(); c.moveTo(x, y);
      for (let i = 0; i <= n; i++) { const th = an - h + (2 * h * i) / n, rr = R * (1 + 0.05 * Math.sin(5 * th + s * 20 + T * 3)); c.lineTo(x + Math.cos(th) * rr, y + Math.sin(th) * rr); }
      c.closePath(); al(0.15 * a); c.fill(); al(0.9 * a); c.lineWidth = HL; c.stroke();
      c.beginPath(); blobArc(x, y, R - 2, an - h * 0.95, an + h * 0.95, s, 0.05); blobArc(x, y, R * 0.86, an - h * 0.9, an + h * 0.9, s + 0.5, 0.05); al(0.6 * a); c.stroke();
      break;
    }
    case 'scan': {
      c.beginPath(); c.moveTo(x, y); c.arc(x, y, R, an - h, an + h); c.closePath(); al(0.1 * a); c.fill();
      c.strokeStyle = tint(col); al(0.9 * a); c.lineWidth = HL; c.stroke();
      c.beginPath(); for (let j = 1; j <= 3; j++) { const rr = R * (0.25 + 0.2 * j); c.moveTo(x + Math.cos(an - h) * rr, y + Math.sin(an - h) * rr); c.arc(x, y, rr, an - h, an + h); }
      c.strokeStyle = col; al(0.4 * a); c.lineWidth = HL; c.stroke();
      break;
    }
    case 'stepped': {
      const n = clamp(Math.round((2 * h * R) / 10), 4, 40);
      c.beginPath(); c.moveTo(snap(x), snap(y));
      let ly = snap(y);
      for (let i = 0; i <= n; i++) { const th = an - h + (2 * h * i) / n, qx = snap(x + Math.cos(th) * R), qy = snap(y + Math.sin(th) * R); c.lineTo(qx, ly); c.lineTo(qx, qy); ly = qy; }
      c.closePath(); c.lineJoin = 'miter'; al(0.13 * a); c.fill(); al(0.95 * a); c.lineWidth = 3; c.stroke();
      break;
    }
    case 'fan': {
      c.beginPath(); c.moveTo(x, y); c.arc(x, y, R, an - h, an + h); c.closePath(); al(0.08 * a); c.fill();
      c.beginPath();
      for (let j = 0; j < 3; j++) { const rr = R * (0.55 + 0.225 * j); c.moveTo(x + Math.cos(an - h) * rr, y + Math.sin(an - h) * rr); c.arc(x, y, rr, an - h, an + h); }
      for (let i = 0; i <= 4; i++) { const th = an - h + (2 * h * i) / 4; c.moveTo(x + Math.cos(th) * R * 0.2, y + Math.sin(th) * R * 0.2); c.lineTo(x + Math.cos(th) * R, y + Math.sin(th) * R); }
      c.strokeStyle = tint(col); al(0.9 * a); c.lineWidth = HL; c.stroke();
      c.beginPath(); c.arc(x, y, R, an - h, an + h); arcCurl(x, y, R, an + h, 10); c.lineWidth = TH; c.stroke();
      break;
    }
    case 'old':
    default:
      c.beginPath(); c.moveTo(x, y); c.arc(x, y, R, an - h, an + h); c.closePath(); al(0.2 * a); c.fill();
      c.beginPath(); c.arc(x, y, R, an - h, an + h); al(0.85 * a); c.lineWidth = 3; c.stroke();
  }
  if (L.rx) { const gh = Math.min(h, 0.78); c.beginPath(); c.arc(x, y, R + 3, an - gh, an + gh); c.strokeStyle = GOLD; c.lineCap = 'round'; alG(0.85 * a); c.lineWidth = 1.3; c.stroke(); }
}

// ------------------------------------------------------------------ the shield round the speaker

export function shield(sh, p, col, blink) {
  const L = lookOf(sh.src), rr = p.r + 24, n = Math.min(3, Math.ceil(sh.n)), gap = n > 1 ? 0.35 : 0;
  c.fillStyle = col; c.strokeStyle = col; c.lineCap = 'round';
  switch (L.shield) {
    case 'bubble':
      c.beginPath(); blob(p.x, p.y, rr, 0.3, 0.05, T * 2); al(0.08 * blink); c.fill();
      c.beginPath();
      for (let i = 0; i < n; i++) { const a0 = -Math.PI / 2 + (i / n) * TAU + gap / 2; blobArc(p.x, p.y, rr, a0, a0 + TAU / n - gap, 0.3 + i, 0.05); }
      al(0.8 * blink); c.lineWidth = 3; c.stroke();
      break;
    case 'staff': {
      c.beginPath(); circ(p.x, p.y, rr); al(0.06 * blink); c.fill();
      const gp = gapOf(4);
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const a0 = -Math.PI / 2 + (i / n) * TAU + gap / 2, a1 = a0 + TAU / n - gap;
        c.moveTo(p.x + Math.cos(a0) * rr, p.y + Math.sin(a0) * rr); c.arc(p.x, p.y, rr, a0, a1);
        arcCurl(p.x, p.y, rr, a1, 7);
      }
      al(0.85 * blink); c.lineWidth = TH; c.stroke();
      c.beginPath();
      for (let i = 0; i < n; i++) { const a0 = -Math.PI / 2 + (i / n) * TAU + gap / 2 + 0.1, a1 = a0 + TAU / n - gap - 0.2; c.moveTo(p.x + Math.cos(a0) * (rr - gp), p.y + Math.sin(a0) * (rr - gp)); c.arc(p.x, p.y, rr - gp, a0, a1); }
      al(0.6 * blink); c.lineWidth = HL; c.stroke();
      break;
    }
    default:
      c.beginPath(); circ(p.x, p.y, rr); al(0.07 * blink); c.fill();
      c.beginPath();
      for (let i = 0; i < n; i++) { const a0 = -Math.PI / 2 + (i / n) * TAU + gap / 2; c.moveTo(p.x + Math.cos(a0) * rr, p.y + Math.sin(a0) * rr); c.arc(p.x, p.y, rr, a0, a0 + TAU / n - gap); }
      al(0.75 * blink); c.lineWidth = 3; c.stroke();
  }
  if (sh.src?.remix) goldMark(p.x, p.y, rr + 4, 0.85 * blink, L.style, -Math.PI / 2 + T * 0.8);
}

// ------------------------------------------------------------------ bodies in flight

// An enemy the band sent flying (g.launch) leaves its launcher's wake; one put to sleep (Lullaby) wears a moon.
// Batched like the shots: the flying bodies are sorted into lists by wake, color and remix, one path per stroke, so a
// punted crowd costs a handful of draw calls, not a few per body. On a busy screen the halos and chips go.
const flying = new Map();
export function launches(enemies, inView) {
  for (const l of flying.values()) l.list.length = 0;
  for (const e of enemies) {
    const fl = e.launch;
    if (!fl || e.dead || !fl.src || !inView(e.x, e.y, 60)) continue;
    if (!fl.sleep && fl.vx * fl.vx + fl.vy * fl.vy < 1600) continue;
    let l = fl._w;
    if (l === undefined) {
      const L = lookOf(fl.src), kind = fl.sleep ? 'sleep' : L.launch === 'sleep' ? null : L.launch;
      if (kind) {
        const col = ROLE_INFO[fl.src.def?.role]?.color || '#ffffff', key = kind + '|' + col + (L.rx ? '|rx' : '');
        l = flying.get(key);
        if (!l) { l = { kind, col, rx: L.rx, list: [] }; flying.set(key, l); }
      } else l = null;
      fl._w = l;
    }
    if (l) l.list.push(e);
  }
  for (const l of flying.values()) if (l.list.length) { c.lineCap = 'round'; c.lineJoin = 'bevel'; (WAKE[l.kind] || WAKE.streak)(l.list, l.col, l.rx); }
}

// The flight of a launched body: its heading, how long a wake it leaves, and the point behind it the wake starts at.
let FUX = 1, FUY = 0, FNX = 0, FNY = 1, FLEN = 0, FBX = 0, FBY = 0;
function flyOf(e) {
  const fl = e.launch, sp = Math.hypot(fl.vx, fl.vy) || 1;
  FUX = fl.vx / sp; FUY = fl.vy / sp; FNX = -FUY; FNY = FUX; FLEN = Math.min(80, 18 + sp * 0.08);
  FBX = e.x - FUX * e.r; FBY = e.y - FUY * e.r;
}
const WAKE = {
  sleep(list, col) {
    c.beginPath();
    for (const e of list) { const mx = e.x + e.r * 0.7, my = e.y - e.r - 9; c.moveTo(mx + Math.cos(0.6) * 5, my + Math.sin(0.6) * 5); c.arc(mx, my, 5, 0.6, TAU - 0.6); c.arc(mx + 2.5, my - 1, 3.8, TAU - 0.9, 0.9, true); c.closePath(); }
    c.fillStyle = col; al(0.9); c.fill();
    c.beginPath();
    for (const e of list) {
      const zt = (T * 0.8 + seedOf(e)) % 1, mx = e.x + e.r * 0.7, my = e.y - e.r - 9, zx = mx + 7 + zt * 4, zy = my - 4 - zt * 10, z = 3 * (1 - zt * 0.6);
      c.moveTo(zx - z, zy - z); c.lineTo(zx + z, zy - z); c.lineTo(zx - z, zy + z); c.lineTo(zx + z, zy + z);
    }
    c.strokeStyle = tint(col); al(0.8); c.lineWidth = 1.2; c.stroke();
  },
  speedlines(list, col, rx) {
    // Three jagged speed lines behind the body; on a remix the middle one is gold.
    const line = (e, j) => {
      const ox = FNX * e.r * 0.6 * j, oy = FNY * e.r * 0.6 * j, l = FLEN * (j ? 0.75 : 1);
      c.moveTo(FBX + ox, FBY + oy); c.lineTo(FBX + ox - FUX * l * 0.5 + FNX * 3, FBY + oy - FUY * l * 0.5 + FNY * 3); c.lineTo(FBX + ox - FUX * l, FBY + oy - FUY * l);
    };
    c.beginPath();
    for (const e of list) { flyOf(e); line(e, -1); line(e, 1); if (!rx) line(e, 0); }
    c.lineJoin = 'miter'; c.strokeStyle = col; al(0.9); c.lineWidth = 2.4; c.stroke();
    c.strokeStyle = tint(col); c.lineWidth = 1; c.stroke();
    if (rx) {
      c.beginPath();
      for (const e of list) { flyOf(e); line(e, 0); }
      c.strokeStyle = GOLD; alG(1); c.lineWidth = 2; c.stroke();
    }
    if (BUSY) return;
    c.beginPath(); for (const e of list) jag(e.x, e.y, e.r + 5, seedOf(e), 0.12, 7);
    c.strokeStyle = col; c.lineJoin = 'bevel'; al(0.75); c.lineWidth = HL * 1.5; c.stroke();
    c.beginPath(); for (const e of list) { flyOf(e); chips(FBX - FUX * FLEN * 0.6, FBY - FUY * FLEN * 0.6, 6, seedOf(e), 4, (T * 3) % 1); }
    c.fillStyle = tint(col); al(0.9); c.fill();
  },
  ghosts(list, col) {
    c.beginPath();
    for (const e of list) {
      flyOf(e);
      const z = snap(e.r * 1.6, 2);
      for (let j = 1; j <= 2; j++) { const q = snap(z * (1 - 0.25 * j), 2); c.rect(snap(e.x - FUX * z * 0.9 * j) - q / 2, snap(e.y - FUY * z * 0.9 * j) - q / 2, q, q); }
    }
    c.strokeStyle = col; c.lineJoin = 'miter'; al(0.7); c.lineWidth = 2; c.stroke();
  },
  smear(list, col) {
    c.beginPath();
    for (const e of list) {
      flyOf(e);
      const r = e.r, L = FLEN;
      c.moveTo(FBX + FNX * r * 0.8, FBY + FNY * r * 0.8); c.quadraticCurveTo(FBX - FUX * L * 0.5 + FNX * r * 0.4, FBY - FUY * L * 0.5 + FNY * r * 0.4, FBX - FUX * L, FBY - FUY * L);
      c.quadraticCurveTo(FBX - FUX * L * 0.5 - FNX * r * 0.4, FBY - FUY * L * 0.5 - FNY * r * 0.4, FBX - FNX * r * 0.8, FBY - FNY * r * 0.8); c.closePath();
    }
    c.fillStyle = col; al(0.3); c.fill();
  },
  curl(list, col) {
    c.beginPath();
    for (const e of list) {
      flyOf(e);
      const L = FLEN, ex = FBX - FUX * L, ey = FBY - FUY * L;
      c.moveTo(FBX, FBY); c.quadraticCurveTo(FBX - FUX * L * 0.6 + FNX * e.r, FBY - FUY * L * 0.6 + FNY * e.r, ex, ey);
      curl(ex, ey, Math.atan2(-FUY, -FUX), 12, 1);
    }
    c.strokeStyle = tint(col); al(0.8); c.lineWidth = TH; c.stroke();
  },
  streak(list, col) {
    c.beginPath();
    for (const e of list) {
      flyOf(e);
      for (let j = -1; j <= 1; j += 2) { const ox = FNX * e.r * 0.5 * j, oy = FNY * e.r * 0.5 * j; c.moveTo(FBX + ox, FBY + oy); c.lineTo(FBX + ox - FUX * FLEN, FBY + oy - FUY * FLEN); }
    }
    c.strokeStyle = tint(col); al(0.75); c.lineWidth = 1.3; c.stroke();
  },
};
