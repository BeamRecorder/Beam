const { access, copyFile, mkdir, rm } = require('node:fs/promises');
const { constants } = require('node:fs');
const { join } = require('node:path');
const { inspectFfmpegLibraries } = require('./ffmpeg-export-license.cjs');

async function installExperimentalFfmpeg(root, resources, platform, { inspect = inspectFfmpegLibraries } = {}) {
  if (platform !== 'linux') return;
  const files = ['beam-ffmpeg-export', 'beam-gpu-transport.node'];
  const source = join(root, 'build/native/ffmpeg-export');
  await Promise.all(
    files.map((file) => access(join(source, file), file.endsWith('.node') ? constants.R_OK : constants.X_OK)),
  );
  inspect(join(source, 'beam-ffmpeg-export'));
  const destination = join(resources, 'ffmpeg-export');
  // Replace this owned staging directory so an older build cannot leave bundled codecs behind.
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await Promise.all(files.map((file) => copyFile(join(source, file), join(destination, file))));
}
module.exports = { installExperimentalFfmpeg };
