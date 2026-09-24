// Bundles the game into single self-contained HTML files:
//   dist/loop-survivors.html  a full page that runs from disk (double-click to play)
//   dist/artifact.html        the same content without <html>/<head>/<body>, for hosts that wrap pages
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
await mkdir(out, { recursive: true });

const res = await build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['es2020'],
  write: false,
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await readFile(path.join(root, 'styles.css'), 'utf8');
const html = await readFile(path.join(root, 'index.html'), 'utf8');

const full = html
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="src/main.js"></script>', () => `<script>\n${js}\n</script>`);
if (full.includes('src/main.js') || full.includes('href="styles.css"')) throw new Error('template replacement failed');
await writeFile(path.join(out, 'loop-survivors.html'), full);

// Artifact variant: title, fonts, style, body content, script. No document wrapper tags.
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const fonts = [...html.matchAll(/<link rel="(?:preconnect|stylesheet)" href="https:\/\/fonts[^>]*>/g)].map((m) => m[0]).join('\n');
const body = html.match(/<body>([\s\S]*?)<script/)[1].trim();
const artifact = `${title}\n${fonts}\n<style>\n${css}\n</style>\n${body}\n<script>\n${js}\n</script>\n`;
await writeFile(path.join(out, 'artifact.html'), artifact);

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(1)} KB`;
console.log(`dist/loop-survivors.html ${kb(full)}\ndist/artifact.html ${kb(artifact)}`);
