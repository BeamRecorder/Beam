import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { root } from './beam-cli.mjs';

const website = resolve(root, '../../apps/website-private/public');
mkdirSync(resolve(website, 'media'), { recursive: true });
mkdirSync(resolve(website, 'images/features'), { recursive: true });
for (const theme of ['light', 'dark']) {
  const name = `local-render-${theme}`;
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
  resolve(website, 'media/local-render.NOTICE.txt'),
  'Beam local rendering — illustrated workflow, not a recorded terminal session or measured export speed.\n' +
    '8 seconds, 1280 × 800, 60 fps, silent; matching light/dark videos and posters.\n' +
    'Rendered using the real Beam CLI motion command and its default WebCodecs/Mediabunny export pipeline. WebM/WebP optimized with external FFmpeg.\n' +
    'Shown command: beam-cli motion scene.json output.mp4. scene.json is a motion job referencing scene.html, not a saved desktop project.\n' +
    'Beam renders the frames; Mediabunny encodes through WebCodecs and writes the media container; the CLI publishes the completed local file.\n' +
    'This describes composition rendering, not where the chosen agent model processes data.\n' +
    'Source: Beam repository, examples/website-local-render-loop/ (MPL-2.0).\n' +
    'Uses original Beam theme tokens and product mark, Lucide icons and local Hanken Grotesk/Noto Sans Mono (SIL OFL).\n' +
    'Typing frontier adapted from HyperFrames registry code-terminal-run (Apache-2.0). See source assets/NOTICE.md.\n',
);
console.log('Wrote themed local rendering loops, posters and notice to the private site.');
