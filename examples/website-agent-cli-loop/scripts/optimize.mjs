import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { root } from './beam-cli.mjs';

const website = resolve(root, '../../apps/website-private/public');
mkdirSync(resolve(website, 'media'), { recursive: true });
mkdirSync(resolve(website, 'images/features'), { recursive: true });
for (const theme of ['light', 'dark']) {
  const name = `agent-cli-${theme}`;
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
  resolve(website, 'media/agent-cli.NOTICE.txt'),
  'Beam CLI — illustrated command reference, not a recorded session or tool output.\n' +
    '7 seconds, 1280 × 800, 60 fps, silent; matching light/dark videos and posters.\n' +
    'Rendered using the real Beam CLI motion command. WebM/WebP optimized with external FFmpeg.\n' +
    'Commands verified against apps/cli and docs/agent/README.md. @project.json contains a project ID; @edit.json contains expectedRevision, operationId and engine commands.\n' +
    'Source: Beam repository, examples/website-agent-cli-loop/ (MPL-2.0).\n' +
    'Uses original Beam theme tokens and product mark, Lucide icons and local Hanken Grotesk/Noto Sans Mono (SIL OFL).\n' +
    'Typing frontier adapted from HyperFrames registry code-terminal-run (Apache-2.0). See source assets/NOTICE.md.\n',
);
console.log('Wrote Beam CLI themed loops, posters and notice to the private site.');
