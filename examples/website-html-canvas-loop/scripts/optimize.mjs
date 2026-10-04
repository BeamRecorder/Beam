import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { root } from './beam-cli.mjs';

const website = resolve(root, '../../apps/website-private/public');
mkdirSync(resolve(website, 'media'), { recursive: true });
mkdirSync(resolve(website, 'images/features'), { recursive: true });
for (const theme of ['light', 'dark']) {
  const name = `html-canvas-${theme}`;
  for (const args of [
    [
      '-i',
      resolve(root, `renders/${name}.mp4`),
      '-an',
      '-c:v',
      'libvpx-vp9',
      '-crf',
      '28',
      '-b:v',
      '0',
      '-row-mt',
      '1',
      '-threads',
      '4',
      '-deadline',
      'good',
      '-cpu-used',
      '4',
      '-pix_fmt',
      'yuv420p',
      '-g',
      '360',
      resolve(website, `media/${name}.webm`),
    ],
    [
      '-i',
      resolve(root, `renders/${name}.png`),
      '-c:v',
      'libwebp',
      '-quality',
      '88',
      '-compression_level',
      '6',
      resolve(website, `images/features/${name}.webp`),
    ],
  ]) {
    const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error('External FFmpeg website optimization failed');
  }
}
writeFileSync(
  resolve(website, 'media/html-canvas.NOTICE.txt'),
  'Your canvas can be code — authored HTML/Vue/GSAP explanation.\n' +
    '12 seconds, 1280 × 800, 60 fps, silent; light/dark variants.\n' +
    'Rendered by Beam CLI with two native manual 2D camera zooms. Source frames are captured at 2× for sharp zooms.\n' +
    'Source and canvas share the actual authored edit state; this is an illustrated edit, not recorded user input.\n' +
    'Editable HTML sources and zooms are retained in independent Beam video projects.\n' +
    'Source: Beam repository, examples/website-html-canvas-loop/ (MPL-2.0).\n' +
    'Uses native Beam editor titlebar, workspace, playback toolbar, Zoom panel and timeline components/painter with original theme tokens, Lucide icons and the existing Beam product mark.\n' +
    'Hanken Grotesk and Noto Sans Mono: SIL OFL. Marks and dependencies retain their rights.\n' +
    'WebM/WebP derivatives were produced using external FFmpeg; no executable is bundled.\n',
);
console.log('Wrote HTML canvas loops, posters and asset notice to the private site.');
