import { homedir } from 'node:os';
import { resolve } from 'node:path';

export function chromiumSettings(env: NodeJS.ProcessEnv = process.env) {
  const gpu = env.BEAM_CHROMIUM_GPU ?? 'software';
  if (gpu !== 'software' && gpu !== 'hardware') throw new Error('BEAM_CHROMIUM_GPU must be software or hardware.');
  return {
    executable: env.BEAM_CHROMIUM_EXECUTABLE,
    cache: resolve(env.BEAM_CHROMIUM_CACHE ?? resolve(homedir(), '.cache/beam/chromium')),
    args: [
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      ...(gpu === 'software'
        ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
        : ['--enable-gpu']),
    ],
  };
}
