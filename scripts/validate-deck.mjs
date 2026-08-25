import fs from 'node:fs';
import zlib from 'node:zlib';

const filePath = process.argv[2] || 'index.html';
const html = fs.readFileSync(filePath, 'utf8');
const templateMatch = html.match(/<script type="__bundler\/template">([\s\S]*?)<\/script>/);
const manifestMatch = html.match(/<script type="__bundler\/manifest">\s*([\s\S]*?)\s*<\/script>/);

if (!templateMatch || !manifestMatch) {
  throw new Error('Bundled template or manifest is missing.');
}

const template = JSON.parse(templateMatch[1]);
const manifest = JSON.parse(manifestMatch[1]);
const runtimeEntry = manifest['9b20f824-f4f5-4cb3-8197-59082e52e80e'];

if (!runtimeEntry) throw new Error('Deck runtime is missing.');

const packedRuntime = Buffer.from(runtimeEntry.data, 'base64');
const runtime = (runtimeEntry.compressed
  ? zlib.gunzipSync(packedRuntime)
  : packedRuntime
).toString('utf8');

const checks = {
  htmlBytes: Buffer.byteLength(html),
  slides: (template.match(/<section/g) || []).length,
  coverFit: runtime.includes('useLetterbox ? Math.min : Math.max'),
  noRail: template.includes('no-rail'),
  koreanTitle: template.includes('경민대학교 야구점퍼 제안 | 캠퍼스룩'),
  fitToggle: template.includes("event.key.toLowerCase() !== 'f'"),
};

console.log(JSON.stringify(checks, null, 2));

if (
  checks.slides !== 14 ||
  !checks.coverFit ||
  !checks.noRail ||
  !checks.koreanTitle ||
  !checks.fitToggle
) {
  process.exit(1);
}
