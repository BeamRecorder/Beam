const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
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
} = require('../electron/capture/capture-engine-path.cjs');

const root = path.join('project', 'beam');
const version = '1.2.3';

test('declares only the supported operating-system and architecture combinations', () => {
  assert.deepEqual(Object.keys(NATIVE_TARGETS).sort(), ['darwin', 'linux', 'win32']);
  assert.equal(nativeTarget('win32', 'x64').assetPlatform, 'windows');
  assert.equal(nativeTarget('win32', 'arm64').assetPlatform, 'windows');
  assert.equal(nativeTarget('darwin', 'arm64').assetPlatform, 'macos');
  assert.equal(nativeTarget('linux', 'x64').assetPlatform, 'linux');
  assert.equal(nativeTarget('linux', 'arm64'), null);
  assert.equal(nativeTarget('win32', 'ia32'), null);
  assert.equal(nativeTarget('freebsd', 'x64'), null);
});

test('resolves versioned Windows x64 and ARM64 cache paths and release assets', () => {
  for (const arch of ['x64', 'arm64']) {
    assert.equal(
      nativeRecorderDirectory(root, 'win32', arch),
      path.join(root, 'packages', 'native-recorder', 'win', arch),
    );
    assert.equal(captureEngineFilename(version, 'win32', arch), `capture-engine-${version}.exe`);
    assert.equal(
      prebuiltCaptureEnginePath(root, version, 'win32', arch),
      path.join(root, 'packages', 'native-recorder', 'win', arch, `capture-engine-${version}.exe`),
    );
    assert.equal(captureEngineAssetName(version, 'win32', arch), `capture-engine-${version}-windows-${arch}.exe`);
  }
});

test('resolves versioned macOS and Linux paths, including the Linux helper', () => {
  assert.equal(
    nativeRecorderDirectory(root, 'darwin', 'arm64'),
    path.join(root, 'packages', 'native-recorder', 'mac', 'arm64'),
  );
  assert.equal(captureEngineFilename(version, 'darwin', 'arm64'), `capture-engine-${version}`);
  assert.equal(
    prebuiltCaptureEnginePath(root, version, 'darwin', 'arm64'),
    path.join(root, 'packages', 'native-recorder', 'mac', 'arm64', `capture-engine-${version}`),
  );
  assert.equal(captureEngineAssetName(version, 'darwin', 'arm64'), `capture-engine-${version}-macos-arm64`);

  assert.equal(
    nativeRecorderDirectory(root, 'linux', 'x64'),
    path.join(root, 'packages', 'native-recorder', 'linux', 'x64'),
  );
  assert.equal(captureEngineFilename(version, 'linux', 'x64'), `capture-engine-${version}`);
  assert.equal(inputHelperFilename(version, 'linux', 'x64'), `beam-input-helper-${version}`);
  assert.equal(
    prebuiltInputHelperPath(root, version, 'linux', 'x64'),
    path.join(root, 'packages', 'native-recorder', 'linux', 'x64', `beam-input-helper-${version}`),
  );
  assert.equal(captureEngineAssetName(version, 'linux', 'x64'), `capture-engine-${version}-linux-x64`);
  assert.equal(inputHelperAssetName(version, 'linux', 'x64'), `beam-input-helper-${version}-linux-x64`);
});

test('resolves versioned packaged resources and the native manifest asset', () => {
  const resources = path.join(root, 'resources');
  assert.equal(
    packagedCaptureEnginePath(resources, version, 'win32', 'arm64'),
    path.join(resources, 'capture-engine', `capture-engine-${version}.exe`),
  );
  assert.equal(
    packagedInputHelperPath(resources, version, 'linux', 'x64'),
    path.join(resources, 'input-helper', `beam-input-helper-${version}`),
  );
  assert.equal(nativeManifestAssetName(version), `native-engines-${version}.json`);
});

test('rejects unsupported architectures, platforms, and malformed versions', () => {
  for (const invalidVersion of ['1.2', 'v1.2.3', '1.2.3+build', '', null, 1]) {
    assert.equal(captureEngineFilename(invalidVersion, 'win32', 'x64'), null);
    assert.equal(nativeManifestAssetName(invalidVersion), null);
  }
  assert.equal(captureEngineFilename(version, 'linux', 'arm64'), null);
  assert.equal(inputHelperFilename(version, 'linux', 'arm64'), null);
  assert.equal(prebuiltCaptureEnginePath(root, version, 'freebsd', 'x64'), null);
  assert.equal(packagedCaptureEnginePath(root, version, 'win32', 'ia32'), null);
  assert.equal(captureEngineAssetName(version, 'freebsd', 'x64'), null);
  assert.equal(inputHelperAssetName(version, 'darwin', 'arm64'), null);
});
