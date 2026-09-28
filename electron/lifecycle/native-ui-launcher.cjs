const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { runtimeEnvironment } = require('../capture/runtime-environment.cjs');
const { InputAccess } = require('../input/input-access.cjs');

function nativeUiDirectory(app, applicationRoot, resources = process.resourcesPath,
  platform = process.platform, arch = process.arch) {
  if (app.isPackaged) return path.join(resources, 'native-ui');
  const os = { linux: 'linux', darwin: 'mac', win32: 'win' }[platform];
  return os ? path.join(applicationRoot, 'build', 'native', os, arch, 'native-ui') : null;
}

/** Starts the staged native launcher and passes Electron's editor path to it. */
async function launchNativeUi({ app, applicationRoot, resources = process.resourcesPath,
  platform = process.platform, arch = process.arch, spawnImpl = spawn }) {
  const directory = nativeUiDirectory(app, applicationRoot, resources, platform, arch);
  if (!directory) throw new Error(`Native UI is unavailable for ${platform}/${arch}`);
  const executable = path.join(directory, platform === 'win32' ? 'beam-native.exe' : 'beam-native');
  const bundle = path.join(directory, 'ui', 'app.mjs');
  const assets = path.join(directory, 'ui', 'assets.generated.json');
  if (![executable, bundle, assets].every(fs.existsSync))
    throw new Error(`Native UI bundle is incomplete in ${directory}`);
  const env = {
    ...process.env,
    ...runtimeEnvironment(app, resources, platform),
    ARGUI_APP_BUNDLE: bundle,
    ARGUI_APP_ASSETS: assets,
    BEAM_ELECTRON_BINARY: process.execPath,
    BEAM_USER_DIR: path.join(app.getPath('videos'), 'Beam', 'user'),
    ...(app.isPackaged ? {} : { BEAM_ELECTRON_APP: applicationRoot }),
  };
  const helper = new InputAccess({ app, applicationRoot, nativeRequest: () => null, platform }).helperForCapture();
  if (helper) env.BEAM_INPUT_HELPER_PATH = helper;
  await new Promise((resolve, reject) => {
    const child = spawnImpl(executable, [], { env, detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
  return true;
}

module.exports = { nativeUiDirectory, launchNativeUi };
