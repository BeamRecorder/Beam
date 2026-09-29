const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

test('native development launcher selects the staged executable and matching UI files', async () => {
  const { nativePaths } = await import('../scripts/native-ui/dev.mjs');
  assert.deepEqual(nativePaths('/repo', 'linux', 'x64'), {
    executable: path.join('/repo', 'build/native/linux/x64/native-ui/beam-native'),
    bundle: path.join('/repo', 'build/native/linux/x64/native-ui/ui/app.mjs'),
    assets: path.join('/repo', 'build/native/linux/x64/native-ui/ui/assets.generated.json'),
  });
  assert.equal(nativePaths('/repo', 'win32', 'arm64').executable,
    path.join('/repo', 'build/native/win/arm64/native-ui/beam-native.exe'));
});

test('native launch does not inherit legacy editor executables', async () => {
  const { nativePaths, nativeEnvironment } = await import('../scripts/native-ui/dev.mjs');
  const paths = nativePaths('/repo', 'win32', 'x64');
  const inherited = { PATH: 'native-tools', BEAM_ELECTRON_BINARY: '/legacy/host', BEAM_ELECTRON_APP: '/legacy/app' };
  const env = nativeEnvironment(paths, inherited);
  assert.equal(env.ARGUI_APP_BUNDLE, paths.bundle);
  assert.equal(env.ARGUI_APP_ASSETS, paths.assets);
  assert.equal(env.PATH, inherited.PATH);
  assert.equal('BEAM_ELECTRON_BINARY' in env, false);
  assert.equal('BEAM_ELECTRON_APP' in env, false);
  assert.equal(inherited.BEAM_ELECTRON_APP, '/legacy/app');
});
