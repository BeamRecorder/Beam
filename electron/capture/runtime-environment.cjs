const path = require('node:path');
const fs = require('node:fs');
function runtimeEnvironment(app, resources, platform = process.platform) {
  if (!app.isPackaged && !process.env.BEAM_MEDIA_RUNTIME) return {};
  const root = app.isPackaged ? path.join(resources, 'media-runtime') : process.env.BEAM_MEDIA_RUNTIME;
  if (!fs.existsSync(path.join(root, 'inventory.json'))) throw new Error('The private media runtime is missing.');
  const scanner = path.join(root, 'libexec', platform === 'win32' ? 'gst-plugin-scanner.exe' : 'gst-plugin-scanner');
  const env = {
    GST_PLUGIN_SYSTEM_PATH: '',
    GST_PLUGIN_SYSTEM_PATH_1_0: '',
    GST_PLUGIN_PATH: path.join(root, 'plugins'),
    GST_PLUGIN_PATH_1_0: path.join(root, 'plugins'),
    GST_PLUGIN_SCANNER: scanner,
    GST_PLUGIN_SCANNER_1_0: scanner,
    GST_REGISTRY_1_0: path.join(app.getPath('userData'), `media-registry-${app.getVersion()}.bin`),
  };
  if (platform === 'linux') env.LD_LIBRARY_PATH = path.join(root, 'lib');
  if (platform === 'win32')
    env.PATH = `${path.join(root, 'bin')};${process.env.SystemRoot}\\System32;${process.env.SystemRoot}`;
  return env;
}
module.exports = { runtimeEnvironment };
