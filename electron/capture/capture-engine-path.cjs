const path = require('node:path');

const NATIVE_TARGETS = Object.freeze({
  win32: Object.freeze({ directory: 'win', assetPlatform: 'windows', extension: '.exe', arches: ['x64', 'arm64'] }),
  darwin: Object.freeze({ directory: 'mac', assetPlatform: 'macos', extension: '', arches: ['arm64'] }),
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

function captureEngineFilename(version, platform = process.platform, arch = process.arch) {
  const target = nativeTarget(platform, arch);
  return target && validVersion(version) ? `capture-engine-${version}${target.extension}` : null;
}

function inputHelperFilename(version, platform = process.platform, arch = process.arch) {
  return platform === 'linux' && nativeTarget(platform, arch) && validVersion(version)
    ? `beam-input-helper-${version}`
    : null;
}

function prebuiltCaptureEnginePath(applicationRoot, version, platform = process.platform, arch = process.arch) {
  const directory = nativeRecorderDirectory(applicationRoot, platform, arch);
  const filename = captureEngineFilename(version, platform, arch);
  return directory && filename ? path.join(directory, filename) : null;
}

function prebuiltInputHelperPath(applicationRoot, version, platform = process.platform, arch = process.arch) {
  const directory = nativeRecorderDirectory(applicationRoot, platform, arch);
  const filename = inputHelperFilename(version, platform, arch);
  return directory && filename ? path.join(directory, filename) : null;
}

function packagedCaptureEnginePath(resourcesPath, version, platform = process.platform, arch = process.arch) {
  const filename = captureEngineFilename(version, platform, arch);
  return filename ? path.join(resourcesPath, 'capture-engine', filename) : null;
}

function packagedInputHelperPath(resourcesPath, version, platform = process.platform, arch = process.arch) {
  const filename = inputHelperFilename(version, platform, arch);
  return filename ? path.join(resourcesPath, 'input-helper', filename) : null;
}

function captureEngineAssetName(version, platform = process.platform, arch = process.arch) {
  const target = nativeTarget(platform, arch);
  return target && validVersion(version)
    ? `capture-engine-${version}-${target.assetPlatform}-${arch}${target.extension}`
    : null;
}

function inputHelperAssetName(version, platform = process.platform, arch = process.arch) {
  return platform === 'linux' && nativeTarget(platform, arch) && validVersion(version)
    ? `beam-input-helper-${version}-linux-${arch}`
    : null;
}

function nativeManifestAssetName(version) {
  return validVersion(version) ? `native-engines-${version}.json` : null;
}

module.exports = {
  NATIVE_TARGETS,
  captureEngineAssetName,
  captureEngineFilename,
  inputHelperAssetName,
  inputHelperFilename,
  nativeManifestAssetName,
  nativeRecorderDirectory,
  nativeTarget,
  packagedCaptureEnginePath,
  packagedInputHelperPath,
  prebuiltCaptureEnginePath,
  prebuiltInputHelperPath,
};
