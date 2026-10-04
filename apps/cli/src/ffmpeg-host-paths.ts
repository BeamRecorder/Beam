import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { FfmpegHostPaths } from './export-backend-types';

export function ffmpegHostPaths(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  electron = Boolean(process.versions.electron),
): FfmpegHostPaths {
  if (platform !== 'linux') throw new Error('The experimental FFmpeg VA-API backend is Linux-only.');
  if (!env.DISPLAY)
    throw new Error(
      'The experimental GPU export requires an X11/XWayland DISPLAY. WebCodecs supports display-free export.',
    );
  const require = createRequire(import.meta.url);
  const root = env.BEAM_APPLICATION_ROOT ?? fileURLToPath(new URL('../../../', import.meta.url));
  return {
    executable: env.BEAM_ELECTRON_EXECUTABLE ?? (electron ? process.execPath : (require('electron') as string)),
    host: fileURLToPath(new URL('./ffmpeg-host.cjs', import.meta.url)),
    preload:
      env.BEAM_COMPILED_CLI === 'true' || process.env.BEAM_COMPILED_CLI === 'true'
        ? fileURLToPath(new URL('./gpu-preload.cjs', import.meta.url))
        : require.resolve('@beam/electron-export/preload'),
    nativeDirectory:
      env.BEAM_FFMPEG_EXPORT_DIRECTORY ??
      (env.BEAM_RESOURCES_PATH
        ? join(env.BEAM_RESOURCES_PATH, 'ffmpeg-export')
        : join(root, 'build/native/ffmpeg-export')),
  };
}
