import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './beam-cli.mjs';
if (!process.env.BEAM_WEBSITE_ROOT) throw new Error('Set BEAM_WEBSITE_ROOT to the private website checkout.');
const website = resolve(process.env.BEAM_WEBSITE_ROOT, 'public');
mkdirSync(resolve(website, 'media'), { recursive: true });
mkdirSync(resolve(website, 'images/features'), { recursive: true });
function ffmpeg(args) {
  return new Promise((ok, fail) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
    child.on('error', fail);
    child.on('exit', (code) => (code === 0 ? ok() : fail(new Error('External FFmpeg derivative encoding failed.'))));
  });
}
await Promise.all(
  ['2d', '3d'].flatMap((mode) =>
    ['light', 'dark'].map(async (theme) => {
      const name = `zooms-${mode}-${theme}`;
      await ffmpeg([
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
        '2',
        '-deadline',
        'good',
        '-cpu-used',
        '4',
        '-pix_fmt',
        'yuv420p',
        '-g',
        '240',
        resolve(website, `media/${name}.webm`),
      ]);
      await ffmpeg([
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
    }),
  ),
);
writeFileSync(
  resolve(website, 'media/zooms-camera.NOTICE.txt'),
  `Beam — 2D attention and 3D perspective\n8 seconds, 1280 × 800, 60 fps, intentionally silent. Light and dark variants.\n` +
    `Authored HTML/Vue/GSAP illustration with native ZoomTiltControls, ZoomFocusControls, Accordion, BigSlider, buttons and timeline painter.\n` +
    `Camera movement uses createCompositionCameraEvaluator and the native renderPerspectiveLayers GPU compositor. No CSS imitation of 3D rendering.\n` +
    `Unchanged macOS cursor artwork, native cursor spring/ripples, Beautiful Captures artwork and Tahoe wallpapers retain their applicable rights.\n` +
    `Source: Beam examples/website-zoom-loops, MPL-2.0. Hanken Grotesk: SIL OFL.\n` +
    `Illustrated editing interactions, not a live recording or measured editing latency. Rendered with Beam WebCodecs/Mediabunny.\n` +
    `External FFmpeg only creates derivatives; no binaries or libraries are bundled.\n`,
);
console.log('Published four themed zoom loops and matching posters.');
