const { join } = require('node:path');

// Packaged Electron always starts its configured main entry. Route only the
// application-owned export host before loading desktop services or windows.
if (process.argv.includes('--beam-gpu-export-host')) {
  if (process.platform !== 'linux') throw new Error('The experimental GPU export host is Linux-only.');
  require(join(process.resourcesPath, 'beam-cli', 'ffmpeg-host.cjs'));
} else {
  require('./main.cjs');
}
