import { homedir } from 'node:os';
import { win32, posix } from 'node:path';

/** Explicit platform input also makes installation paths testable from any host OS. */
export function applicationPaths(platform = process.platform, env: NodeJS.ProcessEnv = process.env, home = homedir()) {
  const { join } = platform === 'win32' ? win32 : posix;
  if (platform === 'win32')
    return {
      cache: join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Beam', 'Cache'),
      data: join(env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Beam'),
    };
  if (platform === 'darwin')
    return {
      cache: join(home, 'Library', 'Caches', 'Beam'),
      data: join(home, 'Library', 'Application Support', 'Beam'),
    };
  if (platform === 'linux')
    return {
      cache: join(env.XDG_CACHE_HOME ?? join(home, '.cache'), 'beam'),
      data: join(env.XDG_DATA_HOME ?? join(home, '.local', 'share'), 'beam'),
    };
  throw new Error(`Unsupported platform: ${platform}`);
}
