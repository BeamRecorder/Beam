const path = require('node:path');

const NATIVE_TARGETS = Object.freeze({
  win32: Object.freeze({ directory: 'win', assetPlatform: 'windows', extension: '.exe', arches: ['x64', 'arm64'] }),
  darwin: Object.freeze({ directory: 'mac', assetPlatform: 'macos', extension: '', arches: ['x64', 'arm64'] }),
  linux: Object.freeze({ directory: 'linux', assetPlatform: 'linux', extension: '', arches: ['x64'] }),
});

function nativeTarget(platform = process.platform, arch = process.arch) {
  const target = NATIVE_TARGETS[platform];
  return target?.arches.includes(arch) ? target : null;
}

function validVersion(version) {
  return typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version);
}

function nativeRecorderDirectory(applicationRoot, platform = process.platform, arch = process.arch) {
  const target = nativeTarget(platform, arch);
  return target ? path.join(applicationRoot, 'packages', 'native-recorder', target.directory, arch) : null;
}

function mediaEngineFilename(version, platform = process.platform, arch = process.arch) {
  const target = nativeTarget(platform, arch);
  return target && validVersion(version) ? `beam-media-engine-${version}${target.extension}` : null;
}

function inputHelperFilename(version, platform = process.platform, arch = process.arch) {
  return platform === 'linux' && nativeTarget(platform, arch) && validVersion(version)
    ? `beam-input-helper-${version}`
    : null;
}

function prebuiltMediaEnginePath(applicationRoot, version, platform = process.platform, arch = process.arch) {
  const directory = nativeRecorderDirectory(applicationRoot, platform, arch);
  const filename = mediaEngineFilename(version, platform, arch);
  return directory && filename ? path.join(directory, filename) : null;
}

function prebuiltInputHelperPath(applicationRoot, version, platform = process.platform, arch = process.arch) {
  const directory = nativeRecorderDirectory(applicationRoot, platform, arch);
  const filename = inputHelperFilename(version, platform, arch);
  return directory && filename ? path.join(directory, filename) : null;
}

function packagedMediaEnginePath(resourcesPath, version, platform = process.platform, arch = process.arch) {
  const filename = mediaEngineFilename(version, platform, arch);
  return filename
    ? path.join(
        resourcesPath,
        'media-runtime',
        'bin',
        platform === 'win32' ? 'beam-media-engine.exe' : 'beam-media-engine',
      )
    : null;
}

function packagedInputHelperPath(resourcesPath, version, platform = process.platform, arch = process.arch) {
  const filename = inputHelperFilename(version, platform, arch);
  return filename ? path.join(resourcesPath, 'input-helper', filename) : null;
}

function mediaEngineAssetName(version, platform = process.platform, arch = process.arch) {
  const target = nativeTarget(platform, arch);
  return target && validVersion(version)
    ? `beam-media-engine-${version}-${target.assetPlatform}-${arch}${target.extension}`
    : null;
}

function inputHelperAssetName(version, platform = process.platform, arch = process.arch) {
  return platform === 'linux' && nativeTarget(platform, arch) && validVersion(version)
    ? `beam-input-helper-${version}-linux-${arch}`
    : null;
}

function mediaRuntimeAssetName(version, platform = process.platform, arch = process.arch) {
  const target = nativeTarget(platform, arch);
  return target && validVersion(version)
    ? `beam-media-runtime-${version}-${target.assetPlatform}-${arch}.tar.gz`
    : null;
}
function prebuiltRuntimePath(root, version, platform = process.platform, arch = process.arch) {
  const directory = nativeRecorderDirectory(root, platform, arch);
  return directory && validVersion(version) ? path.join(directory, `media-runtime-${version}`) : null;
}

function nativeManifestAssetName(version) {
  return validVersion(version) ? `native-engines-${version}.json` : null;
}

module.exports = {
  mediaRuntimeAssetName,
  prebuiltRuntimePath,
  NATIVE_TARGETS,
  mediaEngineAssetName,
  mediaEngineFilename,
  inputHelperAssetName,
  inputHelperFilename,
  nativeManifestAssetName,
  nativeRecorderDirectory,
  nativeTarget,
  packagedMediaEnginePath,
  packagedInputHelperPath,
  prebuiltMediaEnginePath,
  prebuiltInputHelperPath,
};
