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
