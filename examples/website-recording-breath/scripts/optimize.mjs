import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2]) throw new Error('Provide the website-private repository directory.');
const website = resolve(process.argv[2]);
const media = resolve(website, 'public/media');
const images = resolve(website, 'public/images/features');
mkdirSync(media, { recursive: true });
mkdirSync(images, { recursive: true });
function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('External FFmpeg optimization failed.');
}
const themes = process.env.BEAM_DEMO_THEME ? [process.env.BEAM_DEMO_THEME] : ['light', 'dark'];
if (themes.some((theme) => !['light', 'dark'].includes(theme))) throw new Error('Choose light or dark.');
for (const theme of themes) {
  const input = resolve(root, `renders/recording-breath-${theme}.mp4`);
  const output = resolve(media, `recording-controls-${theme}.webm`);
  ffmpeg([
    '-i',
    input,
    '-an',
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '35',
    '-b:v',
    '0',
    '-row-mt',
    '1',
    '-threads',
    '8',
    '-cpu-used',
    '6',
    output,
  ]);
  ffmpeg([
    '-i',
    output,
    '-frames:v',
    '1',
    '-c:v',
    'libwebp',
    '-quality',
    '86',
    resolve(images, `recording-controls-${theme}.webp`),
  ]);
  console.log(`${theme}: ${statSync(output).size} bytes`);
}
if (process.argv[3]) {
  const output = resolve(media, 'recording-camera-audio.webm');
  ffmpeg([
    '-i',
    resolve(process.argv[3]),
    '-map',
    '0:v:0',
    '-an',
    '-vf',
    'scale=1024:576',
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '38',
    '-b:v',
    '0',
    '-row-mt',
    '1',
    '-threads',
    '8',
    '-cpu-used',
    '6',
    output,
  ]);
  ffmpeg([
    '-ss',
    '1',
    '-i',
    output,
    '-frames:v',
    '1',
    '-c:v',
    'libwebp',
    '-quality',
    '86',
    resolve(images, 'recording-camera-audio.webp'),
  ]);
}
writeFileSync(
  resolve(media, 'recording-controls.NOTICE.txt'),
  `Beam — Take a breath\n
10 seconds, 1280 x 800, 30 fps, silent VP9. Light/dark native controls.
Authored demonstration, not a recording of native capture activity.
Actual apps/desktop/src/components/hud/recorder/RecorderBar.vue, MPL-2.0.
Beautiful Captures pointer; repository Sonoma Horizon wallpaper.
Footage: user-supplied gemini-generated-taking-breath.mp4 (AI generated).
The facecam preview continues while the recording timer is paused.
Hanken Grotesk, SIL OFL 1.1. Editable source: examples/website-recording-breath/.
`,
);
writeFileSync(
  resolve(media, 'recording-camera-audio.NOTICE.txt'),
  `Beam — Voice and webcam\n
User-supplied export-6s-woman-talking-facecam.webm. Existing montage preserved.
6.166 seconds, optimized to 1024 x 576, 30 fps, silent VP9.
Compression: external FFmpeg, CRF 38, no additional overlays or cuts.
Preparation: examples/website-recording-breath/scripts/optimize.mjs.
`,
);
