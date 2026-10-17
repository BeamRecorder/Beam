import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  repository = resolve(root, '../..');
const [projectId, font] = process.argv.slice(2);
if (!projectId || !font)
  throw new Error('Usage: node scripts/prepare.mjs PROJECT_UUID /path/to/original-font.ttf (project open in Beam)');
function run(args) {
  const result = spawnSync('bun', [resolve(repository, 'apps/cli/src/index.ts'), ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stdout || result.stderr);
  return JSON.parse(result.stdout);
}
const call = (name, input) => run(['tools', 'call', name, JSON.stringify(input)]);
const { document } = call('documents.snapshot', { projectId });
if (document.composition.assets.length !== 2 || Object.keys(document.fontSources ?? {}).length !== 1)
  throw new Error('This film requires its original recording, ending image and one ending font.');
if (document.duration !== 22.726 || !document.composition.clips.some((clip) => clip.id === 'screen'))
  throw new Error('This authored film requires the original 22.726-second Video for BeamMainPage project.');
const fontBytes = await readFile(resolve(font));
const fontId = createHash('sha256').update(fontBytes).digest('hex');
if (!Object.hasOwn(document.fontSources, fontId))
  throw new Error('The supplied font does not match the original ending.');
await mkdir(resolve(root, 'assets/cursors'), { recursive: true });
await mkdir(resolve(root, '.beam'), { recursive: true });
await writeFile(resolve(root, 'assets/snapshot.json'), JSON.stringify(document, null, 2) + '\n');
for (const asset of document.composition.assets) {
  const local = call('assets.resolve', { projectId, source: asset.src });
  await cp(local.path, resolve(root, 'assets', asset.kind === 'video' ? 'recording.mp4' : 'beam-ending.png'));
}
await writeFile(resolve(root, 'assets/HankenGrotesk.ttf'), fontBytes);
for (const name of [
  'golden-gate-4k',
  'ventura',
  'tahoe-light',
  'tahoe-dark',
  'golden-gate-sunset',
  'golden-gate-night',
])
  await cp(resolve(repository, 'public/wallpapers/image', name + '.webp'), resolve(root, 'assets', name + '.webp'));
for (const name of await readdir(resolve(repository, 'public/macOsSvgCursors')))
  if (name.endsWith('.svg'))
    await cp(resolve(repository, 'public/macOsSvgCursors', name), resolve(root, 'assets/cursors', name));
await cp(resolve(repository, 'public/brand/BeamIcon.webp'), resolve(root, 'assets/BeamIcon.webp'));
await cp(resolve(repository, 'public/font/HankenGrotesk-OFL.txt'), resolve(root, 'assets/OFL.txt'));
const original = resolve(root, '.beam/original-snapshot.json'),
  commands = resolve(root, '.beam/trim.json');
await writeFile(original, JSON.stringify(document));
await writeFile(
  commands,
  JSON.stringify([{ type: 'clip.trim', payload: { clipId: 'screen', edge: 'end', timeMs: 19683 } }]),
);
run(['edit', original, commands, resolve(root, '.beam/trimmed-snapshot.json'), '--overwrite']);
console.log('Frozen the original media and verified the native trim command in a separate snapshot.');
