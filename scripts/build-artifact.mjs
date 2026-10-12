// Turns the Vite build in dist/ into the shape a claude.ai artifact expects:
// dist/artifact.html holds the page content (the artifact host adds <html>, <head> and <body>),
// and the JS/CSS bundles are published next to it under the same relative paths.
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? '';
const headKept = head
  .split('\n')
  .filter((l) => !/<meta (charset|name="viewport")/i.test(l))
  .join('\n')
  .trim();

fs.writeFileSync(path.join(dist, 'artifact.html'), `${headKept}\n${body.trim()}\n`);

const assets = fs.readdirSync(path.join(dist, 'assets')).map((f) => `assets/${f}`);
const files = Object.fromEntries(assets.map((a) => [a, `dist/${a}`]));
fs.writeFileSync(path.join(dist, 'artifact-files.json'), JSON.stringify(files, null, 2));
console.log('Wrote dist/artifact.html with', assets.length, 'asset files:');
for (const a of assets) console.log('  ' + a);
