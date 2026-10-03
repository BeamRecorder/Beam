const { accessSync, constants, readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

function verifyFfmpegExport(directory, { run = spawnSync, load = require } = {}) {
  const root = resolve(directory);
  const executable = join(root, 'beam-ffmpeg-export');
  const addon = join(root, 'beam-gpu-transport.node');
  accessSync(executable, constants.X_OK);
  accessSync(addon, constants.R_OK);
  const payload = readdirSync(root).sort();
  if (payload.join(',') !== 'beam-ffmpeg-export,beam-gpu-transport.node')
    throw new Error(
      'The GPU export package must contain only Beam native artifacts, with no bundled FFmpeg libraries.',
    );
  const result = run(executable, [], { encoding: 'utf8', timeout: 5000 });
  if (result.error || result.status !== 1 || !result.stderr?.startsWith('Expected socket, destination,'))
    throw new Error('Packaged GPU export failed its startup check: ' + (result.error?.message ?? result.stderr));
  if (typeof load(addon).transfer !== 'function') throw new Error('Packaged GPU transport has no transfer entrypoint.');
  return { artifacts: payload.length, ffmpeg: 'system' };
}

if (require.main === module) {
  try {
    if (!process.argv[2]) throw new Error('Provide the packaged ffmpeg-export directory.');
    console.log(JSON.stringify(verifyFfmpegExport(process.argv[2])));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { verifyFfmpegExport };
