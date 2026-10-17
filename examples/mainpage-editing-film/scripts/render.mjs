import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(resolve(root, 'renders'), { recursive: true });
await mkdir(resolve(root, '.beam'), { recursive: true });
const job = resolve(root, '.beam/final-motion.json');
await writeFile(
  job,
  JSON.stringify(
    {
      version: 1,
      entry: '../dist/index.html',
      width: 1920,
      height: 1080,
      duration: 23.554,
      fps: 60,
      format: 'mp4',
      preset: 'high',
    },
    null,
    2,
  ),
);
const output = resolve(root, 'renders/Video-for-BeamMainPage-editing.mp4');
const cli = resolve(root, '../../apps/cli/src/index.ts');
const child = spawn('bun', [cli, 'motion', job, output, '--overwrite'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'inherit'],
  env: { BEAM_CHROMIUM_GPU: 'hardware', BEAM_CHROMIUM_VIDEO_DECODE: 'software', ...process.env },
});
let result = '';
child.stdout.on('data', (chunk) => {
  result += chunk;
});
const status = await new Promise((done) => child.once('exit', done));
if (status !== 0) throw new Error(`Beam CLI export failed (${status}).`);
await writeFile(resolve(root, '.beam/export-diagnostics.json'), result);
console.log(output);
