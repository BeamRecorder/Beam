const { access, copyFile, mkdir } = require('node:fs/promises');
const { constants } = require('node:fs');
const { join } = require('node:path');

async function installExperimentalFfmpeg(root, resources, platform) {
  if (platform !== 'linux') return;
  const files = ['beam-ffmpeg-export', 'beam-gpu-transport.node'];
  const source = join(root, 'build/native/ffmpeg-export');
  try {
    await Promise.all(
      files.map((file) => access(join(source, file), file.endsWith('.node') ? constants.R_OK : constants.X_OK)),
    );
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  const destination = join(resources, 'ffmpeg-export');
  await mkdir(destination, { recursive: true });
  await Promise.all(files.map((file) => copyFile(join(source, file), join(destination, file))));
}
module.exports = { installExperimentalFfmpeg };
