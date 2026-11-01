// The weapon gallery: every instrument at level 5 and remixed, each in a short god sim with only that sound in
// the band, frozen mid-fight (from --at seconds on) on the frame where most of its attack is live, cropped round the
// speaker and the attack and tiled into one labelled sheet per channel (gallery-<channel>.png: the five styles
// across, level 5 above, the remix below). The tiles stay next to the sheets (<id>.png, <id>-rx.png) for a closer
// look, and gallery.json lists them. About 20 minutes for all 60.
//   node tools/gallery.mjs [outdir] [--ids a,b] [--role beat] [--no-remix] [--at 80]
//   node tools/gallery.mjs --bench [/src/render/renderer.js,/src/render/other.js] [--frames 300] [--stops 4.6,6.8]
//                          [--band id:5,id:5,... | --band "<extra query>"]
// --bench times renderers on the late game tools/shots.mjs --late captures (god sim, seed 1; --band gives a solo band,
// or appends a query with '=' in it): from each of --stops minutes the fight plays on for --frames frames, and on
// each one every Renderer named (each on its own 1280x720 canvas) draws it, flushed with a 1-pixel read back so the
// raster is paid for too, the modules taking turns at going first. It prints the mean ms per draw of each and the
// mean effect counts. To compare with an older renderer, copy it next to the new one (src/render/) and name both.
import { serve, launch } from './serve.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def; };
const VALUED = ['--ids', '--role', '--at', '--bench', '--frames', '--stops', '--band'];
const outDir = args.find((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1])) || 'gallery';

const ROWS = {
  beat: ['kick808', 'taiko', 'chipdrums', 'doublekick', 'timpani'],
  perc: ['hats909', 'shaker', 'chiphat', 'ride', 'fieldsnare'],
  bass: ['subbass', 'upright', 'tribass', 'dropd', 'cellos'],
  chords: ['supersaw', 'rhodes', 'chipchords', 'powerchords', 'strings'],
  lead: ['sawlead', 'flute', 'squarelead', 'shred', 'horn'],
  arp: ['arpsynth', 'musicbox', 'chiparp', 'pinch', 'harp'],
};
const STYLE_NAMES = ['Synth', 'Live', '8-Bit', 'Heavy', 'Orchestra'];

const { server, url } = await serve();
const browser = await launch();
const logs = [];

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  return page;
}

if (args.includes('--bench')) {
  const mods = (flag('--bench', '/src/render/renderer.js')).split(',');
  const frames = Number(flag('--frames', 300));
  const band = flag('--band', null);
  const page = await newPage();
  const out = [];
  for (const min of (flag('--stops', '4.6,6.8')).split(',').map(Number)) {
    await page.goto(`${url}/index.html?sim=1&speed=12&bot=1&god=1&seed=1&minutes=${min}${band ? (band.includes('=') ? `&${band}` : `&solo=1&give=${band}`) : ''}`);
    await page.waitForFunction(() => window.__LS?.done, null, { timeout: 600000, polling: 250 });
    out.push(await page.evaluate(async ({ mods, frames, min }) => {
      const L = window.__LS, g = L.game, fx = g.fx;
      const rs = [];
      for (const m of mods) {
        const cv = document.createElement('canvas');
        cv.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:720px;visibility:hidden';
        document.body.appendChild(cv);
        const { Renderer } = await import(m);
        const r = new Renderer(cv);
        for (let i = 0; i < 30; i++) r.draw(g, 1 / 60);   // warm the caches
        rs.push(r);
      }
      // The fight goes on two sim steps a frame; after each frame that stepped, every renderer draws it (taking
      // turns at going first), each draw flushed with a 1-pixel read back so its raster is timed too.
      const tot = mods.map(() => 0), cnt = {};
      let n = 0, last = g.time;
      L.opts.speed = 2; L.opts.minutes = min + 1; L.done = false;
      await new Promise((done) => {
        const tick = () => {
          if (g.time !== last) {
            last = g.time;
            const order = n & 1 ? [...rs.keys()].reverse() : [...rs.keys()];
            for (const j of order) {
              const r = rs[j], c = r.ctx;
              c.getImageData(0, 0, 1, 1);
              const t0 = performance.now();
              r.draw(g, 1 / 30); c.getImageData(0, 0, 1, 1);
              tot[j] += performance.now() - t0;
            }
            for (const k of ['bullets', 'rings', 'flashes', 'beams', 'zaps', 'mines', 'strikes', 'cones', 'walls']) cnt[k] = (cnt[k] || 0) + fx[k].length;
            cnt.enemies = (cnt.enemies || 0) + g.enemies.length;
            n++;
          }
          if (n >= frames || L.done) { L.done = true; done(); } else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return { min, frames: n, mean: Object.fromEntries(Object.entries(cnt).map(([k, v]) => [k, Math.round(v / n)])),
        ms: Object.fromEntries(mods.map((m, j) => [m, Math.round((tot[j] / n) * 100) / 100])) };
    }, { mods, frames, min }));
  }
  console.log(JSON.stringify(out));
  await browser.close();
  server.close();
  process.exit(0);
}

await mkdir(outDir, { recursive: true });
const role = flag('--role', null);
const only = flag('--ids', null)?.split(',');
const at = Number(flag('--at', 80));
const remixes = !args.includes('--no-remix');
const ids = only || (role ? ROWS[role] : Object.values(ROWS).flat());

// One tile: a god sim with the sound alone at level 5 (remixed with rx), in two passes over the same seeded fight (a
// sim plays the same run every time). The first steps WINDOW seconds of real-time frames from `at` and scores each:
// how much of the sound's attack is live and fresh. The second replays the fight to the best frame and freezes it.
// The crop leans from the speaker toward where the attack is, so a whirl set on a far crowd still makes the tile.
const WINDOW = 6;
function score(id) {
  const g = window.__LS.game, fx = g.fx;
  const own = (o) => o.src?.def?.id === id;
  let s = 0, sx = 0, sy = 0;
  const at = (x, y, w) => { s += w; sx += x * w; sy += y * w; };
  for (const b of fx.bullets) if (own(b)) at(b.x, b.y, 1);
  for (const b of fx.beams) if (own(b) && b.age < b.life * 0.6) at((b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2, 3);
  for (const r of fx.rings) if (own(r) && r.t < r.dur * 0.7) at(r.x, r.y, 3);
  for (const f of fx.flashes) if (own(f) && f.age < f.life * 0.5 && f.fill > 0) at(f.x, f.y, 2);
  for (const k of fx.cones) if (own(k) && k.age < k.life * 0.6) at(k.x + Math.cos(k.angle) * k.r * 0.5, k.y + Math.sin(k.angle) * k.r * 0.5, 3);
  for (const k of fx.strikes) if (own(k)) at(k.x, k.y, 2);
  for (const z of fx.zaps) if (own(z) && z.age < z.life * 0.6) { const q = z.pts[z.pts.length - 1]; at(q[0], q[1], 2); }
  for (const t of fx.tethers) if (own(t)) at(t.e.x, t.e.y, t.glow > 0.4 ? 2 : 1);
  for (const w of fx.walls) if (own(w)) at(w.x + Math.cos(w.angle) * w.r, w.y + Math.sin(w.angle) * w.r, 2);
  for (const m of fx.mines) if (own(m)) at(m.x, m.y, m.glow > 0.4 ? 3 : 1);
  for (const e of g.enemies) if (!e.dead && e.launch?.src?.def?.id === id) at(e.x, e.y, 3);
  const p = g.player;
  return { s, dx: s ? sx / s - p.x : 0, dy: s ? sy / s - p.y : 0, t: g.time, enemies: g.enemies.length };
}

async function tile(page, id, rx) {
  const q = `sim=1&speed=24&bot=1&god=1&solo=1&seed=7&start=${id}&give=${id}:5${rx ? `&remix=${id}` : ''}&minutes=${at / 60}`;
  const toStart = async () => {
    await page.goto(`${url}/index.html?${q}`);
    await page.waitForFunction(() => window.__LS?.done, null, { timeout: 120000, polling: 100 });
  };
  await toStart();
  await page.evaluate(({ m, src }) => {
    const L = window.__LS;
    L.opts.speed = 1; L.opts.minutes = m; L.done = false;
    window.__score = new Function(`return (${src})`)();
    window.__best = { s: -1 };
  }, { m: (at + WINDOW) / 60, src: score.toString() });
  await page.waitForFunction((id) => {
    const r = window.__score(id);
    if (r.s > window.__best.s) window.__best = r;
    return window.__LS.done;
  }, id, { timeout: 120000, polling: 'raf' });
  const best = await page.evaluate(() => window.__best);
  // Replay to the best frame: the sim stops on the first step at or past its time.
  await toStart();
  await page.evaluate((m) => { const L = window.__LS; L.opts.speed = 1; L.opts.minutes = m; L.done = false; }, (best.t - 1e-6) / 60);
  await page.waitForFunction(() => window.__LS.done, null, { timeout: 120000, polling: 'raf' });
  // The arena only: no HUD or banners over the tile. The camera settles on the frozen frame.
  await page.evaluate(() => { for (const id of ['hud', 'screens']) document.getElementById(id).style.visibility = 'hidden'; });
  await page.waitForTimeout(350);
  const s = 0.96, W = 760, H = 500;   // the arena's zoom at 1280x720
  const cx = Math.max(W / 2, Math.min(1280 - W / 2, 640 + best.dx * s * 0.6));
  const cy = Math.max(H / 2, Math.min(720 - H / 2, 360 + best.dy * s * 0.6));
  const file = path.join(outDir, `${id}${rx ? '-rx' : ''}.png`);
  await page.screenshot({ path: file, clip: { x: Math.round(cx - W / 2), y: Math.round(cy - H / 2), width: W, height: H } });
  const meta = await page.evaluate((rx) => {
    const L = window.__LS, inst = Object.values(L.game.loadout.channels).find(Boolean);
    return { name: rx ? inst.def.remix.name : inst.def.name, base: inst.def.name, style: inst.def.style, t: Math.round(L.game.time * 10) / 10 };
  }, rx);
  return { id, rx, file, ...meta, score: best.s, enemies: best.enemies };
}


const page = await newPage();
const done = [];
for (const id of ids) {
  for (const rx of remixes ? [false, true] : [false]) {
    const t = await tile(page, id, rx).catch((e) => ({ id, rx, error: e.message }));
    done.push(t);
    console.log(JSON.stringify(t));
  }
}

// The sheets: one per channel, the five styles across, level 5 above, the remix below.
const sheet = await newPage();
for (const [r, row] of Object.entries(ROWS)) {
  const cells = [];
  for (const rx of remixes ? [false, true] : [false]) {
    row.forEach((id, i) => {
      const t = done.find((d) => d.id === id && d.rx === rx);
      cells.push({ t, label: t && !t.error ? `${t.name}${rx ? ' (remix)' : ' L5'}` : `${id}${rx ? ' (remix)' : ''}: missing`, style: STYLE_NAMES[i] });
    });
  }
  if (!cells.some((c) => c.t && !c.t.error)) continue;
  const imgs = await Promise.all(cells.map(async (c) => (c.t && !c.t.error ? `data:image/png;base64,${(await readFile(c.t.file)).toString('base64')}` : '')));
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0d0a17;color:#f3eeff;font:600 15px system-ui;padding:10px">
    <div style="font:700 20px system-ui;margin:2px 4px 8px">${r.toUpperCase()}</div>
    <div style="display:grid;grid-template-columns:repeat(5,456px);gap:8px">${cells.map((c, i) => `<figure style="margin:0">
      <div style="padding:3px 4px;color:#a89fc8">${c.style} · <span style="color:#f3eeff">${c.label}</span></div>
      ${imgs[i] ? `<img src="${imgs[i]}" style="width:456px;height:300px;display:block;border:1px solid #2f2650">` : '<div style="width:456px;height:300px;border:1px dashed #43386b"></div>'}
    </figure>`).join('')}</div></body>`;
  await sheet.setViewportSize({ width: 5 * 456 + 4 * 8 + 20, height: 400 });
  await sheet.setContent(html);
  await sheet.waitForTimeout(150);
  await sheet.screenshot({ path: path.join(outDir, `gallery-${r}.png`), fullPage: true });
}
await writeFile(path.join(outDir, 'gallery.json'), JSON.stringify(done, null, 2));
console.log(JSON.stringify({ tiles: done.length, errors: done.filter((d) => d.error).length, logs: logs.filter((l) => !/Failed to load resource/.test(l)).slice(0, 20) }));
await browser.close();
server.close();
process.exit(logs.some((l) => /^pageerror/.test(l)) ? 1 : 0);
