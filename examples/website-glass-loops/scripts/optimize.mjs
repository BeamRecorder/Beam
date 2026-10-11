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
const kinds = process.env.BEAM_DEMO_KIND ? [process.env.BEAM_DEMO_KIND] : ['glass', 'automatic'];
if (kinds.some((kind) => !['glass', 'automatic'].includes(kind)))
  throw new Error('Choose glass or automatic.');
for (const kind of kinds) {
  const themes = process.env.BEAM_DEMO_THEME ? [process.env.BEAM_DEMO_THEME] : ['light', 'dark'];
  if (themes.some((theme) => !['light', 'dark'].includes(theme))) throw new Error('Choose light or dark.');
  for (const theme of themes) {
    const input = resolve(root, `renders/zooms-${kind}-${theme}.mp4`);
    const output = resolve(media, `zooms-${kind}-${theme}.webm`);
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
      resolve(images, `zooms-${kind}-${theme}.webp`),
    ]);
    console.log(`${kind}/${theme}: ${statSync(output).size} bytes`);
  }

  writeFileSync(resolve(media, `zooms-${kind}.NOTICE.txt`), `Beam — ${kind}
10 seconds, 1280 × 800, 30 fps, intentionally silent VP9. Light and dark variants.
Native ZoomPanel and GlassHighlightControls; native renderGlassHighlights WebGL shader and timeline painter.
Automatic lenses use buildAutomaticGlassElements on real Quiet Aurora 4 cursor telemetry, mapped to the cropped source.
Illustrated editing gestures; the recording preview uses frozen original frames, not measured editing latency.
Beautiful Captures Figma pointer. Tahoe wallpapers from Beam's background catalog.
Hanken Grotesk: SIL OFL. Example source: examples/website-glass-loops, MPL-2.0.
Rendered by Beam WebCodecs/Mediabunny; external FFmpeg creates website derivatives.
Original recordings and projects remain preserved.
`);
}
