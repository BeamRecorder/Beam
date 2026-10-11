import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { root } from './beam-cli.mjs';

const website = resolve(root, '../../apps/website-private/public');
mkdirSync(resolve(website, 'media'), { recursive: true });
mkdirSync(resolve(website, 'images/features'), { recursive: true });
for (const theme of ['light', 'dark']) {
  const name = `motion-still-${theme}`;
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
  resolve(website, 'media/motion-still.NOTICE.txt'),
  'Motion or still. The same source — authored HTML/Vue/GSAP composition.\n' +
    '7 seconds, 1280 × 800, 60 fps, silent; matching light/dark videos and posters.\n' +
    'Video rendered through real Beam CLI motion. The displayed PNG is captured at 2400 ms (frame 144) from the very same Artwork.vue and timeline using Beam CLI createMotionPage.\n' +
    'The still remains an actual raster image while the HTML keeps moving. External FFmpeg creates VP9/WebP derivatives.\n' +
    'Source: Beam repository, examples/website-motion-still-loop/ (MPL-2.0).\n' +
    'Original Beam palette, product mark, Lucide icons and local Hanken Grotesk/Noto Sans Mono (SIL OFL).\n' +
    'Flat 2D card-pair layout adapted from HyperFrames split-tilt-cards (Apache-2.0); see source assets/NOTICE.md and license.\n',
);
console.log('Wrote themed Motion/Still loops, actual-frame posters and notice to the private site.');
