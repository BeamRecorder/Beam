import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createRenderDocument } from '../../../packages/engine/src/document/render-document';
import { root } from './beam-cli.mjs';
import { HERO_DURATION, heroZooms } from '../src/hero-motion';

const mode = process.argv[2] || 'presets';
if (!['presets', 'export', 'clipboard', 'hero'].includes(mode)) throw new Error('Choose presets, export, clipboard or hero');
const theme = process.argv[3] || 'dark';
if (!['light', 'dark'].includes(theme)) throw new Error('Choose light or dark');
mkdirSync(resolve(root, '.beam'), { recursive: true });
mkdirSync(resolve(root, 'renders'), { recursive: true });
const snapshot = createRenderDocument(undefined, 1280, 800, 60);
const duration = mode === 'hero' ? HERO_DURATION : 8;
snapshot.duration = duration;
snapshot.zooms = mode === 'hero' ? heroZooms() : [];
snapshot.zoomMotionBlur = { enabled: false, intensity: 0 };
snapshot.canvas.watermark.enabled = false;
snapshot.canvas.transitions = { entry: null, exit: null };
const job = resolve(root, `.beam/${mode}-${theme}-motion.json`);
writeFileSync(
  job,
  JSON.stringify(
    {
      version: 1,
      entry: `../dist/${mode}-${theme}/index.html`,
      width: 1280,
      height: 800,
      duration,
      fps: 60,
      format: 'mp4',
      preset: 'high',
      snapshot,
    },
    null,
    2,
  ),
);
const output = resolve(root, `renders/instant-${mode}-${theme}.mp4`);
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
    mode === 'hero' ? '0' : mode === 'presets' ? '2.45' : '6.3',
    '-i',
    output,
    '-frames:v',
    '1',
    resolve(root, `renders/instant-${mode}-${theme}.png`),
  ],
  { stdio: 'inherit' },
);
if (poster.status !== 0) throw new Error('External ffmpeg poster extraction failed');
