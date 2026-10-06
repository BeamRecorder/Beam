import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2]) throw new Error('Provide the website-private directory.');
const website = resolve(process.argv[2]), media = resolve(website, 'public/media'), images = resolve(website, 'public/images/features');
mkdirSync(media, { recursive: true }); mkdirSync(images, { recursive: true });
function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('External FFmpeg optimization failed.');
}
for (const theme of ['light', 'dark']) {
  const name = `zooms-still-${theme}`, output = resolve(media, `${name}.webm`);
  ffmpeg(['-i', resolve(root, `renders/${name}.mp4`), '-an', '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0',
    '-row-mt', '1', '-threads', '8', '-cpu-used', '6', output]);
  ffmpeg(['-i', output, '-ss', '6.9', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '86', resolve(images, `${name}.webp`)]);
  console.log(`${name}: ${statSync(output).size} bytes`);
}
writeFileSync(resolve(media, 'zooms-still.NOTICE.txt'), `Beam — The same detail in a still
9 seconds, 1280 × 800, 60 fps, intentionally silent VP9. Light and dark variants.
ScreenshotToolbar, EditorTitlebar, ZoomPanel in still mode and StillZoomSelection are native Beam components.
Manual 2D / 3D / glass layers use drawScreenshotZoom, manualCameraZoom and the native renderGlassHighlights shader.
One static screenshot; no video timeline, automatic tracking or source recording.
Illustrated editing gestures, not measured interaction latency. The original Beautiful Captures artwork is preserved; the original image is supplied at lens density.
Tahoe wallpapers from Beam's background catalog, with proportional cover sizing. Original Figma editing pointer.
Hanken Grotesk: SIL OFL. Editable source: examples/website-still-zoom-loop, MPL-2.0.
Rendered by Beam WebCodecs/Mediabunny. External FFmpeg creates website derivatives.
`);
