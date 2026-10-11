import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createRenderDocument } from '../../../packages/engine/src/document/render-document';
import { root } from './beam-cli.mjs';

const theme = process.argv[2] || 'dark';
if (!['light', 'dark'].includes(theme)) throw new Error('Choose light or dark');
mkdirSync(resolve(root, '.beam'), { recursive: true });
mkdirSync(resolve(root, 'renders'), { recursive: true });
const snapshot = createRenderDocument(undefined, 1280, 800, 60);
snapshot.duration = 8;
snapshot.zooms = [];
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
      width: 1280,
      height: 800,
      duration: 8,
      fps: 60,
      format: 'mp4',
      preset: 'high',
      snapshot,
    },
    null,
    2,
  ),
);
const output = resolve(root, `renders/local-render-${theme}.mp4`);
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
    '6.3',
    '-i',
    output,
    '-frames:v',
    '1',
    resolve(root, `renders/local-render-${theme}.png`),
  ],
  { stdio: 'inherit' },
);
if (poster.status !== 0) throw new Error('External ffmpeg poster extraction failed');
