import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { root } from './beam-cli.mjs';

const modes = ['presets', 'export', 'clipboard', 'hero'];
const requested = process.argv[2];
if (requested && !modes.includes(requested)) throw new Error('Choose presets, export, clipboard or hero');
const website = resolve(root, '../../apps/website-private/public');
mkdirSync(resolve(website, 'media'), { recursive: true });
mkdirSync(resolve(website, 'images/features'), { recursive: true });
for (const mode of requested ? [requested] : modes)
  for (const theme of ['light', 'dark']) {
    const name = `instant-${mode}-${theme}`;
    for (const args of [
      ['-i', resolve(root, `renders/${name}.mp4`), '-an', '-c:v', 'libvpx-vp9', '-crf', mode === 'hero' ? '34' : '28', '-b:v', '0', '-row-mt', '1', '-threads', '4', '-deadline', 'good', '-cpu-used', '4', '-pix_fmt', 'yuv420p', '-g', '360', resolve(website, `media/${name}.webm`)],
      ['-i', resolve(root, `renders/${name}.png`), '-c:v', 'libwebp', '-quality', '88', '-compression_level', '6', resolve(website, `images/features/${name}.webp`)],
    ]) {
      const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
      if (result.status !== 0) throw new Error('External FFmpeg website optimization failed');
    }
  }
// Retire only the generated concatenation that this dedicated hero replaces.
if (!requested || requested === 'hero')
  for (const theme of ['light', 'dark']) rmSync(resolve(website, `media/instant-overview-${theme}.webm`), { force: true });
writeFileSync(resolve(website, 'media/instant.NOTICE.txt'),
  'Beam Instant — 24-second continuous hero and three 8-second detail loops; 1280 × 800, 60 fps, silent; light/dark videos and posters.\n' +
  'The hero uses one native surface and a persistent captured canvas from launching Beam and previewing two presets through recording, local export, pasting and gently sending the MP4, followed by three replies in one scrolling thread without playback controls, then minimizes the chat into the illustrative macOS-style dock for a seamless desktop loop. Camera moves are native Beam manual 2D zooms.\n' +
  'Native HUD, CaptureModeGroup, CapturePresetSelect, ScreenshotCanvas, RecorderBar, QuickSnipStatus and Beamy Vue components, native theme tokens and macOS cursor assets.\n' +
  'Fixture host drives the UI; this is an illustrated workflow, not a live recording or measured export speed. Clipboard receiver and messages are an illustrative team chat. No desktop IPC or real project files are accessed.\n' +
  'Source: examples/website-instant-loops/ (MPL-2.0). Real Beam CLI motion renderer; WebCodecs/Mediabunny encoding; external FFmpeg WebM/WebP optimization.\n' +
  'Hanken Grotesk: SIL OFL. Lucide: ISC. See source assets/NOTICE.md.\n');
console.log(`Installed ${requested || 'all'} Instant loops and themed posters.`);
