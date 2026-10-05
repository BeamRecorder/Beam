import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createRenderDocument } from '../../../packages/engine/src/document/render-document';
import { cameraZooms } from '../src/camera';
import { root } from './beam-cli.mjs';

const theme = process.argv[2] || 'dark';
if (!['light', 'dark'].includes(theme)) throw new Error('Choose light or dark');
mkdirSync(resolve(root, '.beam'), { recursive: true });
mkdirSync(resolve(root, 'renders'), { recursive: true });
const snapshot = createRenderDocument(undefined, 1280, 800, 60);
snapshot.duration = 12;
snapshot.zooms = cameraZooms();
snapshot.zoomMotionBlur = { enabled: false, intensity: 0 };
snapshot.canvas.watermark.enabled = false;
snapshot.canvas.transitions = { entry: null, exit: null };
const job = resolve(root, `.beam/${theme}-motion.json`);
writeFileSync(
  job,
  JSON.stringify(
    {
      version: 1,
      entry: `../dist/${theme}/index.html`,
      width: 2560,
      height: 1600,
      duration: 12,
      fps: 60,
      format: 'mp4',
      preset: 'high',
      snapshot,
    },
    null,
    2,
  ),
);
const output = resolve(root, `renders/html-canvas-${theme}.mp4`);
const rendered = spawnSync(
  'bun',
  [resolve(root, '../../apps/cli/src/index.ts'), 'motion', job, output, '--overwrite'],
  { cwd: root, stdio: 'inherit' },
);
if (rendered.status !== 0) throw new Error('Beam motion export failed');
const poster = spawnSync(
  'ffmpeg',
  [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-ss',
    '10.2',
    '-i',
    output,
    '-frames:v',
    '1',
    resolve(root, `renders/html-canvas-${theme}.png`),
  ],
  { stdio: 'inherit' },
);
if (poster.status !== 0) throw new Error('External ffmpeg poster extraction failed');
