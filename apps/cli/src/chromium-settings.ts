import { resolve } from 'node:path';
import { applicationPaths } from '@beam/storage/node/platform-paths';

export function chromiumSettings(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform) {
  const gpu = env.BEAM_CHROMIUM_GPU ?? 'software';
  if (gpu !== 'software' && gpu !== 'hardware') throw new Error('BEAM_CHROMIUM_GPU must be software or hardware.');
  return {
    executable: env.BEAM_CHROMIUM_EXECUTABLE,
    cache: resolve(env.BEAM_CHROMIUM_CACHE ?? resolve(applicationPaths(platform, env).cache, 'chromium')),
    args: [
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      ...(gpu === 'software'
        ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
        : ['--enable-gpu', ...(platform === 'linux' ? ['--enable-features=AcceleratedVideoEncoder'] : [])]),
    ],
  };
}
