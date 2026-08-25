import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [sourceArg, outputArg] = process.argv.slice(2);

if (!sourceArg || !outputArg) {
  console.error('Usage: node scripts/prepare-deck.mjs <source.html> <output.html>');
  process.exit(1);
}

const sourcePath = path.resolve(sourceArg);
const outputPath = path.resolve(outputArg);
let html = fs.readFileSync(sourcePath, 'utf8');

const manifestPattern = /(<script type="__bundler\/manifest">\s*)([\s\S]*?)(\s*<\/script>)/;
const templatePattern = /(<script type="__bundler\/template">)([\s\S]*?)(<\/script>)/;
const manifestMatch = html.match(manifestPattern);
const templateMatch = html.match(templatePattern);

if (!manifestMatch || !templateMatch) {
  throw new Error('Bundled manifest or template was not found in the source HTML.');
}

const manifest = JSON.parse(manifestMatch[2]);
const deckRuntimeId = '9b20f824-f4f5-4cb3-8197-59082e52e80e';
const runtimeEntry = manifest[deckRuntimeId];

if (!runtimeEntry) {
  throw new Error(`Deck runtime ${deckRuntimeId} was not found.`);
}

const packedRuntime = Buffer.from(runtimeEntry.data, 'base64');
const runtimeBytes = runtimeEntry.compressed
  ? zlib.gunzipSync(packedRuntime)
  : packedRuntime;
let runtime = runtimeBytes.toString('utf8');

const originalFit = 'const s = Math.min(vw / this.designWidth, vh / this.designHeight);';
const responsiveFit = [
  "const useLetterbox = this.hasAttribute('data-letterbox');",
  '      const s = (useLetterbox ? Math.min : Math.max)(',
  '        vw / this.designWidth,',
  '        vh / this.designHeight',
  '      );',
].join('\n');

if (!runtime.includes(originalFit)) {
  throw new Error('Expected deck fit calculation was not found.');
}

runtime = runtime.replace(originalFit, responsiveFit);
const updatedRuntime = Buffer.from(runtime, 'utf8');
runtimeEntry.data = (runtimeEntry.compressed
  ? zlib.gzipSync(updatedRuntime, { level: 9 })
  : updatedRuntime
).toString('base64');

let template = JSON.parse(templateMatch[2]);

template = template
  .replace('<html><head>', '<html lang="ko"><head>')
  .replace(
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    [
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
      '<title>경민대학교 야구점퍼 제안 | 캠퍼스룩</title>',
      '<meta name="description" content="경민대학교 야구점퍼 제작 제안 발표자료">',
      '<meta name="theme-color" content="#3D1220">',
    ].join('\n'),
  )
  .replace(
    '<x-import component-from-global-scope="deck-stage"',
    '<x-import component-from-global-scope="deck-stage" no-rail',
  );

const fitControls = `
<script>
(() => {
  const wantsContain = new URLSearchParams(location.search).get('fit') === 'contain';
  let lastStage = null;
  let attempts = 0;
  const timer = setInterval(() => {
    const stage = document.querySelector('deck-stage');
    if (stage && stage.shadowRoot && stage !== lastStage) {
      lastStage = stage;
      if (wantsContain) stage.setAttribute('data-letterbox', '');
      stage._fit?.();
    }
    attempts += 1;
    if (attempts >= 100) clearInterval(timer);
  }, 50);

  window.addEventListener('keydown', (event) => {
    const active = document.activeElement;
    if (active && /INPUT|TEXTAREA|SELECT/.test(active.tagName)) return;
    if (event.key.toLowerCase() !== 'f') return;

    const stage = document.querySelector('deck-stage');
    if (!stage) return;
    event.preventDefault();
    stage.toggleAttribute('data-letterbox');
    stage._fit?.();
  });
})();
<\/script>
`;

if (!template.includes('</body>')) {
  throw new Error('Template body closing tag was not found.');
}

template = template.replace('</body>', `${fitControls}</body>`);

html = html
  .replace(manifestPattern, `$1${JSON.stringify(manifest)}$3`)
  .replace(templatePattern, `$1${JSON.stringify(template).replace(/<\//g, '<\\u002F')}$3`)
  .replace('<title>Bundled Page</title>', '<title>경민대학교 야구점퍼 제안 | 캠퍼스룩</title>');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html);

console.log(`Prepared ${outputPath}`);
console.log('Default fit: cover (no letterbox). Press F to toggle full-slide contain mode.');
