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
const kinds = process.env.BEAM_DEMO_KIND ? [process.env.BEAM_DEMO_KIND] : ['teleprompter', 'projects'];
if (kinds.some((kind) => !['teleprompter', 'projects'].includes(kind)))
  throw new Error('Choose teleprompter or projects.');
for (const kind of kinds) {
  const themes = process.env.BEAM_DEMO_THEME ? [process.env.BEAM_DEMO_THEME] : ['light', 'dark'];
  if (themes.some((theme) => !['light', 'dark'].includes(theme))) throw new Error('Choose light or dark.');
  for (const theme of themes) {
    const input = resolve(root, `renders/recording-${kind}-${theme}.mp4`);
    const output = resolve(media, `recording-${kind}-${theme}.webm`);
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
      resolve(images, `recording-${kind}-${theme}.webp`),
    ]);
    console.log(`${kind}/${theme}: ${statSync(output).size} bytes`);
  }

  writeFileSync(
    resolve(media, `recording-${kind}.NOTICE.txt`),
    `Beam — ${kind}\n8 seconds, 1280 x 800, 30 fps, silent VP9. Light and dark.\nAuthored demonstration rendered in Beam from HTML and actual native Vue components.\nBeautiful Captures Figma pointer. Sonoma Horizon from Beam background catalog.\nHanken Grotesk, SIL OFL 1.1. Components and source: MPL-2.0.\nSource: examples/website-recording-final-loops/.\n${kind === 'teleprompter' ? 'Teleprompter: continuous reading, text size from 26 to 34 px, native color picker and readable coral text.\n' : 'Projects: frozen real local catalog; illustrative HTML file browser, not an OS capture.\n'}No project or original recording is modified by this demonstration.\n`,
  );
}
