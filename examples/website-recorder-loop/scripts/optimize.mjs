import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.BEAM_WEBSITE_ROOT) throw new Error('Set BEAM_WEBSITE_ROOT to the private website checkout.');
const website = resolve(process.env.BEAM_WEBSITE_ROOT, 'public');
mkdirSync(resolve(website, 'media'), { recursive: true });
mkdirSync(resolve(website, 'images/features'), { recursive: true });
function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('External FFmpeg optimization failed.');
}
for (const theme of ['light', 'dark']) {
  const name = `recording-sources-${theme}`;
  ffmpeg([
    '-i',
    resolve(root, `renders/${name}.mp4`),
    '-an',
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '32',
    '-b:v',
    '0',
    '-row-mt',
    '1',
    '-threads',
    '8',
    '-deadline',
    'good',
    '-cpu-used',
    '6',
    '-pix_fmt',
    'yuv420p',
    '-g',
    '300',
    resolve(website, `media/${name}.webm`),
  ]);
  ffmpeg([
    '-i',
    resolve(root, `renders/${name}.png`),
    '-c:v',
    'libwebp',
    '-quality',
    '86',
    '-compression_level',
    '6',
    resolve(website, `images/features/${name}.webp`),
  ]);
}
writeFileSync(
  resolve(website, 'media/recording-sources.NOTICE.txt'),
  'Beam — Your screen, your framing.\n12 seconds, 1280 × 800, 60 fps, silent.\n' +
    'Rendered with Beam CLI from examples/website-recorder-loop/ (MPL-2.0).\n' +
    'Actual desktop RecorderBar, HudCaptureCards, CaptureModeGroup, BrandLogo and UI controls.\n' +
    'Sonoma Horizon and Sequoia Blue: existing Beam wallpaper catalogue; applicable rights retained.\n' +
    'Figma-style pointer: unchanged user-owned Beam — Beautiful Captures asset.\n' +
    'Hanken Grotesk: SIL OFL. Beam icon retains existing product rights.\n' +
    'Authored deterministic demonstration; devices are Off and no native capture is started.\n' +
    'Gentle 2D camera push-in, spring clicks and seamless return to the initial frame.\n',
);
console.log('Wrote both Recorder loops, posters and provenance to the private website.');
