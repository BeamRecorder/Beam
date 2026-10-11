import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './beam-cli.mjs';
const results = [];
for (const theme of ['dark', 'light']) {
  const movie = resolve(root, `renders/instant-hero-${theme}.mp4`);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', movie], { encoding: 'utf8' });
  if (probe.status !== 0) throw new Error(probe.stderr);
  const metadata = JSON.parse(probe.stdout), video = metadata.streams[0];
  if (metadata.streams.length !== 1 || video.codec_type !== 'video' || video.width !== 1280 || video.height !== 800 || video.r_frame_rate !== '60/1' || Number(video.nb_frames) !== 1440 || Number(metadata.format.duration) !== 24)
    throw new Error(`Incorrect hero metadata: ${theme}`);
  const comparison = spawnSync('ffmpeg', ['-hide_banner', '-i', movie, '-filter_complex', '[0:v]split[a][b];[a]select=eq(n\\,0),setpts=PTS-STARTPTS[first];[b]select=eq(n\\,1439),setpts=PTS-STARTPTS[last];[first][last]ssim', '-f', 'null', '-'], { encoding: 'utf8' });
  if (comparison.status !== 0) throw new Error(comparison.stderr);
  const seam = Number(comparison.stderr.match(/All:([\d.]+)/)?.[1]);
  // Lossy encoding and the subpixel pointer arrival can alter a few edges.
  // A changed camera pose or an unfinished scene return falls well below this.
  if (!Number.isFinite(seam) || seam < 0.985) throw new Error(`Visible loop discontinuity: ${theme}, SSIM ${seam}`);
  results.push({ theme, frames: 1440, duration: 24, fps: 60, width: 1280, height: 800, audio: false, seamSsim: seam });
}
mkdirSync(resolve(root, '.beam/render-proof'), { recursive: true });
writeFileSync(resolve(root, '.beam/render-proof/report.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
