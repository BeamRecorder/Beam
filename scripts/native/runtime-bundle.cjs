const path = require('node:path');
const fs = require('node:fs');
const { runCommand } = require('./artifacts.cjs');
async function stageRuntime({ root, platform, arch, binary }) {
  const os = platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : 'linux';
  const output = path.join(root, 'build', 'native', os, arch, 'media-runtime');
  fs.rmSync(output, { recursive: true, force: true });
  const name = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux';
  const args = [
    path.join(root, 'scripts', 'ci', `build_gstreamer_${name}_bundle.py`),
    '--binary',
    binary,
    '--output',
    output,
  ];
  if (platform === 'darwin') {
    const license = process.env.BEAM_GSTREAMER_INSTALLER_LICENSE;
    if (!license)
      throw new Error('BEAM_GSTREAMER_INSTALLER_LICENSE must identify the installed GStreamer license notice.');
    args.push('--installer-license', license);
  }
  if (platform === 'win32') {
    const runtime = process.env.BEAM_GSTREAMER_ROOT || process.env.GSTREAMER_1_0_ROOT_MSVC_X86_64;
    if (!runtime) throw new Error('BEAM_GSTREAMER_ROOT must identify the native GStreamer runtime.');
    args.push('--runtime-root', runtime);
  }
  await runCommand(platform === 'win32' ? 'python' : 'python3', args, { cwd: root });
  return output;
}
module.exports = { stageRuntime };
