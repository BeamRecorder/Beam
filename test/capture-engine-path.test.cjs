const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
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
} = require('../electron/capture/media-engine-path.cjs');

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
    assert.equal(mediaEngineFilename(version, 'win32', arch), `beam-media-engine-${version}.exe`);
    assert.equal(
      prebuiltMediaEnginePath(root, version, 'win32', arch),
      path.join(root, 'packages', 'native-recorder', 'win', arch, `beam-media-engine-${version}.exe`),
    );
    assert.equal(mediaEngineAssetName(version, 'win32', arch), `beam-media-engine-${version}-windows-${arch}.exe`);
  }
});

test('resolves versioned macOS and Linux paths, including the Linux helper', () => {
  assert.equal(
    nativeRecorderDirectory(root, 'darwin', 'arm64'),
    path.join(root, 'packages', 'native-recorder', 'mac', 'arm64'),
  );
  assert.equal(mediaEngineFilename(version, 'darwin', 'arm64'), `beam-media-engine-${version}`);
  assert.equal(
    prebuiltMediaEnginePath(root, version, 'darwin', 'arm64'),
    path.join(root, 'packages', 'native-recorder', 'mac', 'arm64', `beam-media-engine-${version}`),
  );
  assert.equal(mediaEngineAssetName(version, 'darwin', 'arm64'), `beam-media-engine-${version}-macos-arm64`);

  assert.equal(
    nativeRecorderDirectory(root, 'linux', 'x64'),
    path.join(root, 'packages', 'native-recorder', 'linux', 'x64'),
  );
  assert.equal(mediaEngineFilename(version, 'linux', 'x64'), `beam-media-engine-${version}`);
  assert.equal(inputHelperFilename(version, 'linux', 'x64'), `beam-input-helper-${version}`);
  assert.equal(
    prebuiltInputHelperPath(root, version, 'linux', 'x64'),
    path.join(root, 'packages', 'native-recorder', 'linux', 'x64', `beam-input-helper-${version}`),
  );
  assert.equal(mediaEngineAssetName(version, 'linux', 'x64'), `beam-media-engine-${version}-linux-x64`);
  assert.equal(inputHelperAssetName(version, 'linux', 'x64'), `beam-input-helper-${version}-linux-x64`);
});

test('resolves versioned packaged resources and the native manifest asset', () => {
  const resources = path.join(root, 'resources');
  assert.equal(
    packagedMediaEnginePath(resources, version, 'win32', 'arm64'),
    path.join(resources, 'media-runtime', 'bin', 'beam-media-engine.exe'),
  );
  assert.equal(
    packagedInputHelperPath(resources, version, 'linux', 'x64'),
    path.join(resources, 'input-helper', `beam-input-helper-${version}`),
  );
  assert.equal(nativeManifestAssetName(version), `native-engines-${version}.json`);
});

test('rejects unsupported architectures, platforms, and malformed versions', () => {
  for (const invalidVersion of ['1.2', 'v1.2.3', '1.2.3+build', '', null, 1]) {
    assert.equal(mediaEngineFilename(invalidVersion, 'win32', 'x64'), null);
    assert.equal(nativeManifestAssetName(invalidVersion), null);
  }
  assert.equal(mediaEngineFilename(version, 'linux', 'arm64'), null);
  assert.equal(inputHelperFilename(version, 'linux', 'arm64'), null);
  assert.equal(prebuiltMediaEnginePath(root, version, 'freebsd', 'x64'), null);
  assert.equal(packagedMediaEnginePath(root, version, 'win32', 'ia32'), null);
  assert.equal(mediaEngineAssetName(version, 'freebsd', 'x64'), null);
  assert.equal(inputHelperAssetName(version, 'darwin', 'arm64'), null);
});
