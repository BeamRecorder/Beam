import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kind = process.argv[2];
if (!['glass', 'automatic'].includes(kind)) throw new Error('Choose glass or automatic.');
const theme = process.argv[3] || 'dark';
if (!['light', 'dark'].includes(theme)) throw new Error('Choose light or dark.');
mkdirSync(resolve(root, '.beam'), { recursive: true });
mkdirSync(resolve(root, 'renders'), { recursive: true });
const output = resolve(root, `renders/zooms-${kind}-${theme}.mp4`);
const job = resolve(root, `.beam/${kind}-${theme}-motion.json`);
writeFileSync(
  job,
  JSON.stringify(
    {
      version: 1,
      entry: `../dist/${kind}-${theme}/index.html`,
      width: 1280,
      height: 800,
      duration: 10,
      fps: 30,
      format: 'mp4',
      preset: 'high',
    },
    null,
    2,
  ),
);
const result = spawnSync('bun', [resolve(root, '../../apps/cli/src/index.ts'), 'motion', job, output, '--overwrite'], {
  cwd: root,
  stdio: 'inherit',
});
if (result.status !== 0) throw new Error('Beam motion export failed.');
const poster = spawnSync(
  'ffmpeg',
  [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    output,
    '-frames:v',
    '1',
    resolve(root, `renders/zooms-${kind}-${theme}.png`),
  ],
  { stdio: 'inherit' },
);
if (poster.status !== 0) throw new Error('Extracting the poster requires external ffmpeg.');
